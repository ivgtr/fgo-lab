import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyCanonicalInputCommand, resolveCanonicalInputValues } from './canonicalInputs';
import { calculateScenario, createDefaultResolvedScenario } from './scenario';

const root = resolve(import.meta.dirname, '../../..');
let master: ReturnType<typeof masterSnapshotSchema.parse>;

beforeAll(async () => {
  master = masterSnapshotSchema.parse(
    JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
  );
});

function calculate(attackerId: string) {
  const servant = master.servants.find((candidate) => candidate.id === attackerId)!;
  const scenario = createDefaultResolvedScenario(master, undefined, servant);
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

describe('canonical special input application boundary', () => {
  it('projects John count semantics next to the two NP damage effects', () => {
    const { calculation } = calculate('1102000');
    expect(calculation.effectInputs).toMatchObject([
      {
        kind: 'matchingActorCount',
        label: '〔王〕一致数',
        control: 'stepper',
        value: 1,
        defaultValue: 1,
        section: 'own',
        relatedEffectLabels: ['宝具威力アップ'],
      },
      {
        kind: 'matchingActorCount',
        label: '〔悪〕一致数',
        control: 'stepper',
        value: 1,
        defaultValue: 1,
        section: 'own',
        relatedEffectLabels: ['宝具威力アップ'],
      },
    ]);
    expect(calculation.input.npDamageBuff).toBe(0.2);
  });

  it('uses a compact semantic control for Habetrot enemy population', () => {
    const { calculation } = calculate('2801300');
    expect(calculation.effectInputs.find((input) => input.label === '敵の合計数')).toMatchObject({
      kind: 'matchingActorCount',
      control: 'segmented',
      minimum: 1,
      maximum: 3,
      value: 1,
      relatedEffectLabels: ['宝具威力アップ'],
    });
    expect(calculation.input.npDamageBuff).toBe(0.1);
  });

  it('keeps a shared star input available while threshold effects are hidden', () => {
    const { calculation } = calculate('2801300');
    const stars = calculation.effectInputs.find((input) => input.kind === 'criticalStars')!;
    expect(stars).toMatchObject({
      key: 'battle:criticalStars',
      control: 'stepper',
      value: 0,
      relatedEffectLabels: ['攻撃力アップ'],
    });
    expect(stars.relatedProjectionKeys).toHaveLength(10);
    expect(calculation.effectInputs.filter((input) => input.key === stars.key)).toHaveLength(1);
  });

  it('does not project input consumed only by a non-damage operation', () => {
    const { calculation } = calculate('3300200');
    expect(calculation.inputDefinitions.some((input) => input.kind === 'friendshipLevel')).toBe(
      true,
    );
    expect(calculation.effectInputs.some((input) => input.kind === 'friendshipLevel')).toBe(false);
  });

  it('rejects a value below the derived minimum without clamping', () => {
    const { scenario, calculation } = calculate('1102000');
    const king = calculation.effectInputs.find((input) => input.label === '〔王〕一致数')!;
    const invalidScenario = applyCanonicalInputCommand(scenario, {
      kind: 'setCanonicalIntegerInput',
      key: king.key,
      value: 0,
    });
    const invalid = calculateScenario(invalidScenario, master, {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    });
    expect(invalid.result).toMatchObject({ status: 'inputRequired', rows: [] });
    expect(invalid.effectInputs.find((input) => input.key === king.key)).toMatchObject({
      value: 0,
      invalid: true,
      explicit: true,
    });
    expect(invalid.input.npDamageBuff).toBe(0.1);
  });

  it('resolves defaults and invalid explicit values before execution', () => {
    const definition = calculate('2801300').calculation.inputDefinitions.find(
      (input) => input.label === '敵の合計数',
    )!;
    expect(resolveCanonicalInputValues([definition], {})).toEqual({
      values: { [definition.key]: 1 },
      missingDefinitions: [],
      invalidInputKeys: [],
    });
    expect(
      resolveCanonicalInputValues([definition], {
        [definition.key]: { kind: 'integer', value: 0 },
      }),
    ).toMatchObject({ values: {}, missingDefinitions: [{ key: definition.key }] });
  });

  it('fails closed when portable scenario data contains an unknown canonical key', () => {
    const { scenario } = calculate('2801300');
    const invalid = calculateScenario(
      {
        ...scenario,
        canonicalInputValues: {
          unknown: { kind: 'integer', value: 1 },
        },
      },
      master,
      {
        schemaVersion: SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
        appVersion: '0.1.0',
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
        masterDataVersion: master.version,
      },
    );
    expect(invalid.result).toMatchObject({ status: 'unsupported', rows: [] });
    expect(invalid.effectWarnings).toContain('invalidCanonicalInput:unknown:unknownInputKey');
  });
});
