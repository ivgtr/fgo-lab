import { bench } from 'vitest';
import type { DamageResolutionInput } from '@fgo-lab/schema';
import { evaluateDamageRows, prepareDamageEvaluation } from './index';

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
  damageFunction: { status: 'resolved', kind: 'standard', ignoreDefense: false },
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
  ignoreDamageCut: false,
  fieldTraits: [],
  attackerStateTraits: [],
  attackerHpPermille: null,
  targetRarity: null,
  targetStateTraits: [],
  battlePointPhase: null,
  target: { classId: null, attribute: 'unknown', traits: [] },
} satisfies DamageResolutionInput;
bench('NP1-5 / 200 random values', () => {
  const prepared = prepareDamageEvaluation(input);
  if (prepared.status === 'ready') evaluateDamageRows(prepared.kernelInputs);
});
