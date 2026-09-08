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
