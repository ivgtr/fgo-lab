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
      execution: [{ kind: 'damageModifier', values: [[600], [], [], [], []] }],
    });
    expect(effects[0]?.execution[0]).not.toHaveProperty('limitBreakValues');
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
      execution: [{ kind: 'damageModifier', values: [[200], [], [], [], []] }],
    });
    expect(effects[1]?.execution[0]).not.toHaveProperty('limitBreakValues');
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
