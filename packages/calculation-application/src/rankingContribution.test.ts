import type {
  ContributionComponent,
  EffectProjection,
  EffectiveContributionSet,
} from '@fgo-lab/battle-execution';
import { describe, expect, it } from 'vitest';
import { rankingEffectContributes } from './rankingContribution';

const effect = (
  component: ContributionComponent,
  outcome: EffectProjection['outcome'] = 'applied',
) =>
  ({
    operationId: 'operation',
    contributionId: `operation:${component}`,
    outcome,
  }) as unknown as EffectProjection;
const contribution = (
  component: 'modifier' | 'npBase' | 'npSpecial',
  effective: boolean,
): EffectiveContributionSet => ({
  contributions: [
    {
      contributionId: `operation:${component}`,
      presentationGroupId: 'effect',
      operationId: 'operation',
      component,
      modifier:
        component === 'npSpecial' ? 'npSpecial' : component === 'npBase' ? null : 'powerMod',
      resolvedValue: 500,
      outputAddress: `damage.${component}`,
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
    expect(rankingEffectContributes(effect('modifier'), contribution('modifier', true))).toBe(true);
    expect(rankingEffectContributes(effect('modifier'), contribution('modifier', false))).toBe(
      false,
    );
  });

  it('does not let an effective NP base satisfy an excluded NP-special projection', () => {
    expect(rankingEffectContributes(effect('npSpecial'), contribution('npBase', true))).toBe(false);
    expect(rankingEffectContributes(effect('npSpecial'), contribution('npSpecial', false))).toBe(
      false,
    );
    expect(rankingEffectContributes(effect('npSpecial'), contribution('npSpecial', true))).toBe(
      true,
    );
  });

  it('keeps matching and nonmatching trait-count projections separate over one contribution', () => {
    const aggregate = contribution('npSpecial', true);

    expect(rankingEffectContributes(effect('npSpecial', 'applied'), aggregate)).toBe(true);
    expect(rankingEffectContributes(effect('npSpecial', 'notApplied'), aggregate)).toBe(false);
  });
});
