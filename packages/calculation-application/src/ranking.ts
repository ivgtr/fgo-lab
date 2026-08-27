import {
  getPrimaryNoblePhantasm,
  getPrimaryNpDamage,
  getPrimaryNpPresentation,
  type MasterDataSnapshot,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { CalculationResult, VersionContext } from '@fgo-lab/schema';
import type {
  RankingCalculation,
  RankingConditions,
  RankingDetail,
  RankingFailure,
  RankingProfileInput,
  RankingRowSummary,
  RankingSummary,
} from './rankingContracts';
import { createRankingScenarioFromPolicy } from './rankingScenario';
import { calculateScenario } from './scenario';

export * from './rankingContracts';

export function createRankingScenario(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
) {
  return createRankingScenarioFromPolicy(servant, master, profile, conditions, versions);
}

function resultFailure(servant: ServantMaster, result: CalculationResult): RankingFailure {
  if (result.status === 'inputRequired')
    return {
      servantId: servant.id,
      name: servant.name,
      status: 'inputRequired',
      reason: result.requiredInputs.map((input) => input.label).join('、') || '入力が必要です',
    };
  if (result.status === 'calculated')
    throw new TypeError(`ranking_calculated_result_is_not_failure:${servant.id}`);
  return {
    servantId: servant.id,
    name: servant.name,
    status: 'unsupported',
    reason:
      result.issues.map((issue) => issue.code).join('、') ||
      result.missingEvidence.join('、') ||
      '正確に計算できません',
  };
}

function includedRankingServants(
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
): ServantMaster[] {
  return master.servants.filter((servant) => {
    if (!getPrimaryNoblePhantasm(servant) || !getPrimaryNpDamage(servant)) return false;
    if (conditions.comparisonMode === 'standard') return true;
    return (profile.servantBuilds[servant.id]?.npLevel ?? 0) > 0;
  });
}

export function calculateRankingDetail(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
): RankingDetail {
  const scenario = createRankingScenario(servant, master, profile, conditions, versions);
  const execution = calculateScenario(scenario, master, versions);
  return {
    servantId: servant.id,
    scenario,
    input: execution.input,
    result: execution.result,
    effects: execution.effects,
    effectInputs: execution.effectInputs,
    warnings: execution.effectWarnings,
  };
}

function rankingRow(
  servant: ServantMaster,
  detail: RankingDetail,
  profile: RankingProfileInput,
): RankingRowSummary | RankingFailure {
  if (detail.result.status !== 'calculated') return resultFailure(servant, detail.result);
  const presentation = getPrimaryNpPresentation(servant);
  if (!presentation) throw new TypeError(`ranking_np_presentation_missing:${servant.id}`);
  const selected = detail.result.rows[detail.scenario.attacker.npLevel - 1];
  if (!selected) throw new RangeError(`ranking_np_row_missing:${servant.id}`);
  const applied = detail.effects.filter(
    (effect) => effect.visibility === 'visible' && effect.outcome === 'applied',
  );
  const supportEffects = applied.filter((effect) => effect.source.origin === 'support');
  return {
    servantId: servant.id,
    name: servant.name,
    imageKey: servant.imageKey,
    classId: servant.classId,
    rarity: servant.rarity,
    npCard: presentation.card,
    npTarget: presentation.target,
    minimum: selected.minimum,
    average: selected.average,
    maximum: selected.maximum,
    precision: detail.result.precision,
    appliedEffectCount: new Set(applied.map((effect) => effect.projectionKey)).size,
    supportEffectCount: new Set(supportEffects.map((effect) => effect.projectionKey)).size,
    supportSourceCount: new Set(supportEffects.map((effect) => effect.source.sourceInstanceId))
      .size,
    specialAttackApplied: applied.some(
      (effect) => effect.modifier === 'powerMod' || effect.modifier === 'npSpecial',
    ),
    level: detail.scenario.attacker.level,
    npLevel: detail.scenario.attacker.npLevel,
    owned: (profile.servantBuilds[servant.id]?.npLevel ?? 0) > 0,
  };
}

function calculateRows(
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
  includeDetails: boolean,
): RankingCalculation {
  const rows: RankingRowSummary[] = [];
  const failures: RankingFailure[] = [];
  const details: Record<string, RankingDetail> = {};
  for (const servant of includedRankingServants(master, profile, conditions)) {
    const detail = calculateRankingDetail(servant, master, profile, conditions, versions);
    if (includeDetails) details[servant.id] = detail;
    const candidate = rankingRow(servant, detail, profile);
    if ('status' in candidate) failures.push(candidate);
    else rows.push(candidate);
  }
  return { rows, failures, details };
}

export function calculateRankingSummary(
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
): RankingSummary {
  const { rows, failures } = calculateRows(master, profile, conditions, versions, false);
  return { rows, failures };
}

export function calculateRanking(
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
): RankingCalculation {
  return calculateRows(master, profile, conditions, versions, true);
}
