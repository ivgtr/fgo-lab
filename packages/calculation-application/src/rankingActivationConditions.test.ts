import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  activationFactKey,
  calculationScenarioSchema,
  APP_VERSION,
  ENGINE_VERSION,
  SCHEMA_VERSION,
} from '@fgo-lab/schema';
import { beforeAll, describe, expect, it } from 'vitest';
import { calculateRankingDetail, DEFAULT_RANKING_CONDITIONS } from './ranking';
import { calculateScenario } from './scenario';

const root = resolve(import.meta.dirname, '../../..');
const profile = { servantBuilds: {}, craftEssences: [], supportTemplates: [] };

describe('ranking activation-local canonical facts', () => {
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
    expect(detail.scenario.activationFacts.length).toBeGreaterThan(0);
    const candidatesByGroup = new Map<string, Set<string>>();
    for (const fact of detail.scenario.activationFacts) {
      if (fact.kind !== 'choice') continue;
      const group = JSON.stringify([fact.source, fact.family]);
      const candidates = candidatesByGroup.get(group) ?? new Set<string>();
      candidates.add(fact.candidate);
      candidatesByGroup.set(group, candidates);
    }
    expect([...candidatesByGroup.values()].every((candidates) => candidates.size === 1)).toBe(true);
  });

  it.each([
    ['204900', [22_653.385, 30_204.705, 33_980.14, 35_868.165, 37_755.995]],
    ['2301200', [29_085.695, 38_697.755, 43_503.785, 45_906.805, 48_309.83]],
    ['2800500', [28_656.495, 38_138.835, 42_879.995, 45_250.57, 47_621.16]],
  ])('materializes operation-trigger facts for %s', (servantId, averages) => {
    const servant = master.servants.find(({ id }) => id === servantId)!;
    const detail = calculateRankingDetail(
      servant,
      master,
      profile,
      DEFAULT_RANKING_CONDITIONS,
      versions,
    );
    expect(detail.scenario.activationFacts.some((fact) => fact.kind === 'operationTrigger')).toBe(
      true,
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
  });

  it('uses one choice fact to apply every operation in the selected Beni-enma candidate', () => {
    const servant = master.servants.find(({ id }) => id === '705300')!;
    const detail = calculateRankingDetail(
      servant,
      master,
      profile,
      DEFAULT_RANKING_CONDITIONS,
      versions,
    );
    const selectedChoiceFacts = detail.scenario.activationFacts.filter(
      (fact) => fact.kind === 'choice',
    );
    expect(selectedChoiceFacts).toHaveLength(1);
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
    const sourceQuantityFacts = detail.scenario.activationFacts.filter(
      (fact) => fact.kind === 'sourceQuantity',
    );
    expect(sourceQuantityFacts).toHaveLength(1);
  });

  it('rejects a Beni-enma scenario when a required activation fact is missing', () => {
    const servant = master.servants.find(({ id }) => id === '705300')!;
    const detail = calculateRankingDetail(
      servant,
      master,
      profile,
      DEFAULT_RANKING_CONDITIONS,
      versions,
    );
    const crafted = {
      ...detail.scenario,
      activationFacts: detail.scenario.activationFacts.filter(
        (fact) => fact.kind !== 'sourceQuantity',
      ),
    };
    expect(calculationScenarioSchema.safeParse(crafted).success).toBe(true);
    const result = calculateScenario(crafted, master, versions);
    expect(result.result.status).toBe('unsupported');
    expect(
      result.result.issues.some((issue) =>
        issue.code.includes('invalidActivationContext:missing:missingRequiredFact'),
      ),
    ).toBe(true);
    expect(
      result.effects.find(
        (effect) => effect.skillName === 'くらくらの膳 A' && effect.modifier === 'npDamageBuff',
      )?.outcome,
    ).not.toBe('applied');
  });

  it('rejects an orphan activation fact', () => {
    const servant = master.servants.find(({ id }) => id === '705300')!;
    const detail = calculateRankingDetail(
      servant,
      master,
      profile,
      DEFAULT_RANKING_CONDITIONS,
      versions,
    );
    const source = detail.scenario.activationFacts[0]!.source;
    const crafted = {
      ...detail.scenario,
      activationFacts: [
        ...detail.scenario.activationFacts,
        { kind: 'operationTrigger' as const, source, position: 999 },
      ].sort((left, right) => activationFactKey(left).localeCompare(activationFactKey(right))),
    };
    const unknown = calculateScenario(crafted, master, versions);
    expect(unknown.result.status).toBe('unsupported');
    expect(
      unknown.result.issues.some((issue) => issue.code.includes('invalidActivationContext:')),
    ).toBe(true);
  });

  it('round-trips canonical activation facts without changing Beni-enma damage', () => {
    const servant = master.servants.find(({ id }) => id === '705300')!;
    const detail = calculateRankingDetail(
      servant,
      master,
      profile,
      DEFAULT_RANKING_CONDITIONS,
      versions,
    );
    const restored = calculationScenarioSchema.parse(JSON.parse(JSON.stringify(detail.scenario)));
    if (restored.mode !== 'resolved') throw new TypeError('expected resolved scenario');
    const result = calculateScenario(restored, master, versions);
    expect(restored.activationFacts).toEqual(detail.scenario.activationFacts);
    expect(result.input).toEqual(detail.input);
    expect(result.result).toEqual(detail.result);
  });
});

async function loadMaster() {
  return masterSnapshotSchema.parse(
    JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
  );
}
