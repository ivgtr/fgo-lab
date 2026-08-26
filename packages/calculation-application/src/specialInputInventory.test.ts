import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { describe, expect, it } from 'vitest';
import { calculateScenario, createDefaultResolvedScenario } from './scenario';

const root = resolve(import.meta.dirname, '../../..');

describe('production special input inventory', () => {
  it('ratchets effect-scoped inputs and excludes duplicate or inert UI controls', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const versions = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    } as const;
    const calculations = master.servants.flatMap((servant) => {
      try {
        const scenario = createDefaultResolvedScenario(master, undefined, servant);
        return [calculateScenario(scenario, master, versions)];
      } catch {
        return [];
      }
    });
    const inputs = calculations.flatMap((calculation) => calculation.effectInputs);
    const counts = inputs.reduce<Record<string, number>>((result, input) => {
      result[input.kind] = (result[input.kind] ?? 0) + 1;
      return result;
    }, {});
    const duplicateControls = calculations.flatMap((calculation) => {
      const keys = calculation.effectInputs.map((input) => input.key);
      return keys.filter((key, index) => keys.indexOf(key) !== index);
    });

    expect(calculations).toHaveLength(420);
    expect(calculations.every((calculation) => calculation.result.status === 'calculated')).toBe(
      true,
    );
    expect(inputs).toHaveLength(12);
    expect(counts).toEqual({
      availableSkillCount: 1,
      criticalStars: 1,
      currentTurn: 2,
      effectStackCount: 4,
      fieldActorCount: 1,
      matchingActorCount: 3,
    });
    expect(inputs.filter((input) => input.control === 'segmented')).toHaveLength(3);
    expect(inputs.filter((input) => input.control === 'stepper')).toHaveLength(9);
    expect(inputs.filter((input) => input.section === 'support')).toHaveLength(0);
    expect(duplicateControls).toEqual([]);
    expect(inputs.some((input) => input.kind === 'friendshipLevel')).toBe(false);
    expect(inputs.every((input) => input.relatedProjectionKeys.length > 0)).toBe(true);
  }, 20_000);
});
