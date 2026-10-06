import { projectBattleTraitPresence } from './traitFactLayers';
import { describe, expect, it } from 'vitest';
import { analyzeActivationFactSet } from '@fgo-lab/schema';
import type { NoblePhantasmVariant } from '@fgo-lab/master-data';
import type { ConditionExpression, ExecutableBattleState } from './contracts';
import { createConditionState } from './conditionState';
import { evaluateCondition } from './condition';
import {
  ConditionReadIdentityError,
  proofIsGuaranteed,
  type ConditionFactProof,
} from './conditionRead';
import { readTraitQuantity } from './traitFactLayers';
import { applyTraitAddition, applyTraitRemoval, applyWorldFacts } from './state';
import { writeInputFact } from './inputFacts';
import { mutateConditionalCriticalStars } from './resourceSemantics';

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
const countCondition: ConditionExpression = {
  kind: 'inputQuantity',
  inputKey: 'count',
  comparison: 'atLeast',
  value: 1,
};
function bindCount(state: ExecutableBattleState): void {
  state.stackQuantitySources.count = { scope: 'attackerState', trait: 'created' };
}
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
  it('reads a guaranteed predicate over both physical star outcomes and retains the causal read', () => {
    const state = initial();
    const beforeProof: ConditionFactProof = {
      kind: 'selectedInitialResource',
      clock: state.conditionReadClock,
    };
    state.inputFacts = writeInputFact(state.inputFacts, 'battle:criticalStars', 20, [beforeProof]);
    const sourceClock = {
      ...state.conditionReadClock,
      phase: 'sourceUse' as const,
      actionId: 'conditional-stars',
    };
    const sourceRead = evaluateCondition(
      { kind: 'trait', scope: 'field', trait: 'fieldCity', present: true },
      { ...state, conditionReadClock: sourceClock },
    );
    expect(sourceRead.kind).toBe('inputRequired');
    const mutation = mutateConditionalCriticalStars(
      state.inputFacts,
      10,
      'gain',
      { kind: 'possibleOutcome', clock: sourceClock },
      {
        kind: 'read',
        read: sourceRead,
        proc: {
          kind: 'resolved',
          outcome: 'success',
          certainty: 'guaranteed',
          ratePermille: 1000,
          selection: 'declared',
        },
      },
      [],
    );
    expect(mutation.status).toBe('applied');
    const after = { ...state, inputFacts: mutation.facts };
    const read = evaluateCondition(
      { kind: 'inputQuantity', inputKey: 'battle:criticalStars', comparison: 'atLeast', value: 20 },
      after,
    );
    expect(read).toMatchObject({ kind: 'known', truth: true, certainty: 'guaranteed' });
    expect(read.evidence[0]!.quantityFact).toMatchObject({
      kind: 'conditional',
      condition: sourceRead,
      whenTrue: { value: 30 },
      whenFalse: { value: 20 },
    });
    expect(read.support).toEqual([beforeProof, { kind: 'canonicalIntrinsic', clock: sourceClock }]);
    expect(
      evaluateCondition(
        {
          kind: 'inputQuantity',
          inputKey: 'battle:criticalStars',
          comparison: 'atLeast',
          value: 25,
        },
        after,
      ),
    ).toMatchObject({ kind: 'inputRequired', truth: null });
    state.inputFacts = writeInputFact(state.inputFacts, 'battle:criticalStars', 20, [
      { kind: 'possibleOutcome', clock: sourceClock },
    ]);
    const possiblePrior = mutateConditionalCriticalStars(
      state.inputFacts,
      10,
      'gain',
      { kind: 'possibleOutcome', clock: sourceClock },
      {
        kind: 'read',
        read: sourceRead,
        proc: {
          kind: 'resolved',
          outcome: 'success',
          certainty: 'guaranteed',
          ratePermille: 1000,
          selection: 'declared',
        },
      },
      [],
    );
    expect(
      evaluateCondition(
        {
          kind: 'inputQuantity',
          inputKey: 'battle:criticalStars',
          comparison: 'atLeast',
          value: 20,
        },
        { ...state, inputFacts: possiblePrior.facts },
      ),
    ).toMatchObject({ kind: 'known', truth: true, certainty: 'possible' });
  });
  it('does not turn an unknown prior count into one after a guaranteed grant', () => {
    const state = initial();
    bindCount(state);
    const granted = applyTraitAddition(state, 'attackerState', 'created', selfWrite(state));
    expect(evaluateCondition(trait, granted)).toMatchObject({
      truth: true,
      certainty: 'guaranteed',
    });
    expect(readTraitQuantity(granted.traitFactLayers, 'attackerState', 'created')).toEqual({
      value: null,
      support: [],
    });
    expect(evaluateCondition(countCondition, granted)).toMatchObject({
      kind: 'inputRequired',
      truth: null,
    });
  });

  it('keeps a possible count dependency when a later grant guarantees presence', () => {
    const state = initial();
    bindCount(state);
    const cleared = applyTraitRemoval(state, 'attackerState', 'created', selfWrite(state));
    const possible: ConditionFactProof = { ...selfWrite(cleared), kind: 'possibleOutcome' };
    const first = applyTraitAddition(cleared, 'attackerState', 'created', possible);
    const guaranteed = selfWrite(first);
    const second = applyTraitAddition(first, 'attackerState', 'created', guaranteed);
    expect(evaluateCondition(trait, second)).toMatchObject({
      truth: true,
      certainty: 'guaranteed',
    });
    const quantity = readTraitQuantity(second.traitFactLayers, 'attackerState', 'created');
    expect(quantity.value).toBe(2);
    expect(quantity.support).toContainEqual(possible);
    expect(quantity.support).toContainEqual(guaranteed);
    expect(quantity.support.every(proofIsGuaranteed)).toBe(false);
    expect(evaluateCondition(countCondition, second)).toMatchObject({
      truth: true,
      certainty: 'possible',
    });
    expect(readTraitQuantity(first.traitFactLayers, 'attackerState', 'created').value).toBe(1);
  });

  it('a deletion establishes exact zero independently of an unknown prior count', () => {
    const state = initial();
    bindCount(state);
    const granted = applyTraitAddition(state, 'attackerState', 'created', selfWrite(state));
    const proof = selfWrite(granted);
    const removed = applyTraitRemoval(granted, 'attackerState', 'created', proof);
    expect(readTraitQuantity(removed.traitFactLayers, 'attackerState', 'created')).toEqual({
      value: 0,
      support: [proof],
    });
    expect(evaluateCondition(trait, removed)).toMatchObject({
      truth: false,
      certainty: 'guaranteed',
    });
    expect(readTraitQuantity(granted.traitFactLayers, 'attackerState', 'created').value).toBeNull();
    expect(
      evaluateCondition({ ...countCondition, comparison: 'equal', value: 0 }, removed),
    ).toMatchObject({ truth: true, certainty: 'guaranteed' });
  });

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
    expect(projectBattleTraitPresence(state, 'attackerState').has('created')).toBe(false);
    expect(state.traitFactLayers.writes.attackerState.has('created')).toBe(false);
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
    (state.traitFactLayers.externalInitial.target as Map<string, unknown>).set('unqualified', {
      kind: 'present',
      quantity: { kind: 'unknown' },
    });
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
