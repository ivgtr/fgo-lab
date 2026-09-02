import { describe, expect, it } from 'vitest';
import type { OrderedScenarioExecution } from './executionTypes';
import { compareCandidateResults } from './candidateComparison';

function execution(
  targetClass: 'saber' | 'lancer',
  outcome: 'applied' | 'notApplied' = 'applied',
): OrderedScenarioExecution {
  return {
    effectiveContributions: { contributions: [], effectivePresentationGroupIds: new Set() },
    input: {
      attackerId: 'attacker',
      attackerLevel: 90,
      attackerAtk: 10_000,
      fouAtk: 1_000,
      craftEssenceAtk: 0,
      npLevel: 1,
      overcharge: 1,
      cardType: 'buster',
      classAttackRate: 1,
      classAffinity: 1,
      attributeAffinity: 1,
      attackBuff: 0,
      cardBuff: 0,
      npDamageBuff: 0,
      powerMod: 0,
      npSpecialMultiplier: 1,
      flatDamage: 0,
      damageCut: 0,
      ignoreDamageCut: false,
      ignoreDefense: false,
      attackerHpPermille: 1_000,
      targetRarity: null,
      targetStateTraits: [],
      battlePointPhase: null,
      fieldTraits: [],
      attackerStateTraits: [],
      target: { classId: targetClass, attribute: 'earth', traits: [] },
    } as unknown as OrderedScenarioExecution['input'],
    state: {} as OrderedScenarioExecution['state'],
    operations: [],
    projections: [
      {
        projectionKey: 'effect',
        operationId: 'operation',
        visibility: 'visible',
        outcome,
        explanation: { code: outcome === 'applied' ? 'applied' : 'conditionNotMet' },
        decision: { state: 'none' },
      } as OrderedScenarioExecution['projections'][number],
    ],
    retainedProjections: [],
    precision: 'exact',
    issues: [],
    requiredInputs: [],
    inputDefinitions: [],
  };
}

describe('candidate comparison', () => {
  it('collapses witness identities when damage and presentation are equivalent', () => {
    expect(compareCandidateResults([execution('saber'), execution('lancer')]).kind).toBe(
      'equivalent',
    );
  });

  it('does not silently select the first candidate when visible outcomes differ', () => {
    expect(
      compareCandidateResults([execution('saber'), execution('lancer', 'notApplied')]).kind,
    ).toBe('ambiguous');
  });
});
