import { describe, expect, it } from 'vitest';
import {
  ENGINE_VERSION,
  SCHEMA_VERSION,
  type DamageResolutionInput,
  type VersionContext,
} from '@fgo-lab/schema';
import { calculateDamageResolution } from './index';

const input: DamageResolutionInput = {
  attackerId: 'fixture',
  attackerLevel: 90,
  attackerAtk: 10000,
  fouAtk: 0,
  craftEssenceId: null,
  craftEssenceAtk: 0,
  npLevel: 1,
  overcharge: 1,
  npMultipliers: [100, 100, 100, 100, 100],
  damageFunction: { status: 'resolved', kind: 'standard', ignoreDefense: false },
  cardType: 'arts',
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
};
const versions: VersionContext = {
  schemaVersion: SCHEMA_VERSION,
  masterDataVersion: 'fixture',
  engineVersion: ENGINE_VERSION,
  appVersion: '0.1.0',
  gameRegion: 'JP',
  masterDataLocale: 'ja-JP',
};

describe('calculation application', () => {
  it('owns result construction for the shared damage evaluation path', () => {
    const result = calculateDamageResolution(input, versions);
    expect(result).toMatchObject({ status: 'calculated', precision: 'exact' });
    expect(result.evidence.map((entry) => entry.key)).toEqual([
      'kernel:np-damage-v1',
      'np-function:standard',
    ]);
    expect(result.rows[0]).toEqual({
      npLevel: 1,
      minimum: 2070,
      average: 2298.395,
      maximum: 2527,
    });
  });

  it('returns no numeric rows when function preparation is unsupported', () => {
    expect(
      calculateDamageResolution(
        {
          ...input,
          damageFunction: {
            status: 'unsupported',
            kind: 'hpRatioLow',
            missingEvidence: 'missing_attacker_hp_ratio',
          },
        },
        versions,
      ),
    ).toMatchObject({
      status: 'unsupported',
      rows: [],
      missingEvidence: ['missing_attacker_hp_ratio'],
    });
  });
});
