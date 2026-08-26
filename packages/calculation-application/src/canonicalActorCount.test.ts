import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { calculationScenarioSchema, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { beforeAll, describe, expect, it } from 'vitest';
import { calculateScenario, createDefaultResolvedScenario } from './scenario';

const root = resolve(import.meta.dirname, '../../..');
let master: ReturnType<typeof masterSnapshotSchema.parse>;

beforeAll(async () => {
  master = masterSnapshotSchema.parse(
    JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
  );
});

function calculate(attackerId: string, values: Record<string, number> = {}) {
  const servant = master.servants.find((candidate) => candidate.id === attackerId)!;
  const scenario = {
    ...createDefaultResolvedScenario(master, undefined, servant),
    battleContext: { values },
  };
  return {
    scenario,
    calculation: calculateScenario(scenario, master, {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    }),
  };
}

function averages(result: ReturnType<typeof calculate>['calculation']['result']) {
  if (result.status !== 'calculated') throw new Error(`expected calculated: ${result.status}`);
  return result.rows.map((row) => row.average);
}

describe('canonical actor population counts', () => {
  it('ratchets every production matching-count occurrence and its canonical family', () => {
    const occurrences = master.servants.flatMap((servant) =>
      [...servant.skills, ...servant.passives, ...servant.noblePhantasms].flatMap((source) =>
        source.effects.flatMap((effect) =>
          effect.contextInputs.flatMap((input) =>
            input.kind === 'matchingActorCount'
              ? [
                  {
                    servantId: servant.id,
                    occurrenceId: effect.occurrenceId,
                    population: input.countSemantics.population,
                    label: input.label,
                  },
                ]
              : [],
          ),
        ),
      ),
    );
    expect(occurrences).toEqual([
      {
        servantId: '405700',
        occurrenceId: '201:0',
        population: 'allActors',
        label: '特性一致数（同一対象の重複計上あり）',
      },
      {
        servantId: '1102000',
        occurrenceId: '249:0',
        population: 'allActors',
        label: '〔王〕一致数',
      },
      {
        servantId: '1102000',
        occurrenceId: '249:1',
        population: 'allActors',
        label: '〔悪〕一致数',
      },
      {
        servantId: '2801300',
        occurrenceId: '249:0',
        population: 'enemies',
        label: '敵の合計数',
      },
    ]);
  });

  it('counts John himself once for King and once for Evil without servant-specific bonuses', () => {
    const { scenario, calculation } = calculate('1102000');
    const inputs = calculation.contextInputs.filter((input) => input.kind === 'matchingActorCount');
    expect(
      inputs.map(({ label, minimum, defaultValue }) => ({ label, minimum, defaultValue })),
    ).toEqual([
      { label: '〔王〕一致数', minimum: 1, defaultValue: 1 },
      { label: '〔悪〕一致数', minimum: 1, defaultValue: 1 },
    ]);
    expect(calculation.input.npDamageBuff).toBe(0.2);
    expect(averages(calculation.result)).toEqual([
      31_826.97, 42_436.13, 47_740.715, 50_393, 53_045.29,
    ]);
    const parsedScenario = calculationScenarioSchema.parse(scenario);
    if (parsedScenario.mode !== 'resolved') throw new Error('expected resolved scenario');
    expect(parsedScenario.battleContext.values).toEqual({});

    const explicitMinimum = calculate(
      '1102000',
      Object.fromEntries(inputs.map((input) => [input.key, input.minimum])),
    ).calculation;
    expect(explicitMinimum.input).toEqual(calculation.input);
    expect(averages(explicitMinimum.result)).toEqual(averages(calculation.result));
  });

  it('treats the Habetrot input as the final enemy total and supports one to three enemies', () => {
    const baseline = calculate('2801300').calculation;
    const input = baseline.contextInputs.find(
      (candidate) => candidate.kind === 'matchingActorCount',
    )!;
    expect(input).toMatchObject({ label: '敵の合計数', minimum: 1, maximum: 3, defaultValue: 1 });
    expect(baseline.input.npDamageBuff).toBe(0.1);
    expect(averages(baseline.result)).toEqual([
      50_393.91, 67_192.04, 75_591.115, 79_790.65, 83_990.17,
    ]);

    const threeEnemies = calculate('2801300', { [input.key]: 3 }).calculation;
    expect(threeEnemies.input.npDamageBuff).toBe(0.3);
    expect(averages(threeEnemies.result)).toEqual([
      59_556.525, 79_408.87, 89_335.04, 94_298.12, 99_261.215,
    ]);
  });

  it('fails closed when an explicit final count is below the canonical minimum', () => {
    for (const attackerId of ['1102000', '2801300']) {
      const baseline = calculate(attackerId).calculation;
      const inputs = baseline.contextInputs.filter((input) => input.kind === 'matchingActorCount');
      const invalid = calculate(
        attackerId,
        Object.fromEntries(inputs.map((input) => [input.key, input.minimum - 1])),
      ).calculation;
      expect(invalid.result.status, attackerId).toBe('inputRequired');
      expect(invalid.input.npDamageBuff, attackerId).toBe(0);
      expect(
        invalid.effects
          .filter((effect) => effect.source.effectOccurrenceId.startsWith('249:'))
          .every((effect) => effect.outcome !== 'applied'),
        attackerId,
      ).toBe(true);
    }
  });
});
