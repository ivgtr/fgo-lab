import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { describe, expect, it } from 'vitest';
import { applyEffectProjectionDecision } from './effectDecision';
import { calculateScenario, createDefaultResolvedScenario } from './scenario';

const root = resolve(import.meta.dirname, '../../..');

function withoutVersionEvidence(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutVersionEvidence);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(
        ([key]) => !['versions', 'masterDataVersion', 'engineVersion', 'evidence'].includes(key),
      )
      .map(([key, child]) => [key, withoutVersionEvidence(child)]),
  );
}

describe('production execution parity ratchet', () => {
  it('reproduces the 1,954 pre-MLB-fix scenarios exactly', async () => {
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
    const records: unknown[] = [];
    let defaults = 0;
    let selected = 0;
    for (const servant of master.servants) {
      let scenario;
      try {
        scenario = createDefaultResolvedScenario(master, undefined, servant);
      } catch {
        continue;
      }
      const initial = calculateScenario(scenario, master, versions);
      records.push(['default', servant.id, withoutVersionEvidence(initial)]);
      defaults += 1;
      for (const projection of initial.effects.filter(
        (effect) => effect.controllability === 'user',
      )) {
        const decision = applyEffectProjectionDecision(scenario, projection, true);
        records.push([
          'selected',
          servant.id,
          projection.projectionKey,
          withoutVersionEvidence(calculateScenario(decision, master, versions)),
        ]);
        selected += 1;
      }
    }
    expect({ defaults, selected }).toEqual({ defaults: 420, selected: 1_534 });
    expect(createHash('sha256').update(JSON.stringify(records)).digest('hex')).toBe(
      '825dcf95b265e585cce9343ed6d4b7a180f531794ca3f0e173516220c5d0bc3a',
    );
  }, 30_000);
});
