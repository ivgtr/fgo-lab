import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import differential from '../../test-fixtures/golden/external-differentials-v1.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  APP_VERSION,
  damageResolutionInputSchema,
  ENGINE_VERSION,
  SCHEMA_VERSION,
} from '@fgo-lab/schema';
import { calculateDamageResolution } from './damageResolution';
import { calculateScenario, createDefaultResolvedScenario } from './scenario';

const root = resolve(import.meta.dirname, '../../..');

interface LilithDifferential {
  input: {
    totalAtk: number;
    npLevel: number;
    npMultipliers: [number, number, number, number, number];
    cardType: 'quick';
    classAttackRate: number;
    classAffinity: number;
    attributeAffinity: number;
    npDamageBuff: number;
    npSpecialMultipliers: [number, number, number, number, number];
  };
  externalExpected: { minimum: number; maximum: number };
  fgoLabExpected: { npLevel: number; minimum: number; average: number; maximum: number };
}

interface AshokaDifferential {
  input: {
    servantId: string;
    effectOccurrenceId: string;
    singleEnemyCount: number;
    multipleEnemyCount: number;
  };
  externalExpected: {
    singleEnemyNpDamageBuff: number;
    multipleEnemyNpDamageBuff: number;
  };
}

interface ActorCountDifferential {
  caseId: string;
  input: { servantId: string; maximumEnemyCount?: number };
  externalExpected: Record<string, number>;
}

describe('external damage differential', () => {
  it('matches the AppMedia Lilith standard endpoints', () => {
    const testCase = differential.cases.find(
      (candidate) => candidate.caseId === 'appmedia-lilith-neutral-np5',
    ) as unknown as LilithDifferential;
    expect(differential.engineVersion).toBe(ENGINE_VERSION);
    const input = damageResolutionInputSchema.parse({
      attackerId: '405900',
      attackerLevel: 90,
      attackerAtk: testCase.input.totalAtk,
      fouAtk: 0,
      craftEssenceId: null,
      craftEssenceAtk: 0,
      npLevel: testCase.input.npLevel,
      overcharge: 1,
      npMultipliers: testCase.input.npMultipliers,
      damageFunction: { status: 'resolved', kind: 'standard', ignoreDefense: false },
      cardType: testCase.input.cardType,
      classAttackRate: testCase.input.classAttackRate,
      classAffinity: testCase.input.classAffinity,
      attributeAffinity: testCase.input.attributeAffinity,
      attackBuff: 0,
      defenseBuff: 0,
      cardBuff: 0,
      cardResistance: 0,
      npDamageBuff: testCase.input.npDamageBuff,
      npResistance: 0,
      powerMod: 0,
      eventDamageBuff: 0,
      npSpecialMultipliers: testCase.input.npSpecialMultipliers,
      specialDamageBuff: 0,
      specialResistance: 0,
      flatDamage: 0,
      damageCut: 0,
      ignoreDamageCut: false,
      fieldTraits: [],
      attackerStateTraits: [],
      attackerHpPermille: null,
      targetRarity: null,
      targetStateTraits: [],
      battlePointPhase: null,
      target: { classId: 'neutral', attribute: 'unknown', traits: [] },
    });
    const result = calculateDamageResolution(input, {
      schemaVersion: SCHEMA_VERSION,
      masterDataVersion: '2026-08-25-atlas-jp-calculator-v13',
      engineVersion: ENGINE_VERSION,
      appVersion: APP_VERSION,
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
    });
    expect(result.status).toBe('calculated');
    expect(result.rows[4]).toEqual(testCase.fgoLabExpected);
    expect(result.rows[4]).toMatchObject(testCase.externalExpected);
  });

  it('matches the AppMedia Ashoka single-enemy condition and modifier', async () => {
    const testCase = differential.cases.find(
      (candidate) => candidate.caseId === 'appmedia-ashoka-single-enemy-np-buff',
    ) as unknown as AshokaDifferential;
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const servant = master.servants.find((candidate) => candidate.id === testCase.input.servantId)!;
    const scenario = createDefaultResolvedScenario(master, undefined, servant);
    const versions = {
      schemaVersion: SCHEMA_VERSION,
      masterDataVersion: master.version,
      engineVersion: ENGINE_VERSION,
      appVersion: APP_VERSION,
      gameRegion: 'JP' as const,
      masterDataLocale: 'ja-JP' as const,
    };
    const single = calculateScenario(
      {
        ...scenario,
        battleContext: { values: { 'field:enemyCount': testCase.input.singleEnemyCount } },
      },
      master,
      versions,
    );
    const multiple = calculateScenario(
      {
        ...scenario,
        battleContext: { values: { 'field:enemyCount': testCase.input.multipleEnemyCount } },
      },
      master,
      versions,
    );
    expect({
      singleEnemyNpDamageBuff: single.input.npDamageBuff,
      multipleEnemyNpDamageBuff: multiple.input.npDamageBuff,
    }).toEqual(testCase.externalExpected);
    expect(single.result.status).toBe('calculated');
    expect(multiple.result.status).toBe('calculated');
  });

  it('matches the published John and Habetrot count semantics', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const versions = {
      schemaVersion: SCHEMA_VERSION,
      masterDataVersion: master.version,
      engineVersion: ENGINE_VERSION,
      appVersion: APP_VERSION,
      gameRegion: 'JP' as const,
      masterDataLocale: 'ja-JP' as const,
    };
    const cases = differential.cases.filter((candidate) =>
      ['appmedia-john-trait-match-counts', 'appmedia-habetrot-enemy-population'].includes(
        candidate.caseId,
      ),
    ) as unknown as ActorCountDifferential[];

    for (const testCase of cases) {
      const servant = master.servants.find(
        (candidate) => candidate.id === testCase.input.servantId,
      )!;
      const scenario = createDefaultResolvedScenario(master, undefined, servant);
      const baseline = calculateScenario(scenario, master, versions);
      if (testCase.caseId === 'appmedia-john-trait-match-counts') {
        expect({ npDamageBuff: baseline.input.npDamageBuff }).toEqual(testCase.externalExpected);
        continue;
      }
      const count = baseline.contextInputs.find((input) => input.kind === 'matchingActorCount')!;
      const maximum = calculateScenario(
        {
          ...scenario,
          battleContext: { values: { [count.key]: testCase.input.maximumEnemyCount! } },
        },
        master,
        versions,
      );
      expect({
        singleEnemyNpDamageBuff: baseline.input.npDamageBuff,
        maximumEnemyNpDamageBuff: maximum.input.npDamageBuff,
      }).toEqual(testCase.externalExpected);
    }
  });
});
