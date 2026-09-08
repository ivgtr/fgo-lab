import type { CanonicalNpResourceSemantics } from '@fgo-lab/master-data';
import { describe, expect, it } from 'vitest';
import {
  applyNpResourceTransaction,
  createNpResourceState,
  deriveBaseOvercharge,
} from './npResource';

const semantics: CanonicalNpResourceSemantics = {
  unit: 'basisPoints',
  capacityByNpLevel: [10_000, 20_000, 20_000, 20_000, 30_000],
  noblePhantasmUse: {
    requirement: 10_000,
    consumption: 'all',
    baseOvercharge: { gaugePerStage: 10_000, minimumStage: 1, maximumBaseStage: 3 },
  },
};

describe('canonical NP resource execution', () => {
  it.each([
    [9_999, 'rejected', 'insufficientGauge'],
    [10_000, 'applied', undefined],
    [15_000, 'applied', undefined],
  ] as const)('classifies requirement boundary %i', (gauge, status, code) => {
    const result = applyNpResourceTransaction(
      semantics,
      createNpResourceState(semantics, 2, gauge),
      { requirement: { kind: 'atLeast', amount: 10_000 }, mutations: [] },
    );
    expect(result.status).toBe(status);
    if (code) expect(result).toMatchObject({ code });
  });

  it('clamps gain and loss to canonical capacity boundaries', () => {
    const gained = applyNpResourceTransaction(
      semantics,
      createNpResourceState(semantics, 2, 19_000),
      { requirement: null, mutations: [{ kind: 'gain', amount: 5_000 }] },
    );
    expect(gained).toMatchObject({ status: 'applied', state: { gauge: 20_000 } });
    const lost = applyNpResourceTransaction(semantics, createNpResourceState(semantics, 2, 1_000), {
      requirement: null,
      mutations: [{ kind: 'loss', amount: 5_000 }],
    });
    expect(lost).toMatchObject({ status: 'applied', state: { gauge: 0 } });
  });

  it('derives base OC before all-consume', () => {
    expect(deriveBaseOvercharge(semantics, 10_000)).toBe(1);
    expect(deriveBaseOvercharge(semantics, 20_000)).toBe(2);
    expect(deriveBaseOvercharge(semantics, 30_000)).toBe(3);
    const result = applyNpResourceTransaction(
      semantics,
      createNpResourceState(semantics, 5, 30_000),
      { requirement: { kind: 'atLeast', amount: 10_000 }, mutations: [{ kind: 'consumeAll' }] },
    );
    expect(result).toMatchObject({ status: 'applied', state: { gauge: 0 }, baseOvercharge: 3 });
  });

  it('rejects contradictions and rolls back the whole transaction', () => {
    const original = createNpResourceState(semantics, 2, 10_000);
    expect(
      applyNpResourceTransaction(semantics, original, {
        requirement: { kind: 'atLeast', amount: 30_000 },
        mutations: [],
      }),
    ).toEqual({ status: 'rejected', code: 'requirementExceedsCapacity', state: original });
    expect(
      applyNpResourceTransaction(semantics, original, {
        requirement: null,
        mutations: [
          { kind: 'gain', amount: 5_000 },
          { kind: 'unsupported', family: 'dependentTargetResult' },
        ],
      }),
    ).toEqual({ status: 'rejected', code: 'unsupportedMutation', state: original });
  });
});

describe('current NP proportional gain', () => {
  it.each([
    [5000, 1000, 10000],
    [10000, 500, 15000],
    [10001, 550, 15501],
    [0, 1000, 0],
    [20000, 1000, 20000],
    [15000, 1000, 20000],
  ])('reads %i immediately and adds %i permille before clamping', (gauge, permille, expected) => {
    expect(
      applyNpResourceTransaction(semantics, createNpResourceState(semantics, 2, gauge), {
        requirement: null,
        mutations: [{ kind: 'gainCurrentGaugeRatio', permille }],
      }),
    ).toMatchObject({ status: 'applied', state: { gauge: expected } });
  });
  it('reads each preceding write, including saturation and all-consume', () => {
    const state = createNpResourceState(semantics, 2, 15000);
    expect(
      applyNpResourceTransaction(semantics, state, {
        requirement: null,
        mutations: [
          { kind: 'gainCurrentGaugeRatio', permille: 1000 },
          { kind: 'loss', amount: 12000 },
          { kind: 'gainCurrentGaugeRatio', permille: 500 },
          { kind: 'consumeAll' },
          { kind: 'gainCurrentGaugeRatio', permille: 1000 },
        ],
      }),
    ).toMatchObject({ status: 'applied', state: { gauge: 0 }, baseOvercharge: 1 });
  });
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])(
    'rejects invalid coefficient %s atomically',
    (permille) => {
      const state = createNpResourceState(semantics, 2, 5000);
      expect(
        applyNpResourceTransaction(semantics, state, {
          requirement: null,
          mutations: [
            { kind: 'gain', amount: 1000 },
            { kind: 'gainCurrentGaugeRatio', permille },
          ],
        }),
      ).toEqual({ status: 'rejected', code: 'invalidMutation', state });
    },
  );
});
