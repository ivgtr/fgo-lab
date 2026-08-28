import { describe, expect, it } from 'vitest';
import type { NpDamageSpec } from '@fgo-lab/master-data';
import { evaluateNpDamageOperation, type NpDamageOperationContext } from './npDamageOperation';

const parameters = (extra: Record<string, unknown> = {}) =>
  Array.from({ length: 5 }, (_, index) => ({
    ratePermille: 1_000,
    valuePermille: 3_000 + index * 1_000,
    ...extra,
  }));
const matrix = (extra: Record<string, unknown> = {}) =>
  Array.from({ length: 5 }, () => parameters(extra)) as NpDamageSpec['parametersByOvercharge'];
const base = {
  functionId: 'fixture',
  target: 'single' as const,
  rawPath: 'fixture',
};
const context: NpDamageOperationContext = {
  overcharge: 1,
  attackerTraitCounts: {},
  targetTraitCounts: {},
  targetCombinedTraitCounts: {},
  targetStateTraitCounts: {},
  targetPredicateValues: new Map(),
  attackerHpPermille: null,
  targetRarity: null,
  battlePointPhase: null,
};

describe('NP damage operation', () => {
  it('resolves standard and defense-piercing functions', () => {
    const standard: NpDamageSpec = {
      ...base,
      kind: 'standard',
      rawFunctionType: 'damageNp',
      parametersByOvercharge: matrix(),
    };
    const piercing: NpDamageSpec = {
      ...base,
      kind: 'defensePiercing',
      rawFunctionType: 'damageNpPierce',
      parametersByOvercharge: matrix(),
    };
    expect(evaluateNpDamageOperation(standard, context)).toMatchObject({
      status: 'resolved',
      ignoreDefense: false,
    });
    expect(evaluateNpDamageOperation(piercing, context)).toMatchObject({
      status: 'resolved',
      ignoreDefense: true,
    });
  });

  it('resolves trait, state-trait, rarity, and AND trait conditions', () => {
    const trait = { id: 1, name: 'dragon' };
    for (const [kind, rawFunctionType, patch] of [
      [
        'trait',
        'damageNpIndividual',
        { targetId: 1, targetTrait: trait, correctionPermille: 1_500 },
      ],
      [
        'stateTrait',
        'damageNpStateIndividualFix',
        { targetId: 1, targetTrait: trait, correctionPermille: 1_500 },
      ],
      [
        'targetRarity',
        'damageNpRare',
        { targetId: 0, targetRarities: [2], correctionPermille: 1_500 },
      ],
      [
        'traitExpression',
        'damageNpAndOrCheckIndividuality',
        { targetId: 0, andCheckTraitIds: [1], andCheckTraits: [trait], correctionPermille: 1_500 },
      ],
    ] as const) {
      const damage = {
        ...base,
        kind,
        rawFunctionType,
        parametersByOvercharge: matrix(patch),
      } as NpDamageSpec;
      const result = evaluateNpDamageOperation(damage, {
        ...context,
        targetTraitCounts: { dragon: 1 },
        targetStateTraitCounts: { dragon: 1 },
        targetRarity: 2,
      });
      expect(result).toMatchObject({
        status: 'resolved',
        npSpecialMultipliers: [1.5, 1.5, 1.5, 1.5, 1.5],
      });
    }
  });

  it('does not mix permanent and state trait conditions', () => {
    const targetTrait = { id: 1, name: 'dragon' };
    const trait = {
      ...base,
      kind: 'trait',
      rawFunctionType: 'damageNpIndividual',
      parametersByOvercharge: matrix({ targetTrait, correctionPermille: 1_500 }),
    } as NpDamageSpec;
    const stateTrait = {
      ...base,
      kind: 'stateTrait',
      rawFunctionType: 'damageNpStateIndividualFix',
      parametersByOvercharge: matrix({ targetTrait, correctionPermille: 1_500 }),
    } as NpDamageSpec;
    const permanentOnly = { ...context, targetTraitCounts: { dragon: 1 } };
    const stateOnly = { ...context, targetStateTraitCounts: { dragon: 1 } };
    expect(evaluateNpDamageOperation(trait, permanentOnly)).toMatchObject({
      npSpecialMultipliers: [1.5, 1.5, 1.5, 1.5, 1.5],
    });
    expect(evaluateNpDamageOperation(trait, stateOnly)).toMatchObject({
      npSpecialMultipliers: [1, 1, 1, 1, 1],
    });
    expect(evaluateNpDamageOperation(stateTrait, permanentOnly)).toMatchObject({
      npSpecialMultipliers: [1, 1, 1, 1, 1],
    });
    expect(evaluateNpDamageOperation(stateTrait, stateOnly)).toMatchObject({
      npSpecialMultipliers: [1.5, 1.5, 1.5, 1.5, 1.5],
    });
  });

  it('uses attacker HP, trait stack counts, and battle point phase', () => {
    const hp = {
      ...base,
      kind: 'hpRatioLow',
      rawFunctionType: 'damageNpHpratioLow',
      parametersByOvercharge: matrix({ targetId: 6_000 }),
    } as NpDamageSpec;
    expect(evaluateNpDamageOperation(hp, { ...context, attackerHpPermille: 500 })).toMatchObject({
      npMultipliers: [600, 700, 800, 900, 1000],
    });
    expect(evaluateNpDamageOperation(hp, context)).toEqual({
      status: 'unsupported',
      missingEvidence: 'missing_attacker_hp_ratio',
    });

    const trait = { id: 2, name: 'roman' };
    const sum = {
      ...base,
      kind: 'traitCount',
      rawFunctionType: 'damageNpIndividualSum',
      parametersByOvercharge: matrix({
        targetId: 0,
        targetIds: [2],
        targetTraits: [trait],
        secondaryValuePermille: 1_000,
        correctionPermille: 200,
        maximumTargetCount: 3,
      }),
    } as NpDamageSpec;
    expect(
      evaluateNpDamageOperation(sum, { ...context, attackerTraitCounts: { roman: 5 } }),
    ).toMatchObject({ npSpecialMultipliers: [1.6, 1.6, 1.6, 1.6, 1.6] });

    const targetSum = {
      ...sum,
      parametersByOvercharge: matrix({
        targetId: 1,
        targetIds: [2],
        targetTraits: [trait],
        secondaryValuePermille: 1_000,
        correctionPermille: 200,
        maximumTargetCount: 3,
      }),
    } as NpDamageSpec;
    expect(
      evaluateNpDamageOperation(targetSum, {
        ...context,
        targetTraitCounts: { roman: 1 },
        targetCombinedTraitCounts: { roman: 2 },
      }),
    ).toMatchObject({ npSpecialMultipliers: [1.4, 1.4, 1.4, 1.4, 1.4] });

    const battle = {
      ...base,
      kind: 'battlePointPhase',
      rawFunctionType: 'damageNpBattlePointPhase',
      maximumBattlePointPhase: 10,
      parametersByOvercharge: matrix({
        targetId: 1,
        secondaryValuePermille: 1_000,
        correctionPermille: 100,
      }),
    } as NpDamageSpec;
    expect(evaluateNpDamageOperation(battle, { ...context, battlePointPhase: 40 })).toMatchObject({
      npSpecialMultipliers: [2, 2, 2, 2, 2],
    });
  });

  it('uses the inactive rarity-special baseline and fails closed for required inputs', () => {
    const rarity = {
      ...base,
      kind: 'targetRarity',
      rawFunctionType: 'damageNpRare',
      parametersByOvercharge: matrix({ targetRarities: [5], correctionPermille: 1_500 }),
    } as NpDamageSpec;
    const battle = {
      ...base,
      kind: 'battlePointPhase',
      rawFunctionType: 'damageNpBattlePointPhase',
      maximumBattlePointPhase: 10,
      parametersByOvercharge: matrix({ secondaryValuePermille: 1_000, correctionPermille: 100 }),
    } as NpDamageSpec;
    expect(evaluateNpDamageOperation(rarity, context)).toMatchObject({
      status: 'resolved',
      npMultipliers: [300, 400, 500, 600, 700],
      npSpecialMultipliers: [1, 1, 1, 1, 1],
    });
    expect(evaluateNpDamageOperation(battle, context)).toEqual({
      status: 'unsupported',
      missingEvidence: 'missing_battle_point_phase',
    });
    expect(evaluateNpDamageOperation(rarity, { ...context, overcharge: 6 })).toEqual({
      status: 'unsupported',
      missingEvidence: 'invalid_overcharge',
    });
  });
});
