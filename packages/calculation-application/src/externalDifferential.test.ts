import { describe, expect, it } from 'vitest';
import differential from '../../test-fixtures/golden/external-differentials-v1.json';
import {
  APP_VERSION,
  damageResolutionInputSchema,
  ENGINE_VERSION,
  SCHEMA_VERSION,
} from '@fgo-lab/schema';
import { calculateDamageResolution } from './damageResolution';

describe('external damage differential', () => {
  it('matches the AppMedia Lilith standard endpoints', () => {
    const testCase = differential.cases[0]!;
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
});
