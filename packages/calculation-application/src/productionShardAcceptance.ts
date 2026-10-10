import { inspectProductionAuditValue } from './productionAuditValue';
import { firstCanonicalAuditDifference } from '@fgo-lab/master-data/production-audit';
import { preNoblePhantasmCommandSchema } from '@fgo-lab/schema';
import type { ProductionClosureAudit } from './productionClosureAudit';
import {
  inspectProductionShardAuditShapes,
  inspectProductionAuditAggregate,
  recordValue,
  type ProductionRecordComparison,
  type ProductionRecordFailure,
  type ProductionRecordFailureReason,
} from './productionClosureRecordIntegrity';
import {
  evaluateProductionFinalOutcomeGate,
  evaluateProductionPreparationTransactionGate,
  type ProductionFinalOutcomeGate,
  type ProductionFinalOutcomeFailure,
  type ProductionFinalProfileOutcome,
  type ProductionPreparationTransactionGate,
  type ProductionPreparationTransactionFailureReason,
  type ProductionPreparationTransactionObservation,
  type ProductionPreparationTransactionSummary,
  type ProductionPreparationTransactionFailure,
} from './productionParityDiagnostics';

type Rule =
  | 'string'
  | 'text'
  | 'count'
  | 'positive'
  | 'number'
  | 'sha256'
  | 'gitSha'
  | 'canonical'
  | 'command'
  | { fields: Readonly<Record<string, Rule>>; optional?: Readonly<Record<string, Rule>> }
  | { items: Rule }
  | { choices: readonly (string | boolean | null)[] }
  | { nullable: Rule };
const fixed = (
  fields: Readonly<Record<string, Rule>>,
  optional?: Readonly<Record<string, Rule>>,
): Rule => (optional ? { fields, optional } : { fields });
const array = (items: Rule): Rule => ({ items });
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const counts = (...keys: string[]) =>
  Object.fromEntries(keys.map((key) => [key, 'count' as const]));
const differenceRule = fixed(
  { identity: 'string', path: 'text' },
  { expected: 'canonical', actual: 'canonical' },
);
const statusCounts = counts('unsupported', 'invalid', 'inputRequired');
const transactionCounts = counts(
  'calculatedProfiles',
  'commandActionMismatches',
  'receiptMismatches',
  'resourceCommitMismatches',
  'resourceSequenceMismatches',
);
const summaryRule = fixed(
  counts('calculatedProfiles', 'commandCount', 'actionCount', 'npUseReceiptCount'),
);
const preparationReasons = {
  preparationCommandActionMismatch: true,
  preparationReceiptMismatch: true,
  preparationResourceCommitMismatch: true,
  preparationResourceSequenceMismatch: true,
  preparationProfileCoverageMismatch: true,
  preparationShardRatchetMissing: true,
  preparationAuditIdentityMismatch: true,
  auditValueInvalid: true,
} satisfies Record<ProductionPreparationTransactionFailureReason, true>;
const preparationFailureRule = fixed(
  {
    reason: { choices: Object.keys(preparationReasons) },
    canonicalIdentity: 'string',
    expected: 'canonical',
    actual: 'canonical',
    firstDifference: differenceRule,
  },
  { conditionKey: 'string', profileKey: 'string', actionIndex: 'count' },
);
const finalStatusFailureRule = fixed({
  reason: { choices: ['finalProfileStatusPresent'] },
  canonicalIdentity: 'string',
  conditionKey: 'string',
  profileKey: 'string',
  status: { choices: ['unsupported', 'invalid', 'inputRequired'] },
  expected: { choices: ['calculated'] },
  actual: { choices: ['unsupported', 'invalid', 'inputRequired'] },
  firstDifference: differenceRule,
});
const finalIdentityFailureRule = fixed({
  reason: { choices: ['finalProfileOutcomeIdentityMismatch'] },
  canonicalIdentity: { choices: ['production-regression:final-profile-outcomes'] },
  firstDifference: differenceRule,
});
const finalFailureRules = {
  finalProfileStatusPresent: finalStatusFailureRule,
  finalProfileOutcomeIdentityMismatch: finalIdentityFailureRule,
} satisfies Record<ProductionFinalOutcomeFailure['reason'], Rule>;
const receiptRule = fixed({
  path: 'string',
  format: { choices: ['json'] },
  allowEmpty: { choices: [false] },
  bytes: 'positive',
  sha256: 'sha256',
});
const declarationRule = fixed({
  conditionKey: 'string',
  path: 'string',
  bytes: 'positive',
  sha256: 'sha256',
});
const sourceIdentityRule = fixed({
  head: 'gitSha',
  worktree: 'text',
  masterDataVersion: 'string',
  masterSha256: 'sha256',
  command: 'string',
  matrix: 'string',
});
const manifestRule = fixed(
  {
    identity: sourceIdentityRule,
    audit: 'canonical',
    productionArtifacts: fixed({ conditionRecords: array(declarationRule) }),
    artifactVerification: fixed({
      verified: array(receiptRule),
      errors: array('string'),
      firstDifference: { nullable: differenceRule },
    }),
    executionRatchets: fixed({
      finalProfileOutcomes: 'canonical',
      preparationTransactions: 'canonical',
    }),
  },
  {
    output: 'string',
    status: { choices: ['failed'] },
    stage: {
      choices: ['read-master', 'audit-conditions', 'build-parity-gate', 'production-parity-gate'],
    },
    failure: fixed({ name: 'string', reason: 'string' }),
    auditValueFailure: fixed({
      reason: { choices: ['auditValueInvalid'] },
      canonicalIdentity: 'string',
      status: { choices: ['failed'] },
      issues: array(fixed({ path: 'text', kind: 'string', representation: 'text' })),
      diagnostic: 'canonical',
    }),
  },
);
const conditionSummaryRule = fixed({
  key: 'string',
  conditions: 'canonical',
  elapsedMs: 'number',
  ...counts(
    'calculated',
    'unavailableUnderPolicy',
    'inputRequired',
    'invalid',
    'unsupported',
    'parityCount',
  ),
  parityFailures: array('canonical'),
  damageCache: fixed({
    ...counts('requestCount', 'distinctDamageInputCount', 'cacheHitCount'),
    cacheHitRate: 'number',
  }),
  candidateInventory: fixed(
    counts(
      'semanticUpperBound',
      'generatedCount',
      'deduplicatedCount',
      'damageRequestUpperBound',
      'damageRequestCount',
      'distinctDamageInputCount',
    ),
  ),
  digest: 'sha256',
});

/** Explicit formats: baseline forbids elapsedMs; run requires it. No fallback. */
export function inspectProductionConditionSummaries(
  value: unknown,
  format: 'run' | 'baseline',
): ProductionRecordComparison {
  const failures: ProductionRecordFailure[] = [];
  if (typeof conditionSummaryRule !== 'object' || !('fields' in conditionSummaryRule))
    throw new Error('condition_summary_rule_invalid');
  const baselineFields = Object.fromEntries(
    Object.entries(conditionSummaryRule.fields).filter(([key]) => key !== 'elapsedMs'),
  );
  inspect(
    value,
    array(format === 'run' ? conditionSummaryRule : fixed(baselineFields)),
    'audit.conditionSummaries',
    0,
    failures,
  );
  return comparison(failures);
}

export interface ProductionSerializedShard {
  identity: Record<string, string>;
  audit: ProductionClosureAudit;
  productionArtifacts: {
    conditionRecords: { conditionKey: string; path: string; bytes: number; sha256: string }[];
  };
  artifactVerification: {
    verified: { path: string; format: 'json'; allowEmpty: false; bytes: number; sha256: string }[];
    errors: string[];
    firstDifference: unknown;
  };
  executionRatchets: {
    finalProfileOutcomes: ProductionFinalOutcomeGate;
    preparationTransactions: ProductionPreparationTransactionGate;
  };
  status?: 'failed';
}

export function shardInputFailure(
  reason: ProductionRecordFailureReason,
  index: number,
  path: string,
  expected: unknown,
  actual: unknown,
): ProductionRecordFailure {
  const canonicalIdentity = `production-audit:shard:${index}`;
  const expectedValue = expected === undefined ? { present: false } : recordValue(expected);
  const actualValue = actual === undefined ? { present: false } : recordValue(actual);
  return {
    reason,
    canonicalIdentity,
    expected: expectedValue,
    actual: actualValue,
    firstDifference: {
      identity: canonicalIdentity,
      path,
      expected: expectedValue,
      actual: actualValue,
    },
  };
}

function inspect(
  value: unknown,
  rule: Rule,
  path: string,
  index: number,
  failures: ProductionRecordFailure[],
): void {
  const invalid = (expected: unknown, actual = value) =>
    failures.push(shardInputFailure('shardManifestShapeInvalid', index, path, expected, actual));
  if (typeof rule === 'object') {
    if ('nullable' in rule) {
      if (value !== null) inspect(value, rule.nullable, path, index, failures);
      return;
    }
    if ('choices' in rule) {
      if (!rule.choices.some((choice) => choice === value)) invalid({ choices: rule.choices });
      return;
    }
    if ('items' in rule) {
      if (!Array.isArray(value)) {
        invalid({ type: 'array' });
        return;
      }
      value.forEach((item, n) => inspect(item, rule.items, `${path}[${n}]`, index, failures));
      return;
    }
    if (!isObject(value)) {
      invalid({ type: 'object' });
      return;
    }
    for (const key of Object.keys(value).sort())
      if (!Object.hasOwn(rule.fields, key) && !Object.hasOwn(rule.optional ?? {}, key))
        failures.push(
          shardInputFailure(
            'shardManifestUnknownField',
            index,
            path ? `${path}.${key}` : key,
            undefined,
            value[key],
          ),
        );
    for (const [key, child] of Object.entries(rule.fields))
      inspect(value[key], child, path ? `${path}.${key}` : key, index, failures);
    for (const [key, child] of Object.entries(rule.optional ?? {}))
      if (Object.hasOwn(value, key))
        inspect(value[key], child, path ? `${path}.${key}` : key, index, failures);
    return;
  }
  const valid =
    rule === 'canonical'
      ? isCanonical(value)
      : rule === 'command'
        ? preNoblePhantasmCommandSchema.safeParse(value).success
        : rule === 'string'
          ? typeof value === 'string' && value.length > 0
          : rule === 'text'
            ? typeof value === 'string'
            : rule === 'gitSha'
              ? typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
              : rule === 'sha256'
                ? typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
                : rule === 'number'
                  ? typeof value === 'number' && Number.isFinite(value) && value >= 0
                  : typeof value === 'number' &&
                    Number.isSafeInteger(value) &&
                    value >= (rule === 'positive' ? 1 : 0);
  if (!valid) invalid({ type: rule });
}
function isCanonical(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isCanonical);
  return isObject(value) && Object.values(value).every(isCanonical);
}
function comparison(failures: ProductionRecordFailure[]): ProductionRecordComparison {
  return {
    status: failures.length ? 'failed' : 'passed',
    failures,
    firstDifference: failures[0]?.firstDifference ?? null,
  };
}
function compareAt(
  index: number,
  path: string,
  expected: unknown,
  actual: unknown,
  failures: ProductionRecordFailure[],
  reason: ProductionRecordFailureReason = 'shardGateContractMismatch',
): void {
  const identity = `production-audit:shard:${index}`;
  const difference = firstCanonicalAuditDifference(
    [{ identity, value: recordValue(expected) }],
    [{ identity, value: recordValue(actual) }],
  );
  if (difference) {
    const failure = shardInputFailure(reason, index, path, expected, actual);
    failure.firstDifference = {
      ...difference,
      path: difference.path
        ? `${path}${difference.path.startsWith('[') ? '' : '.'}${difference.path}`
        : path,
    };
    failures.push(failure);
  }
}

/** Raw JSON acceptance. No consumer may project fields before this succeeds. */
export function acceptProductionShardManifests(
  values: readonly unknown[],
  conditionKeysByShard: readonly (readonly string[])[],
): {
  comparison: ProductionRecordComparison;
  shards: ProductionSerializedShard[] | null;
} {
  const failures: ProductionRecordFailure[] = [];
  if (values.length !== conditionKeysByShard.length)
    return {
      comparison: comparison([
        shardInputFailure(
          'shardManifestShapeInvalid',
          0,
          'conditionKeysByShard',
          { length: values.length },
          { length: conditionKeysByShard.length },
        ),
      ]),
      shards: null,
    };
  for (const [index, value] of values.entries()) {
    const domain = inspectProductionAuditValue(value);
    if (domain.status === 'failed') {
      for (const issue of domain.issues)
        failures.push(
          shardInputFailure(
            'recordValueInvalid',
            index,
            issue.path,
            { auditValue: 'accepted' },
            { issue },
          ),
        );
      continue;
    }
    inspect(value, manifestRule, '', index, failures);
    if (isObject(value) && Object.hasOwn(value, 'auditValueFailure'))
      failures.unshift(
        shardInputFailure(
          'recordValueInvalid',
          index,
          'auditValueFailure',
          { auditValue: 'accepted' },
          value['auditValueFailure'],
        ),
      );
    if (!isObject(value)) continue;
    const audit = value['audit'];
    const auditShape = inspectProductionShardAuditShapes([audit]);
    for (const failure of auditShape.failures)
      failures.push({
        ...failure,
        canonicalIdentity: `production-audit:shard:${index}`,
        firstDifference: {
          ...failure.firstDifference,
          identity: `production-audit:shard:${index}`,
        },
      });
    if (isObject(audit) && Array.isArray(audit['conditionSummaries']))
      inspect(
        audit['conditionSummaries'],
        array(conditionSummaryRule),
        'audit.conditionSummaries',
        index,
        failures,
      );
    const ratchets = value['executionRatchets'];
    if (isObject(ratchets)) {
      inspectGate(ratchets['finalProfileOutcomes'], 'finalProfileOutcomes', index, failures);
      inspectGate(ratchets['preparationTransactions'], 'preparationTransactions', index, failures);
    }
  }
  if (failures.length) return { comparison: comparison(failures), shards: null };
  const shards = values as ProductionSerializedShard[];
  for (const [index, shard] of shards.entries()) {
    const value = shard as unknown as Record<string, unknown>;
    if (!Object.hasOwn(value, 'status')) {
      for (const key of ['output', 'stage', 'failure', 'auditValueFailure'])
        if (Object.hasOwn(value, key))
          failures.push(
            shardInputFailure(
              'shardManifestShapeInvalid',
              index,
              key,
              { producerFailureOnly: true },
              value[key],
            ),
          );
    } else {
      for (const key of ['stage', 'failure'])
        if (!Object.hasOwn(value, key))
          failures.push(
            shardInputFailure(
              'shardManifestShapeInvalid',
              index,
              key,
              { requiredForProducerFailure: true },
              undefined,
            ),
          );
    }
    const gate = shard.executionRatchets;
    compareAt(
      index,
      'audit.conditionSummaries',
      conditionKeysByShard[index]!,
      shard.audit.conditionSummaries.map(({ key }) => key),
      failures,
    );
    failures.push(
      ...inspectProductionAuditAggregate(shard.audit, `production-audit:shard:${index}`),
    );
    if (index > 0)
      compareAt(
        index,
        'audit.eligibility.staticSemantics',
        shards[0]!.audit.eligibility.staticSemantics,
        shard.audit.eligibility.staticSemantics,
        failures,
      );
    compareAt(
      index,
      'executionRatchets.finalProfileOutcomes.expected',
      evaluateProductionFinalOutcomeGate({ outcomes: shard.audit.outcomes, failures: [] }).expected,
      gate.finalProfileOutcomes.expected,
      failures,
    );
    compareAt(
      index,
      'executionRatchets.finalProfileOutcomes.actual',
      {
        unsupported: shard.audit.outcomes.unsupported,
        invalid: shard.audit.outcomes.invalid,
        inputRequired: shard.audit.outcomes.inputRequired,
      },
      gate.finalProfileOutcomes.actual,
      failures,
    );
    compareAt(
      index,
      'executionRatchets.preparationTransactions.expected',
      evaluateProductionPreparationTransactionGate({
        expectedCalculatedProfiles: shard.audit.outcomes.calculated,
        summary: gate.preparationTransactions.summary,
        failures: [],
      }).expected,
      gate.preparationTransactions.expected,
      failures,
    );
    const declarations = shard.productionArtifacts.conditionRecords;
    compareAt(
      index,
      'productionArtifacts.conditionRecords',
      conditionKeysByShard[index]!,
      declarations.map(({ conditionKey }) => conditionKey),
      failures,
    );
    for (const [n, declaration] of declarations.entries())
      compareAt(
        index,
        `productionArtifacts.conditionRecords[${n}].path`,
        `${declaration.conditionKey}.json`,
        declaration.path,
        failures,
      );
    compareAt(
      index,
      'artifactVerification.verified',
      declarations.map(({ path, bytes, sha256 }) => ({
        path,
        format: 'json',
        allowEmpty: false,
        bytes,
        sha256,
      })),
      shard.artifactVerification.verified,
      failures,
    );
    compareAt(
      index,
      'artifactVerification.errors',
      [],
      shard.artifactVerification.errors,
      failures,
    );
    compareAt(
      index,
      'artifactVerification.firstDifference',
      null,
      shard.artifactVerification.firstDifference,
      failures,
    );
    if (shard.status === 'failed')
      failures.push(
        shardInputFailure('shardExecutionFailed', index, 'status', 'successful shard', 'failed'),
      );
  }
  return {
    comparison: comparison(failures),
    shards: failures.length ? null : shards,
  };
}
function inspectGate(
  value: unknown,
  kind: 'finalProfileOutcomes' | 'preparationTransactions',
  index: number,
  failures: ProductionRecordFailure[],
): void {
  const start = failures.length;
  const path = `executionRatchets.${kind}`;
  const final = kind === 'finalProfileOutcomes';
  inspect(
    value,
    fixed({
      status: { choices: ['passed', 'failed'] },
      canonicalIdentity: {
        choices: [
          final
            ? 'production-regression:final-profile-outcomes'
            : 'production-audit:preparation-transactions',
        ],
      },
      expected: fixed(final ? statusCounts : transactionCounts),
      actual: fixed(final ? statusCounts : transactionCounts),
      firstDifference: { nullable: differenceRule },
      failures: array('canonical'),
      ...(!final ? { summary: summaryRule } : {}),
    }),
    path,
    index,
    failures,
  );
  if (!isObject(value) || !Array.isArray(value['failures'])) return;
  for (const [n, failure] of value['failures'].entries()) {
    if (final) {
      const reason = isObject(failure) ? failure['reason'] : undefined;
      if (typeof reason !== 'string' || !Object.hasOwn(finalFailureRules, reason)) {
        failures.push(
          shardInputFailure(
            'shardManifestShapeInvalid',
            index,
            `${path}.failures[${n}].reason`,
            { choices: Object.keys(finalFailureRules) },
            reason,
          ),
        );
        continue;
      }
      inspect(
        failure,
        finalFailureRules[reason as keyof typeof finalFailureRules],
        `${path}.failures[${n}]`,
        index,
        failures,
      );
    } else inspect(failure, preparationFailureRule, `${path}.failures[${n}]`, index, failures);
  }
  if (failures.length !== start) return;
  if (value['status'] === 'passed') {
    compareAt(index, `${path}.failures`, [], value['failures'], failures);
    compareAt(index, `${path}.firstDifference`, null, value['firstDifference'], failures);
    if (isCanonical(value['expected']) && isCanonical(value['actual']))
      compareAt(index, `${path}.actual`, value['expected'], value['actual'], failures);
  } else if (value['status'] === 'failed') {
    if (!value['failures'].length)
      failures.push(
        shardInputFailure(
          'shardGateContractMismatch',
          index,
          `${path}.failures`,
          { nonempty: true },
          [],
        ),
      );
    if (value['firstDifference'] === null)
      failures.push(
        shardInputFailure(
          'shardGateContractMismatch',
          index,
          `${path}.firstDifference`,
          { nonNull: true },
          null,
        ),
      );
  }
}

const resourceRule = fixed(counts('npLevel', 'capacity', 'gauge'));
const actionRule = fixed(
  {
    command: 'command',
    actorFormId: 'canonical',
    sourceKind: { choices: ['skill', 'noblePhantasm', 'attackNoblePhantasm'] },
    sourceId: 'string',
    selectedEffects: array('canonical'),
    activationFacts: array('canonical'),
    transition: 'canonical',
    resourceBefore: resourceRule,
    resourceAfter: resourceRule,
    resourceTransaction: fixed({
      afterConsumption: resourceRule,
      mutations: array(
        fixed({ step: 'count', occurrenceId: 'string', before: resourceRule, after: resourceRule }),
      ),
    }),
    baseOvercharge: { nullable: 'positive' },
    ocUse: {
      nullable: fixed({
        actionId: 'string',
        gaugeBefore: 'count',
        baseOc: 'positive',
        boostTotal: 'count',
        boostUses: array(
          fixed({
            source: 'canonical',
            sourceName: 'text',
            skillName: 'text',
            label: 'text',
            instanceId: 'count',
            stages: 'positive',
            included: { choices: [true, false] },
            usesBefore: 'canonical',
          }),
        ),
        effectiveOc: 'positive',
        participatingInstances: array('count'),
        excludedInstances: array('count'),
      }),
    },
    ocOutcomes: array(
      fixed(
        {
          step: 'count',
          outcome: {
            choices: [
              'applied',
              'conditionFalse',
              'stochasticFailure',
              'alreadyApplied',
              'notApplicable',
              'policyExcluded',
              'pendingDependency',
            ],
          },
        },
        { effectiveRate: 'number' },
      ),
    ),
  },
  { hpBefore: 'canonical', hpAfter: 'canonical' },
);

/** Observe saved records with the producer's existing transaction owner; no damage execution. */
export function observeProductionShardRecords(
  value: unknown,
  conditionKey: string,
  index: number,
): {
  preparation: ProductionPreparationTransactionObservation[];
  final: ProductionFinalProfileOutcome[];
  failures: ProductionRecordFailure[];
} {
  const preparation: ProductionPreparationTransactionObservation[] = [];
  const final: ProductionFinalProfileOutcome[] = [];
  const failures: ProductionRecordFailure[] = [];
  if (!isObject(value) || !Array.isArray(value['records']))
    return {
      preparation,
      final,
      failures: [
        shardInputFailure(
          'recordShapeInvalid',
          index,
          `conditions.${conditionKey}.records`,
          { type: 'array' },
          isObject(value) ? value['records'] : value,
        ),
      ],
    };
  for (const [n, record] of value['records'].entries()) {
    const path = `conditions.${conditionKey}.records[${n}]`;
    const start = failures.length;
    if (!isObject(record)) {
      failures.push(
        shardInputFailure('recordShapeInvalid', index, path, { type: 'record' }, record),
      );
      continue;
    }
    inspect(record['profileKey'], 'string', `${path}.profileKey`, index, failures);
    inspect(
      record['status'],
      {
        choices: [
          'calculated',
          'unavailableUnderPolicy',
          'unsupported',
          'invalid',
          'inputRequired',
        ],
      },
      `${path}.status`,
      index,
      failures,
    );
    if (record['status'] === 'calculated') {
      const scenario = record['scenario'];
      inspect(
        isObject(scenario) ? scenario['preNoblePhantasmPlan'] : undefined,
        array('command'),
        `${path}.scenario.preNoblePhantasmPlan`,
        index,
        failures,
      );
      inspect(
        record['appliedPreparationActions'],
        array(actionRule),
        `${path}.appliedPreparationActions`,
        index,
        failures,
      );
      if (failures.length === start)
        preparation.push({
          conditionKey,
          profileKey: record['profileKey'] as string,
          commands: (scenario as Record<string, unknown>)[
            'preNoblePhantasmPlan'
          ] as ProductionPreparationTransactionObservation['commands'],
          actions: record[
            'appliedPreparationActions'
          ] as ProductionPreparationTransactionObservation['actions'],
        });
    } else if (
      failures.length === start &&
      (record['status'] === 'unsupported' ||
        record['status'] === 'invalid' ||
        record['status'] === 'inputRequired')
    )
      final.push({
        conditionKey,
        profileKey: record['profileKey'] as string,
        status: record['status'],
      });
  }
  return { preparation, final, failures };
}

export function compareProductionShardGateBodies(
  shard: ProductionSerializedShard,
  index: number,
  preparation: {
    summary: ProductionPreparationTransactionSummary;
    failures: readonly ProductionPreparationTransactionFailure[];
  },
  final: readonly ProductionFinalProfileOutcome[],
): ProductionRecordComparison {
  const failures: ProductionRecordFailure[] = [];
  const expectedFinal = evaluateProductionFinalOutcomeGate({
    outcomes: shard.audit.outcomes,
    failures: final,
  });
  const expectedPreparation = evaluateProductionPreparationTransactionGate({
    expectedCalculatedProfiles: shard.audit.outcomes.calculated,
    ...preparation,
  });
  compareAt(
    index,
    'executionRatchets.finalProfileOutcomes',
    expectedFinal,
    shard.executionRatchets.finalProfileOutcomes,
    failures,
    'shardGateBodyMismatch',
  );
  compareAt(
    index,
    'executionRatchets.preparationTransactions',
    expectedPreparation,
    shard.executionRatchets.preparationTransactions,
    failures,
    'shardGateBodyMismatch',
  );
  for (const [kind, gate] of Object.entries(shard.executionRatchets))
    if (gate.status === 'failed')
      failures.push(
        shardInputFailure(
          'shardExecutionFailed',
          index,
          `executionRatchets.${kind}.status`,
          'passed',
          'failed',
        ),
      );
  return comparison(failures);
}
