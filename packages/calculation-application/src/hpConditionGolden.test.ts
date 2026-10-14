import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  calculateScenario as calculateScenarioOutcome,
  createDefaultResolvedScenario,
  requireExecutableCalculation,
} from './scenario';
const calculateScenario = (...args: Parameters<typeof calculateScenarioOutcome>) =>
  requireExecutableCalculation(calculateScenarioOutcome(...args));

const root = resolve(import.meta.dirname, '../../..');
let master: ReturnType<typeof masterSnapshotSchema.parse>;

beforeAll(async () => {
  master = masterSnapshotSchema.parse(
    JSON.parse(
      await readFile(resolve(root, 'packages/test-fixtures/production-master/master.json'), 'utf8'),
    ),
  );
});

describe('production HP condition golden', () => {
  it('applies a standalone craft essence condition automatically at the exact HP boundary', () => {
    const servant = master.servants.find((candidate) => candidate.id === '100100')!;
    const craftEssence = master.craftEssences.find((candidate) => candidate.id === '9307920')!;
    const masterEffect = craftEssence.effects.find((effect) => effect.occurrenceId === '21041:0')!;
    expect(masterEffect).toMatchObject({
      interaction: null,
      requirement: {
        expression: {
          kind: 'quantity',
          quantity: 'attackerHpPermille',
          comparison: 'atMost',
          value: 500,
        },
      },
      atlasEvidence: { buffConditionKeys: ['HP_LOWER'] },
    });

    const versions = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP' as const,
      masterDataLocale: 'ja-JP' as const,
      masterDataVersion: master.version,
    };
    const records = [0, 4].flatMap((limitBreak) =>
      [1_000, 501, 500, 1].map((hp) => {
        const calculation = calculateScenario(
          {
            ...createDefaultResolvedScenario(master, undefined, servant),
            preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' as const }],
            attackerHpPermille: hp,
            craftEssence: {
              craftEssenceId: craftEssence.id,
              level: limitBreak === 4 ? 80 : 20,
              limitBreak,
            },
          },
          master,
          versions,
        );
        const effect = calculation.effects.find(
          (candidate) => candidate.source.effectOccurrenceId === masterEffect.occurrenceId,
        )!;
        expect(calculation.result.status).toBe('calculated');
        expect(effect).toMatchObject({
          controllability: 'user',
          visibility: 'visible',
          decision: { state: 'enabled' },
          requiredQuantity: 'attackerHpPermille',
          requiredQuantityOwner: 'attacker',
        });
        expect(
          calculation.effectControls.find(
            (control) => control.projection.operationId === effect.operationId,
          )?.projection.value,
        ).toBe(0.3);
        return {
          limitBreak,
          hp,
          interaction: masterEffect.interaction,
          outcome: effect.outcome,
          operationId: effect.operationId,
          npDamageBuff: calculation.input.npDamageBuff,
          np1To5Average:
            calculation.result.status === 'calculated'
              ? calculation.result.rows.map((row) => row.average)
              : [],
        };
      }),
    );

    expect(records).toMatchInlineSnapshot(`
      [
        {
          "hp": 1000,
          "interaction": null,
          "limitBreak": 0,
          "np1To5Average": [
            33988.47,
            42485.7,
            46734.315,
            48858.635,
            50982.965,
          ],
          "npDamageBuff": 0,
          "operationId": "craftEssence:craftEssence:9307920:ce:9307920:21041:0:modifier:npDamageBuff",
          "outcome": "notApplied",
        },
        {
          "hp": 501,
          "interaction": null,
          "limitBreak": 0,
          "np1To5Average": [
            44185.155,
            55231.56,
            60754.785,
            63516.365,
            66277.97,
          ],
          "npDamageBuff": 0.3,
          "operationId": "craftEssence:craftEssence:9307920:ce:9307920:21041:0:modifier:npDamageBuff",
          "outcome": "applied",
        },
        {
          "hp": 500,
          "interaction": null,
          "limitBreak": 0,
          "np1To5Average": [
            44185.155,
            55231.56,
            60754.785,
            63516.365,
            66277.97,
          ],
          "npDamageBuff": 0.3,
          "operationId": "craftEssence:craftEssence:9307920:ce:9307920:21041:0:modifier:npDamageBuff",
          "outcome": "applied",
        },
        {
          "hp": 1,
          "interaction": null,
          "limitBreak": 0,
          "np1To5Average": [
            44185.155,
            55231.56,
            60754.785,
            63516.365,
            66277.97,
          ],
          "npDamageBuff": 0.3,
          "operationId": "craftEssence:craftEssence:9307920:ce:9307920:21041:0:modifier:npDamageBuff",
          "outcome": "applied",
        },
        {
          "hp": 1000,
          "interaction": null,
          "limitBreak": 4,
          "np1To5Average": [
            33988.47,
            42485.7,
            46734.315,
            48858.635,
            50982.965,
          ],
          "npDamageBuff": 0,
          "operationId": "craftEssence:craftEssence:9307920:ce:9307920:21041:0:modifier:npDamageBuff",
          "outcome": "notApplied",
        },
        {
          "hp": 501,
          "interaction": null,
          "limitBreak": 4,
          "np1To5Average": [
            44185.155,
            55231.56,
            60754.785,
            63516.365,
            66277.97,
          ],
          "npDamageBuff": 0.3,
          "operationId": "craftEssence:craftEssence:9307920:ce:9307920:21041:0:modifier:npDamageBuff",
          "outcome": "applied",
        },
        {
          "hp": 500,
          "interaction": null,
          "limitBreak": 4,
          "np1To5Average": [
            44185.155,
            55231.56,
            60754.785,
            63516.365,
            66277.97,
          ],
          "npDamageBuff": 0.3,
          "operationId": "craftEssence:craftEssence:9307920:ce:9307920:21041:0:modifier:npDamageBuff",
          "outcome": "applied",
        },
        {
          "hp": 1,
          "interaction": null,
          "limitBreak": 4,
          "np1To5Average": [
            44185.155,
            55231.56,
            60754.785,
            63516.365,
            66277.97,
          ],
          "npDamageBuff": 0.3,
          "operationId": "craftEssence:craftEssence:9307920:ce:9307920:21041:0:modifier:npDamageBuff",
          "outcome": "applied",
        },
      ]
    `);
  });
});
