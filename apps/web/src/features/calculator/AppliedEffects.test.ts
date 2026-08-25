import type { EffectProjection } from '@fgo-lab/battle-execution';
import { describe, expect, it } from 'vitest';
import { isEffectSelected, visibleAppliedEffects } from './AppliedEffects';

function projection(visibility: EffectProjection['visibility']): EffectProjection {
  return {
    projectionKey: visibility,
    operationId: visibility,
    label: '火力効果',
    sourceName: 'source',
    skillName: 'skill',
    valuePermille: 300,
    value: 0.3,
    modifier: 'attackBuff',
    source: {
      origin: 'attacker',
      sourceInstanceId: 'source',
      sourceId: 'source',
      skillId: 'skill',
      effectId: 'effect',
    },
    outcome: 'applied',
    visibility,
    controllability: 'user',
    decision: { state: 'enabled', decisionKey: visibility, mode: 'enableOperation' },
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
      isEffectSelected({ ...selected, decision: { ...selected.decision, state: 'disabled' } }),
    ).toBe(false);
  });
});
