import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { assumptionsForProjection } from '@fgo-lab/battle-execution';
import { ENGINE_VERSION, SCHEMA_VERSION, type VersionContext } from '@fgo-lab/schema';
import { describe, expect, it } from 'vitest';
import { calculateScenario, createDefaultResolvedScenario } from './scenario';

const root = resolve(import.meta.dirname, '../../..');

const priorUnsupportedFamilies = {
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

const partialMatchUnsupportedIds = [
  '100700',
  '101000',
  '101700',
  '103100',
  '105400',
  '106100',
  '200200',
  '203300',
  '204900',
  '300100',
  '300800',
  '302800',
  '304000',
  '305400',
  '305600',
  '305700',
  '305900',
  '400100',
  '404900',
  '405700',
  '500200',
  '503200',
  '505100',
  '601500',
  '603200',
  '603700',
  '603800',
  '604600',
  '604700',
  '605000',
  '702600',
  '703300',
  '703600',
  '704400',
  '705300',
  '1000100',
  '1000400',
  '1000500',
  '1000900',
  '1001700',
  '1100400',
  '1100700',
  '1101100',
  '1101600',
  '1101800',
  '2300600',
  '2300700',
  '2300800',
  '2500200',
  '2501100',
  '2800200',
  '2800500',
] as const;

const expectedUnsupportedFamilies: Record<string, string[]> = {
  ...priorUnsupportedFamilies,
  ...Object.fromEntries(partialMatchUnsupportedIds.map((id) => [id, ['unsupportedOperation']])),
  '203300': ['missing_attacker_hp_ratio', 'unsupportedOperation'],
  '403400': ['unsupportedCondition'],
};

function reasonFamily(reason: string): string {
  return reason.split(':', 1)[0] ?? reason;
}

describe('production master damage quality ratchet', () => {
  it('executes Dante realm choices through typed assumptions and rejects the conflict', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const servant = master.servants.find((candidate) => candidate.name === 'ダンテ・アリギエーリ');
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    expect(servant).toBeDefined();
    const scenario = createDefaultResolvedScenario(master, undefined, servant);
    const initial = calculateScenario(scenario, master, versions);
    const sky = initial.effects.find((effect) => effect.label === '威力アップ・対 天の力')!;
    const earth = initial.effects.find((effect) => effect.label === '威力アップ・対 地の力')!;
    const fieldChanges = initial.effects.filter((effect) =>
      effect.label.startsWith('フィールド変化'),
    );
    const passive = initial.effects.find((effect) => effect.source.origin === 'passive')!;
    const automaticNpEffect = initial.effects.find(
      (effect) => effect.label === '宝具威力アップ' && effect.source.origin === 'np',
    )!;
    const mismatchedCardEffects = initial.effects.filter(
      (effect) => effect.explanation.code === 'cardMismatch',
    );

    expect(fieldChanges).not.toHaveLength(0);
    expect(fieldChanges.every((effect) => effect.visibility === 'hidden')).toBe(true);
    expect(passive).toMatchObject({ controllability: 'automatic', decision: { state: 'none' } });
    expect(automaticNpEffect).toMatchObject({
      outcome: 'applied',
      controllability: 'automatic',
      decision: { state: 'none' },
    });
    expect(mismatchedCardEffects).not.toHaveLength(0);
    expect(mismatchedCardEffects.every((effect) => effect.visibility === 'hidden')).toBe(true);

    const skyAssumptions = assumptionsForProjection(sky, true);
    const earthAssumptions = assumptionsForProjection(earth, true);
    for (const [selected, assumptions, trait, field] of [
      [sky, skyAssumptions, 'attributeSky', 'fieldHeaven'],
      [earth, earthAssumptions, 'attributeEarth', 'fieldHell'],
    ] as const) {
      const calculation = calculateScenario(
        { ...scenario, effectAssumptions: assumptions },
        master,
        versions,
      );
      expect(calculation.result.status).toBe('calculated');
      expect(calculation.input.powerMod).toBe(0.5);
      expect(calculation.input.target.traits).toEqual([trait]);
      expect(calculation.input.fieldTraits).toEqual([field]);
      expect(
        calculation.effects.filter(
          (effect) => effect.label.startsWith('威力アップ・対') && effect.outcome === 'applied',
        ),
      ).toEqual([expect.objectContaining({ projectionKey: selected.projectionKey })]);
    }

    const conflict = calculateScenario(
      {
        ...scenario,
        effectAssumptions: [...skyAssumptions, ...earthAssumptions],
      },
      master,
      versions,
    );
    expect(conflict.result.status).toBe('unsupported');
    expect(conflict.input.powerMod).toBe(0);
    expect(conflict.effectWarnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('exclusiveAssumptionConflict:target:worldAttribute'),
        expect.stringContaining('exclusiveAssumptionConflict:field:fieldRealm'),
      ]),
    );
  });

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
