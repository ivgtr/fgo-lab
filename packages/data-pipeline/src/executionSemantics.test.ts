import { masterEffectSchema } from '@fgo-lab/master-data';
import { normalizeFunctions } from './effectNormalization';
import { describe, expect, it } from 'vitest';
import { normalizeContributionScope, normalizeExecutionSemantics } from './executionSemantics';

describe('canonical effect contribution scope', () => {
  it.each([
    ['self', undefined, 'personal'],
    ['commandTypeSelfTreasureDevice', 'player', 'personal'],
    ['ptOne', 'player', 'personal'],
    ['ptAll', 'player', 'partyWide'],
    ['ptFull', 'player', 'partyWide'],
    ['ptOther', 'player', 'partyOther'],
    ['ptOtherFull', 'player', 'partyOther'],
    ['enemy', 'playerAndEnemy', 'enemyApplied'],
    ['enemyAll', 'enemy', 'enemyApplied'],
    ['self', 'enemy', 'enemyApplied'],
  ] as const)('normalizes %s/%s without reusing recipient routing', (target, team, expected) => {
    expect(normalizeContributionScope(target, team)).toBe(expected);
  });

  it('does not guess an unknown raw target', () => {
    expect(normalizeContributionScope('unknownTarget')).toBeNull();
  });

  it('coalesces duplicate state evidence into one damage-relevant mutation', () => {
    expect(
      normalizeExecutionSemantics({
        fn: { funcType: 'addState', funcTargetType: 'enemy' },
        parameterSets: [[]],
        valueExpressions: [[], [], [], [], []],
        cardTypes: [],
        canonicalOperations: [],
        contextChanges: {
          addedFieldTraits: [],
          removedFieldTraits: [],
          addedRecipientTraits: ['marking'],
          addedRecipientStateTraits: ['marking'],
          removedRecipientTraits: [],
          removedRecipientStateTraits: [],
        },
        quantityApplicationTiming: 'duringExecution',
      }),
    ).toEqual([
      {
        kind: 'contextMutation',
        mutation: 'addTrait',
        scope: 'recipientState',
        route: {
          target: 'enemy',
          contributionScope: 'enemyApplied',
          eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
        },
        trait: 'marking',
        damageRelevant: true,
      },
    ]);
  });
});

describe('canonical HP mutation boundary', () => {
  it.each([
    ['gainHp', 'gain', 'fixed', undefined],
    ['gainHpPer', 'gain', 'percent', undefined],
    ['lossHp', 'loss', 'fixed', 'zero'],
    ['lossHpSafe', 'loss', 'fixed', 'oneIfAlive'],
    ['lossHpPerSafe', 'loss', 'percent', 'oneIfAlive'],
  ] as const)(
    'retains %s semantics across every NP and level cell',
    (funcType, direction, unit, lossFloor) => {
      const cells = (value: number) => [
        { Rate: 1000, Value: value },
        { Rate: 1000, Value: value + 1 },
      ];
      const effects = normalizeFunctions(
        [
          {
            funcId: 1,
            funcType,
            funcTargetType: 'self',
            svals: cells(10),
            svals2: cells(20),
            svals3: cells(30),
            svals4: cells(40),
            svals5: cells(50),
          },
        ],
        new Map(),
      );
      expect(effects).toHaveLength(1);
      expect(() =>
        normalizeFunctions(
          [
            {
              funcId: 1,
              funcType,
              funcTargetType: 'self',
              svals: [{ Value: 100, BattlePointId: 7 }],
            },
          ],
          new Map(),
        ),
      ).toThrow('hp_mutation_has_foreign_resource_subject');
      const normalized = masterEffectSchema.parse(effects[0]);
      expect(normalized.execution).toEqual([
        {
          kind: 'resourceMutation',
          selection: 'direct',
          resource: 'hp',
          direction,
          unit,
          ...(lossFloor === undefined ? {} : { lossFloor }),
          recipient: 'sourceSelf',
          subjectId: null,
          amount: {
            kind: 'fixed',
            values: [
              [10, 11],
              [20, 21],
              [30, 31],
              [40, 41],
              [50, 51],
            ],
          },
        },
      ]);
      const operation = normalized.execution[0]!;
      const valid = (replacement: object) =>
        masterEffectSchema.safeParse({ ...normalized, execution: [replacement] }).success;
      if (direction === 'loss') {
        const legacy = Object.fromEntries(
          Object.entries(operation).filter(([key]) => key !== 'lossFloor'),
        );
        expect(valid(legacy)).toBe(false);
        expect(valid({ ...operation, lossFloor: 'unknown' })).toBe(false);
        expect(valid({ ...operation, resource: 'npGauge' })).toBe(false);
        expect(valid({ ...operation, direction: 'gain' })).toBe(false);
      } else expect(valid({ ...operation, lossFloor: 'oneIfAlive' })).toBe(false);
      expect(valid({ ...operation, subjectId: 'other-resource' })).toBe(false);
      expect(
        valid({
          ...operation,
          amount: { kind: 'currentGaugeRatio', values: [[1], [], [], [], []] },
        }),
      ).toBe(false);
    },
  );
});
it('keeps probabilistic HP writers explicit and rejects partial value metadata', () => {
  const raw = {
    funcId: 91,
    funcType: 'gainHp',
    funcTargetType: 'self',
    svals: [{ Rate: 500, Value: 1000 }],
  };
  const probabilistic = normalizeFunctions([raw], new Map())[0]!;
  expect(probabilistic.proc.kind).not.toBe('guaranteed');
  for (const cell of [
    { Rate: 1000, Value: 1000, Value2: 1 },
    { Rate: 1000, Value: 1000, UnknownHpWriter: 1 },
  ]) {
    const normalized = normalizeFunctions([{ ...raw, svals: [cell] }], new Map())[0]!;
    expect(normalized.execution).toContainEqual(
      expect.objectContaining({ kind: 'unsupported', reason: 'resourceExecutionSemantics' }),
    );
  }
});
it('keeps HP transfer child selection and rejects alias, resistance and ambiguous nested writers', async () => {
  const { normalizeHpTransfer } = await import('./hpNormalization');
  const child = {
    funcId: 710,
    funcType: 'lossHpSafe',
    funcTargetType: 'enemyAll',
    funcTargetTeam: 'enemy' as const,
  };
  const cell = {
    Rate: 1000,
    DependFuncId: 710,
    DependFunc: child,
    DependFuncVals: { Rate: 1000, Value: 2000 },
  };
  const parent = {
    funcId: 3966,
    funcType: 'gainHpFromTargets',
    funcTargetType: 'self',
    funcTargetTeam: 'playerAndEnemy' as const,
    svals: [cell],
  };
  expect(normalizeHpTransfer(parent, [[cell], [], [], [], []])?.operation).toMatchObject({
    kind: 'resourceMutation',
    resource: 'hp',
    amount: { kind: 'hpTransfer', donors: 'allEnemies', values: [[2000], [], [], [], []] },
  });
  for (const replacement of [
    { DependFuncId: 999 },
    { DependFunc: { ...child, funcTargetType: 'self' } },
    { DependFunc: { ...child, funcType: 'lossHp' } },
    { DependFuncVals: { Rate: 500, Value: 2000 } },
    { DependFuncVals: { Rate: 1000, Value: 2000, Value2: 1 } },
    { DependFunc: { ...child, script: { unknownResistance: true } } },
  ]) {
    expect(normalizeHpTransfer(parent, [[{ ...cell, ...replacement }], [], [], [], []])).toBeNull();
  }
});
