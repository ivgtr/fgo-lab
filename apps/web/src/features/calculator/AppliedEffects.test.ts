import { describe, expect, it } from 'vitest';
import type { ResolvedEffect } from '@fgo-lab/effect-resolver';
import { visibleAppliedEffects } from './AppliedEffects';

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
  it('hides automatic context plumbing but retains user-controlled context decisions', () => {
    const automatic = contextEffect('np');
    const controllable = contextEffect('attacker');

    expect(visibleAppliedEffects([automatic, controllable])).toEqual([controllable]);
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
