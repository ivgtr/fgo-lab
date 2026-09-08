import type { MasterEffect } from '@fgo-lab/master-data';
import { describe, expect, it } from 'vitest';
import {
  hpGrowthProductionInventory,
  resourceProductionInventory,
} from './resourceProductionAudit';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';

type EvidenceCell = MasterEffect['atlasEvidence']['parameterSets'][number][number];

function effect(
  functionType: string,
  cells: EvidenceCell[],
  limitBreakCells?: EvidenceCell[],
): Pick<MasterEffect, 'atlasEvidence' | 'execution' | 'triggerScope'> {
  return {
    triggerScope: null,
    execution: [],
    atlasEvidence: {
      functionType,
      target: 'self',
      parameterSets: [cells, [], [], [], []],
      ...(limitBreakCells ? { limitBreakParameterSets: [limitBreakCells, [], [], [], []] } : {}),
      parameterSemantics: {
        value: [],
        lifecycle: [],
        presentation: [],
        condition: [],
        contextMutation: [],
        choice: [],
        valueExpression: [],
        buffIdentity: [],
        unresolved: [],
      },
      unresolvedSemanticKeys: [],
      buffTypes: [],
      buffRateTargets: [],
      buffConditionKeys: [],
    },
  };
}

const dependent = (kind: string, target: string, values: Record<string, number>) => ({
  DependFuncId: 1,
  DependFunc: { funcId: 1, funcType: kind, funcTargetType: target },
  DependFuncVals: values,
});

describe('resource production inventory evidence', () => {
  it('retains trigger-scoped operation kinds, including production-zero resource writers', () => {
    const scoped = {
      ...effect('lossHpSafe', [{ Value: 1 }]),
      triggerScope: 'commandCard' as const,
      execution: [
        {
          kind: 'resourceMutation' as const,
          resource: 'hp' as const,
          direction: 'loss' as const,
          lossFloor: 'oneIfAlive' as const,
          unit: 'fixed' as const,
          recipient: 'sourceSelf' as const,
          subjectId: null,
          amount: {
            kind: 'fixed' as const,
            values: [[1], [], [], [], []] as [number[], number[], number[], number[], number[]],
          },
        },
      ],
    };
    expect(
      resourceProductionInventory([
        scoped,
        { ...scoped, triggerScope: 'commandCardAttack' },
        { ...scoped, triggerScope: null },
      ]).triggerOperations,
    ).toEqual({
      '["commandCard","resourceMutation","hp"]': 1,
      '["commandCardAttack","resourceMutation","hp"]': 1,
    });
  });

  it('keeps HP buff writers, amount modifiers and event effects across every cell and scope', () => {
    const maximum = effect('addState', [{ Value: 1000 }], [{ Value: 2000, Turn: 3 }]);
    maximum.atlasEvidence.buffTypes = ['addMaxhp'];
    const delayed = effect('addState', [{ Value: 500, Turn: 3 }]);
    delayed.atlasEvidence.buffTypes = ['regainHp', 'upFuncHpReduce'];
    delayed.atlasEvidence.target = 'ptAll';
    const future = effect('addState', [{ Value: 1 }]);
    future.atlasEvidence.buffTypes = ['futureHpModifier'];
    const inventory = resourceProductionInventory([
      maximum,
      Object.assign(delayed, { timing: 'afterDamage' }),
      future,
    ]);
    expect(inventory.hpBuffEffects).toEqual({
      addMaxhp: 1,
      regainHp: 1,
      upFuncHpReduce: 1,
      futureHpModifier: 1,
    });
    expect(inventory.hpBuffCells).toEqual({
      '["addMaxhp","addState","self",null,null,["Value"]]': 1,
      '["addMaxhp","addState","self",null,null,["Turn","Value"]]': 1,
      '["regainHp","addState","ptAll",null,"afterDamage",["Turn","Value"]]': 1,
      '["upFuncHpReduce","addState","ptAll",null,"afterDamage",["Turn","Value"]]': 1,
      '["futureHpModifier","addState","self",null,null,["Value"]]': 1,
    });
  });
  it('keeps charge, gauge, and HP dependencies separate across normal and LB cells', () => {
    const inventory = resourceProductionInventory([
      effect(
        'gainNpFromTargets',
        [dependent('lossNp', 'ptOther', { Value: 3000 })],
        [dependent('delayNpturn', 'enemyAll', { Value: 1, Value2: 2000 })],
      ),
      effect('gainHpFromTargets', [dependent('lossHpSafe', 'enemy', { Value: 2000 })]),
    ]);
    expect(inventory.dependentCells).toEqual({
      '["gainNpFromTargets","lossNp","ptOther",["Value"]]': 1,
      '["gainNpFromTargets","delayNpturn","enemyAll",["Value","Value2"]]': 1,
      '["gainHpFromTargets","lossHpSafe","enemy",["Value"]]': 1,
    });
  });

  it.each([
    {},
    { ...dependent('lossNp', 'ptOther', { Value: 10 }), DependFuncId: 2 },
    { ...dependent('lossNp', 'ptOther', { Value: 10 }), DependFuncVals: [] },
  ])('rejects an incomplete or contradictory dependency join', (cell) => {
    expect(() => resourceProductionInventory([effect('gainNpFromTargets', [cell])])).toThrow(
      'resource_audit_unresolved_dependency',
    );
  });

  it('preserves scope values, HP loss variants, and absolute BP writes without inventing caps', () => {
    const inventory = resourceProductionInventory([
      effect('gainNpTargetSum', [
        { Value: 1000, Value2: 3 },
        { Value: 1000, Value2: 4 },
      ]),
      effect('gainNpIndividualSum', [{ Value: 1000 }]),
      effect('lossHpSafe', [{ Value: 1000 }]),
      effect('lossHp', [{ Value: 1000 }]),
      effect('subBattlePoint', [{ BattlePointId: 7, BattlePointValue: 2 }]),
      effect('addBattlePoint', [{ BattlePointId: 7, BattlePointValue: 12 }]),
    ]);
    expect(inventory.countScopeCells).toEqual({
      '["gainNpTargetSum",3]': 1,
      '["gainNpTargetSum",4]': 1,
      '["gainNpIndividualSum",null]': 1,
    });
    expect(inventory.hpLossCells).toEqual({ lossHpSafe: 1, lossHp: 1 });
    expect(inventory.battlePointWrites).toEqual({
      '["subBattlePoint",7,2]': 1,
      '["addBattlePoint",7,12]': 1,
    });
  });
  it('separates phase/rate readers from point and after-damage capacity writes', () => {
    const capacity = effect('addState', [{ Value: 4, BattlePointId: 7 }]);
    capacity.atlasEvidence.buffTypes = ['addMaxBattlePoint'];
    const inventory = resourceProductionInventory([
      Object.assign(capacity, { timing: 'afterDamage' }),
      effect('addStateShort', [
        {
          CheckBattlePointPhaseRange: [{ battlePointId: 7, range: ['<=1'] }],
        },
      ]),
      effect('addBattlePoint', [
        {
          BattlePointId: 7,
          BattlePointValue: 2,
          TriggeredTargetBattlePointRateRange: [{ battlePointId: 7, range: ['<=999'] }],
        },
      ]),
    ]);
    expect(inventory.battlePointCapacityCells).toEqual({ '[7,4,"afterDamage"]': 1 });
    expect(inventory.battlePointConditionCells).toEqual({
      '["CheckBattlePointPhaseRange",[{"battlePointId":7,"range":["<=1"]}]]': 1,
      '["TriggeredTargetBattlePointRateRange",[{"battlePointId":7,"range":["<=999"]}]]': 1,
    });
    expect(inventory.battlePointWrites).toEqual({ '["addBattlePoint",7,2]': 1 });
  });
});

describe('production HP level completeness', () => {
  const master = masterSnapshotSchema.parse(fixture);
  it('accepts explicit zero CE HP and rejects a missing supported servant or CE level', () => {
    expect(hpGrowthProductionInventory(master).zeroCraftEssenceCells).toBeGreaterThan(0);
    const servant = master.servants[0]!;
    expect(() =>
      hpGrowthProductionInventory({ ...master, servants: [{ ...servant, hpByLevel: {} }] }),
    ).toThrow('hp_growth_unavailable:servant');
    const equip = master.craftEssences[0]!;
    expect(() =>
      hpGrowthProductionInventory({ ...master, craftEssences: [{ ...equip, hpByLevel: {} }] }),
    ).toThrow('hp_growth_unavailable:craftEssence');
  });
});

it('rejects loss of normal or limit-break HP amount cells in the shared audit', () => {
  const hp = {
    ...effect('lossHpSafe', [{ Value: 100 }], [{ Value: 200 }]),
    execution: [
      {
        kind: 'resourceMutation' as const,
        resource: 'hp' as const,
        direction: 'loss' as const,
        unit: 'fixed' as const,
        lossFloor: 'oneIfAlive' as const,
        recipient: 'sourceSelf' as const,
        subjectId: null,
        amount: {
          kind: 'fixed' as const,
          values: [[100], [], [], [], []] as [number[], number[], number[], number[], number[]],
          limitBreakValues: [[200], [], [], [], []] as [
            number[],
            number[],
            number[],
            number[],
            number[],
          ],
        },
      },
    ],
  };
  expect(resourceProductionInventory([hp]).hpMutationContracts).toEqual({
    '["lossHpSafe","loss","fixed","oneIfAlive"]': 2,
  });
  const operation = hp.execution[0]!;
  for (const amount of [
    { ...operation.amount, values: [[99], [], [], [], []] as typeof operation.amount.values },
    {
      ...operation.amount,
      limitBreakValues: [[100], [], [], [], []] as typeof operation.amount.values,
    },
    { kind: operation.amount.kind, values: operation.amount.values },
  ])
    expect(() =>
      resourceProductionInventory([{ ...hp, execution: [{ ...operation, amount }] }]),
    ).toThrow('hp_resource_cell_preservation_mismatch');
});
