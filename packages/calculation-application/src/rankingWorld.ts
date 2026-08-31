import {
  servantAttribute,
  targetAttributeCandidates,
  targetClassCandidates,
} from '@fgo-lab/calc-core';
import {
  canonicalExclusiveGroup,
  validateTargetCandidateConstraint,
} from '@fgo-lab/battle-execution';
import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import type {
  CanonicalTargetAttribute,
  CanonicalTargetClassId,
  CanonicalTargetFamilyId,
  TargetPredicate,
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

function collectTargetPredicates(
  condition: ConditionExpression | null,
  negated = false,
): { predicate: TargetPredicate; present: boolean }[] {
  if (!condition) return [];
  if (condition.kind === 'targetPredicate' && condition.scope === 'target')
    return [{ predicate: condition.predicate, present: !negated }];
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.flatMap((expression) =>
      collectTargetPredicates(expression, negated),
    );
  return condition.kind === 'not' ? collectTargetPredicates(condition.expression, !negated) : [];
}

function collectTargetTraits(
  condition: ConditionExpression | null,
  negated = false,
): RankingTraitFact[] {
  if (!condition) return [];
  if (
    condition.kind === 'trait' &&
    (condition.scope === 'target' || condition.scope === 'targetState')
  )
    return [{ scope: condition.scope, trait: condition.trait, present: !negated }];
  if (
    condition.kind === 'traitCount' &&
    (condition.scope === 'target' || condition.scope === 'targetState')
  )
    return condition.traits.map((trait) => ({
      scope: condition.scope === 'targetState' ? ('targetState' as const) : ('target' as const),
      trait,
      present: !negated,
    }));
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.flatMap((expression) => collectTargetTraits(expression, negated));
  return condition.kind === 'not' ? collectTargetTraits(condition.expression, !negated) : [];
}

function traitFactCandidates(traits: readonly RankingTraitFact[]): readonly RankingTraitFact[][] {
  const byDimension = new Map<string, RankingTraitFact[]>();
  for (const fact of traits) {
    const exclusiveGroup = canonicalExclusiveGroup(fact.scope, fact.trait);
    const key = exclusiveGroup
      ? `exclusive:${fact.scope}:${exclusiveGroup}`
      : `trait:${fact.scope}:${fact.trait}`;
    byDimension.set(key, [...(byDimension.get(key) ?? []), fact]);
  }
  const product = finiteSemanticProduct(
    [...byDimension].map(([key, facts]) => {
      const unique = [
        ...new Map(facts.map((fact) => [`${fact.trait}:${String(fact.present)}`, fact])).values(),
      ];
      if (!key.startsWith('exclusive:')) return { key, values: unique.map((fact) => [fact]) };
      const traitsInGroup = [...new Set(unique.map(({ trait }) => trait))];
      const prohibited = new Set(
        unique.filter(({ present }) => !present).map(({ trait }) => trait),
      );
      const positive = unique.filter(({ trait, present }) => present && !prohibited.has(trait));
      const choices = positive.length > 0 ? positive : [null];
      return {
        key,
        values: choices.map((choice) =>
          traitsInGroup.map((trait) => ({
            scope: unique[0]!.scope,
            trait,
            present: choice?.trait === trait,
          })),
        ),
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
  plannedTargetStateTraits: ReadonlySet<string> = new Set(),
): RankingWorldCandidate[] {
  return createRankingWorldCandidatesForConditions(
    servant,
    master,
    scenario,
    specialControls.map(({ projection }) => projection.explanation.condition),
    specialControls,
    plannedTargetStateTraits,
  );
}

export function createRankingWorldCandidatesForConditions(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  scenario: ResolvedScenario,
  conditions: readonly (ConditionExpression | null)[],
  selectionControls: readonly EffectControlViewModel[] = [],
  plannedTargetStateTraits: ReadonlySet<string> = new Set(),
): RankingWorldCandidate[] {
  const predicates = conditions.flatMap((condition) => collectTargetPredicates(condition));
  const referencedClasses = new Set(
    predicates.flatMap(({ predicate }) =>
      predicate.kind === 'classIdentity' ? [predicate.classId] : [],
    ),
  );
  const referencedAttributes = new Set(
    predicates.flatMap(({ predicate }) =>
      predicate.kind === 'attributeIdentity' ? [predicate.attribute] : [],
    ),
  );
  const referencedFamilyIds = [
    ...new Set(
      predicates.flatMap(({ predicate }) =>
        predicate.kind === 'familyMembership' ? [predicate.familyId] : [],
      ),
    ),
  ].sort();
  const familyRequirements = new Map<CanonicalTargetFamilyId, Set<boolean>>();
  for (const { predicate, present } of predicates) {
    if (predicate.kind !== 'familyMembership') continue;
    const values = familyRequirements.get(predicate.familyId) ?? new Set<boolean>();
    values.add(present);
    familyRequirements.set(predicate.familyId, values);
  }
  const familyProduct = finiteSemanticProduct(
    referencedFamilyIds.map((familyId) => ({
      key: familyId,
      values: [...(familyRequirements.get(familyId) ?? new Set([true]))],
    })),
    MAX_RANKING_WORLD_CANDIDATES,
    'ranking_world_candidate_limit',
  );
  const familyCandidates = familyProduct.candidates.map((candidate) =>
    referencedFamilyIds.filter((familyId) => candidate[familyId]),
  );
  const targetTraits = [
    ...new Map(
      conditions
        .flatMap((condition) => collectTargetTraits(condition))
        .filter(
          ({ scope, trait }) => scope !== 'targetState' || !plannedTargetStateTraits.has(trait),
        )
        .map((fact) => [`${fact.scope}:${fact.trait}:${String(fact.present)}`, fact]),
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
    ]),
  ];
  const attributes = [
    ...new Set([
      ...neutralAttributes.slice(0, 1),
      ...[...referencedAttributes].filter((attribute) =>
        master.targetSemantics.execution.attributeIdentities.includes(attribute),
      ),
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
  return classes.flatMap((classId) =>
    attributes.flatMap((attribute) =>
      familyCandidates.flatMap((familyIds) =>
        selections.flatMap((selected) =>
          traitFacts.map((facts) => ({
            key: JSON.stringify({ classId, attribute, familyIds, selected, facts }),
            classId,
            attribute,
            familyIds,
            selections: selected,
            traitFacts: facts,
          })),
        ),
      ),
    ),
  );
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
