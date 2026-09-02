import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import type {
  RankingPolicyConditions,
  RankingPolicyDetail,
  RankingPolicyExclusion,
  RankingProfileInput,
  RankingProfileResult,
  RankingRowSummary,
} from './rankingContracts';

export function includedRankingServants(
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: Pick<RankingPolicyConditions, 'comparisonMode'>,
): ServantMaster[] {
  return master.servants.filter((servant) => {
    const hasAttackProfile = servant.noblePhantasmVariantGroups.some(({ variants }) =>
      variants.some(({ kind }) => kind === 'attack'),
    );
    if (!hasAttackProfile) return false;
    if (conditions.comparisonMode === 'standard') return true;
    return (profile.servantBuilds[servant.id]?.npLevel ?? 0) > 0;
  });
}

export function createRankingRow(
  servant: ServantMaster,
  detail: RankingPolicyDetail,
  profile: RankingProfileInput,
): RankingRowSummary {
  const selected = detail.result.rows[detail.scenario.attacker.npLevel - 1];
  if (!selected) throw new RangeError(`ranking_np_row_missing:${servant.id}`);
  const applied = detail.effectiveContributions.contributions.filter(
    (contribution) => contribution.effective && contribution.presentationCounted,
  );
  const supportEffects = applied.filter((contribution) => contribution.source.origin === 'support');
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
    attackProfile: detail.attackProfile,
    minimum: selected.minimum,
    average: selected.average,
    maximum: selected.maximum,
    precision: detail.result.precision,
    appliedEffectCount: new Set(applied.map((effect) => effect.presentationGroupId)).size,
    supportEffectCount: new Set(supportEffects.map((effect) => effect.presentationGroupId)).size,
    supportSourceCount: new Set(supportEffects.map((effect) => effect.source.sourceInstanceId))
      .size,
    specialDamageApplied: applied.some(
      (effect) => effect.modifier === 'powerMod' || effect.modifier === 'npSpecial',
    ),
    level: detail.scenario.attacker.level,
    npLevel: detail.scenario.attacker.npLevel,
    owned: (profile.servantBuilds[servant.id]?.npLevel ?? 0) > 0,
  };
}

export function createRankingPolicyExclusion(
  servant: ServantMaster,
  entryId: string,
  result: Exclude<RankingProfileResult, { status: 'calculated' }>,
): RankingPolicyExclusion {
  return {
    entryId,
    servantId: servant.id,
    name: servant.name,
    status: result.status,
    reason:
      result.status === 'inputRequired'
        ? `inputRequired:${result.inputs.map(({ key }) => key).join(',')}`
        : result.reason,
    issues:
      result.status === 'invalid' ||
      result.status === 'unsupported' ||
      result.status === 'inputRequired'
        ? result.issues
        : [],
  };
}
