import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { describe, expect, it } from 'vitest';
import { calculateScenario, createDefaultResolvedScenario } from './scenario';
import { planPreNoblePhantasmCandidates } from './preNoblePhantasmPlanner';

const root = resolve(import.meta.dirname, '../../..');

describe('production execution parity ratchet', () => {
  it('executes every reachable default calculator scenario through preparation actions', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const versions = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP' as const,
      masterDataLocale: 'ja-JP' as const,
      masterDataVersion: master.version,
    };
    const records = master.servants.flatMap((servant) => {
      if (planPreNoblePhantasmCandidates(servant).candidates.length === 0) return [];
      const scenario = createDefaultResolvedScenario(master, undefined, servant);
      const calculation = calculateScenario(scenario, master, versions);
      expect(calculation.result.status, `${servant.id}:${servant.name}`).toBe('calculated');
      expect(calculation.appliedPreparationActions).toHaveLength(
        scenario.preNoblePhantasmPlan.length,
      );
      return [
        {
          attackerId: servant.id,
          initialActorFormId: scenario.attacker.initialActorFormId,
          plan: scenario.preNoblePhantasmPlan,
          noblePhantasmVariant: calculation.noblePhantasmVariant?.ref ?? null,
          input: calculation.input,
          rows: calculation.result.rows,
        },
      ];
    });

    expect(records).toHaveLength(422);
    expect(createHash('sha256').update(JSON.stringify(records)).digest('hex')).toBe(
      '8583211465b4a0dbc0a519626b0565092e7b2904f3e44ad0f345e5d823039e0e',
    );
  }, 60_000);
});
