import { describe, expect, it } from 'vitest';
import {
  rebaseHpMaximum,
  hpModifierValue,
  seedHp,
  hpAlive,
  hpPermille,
  hpRatio,
  transitionHp,
  changeHpModifiers,
  type HpModifierInstance,
  type HpState,
} from './hpResource';
import { evaluateHpValueExpression } from './hpValueExpression';
describe('adopted HP reference arithmetic', () => {
  it('separates missing, zero, positive displayed zero and continuous NP ratio', () => {
    expect(seedHp(11000, null)).toEqual({ kind: 'missing' });
    expect(hpAlive(seedHp(11000, 0))).toBe(false);
    const actor = { kind: 'absolute' as const, current: 1, maximum: 11000, baseMaximum: 11000 };
    expect(hpAlive(actor)).toBe(true);
    expect(hpPermille(actor)).toBe(0);
    expect(hpRatio(actor)).toBe(1 / 11000);
    expect(hpRatio(seedHp(undefined, 500))).toBeNull();
    expect(hpRatio(seedHp(undefined, 1000))).toBe(1);
    expect(seedHp(Number.MAX_SAFE_INTEGER, 1000)).toMatchObject({
      current: Number.MAX_SAFE_INTEGER,
    });
    expect(seedHp(1, 1)).toMatchObject({ current: 1 });
  });
  it('uses double receive then give, truncates once, and clamps actual gain', () => {
    const actor = seedHp(10000, 500);
    expect(
      transitionHp(actor, {
        direction: 'gain',
        unit: 'fixed',
        amount: 3000,
        receive: 1300,
        give: 1000,
      }),
    ).toMatchObject({ attempted: 3900, actual: 3900, actor: { current: 8900 } });
    expect(transitionHp(actor, { direction: 'gain', unit: 'fixed', amount: 10000 })).toMatchObject({
      attempted: 10000,
      actual: 5000,
    });
    expect(
      transitionHp(actor, {
        direction: 'gain',
        unit: 'fixed',
        amount: 200,
        receive: 1050,
        give: 1100,
      }),
    ).toMatchObject({ attempted: 231 });
  });
  it('uses maximum for percentage, preserves safe floor and never revives', () => {
    const actor = seedHp(11001, 500);
    expect(
      transitionHp(actor, { direction: 'loss', unit: 'percent', amount: 333, lossFloor: 'zero' }),
    ).toMatchObject({ attempted: 3663, actor: { current: 1837 } });
    for (const direction of ['gain', 'loss'] as const)
      expect(
        transitionHp(seedHp(10000, 0), {
          direction,
          unit: 'fixed',
          amount: 20000,
          lossFloor: 'oneIfAlive',
        }),
      ).toMatchObject({ actual: 0, actor: { current: 0 } });
    expect(
      transitionHp(actor, {
        direction: 'loss',
        unit: 'fixed',
        amount: 20000,
        lossFloor: 'oneIfAlive',
      }),
    ).toMatchObject({ actor: { current: 1 } });
    expect(
      transitionHp(actor, { direction: 'loss', unit: 'fixed', amount: 20000, lossFloor: 'zero' }),
    ).toMatchObject({ actor: { current: 0 } });
  });
  it('distinguishes ordinary maximum removal and positive base removal', () => {
    const state: HpState = { actors: { attacker: seedHp(10000, 500) }, receipts: [] };
    const instance: HpModifierInstance = {
      id: 'max',
      actor: 'attacker',
      formKey: null,
      value: 2000,
      operation: {
        kind: 'hpModifier',
        action: 'maximumFixed',
        sign: -1,
        bounds: { minimum: null, maximum: null },
        values: [[2000], [], [], [], []],
        traits: ['negative'],
        lifetime: 'active',
        route: {
          target: 'sourceSelf',
          contributionScope: 'personal',
          eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
        },
      },
    };
    const added = changeHpModifiers(state, 'attacker', instance, () => false);
    expect(added.actors.attacker).toMatchObject({ current: 3000, maximum: 8000 });
    expect(changeHpModifiers(added, 'attacker', null, () => true).actors.attacker).toMatchObject({
      current: 3000,
      maximum: 10000,
    });
    const base = changeHpModifiers(
      state,
      'attacker',
      { ...instance, operation: { ...instance.operation, action: 'baseFixed', sign: 1 } },
      () => false,
    );
    expect(base.actors.attacker).toMatchObject({ current: 7000, maximum: 12000 });
    expect(changeHpModifiers(base, 'attacker', null, () => true).actors.attacker).toMatchObject({
      current: 5000,
      maximum: 10000,
    });
  });
  it('aggregates receive/give and maximum rate under their own reference bounds', () => {
    const instance: HpModifierInstance = {
      id: 'rate',
      actor: 'attacker',
      formKey: null,
      value: 40000,
      operation: {
        kind: 'hpModifier',
        action: 'receive',
        sign: 1,
        bounds: { minimum: 0, maximum: 50000 },
        values: [[40000], [], [], [], []],
        traits: [],
        lifetime: 'active',
        route: {
          target: 'sourceSelf',
          contributionScope: 'personal',
          eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
        },
      },
    };
    const state: HpState = {
      actors: { attacker: seedHp(10000, 500) },
      receipts: [],
      modifiers: [instance, { ...instance, id: 'second' }],
    };
    expect(hpModifierValue(state, 'attacker', 'receive')).toBe(49000);
    expect(
      hpModifierValue(
        { ...state, modifiers: [{ ...instance, operation: { ...instance.operation, sign: -1 } }] },
        'attacker',
        'receive',
      ),
    ).toBe(-1000);
    expect(
      hpModifierValue(
        {
          ...state,
          modifiers: [
            {
              ...instance,
              operation: {
                ...instance.operation,
                action: 'maximumRate',
                bounds: { minimum: -1000, maximum: 5000 },
              },
            },
          ],
        },
        'attacker',
        'maximumRate',
      ),
    ).toBe(5000);
  });
  it('rebases form HP before removing the old ordinary maximum bonus', () => {
    const old: HpModifierInstance = {
      id: 'old-form',
      actor: 'attacker',
      formKey: 'old',
      value: 2000,
      operation: {
        kind: 'hpModifier',
        action: 'maximumFixed',
        sign: 1,
        bounds: { minimum: null, maximum: null },
        values: [[2000], [], [], [], []],
        traits: [],
        lifetime: 'constant',
        route: {
          target: 'sourceSelf',
          contributionScope: 'personal',
          eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
        },
      },
    };
    const initial = changeHpModifiers(
      { actors: { attacker: seedHp(10000, 1000) }, receipts: [] },
      'attacker',
      old,
      () => false,
    );
    const transformed = rebaseHpMaximum(initial, 'attacker', 8000, 'form-change');
    expect(transformed.actors.attacker).toMatchObject({
      baseMaximum: 8000,
      maximum: 10000,
      current: 10000,
    });
    expect(
      changeHpModifiers(transformed, 'attacker', null, (instance) => instance.formKey === 'old')
        .actors.attacker,
    ).toMatchObject({ maximum: 8000, current: 8000 });
    expect(initial.actors.attacker).toMatchObject({ maximum: 12000, current: 12000 });
  });
  it('does not retain lower contribution above the declared HP range', () => {
    expect(
      evaluateHpValueExpression(
        {
          kind: 'hpRangeLinear',
          basePermille: 100,
          valueAtMinimumHpPermille: 500,
          valueAtMaximumHpPermille: 200,
          minimumHpPermille: 100,
          maximumHpPermille: 800,
        },
        801,
      ),
    ).toBe(100);
  });
});
