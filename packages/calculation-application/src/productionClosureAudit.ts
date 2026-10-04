import { acceptedProductionAuditValue } from './productionAuditValue';
import { createHash } from 'node:crypto';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';
import { calculateRankingPolicy } from './rankingPolicyCalculation';
import {
  DEFAULT_RANKING_POLICY_CONDITIONS,
  type RankingPolicyConditions,
  type RankingProfileInput,
} from './rankingContracts';
import { calculateScenarioWithPolicy } from './scenario';
import {
  createRankingPortableRequest,
  currentCalculationVersionContext,
  executePortableCalculation,
} from './portableCalculation';
import {
  RANKING_ELIGIBILITY_DIGEST_PARTITION_COUNT,
  RankingEligibilityAuditAccumulator,
  type RankingEligibilityAudit,
} from './rankingEligibilityAudit';
import {
  compareProductionParity,
  type ProductionParityFailure,
  type ProductionParityPath,
} from './productionParityDiagnostics';

export interface ProductionClosureConditionRecord {
  key: string;
  conditions: RankingPolicyConditions;
  elapsedMs: number;
  calculated: number;
  unavailableUnderPolicy: number;
  inputRequired: number;
  invalid: number;
  unsupported: number;
  parityCount: number;
  parityFailures: readonly ProductionClosureParityFailure[];
  damageCache: ReturnType<typeof calculateRankingPolicy>['damageCache'];
  candidateInventory: ReturnType<typeof calculateRankingPolicy>['candidateInventory'];
  digest: string;
  records: readonly unknown[];
}

export interface ProductionClosureParityFailure {
  conditionKey: string;
  profileKey: string;
  path: ProductionParityPath;
  reason: ProductionParityFailure['reason'];
  canonicalIdentity: string;
  mismatch: string;
  firstDifference: ProductionParityFailure['firstDifference'];
  expected: ProductionParityFailure['expected'];
  actual: ProductionParityFailure['actual'];
}

export interface ProductionClosureUnavailable {
  conditionKey: string;
  profileKey: string;
  reason: string;
  diagnostics: unknown;
}

export interface ProductionClosureAudit {
  conditionCount: number;
  attackProfileCount: number;
  outcomeCount: number;
  outcomes: {
    calculated: number;
    unavailableUnderPolicy: number;
    inputRequired: number;
    invalid: number;
    unsupported: number;
  };
  parityCount: number;
  parityFailures: readonly ProductionClosureParityFailure[];
  unavailable: readonly ProductionClosureUnavailable[];
  conditionSummaries: readonly Omit<ProductionClosureConditionRecord, 'records'>[];
  eligibility: RankingEligibilityAudit;
  digest: string;
}

export function productionClosureConditions(): readonly RankingPolicyConditions[] {
  const conditions: RankingPolicyConditions[] = [];
  for (const levelBasis of ['naturalLimit', 'uniformLevel90'] as const)
    for (const selfBuffs of ['included', 'excluded'] as const)
      for (const conditionalEffects of ['baseline', 'satisfied'] as const)
        for (const npLevel of [1, 2, 3, 4, 5] as const)
          for (const initialOvercharge of [1, 2, 3] as const) {
            const legalMaximum = npLevel === 1 ? 1 : npLevel === 5 ? 3 : 2;
            if (initialOvercharge > legalMaximum) continue;
            conditions.push({
              ...DEFAULT_RANKING_POLICY_CONDITIONS,
              levelBasis,
              selfBuffs,
              conditionalEffects,
              initialOvercharge,
              npLevelBasis: { kind: 'specified', npLevel },
            });
          }
  return conditions;
}

export function productionClosureConditionKey(conditions: RankingPolicyConditions): string {
  if (conditions.npLevelBasis.kind !== 'specified')
    throw new TypeError('production_closure_requires_specified_np_level');
  return `${conditions.levelBasis}-${conditions.selfBuffs}-${conditions.conditionalEffects}-np${String(conditions.npLevelBasis.npLevel)}-oc${String(conditions.initialOvercharge)}`;
}

const digest = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(acceptedProductionAuditValue(value)))
    .digest('hex');

export const productionClosureRecordDigest = digest;

export function productionClosureMatrixDigest(
  result: Omit<ProductionClosureAudit, 'digest' | 'eligibility' | 'conditionSummaries'> & {
    eligibility: unknown;
    conditionSummaries: readonly (Omit<
      ProductionClosureConditionRecord,
      'records' | 'elapsedMs'
    > & { elapsedMs?: number })[];
  },
): string {
  return digest({
    ...result,
    conditionSummaries: result.conditionSummaries.map(
      ({ elapsedMs: _elapsedMs, ...summary }) => summary,
    ),
  });
}

export function productionParityActions(
  actions: ReturnType<typeof calculateScenarioWithPolicy>['appliedPreparationActions'],
): ReturnType<typeof calculateScenarioWithPolicy>['appliedPreparationActions'] {
  return actions.map(({ hpBefore, hpAfter, ...action }) => ({
    ...action,
    ...(hpBefore === undefined ? {} : { hpBefore }),
    ...(hpAfter === undefined ? {} : { hpAfter }),
  }));
}

function compactPreparationActions(
  actions: ReturnType<typeof calculateScenarioWithPolicy>['appliedPreparationActions'],
) {
  return actions.map((action) => ({
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
  }));
}

function compactCalculatedResult(
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

export async function auditProductionClosure(
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  versions: VersionContext,
  observe?: (record: ProductionClosureConditionRecord) => void | Promise<void>,
  selectedConditions: readonly RankingPolicyConditions[] = productionClosureConditions(),
): Promise<ProductionClosureAudit> {
  const summaries: Omit<ProductionClosureConditionRecord, 'records'>[] = [];
  const unavailable: ProductionClosureUnavailable[] = [];
  const parityFailures: ProductionClosureParityFailure[] = [];
  const outcomes = {
    calculated: 0,
    unavailableUnderPolicy: 0,
    inputRequired: 0,
    invalid: 0,
    unsupported: 0,
  };
  let parityCount = 0;
  let attackProfileCount: number | null = null;
  const eligibility = new RankingEligibilityAuditAccumulator(master);
  const digestPartitionByCondition = new Map(
    productionClosureConditions().map((condition, index) => [
      productionClosureConditionKey(condition),
      index % RANKING_ELIGIBILITY_DIGEST_PARTITION_COUNT,
    ]),
  );

  for (const conditions of selectedConditions) {
    const key = productionClosureConditionKey(conditions);
    const digestPartition = digestPartitionByCondition.get(key);
    if (digestPartition === undefined)
      throw new TypeError(`production_closure_condition_not_canonical:${key}`);
    const startedAt = performance.now();
    const result = calculateRankingPolicy(
      master,
      profile,
      conditions,
      versions,
      ({ servant, candidateSet }) =>
        eligibility.observe(master, servant, conditions, candidateSet, digestPartition),
    );
    const elapsedMs = performance.now() - startedAt;
    const entries = Object.entries(result.profileResults);
    attackProfileCount ??= entries.length;
    if (entries.length !== attackProfileCount)
      throw new TypeError(`production_closure_profile_count_changed:${key}`);
    const records: unknown[] = [];
    const localFailures: ProductionClosureParityFailure[] = [];
    const localOutcomes = {
      calculated: 0,
      unavailableUnderPolicy: 0,
      inputRequired: 0,
      invalid: 0,
      unsupported: 0,
    };
    let localParityCount = 0;

    for (const [profileKey, outcome] of entries) {
      localOutcomes[outcome.status] += 1;
      outcomes[outcome.status] += 1;
      if (outcome.status !== 'calculated') {
        records.push({ profileKey, ...outcome });
        if (outcome.status === 'unavailableUnderPolicy')
          unavailable.push({
            conditionKey: key,
            profileKey,
            reason: outcome.reason,
            diagnostics: outcome.diagnostics,
          });
        continue;
      }

      const { detail } = outcome;
      const calculator = calculateScenarioWithPolicy(
        detail.scenario,
        master,
        versions,
        detail.contributionPolicy,
      );
      const portable = executePortableCalculation(
        createRankingPortableRequest(detail, currentCalculationVersionContext(master)),
        master,
      );
      const executions = [
        ['calculator', calculator],
        ['portable', portable.status === 'executed' ? portable.execution : null],
      ] as const;
      let matched = true;
      for (const [path, execution] of executions) {
        const actualStatus =
          execution?.status ?? (path === 'portable' ? portable.status : 'missing');
        const comparable =
          execution?.status === 'executable'
            ? {
                scenario: execution.scenario,
                input: execution.input,
                result: execution.result,
                effects: execution.effects,
                effectInputs: execution.effectInputs,
                warnings: execution.effectWarnings,
                appliedPreparationActions: productionParityActions(
                  execution.appliedPreparationActions,
                ),
              }
            : null;
        const expected = {
          scenario: detail.scenario,
          input: detail.input,
          result: detail.result,
          effects: detail.effects,
          effectInputs: detail.effectInputs,
          warnings: detail.warnings,
          appliedPreparationActions: productionParityActions(detail.appliedPreparationActions),
        };
        const failure = compareProductionParity({
          conditionKey: key,
          profileKey,
          path,
          actualStatus,
          expected,
          actual: comparable,
        });
        if (failure) {
          localFailures.push(failure);
          parityFailures.push(failure);
          matched = false;
        }
      }
      if (matched) {
        localParityCount += 1;
        parityCount += 1;
      }
      records.push({
        profileKey,
        status: outcome.status,
        basis: detail.basis,
        rankingPolicy: detail.rankingPolicy,
        attackProfile: detail.attackProfile,
        scenario: detail.scenario,
        witness: detail.candidateEvidence,
        canonicalInput: detail.input,
        damageRows: detail.result.rows,
        appliedPreparationActions: compactPreparationActions(detail.appliedPreparationActions),
        effects: detail.effects.map(({ projectionKey, outcome, explanation }) => ({
          projectionKey,
          outcome,
          explanationCode: explanation.code,
        })),
        effectInputs: detail.effectInputs,
        warnings: detail.warnings,
        outcome: compactCalculatedResult(detail.result),
        areaContribution: detail.areaContribution
          ? {
              scenario: detail.areaContribution.withoutAreaScenario,
              input: detail.areaContribution.withoutAreaInput,
              result:
                detail.areaContribution.withoutAreaResult.status === 'calculated'
                  ? compactCalculatedResult(detail.areaContribution.withoutAreaResult)
                  : detail.areaContribution.withoutAreaResult,
              effects: detail.areaContribution.withoutAreaEffects.map(
                ({ projectionKey, outcome, explanation }) => ({
                  projectionKey,
                  outcome,
                  explanationCode: explanation.code,
                }),
              ),
              warnings: detail.areaContribution.warnings,
            }
          : null,
      });
    }

    const acceptedRecords = acceptedProductionAuditValue(records, `production:${key}`) as unknown[];
    const summary: Omit<ProductionClosureConditionRecord, 'records'> = {
      key,
      conditions,
      elapsedMs,
      ...localOutcomes,
      parityCount: localParityCount,
      parityFailures: localFailures,
      damageCache: result.damageCache,
      candidateInventory: result.candidateInventory,
      digest: productionClosureRecordDigest(acceptedRecords),
    };
    const record: ProductionClosureConditionRecord = { ...summary, records: acceptedRecords };
    await observe?.(record);
    summaries.push(summary);
  }

  const conditionCount = summaries.length;
  const outcomeCount = Object.values(outcomes).reduce((sum, count) => sum + count, 0);
  const result = {
    conditionCount,
    attackProfileCount: attackProfileCount ?? 0,
    outcomeCount,
    outcomes,
    parityCount,
    parityFailures,
    unavailable,
    conditionSummaries: summaries,
    eligibility: eligibility.finalize(),
  };
  return { ...result, digest: productionClosureMatrixDigest(result) };
}
