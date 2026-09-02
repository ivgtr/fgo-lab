import type { EffectProjection, EffectiveContributionSet } from '@fgo-lab/battle-execution';
import { describe, expect, it } from 'vitest';
import { rankingEffectContributes } from './rankingContribution';

const effect = { operationId: 'operation' } as EffectProjection;
const contribution = (effective: boolean): EffectiveContributionSet => ({
  contributions: [
    {
      contributionId: 'operation:modifier',
      presentationGroupId: 'effect',
      operationId: 'operation',
      component: 'modifier',
      modifier: 'powerMod',
      resolvedValue: 500,
      outputAddress: 'damage.modifier',
      source: {
        origin: 'attacker',
        sourceInstanceId: 'attacker',
        sourceId: 'attacker',
        skillId: 'skill',
        effectId: 'effect',
        effectOccurrenceId: 'effect:0',
      },
      executionOutcome: 'applied',
      selfDecision: effective
        ? { kind: 'included' }
        : { kind: 'excluded', reason: 'selfBuffPolicy' },
      conditionDecision: { kind: 'included' },
      areaViewDecision: { kind: 'included' },
      effective,
      presentationCounted: true,
    },
  ],
  effectivePresentationGroupIds: effective ? new Set(['effect']) : new Set(),
});

describe('effective ranking contribution state', () => {
  it('reads the canonical application result instead of re-evaluating policy', () => {
    expect(rankingEffectContributes(effect, contribution(true))).toBe(true);
    expect(rankingEffectContributes(effect, contribution(false))).toBe(false);
  });
});
