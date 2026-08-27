import type { EffectProjection } from '@fgo-lab/calculation-application';
import { describe, expect, it } from 'vitest';
import { isEffectSelected, visibleAppliedEffects } from './AppliedEffects';

function projection(visibility: EffectProjection['visibility']): EffectProjection {
  return {
    projectionKey: visibility,
    operationId: visibility,
    label: '火力効果',
    sourceName: 'source',
    skillName: 'skill',
    gameActivation: 'skillUse',
    sourceActive: true,
    proc: { kind: 'guaranteed' },
    procRatePermille: 1_000,
    valuePermille: 300,
    value: 0.3,
    requiredQuantity: null,
    requiredQuantityOwner: null,
    requiredInputs: [],
    modifier: 'attackBuff',
    source: {
      origin: 'attacker',
      sourceInstanceId: 'source',
      sourceId: 'source',
      skillId: 'skill',
      effectId: 'effect',
      effectOccurrenceId: 'effect:0',
    },
    activationSources: [],
    executionSupport: 'supported',
    outcome: 'applied',
    visibility,
    controllability: 'user',
    selectionGroups: [],
    decision: {
      state: 'enabled',
      decisionKey: visibility,
      kind: 'effect',
      plan: { activation: 'user', condition: 'evaluate' },
    },
    conditionDecision: 'none',
    explanation: { code: 'applied', condition: null },
  };
}

describe('typed applied-effect projection', () => {
  it('uses the projection visibility contract directly', () => {
    expect(visibleAppliedEffects([projection('hidden'), projection('visible')])).toEqual([
      projection('visible'),
    ]);
  });

  it('keeps a conflicting selected decision visibly pressed until the user resolves it', () => {
    const selected = {
      ...projection('visible'),
      outcome: 'notApplied' as const,
      explanation: {
        code: 'conditionNotMet' as const,
        condition: {
          kind: 'trait' as const,
          scope: 'target' as const,
          trait: 'attributeSky',
          present: true,
        },
      },
    };

    expect(isEffectSelected(selected)).toBe(true);
    expect(
      isEffectSelected({
        ...selected,
        decision: {
          state: 'disabled',
          decisionKey: selected.projectionKey,
          kind: 'effect',
          plan: { activation: 'user', condition: 'evaluate' },
        },
      }),
    ).toBe(false);
  });
});
