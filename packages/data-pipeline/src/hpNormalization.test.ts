import { describe, expect, it } from 'vitest';
import type { AtlasFunction, AtlasFunctionValue } from './atlasContract';
import { normalizeHpTransfer } from './hpNormalization';

const parent = (team: AtlasFunction['funcTargetTeam'] = 'playerAndEnemy'): AtlasFunction => ({
  funcType: 'gainHpFromTargets',
  funcTargetType: 'self',
  funcTargetTeam: team,
});

const cell = (
  targetType: string,
  value = 2000,
  team: AtlasFunction['funcTargetTeam'] = 'enemy',
): AtlasFunctionValue => ({
  Rate: 1000,
  DependFuncId: 710,
  DependFunc: {
    funcId: 710,
    funcType: 'lossHpSafe',
    funcTargetType: targetType,
    funcTargetTeam: team,
  },
  DependFuncVals: { Rate: 1000, Value: value },
});

describe('HP transfer normalization boundary', () => {
  it('maps each supported child selector to one typed donor domain', () => {
    for (const [targetType, donors] of [
      ['enemy', 'selectedEnemy'],
      ['enemyOneNoTargetNoAction', 'otherEnemy'],
      ['enemyAll', 'allEnemies'],
    ] as const) {
      const normalized = normalizeHpTransfer(parent(), [[cell(targetType)], [], [], [], []]);
      expect(normalized?.operation).toMatchObject({
        resource: 'hp',
        amount: {
          kind: 'hpTransfer',
          donors,
          values: [[2000], [], [], [], []],
        },
      });
      expect(normalized?.inputs).toHaveLength(3);
      expect(normalized?.inputs.map((input) => input.key)).toEqual([
        'transfer:enemyHp:0',
        'transfer:enemyHp:1',
        'transfer:enemyHp:2',
      ]);
    }
  });

  it('keeps scope and script policy explicit', () => {
    expect(normalizeHpTransfer(parent('enemy'), [[cell('enemyAll')], [], [], [], []])).toEqual({
      operation: { kind: 'boundedPhaseIrrelevant', proof: 'enemyActorHpFunction' },
      inputs: [],
    });
    expect(
      normalizeHpTransfer({ ...parent('player'), script: { funcIndividuality: [{ id: 1 }] } }, [
        [cell('enemy')],
        [],
        [],
        [],
        [],
      ]),
    ).not.toBeNull();
    expect(
      normalizeHpTransfer({ ...parent('player'), script: { condition: { Value: 1 } } }, [
        [cell('enemy')],
        [],
        [],
        [],
        [],
      ]),
    ).toBeNull();
  });

  it('rejects mixed selectors and non-representable HP writers', () => {
    const mixed = normalizeHpTransfer(parent(), [[cell('enemy'), cell('enemyAll')]]);
    expect(mixed).toBeNull();
    for (const replacement of [
      {
        DependFunc: {
          funcId: undefined,
          funcType: 'lossHpSafe',
          funcTargetType: 'enemy',
          funcTargetTeam: 'enemy' as const,
        },
      },
      { DependFuncVals: { Rate: 1000, Value: 2000, Value2: 1 } },
      {
        DependFunc: {
          funcId: 710,
          funcType: 'lossHpSafe',
          funcTargetType: 'enemy',
          funcTargetTeam: 'enemy' as const,
          script: { resistance: 1 },
        },
      },
    ])
      expect(
        normalizeHpTransfer(parent(), [[{ ...cell('enemy'), ...replacement }], [], [], [], []]),
      ).toBeNull();
  });
});
