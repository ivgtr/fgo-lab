import {
  getSelectableNoblePhantasmVariants,
  type MasterDataSnapshot,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { CalculationResult } from '@fgo-lab/schema';
import type {
  RankingConditions,
  RankingDetail,
  RankingFailure,
  RankingProfileInput,
  RankingRowSummary,
} from './rankingContracts';

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

export function includedRankingServants(
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
): ServantMaster[] {
  return master.servants.filter((servant) => {
    if (!getSelectableNoblePhantasmVariants(servant).some((variant) => variant.kind === 'attack'))
      return false;
    if (conditions.comparisonMode === 'standard') return true;
    return (profile.servantBuilds[servant.id]?.npLevel ?? 0) > 0;
  });
}

export function createRankingRow(
  servant: ServantMaster,
  detail: RankingDetail,
  profile: RankingProfileInput,
): RankingRowSummary | RankingFailure {
  if (detail.result.status !== 'calculated') return resultFailure(servant, detail.result);
  const selected = detail.result.rows[detail.scenario.attacker.npLevel - 1];
  if (!selected) throw new RangeError(`ranking_np_row_missing:${servant.id}`);
  const applied = detail.effects.filter(
    (effect) => effect.visibility === 'visible' && effect.outcome === 'applied',
  );
  const supportEffects = applied.filter((effect) => effect.source.origin === 'support');
  return {
    entryId: detail.entryId,
    servantId: servant.id,
    name: servant.name,
    imageKey: servant.imageKey,
    classId: servant.classId,
    rarity: servant.rarity,
    npCard: detail.npCard,
    npTarget: detail.npTarget,
    noblePhantasmVariant: detail.noblePhantasmVariant,
    noblePhantasmName: detail.noblePhantasmName,
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
