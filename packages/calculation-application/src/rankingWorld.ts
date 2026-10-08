import type { ResolvedScenario } from './rankingPolicy';
import type { CanonicalTargetFamilyId } from '@fgo-lab/schema';
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
  referencedFamilyIds: readonly CanonicalTargetFamilyId[],
): ResolvedScenario {
  let targetContext = applyTargetContextCommand(scenario.targetContext, {
    kind: 'setConcreteClass',
    classId: candidate.classId,
  });
  targetContext = applyTargetContextCommand(targetContext, {
    kind: 'setConcreteAttribute',
    attribute: candidate.attribute,
  });
  for (const familyId of referencedFamilyIds)
    targetContext = applyTargetContextCommand(
      targetContext,
      candidate.familyIds.includes(familyId)
        ? { kind: 'setFamily', familyId, enabled: true }
        : { kind: 'setFamilyAbsent', familyId, absent: true },
    );
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
