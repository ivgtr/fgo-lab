import { summarizeExcludedExternalTargetContributions } from './excludedTargetContributions';
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

  it('summarizes only excluded external NP special truth across relative targets', () => {
    const excluded = (outcome: 'applied' | 'notApplied') => {
      const result = execution('saber', outcome);
      return {
        ...result,
        projections: [
          {
            ...result.projections[0]!,
            contributionId: 'operation:npSpecial' as const,
            modifier: 'npSpecial' as const,
            contributionControl: 'worldAssumption' as const,
          },
        ],
        effectiveContributions: {
          contributions: [
            {
              contributionId: 'operation:npSpecial',
              presentationGroupId: 'group',
              operationId: 'operation',
              component: 'npSpecial',
              modifier: 'npSpecial',
              resolvedValue: null,
              outputAddress: 'damage.npSpecial',
              source: {
                origin: 'np',
                sourceInstanceId: 'np',
                sourceId: '1',
                skillId: 'np',
                effectId: 'effect',
                effectOccurrenceId: 'effect',
              },
              selfDecision: { kind: 'included' },
              conditionDecision: { kind: 'excluded', reason: 'conditionalEffectPolicy' },
              areaViewDecision: { kind: 'included' },
              executionOutcome: outcome,
              effective: false,
              presentationCounted: true,
            },
          ],
          effectivePresentationGroupIds: new Set<string>(),
        },
      } as OrderedScenarioExecution;
    };
    const trueWorld = excluded('applied');
    const falseWorld = excluded('notApplied');
    expect(compareCandidateResults([trueWorld, falseWorld]).kind).toBe('equivalent');
    const summary = summarizeExcludedExternalTargetContributions(trueWorld);
    expect(summary.projections[0]).toMatchObject({
      outcome: 'notRelevant',
      explanation: { code: 'disabled' },
      decision: { state: 'none' },
    });
    expect(summary.effectiveContributions.contributions[0]?.executionOutcome).toBe('notRelevant');
    const activeWorld = {
      ...trueWorld,
      effectiveContributions: {
        ...trueWorld.effectiveContributions,
        contributions: trueWorld.effectiveContributions.contributions.map((contribution) => ({
          ...contribution,
          conditionDecision: { kind: 'included' as const },
        })),
      },
    };
    expect(compareCandidateResults([activeWorld, falseWorld]).kind).toBe('ambiguous');
    const operationProjection = (world: OrderedScenarioExecution) => ({
      ...world,
      projections: world.projections.map((projection) => ({
        ...projection,
        contributionControl: 'operation' as const,
        modifier: 'npSpecial' as const,
      })),
    });
    expect(
      compareCandidateResults([operationProjection(trueWorld), operationProjection(falseWorld)])
        .kind,
    ).toBe('equivalent');
  });
});
