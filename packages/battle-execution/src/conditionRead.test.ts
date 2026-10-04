import { describe, expect, it } from 'vitest';
import { analyzeActivationFactSet } from '@fgo-lab/schema';
import type { NoblePhantasmVariant } from '@fgo-lab/master-data';
import type { ConditionExpression, ExecutableBattleState } from './contracts';
import { createConditionState } from './conditionState';
import { evaluateCondition } from './condition';
import { ConditionReadIdentityError, type ConditionFactProof } from './conditionRead';
import { applyTraitAddition, applyTraitRemoval, applyWorldFacts } from './state';

const form = { actorId: 'read-fixture', limitCount: 0 };
const variant: NoblePhantasmVariant = {
  kind: 'nonAttack',
  canonicalId: 'read-fixture-np',
  ref: { actorFormId: form, noblePhantasmId: 'read-fixture-np' },
  name: 'read fixture',
  priority: 1,
  effects: [],
};
function initial(): ExecutableBattleState {
  const activation = analyzeActivationFactSet([]);
  if (activation.status !== 'valid') throw new Error('valid empty activation required');
  return {
    ...createConditionState(
      {
        cardType: 'buster',
        attackerStateTraits: [],
        targetStateTraits: [],
        fieldTraits: [],
        target: { traits: [] },
        attackerHpPermille: 1000,
        targetRarity: null,
        battlePointPhase: null,
      },
      variant,
      ['intrinsic'],
      {},
      [],
      [],
      activation.factSet,
    ),
    actorFormId: form,
    modifiers: [],
    modifierRates: {},
    ignoreDefense: false,
    ignoreDamageCut: false,
    evidence: [],
    unresolved: [],
  };
}
const trait: ConditionExpression = {
  kind: 'trait',
  scope: 'attacker',
  trait: 'created',
  present: true,
};
function selfWrite(state: ExecutableBattleState): ConditionFactProof {
  return {
    kind: 'guaranteedWrite',
    clock: {
      ...state.conditionReadClock,
      phase: 'operation',
      actionId: 'self-write',
      operationId: 'self-write',
      sourceInstanceId: 'self',
      occurrenceId: 'self-write',
      valueSetIndex: 0,
      valueIndex: 0,
    },
  };
}

describe('condition value, proof and read clock', () => {
  it('keeps a read immutable through a later grant and removal', () => {
    const state = initial();
    const removed = applyTraitRemoval(state, 'attackerState', 'created', selfWrite(state));
    const before = evaluateCondition(trait, removed);
    expect(before).toMatchObject({ truth: false, certainty: 'guaranteed' });
    const granted = applyTraitAddition(removed, 'attackerState', 'created', selfWrite(removed));
    expect(evaluateCondition(trait, granted)).toMatchObject({
      truth: true,
      certainty: 'guaranteed',
    });
    const final = applyTraitRemoval(granted, 'attackerState', 'created', selfWrite(granted));
    expect(evaluateCondition({ kind: 'not', expression: trait }, final)).toMatchObject({
      truth: true,
      certainty: 'guaranteed',
    });
    expect(before).toMatchObject({ truth: false, certainty: 'guaranteed' });
    expect(state.traits.attackerState.has('created')).toBe(false);
    expect(state.conditionFactProofs.traits.attackerState.has('created')).toBe(false);
  });

  it('does not exchange external false with a guaranteed self removal', () => {
    const state = initial();
    const external = applyWorldFacts(state, [
      {
        decisionKey: 'external',
        fact: { kind: 'trait', scope: 'attackerState', trait: 'created', present: false },
      },
    ]);
    const removed = applyTraitRemoval(state, 'attackerState', 'created', selfWrite(state));
    expect(evaluateCondition(trait, external)).toMatchObject({
      truth: false,
      certainty: 'possible',
    });
    expect(evaluateCondition(trait, removed)).toMatchObject({
      truth: false,
      certainty: 'guaranteed',
    });
    expect(
      evaluateCondition(
        { kind: 'trait', scope: 'field', trait: 'unspecified', present: false },
        state,
      ),
    ).toMatchObject({ kind: 'inputRequired', truth: null });
  });

  it('uses decisive logical proofs without promoting an unknown or unsupported read', () => {
    const state = initial();
    const known: ConditionExpression = {
      kind: 'trait',
      scope: 'attacker',
      trait: 'intrinsic',
      present: true,
    };
    const unknown: ConditionExpression = {
      kind: 'trait',
      scope: 'target',
      trait: 'unspecified',
      present: true,
    };
    expect(evaluateCondition({ kind: 'any', expressions: [unknown, known] }, state)).toMatchObject({
      truth: true,
      certainty: 'guaranteed',
    });
    expect(evaluateCondition({ kind: 'all', expressions: [known, unknown] }, state)).toMatchObject({
      kind: 'inputRequired',
      truth: null,
    });
    expect(evaluateCondition({ kind: 'not', expression: unknown }, state)).toMatchObject({
      kind: 'inputRequired',
      truth: null,
    });
    expect(
      evaluateCondition(
        {
          kind: 'traitCount',
          scope: 'attacker',
          traits: ['intrinsic'],
          comparison: 'equal',
          count: 1,
        },
        state,
      ),
    ).toMatchObject({ truth: true, certainty: 'guaranteed' });
    const removed = applyTraitRemoval(state, 'attackerState', 'created', selfWrite(state));
    expect(
      evaluateCondition(
        {
          kind: 'all',
          expressions: [trait, { kind: 'unsupported', reason: 'unresolvedRecipient' }],
        },
        removed,
      ),
    ).toMatchObject({ truth: false, certainty: 'guaranteed' });
  });

  it('rejects missing proof even when another child could decide the expression', () => {
    const state = initial();
    (state.traits.target as Map<string, boolean>).set('unqualified', true);
    const malformed: ConditionExpression = {
      kind: 'trait',
      scope: 'target',
      trait: 'unqualified',
      present: true,
    };
    expect(() =>
      evaluateCondition({ kind: 'any', expressions: [{ kind: 'always' }, malformed] }, state),
    ).toThrow(ConditionReadIdentityError);
  });
});
