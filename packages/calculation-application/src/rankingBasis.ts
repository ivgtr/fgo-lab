import { initialOcAfterNpLevelChange, initialOcOptions } from './initialOc';
import { DEFAULT_NP_RESOURCE_SEMANTICS } from '@fgo-lab/battle-execution';
import {
  rankingSelectionSchema,
  rankingNpLevelSchema,
  servantBuildSchema,
  rankingSkillLevelsSchema,
  resolvedRankingBasisSchema,
  type RankingSelection,
  type ResolvedRankingBasis,
} from '@fgo-lab/schema';
import { isOwned } from '@fgo-lab/profile-domain';
import { naturalServantLevel, type ServantMaster } from '@fgo-lab/master-data';
import { DEFAULT_RANKING_POLICY_CONDITIONS, type RankingProfileInput } from './rankingContracts';

export type ValidatedRankingSelection = RankingSelection & { readonly validated: unique symbol };
export type RankingSelectionResult =
  | { status: 'valid'; selection: ValidatedRankingSelection }
  | { status: 'invalid'; reason: 'rankingSelectionInvalid'; detail: string };
export function compileRankingSelection(value: unknown): RankingSelectionResult {
  const parsed = rankingSelectionSchema.safeParse(value);
  if (
    parsed.success &&
    parsed.data.npLevelBasis.kind === 'specified' &&
    parsed.data.initialOvercharge *
      DEFAULT_NP_RESOURCE_SEMANTICS.noblePhantasmUse.baseOvercharge.gaugePerStage >
      DEFAULT_NP_RESOURCE_SEMANTICS.capacityByNpLevel[parsed.data.npLevelBasis.npLevel - 1]!
  )
    return {
      status: 'invalid',
      reason: 'rankingSelectionInvalid',
      detail: 'initialOcExceedsNpCapacity',
    };
  return parsed.success
    ? { status: 'valid', selection: parsed.data as ValidatedRankingSelection }
    : { status: 'invalid', reason: 'rankingSelectionInvalid', detail: parsed.error.message };
}
export type RankingSelectionCommand =
  | { kind: 'reset' }
  | { kind: 'setGrowthBasis'; value: RankingSelection['growthBasis'] }
  | { kind: 'setInitialOvercharge'; value: RankingSelection['initialOvercharge'] }
  | { kind: 'setPopulation'; value: RankingSelection['population'] }
  | { kind: 'setLevelBasis'; value: RankingSelection['levelBasis'] }
  | { kind: 'setNpLevelBasis'; value: RankingSelection['npLevelBasis'] }
  | { kind: 'setClassAffinity'; value: RankingSelection['classAffinity'] }
  | { kind: 'setSelfBuffs'; value: RankingSelection['selfBuffs'] }
  | { kind: 'setConditionalEffects'; value: RankingSelection['conditionalEffects'] };
export function applyRankingSelectionCommand(
  selection: RankingSelection,
  command: RankingSelectionCommand,
): RankingSelectionResult {
  switch (command.kind) {
    case 'reset':
      return compileRankingSelection(DEFAULT_RANKING_POLICY_CONDITIONS);
    case 'setGrowthBasis':
      return compileRankingSelection(
        command.value === 'saved'
          ? {
              ...selection,
              growthBasis: 'saved',
              levelBasis: 'ownedLevel',
              npLevelBasis: { kind: 'owned' },
            }
          : { ...selection, growthBasis: 'common' },
      );
    case 'setInitialOvercharge':
      return compileRankingSelection({ ...selection, initialOvercharge: command.value });
    case 'setPopulation':
      return compileRankingSelection({
        ...selection,
        population: command.value,
        growthBasis: command.value === 'all' ? 'common' : selection.growthBasis,
        initialOvercharge:
          command.value === 'all' && selection.npLevelBasis.kind === 'owned'
            ? 1
            : selection.initialOvercharge,
        levelBasis:
          command.value === 'all' && selection.levelBasis === 'ownedLevel'
            ? 'naturalLimit'
            : selection.levelBasis,
        npLevelBasis:
          command.value === 'all' && selection.npLevelBasis.kind === 'owned'
            ? { kind: 'specified', npLevel: 1 }
            : selection.npLevelBasis,
      });
    case 'setLevelBasis':
      return compileRankingSelection({ ...selection, levelBasis: command.value });
    case 'setNpLevelBasis':
      return compileRankingSelection({
        ...selection,
        npLevelBasis: command.value,
        initialOvercharge:
          command.value.kind === 'specified'
            ? initialOcAfterNpLevelChange(
                selection.initialOvercharge,
                DEFAULT_NP_RESOURCE_SEMANTICS,
                command.value.npLevel,
              )
            : selection.initialOvercharge,
      });
    case 'setClassAffinity':
      return compileRankingSelection({ ...selection, classAffinity: command.value });
    case 'setSelfBuffs':
      return compileRankingSelection({ ...selection, selfBuffs: command.value });
    case 'setConditionalEffects':
      return compileRankingSelection({ ...selection, conditionalEffects: command.value });
  }
}
export function resolveRankingBasis(
  servant: ServantMaster,
  profile: RankingProfileInput,
  selection: ValidatedRankingSelection,
): ResolvedRankingBasis {
  const providedBuild = profile.servantBuilds[servant.id];
  const build = providedBuild === undefined ? undefined : servantBuildSchema.parse(providedBuild);
  if (build !== undefined && build.servantId !== servant.id)
    throw new RankingBasisFailure('rankingBuildIdentityMismatch');
  if (selection.population === 'owned' && !isOwned(build))
    throw new RankingBasisFailure('rankingServantOutsidePopulation');
  const level =
    selection.levelBasis === 'naturalLimit'
      ? naturalServantLevel(servant.rarity)
      : selection.levelBasis === 'uniformLevel90'
        ? 90
        : build!.level;
  const npLevel = rankingNpLevelSchema.parse(
    selection.npLevelBasis.kind === 'specified' ? selection.npLevelBasis.npLevel : build!.npLevel,
  );
  const skillSlots = [...new Set(servant.skills.map(({ slot }) => String(slot)))];
  const skillLevels =
    selection.growthBasis === 'saved'
      ? rankingSkillLevelsSchema.parse(build!.skills)
      : Object.fromEntries(skillSlots.map((slot) => [slot, 10]));
  const missingSlots = skillSlots.filter(
    (slot) => skillLevels[slot as '1' | '2' | '3'] === undefined,
  );
  if (!hasCanonicalRankingSkillSlots(servant, skillLevels)) {
    const unexpectedSlots = Object.keys(skillLevels).filter((slot) => !skillSlots.includes(slot));
    throw new RankingBasisFailure(
      'rankingBuildIncomplete',
      missingSlots.length > 0
        ? missingSlots.join(',')
        : `unexpectedSlots:${unexpectedSlots.join(',')}`,
    );
  }
  return resolvedRankingBasisSchema.parse({
    growthBasis: selection.growthBasis,
    fouAtk: selection.growthBasis === 'saved' ? build!.fouAtk : 1000,
    skillLevels,
    servantId: servant.id,
    level,
    npLevel,
    initialOvercharge: selection.initialOvercharge,
    levelSource: selection.levelBasis,
    npSource: selection.npLevelBasis.kind,
  });
}

export function hasCanonicalRankingSkillSlots(
  servant: ServantMaster,
  skillLevels: ResolvedRankingBasis['skillLevels'],
): boolean {
  const canonical = new Set(servant.skills.map(({ slot }) => String(slot)));
  const supplied = Object.keys(skillLevels);
  return supplied.length === canonical.size && supplied.every((slot) => canonical.has(slot));
}

export function rankingInitialOcOptions(selection: RankingSelection): readonly (1 | 2 | 3)[] {
  return initialOcOptions(
    DEFAULT_NP_RESOURCE_SEMANTICS,
    selection.npLevelBasis.kind === 'specified' ? selection.npLevelBasis.npLevel : null,
  );
}

export class RankingBasisFailure extends TypeError {
  constructor(
    readonly reason:
      'rankingBuildIncomplete' | 'rankingBuildIdentityMismatch' | 'rankingServantOutsidePopulation',
    readonly detail = '',
  ) {
    super(reason);
  }
}
