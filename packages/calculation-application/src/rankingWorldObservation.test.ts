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

function mutation(kind: 'addTrait' | 'removeTrait' | 'suppressInitialTrait'): BattleOperation {
  return {
    kind,
    operationId: kind,
    order: 0,
    scope: kind === 'suppressInitialTrait' ? 'target' : 'targetState',
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
