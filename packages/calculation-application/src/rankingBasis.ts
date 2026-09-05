import {
  rankingSelectionSchema,
  rankingNpLevelSchema,
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
  return parsed.success
    ? { status: 'valid', selection: parsed.data as ValidatedRankingSelection }
    : { status: 'invalid', reason: 'rankingSelectionInvalid', detail: parsed.error.message };
}
export type RankingSelectionCommand =
  | { kind: 'reset' }
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
    case 'setPopulation':
      return compileRankingSelection({
        ...selection,
        population: command.value,
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
      return compileRankingSelection({ ...selection, npLevelBasis: command.value });
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
  const build = profile.servantBuilds[servant.id];
  if (selection.population === 'owned' && !isOwned(build))
    throw new TypeError('rankingServantOutsidePopulation');
  const level =
    selection.levelBasis === 'naturalLimit'
      ? naturalServantLevel(servant.rarity)
      : selection.levelBasis === 'uniformLevel90'
        ? 90
        : build!.level;
  const npLevel = rankingNpLevelSchema.parse(
    selection.npLevelBasis.kind === 'specified' ? selection.npLevelBasis.npLevel : build!.npLevel,
  );
  return {
    servantId: servant.id,
    level,
    npLevel,
    levelSource: selection.levelBasis,
    npSource: selection.npLevelBasis.kind,
  };
}
