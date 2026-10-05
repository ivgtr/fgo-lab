import type { BattleOperation } from './contracts';
import { closeResourceMutationSemantics, mutateCriticalStars } from './resourceSemantics';
import { cloneInputFacts, writeInputFact } from './inputFacts';
import { proofIsGuaranteed, type ConditionFactProof } from './conditionRead';
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
  it('keeps possible prior quantity dependencies after a guaranteed star gain', () => {
    const prior: ConditionFactProof = { kind: 'possibleOutcome', clock };
    const initial = writeInputFact(new Map(), 'battle:criticalStars', 20, [prior]);
    const result = mutateCriticalStars(initial, 10, 'gain', guaranteed);
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('star_write_required');
    const fact = result.facts.get('battle:criticalStars')!;
    expect(fact.value).toBe(30);
    expect(fact.support.every(proofIsGuaranteed)).toBe(false);
    expect(initial.get('battle:criticalStars')!.value).toBe(20);
    expect(cloneInputFacts(result.facts)).toEqual(result.facts);
    expect(cloneInputFacts(result.facts).get('battle:criticalStars')).not.toBe(fact);
  });
  it('records a clipped same-value star write and rejects unknown quantities without changing them', () => {
    const initial = writeInputFact(new Map(), 'battle:criticalStars', 99, [guaranteed]);
    const clipped = mutateCriticalStars(initial, 10, 'gain', guaranteed);
    expect(clipped).toMatchObject({ status: 'applied', before: 99, after: 99 });
    expect(clipped.facts.get('battle:criticalStars')!.support).toHaveLength(2);
    const unknown = writeInputFact(new Map(), 'battle:criticalStars', null, []);
    const rejected = mutateCriticalStars(unknown, 10, 'gain', guaranteed);
    expect(rejected).toMatchObject({ status: 'inputRequired', reason: 'unknownCriticalStars' });
    expect(rejected.facts).toBe(unknown);
    expect(unknown.get('battle:criticalStars')!.value).toBeNull();
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
