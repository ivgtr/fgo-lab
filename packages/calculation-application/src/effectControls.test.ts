import type { EffectProjection } from '@fgo-lab/battle-execution';
import { describe, expect, it } from 'vitest';
import { deriveEffectPresentationState } from './effectControls';

function projection(overrides: Partial<EffectProjection> = {}): EffectProjection {
  return {
    projectionKey: 'effect',
    operationId: 'operation',
    contributionId: 'operation:modifier',
    label: 'effect',
    sourceName: 'source',
    skillName: 'skill',
    gameActivation: 'skillUse',
    sourceActive: true,
    proc: { kind: 'guaranteed' },
    procRatePermille: 1_000,
    valuePermille: 200,
    value: 0.2,
    requiredQuantity: null,
    requiredQuantityOwner: null,
    requiredInputs: [],
    modifier: 'attackBuff',
    source: {
      origin: 'attacker',
      sourceInstanceId: 'attacker:1',
      sourceId: '1',
      skillId: 'skill',
      effectId: 'effect',
      effectOccurrenceId: 'effect:0',
    },
    contributionScope: 'personal',
    contributionControl: 'operation',
    activationSources: [],
    executionSupport: 'supported',
    outcome: 'applied',
    visibility: 'visible',
    controllability: 'user',
    selectionGroups: [],
    decision: {
      state: 'enabled',
      decisionKey: 'effect',
      kind: 'effect',
      plan: { activation: 'user', condition: 'evaluate' },
    },
    conditionDecision: 'none',
    explanation: { code: 'applied', condition: null },
    ...overrides,
  };
}

describe('effect presentation state', () => {
  it('keeps exclusion, proc, source, condition, and support failures mutually distinct', () => {
    const disabledDecision = {
      state: 'disabled' as const,
      decisionKey: 'effect',
      kind: 'effect' as const,
      plan: { activation: 'user' as const, condition: 'evaluate' as const },
    };
    const condition = {
      kind: 'quantity' as const,
      quantity: 'attackerHpPermille' as const,
      comparison: 'atMost' as const,
      value: 500,
    };
    expect(deriveEffectPresentationState(projection(), true, false)).toBe('applied');
    expect(
      deriveEffectPresentationState(
        projection({
          decision: disabledDecision,
          outcome: 'notApplied',
          explanation: { code: 'disabled', condition: null },
        }),
        false,
        false,
      ),
    ).toBe('manuallyExcluded');
    expect(
      deriveEffectPresentationState(
        projection({
          proc: { kind: 'singleRoll', ratePermille: [[600], [600], [600], [600], [600]] },
          procRatePermille: 600,
          decision: disabledDecision,
          outcome: 'notApplied',
        }),
        false,
        false,
      ),
    ).toBe('procFailed');
    expect(deriveEffectPresentationState(projection({ sourceActive: false }), false, false)).toBe(
      'sourceInactive',
    );
    expect(
      deriveEffectPresentationState(
        projection({
          outcome: 'notApplied',
          explanation: { code: 'conditionNotMet', condition },
        }),
        true,
        false,
      ),
    ).toBe('conditionUnsatisfied');
    expect(
      deriveEffectPresentationState(
        projection({
          outcome: 'notApplied',
          conditionDecision: 'evaluate',
          explanation: {
            code: 'conditionNotMet',
            condition: { kind: 'trait', scope: 'target', trait: 'dragon', present: true },
          },
        }),
        false,
        true,
      ),
    ).toBe('conditionUnselected');
    expect(
      deriveEffectPresentationState(projection({ outcome: 'unsupported' }), false, false),
    ).toBe('unsupported');
    expect(deriveEffectPresentationState(projection({ outcome: 'impossible' }), false, false)).toBe(
      'impossible',
    );
  });

  it('uses chained count activity as the proc success state', () => {
    const chained = projection({
      proc: {
        kind: 'chainedRolls',
        ratePermille: [[800], [800], [800], [800], [800]],
        seriesKey: 'proc',
        index: 0,
        maximumSuccesses: 5,
      },
    });
    expect(deriveEffectPresentationState(chained, false, false)).toBe('procFailed');
    expect(deriveEffectPresentationState(chained, true, false)).toBe('applied');
  });
});
