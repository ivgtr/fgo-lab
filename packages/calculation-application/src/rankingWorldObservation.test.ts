import type { BattleOperation, ConditionExpression } from '@fgo-lab/battle-execution';
import { describe, expect, it } from 'vitest';
import type { RankingWorldCandidate } from './rankingWorldDomain';
import { compileRankingWorldObservationPlan, observeRankingWorld } from './rankingWorldObservation';
import { quotientRankingWorldDomain } from './rankingWorldQuotient';

const combined: ConditionExpression = {
  kind: 'trait',
  scope: 'target',
  trait: 'orderedTrait',
  present: true,
};

function candidate(key: string, initial: boolean, state: boolean): RankingWorldCandidate {
  return {
    key,
    classId: 'saber',
    attribute: 'man',
    familyIds: [],
    traitFacts: [
      { scope: 'target', trait: 'orderedTrait', present: initial },
      { scope: 'targetState', trait: 'orderedTrait', present: state },
    ],
  };
}

function mutation(
  kind: 'addTrait' | 'removeTrait' | 'suppressInitialTrait',
  scope: 'attacker' | 'attackerState' | 'target' | 'targetState' | 'field' = kind ===
  'suppressInitialTrait'
    ? 'target'
    : 'targetState',
  operationId: string = kind,
): BattleOperation {
  return {
    kind,
    operationId,
    order: 0,
    scope,
    trait: 'orderedTrait',
    condition: { kind: 'always' },
  } as BattleOperation;
}

describe('ordered ranking world observation', () => {
  it('does not merge initial and removable state truth after an ordered removal', () => {
    const fromState = candidate('from-state', false, true);
    const fromInitial = candidate('from-initial', true, false);
    const plan = compileRankingWorldObservationPlan([mutation('removeTrait')], [combined]);

    expect(observeRankingWorld(plan, fromState).outcomes.at(-1)).toEqual([
      'state:after:removeTrait:0',
      false,
    ]);
    expect(observeRankingWorld(plan, fromInitial).outcomes.at(-1)).toEqual([
      'state:after:removeTrait:0',
      true,
    ]);
    expect(quotientRankingWorldDomain([fromState, fromInitial], plan)).toHaveLength(2);
  });

  it('merges the same two physical states when every ordered observation is equivalent', () => {
    const plan = compileRankingWorldObservationPlan([], [combined]);
    const classes = quotientRankingWorldDomain(
      [candidate('from-state', false, true), candidate('from-initial', true, false)],
      plan,
    );
    expect(classes).toHaveLength(1);
    expect(classes[0]!.members).toHaveLength(2);
  });

  it('does not add a new distinction for an idempotent state addition', () => {
    const plan = compileRankingWorldObservationPlan([mutation('addTrait')], [combined]);
    expect(
      quotientRankingWorldDomain(
        [candidate('from-state', false, true), candidate('from-initial', true, false)],
        plan,
      ),
    ).toHaveLength(1);
  });

  it('tracks suppression separately from removal', () => {
    const plan = compileRankingWorldObservationPlan([mutation('suppressInitialTrait')], [combined]);
    expect(observeRankingWorld(plan, candidate('state', false, true)).outcomes.at(-1)).toEqual([
      'state:after:suppressInitialTrait:0',
      true,
    ]);
    expect(observeRankingWorld(plan, candidate('initial', true, false)).outcomes.at(-1)).toEqual([
      'state:after:suppressInitialTrait:0',
      false,
    ]);
  });

  it('compiles only target mutations and preserves read/mutation order', () => {
    const operations = [
      mutation('removeTrait', 'target', 'remove-target'),
      mutation('removeTrait', 'targetState', 'remove-state'),
      mutation('suppressInitialTrait', 'target', 'suppress-target'),
      mutation('removeTrait', 'attacker', 'remove-attacker'),
      mutation('removeTrait', 'field', 'remove-field'),
      mutation('suppressInitialTrait', 'attacker', 'suppress-attacker'),
      mutation('addTrait', 'target', 'add-target'),
    ];
    const plan = compileRankingWorldObservationPlan(operations, [combined]);

    expect(
      plan.steps
        .filter((step) => step.key.includes('remove-') || step.key.includes('suppress-'))
        .map((step) => step.key),
    ).toEqual([
      'operation:remove-target',
      'mutation:remove-target',
      'state:after:remove-target:0',
      'operation:remove-state',
      'mutation:remove-state',
      'state:after:remove-state:0',
      'operation:suppress-target',
      'mutation:suppress-target',
      'state:after:suppress-target:0',
    ]);
    expect(plan.steps.some((step) => step.key.includes('remove-attacker'))).toBe(false);
    expect(plan.steps.some((step) => step.key.includes('remove-field'))).toBe(false);
    expect(plan.steps.some((step) => step.key.includes('suppress-attacker'))).toBe(false);
    expect(plan.steps.some((step) => step.key.includes('add-target'))).toBe(false);
  });

  it('refuses to merge a physical state across an unresolved mutation guard', () => {
    const conditional = {
      ...mutation('removeTrait'),
      condition: { kind: 'quantity', quantity: 'targetRarity', comparison: 'atLeast', value: 1 },
    } as BattleOperation;
    const plan = compileRankingWorldObservationPlan([conditional], [combined]);
    const left = candidate('left', false, true);
    const right = candidate('right', true, false);
    expect(observeRankingWorld(plan, left).indeterminateMutation).toBe(true);
    expect(quotientRankingWorldDomain([left, right], plan)).toHaveLength(2);
  });
});
