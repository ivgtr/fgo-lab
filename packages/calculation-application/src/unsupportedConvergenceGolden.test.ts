import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import type { EffectProjection } from '@fgo-lab/battle-execution';
import { ENGINE_VERSION, SCHEMA_VERSION, type VersionContext } from '@fgo-lab/schema';
import { describe, expect, it } from 'vitest';
import {
  applyEffectConditionDecision,
  applyEffectProjectionDecision as applyEffectInclusionDecision,
} from './effectDecision';
import { calculateScenario, createDefaultResolvedScenario } from './scenario';
import { setEffectSourceEnabled } from './scenarioCommands';
import { createEffectControlViewModels } from './effectControls';

function selectProjectionAlone(
  scenario: Parameters<typeof applyEffectInclusionDecision>[0],
  projection: Parameters<typeof applyEffectInclusionDecision>[1],
  peers: readonly EffectProjection[],
) {
  const sourceEnabled = setEffectSourceEnabled(scenario, projection, true);
  const withoutSiblings = createEffectControlViewModels(peers)
    .map((control) => control.projection)
    .filter(
      (peer) =>
        peer.projectionKey !== projection.projectionKey &&
        peer.source.origin === projection.source.origin &&
        peer.source.sourceInstanceId === projection.source.sourceInstanceId &&
        peer.source.skillId === projection.source.skillId &&
        peer.controllability === 'user',
    )
    .reduce((current, peer) => applyEffectInclusionDecision(current, peer, false), sourceEnabled);
  const included = applyEffectInclusionDecision(withoutSiblings, projection, true);
  return projection.decision.state !== 'none' &&
    projection.decision.kind === 'effect' &&
    projection.decision.plan.condition === 'userMayAssume'
    ? applyEffectConditionDecision(included, projection, true, peers)
    : included;
}

const root = resolve(import.meta.dirname, '../../..');
const formerlyUnsupportedDefaults = [
  '106600',
  '202500',
  '203300',
  '305800',
  '400900',
  '506000',
  '702500',
  '1102000',
  '1102300',
  '2300600',
  '2801300',
  '3300200',
] as const;
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
  it('goldens every formerly unsupported default damage input and NP1-5 result', async () => {
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
    const records = formerlyUnsupportedDefaults.map((servantId) => {
      const servant = master.servants.find((candidate) => candidate.id === servantId)!;
      const calculation = calculateScenario(
        createDefaultResolvedScenario(master, undefined, servant),
        master,
        versions,
      );
      expect(calculation.result.status, `${servantId}:${servant.name}`).toBe('calculated');
      if (calculation.result.status !== 'calculated') throw new Error('exact result required');
      return {
        servantId,
        name: servant.name,
        inputDigest: createHash('sha256').update(JSON.stringify(calculation.input)).digest('hex'),
        np1To5Average: calculation.result.rows.map((row) => row.average),
        appliedOperations: calculation.effects
          .filter((effect) => effect.outcome === 'applied')
          .map((effect) => effect.operationId),
      };
    });
    expect(records).toHaveLength(12);
    expect(records).toMatchInlineSnapshot(`
      [
        {
          "appliedOperations": [
            "np:np:106600:np:106600:248:0:modifier:npDamageBuff",
            "np:np:106600:np:106600:23291:0:addTrait-target:buffBurn",
            "np:106600:5337:damage",
          ],
          "inputDigest": "1d55420f3d2f8606be3de48bad7d231408e2d479eb69f31b9bef1fcd86ffaf31",
          "name": "ジャック・ド・モレー",
          "np1To5Average": [
            31998.575,
            42664.93,
            47998.095,
            50664.69,
            53331.28,
          ],
          "servantId": "106600",
        },
        {
          "appliedOperations": [
            "np:202500:22:damage",
          ],
          "inputDigest": "5482dfd395f085426a140e99f8987852fc66934dbaa2ea842dc579eafb0dafb6",
          "name": "アン・ボニー＆メアリー・リード",
          "np1To5Average": [
            41063.075,
            54750.935,
            61594.87,
            65016.84,
            68438.805,
          ],
          "servantId": "202500",
        },
        {
          "appliedOperations": [
            "passive:passive:203300:62551:265:0:modifier:flatDamage",
            "passive:passive:203300:607650:118:0:modifier:cardBuff",
            "np:203300:22:damage",
          ],
          "inputDigest": "b338a060fe9fb360bfd766e371a7688d139905f6163921d7884a4ee87cb030c4",
          "name": "アシュヴァッターマン",
          "np1To5Average": [
            46640.68,
            62117.775,
            69856.31,
            73725.57,
            77594.84,
          ],
          "servantId": "203300",
        },
        {
          "appliedOperations": [
            "passive:passive:305800:62450:265:0:modifier:flatDamage",
            "np:np:305800:np:305800:249:0:modifier:npDamageBuff",
            "np:305800:13:damage",
          ],
          "inputDigest": "d3e6989c8045bdd9453d570eab3b3a7786a7166b09d5123cb54fc340598804c8",
          "name": "アショカ王",
          "np1To5Average": [
            34888.58,
            46459.94,
            52245.615,
            55138.445,
            58031.31,
          ],
          "servantId": "305800",
        },
        {
          "appliedOperations": [
            "np:400900:22:damage",
          ],
          "inputDigest": "4037732abc1dcdd11f0f86bbad861bc098b18bd6fcd4ab5c4bc2559840f7d865",
          "name": "アン・ボニー＆メアリー・リード",
          "np1To5Average": [
            59020.73,
            73776.035,
            81153.69,
            84842.52,
            88531.345,
          ],
          "servantId": "400900",
        },
        {
          "appliedOperations": [
            "np:np:506000:np:506000:110:0:modifier:cardBuff",
            "np:506000:13:damage",
          ],
          "inputDigest": "03caaeef76e04d5a60d0c7a9f6ea26c4b9f2895183f31e2425303efbf07ac052",
          "name": "ビショーネ",
          "np1To5Average": [
            20697.33,
            27596.605,
            31046.25,
            32771.06,
            34495.865,
          ],
          "servantId": "506000",
        },
        {
          "appliedOperations": [
            "passive:passive:702500:54251:118:0:modifier:cardBuff",
            "np:702500:22:damage",
          ],
          "inputDigest": "2207d10446064828a7360d1aa5fc11e3a0128ed1f0fcccd1eb9a89e2f1035be4",
          "name": "土方歳三",
          "np1To5Average": [
            62555.875,
            78194.98,
            86014.53,
            89924.29,
            93834.07,
          ],
          "servantId": "702500",
        },
        {
          "appliedOperations": [
            "np:np:1102000:np:1102000:249:0:modifier:npDamageBuff",
            "np:np:1102000:np:1102000:249:1:modifier:npDamageBuff",
            "np:1102000:13:damage",
          ],
          "inputDigest": "76807a4902a7abe6909ce7a4e5c6e7ff87ecd050beda76c6cb4ccda10ab81660",
          "name": "ジョン・ラックランド",
          "np1To5Average": [
            31826.97,
            42436.13,
            47740.715,
            50393,
            53045.29,
          ],
          "servantId": "1102000",
        },
        {
          "appliedOperations": [
            "np:np:1102300:np:1102300:23468:0:modifier:npDamageBuff",
            "passive:passive:1102300:54149:118:0:modifier:cardBuff",
            "np:1102300:14:damage",
          ],
          "inputDigest": "9b736b409982c8cbf9f1ef5fb7f51d8309eeaa8a297115c8f4563ed452c85ab0",
          "name": "キングプロテア・オルタ",
          "np1To5Average": [
            64172.38,
            85563.345,
            96258.835,
            101606.57,
            106954.255,
          ],
          "servantId": "1102300",
        },
        {
          "appliedOperations": [
            "passive:passive:2300600:30550:265:0:modifier:flatDamage",
          ],
          "inputDigest": "a710fbe4d0718ca70b881cc3e5889637fc551d411bdbaf2a17c65ba9c59e2cfb",
          "name": "ＢＢドバイ",
          "np1To5Average": [
            24566.05,
            32671.56,
            36724.325,
            38750.7,
            40777.08,
          ],
          "servantId": "2300600",
        },
        {
          "appliedOperations": [
            "np:np:2801300:np:2801300:119:0:modifier:cardBuff",
            "np:np:2801300:np:2801300:249:0:modifier:npDamageBuff",
          ],
          "inputDigest": "304dfcb0255fde97e6ab8cb7597b11a338e74ed2f06becf5206f6a0a53e63403",
          "name": "ハベトロット",
          "np1To5Average": [
            50393.91,
            67192.04,
            75591.115,
            79790.65,
            83990.17,
          ],
          "servantId": "2801300",
        },
        {
          "appliedOperations": [
            "passive:passive:3300200:30149:265:0:modifier:flatDamage",
            "np:3300200:21836:damage",
          ],
          "inputDigest": "2f633b96d596a2189e0a826dd30cb34a17ca968cbfedc960a7e3999b01dc6984",
          "name": "エレシュキガル",
          "np1To5Average": [
            19422.77,
            25850.53,
            29064.41,
            30671.35,
            32278.29,
          ],
          "servantId": "3300200",
        },
      ]
    `);
  });

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
        canonicalInputValues: Object.fromEntries(
          projection!.requiredInputs.map((definition) => [
            definition.key,
            { kind: 'integer' as const, value: definition.maximum },
          ]),
        ),
      };
      const withInputs = calculateScenario(scenario, master, versions);
      const currentProjection = withInputs.effects.find(
        (effect) => effect.projectionKey === projection!.projectionKey,
      )!;
      const selected = calculateScenario(
        automaticInput
          ? scenario
          : selectProjectionAlone(scenario, currentProjection, withInputs.effects),
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
            43066.35,
            57338.62,
            64474.765,
            68042.84,
            71610.91,
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
            26226,
            34968.185,
            39339.25,
            41524.81,
            43710.345,
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
            75591.115,
            100788.31,
            113386.945,
            119686.225,
            125985.515,
          ],
          "occurrenceId": "23594:0",
          "servantId": "2801300",
        },
        {
          "np1To5Average": [
            75591.115,
            100788.31,
            113386.945,
            119686.225,
            125985.515,
          ],
          "occurrenceId": "23594:1",
          "servantId": "2801300",
        },
        {
          "np1To5Average": [
            75591.115,
            100788.31,
            113386.945,
            119686.225,
            125985.515,
          ],
          "occurrenceId": "23594:2",
          "servantId": "2801300",
        },
        {
          "np1To5Average": [
            75591.115,
            100788.31,
            113386.945,
            119686.225,
            125985.515,
          ],
          "occurrenceId": "23594:3",
          "servantId": "2801300",
        },
        {
          "np1To5Average": [
            75591.115,
            100788.31,
            113386.945,
            119686.225,
            125985.515,
          ],
          "occurrenceId": "23594:4",
          "servantId": "2801300",
        },
        {
          "np1To5Average": [
            75591.115,
            100788.31,
            113386.945,
            119686.225,
            125985.515,
          ],
          "occurrenceId": "23594:5",
          "servantId": "2801300",
        },
        {
          "np1To5Average": [
            75591.115,
            100788.31,
            113386.945,
            119686.225,
            125985.515,
          ],
          "occurrenceId": "23594:6",
          "servantId": "2801300",
        },
        {
          "np1To5Average": [
            75591.115,
            100788.31,
            113386.945,
            119686.225,
            125985.515,
          ],
          "occurrenceId": "23594:7",
          "servantId": "2801300",
        },
        {
          "np1To5Average": [
            75591.115,
            100788.31,
            113386.945,
            119686.225,
            125985.515,
          ],
          "occurrenceId": "23594:8",
          "servantId": "2801300",
        },
        {
          "np1To5Average": [
            75591.115,
            100788.31,
            113386.945,
            119686.225,
            125985.515,
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
            19422.77,
            25850.53,
            29064.41,
            30671.35,
            32278.29,
          ],
          "occurrenceId": "automaticReference",
          "servantId": "3300200",
        },
      ]
    `);
    expect(createHash('sha256').update(JSON.stringify(records)).digest('hex')).toBe(
      'd3ec63f7c40817acfe4d3252c9b25279daaacbf8827c4dd0d8be92fb0a3d262c',
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
      {
        ...scenario,
        canonicalInputValues: {
          'field:enemyCount': { kind: 'integer', value: 2 },
        },
      },
      master,
      versions,
    );
    expect(multiple.result.status).toBe('calculated');
    expect(multiple.input.npDamageBuff).toBe(0);
    expect(
      multiple.effects.find((effect) => effect.source.effectOccurrenceId === '249:0')?.outcome,
    ).toBe('notApplied');

    const invalid = calculateScenario(
      {
        ...scenario,
        canonicalInputValues: {
          'field:enemyCount': { kind: 'integer', value: 0 },
        },
      },
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
