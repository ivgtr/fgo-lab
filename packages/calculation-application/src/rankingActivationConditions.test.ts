import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { beforeAll, describe, expect, it } from 'vitest';
import { calculateRankingDetail, DEFAULT_RANKING_CONDITIONS } from './ranking';

const root = resolve(import.meta.dirname, '../../..');
const profile = { servantBuilds: {}, craftEssences: [], supportTemplates: [] };

describe('ranking activation-local condition witnesses', () => {
  let master: Awaited<ReturnType<typeof loadMaster>>;
  let versions: {
    schemaVersion: typeof SCHEMA_VERSION;
    masterDataVersion: string;
    engineVersion: typeof ENGINE_VERSION;
    appVersion: typeof APP_VERSION;
    gameRegion: 'JP';
    masterDataLocale: 'ja-JP';
  };

  beforeAll(async () => {
    master = await loadMaster();
    versions = {
      schemaVersion: SCHEMA_VERSION,
      masterDataVersion: master.version,
      engineVersion: ENGINE_VERSION,
      appVersion: APP_VERSION,
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
    };
  });

  it.each([
    ['101000', [63_138.515, 78_923.26, 86_815.655, 90_761.845, 94_708.025]],
    ['603800', [23_557.645, 31_410.36, 35_336.71, 37_299.905, 39_263.075]],
    ['705300', [36_795.27, 49_060.53, 55_193.155, 58_259.47, 61_325.785]],
    ['2501100', [35_622.36, 47_496.64, 53_433.785, 56_402.36, 59_370.945]],
  ])('selects the maximum satisfiable choice candidate for %s', (servantId, averages) => {
    const servant = master.servants.find(({ id }) => id === servantId)!;
    const detail = calculateRankingDetail(
      servant,
      master,
      profile,
      DEFAULT_RANKING_CONDITIONS,
      versions,
    );
    expect(detail.result.status).toBe('calculated');
    expect(detail.result.rows.map(({ average }) => average)).toEqual(averages);
    const included = new Set(
      detail.scenario.effectDecisions
        .filter(({ operationEnabled }) => operationEnabled)
        .map(({ decisionKey }) => decisionKey),
    );
    expect(
      detail.effects.filter(
        (effect) => included.has(effect.projectionKey) && effect.explanation.code === 'unresolved',
      ),
    ).toEqual([]);
    expect(detail.scenario.activationWitnesses.length).toBeGreaterThan(0);
    const candidatesByGroup = new Map<string, Set<string>>();
    for (const { fact } of detail.scenario.activationWitnesses) {
      if (fact.kind !== 'choice') continue;
      const candidates = candidatesByGroup.get(fact.group) ?? new Set<string>();
      candidates.add(fact.candidate);
      candidatesByGroup.set(fact.group, candidates);
    }
    expect([...candidatesByGroup.values()].every((candidates) => candidates.size === 1)).toBe(true);
  });

  it.each([
    ['204900', [22_653.385, 30_204.705, 33_980.14, 35_868.165, 37_755.995]],
    ['2301200', [29_085.695, 38_697.755, 43_503.785, 45_906.805, 48_309.83]],
    ['2800500', [28_656.495, 38_138.835, 42_879.995, 45_250.57, 47_621.16]],
  ])('materializes operation-trigger witnesses for %s', (servantId, averages) => {
    const servant = master.servants.find(({ id }) => id === servantId)!;
    const detail = calculateRankingDetail(
      servant,
      master,
      profile,
      DEFAULT_RANKING_CONDITIONS,
      versions,
    );
    expect(
      detail.scenario.activationWitnesses.some(({ fact }) => fact.kind === 'operationTrigger'),
    ).toBe(true);
    expect(detail.result.status).toBe('calculated');
    expect(detail.result.rows.map(({ average }) => average)).toEqual(averages);
    const included = new Set(
      detail.scenario.effectDecisions
        .filter(({ operationEnabled }) => operationEnabled)
        .map(({ decisionKey }) => decisionKey),
    );
    expect(
      detail.effects.filter(
        (effect) => included.has(effect.projectionKey) && effect.explanation.code === 'unresolved',
      ),
    ).toEqual([]);
  });

  it('uses one choice witness to apply every operation in the selected Beni-enma candidate', () => {
    const servant = master.servants.find(({ id }) => id === '705300')!;
    const detail = calculateRankingDetail(
      servant,
      master,
      profile,
      DEFAULT_RANKING_CONDITIONS,
      versions,
    );
    const selectedChoiceFacts = detail.scenario.activationWitnesses.filter(
      ({ fact }) => fact.kind === 'choice',
    );
    expect(selectedChoiceFacts).toHaveLength(1);
    expect(selectedChoiceFacts[0]?.consumerDecisionKeys).toHaveLength(2);
    expect(
      detail.effects
        .filter(
          (effect) =>
            effect.outcome === 'applied' &&
            effect.skillName === 'くらくらの膳 A' &&
            (effect.modifier === 'attackBuff' || effect.modifier === 'npDamageBuff'),
        )
        .map(({ modifier }) => modifier)
        .sort(),
    ).toEqual(['attackBuff', 'npDamageBuff']);
    const sourceQuantityWitnesses = detail.scenario.activationWitnesses.filter(
      ({ fact }) => fact.kind === 'sourceQuantity',
    );
    expect(sourceQuantityWitnesses).toHaveLength(1);
    expect(sourceQuantityWitnesses[0]?.consumerDecisionKeys).toHaveLength(2);
  });
});

async function loadMaster() {
  return masterSnapshotSchema.parse(
    JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
  );
}
