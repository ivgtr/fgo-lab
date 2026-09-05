import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type {
  RankingConditionalEffects,
  RankingPolicyConditions,
  RankingSelfBuffs,
} from './rankingContracts';

export interface RankingComparisonPolicy {
  key: string;
  commands: readonly [RankingComparisonPolicyCommand, RankingComparisonPolicyCommand];
  selfContribution: 'includeVoluntarySkillModifiers' | 'excludeVoluntarySkillModifiers';
  conditionalContribution: 'baselineOnly' | 'satisfiedCandidates';
  stochasticInput: 'minimum' | 'maximum';
  startNpGaugeCandidates: readonly number[];
}

export type RankingComparisonPolicyCommand =
  | {
      kind: 'setVoluntarySelfContribution';
      mode: 'include' | 'exclude';
    }
  | {
      kind: 'setConditionalContribution';
      mode: 'baseline' | 'satisfied';
    };

export function rankingPolicyKey(
  selfBuffs: RankingSelfBuffs,
  conditionalEffects: RankingConditionalEffects,
): string {
  return `${selfBuffs}:${conditionalEffects}`;
}

export function compileRankingComparisonPolicy(
  conditions: Pick<RankingPolicyConditions, 'selfBuffs' | 'conditionalEffects'>,
  master: MasterDataSnapshot,
  npLevel: number,
): RankingComparisonPolicy {
  const baseline = master.npResourceSemantics.noblePhantasmUse.requirement;
  const capacity = master.npResourceSemantics.capacityByNpLevel[npLevel - 1]!;
  const satisfiedStartGauges = [
    ...new Set(
      master.npResourceSemantics.capacityByNpLevel
        .slice(0, npLevel)
        .filter((candidate) => candidate >= baseline && candidate <= capacity),
    ),
  ].sort((left, right) => left - right);
  return {
    key: rankingPolicyKey(conditions.selfBuffs, conditions.conditionalEffects),
    commands: [
      {
        kind: 'setVoluntarySelfContribution',
        mode: conditions.selfBuffs === 'included' ? 'include' : 'exclude',
      },
      {
        kind: 'setConditionalContribution',
        mode: conditions.conditionalEffects,
      },
    ],
    selfContribution:
      conditions.selfBuffs === 'included'
        ? 'includeVoluntarySkillModifiers'
        : 'excludeVoluntarySkillModifiers',
    conditionalContribution:
      conditions.conditionalEffects === 'satisfied' ? 'satisfiedCandidates' : 'baselineOnly',
    stochasticInput: conditions.conditionalEffects === 'satisfied' ? 'maximum' : 'minimum',
    startNpGaugeCandidates:
      conditions.conditionalEffects === 'satisfied' ? satisfiedStartGauges : [baseline],
  };
}
