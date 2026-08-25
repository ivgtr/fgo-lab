import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION, type VersionContext } from '@fgo-lab/schema';
import { describe, expect, it } from 'vitest';
import { calculateScenario, createDefaultResolvedScenario } from './scenario';

const root = resolve(import.meta.dirname, '../../..');

const expectedUnsupportedFamilies = {
  '106600': ['unsupportedOperation'],
  '202500': ['missing_attacker_hp_ratio'],
  '203300': ['missing_attacker_hp_ratio'],
  '305800': ['unsupportedOperation'],
  '400900': ['missing_attacker_hp_ratio'],
  '506000': ['unsupportedOperation'],
  '605300': ['unsupportedOperation'],
  '702500': ['missing_attacker_hp_ratio'],
  '800100': ['unsupportedOperation'],
  '1000300': ['unsupportedOperation'],
  '1102000': ['unsupportedOperation'],
  '1102300': ['unsupportedOperation'],
  '2300900': ['unsupportedOperation'],
  '2301100': ['unsupportedOperation'],
  '2301200': ['unsupportedOperation'],
  '2801300': ['unsupportedOperation'],
  '3300200': ['missing_battle_point_phase', 'unsupportedOperation'],
} as const;

function reasonFamily(reason: string): string {
  return reason.split(':', 1)[0] ?? reason;
}

describe('production master damage quality ratchet', () => {
  it('keeps known candidate values and bounds fail-closed servants', async () => {
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
    const calculations = master.servants.flatMap((servant) => {
      try {
        return [
          {
            servant,
            calculation: calculateScenario(
              createDefaultResolvedScenario(master, undefined, servant),
              master,
              versions,
            ),
          },
        ];
      } catch {
        return [];
      }
    });
    const unsupported = calculations.filter(
      ({ calculation }) => calculation.result.status === 'unsupported',
    );
    const missingCandidateValues = calculations.flatMap(({ servant, calculation }) =>
      calculation.effects.flatMap((effect) =>
        effect.explanation.code === 'disabled' &&
        effect.modifier !== null &&
        effect.modifier !== 'ignoreDefense' &&
        effect.modifier !== 'ignoreDamageCut' &&
        effect.value === null
          ? [`${servant.id}:${effect.source.skillId}:${effect.source.effectId}`]
          : [],
      ),
    );
    const archetype = calculations.find(
      ({ servant }) => servant.name === 'アーキタイプ：アース',
    )?.calculation;
    const soujuurou = calculations.find(
      ({ servant }) => servant.name === '静希草十郎',
    )?.calculation;
    const dante = calculations.find(
      ({ servant }) => servant.name === 'ダンテ・アリギエーリ',
    )?.calculation;
    const summerWu = calculations.find(({ servant }) => servant.id === '505200')?.calculation;
    const summerLilith = calculations.find(({ servant }) => servant.id === '405900')?.calculation;
    const unsupportedFamilies = Object.fromEntries(
      unsupported.map(({ servant, calculation }) => {
        if (calculation.result.status !== 'unsupported')
          throw new Error('unsupported audit lost its discriminant');
        return [
          servant.id,
          [...new Set(calculation.result.missingEvidence.map(reasonFamily))].sort(),
        ];
      }),
    );

    expect(master.servants).toHaveLength(469);
    expect(calculations).toHaveLength(420);
    expect(unsupportedFamilies).toEqual(expectedUnsupportedFamilies);
    expect(missingCandidateValues).toEqual([]);
    expect(archetype?.result.status).toBe('calculated');
    expect(archetype?.input.fieldTraits).toContain('milleniumCastle');
    expect(
      archetype?.effects.find((effect) => effect.label === 'バスターアップ：千年城'),
    ).toMatchObject({ value: 0.3, outcome: 'applied' });
    expect(archetype?.effects.find((effect) => effect.label === '防御力ダウン')).toMatchObject({
      value: 0.2,
      outcome: 'notApplied',
      explanation: { code: 'disabled' },
    });
    expect(soujuurou?.result.status).toBe('calculated');
    expect(soujuurou?.input.ignoreDamageCut).toBe(true);
    expect(
      soujuurou?.effects.find((effect) => effect.label === 'ダメージカット貫通'),
    ).toMatchObject({
      modifier: 'ignoreDamageCut',
      outcome: 'applied',
    });
    expect(dante?.result.status).toBe('calculated');
    for (const label of ['威力アップ・対 天の力', '威力アップ・対 地の力', '宝具威力アップ'])
      expect(dante?.effects.some((effect) => effect.label === label)).toBe(true);
    expect(summerWu?.result.status).toBe('calculated');
    expect(summerWu?.input.targetStateTraits).toContain('undead');
    expect(summerWu?.effects.find((effect) => effect.label === '死霊特性付与')).toMatchObject({
      visibility: 'hidden',
      outcome: 'applied',
    });
    expect(summerLilith?.result.status).toBe('calculated');
    expect(summerLilith?.input.npSpecialMultipliers).toEqual([1, 1, 1, 1, 1]);
    expect(summerLilith?.effects.find((effect) => effect.modifier === 'npSpecial')).toMatchObject({
      outcome: 'notApplied',
      explanation: { code: 'conditionNotMet' },
    });
  });
});
