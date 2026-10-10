import { isOwned } from '@fgo-lab/profile-domain';
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
  conditions: Pick<RankingPolicyConditions, 'population'>,
): ServantMaster[] {
  return master.servants.filter((servant) => {
    const hasAttackProfile = servant.noblePhantasmVariantGroups.some(({ variants }) =>
      variants.some(({ kind }) => kind === 'attack'),
    );
    if (!hasAttackProfile) return false;
    if (conditions.population === 'all') return true;
    return isOwned(profile.servantBuilds[servant.id]);
  });
}

export type RankingRowSource = Pick<
  RankingPolicyDetail,
  | 'entryId'
  | 'attackProfile'
  | 'noblePhantasmVariant'
  | 'noblePhantasmName'
  | 'npCard'
  | 'npTarget'
  | 'scenario'
  | 'result'
  | 'effectiveContributions'
>;

export function createRankingRow(
  servant: ServantMaster,
  detail: RankingRowSource,
  profile: RankingProfileInput,
): RankingRowSummary {
  const selected = detail.result.rows[detail.scenario.attacker.npLevel - 1];
  if (!selected) throw new RangeError(`ranking_np_row_missing:${servant.id}`);
  const groups = new Set<string>();
  const supportGroups = new Set<string>();
  const supportSources = new Set<string>();
  let specialDamageApplied = false;
  for (const effect of detail.effectiveContributions.contributions) {
    if (!effect.effective || !effect.presentationCounted) continue;
    groups.add(effect.presentationGroupId);
    if (effect.source.origin === 'support') {
      supportGroups.add(effect.presentationGroupId);
      supportSources.add(effect.source.sourceInstanceId);
    }
    if (effect.modifier === 'powerMod' || effect.modifier === 'npSpecial')
      specialDamageApplied = true;
  }
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
    appliedEffectCount: groups.size,
    supportEffectCount: supportGroups.size,
    supportSourceCount: supportSources.size,
    specialDamageApplied,
    level: detail.scenario.attacker.level,
    npLevel: detail.scenario.attacker.npLevel,
    owned: isOwned(profile.servantBuilds[servant.id]),
  };
}

export function createRankingPolicyExclusion(
  servant: ServantMaster,
  entryId: string,
  result: Exclude<RankingProfileResult, { status: 'calculated' }>,
): RankingPolicyExclusion {
  const recovery: RankingPolicyExclusion['recovery'] =
    result.status === 'inputRequired'
      ? { kind: 'openCalculator' }
      : result.status === 'invalid'
        ? result.reason === 'rankingBuildIncomplete'
          ? { kind: 'editSavedBuild' }
          : result.reason === 'rankingSelectionInvalid'
            ? { kind: 'resetRankingConditions' }
            : { kind: 'reload' }
        : { kind: 'none' };
  return {
    entryId,
    servantId: servant.id,
    name: servant.name,
    attackProfile: result.attackProfile,
    status: result.status,
    reason:
      result.status === 'inputRequired'
        ? `inputRequired:${result.inputs.map(({ key }) => key).join(',')}`
        : result.reason,
    requiredInputs: result.status === 'inputRequired' ? result.inputs : [],
    recovery,
    issues:
      result.status === 'invalid' ||
      result.status === 'unsupported' ||
      result.status === 'inputRequired'
        ? result.issues
        : [],
  };
}
