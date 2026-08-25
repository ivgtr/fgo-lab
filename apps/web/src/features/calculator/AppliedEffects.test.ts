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
});
