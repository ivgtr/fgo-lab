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
  traitFacts: readonly RankingTraitFact[];
}

function traitFactCandidates(
  traits: readonly Omit<RankingTraitFact, 'present'>[],
): readonly RankingTraitFact[][] {
  type TraitDimension = {
    key: string;
    kind: 'independent' | 'exclusive';
    facts: Omit<RankingTraitFact, 'present'>[];
  };
  const byDimension = new Map<string, TraitDimension>();
  for (const fact of traits) {
    const exclusiveGroup = canonicalExclusiveGroup(fact.scope, fact.trait);
    const kind = exclusiveGroup === null ? 'independent' : 'exclusive';
    const key =
      kind === 'independent'
        ? `trait:${fact.scope}:${fact.trait}`
        : `exclusive:target:${exclusiveGroup}`;
    const dimension = byDimension.get(key) ?? { key, kind, facts: [] };
    dimension.facts.push(fact);
    byDimension.set(key, dimension);
  }
  return finiteSemanticProduct(
    [...byDimension.values()].map(({ key, kind, facts }) => {
      const unique = [
        ...new Map(facts.map((fact) => [`${fact.scope}:${fact.trait}`, fact])).values(),
      ];
      if (kind === 'independent')
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

function collectPredicateReferences(
  witnessSpaces: readonly ReturnType<typeof targetConditionWitnessSpace>[],
) {
  const classes = new Set<CanonicalTargetClassId>();
  const attributes = new Set<CanonicalTargetAttribute>();
  const familyIds = new Set<CanonicalTargetFamilyId>();
  for (const { predicates } of witnessSpaces)
    for (const predicate of predicates) {
      switch (predicate.kind) {
        case 'classIdentity':
          classes.add(predicate.classId);
          break;
        case 'attributeIdentity':
          attributes.add(predicate.attribute);
          break;
        case 'familyMembership':
          familyIds.add(predicate.familyId);
          break;
      }
    }
  return { classes, attributes, familyIds: [...familyIds].sort() };
}

export function referencedRankingTargetFamilies(
  conditions: readonly (ConditionExpression | null)[],
): readonly CanonicalTargetFamilyId[] {
  return collectPredicateReferences(conditions.map(targetConditionWitnessSpace)).familyIds;
}

function collectExplicitTargetStateTraits(
  conditions: readonly (ConditionExpression | null)[],
): ReadonlySet<string> {
  const traits = new Set<string>();
  const visit = (condition: ConditionExpression): void => {
    switch (condition.kind) {
      case 'all':
      case 'any':
        condition.expressions.forEach(visit);
        return;
      case 'not':
        visit(condition.expression);
        return;
      case 'trait':
        if (condition.scope === 'targetState') traits.add(condition.trait);
        return;
      case 'traitCount':
        if (condition.scope === 'targetState')
          condition.traits.forEach((trait) => traits.add(trait));
        return;
      default:
        return;
    }
  };
  conditions
    .filter((condition): condition is ConditionExpression => condition !== null)
    .forEach(visit);
  return traits;
}

function collectTargetTraitFacts(
  witnessSpaces: readonly ReturnType<typeof targetConditionWitnessSpace>[],
  ownedTraitFacts: ReadonlySet<string>,
  transitionTraits: ReadonlySet<string> | undefined,
  explicitTargetStateTraits: ReadonlySet<string>,
): readonly { scope: 'target' | 'targetState'; trait: string }[] {
  const facts = new Map<string, { scope: 'target' | 'targetState'; trait: string }>();
  for (const { traitFacts } of witnessSpaces)
    for (const fact of traitFacts) {
      if (ownedTraitFacts.has(`${fact.scope}:${fact.trait}`)) continue;
      if (
        transitionTraits !== undefined &&
        fact.scope === 'targetState' &&
        !explicitTargetStateTraits.has(fact.trait) &&
        !transitionTraits.has(fact.trait)
      )
        continue;
      facts.set(`${fact.scope}:${fact.trait}`, fact);
    }
  return [...facts.values()].sort((left, right) =>
    `${left.scope}:${left.trait}`.localeCompare(`${right.scope}:${right.trait}`),
  );
}

function selectTargetClasses(
  relationClasses: readonly CanonicalTargetClassId[],
  referencedClasses: ReadonlySet<CanonicalTargetClassId>,
  allClasses: readonly CanonicalTargetClassId[],
): readonly CanonicalTargetClassId[] {
  const selected = [
    ...relationClasses.slice(0, 1),
    ...relationClasses.filter((classId) => referencedClasses.has(classId)),
    ...allClasses.filter((classId) => referencedClasses.has(classId)),
  ];
  const neutral = relationClasses[0];
  if (referencedClasses.size > 0 && (neutral === undefined || referencedClasses.has(neutral))) {
    const fallback = allClasses.find((classId) => !referencedClasses.has(classId));
    if (fallback !== undefined) selected.push(fallback);
  }
  return [...new Set(selected)];
}

function selectTargetAttributes(
  neutralAttributes: readonly CanonicalTargetAttribute[],
  referencedAttributes: ReadonlySet<CanonicalTargetAttribute>,
  allAttributes: readonly CanonicalTargetAttribute[],
): readonly CanonicalTargetAttribute[] {
  const selected = [
    ...neutralAttributes.slice(0, 1),
    ...allAttributes.filter((attribute) => referencedAttributes.has(attribute)),
  ];
  const neutral = neutralAttributes[0];
  if (
    referencedAttributes.size > 0 &&
    (neutral === undefined || referencedAttributes.has(neutral))
  ) {
    const fallback = allAttributes.find((attribute) => !referencedAttributes.has(attribute));
    if (fallback !== undefined) selected.push(fallback);
  }
  return [...new Set(selected)];
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
  const {
    classes: referencedClasses,
    attributes: referencedAttributes,
    familyIds: referencedFamilyIds,
  } = collectPredicateReferences(witnessSpaces);
  const familyCandidates = finiteSemanticProduct(
    referencedFamilyIds.map((familyId) => ({ key: familyId, values: [false, true] })),
    MAX_RANKING_WORLD_CANDIDATES,
    'ranking_world_candidate_limit',
  ).candidates.map((candidate) => referencedFamilyIds.filter((familyId) => candidate[familyId]));
  const ownedTraitFacts = input.ownedTraitFacts ?? new Set<string>();
  const explicitTargetStateTraits = collectExplicitTargetStateTraits(conditions);
  const targetTraits = collectTargetTraitFacts(
    witnessSpaces,
    ownedTraitFacts,
    input.canonicalCombinedState?.transitionTraits,
    explicitTargetStateTraits,
  );
  const relationClasses = targetClassCandidates(
    servant.classId,
    scenario.targetContext.class,
  ).filter((classId) => master.targetSemantics.execution.classIdentities.includes(classId));
  const neutralAttributes = targetAttributeCandidates(
    servantAttribute(servant.traits),
    scenario.targetContext.attribute,
  ).filter((attribute) => master.targetSemantics.execution.attributeIdentities.includes(attribute));
  const classes = selectTargetClasses(
    relationClasses,
    referencedClasses,
    master.targetSemantics.execution.classIdentities,
  );
  const attributes = selectTargetAttributes(
    neutralAttributes,
    referencedAttributes,
    master.targetSemantics.execution.attributeIdentities,
  );
  const traitFacts = traitFactCandidates(targetTraits);
  const candidateCount =
    classes.length * attributes.length * familyCandidates.length * traitFacts.length;
  if (candidateCount > MAX_RANKING_WORLD_PHYSICAL_STATES)
    throw new RangeError(`ranking_world_physical_state_limit:${String(candidateCount)}`);
  const candidates: RankingWorldCandidate[] = [];
  for (const classId of classes)
    for (const attribute of attributes)
      for (const familyIds of familyCandidates)
        for (const facts of traitFacts) {
          const canonicalFacts = completeTargetStateFacts(
            facts,
            input.canonicalCombinedState?.transitionTraits,
            explicitTargetStateTraits,
            ownedTraitFacts,
          );
          candidates.push({
            key: JSON.stringify({ classId, attribute, familyIds, facts: canonicalFacts }),
            classId,
            attribute,
            familyIds,
            traitFacts: canonicalFacts,
          });
        }
  return candidates;
}

function completeTargetStateFacts(
  facts: readonly RankingTraitFact[],
  transitionTraits: ReadonlySet<string> | undefined,
  explicitTargetStateTraits: ReadonlySet<string>,
  ownedTraitFacts: ReadonlySet<string>,
): readonly RankingTraitFact[] {
  const completed = [...facts];
  if (transitionTraits === undefined) return completed;
  for (const fact of facts) {
    if (fact.scope !== 'target') continue;
    if (explicitTargetStateTraits.has(fact.trait)) continue;
    if (transitionTraits.has(fact.trait)) continue;
    if (ownedTraitFacts.has(`targetState:${fact.trait}`)) continue;
    completed.push({ scope: 'targetState', trait: fact.trait, present: false });
  }
  return completed.sort((left, right) =>
    `${left.scope}:${left.trait}`.localeCompare(`${right.scope}:${right.trait}`),
  );
}
