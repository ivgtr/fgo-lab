import { describe, expect, it } from 'vitest';
import type { AtlasFunction } from './atlasContract';
import { normalizeFunctions } from './effectNormalization';

const valueSets = (value: Record<string, unknown>) => Array.from({ length: 10 }, () => value);

function normalizeCountEffect(parameter: Record<string, unknown>) {
  const fn: AtlasFunction = {
    funcId: 249,
    funcType: 'addStateShort',
    funcTargetType: 'self',
    funcPopupText: '宝具威力アップ',
    buffs: [{ type: 'upNpdamage' }],
    svals: valueSets({ Rate: 1_000, Turn: 1, Count: -1, Value: 0, ...parameter }),
  };
  return normalizeFunctions(
    [fn],
    new Map([
      [304, 'alignmentEvil'],
      [2_113, 'king'],
      [5_000, 'canBeInBattle'],
    ]),
    'np',
    1,
  )[0]!;
}

describe('canonical actor count normalization', () => {
  it('keeps each all-actor trait predicate as an independent final count input', () => {
    const effect = normalizeCountEffect({
      ParamAddValue: 100,
      ParamAddIndividualityTargetType: 32,
      ParamAddSelfIndividualityAndCheck: [[2_113]],
      ParamAddOpIndividualityAndCheck: [[2_113]],
      ParamAddOpCheckDead: 1,
    });

    expect(effect.inputDefinitions).toEqual([
      expect.objectContaining({
        kind: 'matchingActorCount',
        label: '〔王〕一致数',
        minimum: 0,
        maximum: 6,
        defaultValue: null,
        countSemantics: {
          population: 'allActors',
          aliveOnly: true,
          sourcePredicate: {
            counting: 'matchingClauses',
            clauses: [[{ kind: 'trait', trait: { name: 'king', negative: false } }]],
          },
          otherPredicate: {
            counting: 'matchingClauses',
            clauses: [[{ kind: 'trait', trait: { name: 'king', negative: false } }]],
          },
        },
      }),
    ]);
  });

  it('normalizes an in-battle enemy population without treating its trait ID as a modifier', () => {
    const effect = normalizeCountEffect({
      ParamAddValue: 100,
      ParamAddIndividualityTargetType: 6,
      ParamAddOpIndividualityAndCheck: [[5_000]],
      ParamAddOpCheckDead: 1,
    });

    expect(effect.inputDefinitions).toHaveLength(1);
    const input = effect.inputDefinitions[0]!;
    expect(input).toMatchObject({
      kind: 'matchingActorCount',
      label: '敵の合計数',
      maximum: 3,
    });
    if (input.kind !== 'matchingActorCount') throw new Error('matching count required');
    expect(input.countSemantics).toEqual({
      population: 'enemies',
      aliveOnly: true,
      sourcePredicate: {
        counting: 'matchingClauses',
        clauses: [[{ kind: 'actorProperty', property: 'inBattle' }]],
      },
      otherPredicate: {
        counting: 'matchingClauses',
        clauses: [[{ kind: 'actorProperty', property: 'inBattle' }]],
      },
    });
    expect(effect.execution[0]).toMatchObject({ kind: 'damageModifier' });
  });

  it('fails artifact normalization for unknown population or predicate semantics', () => {
    expect(() =>
      normalizeCountEffect({
        ParamAddValue: 100,
        ParamAddIndividualityTargetType: 999,
        ParamAddOpIndividualityAndCheck: [[5_000]],
      }),
    ).toThrow('unsupported_param_add_population');
    expect(() =>
      normalizeCountEffect({
        ParamAddValue: 100,
        ParamAddIndividualityTargetType: 6,
        ParamAddOpIndividualityAndCheck: [[999_999]],
      }),
    ).toThrow('unknown_param_add_trait');
  });
});

describe('HP threshold series normalization', () => {
  const attackFunction = (funcId: number, hpLower?: unknown): AtlasFunction => ({
    funcId,
    funcType: 'addStateShort',
    funcTargetType: 'ptAll',
    funcTargetTeam: 'playerAndEnemy',
    funcPopupText: '攻撃力アップ',
    buffs: [
      {
        type: 'upAtk',
        ...(hpLower === undefined ? {} : { script: { HP_LOWER: hpLower } }),
      },
    ],
    svals: valueSets({
      Rate: 1_000,
      Turn: 3,
      Count: -1,
      Value: hpLower === undefined ? 200 : 100,
    }),
  });

  it('keeps arbitrary valid thresholds as ordered attacker HP conditions under one decision', () => {
    const effects = normalizeFunctions(
      [
        attackFunction(1),
        attackFunction(2, 990),
        attackFunction(3, 750),
        attackFunction(4, 500),
        attackFunction(5, 250),
      ],
      new Map(),
      'skill',
      1,
    );

    expect(effects).toHaveLength(5);
    expect(new Set(effects.map((effect) => effect.interaction?.key)).size).toBe(1);
    expect(effects.map((effect) => effect.interaction?.kind)).toEqual(
      Array.from({ length: 5 }, () => 'quantityThresholdSeries'),
    );
    expect(effects.map((effect) => effect.quantityConditions)).toEqual([
      [],
      [{ quantity: 'attackerHpPermille', comparison: 'atMost', value: 990 }],
      [{ quantity: 'attackerHpPermille', comparison: 'atMost', value: 750 }],
      [{ quantity: 'attackerHpPermille', comparison: 'atMost', value: 500 }],
      [{ quantity: 'attackerHpPermille', comparison: 'atMost', value: 250 }],
    ]);
    expect(effects.map((effect) => effect.atlasEvidence.buffConditionKeys)).toEqual([
      [],
      ['HP_LOWER'],
      ['HP_LOWER'],
      ['HP_LOWER'],
      ['HP_LOWER'],
    ]);
  });

  it('accepts the full integer domain including zero', () => {
    const effects = normalizeFunctions(
      [attackFunction(1), attackFunction(2, 0)],
      new Map(),
      'skill',
      1,
    );

    expect(effects[1]!.quantityConditions).toEqual([
      { quantity: 'attackerHpPermille', comparison: 'atMost', value: 0 },
    ]);
  });

  it.each([-1, 1_001, 500.5, '500'])('rejects an invalid HP threshold %j', (threshold) => {
    expect(() => normalizeFunctions([attackFunction(1, threshold)], new Map())).toThrow(
      'invalid_hp_condition_threshold',
    );
  });

  it('keeps one conditional effect independent and rejects an unrepresentable recipient', () => {
    const [single] = normalizeFunctions([attackFunction(1, 500)], new Map(), 'skill', 1);
    expect(single).toMatchObject({
      interaction: null,
      quantityConditions: [{ quantity: 'attackerHpPermille', comparison: 'atMost', value: 500 }],
    });
    expect(() =>
      normalizeFunctions(
        [{ ...attackFunction(1, 500), funcTargetType: 'enemyAll' }],
        new Map(),
        'skill',
        1,
      ),
    ).toThrow('unsupported_hp_condition_target');
  });

  it('rejects duplicate thresholds within one semantic series', () => {
    expect(() =>
      normalizeFunctions(
        [attackFunction(1), attackFunction(2, 500), attackFunction(3, 500)],
        new Map(),
      ),
    ).toThrow('duplicate_hp_threshold');
  });

  it('rejects more than one unconditional operation before a threshold series', () => {
    expect(() =>
      normalizeFunctions([attackFunction(1), attackFunction(2), attackFunction(3, 500)], new Map()),
    ).toThrow('ambiguous_hp_threshold_series');
  });
});
