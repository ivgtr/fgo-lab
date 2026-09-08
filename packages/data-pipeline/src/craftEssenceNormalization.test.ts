import { describe, expect, it } from 'vitest';
import { normalizeCraftEssenceLimitBreakEffects } from './craftEssenceNormalization';
import { normalizeFunctions } from './effectNormalization';

function effect(funcId: number, buffType: string, value: number) {
  return {
    funcId,
    funcType: 'addStateShort',
    funcTargetType: 'self',
    funcPopupText: `effect-${String(funcId)}`,
    svals: [{ Value: value }],
    buffs: [{ type: buffType }],
  };
}

function normalized(functions: ReturnType<typeof effect>[]) {
  return normalizeFunctions(functions, new Map());
}

describe('craft essence limit-break normalization', () => {
  it('uses normal values explicitly when no limit-break skill exists', () => {
    const effects = normalizeCraftEssenceLimitBreakEffects({
      equipId: 1,
      normalEffects: normalized([effect(20, 'upNpdamage', 600)]),
      limitBreakEffects: null,
    });
    expect(effects[0]).toMatchObject({
      availability: 'allLimitBreakStates',
      execution: [
        {
          kind: 'damageModifier',
          values: [[600], [], [], [], []],
          limitBreakValues: [[600], [], [], [], []],
        },
      ],
    });
  });

  it('copies MLB values only from a semantically identical shared occurrence', () => {
    const effects = normalizeCraftEssenceLimitBreakEffects({
      equipId: 1,
      normalEffects: normalized([effect(20, 'upNpdamage', 600)]),
      limitBreakEffects: normalized([effect(20, 'upNpdamage', 800)]),
    });
    expect(effects[0]).toMatchObject({
      occurrenceId: '20:0',
      availability: 'allLimitBreakStates',
      execution: [
        {
          kind: 'damageModifier',
          values: [[600], [], [], [], []],
          limitBreakValues: [[800], [], [], [], []],
        },
      ],
    });
  });

  it('keeps an MLB-only effect as an independent occurrence', () => {
    const effects = normalizeCraftEssenceLimitBreakEffects({
      equipId: 1,
      normalEffects: normalized([effect(20, 'upNpdamage', 600)]),
      limitBreakEffects: normalized([effect(20, 'upNpdamage', 800), effect(21, 'upAtk', 200)]),
    });
    expect(effects[1]).toMatchObject({
      occurrenceId: '21:0',
      availability: 'maximumLimitBreakOnly',
      execution: [
        {
          kind: 'damageModifier',
          values: [[200], [], [], [], []],
          limitBreakValues: [[200], [], [], [], []],
        },
      ],
    });
  });

  it('rejects a normal-side-only occurrence', () => {
    expect(() =>
      normalizeCraftEssenceLimitBreakEffects({
        equipId: 1,
        normalEffects: normalized([effect(20, 'upNpdamage', 600), effect(21, 'upAtk', 100)]),
        limitBreakEffects: normalized([effect(20, 'upNpdamage', 800)]),
      }),
    ).toThrow('craft_essence_limit_break_effect_missing:1:21:0');
  });

  it('rejects reordered shared occurrences because execution order is semantic', () => {
    expect(() =>
      normalizeCraftEssenceLimitBreakEffects({
        equipId: 1,
        normalEffects: normalized([effect(20, 'upNpdamage', 600), effect(21, 'upAtk', 100)]),
        limitBreakEffects: normalized([effect(21, 'upAtk', 200), effect(20, 'upNpdamage', 800)]),
      }),
    ).toThrow('craft_essence_limit_break_effect_order_mismatch:1');
  });

  it('rejects changed operation semantics for a shared occurrence', () => {
    expect(() =>
      normalizeCraftEssenceLimitBreakEffects({
        equipId: 1,
        normalEffects: normalized([effect(20, 'upNpdamage', 600)]),
        limitBreakEffects: normalized([effect(20, 'upAtk', 800)]),
      }),
    ).toThrow('craft_essence_limit_break_semantics_mismatch:1:20:0');
  });

  it('rejects ambiguous duplicate occurrences', () => {
    const shared = normalized([effect(20, 'upNpdamage', 600)])[0]!;
    expect(() =>
      normalizeCraftEssenceLimitBreakEffects({
        equipId: 1,
        normalEffects: [shared],
        limitBreakEffects: [shared, shared],
      }),
    ).toThrow('craft_essence_limit_break_occurrence_ambiguous:1');
  });
});

describe('current gauge ratio canonical cells', () => {
  const ratio = (value: number, funcType = 'gainMultiplyNp') =>
    normalizeFunctions(
      [
        {
          funcId: 90,
          funcType,
          funcTargetType: 'self',
          svals: [{ Value: value, Rate: 1000 }],
        },
      ],
      new Map(),
    );
  it('normalizes and joins normal/LB coefficients without comparing their numeric values', () => {
    const result = normalizeCraftEssenceLimitBreakEffects({
      equipId: 1,
      normalEffects: ratio(500),
      limitBreakEffects: ratio(1000),
    });
    expect(result[0]?.execution).toEqual([
      {
        kind: 'resourceMutation',
        resource: 'npGauge',
        direction: 'gain',
        unit: 'fixed',
        recipient: 'sourceSelf',
        subjectId: null,
        amount: {
          kind: 'currentGaugeRatio',
          values: [[500], [], [], [], []],
          limitBreakValues: [[1000], [], [], [], []],
        },
      },
    ]);
    expect(
      normalizeCraftEssenceLimitBreakEffects({
        equipId: 1,
        normalEffects: ratio(500),
        limitBreakEffects: null,
      })[0]?.execution,
    ).toMatchObject([{ amount: { limitBreakValues: [[500], [], [], [], []] } }]);
  });
  it('rejects fixed/proportional semantic mismatch across limit break', () => {
    expect(() =>
      normalizeCraftEssenceLimitBreakEffects({
        equipId: 1,
        normalEffects: ratio(500),
        limitBreakEffects: ratio(1000, 'gainNp'),
      }),
    ).toThrow(/semantics_mismatch/);
  });
});

it.each(['gainNp', 'lossNp', 'gainMultiplyNp'])(
  'retains an unknown %s target as unsupported canonical execution',
  (funcType) => {
    const effects = normalizeFunctions(
      [
        {
          funcId: 91,
          funcType,
          funcTargetType: 'unknown-target',
          svals: [{ Value: 1000, Rate: 1000 }],
        },
      ],
      new Map(),
    );
    expect(effects[0]?.execution).toMatchObject([
      { kind: 'unsupported', reason: 'unresolvedTarget', damageRelevant: true },
    ]);
  },
);

it.each(['lossHp', 'lossHpSafe', 'lossHpPerSafe'])(
  'keeps %s loss floor when joining normal/LB values and rejects a different floor',
  (funcType) => {
    const hp = (value: number, family = funcType) =>
      normalizeFunctions(
        [
          {
            funcId: 501,
            funcType: family,
            funcTargetType: 'self',
            svals: [{ Rate: 1000, Value: value }],
          },
        ],
        new Map(),
      );
    for (const limitBreakEffects of [hp(200), null]) {
      const merged = normalizeCraftEssenceLimitBreakEffects({
        equipId: 1,
        normalEffects: hp(100),
        limitBreakEffects,
      });
      expect(merged[0]?.execution).toMatchObject([
        {
          resource: 'hp',
          direction: 'loss',
          lossFloor: funcType === 'lossHp' ? 'zero' : 'oneIfAlive',
          amount: {
            values: [[100], [], [], [], []],
            limitBreakValues: [[limitBreakEffects ? 200 : 100], [], [], [], []],
          },
        },
      ]);
    }
    expect(() =>
      normalizeCraftEssenceLimitBreakEffects({
        equipId: 1,
        normalEffects: hp(100),
        limitBreakEffects: hp(200, funcType === 'lossHp' ? 'lossHpSafe' : 'lossHp'),
      }),
    ).toThrow(/semantics_mismatch/);
  },
);
