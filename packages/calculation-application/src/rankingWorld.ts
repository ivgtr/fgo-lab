import {
  servantAttribute,
  targetAttributeCandidates,
  targetClassCandidates,
} from '@fgo-lab/calc-core';
import { validateTargetCandidateConstraint } from '@fgo-lab/battle-execution';
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
}

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
  const candidateCount = classes.length * attributes.length * selections.length;
  if (candidateCount > MAX_RANKING_WORLD_CANDIDATES)
    throw new RangeError(`ranking_world_candidate_limit:${String(candidateCount)}`);
  return classes.flatMap((classId) =>
    attributes.flatMap((attribute) =>
      selections.map((selected) => ({
        key: JSON.stringify({ classId, attribute, familyIds, selected }),
        classId,
        attribute,
        familyIds,
        selections: selected,
      })),
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
  return { ...scenario, targetContext };
}
