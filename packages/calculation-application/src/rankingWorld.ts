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
import type { ResolvedScenario } from './rankingPolicy';
import { applyTargetContextCommand } from './targetContext';

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
  condition: EffectControlViewModel['projection']['explanation']['condition'],
): TargetPredicate[] {
  if (!condition) return [];
  if (condition.kind === 'targetPredicate' && condition.scope === 'target')
    return [condition.predicate];
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.flatMap(collectTargetPredicates);
  return condition.kind === 'not' ? collectTargetPredicates(condition.expression) : [];
}

function collectTargetTraits(
  condition: EffectControlViewModel['projection']['explanation']['condition'],
): Omit<RankingTraitFact, 'present'>[] {
  if (!condition) return [];
  if (
    condition.kind === 'trait' &&
    (condition.scope === 'target' || condition.scope === 'targetState')
  )
    return [{ scope: condition.scope, trait: condition.trait }];
  if (
    condition.kind === 'traitCount' &&
    (condition.scope === 'target' || condition.scope === 'targetState')
  )
    return condition.traits.map((trait) => ({
      scope: condition.scope === 'targetState' ? ('targetState' as const) : ('target' as const),
      trait,
    }));
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.flatMap(collectTargetTraits);
  return condition.kind === 'not' ? collectTargetTraits(condition.expression) : [];
}

function traitFactCandidates(
  traits: readonly Omit<RankingTraitFact, 'present'>[],
): readonly RankingTraitFact[][] {
  if (2 ** traits.length > MAX_RANKING_WORLD_CANDIDATES)
    throw new RangeError(`ranking_world_candidate_limit:${String(2 ** traits.length)}`);
  let candidates: readonly RankingTraitFact[][] = [[]];
  for (const trait of traits)
    candidates = candidates.flatMap((candidate) => [
      [...candidate, { ...trait, present: false }],
      [...candidate, { ...trait, present: true }],
    ]);
  return candidates.filter((candidate) => {
    const groups = new Set<string>();
    for (const fact of candidate) {
      if (!fact.present) continue;
      const group = canonicalExclusiveGroup(fact.scope, fact.trait);
      if (group === null) continue;
      if (groups.has(group)) return false;
      groups.add(group);
    }
    return true;
  });
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
  let combinations: Readonly<Record<string, string>>[] = [{}];
  for (const [groupKey, candidates] of groups) {
    const nextSize = combinations.length * candidates.size;
    if (nextSize > MAX_RANKING_WORLD_CANDIDATES)
      throw new RangeError(`ranking_world_candidate_limit:${String(nextSize)}`);
    combinations = combinations.flatMap((combination) =>
      [...candidates].sort().map((candidate) => ({ ...combination, [groupKey]: candidate })),
    );
  }
  return combinations;
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
  const predicates = specialControls.flatMap((control) =>
    collectTargetPredicates(control.projection.explanation.condition),
  );
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
  const familyIds = [
    ...new Set(
      predicates.flatMap((predicate) =>
        predicate.kind === 'familyMembership' ? [predicate.familyId] : [],
      ),
    ),
  ].sort();
  const targetTraits = [
    ...new Map(
      specialControls
        .flatMap((control) => collectTargetTraits(control.projection.explanation.condition))
        .filter(
          ({ scope, trait }) => scope !== 'targetState' || !plannedTargetStateTraits.has(trait),
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
  const selections = selectionCandidates(specialControls);
  const traitFacts = traitFactCandidates(targetTraits);
  const candidateCount = classes.length * attributes.length * selections.length * traitFacts.length;
  if (candidateCount > MAX_RANKING_WORLD_CANDIDATES)
    throw new RangeError(`ranking_world_candidate_limit:${String(candidateCount)}`);
  return classes.flatMap((classId) =>
    attributes.flatMap((attribute) =>
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
