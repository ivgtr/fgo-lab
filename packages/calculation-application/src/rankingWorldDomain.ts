import {
  servantAttribute,
  targetAttributeCandidates,
  targetClassCandidates,
} from '@fgo-lab/calc-core';
import {
  canonicalExclusiveGroup,
  targetConditionWitnessSpace,
  type ConditionExpression,
} from '@fgo-lab/battle-execution';
import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import type {
  CanonicalTargetAttribute,
  CanonicalTargetClassId,
  CanonicalTargetFamilyId,
} from '@fgo-lab/schema';
import { finiteSemanticProduct } from './finiteSemanticProduct';
import type { ResolvedScenario } from './rankingPolicy';

export const MAX_RANKING_WORLD_CANDIDATES = 4_096;
const MAX_RANKING_WORLD_PHYSICAL_STATES = 65_536;

export type RankingTraitFact =
  | { scope: 'target'; trait: string; present: boolean }
  | { scope: 'targetState'; trait: string; present: boolean };

export interface RankingWorldCandidate {
  key: string;
  classId: CanonicalTargetClassId;
  attribute: CanonicalTargetAttribute;
  familyIds: readonly CanonicalTargetFamilyId[];
  selections: Readonly<Record<string, string>>;
  traitFacts: readonly RankingTraitFact[];
}

function traitFactCandidates(
  traits: readonly Omit<RankingTraitFact, 'present'>[],
): readonly RankingTraitFact[][] {
  const byDimension = new Map<string, Omit<RankingTraitFact, 'present'>[]>();
  for (const fact of traits) {
    const exclusiveGroup = canonicalExclusiveGroup(fact.scope, fact.trait);
    const key = exclusiveGroup
      ? `exclusive:target:${exclusiveGroup}`
      : `trait:${fact.scope}:${fact.trait}`;
    byDimension.set(key, [...(byDimension.get(key) ?? []), fact]);
  }
  return finiteSemanticProduct(
    [...byDimension].map(([key, facts]) => {
      const unique = [
        ...new Map(facts.map((fact) => [`${fact.scope}:${fact.trait}`, fact])).values(),
      ];
      if (!key.startsWith('exclusive:'))
        return { key, values: [false, true].map((present) => [{ ...unique[0]!, present }]) };
      const traitsInGroup = [...new Set(unique.map(({ trait }) => trait))];
      const absent = unique.map((fact) => ({ ...fact, present: false }));
      const choices = traitsInGroup.flatMap((selectedTrait) => {
        const selectedFacts = unique.filter(({ trait }) => trait === selectedTrait);
        return Array.from({ length: 2 ** selectedFacts.length - 1 }, (_, index) => index + 1).map(
          (mask) =>
            unique.map((fact) => ({
              ...fact,
              present:
                fact.trait === selectedTrait && (mask & (1 << selectedFacts.indexOf(fact))) !== 0,
            })),
        );
      });
      return { key, values: [absent, ...choices] };
    }),
    MAX_RANKING_WORLD_PHYSICAL_STATES,
    'ranking_world_physical_state_limit',
  ).candidates.map((candidate) => Object.values(candidate).flat());
}

/** Enumerates physical target facts only. It intentionally does not evaluate conditions. */
export function enumerateRankingWorldDomain(input: {
  servant: ServantMaster;
  master: MasterDataSnapshot;
  scenario: ResolvedScenario;
  conditions: readonly (ConditionExpression | null)[];
  ownedTraitFacts?: ReadonlySet<string>;
  canonicalCombinedState?: { transitionTraits: ReadonlySet<string> };
}): RankingWorldCandidate[] {
  const { servant, master, scenario, conditions } = input;
  const witnessSpaces = conditions.map(targetConditionWitnessSpace);
  const predicates = [
    ...new Map(
      witnessSpaces.flatMap(({ predicates: values }) =>
        values.map((predicate) => [JSON.stringify(predicate), predicate] as const),
      ),
    ).values(),
  ];
  const referencedClasses = new Set(
    predicates.flatMap((predicate) =>
      predicate.kind === 'classIdentity' ? [predicate.classId] : [],
    ),
  );
  const referencedAttributes = new Set(
    predicates.flatMap((predicate) =>
      predicate.kind === 'attributeIdentity' ? [predicate.attribute] : [],
    ),
  );
  const referencedFamilyIds = [
    ...new Set(
      predicates.flatMap((predicate) =>
        predicate.kind === 'familyMembership' ? [predicate.familyId] : [],
      ),
    ),
  ].sort();
  const familyCandidates = finiteSemanticProduct(
    referencedFamilyIds.map((familyId) => ({ key: familyId, values: [false, true] })),
    MAX_RANKING_WORLD_CANDIDATES,
    'ranking_world_candidate_limit',
  ).candidates.map((candidate) => referencedFamilyIds.filter((familyId) => candidate[familyId]));
  const ownedTraitFacts = input.ownedTraitFacts ?? new Set<string>();
  const explicitTargetStateTraits = new Set<string>();
  const collectExplicitTargetState = (condition: ConditionExpression | null): void => {
    if (!condition) return;
    if (condition.kind === 'all' || condition.kind === 'any') {
      condition.expressions.forEach(collectExplicitTargetState);
      return;
    }
    if (condition.kind === 'not') {
      collectExplicitTargetState(condition.expression);
      return;
    }
    if (
      (condition.kind === 'trait' || condition.kind === 'traitCount') &&
      condition.scope === 'targetState'
    )
      for (const trait of condition.kind === 'trait' ? [condition.trait] : condition.traits)
        explicitTargetStateTraits.add(trait);
  };
  conditions.forEach(collectExplicitTargetState);
  const targetTraits = [
    ...new Map(
      witnessSpaces
        .flatMap(({ traitFacts }) => traitFacts)
        .filter((fact) => !ownedTraitFacts.has(`${fact.scope}:${fact.trait}`))
        .filter(
          (fact) =>
            !input.canonicalCombinedState ||
            fact.scope !== 'targetState' ||
            explicitTargetStateTraits.has(fact.trait) ||
            input.canonicalCombinedState.transitionTraits.has(fact.trait),
        )
        .map((fact) => [`${fact.scope}:${fact.trait}`, fact]),
    ).values(),
  ].sort((left, right) =>
    `${left.scope}:${left.trait}`.localeCompare(`${right.scope}:${right.trait}`),
  );
  const relationClasses = targetClassCandidates(
    servant.classId,
    scenario.targetContext.class,
  ).filter((classId) => master.targetSemantics.execution.classIdentities.includes(classId));
  const neutralAttributes = targetAttributeCandidates(
    servantAttribute(servant.traits),
    scenario.targetContext.attribute,
  ).filter((attribute) => master.targetSemantics.execution.attributeIdentities.includes(attribute));
  const classes = [
    ...new Set([
      ...relationClasses.slice(0, 1),
      ...relationClasses.filter((classId) => referencedClasses.has(classId)),
      ...[...referencedClasses].filter((classId) =>
        master.targetSemantics.execution.classIdentities.includes(classId),
      ),
      ...(referencedClasses.size > 0 &&
      relationClasses.slice(0, 1).every((classId) => referencedClasses.has(classId))
        ? master.targetSemantics.execution.classIdentities
            .filter((classId) => !referencedClasses.has(classId))
            .slice(0, 1)
        : []),
    ]),
  ];
  const attributes = [
    ...new Set([
      ...neutralAttributes.slice(0, 1),
      ...[...referencedAttributes].filter((attribute) =>
        master.targetSemantics.execution.attributeIdentities.includes(attribute),
      ),
      ...(referencedAttributes.size > 0 &&
      neutralAttributes.slice(0, 1).every((attribute) => referencedAttributes.has(attribute))
        ? master.targetSemantics.execution.attributeIdentities
            .filter((attribute) => !referencedAttributes.has(attribute))
            .slice(0, 1)
        : []),
    ]),
  ];
  const selections = [{}] as const;
  const traitFacts = traitFactCandidates(targetTraits);
  const candidateCount =
    classes.length *
    attributes.length *
    familyCandidates.length *
    selections.length *
    traitFacts.length;
  if (candidateCount > MAX_RANKING_WORLD_PHYSICAL_STATES)
    throw new RangeError(`ranking_world_physical_state_limit:${String(candidateCount)}`);
  return classes.flatMap((classId) =>
    attributes.flatMap((attribute) =>
      familyCandidates.flatMap((familyIds) =>
        selections.flatMap((selected) =>
          traitFacts.map((facts) => {
            const canonicalFacts = [
              ...facts,
              ...(input.canonicalCombinedState
                ? facts.flatMap((fact) =>
                    fact.scope === 'target' &&
                    !explicitTargetStateTraits.has(fact.trait) &&
                    !input.canonicalCombinedState!.transitionTraits.has(fact.trait) &&
                    !ownedTraitFacts.has(`targetState:${fact.trait}`)
                      ? [{ scope: 'targetState' as const, trait: fact.trait, present: false }]
                      : [],
                  )
                : []),
            ].sort((left, right) =>
              `${left.scope}:${left.trait}`.localeCompare(`${right.scope}:${right.trait}`),
            );
            return {
              key: JSON.stringify({
                classId,
                attribute,
                familyIds,
                selected,
                facts: canonicalFacts,
              }),
              classId,
              attribute,
              familyIds,
              selections: selected,
              traitFacts: canonicalFacts,
            };
          }),
        ),
      ),
    ),
  );
}
