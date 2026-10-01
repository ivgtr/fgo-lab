import { inspectProductionAuditValue } from '../src/productionAuditValue';
import {
  auditProductionPreparationTransactionObservations,
  type ProductionPreparationTransactionSummary,
  type ProductionPreparationTransactionFailure,
  type ProductionFinalProfileOutcome,
} from '../src/productionParityDiagnostics';
import {
  observeProductionShardRecords,
  compareProductionShardGateBodies,
  type ProductionSerializedShard,
} from '../src/productionShardAcceptance';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { verifyArtifactFiles } from '../../../scripts/test-observation-lib.mjs';
import type { Tsk065ProductionAuditSource } from '@fgo-lab/master-data/production-audit';
import {
  productionClosureConditions,
  productionClosureConditionKey,
  productionClosureMatrixDigest,
  type ProductionClosureAudit,
} from '../src/productionClosureAudit';
import {
  compareProductionConditionRecords,
  compareProductionMatrixAggregates,
  inspectProductionAuditAggregate,
  inspectProductionConditionRecord,
  recordFailure,
  type ProductionRecordComparison,
  type ProductionRecordFailure,
} from '../src/productionClosureRecordIntegrity';

export interface ConditionArtifact {
  conditionKey: string;
  path: string;
  bytes: number;
  sha256: string;
}

export async function verifyProductionMatrixRecords(input: {
  root: string;
  output: string;
  source: Tsk065ProductionAuditSource;
  identity: Record<string, string>;
  shards: ProductionSerializedShard[];
  artifacts: ConditionArtifact[];
  audit: unknown;
}) {
  const failures: ProductionRecordFailure[] = [];
  const shardObservations = input.shards.map(() => ({
    summary: {
      calculatedProfiles: 0,
      commandCount: 0,
      actionCount: 0,
      npUseReceiptCount: 0,
    } as ProductionPreparationTransactionSummary,
    failures: [] as ProductionPreparationTransactionFailure[],
    final: [] as ProductionFinalProfileOutcome[],
    complete: true,
  }));
  const add = (
    reason: ProductionRecordFailure['reason'],
    identity: string,
    expected: unknown,
    actual: unknown,
  ) => {
    const failure = recordFailure(reason, identity, expected, actual);
    if (failure) failures.push(failure);
  };
  const reference = input.source.matrix.canonicalRecords;
  const manifestPath = resolve(input.root, reference.manifest);
  const referenceReceipt = verifyArtifactFiles(dirname(manifestPath), [
    {
      path: manifestPath,
      format: 'json',
      allowEmpty: false,
      expectedBytes: reference.bytes,
      expectedSha256: reference.sha256,
    },
  ]);
  const unavailable = (errors: readonly string[]) => {
    add(
      'recordArtifactUnavailable',
      'tsk-06.5:canonical-record-reference',
      { available: true },
      { available: false, errors },
    );
    return result();
  };
  let expected: {
    identity: Record<string, string>;
    audit: ProductionClosureAudit;
    productionArtifacts: { conditionRecords: ConditionArtifact[] };
  };
  if (referenceReceipt.errors.length) return unavailable(referenceReceipt.errors);
  const expectedValue: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
  const expectedDomain = inspectProductionAuditValue(expectedValue);
  if (expectedDomain.status === 'failed') {
    add(
      'recordValueInvalid',
      'tsk-06.5:canonical-record-reference',
      { auditValue: 'accepted' },
      expectedValue,
    );
    return result();
  }
  expected = expectedDomain.value as unknown as typeof expected;
  add(
    'recordIdentityMismatch',
    'tsk-06.5:canonical-record-reference',
    reference.identity,
    expected.identity,
  );
  add(
    'recordIdentityMismatch',
    'tsk-08:matrix-source-shape',
    Object.keys(reference.identity).sort(),
    Object.keys(input.identity).sort(),
  );
  const requiredSource = {
    masterDataVersion: input.identity['masterDataVersion'],
    masterSha256: input.identity['masterSha256'],
    matrix: input.identity['matrix'],
    command: input.identity['command'],
  };
  add('recordIdentityMismatch', 'tsk-06.5:canonical-record-source', requiredSource, {
    masterDataVersion: expected.identity.masterDataVersion,
    masterSha256: expected.identity.masterSha256,
    matrix: expected.identity.matrix,
    command: expected.identity.command,
  });
  add(
    'recordSummaryMismatch',
    'tsk-06.5:canonical-record-matrix',
    {
      digest: input.source.matrix.mergedDigest,
      eligibilityDigest: input.source.matrix.eligibilityDigest,
      conditionCount: input.source.matrix.conditionCount,
      attackProfileCount: input.source.matrix.attackProfileCount,
      outcomeCount: input.source.matrix.outcomeCount,
      outcomes: input.source.matrix.outcomes,
      parityCount: input.source.matrix.parityCount,
      parityFailures: input.source.matrix.parityFailures,
    },
    {
      digest: expected.audit.digest,
      eligibilityDigest: expected.audit.eligibility.candidates.digest,
      conditionCount: expected.audit.conditionCount,
      attackProfileCount: expected.audit.attackProfileCount,
      outcomeCount: expected.audit.outcomeCount,
      outcomes: expected.audit.outcomes,
      parityCount: expected.audit.parityCount,
      parityFailures: expected.audit.parityFailures.length,
    },
  );
  failures.push(...inspectProductionAuditAggregate(expected.audit, 'tsk-06.5:expected-matrix'));
  const { digest: expectedDigest, ...expectedAudit } = expected.audit;
  add(
    'recordDigestMismatch',
    'tsk-06.5:expected-matrix',
    { digest: expectedDigest },
    { digest: productionClosureMatrixDigest(expectedAudit) },
  );
  const keys = productionClosureConditions().map(productionClosureConditionKey);
  const declarations = expected.productionArtifacts.conditionRecords;
  add(
    'recordSummaryMismatch',
    'tsk-06.5:expected-condition-coverage',
    [...keys].sort(),
    [...declarations.map((d) => d.conditionKey)].sort(),
  );
  add(
    'recordSummaryMismatch',
    'tsk-06.5:expected-summary-coverage',
    keys,
    expected.audit.conditionSummaries.map((s) => s.key),
  );
  const declarationErrors = declarations.flatMap((d) =>
    d.path !== `${d.conditionKey}.json` ||
    !Number.isSafeInteger(d.bytes) ||
    d.bytes <= 0 ||
    !/^[a-f0-9]{64}$/.test(d.sha256)
      ? [`${d.conditionKey}:invalid_declaration`]
      : [],
  );
  if (declarationErrors.length || failures.length)
    return unavailable(
      declarationErrors.length ? declarationErrors : ['expected_reference_inconsistent'],
    );
  const expectedReceipts = verifyArtifactFiles(
    dirname(manifestPath),
    declarations.map((d) => ({
      path: d.path,
      format: 'json',
      allowEmpty: false,
      expectedBytes: d.bytes,
      expectedSha256: d.sha256,
    })),
  );
  if (expectedReceipts.errors.length) return unavailable(expectedReceipts.errors);
  failures.push(...compareProductionMatrixAggregates(expected.audit, input.audit));
  for (const [index, shard] of input.shards.entries()) {
    add('recordIdentityMismatch', `tsk-08:shard:${index}`, input.identity, shard.identity);
    const shardKeys = keys.filter(
      (_, conditionIndex) => conditionIndex % input.shards.length === index,
    );
    add(
      'shardAggregateMismatch',
      `tsk-08:shard:${index}`,
      shardKeys,
      shard.audit.conditionSummaries.map((summary) => summary.key),
    );
    failures.push(...inspectProductionAuditAggregate(shard.audit, `tsk-08:shard:${index}`));
    const { digest, ...audit } = shard.audit;
    add(
      'recordDigestMismatch',
      `tsk-08:shard:${index}`,
      { digest },
      { digest: productionClosureMatrixDigest(audit) },
    );
    add(
      'shardAggregateMismatch',
      `tsk-08:shard:${index}`,
      { profileCount: expected.audit.attackProfileCount },
      { profileCount: shard.audit.attackProfileCount },
    );
  }
  for (const [index, key] of keys.entries()) {
    const expectedDeclaration = declarations.find(
      (declaration) => declaration.conditionKey === key,
    )!;
    const expectedValue: unknown = JSON.parse(
      await readFile(resolve(dirname(manifestPath), expectedDeclaration.path), 'utf8'),
    );
    const expectedSummary = expected.audit.conditionSummaries[index]!;
    add(
      'recordSummaryMismatch',
      `production:${key}:conditions`,
      productionClosureConditions()[index],
      expectedSummary.conditions,
    );
    const expectedInspection = inspectProductionConditionRecord({
      value: expectedValue,
      conditionKey: key,
      identity: expected.identity,
      summary: expectedSummary,
      profileCount: expected.audit.attackProfileCount,
    });
    failures.push(...expectedInspection.failures);
    const actualDeclaration = input.artifacts.find((d) => d.conditionKey === key);
    if (!actualDeclaration) {
      shardObservations[index % input.shards.length]!.complete = false;
      add(
        'recordArtifactUnavailable',
        `production:${key}`,
        { declared: true },
        { declared: false },
      );
      continue;
    }
    const shard = input.shards[index % input.shards.length]!;
    const summary = shard.audit.conditionSummaries.find((s) => s.key === key);
    if (!summary) {
      shardObservations[index % input.shards.length]!.complete = false;
      add(
        'shardAggregateMismatch',
        `production:${key}`,
        { summaryPresent: true },
        { summaryPresent: false },
      );
      continue;
    }
    add(
      'recordSummaryMismatch',
      `production:${key}:conditions`,
      productionClosureConditions()[index],
      summary.conditions,
    );
    const {
      elapsedMs: _expectedElapsed,
      digest: _expectedDigest,
      ...expectedSummaryValue
    } = expectedSummary;
    const { elapsedMs: _actualElapsed, digest: _actualDigest, ...actualSummaryValue } = summary;
    add(
      'recordSummaryMismatch',
      `production:${key}:summary`,
      expectedSummaryValue,
      actualSummaryValue,
    );
    let actualValue: unknown;
    try {
      actualValue = JSON.parse(
        await readFile(resolve(input.output, actualDeclaration.path), 'utf8'),
      );
    } catch (cause) {
      shardObservations[index % input.shards.length]!.complete = false;
      add(
        'recordArtifactUnavailable',
        `production:${key}`,
        { readable: true },
        { readable: false, error: cause instanceof Error ? cause.message : String(cause) },
      );
      continue;
    }
    const actualInspection = inspectProductionConditionRecord({
      value: actualValue,
      conditionKey: key,
      identity: shard.identity,
      summary,
      profileCount: expected.audit.attackProfileCount,
    });
    failures.push(...actualInspection.failures);
    if (expectedInspection.status === 'failed' || actualInspection.status === 'failed') {
      shardObservations[index % input.shards.length]!.complete = false;
      continue;
    }
    // Only accepted complete bodies may enter comparison and transaction observation.
    if (expectedSummary.digest !== summary.digest || actualInspection.failures.length)
      failures.push(
        ...compareProductionConditionRecords(expectedInspection.records, actualInspection.records),
      );
    if (expectedInspection.failures.length || actualInspection.failures.length) {
      shardObservations[index % input.shards.length]!.complete = false;
      continue;
    }
    const observed = observeProductionShardRecords(actualValue, key, index % input.shards.length);
    failures.push(...observed.failures);
    const bucket = shardObservations[index % input.shards.length]!;
    if (observed.failures.length) bucket.complete = false;
    const transaction = auditProductionPreparationTransactionObservations(observed.preparation);
    for (const field of Object.keys(
      bucket.summary,
    ) as (keyof ProductionPreparationTransactionSummary)[])
      bucket.summary[field] += transaction.summary[field];
    bucket.failures.push(...transaction.failures);
    bucket.final.push(...observed.final);
  }
  for (const [index, shard] of input.shards.entries()) {
    const observed = shardObservations[index]!;
    if (observed.complete)
      failures.push(
        ...compareProductionShardGateBodies(shard, index, observed, observed.final).failures,
      );
  }
  return result(expectedReceipts);

  function result(expectedReceipts?: ReturnType<typeof verifyArtifactFiles>) {
    const priority = (failure: ProductionRecordFailure) =>
      failure.reason === 'canonicalRecordMismatch'
        ? 0
        : failure.reason === 'canonicalAggregateMismatch'
          ? 1
          : 2;
    const ordered = [...failures].sort(
      (a, b) => priority(a) - priority(b) || a.canonicalIdentity.localeCompare(b.canonicalIdentity),
    );
    const comparison: ProductionRecordComparison = {
      status: ordered.length ? 'failed' : 'passed',
      failures: ordered,
      firstDifference: ordered[0]?.firstDifference ?? null,
    };
    return { reference, referenceReceipt, expectedReceipts, comparison };
  }
}
