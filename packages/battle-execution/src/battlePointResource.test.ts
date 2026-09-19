import { describe, expect, it } from 'vitest';
import type { BattlePointDomain, EffectExecutionOperation } from '@fgo-lab/master-data';
import {
  applyBattlePointOperation,
  battlePointPhase,
  battlePointPhaseCandidates,
  battlePointRate,
  emptyBattlePointState,
  readBattlePoint,
  reconcileBattlePointActor,
} from './battlePointResource';
import type { SourceEffect } from './sourceCollection';

const percentage: BattlePointDomain = {
  id: 'gauge',
  phaseScale: 'permille',
  phases: [
    { phase: 0, threshold: -1 },
    { phase: 1, threshold: 0 },
    { phase: 2, threshold: 500 },
    { phase: 3, threshold: 750 },
    { phase: 4, threshold: 1000 },
  ],
  eligibility: [{ kind: 'traits', all: ['eligible'] }],
  capacity: {
    default: 4,
    maximum: 12,
    traitOverrides: [{ all: ['large'], value: 8 }],
  },
};

const absolute: BattlePointDomain = {
  id: 'bond',
  phaseScale: 'point',
  phases: [
    { phase: 0, threshold: -1 },
    { phase: 1, threshold: 0 },
    { phase: 2, threshold: 10 },
    { phase: 3, threshold: 20 },
  ],
  eligibility: [{ kind: 'actor', actorId: 'owner' }],
  capacity: { default: null, maximum: null, traitOverrides: [] },
};

const source = {
  origin: 'attacker',
  sourceInstanceId: 'attacker:owner',
  sourceId: 'owner',
  valueIndex: 0,
  valueSetIndex: 0,
  limitBreak: false,
} as SourceEffect;

function mutation(direction: 'gain' | 'loss', subjectId: string, amount: number) {
  return {
    kind: 'resourceMutation',
    resource: 'battlePoint',
    direction,
    unit: 'fixed',
    recipient: 'sourceSelf',
    amount: { kind: 'fixed', values: [[amount], [amount], [amount], [amount], [amount]] },
    subjectId,
  } satisfies Extract<EffectExecutionOperation, { kind: 'resourceMutation' }>;
}

describe('canonical battle point resource', () => {
  it('distinguishes absent from present zero and derives phase/rate live', () => {
    const absent = readBattlePoint(emptyBattlePointState(), 'attacker', 'gauge');
    expect(absent).toBeUndefined();
    const knownAbsent = reconcileBattlePointActor({
      state: emptyBattlePointState(),
      actor: 'attacker',
      actorId: 'other',
      traits: new Set(),
      domains: [percentage],
    });
    expect(battlePointPhase(percentage, readBattlePoint(knownAbsent, 'attacker', 'gauge'))).toBe(0);
    expect(battlePointRate(readBattlePoint(knownAbsent, 'attacker', 'gauge'))).toBe(0);
    const state = reconcileBattlePointActor({
      state: emptyBattlePointState(),
      actor: 'attacker',
      actorId: 'owner',
      traits: new Set(['eligible']),
      domains: [percentage],
    });
    const zero = readBattlePoint(state, 'attacker', 'gauge');
    expect(zero).toMatchObject({ kind: 'present', point: 0, capacity: 4 });
    expect(battlePointPhase(percentage, zero)).toBe(1);
    expect(battlePointRate(zero)).toBe(0);
  });

  it('keeps every legal same-phase point and applies trait capacity reconciliation', () => {
    expect(battlePointPhaseCandidates(percentage, 2, 8)).toEqual([4, 5]);
    let state = reconcileBattlePointActor({
      state: emptyBattlePointState(),
      actor: 'attacker',
      actorId: 'owner',
      traits: new Set(['eligible']),
      domains: [percentage],
      initialPoints: { gauge: 4 },
    });
    state = reconcileBattlePointActor({
      state,
      actor: 'attacker',
      actorId: 'owner',
      traits: new Set(['eligible', 'large']),
      domains: [percentage],
    });
    expect(readBattlePoint(state, 'attacker', 'gauge')).toMatchObject({ point: 4, capacity: 8 });
    state = reconcileBattlePointActor({
      state,
      actor: 'attacker',
      actorId: 'owner',
      traits: new Set(),
      domains: [percentage],
    });
    expect(readBattlePoint(state, 'attacker', 'gauge')).toEqual({
      kind: 'absent',
      eligible: false,
    });
  });

  it('separates actors and domains, clamps finite capacity, and leaves absolute domains uncapped', () => {
    let state = reconcileBattlePointActor({
      state: emptyBattlePointState(),
      actor: 'attacker',
      actorId: 'owner',
      traits: new Set(['eligible']),
      domains: [percentage, absolute],
    });
    state = reconcileBattlePointActor({
      state,
      actor: 'support:1',
      actorId: 'other',
      traits: new Set(['eligible']),
      domains: [percentage, absolute],
    });
    const gain = applyBattlePointOperation({
      state,
      domains: [percentage, absolute],
      operation: mutation('gain', 'gauge', 12),
      source,
      valueSetIndex: 0,
      identity: 'gain',
    });
    expect(gain.status).toBe('applied');
    if (gain.status !== 'applied') return;
    expect(readBattlePoint(gain.state, 'attacker', 'gauge')).toMatchObject({ point: 4 });
    expect(readBattlePoint(gain.state, 'support:1', 'gauge')).toMatchObject({ point: 0 });
    expect(readBattlePoint(gain.state, 'attacker', 'bond')).toMatchObject({
      point: 0,
      capacity: null,
    });
    expect(readBattlePoint(gain.state, 'support:1', 'bond')).toEqual({
      kind: 'absent',
      eligible: false,
    });
    const supportGain = applyBattlePointOperation({
      state: gain.state,
      domains: [percentage, absolute],
      operation: mutation('gain', 'gauge', 2),
      source: { ...source, origin: 'support', sourceInstanceId: 'support:1' },
      valueSetIndex: 0,
      identity: 'support-gain',
    });
    expect(supportGain.status).toBe('applied');
    if (supportGain.status === 'applied') {
      expect(readBattlePoint(supportGain.state, 'attacker', 'gauge')).toMatchObject({ point: 4 });
      expect(readBattlePoint(supportGain.state, 'support:1', 'gauge')).toMatchObject({ point: 2 });
    }
  });

  it('fails closed before mutating an unknown domain', () => {
    const state = reconcileBattlePointActor({
      state: emptyBattlePointState(),
      actor: 'attacker',
      actorId: 'owner',
      traits: new Set(['eligible']),
      domains: [percentage],
    });
    const result = applyBattlePointOperation({
      state,
      domains: [percentage],
      operation: mutation('gain', 'unknown', 1),
      source,
      valueSetIndex: 0,
      identity: 'invalid',
    });
    expect(result).toEqual({ status: 'unsupported', state });
    const capacity = applyBattlePointOperation({
      state,
      domains: [percentage],
      operation: {
        kind: 'battlePointCapacityModifier',
        recipient: 'sourceSelf',
        subjectId: 'unknown',
        values: [[1], [1], [1], [1], [1]],
        lifetime: 'active',
        traits: [],
      },
      source,
      valueSetIndex: 0,
      identity: 'unknown-capacity',
    });
    expect(capacity).toEqual({ status: 'unsupported', state });
  });

  it('matches an independent exhaustive phase oracle at every finite capacity boundary', () => {
    for (let capacity = 1; capacity <= 12; capacity++) {
      const oracle = new Map<number, number[]>();
      for (let point = 0; point <= capacity; point++) {
        const rate = Math.floor((point * 1000) / capacity);
        const phase = rate >= 1000 ? 4 : rate >= 750 ? 3 : rate >= 500 ? 2 : 1;
        oracle.set(phase, [...(oracle.get(phase) ?? []), point]);
      }
      for (const phase of [1, 2, 3, 4])
        expect(battlePointPhaseCandidates(percentage, phase, capacity)).toEqual(
          oracle.get(phase) ?? [],
        );
      const represented = [...oracle.values()].flat();
      expect(new Set(represented).size).toBe(capacity + 1);
      expect(Math.max(...represented)).toBe(capacity);
    }
  });
});
