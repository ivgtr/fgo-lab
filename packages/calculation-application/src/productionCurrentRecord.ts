import { z } from 'zod';
import { actorFormKey, type MasterDataSnapshot } from '@fgo-lab/master-data';
import {
  damageResolutionInputSchema,
  damageRowSchema,
  calculationUnavailabilityReasonSchema,
  resolvedScenarioSchema,
  rankingSelectionSchema,
  resolvedRankingBasisSchema,
  type VersionContext,
} from '@fgo-lab/schema';
import { attackProfileKey, createStaticAttackProfiles, type AttackProfile } from './attackProfile';
import { compileRankingContributionPolicy } from './contributionPolicy';
import { rankingPolicyKey } from './rankingComparisonPolicy';
import { calculateScenarioWithPolicy } from './scenario';
import { calculateRankingPolicyDetail } from './rankingPolicyCalculation';
import { recordFailure, type ProductionRecordFailure } from './productionClosureRecordIntegrity';
import type { RankingPolicyConditions, RankingProfileInput } from './rankingContracts';

const nonempty = z.string().min(1);
const count = z.number().int().nonnegative();
const canonicalId = z.string().regex(/^[0-9a-f]{64}$/);
const blockerDigest = z.string().regex(/^fnv1a32:[0-9a-f]{8}$/);
const actorFormIdSchema = z.object({ actorId: nonempty, limitCount: count }).strict();
const attackProfileSchema = z
  .object({
    id: z
      .object({
        servantLineageId: nonempty,
        terminalActorFormProfileId: z
          .object({
            servantLineageId: nonempty,
            semantics: z
              .object({
                skillSlots: z.array(
                  z
                    .object({ slot: z.number().int().min(1).max(3), skillVariantId: nonempty })
                    .strict(),
                ),
                passiveVariantIds: z.array(nonempty),
                intrinsicTraits: z.array(nonempty),
                baseNoblePhantasmVariantCanonicalId: canonicalId.nullable(),
                reachableAttackNoblePhantasmVariantCanonicalIds: z.array(canonicalId),
              })
              .strict(),
          })
          .strict(),
        attackNoblePhantasmVariantCanonicalId: canonicalId,
      })
      .strict(),
    noblePhantasmVariant: z
      .object({ actorFormId: actorFormIdSchema, noblePhantasmId: nonempty })
      .strict(),
    noblePhantasmVariantCanonicalId: canonicalId,
    targetScope: z.enum(['single', 'all']),
    cardType: z.enum(['buster', 'arts', 'quick']),
    terminalFormLabel: z.string().nullable(),
  })
  .strict();
const witnessSchema = z
  .object({
    policyKey: nonempty,
    candidateKey: nonempty,
    preparationPlanKey: nonempty,
    startNpGauge: count,
    baselineInputDeviation: count,
    attackProfileKey: nonempty,
    canonicalInputValues: z.record(nonempty, z.number().int()),
    targetCandidateKey: nonempty,
    fieldCandidateKey: nonempty,
    quantityCandidateKey: nonempty,
  })
  .strict();
const candidateKeySchema = z
  .object({
    policyKey: nonempty,
    attackProfileKey: nonempty,
    preparationPlanKey: nonempty,
    startNpGauge: count,
    canonicalInputValues: z.record(nonempty, z.number().int()),
    canonicalInputBaselineDeviation: count,
    targetCandidateKey: nonempty,
    fieldCandidateKey: nonempty,
    quantityCandidateKey: nonempty,
  })
  .strict();
const issueSchema = z.object({ code: nonempty, detail: z.string() }).strict();
const diagnosticClassSchema = z
  .object({
    count,
    digest: blockerDigest,
    representatives: z.array(z.object({ candidateKey: nonempty, reason: z.string() }).strict()),
  })
  .strict();
const diagnosticsSchema = z
  .object({
    classes: z
      .object({
        unavailableUnderPolicy: diagnosticClassSchema,
        inputRequired: diagnosticClassSchema,
        invalid: diagnosticClassSchema,
        unsupported: diagnosticClassSchema,
      })
      .strict(),
  })
  .strict();
const candidateIssueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('staticPreparationInvalid'), detail: nonempty }).strict(),
  z.object({ kind: z.literal('semanticDomainInvalid'), detail: nonempty }).strict(),
  z
    .object({ kind: z.literal('unsupportedCanonicalSemantics'), projectionKeys: z.array(nonempty) })
    .strict(),
  z.object({ kind: z.literal('unsupportedActionAdmission'), attackProfileKey: nonempty }).strict(),
  z
    .object({
      kind: z.literal('unsupportedFiniteDomain'),
      upperBound: count,
      supportedMaximum: z.literal(4096),
    })
    .strict(),
]);
const requiredInputSchema = z
  .object({
    key: nonempty,
    owner: z.enum(['attacker', 'target', 'field', 'party', 'source']),
    label: nonempty,
    description: nonempty,
    minimum: z.number().int(),
    maximum: z.number().int(),
    step: z.number().int().positive(),
    effectOccurrenceIds: z.array(nonempty).min(1),
  })
  .strict();
const nonCalculatedSchema = z.discriminatedUnion('status', [
  z
    .object({
      profileKey: nonempty,
      status: z.literal('unavailableUnderPolicy'),
      attackProfile: attackProfileSchema,
      reason: z.union([
        z.literal('attackProfileNotReachable'),
        z.literal('noSatisfiableCandidate'),
        calculationUnavailabilityReasonSchema,
      ]),
      diagnostics: diagnosticsSchema,
    })
    .strict(),
  z
    .object({
      profileKey: nonempty,
      status: z.literal('inputRequired'),
      attackProfile: attackProfileSchema,
      inputs: z.array(requiredInputSchema),
      issues: z.array(issueSchema),
      diagnostics: diagnosticsSchema,
    })
    .strict(),
  z
    .object({
      profileKey: nonempty,
      status: z.literal('invalid'),
      attackProfile: attackProfileSchema.nullable(),
      issues: z.array(issueSchema),
      reason: nonempty,
      candidateSpaceIssue: candidateIssueSchema.optional(),
      detail: z.string().optional(),
      diagnostics: diagnosticsSchema.optional(),
    })
    .strict(),
  z
    .object({
      profileKey: nonempty,
      status: z.literal('unsupported'),
      attackProfile: attackProfileSchema.nullable(),
      issues: z.array(issueSchema),
      reason: nonempty,
      detail: z.string().optional(),
      diagnostics: diagnosticsSchema.optional(),
    })
    .strict(),
]);
const calculatedKeys = [
  'profileKey',
  'status',
  'basis',
  'rankingPolicy',
  'attackProfile',
  'scenario',
  'witness',
  'canonicalInput',
  'damageRows',
  'appliedPreparationActions',
  'effects',
  'effectInputs',
  'warnings',
  'outcome',
  'areaContribution',
] as const;

function failure(
  reason: ProductionRecordFailure['reason'],
  identity: string,
  path: string,
  expected: unknown,
  actual: unknown,
): ProductionRecordFailure {
  const found = recordFailure(reason, identity, { value: expected }, { value: actual });
  if (!found) throw new TypeError('production_current_record_failure_expected');
  return {
    ...found,
    expected: found.expected,
    actual: found.actual,
    firstDifference: {
      identity,
      path,
      expected: found.firstDifference.expected,
      actual: found.firstDifference.actual,
    },
  };
}

function schemaFailure(identity: string, field: string, schema: z.ZodType, value: unknown) {
  const parsed = schema.safeParse(value);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0]!;
  const path = [field, ...issue.path.map(String)].filter(Boolean).join('.');
  return failure(
    'recordShapeInvalid',
    identity,
    path,
    { valid: true },
    { code: issue.code, message: issue.message },
  );
}

function compactAction(
  action: ReturnType<typeof calculateScenarioWithPolicy>['appliedPreparationActions'][number],
) {
  return {
    command: action.command,
    actorFormId: action.actorFormId,
    sourceKind: action.sourceKind,
    sourceId: action.sourceId,
    selectedEffects: action.selectedEffects.map(({ occurrenceId, sourceActivation }) => ({
      occurrenceId,
      sourceActivation,
    })),
    activationFacts: action.activationFacts,
    transition: action.transition,
    resourceBefore: action.resourceBefore,
    resourceAfter: action.resourceAfter,
    resourceTransaction: action.resourceTransaction,
    ...(action.hpBefore === undefined ? {} : { hpBefore: action.hpBefore }),
    ...(action.hpAfter === undefined ? {} : { hpAfter: action.hpAfter }),
    baseOvercharge: action.baseOvercharge,
    ocUse: action.ocUse,
    ocOutcomes: action.ocOutcomes,
  };
}
function compactResult(
  result: Extract<
    ReturnType<typeof calculateScenarioWithPolicy>['result'],
    { status: 'calculated' }
  >,
) {
  return {
    status: result.status,
    precision: result.precision,
    rows: result.rows,
    breakdown: result.breakdown,
    assumptions: result.assumptions,
    issues: result.issues,
    trace: result.trace,
    versions: result.versions,
    evidenceKeys: result.evidence.map(({ key }) => key),
  };
}
const compactEffects = (effects: ReturnType<typeof calculateScenarioWithPolicy>['effects']) =>
  effects.map(({ projectionKey, outcome, explanation }) => ({
    projectionKey,
    outcome,
    explanationCode: explanation.code,
  }));

export function verifyCurrentProductionRecord(input: {
  value: unknown;
  condition: RankingPolicyConditions;
  master: MasterDataSnapshot;
  versions: VersionContext;
  profile: RankingProfileInput;
  profilesByKey?: ReadonlyMap<string, AttackProfile>;
}): ProductionRecordFailure[] {
  const { value, condition, master, versions } = input;
  const profileKey =
    typeof value === 'object' &&
    value !== null &&
    'profileKey' in value &&
    typeof value.profileKey === 'string'
      ? value.profileKey
      : '<missing>';
  const identity = `production:current:${profileKey}`;
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return [failure('recordShapeInvalid', identity, '', { object: true }, { object: false })];
  const record = value as Record<string, unknown>;
  if (record['status'] !== 'calculated') {
    const invalid = schemaFailure(identity, '', nonCalculatedSchema, value);
    if (invalid) return [invalid];
    const current = value as z.infer<typeof nonCalculatedSchema>;
    const expectedProfile = input.profilesByKey
      ? input.profilesByKey.get(profileKey)
      : master.servants
          .flatMap(createStaticAttackProfiles)
          .find((profile) => attackProfileKey(profile) === profileKey);
    if (!expectedProfile)
      return [
        failure(
          'canonicalRecordMismatch',
          identity,
          'profileKey',
          { catalogProfile: true },
          { catalogProfile: false },
        ),
      ];
    if (current.attackProfile !== null) {
      const mismatch = recordFailure(
        'canonicalRecordMismatch',
        identity,
        expectedProfile,
        current.attackProfile,
      );
      if (mismatch) return [mismatch];
    }
    const servant = master.servants.find(({ id }) => id === expectedProfile.id.servantLineageId);
    if (!servant)
      return [
        failure(
          'canonicalRecordMismatch',
          identity,
          'attackProfile.id.servantLineageId',
          { catalogServant: true },
          { catalogServant: false },
        ),
      ];
    const expectedOutcome = calculateRankingPolicyDetail(
      servant,
      master,
      input.profile,
      condition,
      versions,
      expectedProfile,
      false,
    );
    if (expectedOutcome.status !== current.status)
      return [
        failure(
          'canonicalRecordMismatch',
          identity,
          'status',
          expectedOutcome.status,
          current.status,
        ),
      ];
    const outcomeFailure = recordFailure(
      'canonicalRecordMismatch',
      identity,
      { profileKey, ...expectedOutcome },
      current,
    );
    if (outcomeFailure) return [outcomeFailure];
    return [];
  }
  const actualKeys = Object.keys(record).sort();
  const expectedKeys = [...calculatedKeys].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys))
    return [failure('recordShapeInvalid', identity, '', expectedKeys, actualKeys)];
  const fields: readonly [string, z.ZodType][] = [
    ['basis', resolvedRankingBasisSchema],
    ['rankingPolicy', rankingSelectionSchema],
    ['attackProfile', attackProfileSchema],
    ['scenario', resolvedScenarioSchema],
    ['witness', witnessSchema],
    ['canonicalInput', damageResolutionInputSchema],
    [
      'damageRows',
      z.tuple([
        damageRowSchema,
        damageRowSchema,
        damageRowSchema,
        damageRowSchema,
        damageRowSchema,
      ]),
    ],
  ];
  for (const [field, schema] of fields) {
    const invalid = schemaFailure(identity, field, schema, record[field]);
    if (invalid) return [invalid];
  }
  if (record['profileKey'] !== profileKey || !profileKey)
    return [failure('recordShapeInvalid', identity, 'profileKey', { nonempty: true }, profileKey)];
  const policyFailure = recordFailure(
    'canonicalRecordMismatch',
    identity,
    condition,
    record['rankingPolicy'],
  );
  if (policyFailure) return [policyFailure];
  const scenario = record['scenario'] as z.infer<typeof resolvedScenarioSchema>;
  const basis = record['basis'] as z.infer<typeof resolvedRankingBasisSchema>;
  if (
    basis.servantId !== scenario.attacker.servantId ||
    basis.level !== scenario.attacker.level ||
    basis.npLevel !== scenario.attacker.npLevel ||
    basis.initialOvercharge !== scenario.initialOvercharge ||
    basis.fouAtk !== scenario.attacker.fouAtk
  )
    return [
      failure(
        'canonicalRecordMismatch',
        identity,
        'basis',
        {
          servantId: scenario.attacker.servantId,
          level: scenario.attacker.level,
          npLevel: scenario.attacker.npLevel,
          initialOvercharge: scenario.initialOvercharge,
          fouAtk: scenario.attacker.fouAtk,
        },
        basis,
      ),
    ];
  const witness = record['witness'] as z.infer<typeof witnessSchema>;
  if (scenario.preNoblePhantasmPlan.at(-1)?.kind !== 'executeAttackNoblePhantasm')
    return [
      failure(
        'recordShapeInvalid',
        identity,
        'scenario.preNoblePhantasmPlan',
        { terminalAttack: true },
        { terminalAttack: false },
      ),
    ];
  const expectedPlanKey = `${actorFormKey(scenario.attacker.initialActorFormId)}|${scenario.preNoblePhantasmPlan
    .slice(0, -1)
    .map((command) => JSON.stringify(command))
    .join('|')}`;
  if (witness.preparationPlanKey !== expectedPlanKey)
    return [
      failure(
        'canonicalRecordMismatch',
        identity,
        'witness.preparationPlanKey',
        expectedPlanKey,
        witness.preparationPlanKey,
      ),
    ];
  const scenarioInputs = Object.fromEntries(
    Object.entries(scenario.canonicalInputValues).map(([key, value]) => [key, value.value]),
  );
  const inputMismatch = recordFailure(
    'canonicalRecordMismatch',
    identity,
    scenarioInputs,
    witness.canonicalInputValues,
  );
  if (inputMismatch) return [inputMismatch];
  const expectedPolicyKey = rankingPolicyKey(condition.selfBuffs, condition.conditionalEffects);
  if (witness.policyKey !== expectedPolicyKey)
    return [
      failure(
        'canonicalRecordMismatch',
        identity,
        'witness.policyKey',
        expectedPolicyKey,
        witness.policyKey,
      ),
    ];
  if (witness.attackProfileKey !== profileKey)
    return [
      failure(
        'canonicalRecordMismatch',
        identity,
        'witness.attackProfileKey',
        profileKey,
        witness.attackProfileKey,
      ),
    ];
  if (witness.startNpGauge > master.npResourceSemantics.capacityByNpLevel[basis.npLevel - 1]!)
    return [
      failure(
        'recordShapeInvalid',
        identity,
        'witness.startNpGauge',
        { maximum: master.npResourceSemantics.capacityByNpLevel[basis.npLevel - 1] },
        witness.startNpGauge,
      ),
    ];
  const expectedStartGauge =
    condition.initialOvercharge *
    master.npResourceSemantics.noblePhantasmUse.baseOvercharge.gaugePerStage;
  if (witness.startNpGauge !== expectedStartGauge)
    return [
      failure(
        'canonicalRecordMismatch',
        identity,
        'witness.startNpGauge',
        expectedStartGauge,
        witness.startNpGauge,
      ),
    ];
  let parsedCandidateKey: unknown;
  try {
    parsedCandidateKey = JSON.parse(witness.candidateKey);
  } catch {
    return [
      failure(
        'recordShapeInvalid',
        identity,
        'witness.candidateKey',
        { validJson: true },
        { validJson: false },
      ),
    ];
  }
  const candidateKeyFailure = schemaFailure(
    identity,
    'witness.candidateKey',
    candidateKeySchema,
    parsedCandidateKey,
  );
  if (candidateKeyFailure) return [candidateKeyFailure];
  const candidateKey = parsedCandidateKey as z.infer<typeof candidateKeySchema>;
  const expectedDeviation =
    candidateKey.canonicalInputBaselineDeviation +
    Math.abs(witness.startNpGauge - master.npResourceSemantics.noblePhantasmUse.requirement) +
    scenario.worldFactAssertions.filter(
      ({ decisionKey, fact }) =>
        decisionKey.startsWith('ranking:') && fact.kind === 'trait' && fact.present,
    ).length;
  if (witness.baselineInputDeviation !== expectedDeviation)
    return [
      failure(
        'canonicalRecordMismatch',
        identity,
        'witness.baselineInputDeviation',
        expectedDeviation,
        witness.baselineInputDeviation,
      ),
    ];
  for (const key of [
    'policyKey',
    'attackProfileKey',
    'preparationPlanKey',
    'startNpGauge',
    'canonicalInputValues',
    'targetCandidateKey',
    'fieldCandidateKey',
    'quantityCandidateKey',
  ] as const) {
    const mismatch = recordFailure(
      'canonicalRecordMismatch',
      identity,
      { [key]: witness[key] },
      { [key]: candidateKey[key] },
    );
    if (mismatch) return [mismatch];
  }
  const servant = input.profilesByKey
    ? undefined
    : master.servants.find(({ id }) => id === basis.servantId);
  const expectedProfile = input.profilesByKey
    ? input.profilesByKey.get(profileKey)
    : servant &&
      createStaticAttackProfiles(servant).find(
        (profile) => attackProfileKey(profile) === profileKey,
      );
  if (!expectedProfile)
    return [
      failure(
        'canonicalRecordMismatch',
        identity,
        'attackProfile',
        { catalogProfile: true },
        { catalogProfile: false },
      ),
    ];
  if (expectedProfile.id.servantLineageId !== basis.servantId)
    return [
      failure(
        'canonicalRecordMismatch',
        identity,
        'attackProfile.id.servantLineageId',
        basis.servantId,
        expectedProfile.id.servantLineageId,
      ),
    ];
  const profileFailure = recordFailure(
    'canonicalRecordMismatch',
    identity,
    expectedProfile,
    record['attackProfile'],
  );
  if (profileFailure) return [profileFailure];
  let replay: ReturnType<typeof calculateScenarioWithPolicy>;
  try {
    replay = calculateScenarioWithPolicy(
      scenario,
      master,
      versions,
      compileRankingContributionPolicy(condition),
    );
  } catch (cause) {
    return [
      failure(
        'canonicalRecordMismatch',
        identity,
        'scenario',
        { replay: 'calculated' },
        { replay: cause instanceof Error ? cause.message : String(cause) },
      ),
    ];
  }
  if (replay.status !== 'executable' || replay.result.status !== 'calculated')
    return [
      failure(
        'canonicalRecordMismatch',
        identity,
        'outcome.status',
        'calculated',
        replay.result.status,
      ),
    ];
  const expectedReplay = {
    canonicalInput: replay.input,
    damageRows: replay.result.rows,
    appliedPreparationActions: replay.appliedPreparationActions.map(compactAction),
    effects: compactEffects(replay.effects),
    effectInputs: replay.effectInputs,
    warnings: replay.effectWarnings,
    outcome: compactResult(replay.result),
  };
  const actualReplay = Object.fromEntries(
    Object.keys(expectedReplay).map((key) => [key, record[key]]),
  );
  const replayFailure = recordFailure(
    'canonicalRecordMismatch',
    identity,
    expectedReplay,
    actualReplay,
  );
  if (replayFailure)
    return [
      {
        ...replayFailure,
        expected: {
          path: replayFailure.firstDifference.path,
          value: replayFailure.firstDifference.expected ?? null,
        },
        actual: {
          path: replayFailure.firstDifference.path,
          value: replayFailure.firstDifference.actual ?? null,
        },
      },
    ];
  const area = record['areaContribution'];
  if (area !== null)
    return [failure('recordShapeInvalid', identity, 'areaContribution', null, area)];
  return [];
}
