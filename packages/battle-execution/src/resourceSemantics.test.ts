import type { BattleOperation } from './contracts';
import {
  closeResourceMutationSemantics,
  mutateCriticalStars,
  mutateConditionalCriticalStars,
} from './resourceSemantics';
import {
  cloneInputFacts,
  writeInputFact,
  exactInputFactValue,
  inputFactPredicate,
  readInputFact,
} from './inputFacts';
import {
  proofIsGuaranteed,
  type ConditionFactProof,
  type SourceActivationReceipt,
} from './conditionRead';
import { describe, expect, it } from 'vitest';

const resourceOperation = {
  kind: 'resourceMutation',
  resource: 'hp',
  resolution: 'resourceStateUnavailable',
  direction: 'loss',
  lossFloor: 'oneIfAlive',
  unit: 'fixed',
  amount: 1_000,
  subjectId: null,
  source: { origin: 'attacker', sourceInstanceId: 'fixture', skillId: 'fixture' },
  inputDefinitions: [],
  condition: { kind: 'always' },
} as unknown as BattleOperation;

describe('resource semantic closure', () => {
  const clock: ConditionFactProof['clock'] = {
    phase: 'initial',
    actorFormId: { actorId: 'fixture', limitCount: 0 },
    actor: 'attacker',
    actionId: null,
    operationId: null,
    sourceInstanceId: null,
    occurrenceId: null,
    valueSetIndex: null,
    valueIndex: null,
  };
  const guaranteed: ConditionFactProof = { kind: 'guaranteedWrite', clock };
  const activation = (
    truth: boolean | null,
  ): Extract<SourceActivationReceipt, { kind: 'read' }> => ({
    kind: 'read',
    read:
      truth === null
        ? { kind: 'inputRequired', truth, certainty: null, clock, evidence: [], support: [] }
        : {
            kind: 'known',
            truth,
            certainty: 'guaranteed',
            clock,
            evidence: [],
            support: [guaranteed],
          },
    proc: {
      kind: 'resolved',
      outcome: 'success',
      certainty: 'guaranteed',
      ratePermille: 1000,
      selection: 'declared',
    },
  });
  it('preserves both possible conditional star results without inventing an exact quantity', () => {
    const initial = writeInputFact(new Map(), 'battle:criticalStars', 20, [guaranteed]);
    const possible: ConditionFactProof = { kind: 'possibleOutcome', clock };
    const changed = mutateConditionalCriticalStars(
      initial,
      10,
      'gain',
      possible,
      activation(null),
      [],
    );
    expect(changed).toMatchObject({
      status: 'applied',
      before: { kind: 'known', value: 20 },
      after: { kind: 'conditional' },
    });
    const fact = changed.facts.get('battle:criticalStars')!;
    expect(fact).toMatchObject({
      kind: 'conditional',
      whenTrue: { kind: 'known', value: 30 },
      whenFalse: { kind: 'known', value: 20 },
      condition: { kind: 'inputRequired', truth: null },
    });
    expect(exactInputFactValue(fact)).toBeUndefined();
    expect(inputFactPredicate(fact, (value) => value >= 20)).toBe(true);
    expect(inputFactPredicate(fact, (value) => value >= 25)).toBeNull();
    const later = mutateCriticalStars(changed.facts, 10, 'gain', guaranteed);
    expect(later).toMatchObject({
      status: 'applied',
      after: { kind: 'conditional', whenTrue: { value: 40 }, whenFalse: { value: 30 } },
    });
    const falseBranch = mutateConditionalCriticalStars(
      initial,
      10,
      'gain',
      possible,
      activation(false),
      [],
    );
    expect(falseBranch).toMatchObject({
      status: 'applied',
      before: { value: 20 },
      after: { value: 20 },
    });
    expect(falseBranch.facts).toBe(initial);
    expect(exactInputFactValue(initial.get('battle:criticalStars')!)).toBe(20);
    const clipped = writeInputFact(initial, 'battle:criticalStars', 99, [guaranteed]);
    const invariant = mutateConditionalCriticalStars(
      clipped,
      10,
      'gain',
      possible,
      activation(null),
      [],
    );
    expect(invariant.status).toBe('applied');
    expect(exactInputFactValue(invariant.facts.get('battle:criticalStars')!)).toBe(99);
    expect(invariant.facts.get('battle:criticalStars')).toMatchObject({
      whenTrue: { value: 99 },
      whenFalse: { value: 99 },
    });
    expect(invariant.facts.get('battle:criticalStars')!.support.every(proofIsGuaranteed)).toBe(
      true,
    );
  });
  it('keeps possible prior quantity dependencies after a guaranteed star gain', () => {
    const prior: ConditionFactProof = { kind: 'possibleOutcome', clock };
    const initial = writeInputFact(new Map(), 'battle:criticalStars', 20, [prior]);
    const result = mutateCriticalStars(initial, 10, 'gain', guaranteed);
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('star_write_required');
    const fact = result.facts.get('battle:criticalStars')!;
    expect(exactInputFactValue(fact)).toBe(30);
    expect(fact.support.every(proofIsGuaranteed)).toBe(false);
    expect(exactInputFactValue(initial.get('battle:criticalStars')!)).toBe(20);
    expect(cloneInputFacts(result.facts)).toEqual(result.facts);
    expect(cloneInputFacts(result.facts).get('battle:criticalStars')).not.toBe(fact);
  });
  it('owns immutable value and clock data while cloned containers share immutable dependencies', () => {
    const incomingProof = structuredClone(guaranteed);
    const initial = writeInputFact(new Map(), 'battle:criticalStars', 20, [incomingProof]);
    Object.assign(incomingProof.clock, { phase: 'operation', valueIndex: 9 });
    const original = initial.get('battle:criticalStars')!;
    expect(original.support[0]!.clock).toMatchObject({ phase: 'initial', valueIndex: null });
    const incomingActivation = structuredClone(activation(null));
    const result = mutateConditionalCriticalStars(
      initial,
      10,
      'gain',
      guaranteed,
      incomingActivation,
      [],
    );
    if (result.status !== 'applied') throw new Error('star_write_required');
    const fact = result.facts.get('battle:criticalStars')!;
    expect(result.after).toBe(fact);
    if (fact.kind !== 'conditional') throw new Error('conditional_fact_required');
    Object.assign(incomingActivation.read.clock, { phase: 'damageEvaluation', valueIndex: 4 });
    Object.assign(incomingActivation.proc, { outcome: 'failure' });
    expect(fact.condition.clock).toMatchObject({ phase: 'initial', valueIndex: null });
    expect(fact.proc).toMatchObject({ outcome: 'success' });
    const cloned = cloneInputFacts(result.facts);
    expect(cloned).not.toBe(result.facts);
    const clonedFact = cloned.get('battle:criticalStars')!;
    expect(clonedFact).not.toBe(fact);
    if (clonedFact.kind !== 'conditional') throw new Error('conditional_fact_required');
    expect(clonedFact.whenFalse).toBe(original);
    expect(clonedFact.condition).toBe(fact.condition);
    expect(Reflect.set(clonedFact.whenFalse, 'value', 99)).toBe(false);
    expect(Reflect.set(clonedFact.condition.clock, 'valueIndex', 8)).toBe(false);
    expect(exactInputFactValue(initial.get('battle:criticalStars')!)).toBe(20);
    expect(inputFactPredicate(fact, (value) => value >= 25)).toBeNull();
    const later = mutateCriticalStars(cloned, 10, 'gain', guaranteed);
    expect(later).toMatchObject({
      status: 'applied',
      after: { whenTrue: { value: 40 }, whenFalse: { value: 30 } },
    });
    expect(fact).toMatchObject({ whenTrue: { value: 30 }, whenFalse: { value: 20 } });
  });
  it('records a clipped same-value star write and rejects unknown quantities without changing them', () => {
    const initial = writeInputFact(new Map(), 'battle:criticalStars', 99, [guaranteed]);
    const clipped = mutateCriticalStars(initial, 10, 'gain', guaranteed);
    expect(clipped).toMatchObject({
      status: 'applied',
      before: { value: 99 },
      after: { value: 99 },
    });
    expect(clipped.facts.get('battle:criticalStars')!.support).toHaveLength(2);
    const unknown = writeInputFact(new Map(), 'battle:criticalStars', null, []);
    const rejected = mutateCriticalStars(unknown, 10, 'gain', guaranteed);
    expect(rejected).toMatchObject({ status: 'inputRequired', reason: 'unknownCriticalStars' });
    expect(rejected.facts).toBe(unknown);
    expect(readInputFact(unknown, 'battle:criticalStars').kind).toBe('unknown');
    expect(mutateCriticalStars(initial, null, 'gain', guaranteed)).toMatchObject({
      status: 'unsupported',
      facts: initial,
    });
  });
  it('proves an unread resource transition irrelevant', () => {
    expect(closeResourceMutationSemantics([resourceOperation])).toEqual([
      expect.objectContaining({
        kind: 'resourceMutation',
        resolution: 'noDamageReader',
      }),
    ]);
  });

  it('keeps an unrepresentable transition unsupported when later damage reads it', () => {
    const reader = {
      kind: 'executeNpDamage',
      source: { origin: 'attacker', sourceInstanceId: 'fixture', skillId: 'fixture' },
      inputDefinitions: [],
      condition: { kind: 'always' },
      specialAttackDependency: {
        kind: 'quantity',
        quantity: 'attackerHpPermille',
        comparison: 'lessThan',
        value: 1_000,
      },
    } as unknown as BattleOperation;
    expect(closeResourceMutationSemantics([resourceOperation, reader])[0]).toMatchObject({
      kind: 'resourceMutation',
      resource: 'hp',
      resolution: 'resourceStateUnavailable',
    });
  });

  it.each(['gain', 'loss'] as const)(
    'routes a star %s through ordered state when a later damage condition reads stars',
    (direction) => {
      const stars = {
        ...resourceOperation,
        resource: 'criticalStars',
        direction,
      } as BattleOperation;
      const reader = {
        kind: 'addModifier',
        source: { origin: 'attacker', sourceInstanceId: 'fixture', skillId: 'fixture' },
        inputDefinitions: [],
        condition: {
          kind: 'inputQuantity',
          inputKey: 'battle:criticalStars',
          comparison: 'atLeast',
          value: 10,
        },
        valueExpression: null,
      } as unknown as BattleOperation;
      expect(closeResourceMutationSemantics([stars, reader])[0]).toMatchObject({
        kind: 'resourceMutation',
        resource: 'criticalStars',
        resolution: 'orderedCriticalStars',
        direction,
      });
    },
  );

  it('uses an ordered suffix proof instead of treating an earlier reader as downstream', () => {
    const stars = { ...resourceOperation, resource: 'criticalStars' } as BattleOperation;
    const reader = {
      kind: 'addModifier',
      source: { origin: 'attacker', sourceInstanceId: 'fixture', skillId: 'fixture' },
      inputDefinitions: [],
      condition: {
        kind: 'inputQuantity',
        inputKey: 'battle:criticalStars',
        comparison: 'atLeast',
        value: 10,
      },
      valueExpression: null,
    } as unknown as BattleOperation;
    expect(closeResourceMutationSemantics([reader, stars])[1]).toMatchObject({
      resolution: 'noDamageReader',
    });
  });

  it.each([
    ['hp', { kind: 'quantity', quantity: 'attackerHpPermille' }],
    ['battlePoint', { kind: 'quantity', quantity: 'battlePointPhase' }],
  ] as const)(
    'uses the ordered suffix for %s instead of retaining an earlier-reader blocker',
    (resource, dependency) => {
      const mutation = { ...resourceOperation, resource } as BattleOperation;
      const reader = {
        kind: 'executeNpDamage',
        source: { origin: 'attacker', sourceInstanceId: 'fixture', skillId: 'fixture' },
        inputDefinitions: [],
        condition: { kind: 'always' },
        specialAttackDependency: {
          ...dependency,
          comparison: 'lessThan',
          value: 1_000,
        },
      } as unknown as BattleOperation;

      expect(closeResourceMutationSemantics([reader, mutation])[1]).toMatchObject({
        resource,
        resolution: 'noDamageReader',
      });
      expect(closeResourceMutationSemantics([mutation, reader])[0]).toMatchObject({
        resource,
        resolution: 'resourceStateUnavailable',
      });
    },
  );
});
