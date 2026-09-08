import type { MasterEffect } from '@fgo-lab/master-data';

/** One inventory over the already loaded production occurrences, including every normal/LB cell. */
export function ocProductionInventory(effects: readonly MasterEffect[]) {
  const inventory = {
    grantOcBoost: 0,
    grantOcApplicationRate: 0,
    removeOcState: 0,
    ocStateNonIntersection: 0,
    ocRemovalResistance: 0,
    grantCells: 0,
    resistanceCells: 0,
    rawGrantCells: 0,
    rawResistanceCells: 0,
    unchangedLimitBreakCells: 0,
    hpRateEffects: 0,
    hpRateCells: 0,
    boostOrigins: { constant: 0, active: 0 },
    nonIntersectionProofs: {} as Record<string, number>,
  };
  for (const effect of effects)
    for (const operation of effect.execution) {
      if (operation.kind === 'removeOcState') {
        inventory.removeOcState++;
        continue;
      }
      if (operation.kind === 'ocStateNonIntersection') {
        inventory.ocStateNonIntersection++;
        inventory.nonIntersectionProofs[operation.proof] =
          (inventory.nonIntersectionProofs[operation.proof] ?? 0) + 1;
        continue;
      }
      if (
        operation.kind !== 'grantOcBoost' &&
        operation.kind !== 'grantOcApplicationRate' &&
        operation.kind !== 'ocRemovalResistance'
      )
        continue;
      inventory[operation.kind]++;
      const cells = [...operation.cells.flat(), ...(operation.limitBreakCells?.flat() ?? [])];
      const rawCells =
        effect.atlasEvidence.parameterSets.flat().length +
        (effect.atlasEvidence.limitBreakParameterSets?.flat().length ?? 0);
      if (operation.limitBreakCells && !effect.atlasEvidence.limitBreakParameterSets) {
        if (JSON.stringify(operation.limitBreakCells) !== JSON.stringify(operation.cells))
          throw new Error(`oc_limit_break_without_evidence:${effect.occurrenceId}`);
        inventory.unchangedLimitBreakCells += operation.limitBreakCells.flat().length;
      }
      if (operation.kind === 'ocRemovalResistance') inventory.rawResistanceCells += rawCells;
      else inventory.rawGrantCells += rawCells;
      if (operation.kind === 'ocRemovalResistance') inventory.resistanceCells += cells.length;
      else inventory.grantCells += cells.length;
      if (operation.kind === 'grantOcBoost') inventory.boostOrigins[operation.lifetime]++;
      if (operation.kind === 'grantOcApplicationRate') {
        const hpCells = cells.filter(
          (cell) =>
            'amount' in cell &&
            (cell.amount.kind === 'inverseHpLinear' || cell.amount.kind === 'hpRangeLinear'),
        ).length;
        inventory.hpRateCells += hpCells;
        if (hpCells) inventory.hpRateEffects++;
      }
    }
  return inventory;
}
