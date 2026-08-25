import { describe, expect, it } from 'vitest';
import type { ResolvedEffect } from '@fgo-lab/effect-resolver';
import { isAppliedEffectUserControllable, visibleAppliedEffects } from './AppliedEffects';

function contextEffect(origin: ResolvedEffect['origin']): ResolvedEffect {
  return {
    order: 0,
    effectKey: `${origin}:context`,
    sourceInstanceId: origin,
    origin,
    sourceId: 'source',
    sourceName: 'source',
    skillId: 'skill',
    skillName: 'skill',
    effectId: 'effect',
    label: 'フィールド変化',
    value: null,
    valuePermille: null,
    kind: null,
    damageTraitCondition: null,
    requiredFieldTraits: [],
    contextChanges: { addedFieldTraits: ['fixtureField'], addedRecipientTraits: [] },
    damageRelevant: true,
    state: 'applied',
    reason: 'battle_context_applied',
  };
}

describe('applied effect presentation', () => {
  it('hides context plumbing regardless of its source', () => {
    const automatic = contextEffect('np');
    const controllable = contextEffect('attacker');

    expect(visibleAppliedEffects([automatic, controllable])).toEqual([]);
    expect(isAppliedEffectUserControllable(automatic)).toBe(false);
    expect(isAppliedEffectUserControllable(controllable)).toBe(false);
  });

  it('lets the user assert conditions on an NP damage effect', () => {
    const conditionalNpEffect: ResolvedEffect = {
      ...contextEffect('np'),
      effectKey: 'np:conditional-power',
      label: '威力アップ・対天の力',
      kind: 'powerMod',
      value: 0.5,
      valuePermille: 500,
      damageTraitCondition: {
        kind: 'powerMod',
        condition: {
          operator: 'any',
          traits: [{ name: 'attributeSky', negative: false }],
        },
      },
      requiredFieldTraits: ['fieldHeaven'],
      contextChanges: { addedFieldTraits: [], addedRecipientTraits: [] },
      state: 'rejected',
      reason: 'trait_condition_mismatch',
    };

    expect(visibleAppliedEffects([conditionalNpEffect])).toEqual([conditionalNpEffect]);
    expect(isAppliedEffectUserControllable(conditionalNpEffect)).toBe(true);
  });

  it('does not strand a conditional automatic damage effect without presentation metadata', () => {
    const conditionalPassive: ResolvedEffect = {
      ...contextEffect('passive'),
      effectKey: 'passive:conditional-attack',
      label: '攻撃力アップ',
      kind: 'attackBuff',
      value: 0.2,
      valuePermille: 200,
      contextChanges: { addedFieldTraits: [], addedRecipientTraits: [] },
      state: 'rejected',
      reason: 'trait_condition_mismatch',
    };

    expect(visibleAppliedEffects([conditionalPassive])).toEqual([conditionalPassive]);
    expect(isAppliedEffectUserControllable(conditionalPassive)).toBe(true);
  });

  it('hides card buffs that cannot affect the selected NP card', () => {
    const applicable = {
      ...contextEffect('attacker'),
      effectKey: 'attacker:arts',
      label: 'アーツアップ',
      contextChanges: { addedFieldTraits: [], addedRecipientTraits: [] },
      kind: 'cardBuff' as const,
      value: 0.2,
      valuePermille: 200,
      state: 'rejected' as const,
      reason: 'calculation_effect_disabled',
    };
    const mismatch = {
      ...applicable,
      effectKey: 'attacker:buster',
      label: 'バスターアップ',
      reason: 'card_type_mismatch',
    };

    expect(visibleAppliedEffects([applicable, mismatch])).toEqual([applicable]);
  });
});
