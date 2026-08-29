import type { DamageContributionProjection, EffectProjection } from '@fgo-lab/battle-execution';
import { describe, expect, it } from 'vitest';
import { rankingEffectContributes, resolveRankingEffectContribution } from './rankingContribution';

function effect(patch: Partial<EffectProjection> = {}): EffectProjection {
  return {
    projectionKey: 'special',
    operationId: 'special-operation',
    label: '特攻',
    sourceName: 'source',
    skillName: 'skill',
    gameActivation: 'skillUse',
    sourceActive: true,
    proc: { kind: 'guaranteed' },
    procRatePermille: 1_000,
    valuePermille: 500,
    value: 0.5,
    requiredQuantity: null,
    requiredQuantityOwner: null,
    requiredInputs: [],
    modifier: 'powerMod',
    source: {
      origin: 'attacker',
      sourceInstanceId: 'attacker',
      sourceId: 'attacker',
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
      decisionKey: 'special',
      kind: 'effect',
      plan: { activation: 'user', condition: 'evaluate' },
    },
    conditionDecision: 'none',
    explanation: { code: 'applied', condition: null },
    ...patch,
  };
}

function projection(
  patch: Partial<DamageContributionProjection> = {},
): DamageContributionProjection {
  return {
    includedOperationIds: new Set(),
    excludedOperationIds: new Set(),
    excludedStateTraitContributions: {
      attackerState: new Set(),
      targetState: new Set(),
    },
    ...patch,
  };
}

describe('effective ranking contribution state', () => {
  it('separates execution outcome from ranking-policy contribution', () => {
    expect(resolveRankingEffectContribution(effect(), projection())).toBe('included');
    expect(
      resolveRankingEffectContribution(
        effect(),
        projection({ excludedOperationIds: new Set(['special-operation']) }),
      ),
    ).toBe('excludedByRankingPolicy');
    expect(resolveRankingEffectContribution(effect({ outcome: 'notApplied' }), projection())).toBe(
      'included',
    );
    expect(resolveRankingEffectContribution(effect({ outcome: 'unsupported' }), projection())).toBe(
      'included',
    );
    expect(rankingEffectContributes(effect({ outcome: 'notApplied' }), projection())).toBe(false);
    expect(rankingEffectContributes(effect({ outcome: 'unsupported' }), projection())).toBe(false);
  });

  it('honors scoped state contribution exclusions without changing the effect outcome', () => {
    const charmEffect = effect({
      explanation: {
        code: 'applied',
        condition: { kind: 'trait', scope: 'targetState', trait: 'buffCharm', present: true },
      },
    });
    const contribution = resolveRankingEffectContribution(
      charmEffect,
      projection({
        excludedStateTraitContributions: {
          attackerState: new Set(),
          targetState: new Set(['buffCharm']),
        },
      }),
    );
    expect(charmEffect.outcome).toBe('applied');
    expect(contribution).toBe('excludedByRankingPolicy');
  });
});
