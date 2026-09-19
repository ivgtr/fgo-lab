import {
  servantAttribute,
  targetAttributeCandidates,
  targetClassCandidates,
} from '@fgo-lab/calc-core';
import {
  canonicalExclusiveGroup,
  targetConditionWitnessSpace,
  traitConditionEvaluationSource,
  validateTargetCandidateConstraint,
} from '@fgo-lab/battle-execution';
import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import type {
  CanonicalTargetAttribute,
  CanonicalTargetClassId,
  CanonicalTargetFamilyId,
} from '@fgo-lab/schema';
import type { EffectControlViewModel } from './effectControls';
import type { ConditionExpression } from '@fgo-lab/battle-execution';
import type { ResolvedScenario } from './rankingPolicy';
import { applyTargetContextCommand } from './targetContext';
import { finiteSemanticProduct } from './finiteSemanticProduct';

export const MAX_RANKING_WORLD_CANDIDATES = 4_096;

export interface RankingWorldCandidate {
  key: string;
  classId: CanonicalTargetClassId;
  attribute: CanonicalTargetAttribute;
  familyIds: readonly CanonicalTargetFamilyId[];
  selections: Readonly<Record<string, string>>;
  traitFacts: readonly RankingTraitFact[];
}

export type RankingTraitFact =
  | { scope: 'target'; trait: string; present: boolean }
  | { scope: 'targetState'; trait: string; present: boolean };

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
  const product = finiteSemanticProduct(
    [...byDimension].map(([key, facts]) => {
      const unique = [
        ...new Map(facts.map((fact) => [`${fact.scope}:${fact.trait}`, fact])).values(),
      ];
      if (!key.startsWith('exclusive:'))
        return {
          key,
          values: [false, true].map((present) => [{ ...unique[0]!, present }]),
        };
      const traitsInGroup = [...new Set(unique.map(({ trait }) => trait))];
      const absent = unique.map((fact) => ({ ...fact, present: false }));
      const choices = traitsInGroup.flatMap((selectedTrait) => {
        const selectedFacts = unique.filter(({ trait }) => trait === selectedTrait);
        const assignmentCount = 2 ** selectedFacts.length;
        return Array.from({ length: assignmentCount - 1 }, (_, index) => index + 1).map((mask) =>
          unique.map((fact) => ({
            ...fact,
            present:
              fact.trait === selectedTrait && (mask & (1 << selectedFacts.indexOf(fact))) !== 0,
          })),
        );
      });
      return {
        key,
        values: [absent, ...choices],
      };
    }),
    MAX_RANKING_WORLD_CANDIDATES,
    'ranking_world_candidate_limit',
  );
  return product.candidates.map((candidate) => Object.values(candidate).flat());
}

function selectionCandidates(
  controls: readonly EffectControlViewModel[],
): readonly Readonly<Record<string, string>>[] {
  const groups = new Map<string, Set<string>>();
  for (const control of controls)
    for (const selection of control.projection.selectionGroups) {
      const candidates = groups.get(selection.groupKey) ?? new Set<string>();
      candidates.add(selection.candidateKey);
      groups.set(selection.groupKey, candidates);
    }
  return finiteSemanticProduct(
    [...groups].map(([key, candidates]) => ({ key, values: [...candidates].sort() })),
    MAX_RANKING_WORLD_CANDIDATES,
    'ranking_world_candidate_limit',
  ).candidates;
}

export function effectMatchesRankingWorld(
  control: EffectControlViewModel,
  candidate: RankingWorldCandidate,
  master: MasterDataSnapshot,
): boolean {
  const condition = control.projection.explanation.condition;
  if (condition) {
    const validation = validateTargetCandidateConstraint(
      { classId: candidate.classId, attribute: candidate.attribute, families: candidate.familyIds },
      master.targetSemantics.execution,
      condition,
    );
    if (validation.kind === 'unsupported')
      throw new TypeError(`ranking_target_constraint_unsupported:${validation.issue.kind}`);
    if (validation.kind === 'conflict') return false;
  }
  return control.projection.selectionGroups.every(
    (selection) => candidate.selections[selection.groupKey] === selection.candidateKey,
  );
}

export function createRankingWorldCandidates(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  scenario: ResolvedScenario,
  specialControls: readonly EffectControlViewModel[],
): RankingWorldCandidate[] {
  return createRankingWorldCandidatesForConditions(
    servant,
    master,
    scenario,
    specialControls.map(({ projection }) => projection.explanation.condition),
    specialControls,
  );
}

export function createRankingWorldCandidatesForConditions(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  scenario: ResolvedScenario,
  conditions: readonly (ConditionExpression | null)[],
  selectionControls: readonly EffectControlViewModel[] = [],
  ownedTraitFacts: ReadonlySet<string> = new Set(),
  canonicalInitialTargetWitness = false,
  quotientEquivalentTargetTruth = false,
): RankingWorldCandidate[] {
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
  const familyProduct = finiteSemanticProduct(
    referencedFamilyIds.map((familyId) => ({
      key: familyId,
      values: [false, true],
    })),
    MAX_RANKING_WORLD_CANDIDATES,
    'ranking_world_candidate_limit',
  );
  const familyCandidates = familyProduct.candidates.map((candidate) =>
    referencedFamilyIds.filter((familyId) => candidate[familyId]),
  );
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
            !canonicalInitialTargetWitness ||
            fact.scope !== 'targetState' ||
            explicitTargetStateTraits.has(fact.trait),
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
  const selections = selectionCandidates(selectionControls);
  const traitFacts = traitFactCandidates(targetTraits);
  const candidateCount =
    classes.length *
    attributes.length *
    familyCandidates.length *
    selections.length *
    traitFacts.length;
  if (candidateCount > MAX_RANKING_WORLD_CANDIDATES)
    throw new RangeError(`ranking_world_candidate_limit:${String(candidateCount)}`);
  const candidates = classes.flatMap((classId) =>
    attributes.flatMap((attribute) =>
      familyCandidates.flatMap((familyIds) =>
        selections.flatMap((selected) =>
          traitFacts.map((facts) => {
            const canonicalFacts = canonicalInitialTargetWitness
              ? [
                  ...facts,
                  ...facts.flatMap((fact) =>
                    fact.scope === 'target' &&
                    !explicitTargetStateTraits.has(fact.trait) &&
                    !ownedTraitFacts.has(`targetState:${fact.trait}`)
                      ? [{ scope: 'targetState' as const, trait: fact.trait, present: false }]
                      : [],
                  ),
                ].sort((left, right) =>
                  `${left.scope}:${left.trait}`.localeCompare(`${right.scope}:${right.trait}`),
                )
              : facts;
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
  if (!quotientEquivalentTargetTruth) return candidates;
  const simplify = (
    condition: ConditionExpression | null,
    facts: ReadonlyMap<string, boolean>,
  ): unknown => {
    if (!condition) return null;
    if (
      condition.kind === 'trait' &&
      ['target', 'targetState'].includes(condition.scope) &&
      traitConditionEvaluationSource(condition) === 'worldFacts'
    ) {
      const initial = facts.get(`target:${condition.trait}`) ?? false;
      const state = facts.get(`targetState:${condition.trait}`) ?? false;
      const present = condition.scope === 'target' ? initial || state : state;
      return present === condition.present;
    }
    if (condition.kind === 'traitCount' && ['target', 'targetState'].includes(condition.scope)) {
      const count = condition.traits.filter((trait) => {
        const initial = facts.get(`target:${trait}`) ?? false;
        const state = facts.get(`targetState:${trait}`) ?? false;
        return condition.scope === 'target' ? initial || state : state;
      }).length;
      return condition.comparison === 'atLeast'
        ? count >= condition.count
        : condition.comparison === 'atMost'
          ? count <= condition.count
          : count === condition.count;
    }
    if (condition.kind === 'all' || condition.kind === 'any') {
      const expressions = condition.expressions.map((expression) => simplify(expression, facts));
      if (condition.kind === 'all') {
        if (expressions.includes(false)) return false;
        const unresolved = expressions.filter((expression) => expression !== true);
        return unresolved.length === 0
          ? true
          : unresolved.length === 1
            ? unresolved[0]
            : { ...condition, expressions: unresolved };
      }
      if (expressions.includes(true)) return true;
      const unresolved = expressions.filter((expression) => expression !== false);
      return unresolved.length === 0
        ? false
        : unresolved.length === 1
          ? unresolved[0]
          : { ...condition, expressions: unresolved };
    }
    if (condition.kind === 'not') {
      const expression = simplify(condition.expression, facts);
      return typeof expression === 'boolean' ? !expression : { ...condition, expression };
    }
    return condition;
  };
  const representatives = new Map<string, RankingWorldCandidate>();
  for (const candidate of candidates) {
    const facts = new Map(
      candidate.traitFacts.map((fact) => [`${fact.scope}:${fact.trait}`, fact.present] as const),
    );
    const signature = JSON.stringify({
      classId: candidate.classId,
      attribute: candidate.attribute,
      familyIds: candidate.familyIds,
      selections: candidate.selections,
      conditions: conditions.map((condition) => simplify(condition, facts)),
    });
    const previous = representatives.get(signature);
    const assumptions = (value: RankingWorldCandidate) =>
      value.traitFacts.filter(({ present }) => present).length;
    if (
      !previous ||
      assumptions(candidate) < assumptions(previous) ||
      (assumptions(candidate) === assumptions(previous) && candidate.key < previous.key)
    )
      representatives.set(signature, candidate);
  }
  return [...representatives.values()];
}

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
