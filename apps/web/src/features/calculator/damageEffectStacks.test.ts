import { describe, expect, it } from 'vitest';
import type { ResolvedEffect } from '@fgo-lab/effect-resolver';
import { collectDamageEffectStacks, damageEffectStateLabel } from './damageEffectStacks';

function effect(patch: Partial<ResolvedEffect>): ResolvedEffect {
  return {
    order: 0,
    effectKey: 'passive:servant-1:passive-1:quick-up',
    sourceInstanceId: 'passive:servant-1',
    origin: 'passive',
    sourceId: 'servant-1',
    sourceName: 'リリス',
    skillId: 'passive-1',
    skillName: '騎乗 EX',
    effectId: 'quick-up',
    label: 'クイックアップ',
    value: 0.12,
    valuePermille: 120,
    kind: 'cardBuff',
    damageTraitCondition: null,
    requiredFieldTraits: [],
    damageRelevant: true,
    state: 'applied',
    reason: 'unconditional_attacker_buff',
    ...patch,
  };
}

describe('damage effect stacks', () => {
  it('groups every damage source by calculation modifier without duplicating it', () => {
    const quick = effect({});
    const fixedDamage = effect({
      skillId: 'passive-2',
      skillName: '神性 B',
      effectId: 'flat-damage',
      label: 'アタックプラス',
      value: 175,
      valuePermille: null,
      kind: 'flatDamage',
    });
    const stacks = collectDamageEffectStacks({
      effects: [quick, quick, fixedDamage],
      servants: [],
      craftEssence: undefined,
    });

    expect(stacks.map((stack) => [stack.kind, stack.sources.length])).toEqual([
      ['cardBuff', 1],
      ['flatDamage', 1],
    ]);
    expect(damageEffectStateLabel(stacks[0]!.sources[0]!)).toBe('+12%');
    expect(damageEffectStateLabel(stacks[1]!.sources[0]!)).toBe('+175');
  });

  it('keeps inactive and unsupported damage effects visible with their reason', () => {
    const stacks = collectDamageEffectStacks({
      effects: [
        effect({ state: 'rejected', reason: 'card_type_mismatch' }),
        effect({
          effectId: 'unknown',
          label: '未知の威力アップ',
          kind: null,
          value: null,
          state: 'rejected',
          reason: 'damage_effect_not_supported',
        }),
      ],
      servants: [],
      craftEssence: undefined,
    });

    expect(stacks.map((stack) => stack.kind)).toEqual(['cardBuff', 'unresolved']);
    expect(damageEffectStateLabel(stacks[0]!.sources[0]!)).toBe('カード不一致');
    expect(damageEffectStateLabel(stacks[1]!.sources[0]!)).toBe('未対応');
  });

  it('translates structured damage conditions without exposing master identifiers', () => {
    const stacks = collectDamageEffectStacks({
      effects: [
        effect({
          origin: 'np',
          label: '特攻宝具',
          kind: null,
          damageTraitCondition: {
            kind: 'npSpecial',
            condition: { anyOf: ['buffCharm'], noneOf: [] },
          },
        }),
      ],
      servants: [],
      craftEssence: undefined,
    });

    expect(stacks[0]?.sources[0]?.effectLabel).toBe('魅了特攻');
    expect(stacks[0]?.sources[0]?.effectLabel).not.toContain('buffCharm');
  });
});
