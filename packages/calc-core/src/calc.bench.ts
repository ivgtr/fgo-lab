import { bench } from 'vitest';
import type { CalcInput, VersionContext } from '@fgo-lab/schema';
import { calculateNpDamage } from './index';

const input = {
  attackerId: 'x',
  attackerLevel: 90,
  attackerAtk: 10000,
  fouAtk: 1000,
  craftEssenceId: null,
  craftEssenceAtk: 0,
  npLevel: 1,
  overcharge: 1,
  npMultipliers: [300, 400, 450, 475, 500],
  cardType: 'buster',
  classAttackRate: 1,
  classAffinity: 1,
  attributeAffinity: 1,
  attackBuff: 0,
  defenseBuff: 0,
  cardBuff: 0,
  cardResistance: 0,
  npDamageBuff: 0,
  npResistance: 0,
  powerMod: 0,
  eventDamageBuff: 0,
  npSpecialMultipliers: [1, 1, 1, 1, 1],
  specialDamageBuff: 0,
  specialResistance: 0,
  flatDamage: 0,
  damageCut: 0,
  fieldTraits: [],
  target: { classId: 'neutral', attribute: 'unknown', traits: [] },
} satisfies CalcInput;
const versions = {
  schemaVersion: 2,
  masterDataVersion: 'fixture-1',
  engineVersion: '1.3.0',
  appVersion: '0.1.0',
  gameRegion: 'JP',
  masterDataLocale: 'ja-JP',
} satisfies VersionContext;
bench('NP1-5 / 200 random values', () => {
  calculateNpDamage(input, versions);
});
