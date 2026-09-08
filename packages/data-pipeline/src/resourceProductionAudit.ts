import { readHpAtLevel, type MasterEffect, type MasterDataSnapshot } from '@fgo-lab/master-data';

type ResourceAuditEffect = Pick<MasterEffect, 'atlasEvidence' | 'execution' | 'triggerScope'>;

function increment(counts: Record<string, number>, key: string, amount = 1) {
  counts[key] = (counts[key] ?? 0) + amount;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Observes retained evidence; never supplies resource amounts to the runtime executor. */
export function resourceProductionInventory(effects: readonly ResourceAuditEffect[]) {
  const inventory = {
    mutations: {} as Record<string, number>,
    triggerOperations: {} as Record<string, number>,
    unsupported: {} as Record<string, number>,
    dependentCells: {} as Record<string, number>,
    countScopeCells: {} as Record<string, number>,
    hpLossCells: {} as Record<string, number>,
    hpMutationContracts: {} as Record<string, number>,
    hpBuffEffects: {} as Record<string, number>,
    hpBuffCells: {} as Record<string, number>,
    battlePointWrites: {} as Record<string, number>,
    battlePointCapacityCells: {} as Record<string, number>,
    battlePointConditionCells: {} as Record<string, number>,
    battlePointMissingAmounts: 0,
  };
  for (const effect of effects) {
    const evidence = effect.atlasEvidence;
    // This is an evidence inventory, not a runtime HP-effect allowlist. Retain new HP
    // vocabulary too, so the production digest requires it to be classified explicitly.
    const hpBuffs = evidence.buffTypes.filter((type) => /hp/i.test(type));
    for (const type of hpBuffs) increment(inventory.hpBuffEffects, type);
    const cells = [
      ...evidence.parameterSets.flat(),
      ...(evidence.limitBreakParameterSets?.flat() ?? []),
    ];
    for (const operation of effect.execution) {
      if (effect.triggerScope !== null)
        increment(
          inventory.triggerOperations,
          JSON.stringify([
            effect.triggerScope,
            operation.kind,
            operation.kind === 'resourceMutation' ? operation.resource : null,
          ]),
        );
      if (operation.kind === 'resourceMutation') {
        increment(inventory.mutations, operation.resource);
        if (operation.resource === 'hp') {
          const expectedValues = (sets: typeof evidence.parameterSets) =>
            sets.map((row) =>
              row.map((cell) => (typeof cell['Value'] === 'number' ? cell['Value'] : null)),
            );
          if (
            (evidence.limitBreakParameterSets !== undefined &&
              operation.amount.limitBreakValues === undefined) ||
            JSON.stringify(operation.amount.values) !==
              JSON.stringify(expectedValues(evidence.parameterSets)) ||
            (operation.amount.limitBreakValues !== undefined &&
              JSON.stringify(operation.amount.limitBreakValues) !==
                JSON.stringify(
                  expectedValues(evidence.limitBreakParameterSets ?? evidence.parameterSets),
                ))
          )
            throw new TypeError('hp_resource_cell_preservation_mismatch');
          increment(
            inventory.hpMutationContracts,
            JSON.stringify([
              evidence.functionType,
              operation.direction,
              operation.unit,
              operation.direction === 'loss' ? operation.lossFloor : null,
            ]),
            operation.amount.values.flat().length +
              (operation.amount.limitBreakValues?.flat().length ?? 0),
          );
        }
        if (operation.resource === 'battlePoint' && operation.amount.kind === 'fixed')
          inventory.battlePointMissingAmounts += [
            ...operation.amount.values.flat(),
            ...(operation.amount.limitBreakValues?.flat() ?? []),
          ].filter((amount) => amount === null).length;
      }
      if (operation.kind === 'unsupported')
        increment(
          inventory.unsupported,
          JSON.stringify([
            evidence.functionType,
            operation.reason,
            effect.triggerScope,
            operation.damageRelevant,
          ]),
        );
    }
    for (const cell of cells) {
      for (const type of hpBuffs)
        increment(
          inventory.hpBuffCells,
          JSON.stringify([
            type,
            evidence.functionType,
            evidence.target,
            effect.triggerScope,
            'timing' in effect ? effect.timing : null,
            Object.keys(cell).sort(),
          ]),
        );
      if (evidence.buffTypes.includes('addMaxBattlePoint'))
        increment(
          inventory.battlePointCapacityCells,
          JSON.stringify([
            cell['BattlePointId'] ?? null,
            cell['Value'] ?? null,
            'timing' in effect ? effect.timing : null,
          ]),
        );
      for (const key of ['CheckBattlePointPhaseRange', 'TriggeredTargetBattlePointRateRange'])
        if (cell[key] !== undefined)
          increment(inventory.battlePointConditionCells, JSON.stringify([key, cell[key]]));
      if (
        evidence.functionType === 'gainNpFromTargets' ||
        evidence.functionType === 'gainHpFromTargets'
      ) {
        const dependency = record(cell['DependFunc']);
        const values = record(cell['DependFuncVals']);
        if (
          !dependency ||
          !values ||
          typeof cell['DependFuncId'] !== 'number' ||
          dependency['funcId'] !== cell['DependFuncId'] ||
          typeof dependency['funcType'] !== 'string' ||
          typeof dependency['funcTargetType'] !== 'string'
        )
          throw new TypeError('resource_audit_unresolved_dependency');
        increment(
          inventory.dependentCells,
          JSON.stringify([
            evidence.functionType,
            dependency['funcType'],
            dependency['funcTargetType'],
            Object.keys(values).sort(),
          ]),
        );
      }
      if (
        evidence.functionType === 'gainNpTargetSum' ||
        evidence.functionType === 'gainNpIndividualSum'
      )
        increment(
          inventory.countScopeCells,
          JSON.stringify([evidence.functionType, cell['Value2'] ?? null]),
        );
      if (evidence.functionType.startsWith('lossHp'))
        increment(inventory.hpLossCells, evidence.functionType);
      if (evidence.functionType === 'addBattlePoint' || evidence.functionType === 'subBattlePoint')
        increment(
          inventory.battlePointWrites,
          JSON.stringify([
            evidence.functionType,
            cell['BattlePointId'] ?? null,
            cell['BattlePointValue'] ?? null,
          ]),
        );
    }
  }
  return inventory;
}

/** Checks supported level domains using the already parsed shared master. */
export function hpGrowthProductionInventory(
  master: Pick<MasterDataSnapshot, 'servants' | 'craftEssences'>,
) {
  let servantCells = 0;
  let craftEssenceCells = 0;
  let zeroCraftEssenceCells = 0;
  for (const servant of master.servants) {
    for (const level of Object.keys(servant.atkByLevel)) {
      const hp = readHpAtLevel(servant.hpByLevel, Number(level));
      if (hp === null || hp === 0)
        throw new TypeError(`hp_growth_unavailable:servant:${servant.id}:${level}`);
    }
    servantCells += Object.keys(servant.hpByLevel).length;
  }
  for (const equip of master.craftEssences) {
    const maximum = Math.max(...equip.maxLevelByLimitBreak);
    for (let level = 1; level <= maximum; level++) {
      const hp = readHpAtLevel(equip.hpByLevel, level);
      if (hp === null)
        throw new TypeError(`hp_growth_unavailable:craftEssence:${equip.id}:${level}`);
      if (hp === 0) zeroCraftEssenceCells++;
      craftEssenceCells++;
    }
  }
  return { servantCells, craftEssenceCells, zeroCraftEssenceCells };
}
