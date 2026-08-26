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

    expect(effect.contextInputs).toEqual([
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

    expect(effect.contextInputs).toHaveLength(1);
    const input = effect.contextInputs[0]!;
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
