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
  profileKey: string;
  path: 'calculator' | 'portable';
  mismatch: string;
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

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function compactPreparationActions(
  actions: ReturnType<typeof calculateScenarioWithPolicy>['appliedPreparationActions'],
) {
  return actions.map((action) => ({
    command: action.command,
    actorFormId: action.actorFormId,
    sourceKind: action.sourceKind,
    sourceId: action.sourceId,
    selectedEffects: action.selectedEffects.map(({ occurrenceId, stochasticOutcome }) => ({
      occurrenceId,
      stochasticOutcome,
    })),
    activationFacts: action.activationFacts,
    transition: action.transition,
    resourceBefore: action.resourceBefore,
    resourceAfter: action.resourceAfter,
    hpBefore: action.hpBefore,
    hpAfter: action.hpAfter,
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

function firstMismatch(left: unknown, right: unknown, path = '$'): string | null {
  if (Object.is(left, right)) return null;
  if (typeof left !== typeof right || left === null || right === null) return `${path}:value`;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return `${path}:type`;
    if (left.length !== right.length) return `${path}:length`;
    for (let index = 0; index < left.length; index++) {
      const mismatch = firstMismatch(left[index], right[index], `${path}[${String(index)}]`);
      if (mismatch) return mismatch;
    }
    return null;
  }
  if (typeof left !== 'object') return `${path}:value`;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])].sort();
  for (const key of keys) {
    if (!(key in leftRecord) || !(key in rightRecord)) return `${path}.${key}:missing`;
    const mismatch = firstMismatch(leftRecord[key], rightRecord[key], `${path}.${key}`);
    if (mismatch) return mismatch;
  }
  return null;
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

  for (const conditions of selectedConditions) {
    const key = productionClosureConditionKey(conditions);
    const startedAt = performance.now();
    const result = calculateRankingPolicy(master, profile, conditions, versions);
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
        if (execution?.status !== 'executable') {
          const failure = {
            profileKey,
            path,
            mismatch: `status:${execution?.status ?? portable.status}`,
          };
          localFailures.push(failure);
          parityFailures.push(failure);
          matched = false;
          continue;
        }
        const comparable = {
          scenario: execution.scenario,
          input: execution.input,
          result: execution.result,
          effects: execution.effects,
          effectInputs: execution.effectInputs,
          warnings: execution.effectWarnings,
          appliedPreparationActions: execution.appliedPreparationActions,
        };
        const expected = {
          scenario: detail.scenario,
          input: detail.input,
          result: detail.result,
          effects: detail.effects,
          effectInputs: detail.effectInputs,
          warnings: detail.warnings,
          appliedPreparationActions: detail.appliedPreparationActions,
        };
        const mismatch = firstMismatch(comparable, expected);
        if (mismatch) {
          const failure = { profileKey, path, mismatch };
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

    const summary: Omit<ProductionClosureConditionRecord, 'records'> = {
      key,
      conditions,
      elapsedMs,
      ...localOutcomes,
      parityCount: localParityCount,
      parityFailures: localFailures,
      damageCache: result.damageCache,
      candidateInventory: result.candidateInventory,
      digest: digest(records),
    };
    const record: ProductionClosureConditionRecord = { ...summary, records };
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
  };
  return { ...result, digest: digest(result) };
}
