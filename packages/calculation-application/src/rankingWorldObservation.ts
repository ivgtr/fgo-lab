import {
  compareTraitCount,
  decisiveConditionGroup,
  resolveCombinedTraitValue,
  targetConditionWitnessSpace,
  traitConditionEvaluationSource,
  type BattleOperation,
  type ConditionExpression,
} from '@fgo-lab/battle-execution';
import type { RankingWorldCandidate } from './rankingWorldDomain';

export type RankingWorldObservationStep =
  | { kind: 'read'; key: string; condition: ConditionExpression }
  | {
      kind: 'mutation';
      key: string;
      mutation: 'removeTrait' | 'suppressInitialTrait';
      scope: 'target' | 'targetState';
      trait: string;
    };

export interface RankingWorldObservationPlan {
  steps: readonly RankingWorldObservationStep[];
  transitionTraits: ReadonlySet<string>;
}

export interface RankingWorldObservation {
  key: string;
  outcomes: readonly unknown[];
  indeterminateMutation: boolean;
}

export function compileRankingWorldObservationPlan(
  operations: readonly BattleOperation[],
  terminalConditions: readonly ConditionExpression[],
): RankingWorldObservationPlan {
  const steps: RankingWorldObservationStep[] = [];
  const targetConditions = [
    ...new Map(
      terminalConditions.flatMap((condition) => {
        const witness = targetConditionWitnessSpace(condition);
        return witness.traitFacts.length > 0 || witness.predicates.length > 0
          ? [[JSON.stringify(condition), { condition, witness }] as const]
          : [];
      }),
    ).values(),
  ];
  const appendStateReads = (position: string, changedTrait?: string) =>
    targetConditions.forEach(({ condition, witness }, index) => {
      if (changedTrait && !witness.traitFacts.some(({ trait }) => trait === changedTrait)) return;
      steps.push({ kind: 'read', key: `state:${position}:${index}`, condition });
    });
  appendStateReads('initial');
  for (const operation of operations) {
    const targetMutation =
      (operation.kind === 'removeTrait' &&
        (operation.scope === 'target' || operation.scope === 'targetState')) ||
      (operation.kind === 'suppressInitialTrait' && operation.scope === 'target');
    if (!targetMutation) continue;
    steps.push({
      kind: 'read',
      key: `operation:${operation.operationId}`,
      condition: operation.condition,
    });
    if (
      operation.kind === 'removeTrait' &&
      (operation.scope === 'target' || operation.scope === 'targetState')
    )
      steps.push({
        kind: 'mutation',
        key: `mutation:${operation.operationId}`,
        mutation: operation.kind,
        scope: operation.scope,
        trait: operation.trait,
      });
    if (operation.kind === 'suppressInitialTrait' && operation.scope === 'target')
      steps.push({
        kind: 'mutation',
        key: `mutation:${operation.operationId}`,
        mutation: operation.kind,
        scope: 'target',
        trait: operation.trait,
      });
    appendStateReads(`after:${operation.operationId}`, operation.trait);
  }
  return { steps, transitionTraits: transitionTraitsAfterMutation(steps) };
}

function transitionTraitsAfterMutation(
  steps: readonly RankingWorldObservationStep[],
): ReadonlySet<string> {
  const traits = new Set<string>();
  steps.forEach((step, index) => {
    if (step.kind !== 'mutation') return;
    const readAfterMutation = steps
      .slice(index + 1)
      .some(
        (candidate) =>
          candidate.kind === 'read' &&
          targetConditionWitnessSpace(candidate.condition).traitFacts.some(
            ({ trait }) => trait === step.trait,
          ),
      );
    if (readAfterMutation) traits.add(step.trait);
  });
  return traits;
}

type Facts = Map<string, boolean>;

function targetTraitValue(
  facts: Facts,
  suppressed: ReadonlySet<string>,
  scope: 'target' | 'targetState',
  trait: string,
): boolean | undefined {
  return resolveCombinedTraitValue({
    scope,
    initial: facts.get(`target:${trait}`) ?? false,
    state: facts.get(`targetState:${trait}`) ?? false,
    suppressed: suppressed.has(trait),
  });
}

function simplify(
  condition: ConditionExpression,
  facts: Facts,
  suppressed: ReadonlySet<string>,
): unknown {
  if (
    condition.kind === 'trait' &&
    (condition.scope === 'target' || condition.scope === 'targetState')
  ) {
    if (traitConditionEvaluationSource(condition) === 'effectLocalDecision') return condition;
    return (
      targetTraitValue(facts, suppressed, condition.scope, condition.trait) === condition.present
    );
  }
  if (
    condition.kind === 'traitCount' &&
    (condition.scope === 'target' || condition.scope === 'targetState')
  ) {
    const scope = condition.scope;
    const count = condition.traits.filter((trait) =>
      targetTraitValue(facts, suppressed, scope, trait),
    ).length;
    return compareTraitCount(condition.comparison, count, condition.count);
  }
  if (condition.kind === 'targetPredicate' && condition.scope === 'target') {
    return condition;
  }
  if (condition.kind === 'all' || condition.kind === 'any') {
    const members = condition.expressions.map((child) => simplify(child, facts, suppressed));
    const decisive = decisiveConditionGroup(condition.kind, members);
    if (decisive !== undefined) return decisive;
    const unresolved = members.filter((member) =>
      condition.kind === 'all' ? member !== true : member !== false,
    );
    if (unresolved.length === 0) return condition.kind === 'all';
    if (unresolved.length === 1) return unresolved[0];
    return { ...condition, expressions: unresolved as ConditionExpression[] };
  }
  if (condition.kind === 'not') {
    const member = simplify(condition.expression, facts, suppressed);
    if (typeof member === 'boolean') return !member;
    return { ...condition, expression: member as ConditionExpression };
  }
  if (condition.kind === 'always') return true;
  return condition;
}

function applyMutation(
  step: Extract<RankingWorldObservationStep, { kind: 'mutation' }>,
  facts: Facts,
  suppressed: Set<string>,
): void {
  if (step.mutation === 'suppressInitialTrait') {
    suppressed.add(step.trait);
    return;
  }
  facts.set(`${step.scope}:${step.trait}`, false);
}

export function observeRankingWorld(
  plan: RankingWorldObservationPlan,
  candidate: RankingWorldCandidate,
): RankingWorldObservation {
  const facts: Facts = new Map(
    candidate.traitFacts.map((fact) => [`${fact.scope}:${fact.trait}`, fact.present]),
  );
  const suppressed = new Set<string>();
  const outcomes: unknown[] = [];
  let lastRead: unknown = true;
  let indeterminateMutation = false;
  for (const step of plan.steps) {
    if (step.kind === 'read') {
      lastRead = simplify(step.condition, facts, suppressed);
      outcomes.push([step.key, lastRead]);
      continue;
    }
    if (lastRead === true) applyMutation(step, facts, suppressed);
    else if (lastRead !== false) indeterminateMutation = true;
  }
  const key = JSON.stringify({
    identity: [candidate.classId, candidate.attribute, candidate.familyIds],
    outcomes,
    unresolvedState: indeterminateMutation ? candidate.traitFacts : null,
  });
  return { key, outcomes, indeterminateMutation };
}
