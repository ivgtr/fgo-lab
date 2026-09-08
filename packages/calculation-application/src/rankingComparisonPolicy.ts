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
  initialNpGauge: number;
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
  conditions: Pick<
    RankingPolicyConditions,
    'selfBuffs' | 'conditionalEffects' | 'initialOvercharge'
  >,
  master: MasterDataSnapshot,
): RankingComparisonPolicy {
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
    initialNpGauge:
      conditions.initialOvercharge *
      master.npResourceSemantics.noblePhantasmUse.baseOvercharge.gaugePerStage,
  };
}
