import { canonicalExclusiveGroup } from '@fgo-lab/battle-execution';
import type { EffectControlViewModel } from './effectControls';
import { fieldTraitsRequiredByCondition } from './conditionProvenance';
import { contributesToAttackerDamage } from './rankingContribution';
import type { ResolvedScenario } from './rankingPolicy';
import { finiteSemanticProduct } from './finiteSemanticProduct';
import type { ConditionExpression } from '@fgo-lab/battle-execution';

export const MAX_RANKING_FIELD_CANDIDATES = 4_096;

export interface RankingFieldCandidate {
  key: string;
  facts: readonly { trait: string; present: boolean }[];
}

function hasExclusiveConflict(facts: RankingFieldCandidate['facts']): boolean {
  const groups = new Set<string>();
  for (const { trait, present } of facts) {
    if (!present) continue;
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
  if (!active) return [{ key: 'field:none', facts: [] }];
  if (relevantTraits.length === 0) return [{ key: 'field:none', facts: [] }];
  const product = finiteSemanticProduct(
    relevantTraits.map((trait) => ({ key: trait, values: [false, true] })),
    MAX_RANKING_FIELD_CANDIDATES + 1,
    'ranking_field_candidate_limit',
  );
  return Array.from(product.candidates)
    .map((candidate) => ({
      facts: relevantTraits.map((trait) => ({ trait, present: candidate[trait] ?? false })),
    }))
    .filter(({ facts }) => !hasExclusiveConflict(facts))
    .map(({ facts }) => ({ key: `field:${JSON.stringify(facts)}`, facts }));
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

export function createRankingFieldCandidatesForConditions(
  conditions: readonly (ConditionExpression | null)[],
  active: boolean,
): readonly RankingFieldCandidate[] {
  const relevantTraits = [...new Set(conditions.flatMap(fieldTraitsRequiredByCondition))];
  relevantTraits.sort();
  return createRankingFieldFactCandidates(relevantTraits, active);
}

export function materializeRankingField(
  scenario: ResolvedScenario,
  candidate: RankingFieldCandidate,
  assertAbsentFacts: boolean = false,
): ResolvedScenario {
  if (
    candidate.facts.length === 0 &&
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
      ...(assertAbsentFacts
        ? candidate.facts
        : candidate.facts.filter(({ present }) => present)
      ).map(({ trait, present }) => ({
        decisionKey: `ranking:field:${trait}`,
        fact: { kind: 'trait' as const, scope: 'field' as const, trait, present },
      })),
    ],
  };
}
