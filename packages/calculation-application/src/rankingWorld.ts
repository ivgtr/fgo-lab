import type { ResolvedScenario } from './rankingPolicy';
import { applyTargetContextCommand } from './targetContext';
import {
  MAX_RANKING_WORLD_CANDIDATES,
  type RankingTraitFact,
  type RankingWorldCandidate,
} from './rankingWorldDomain';

export { MAX_RANKING_WORLD_CANDIDATES, type RankingTraitFact, type RankingWorldCandidate };

export function materializeRankingWorld(
  scenario: ResolvedScenario,
  candidate: RankingWorldCandidate,
): ResolvedScenario {
  let targetContext = applyTargetContextCommand(scenario.targetContext, {
    kind: 'setConcreteClass',
    classId: candidate.classId,
  });
  targetContext = applyTargetContextCommand(targetContext, {
    kind: 'setConcreteAttribute',
    attribute: candidate.attribute,
  });
  for (const familyId of candidate.familyIds)
    targetContext = applyTargetContextCommand(targetContext, {
      kind: 'setFamily',
      familyId,
      enabled: true,
    });
  return {
    ...scenario,
    targetContext,
    worldFactAssertions: [
      ...scenario.worldFactAssertions.filter(
        ({ decisionKey }) =>
          !decisionKey.startsWith('ranking:target:') &&
          !decisionKey.startsWith('ranking:targetState:'),
      ),
      ...candidate.traitFacts.map(({ scope, trait, present }) => ({
        decisionKey: `ranking:${scope}:${trait}`,
        fact: { kind: 'trait' as const, scope, trait, present },
      })),
    ],
  };
}
