import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION, type VersionContext } from '@fgo-lab/schema';
import { describe, expect, it } from 'vitest';
import { applyEffectProjectionDecision } from './effectDecision';
import { calculateScenario, createDefaultResolvedScenario } from './scenario';

const root = resolve(import.meta.dirname, '../../..');
const formerlyUnsupportedSelections = [
  ['400100', '22457:0'],
  ['506000', '23549:0'],
  ['506000', '23547:0'],
  ['603200', '6925:0'],
  ['604700', '20775:0'],
  ['703300', '3683:0'],
  ['1100400', '22457:0'],
  ['404900', 'linkedTraitFamily'],
  ['702600', '194:0'],
  ['1100700', '147:0'],
  ['1000900', '8808:0'],
  ['1101100', '7592:0'],
  ['2801300', '23559:0'],
  ...Array.from({ length: 10 }, (_, index) => ['2801300', `23594:${String(index)}`] as const),
  ['2500200', '2096:0'],
  ['3300200', 'automaticReference'],
] as const;

describe('unsupported convergence production golden', () => {
  it('calculates all 420 attacking NPs and the 25 formerly unsupported selections exactly', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    const attackingServants = master.servants.filter((servant) =>
      servant.noblePhantasms.some((np) => np.damage.length > 0),
    );
    expect(attackingServants).toHaveLength(420);
    for (const servant of attackingServants) {
      const calculation = calculateScenario(
        createDefaultResolvedScenario(master, undefined, servant),
        master,
        versions,
      );
      expect(calculation.result.status, `${servant.id}:${servant.name}`).toBe('calculated');
    }

    const records = formerlyUnsupportedSelections.map(([servantId, occurrenceId]) => {
      const automaticInput = occurrenceId === 'automaticReference';
      const initiallyHiddenByInput = occurrenceId.startsWith('23594:');
      const servant = master.servants.find((candidate) => candidate.id === servantId)!;
      let scenario = createDefaultResolvedScenario(master, undefined, servant);
      const baseline = calculateScenario(scenario, master, versions);
      const projection =
        occurrenceId === 'linkedTraitFamily'
          ? baseline.effects.find(
              (effect) =>
                effect.source.skillId === '2150650' &&
                effect.visibility === 'visible' &&
                effect.controllability === 'user',
            )
          : baseline.effects.find(
              (effect) =>
                effect.source.effectOccurrenceId ===
                  (occurrenceId === 'automaticReference' ? '21814:0' : occurrenceId) &&
                (automaticInput || initiallyHiddenByInput || effect.controllability === 'user'),
            );
      expect(projection, `${servantId}:${occurrenceId}`).toBeDefined();
      scenario = {
        ...scenario,
        battleContext: {
          values: Object.fromEntries(
            projection!.requiredInputs.map((definition) => [definition.key, definition.maximum]),
          ),
        },
      };
      const withInputs = calculateScenario(scenario, master, versions);
      const currentProjection = withInputs.effects.find(
        (effect) => effect.projectionKey === projection!.projectionKey,
      )!;
      const selected = calculateScenario(
        automaticInput
          ? scenario
          : applyEffectProjectionDecision(scenario, currentProjection, true),
        master,
        versions,
      );
      expect(selected.result.status, `${servantId}:${occurrenceId}`).toBe('calculated');
      expect(
        selected.effects.find((effect) => effect.projectionKey === projection!.projectionKey)
          ?.outcome,
        `${servantId}:${occurrenceId}`,
      ).toBe(occurrenceId === 'automaticReference' ? 'notRelevant' : 'applied');
      if (occurrenceId === 'linkedTraitFamily')
        expect(
          selected.effects
            .filter((effect) => ['9619:0', '9620:0'].includes(effect.source.effectOccurrenceId))
            .map((effect) => [effect.source.effectOccurrenceId, effect.outcome, effect.visibility]),
        ).toEqual([
          ['9619:0', 'applied', 'hidden'],
          ['9620:0', 'applied', 'hidden'],
        ]);
      if (selected.result.status !== 'calculated') throw new Error('exact result required');
      return {
        servantId,
        occurrenceId,
        input: selected.input,
        rows: selected.result.rows,
        appliedOperations: selected.effects
          .filter((effect) => effect.outcome === 'applied')
          .map((effect) => effect.operationId),
      };
    });
    expect(records).toHaveLength(25);
    expect(
      records.map(({ servantId, occurrenceId, rows }) => ({
        servantId,
        occurrenceId,
        np1To5Average: rows.map((row) => row.average),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "np1To5Average": [
            40268.83,
            50312.415,
            55334.215,
            57845.11,
            60356,
          ],
          "occurrenceId": "22457:0",
          "servantId": "400100",
        },
        {
          "np1To5Average": [
            26906.67,
            35875.725,
            40360.235,
            42602.52,
            44844.775,
          ],
          "occurrenceId": "23549:0",
          "servantId": "506000",
        },
        {
          "np1To5Average": [
            41395.155,
            55193.705,
            62092.985,
            65542.605,
            68992.225,
          ],
          "occurrenceId": "23547:0",
          "servantId": "506000",
        },
        {
          "np1To5Average": [
            49045.935,
            61270.045,
            67382.08,
            70438.12,
            73494.145,
          ],
          "occurrenceId": "6925:0",
          "servantId": "603200",
        },
        {
          "np1To5Average": [
            35490.61,
            47270.985,
            53161.15,
            56106.265,
            59051.34,
          ],
          "occurrenceId": "20775:0",
          "servantId": "604700",
        },
        {
          "np1To5Average": [
            57338.62,
            76368.34,
            85883.185,
            90640.62,
            95398.05,
          ],
          "occurrenceId": "3683:0",
          "servantId": "703300",
        },
        {
          "np1To5Average": [
            53281.98,
            66602.59,
            73262.9,
            76593.06,
            79923.22,
          ],
          "occurrenceId": "22457:0",
          "servantId": "1100400",
        },
        {
          "np1To5Average": [
            52958.18,
            70561.075,
            79362.515,
            83763.24,
            88163.96,
          ],
          "occurrenceId": "linkedTraitFamily",
          "servantId": "404900",
        },
        {
          "np1To5Average": [
            34968.185,
            46624.395,
            52452.5,
            55366.56,
            58280.615,
          ],
          "occurrenceId": "194:0",
          "servantId": "702600",
        },
        {
          "np1To5Average": [
            52776.05,
            70368.235,
            79164.335,
            83562.37,
            87960.42,
          ],
          "occurrenceId": "147:0",
          "servantId": "1100700",
        },
        {
          "np1To5Average": [
            60245.67,
            80244.405,
            90243.765,
            95243.445,
            100243.12,
          ],
          "occurrenceId": "8808:0",
          "servantId": "1000900",
        },
        {
          "np1To5Average": [
            64918.145,
            86482.7,
            97264.96,
            102656.1,
            108047.24,
          ],
          "occurrenceId": "7592:0",
          "servantId": "1101100",
        },
        {
          "np1To5Average": [
            73300.45,
            97734.105,
            109950.905,
            116059.355,
            122167.765,
          ],
          "occurrenceId": "23559:0",
          "servantId": "2801300",
        },
        {
          "np1To5Average": [
            52913.63,
            70551.665,
            79370.69,
            83780.21,
            88189.715,
          ],
          "occurrenceId": "23594:0",
          "servantId": "2801300",
        },
        {
          "np1To5Average": [
            52913.63,
            70551.665,
            79370.69,
            83780.21,
            88189.715,
          ],
          "occurrenceId": "23594:1",
          "servantId": "2801300",
        },
        {
          "np1To5Average": [
            52913.63,
            70551.665,
            79370.69,
            83780.21,
            88189.715,
          ],
          "occurrenceId": "23594:2",
          "servantId": "2801300",
        },
        {
          "np1To5Average": [
            52913.63,
            70551.665,
            79370.69,
            83780.21,
            88189.715,
          ],
          "occurrenceId": "23594:3",
          "servantId": "2801300",
        },
        {
          "np1To5Average": [
            52913.63,
            70551.665,
            79370.69,
            83780.21,
            88189.715,
          ],
          "occurrenceId": "23594:4",
          "servantId": "2801300",
        },
        {
          "np1To5Average": [
            52913.63,
            70551.665,
            79370.69,
            83780.21,
            88189.715,
          ],
          "occurrenceId": "23594:5",
          "servantId": "2801300",
        },
        {
          "np1To5Average": [
            52913.63,
            70551.665,
            79370.69,
            83780.21,
            88189.715,
          ],
          "occurrenceId": "23594:6",
          "servantId": "2801300",
        },
        {
          "np1To5Average": [
            52913.63,
            70551.665,
            79370.69,
            83780.21,
            88189.715,
          ],
          "occurrenceId": "23594:7",
          "servantId": "2801300",
        },
        {
          "np1To5Average": [
            52913.63,
            70551.665,
            79370.69,
            83780.21,
            88189.715,
          ],
          "occurrenceId": "23594:8",
          "servantId": "2801300",
        },
        {
          "np1To5Average": [
            52913.63,
            70551.665,
            79370.69,
            83780.21,
            88189.715,
          ],
          "occurrenceId": "23594:9",
          "servantId": "2801300",
        },
        {
          "np1To5Average": [
            53947.7,
            67391,
            74112.7,
            77473.53,
            80834.36,
          ],
          "occurrenceId": "2096:0",
          "servantId": "2500200",
        },
        {
          "np1To5Average": [
            25850.53,
            34420.875,
            38706.045,
            40848.63,
            42991.215,
          ],
          "occurrenceId": "automaticReference",
          "servantId": "3300200",
        },
      ]
    `);
    expect(createHash('sha256').update(JSON.stringify(records)).digest('hex')).toBe(
      'ed094c9ad3057f0648444c71b6649a88c262a7fe04180f721d4f804bafdbe72d',
    );
  }, 30_000);

  it('evaluates Ashoka single-enemy field count exactly and rejects invalid context', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const servant = master.servants.find((candidate) => candidate.id === '305800')!;
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    const scenario = createDefaultResolvedScenario(master, undefined, servant);
    const single = calculateScenario(scenario, master, versions);
    const fieldEffect = single.effects.find(
      (effect) => effect.source.effectOccurrenceId === '249:0',
    )!;
    expect(fieldEffect.requiredInputs).toMatchObject([
      {
        key: 'field:enemyCount',
        kind: 'fieldActorCount',
        minimum: 1,
        maximum: 3,
        defaultValue: 1,
      },
    ]);
    expect(single.result.status).toBe('calculated');
    expect(single.input.npDamageBuff).toBe(0.5);
    expect(fieldEffect.outcome).toBe('applied');

    const multiple = calculateScenario(
      { ...scenario, battleContext: { values: { 'field:enemyCount': 2 } } },
      master,
      versions,
    );
    expect(multiple.result.status).toBe('calculated');
    expect(multiple.input.npDamageBuff).toBe(0);
    expect(
      multiple.effects.find((effect) => effect.source.effectOccurrenceId === '249:0')?.outcome,
    ).toBe('notApplied');

    const invalid = calculateScenario(
      { ...scenario, battleContext: { values: { 'field:enemyCount': 0 } } },
      master,
      versions,
    );
    expect(invalid.result).toMatchObject({
      status: 'inputRequired',
      rows: [],
      requiredInputs: [
        {
          key: 'field:enemyCount',
          minimum: 1,
          maximum: 3,
          effectOccurrenceIds: ['249:0'],
        },
      ],
    });
    if (single.result.status !== 'calculated' || multiple.result.status !== 'calculated')
      throw new Error('exact Ashoka rows required');
    expect({ single: single.result.rows, multiple: multiple.result.rows }).toMatchInlineSnapshot(`
      {
        "multiple": [
          {
            "average": 23317.22,
            "maximum": 25621,
            "minimum": 21013,
            "npLevel": 1,
          },
          {
            "average": 31031.46,
            "maximum": 34103,
            "minimum": 27960,
            "npLevel": 2,
          },
          {
            "average": 34888.58,
            "maximum": 38344,
            "minimum": 31433,
            "npLevel": 3,
          },
          {
            "average": 36817.14,
            "maximum": 40465,
            "minimum": 33169,
            "npLevel": 4,
          },
          {
            "average": 38745.705,
            "maximum": 42585,
            "minimum": 34906,
            "npLevel": 5,
          },
        ],
        "single": [
          {
            "average": 34888.58,
            "maximum": 38344,
            "minimum": 31433,
            "npLevel": 1,
          },
          {
            "average": 46459.94,
            "maximum": 51068,
            "minimum": 41852,
            "npLevel": 2,
          },
          {
            "average": 52245.615,
            "maximum": 57429,
            "minimum": 47062,
            "npLevel": 3,
          },
          {
            "average": 55138.445,
            "maximum": 60610,
            "minimum": 49667,
            "npLevel": 4,
          },
          {
            "average": 58031.31,
            "maximum": 63791,
            "minimum": 52272,
            "npLevel": 5,
          },
        ],
      }
    `);
  });
});
