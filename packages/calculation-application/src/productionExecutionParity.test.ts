import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { describe, expect, it } from 'vitest';
import {
  calculateScenario as calculateScenarioOutcome,
  createDefaultResolvedScenario,
  requireExecutableCalculation,
} from './scenario';
const calculateScenario = (...args: Parameters<typeof calculateScenarioOutcome>) =>
  requireExecutableCalculation(calculateScenarioOutcome(...args));
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
    const typedUnsupported = new Set(['702500', '705300']);
    const records = master.servants.flatMap((servant) => {
      if (
        planPreNoblePhantasmCandidates(servant, master.npResourceSemantics, 1, 1).candidates
          .length === 0
      )
        return [];
      const scenario = createDefaultResolvedScenario(master, undefined, servant);
      const calculation = calculateScenario(scenario, master, versions);
      // E2E-A032-ORDER
      expect(calculation.result.status, `${servant.id}:${servant.name}`).toBe(
        typedUnsupported.has(servant.id) ? 'unsupported' : 'calculated',
      );
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
    expect(
      records
        .filter(({ attackerId }) => typedUnsupported.has(attackerId))
        .map(({ attackerId }) => attackerId),
    ).toEqual(['702500', '705300']);
    const digest = createHash('sha256').update(JSON.stringify(records)).digest('hex');
    expect(digest).toBe('bdc64981fed6bf339bf7cc2c5fa101cfd9b5080e8443e5c00938a928b4c4ff1d');
  }, 60_000);
});
