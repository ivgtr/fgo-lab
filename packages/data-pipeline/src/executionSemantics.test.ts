import { masterEffectSchema, type EffectExecutionOperation } from '@fgo-lab/master-data';
import { normalizeFunctions } from './effectNormalization';
import { describe, expect, it } from 'vitest';
import {
  normalizeContributionScope,
  normalizeExecutionSemantics,
  resolveExecutionSemanticSupport,
} from './executionSemantics';

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

describe('execution semantic support boundary', () => {
  const route = {
    target: 'unresolved' as const,
    contributionScope: 'personal' as const,
    eligibility: { kind: 'anyRecipient' as const, onMissing: 'unsupported' as const },
  };
  const values = [[], [], [], [], []] as [number[], number[], number[], number[], number[]];
  const valueExpressions = [[], [], [], [], []] as [null[], null[], null[], null[], null[]];

  it('classifies unresolved operation families after composition without changing order', () => {
    const operations: EffectExecutionOperation[] = [
      {
        kind: 'ocRemovalResistance' as const,
        route,
        cells: [
          [
            {
              applicationRatePermille: 1000,
              turns: { kind: 'unlimited' as const },
              uses: { kind: 'unlimited' as const },
              amount: { kind: 'fixed' as const, value: 1 },
            },
          ],
          [],
          [],
          [],
          [],
        ],
      },
      {
        kind: 'hpModifier' as const,
        selection: 'direct' as const,
        route,
        action: 'receive' as const,
        sign: 1 as const,
        bounds: { minimum: null, maximum: null },
        values,
        traits: [],
        lifetime: 'active' as const,
      },
      {
        kind: 'resourceMutation' as const,
        resource: 'npGauge' as const,
        direction: 'gain' as const,
        unit: 'fixed' as const,
        recipient: 'unresolved' as const,
        amount: { kind: 'fixed' as const, values },
        subjectId: null,
      },
      {
        kind: 'damageModifier' as const,
        modifier: 'powerMod' as const,
        sign: 1 as const,
        card: null,
        route,
        values,
        valueExpressions,
        semanticSupport: 'supported' as const,
      },
      {
        kind: 'ignoreDefense' as const,
        route,
        semanticSupport: 'supported' as const,
      },
      { kind: 'boundedPhaseIrrelevant' as const, proof: 'noBattleStateChange' as const },
    ];

    const resolved = resolveExecutionSemanticSupport(operations, {
      canonicalInputUnsupported: 'missing_or_unsupported_stack_maximum',
      unresolvedParameterKeys: [],
      unresolvedSemanticKeys: [],
      hasSecondaryValue: false,
    });

    expect(resolved.map((operation) => operation.kind)).toEqual([
      'unsupported',
      'unsupported',
      'resourceMutation',
      'damageModifier',
      'ignoreDefense',
      'boundedPhaseIrrelevant',
    ]);
    expect(resolved[0]).toMatchObject({ reason: 'ocExecutionSemantics', damageRelevant: true });
    expect(resolved[1]).toMatchObject({
      reason: 'resourceExecutionSemantics',
      route: { target: 'unresolved', contributionScope: 'personal' },
    });
    expect(resolved[3]).toMatchObject({ semanticSupport: 'unresolved' });
    expect(resolved[4]).toMatchObject({ semanticSupport: 'unresolved' });
  });

  it('does not downgrade operations when semantic evidence is complete', () => {
    const operation = {
      kind: 'damageModifier' as const,
      modifier: 'powerMod' as const,
      sign: 1 as const,
      card: null,
      route,
      values,
      valueExpressions,
      semanticSupport: 'supported' as const,
    };
    expect(
      resolveExecutionSemanticSupport([operation], {
        unresolvedParameterKeys: [],
        unresolvedSemanticKeys: [],
        hasSecondaryValue: false,
      }),
    ).toEqual([operation]);
  });

  it('keeps remove-only HP metadata outside the secondary-value trigger', () => {
    const operation = {
      kind: 'removeHpModifiers' as const,
      selection: 'direct' as const,
      route,
      traits: ['buffTrait:1'],
    };
    expect(
      resolveExecutionSemanticSupport([operation], {
        unresolvedParameterKeys: [],
        unresolvedSemanticKeys: [],
        hasSecondaryValue: true,
      }),
    ).toEqual([operation]);
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

it('connects NP and HP transfer descriptors to one canonical effect record', () => {
  const npChild = {
    funcId: 801,
    funcType: 'lossNp',
    funcTargetType: 'ptOther',
    funcTargetTeam: 'player' as const,
  };
  const npCell = {
    Rate: 1000,
    DependFuncId: 801,
    DependFunc: npChild,
    DependFuncVals: { Rate: 1000, Value: 2800 },
  };
  const hpChild = {
    funcId: 802,
    funcType: 'lossHpSafe',
    funcTargetType: 'enemyAll',
    funcTargetTeam: 'enemy' as const,
  };
  const hpCell = {
    Rate: 1000,
    DependFuncId: 802,
    DependFunc: hpChild,
    DependFuncVals: { Rate: 1000, Value: 2000 },
  };
  const [np, hp] = normalizeFunctions(
    [
      {
        funcId: 8010,
        funcType: 'gainNpFromTargets',
        funcTargetType: 'self',
        funcTargetTeam: 'player' as const,
        svals: [npCell],
      },
      {
        funcId: 8020,
        funcType: 'gainHpFromTargets',
        funcTargetType: 'self',
        funcTargetTeam: 'playerAndEnemy' as const,
        svals: [hpCell],
      },
    ],
    new Map(),
  );
  expect(masterEffectSchema.parse(np)).toBeTruthy();
  expect(masterEffectSchema.parse(hp)).toBeTruthy();
  expect(
    np?.execution.some(
      (operation) =>
        operation.kind === 'resourceMutation' &&
        operation.resource === 'npGauge' &&
        operation.amount.kind === 'npTransfer' &&
        operation.amount.donor === 'playerNp',
    ),
  ).toBe(true);
  expect(
    hp?.execution.some(
      (operation) =>
        operation.kind === 'resourceMutation' &&
        operation.resource === 'hp' &&
        operation.amount.kind === 'hpTransfer' &&
        operation.amount.donors === 'allEnemies',
    ),
  ).toBe(true);
  expect(np?.inputDefinitions.map((input) => input.key)).toEqual([
    'transfer:playerNp:0',
    'transfer:playerNp:1',
  ]);
  expect(hp?.inputDefinitions.map((input) => input.key)).toEqual([
    'transfer:enemyHp:0',
    'transfer:enemyHp:1',
    'transfer:enemyHp:2',
  ]);
});
