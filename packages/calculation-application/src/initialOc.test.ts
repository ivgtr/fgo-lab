import { applyRankingSelectionCommand } from './rankingBasis';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';
import { expect, it } from 'vitest';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import fixture from '../../test-fixtures/master/fixture.json';
import { createDefaultResolvedScenario } from './scenario';
import { changeResolvedInitialOc, changeResolvedNpLevel, initialOcOptions } from './initialOc';

it('preserves a legal initial OC and resets an illegal one to OC1 in the NP command', () => {
  const master = masterSnapshotSchema.parse(fixture);
  const semantics = master.npResourceSemantics;
  const base = createDefaultResolvedScenario(master, undefined);
  for (const npLevel of [1, 2, 3, 4, 5]) {
    expect(initialOcOptions(semantics, npLevel)).toEqual(
      npLevel === 1 ? [1] : npLevel === 5 ? [1, 2, 3] : [1, 2],
    );
    for (const initialOvercharge of [1, 2, 3] as const) {
      const scenario = { ...base, attacker: { ...base.attacker, npLevel: 5 }, initialOvercharge };
      const changed = changeResolvedNpLevel(scenario, semantics, npLevel);
      expect(changed.attacker.npLevel).toBe(npLevel);
      expect(changed.initialOvercharge).toBe(
        initialOcOptions(semantics, npLevel).includes(initialOvercharge) ? initialOvercharge : 1,
      );
    }
  }
  expect(() => changeResolvedInitialOc(base, semantics, 2)).toThrow('initialOcExceedsNpCapacity');
});

it('applies the same NP capacity command in calculator, specified ranking and owned ranking', () => {
  const master = masterSnapshotSchema.parse(fixture);
  const base = createDefaultResolvedScenario(master, undefined);
  for (const npLevel of [1, 2, 3, 4, 5] as const) {
    for (const initialOvercharge of [1, 2, 3] as const) {
      const expected =
        initialOvercharge <= (npLevel === 1 ? 1 : npLevel === 5 ? 3 : 2) ? initialOvercharge : 1;
      const calculator = changeResolvedNpLevel(
        { ...base, attacker: { ...base.attacker, npLevel: 5 }, initialOvercharge },
        master.npResourceSemantics,
        npLevel,
      );
      for (const npLevelBasis of [{ kind: 'specified', npLevel: 5 }, { kind: 'owned' }] as const) {
        const ranking = applyRankingSelectionCommand(
          {
            ...DEFAULT_RANKING_POLICY_CONDITIONS,
            population: 'owned',
            npLevelBasis,
            initialOvercharge,
          },
          { kind: 'setNpLevelBasis', value: { kind: 'specified', npLevel } },
        );
        expect(ranking.status).toBe('valid');
        if (ranking.status !== 'valid') throw new Error(ranking.detail);
        expect(ranking.selection.initialOvercharge).toBe(expected);
        expect(ranking.selection.initialOvercharge).toBe(calculator.initialOvercharge);
      }
    }
  }
});
