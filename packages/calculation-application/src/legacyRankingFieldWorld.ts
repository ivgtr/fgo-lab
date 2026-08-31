import { canonicalExclusiveGroup } from '@fgo-lab/battle-execution';
import type { EffectControlViewModel } from './effectControls';
import { fieldTraitsRequiredByCondition } from './conditionProvenance';
import { contributesToAttackerDamage } from './rankingContribution';
import type { ResolvedScenario } from './rankingPolicy';

export const MAX_RANKING_FIELD_CANDIDATES = 4_096;

export interface RankingFieldCandidate {
  key: string;
  traits: readonly string[];
}

function hasExclusiveConflict(traits: readonly string[]): boolean {
  const groups = new Set<string>();
  for (const trait of traits) {
    const group = canonicalExclusiveGroup('field', trait);
    if (group === null) continue;
    if (groups.has(group)) return true;
    groups.add(group);
  }
  return false;
}

export function createRankingFieldFactCandidates(
  relevantTraits: readonly string[],
  active: boolean,
): readonly RankingFieldCandidate[] {
  if (!active) return [{ key: 'field:none', traits: [] }];
  if (relevantTraits.length === 0) return [{ key: 'field:none', traits: [] }];
  if (2 ** relevantTraits.length - 1 > MAX_RANKING_FIELD_CANDIDATES)
    throw new RangeError(`ranking_field_candidate_limit:${String(relevantTraits.length)}`);
  let candidates: string[][] = [[]];
  for (const trait of relevantTraits)
    candidates = candidates.flatMap((candidate) => [candidate, [...candidate, trait]]);
  return candidates
    .filter((candidate) => candidate.length > 0 && !hasExclusiveConflict(candidate))
    .map((traits) => ({ key: `field:${traits.join(',')}`, traits }));
}

export function createRankingFieldCandidates(
  controls: readonly EffectControlViewModel[],
  active: boolean,
): readonly RankingFieldCandidate[] {
  const relevantTraits = [
    ...new Set(
      controls.flatMap((control) =>
        contributesToAttackerDamage(control.projection)
          ? fieldTraitsRequiredByCondition(control.projection.explanation.condition)
          : [],
      ),
    ),
  ].sort();
  return createRankingFieldFactCandidates(relevantTraits, active);
}

export function materializeRankingField(
  scenario: ResolvedScenario,
  candidate: RankingFieldCandidate,
): ResolvedScenario {
  if (
    candidate.traits.length === 0 &&
    !scenario.worldFactAssertions.some(({ decisionKey }) =>
      decisionKey.startsWith('ranking:field:'),
    )
  )
    return scenario;
  return {
    ...scenario,
    worldFactAssertions: [
      ...scenario.worldFactAssertions.filter(
        ({ decisionKey }) => !decisionKey.startsWith('ranking:field:'),
      ),
      ...candidate.traits.map((trait) => ({
        decisionKey: `ranking:field:${trait}`,
        fact: { kind: 'trait' as const, scope: 'field' as const, trait, present: true },
      })),
    ],
  };
}
