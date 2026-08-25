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

const expectedUnsupportedFamilies: Readonly<Record<string, readonly string[]>> = {
  ...priorUnsupportedFamilies,
  '2300600': ['unsupportedOperation'],
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
        calculation.result.trace.some(
          (entry) =>
            entry.step === 'scenario-assumption' && entry.detail.includes(selected.projectionKey),
        ),
      ).toBe(true);
      expect(
        calculation.result.trace.some(
          (entry) =>
            entry.step === 'beforeNpDamage:addModifier' &&
            entry.detail.includes(`${selected.projectionKey}:modifier:powerMod:applied`),
        ),
      ).toBe(true);
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
        const scenario = createDefaultResolvedScenario(master, undefined, servant);
        return [
          {
            servant,
            scenario,
            calculation: calculateScenario(scenario, master, versions),
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
    const inertUserProjections: string[] = [];
    const invalidExclusiveCalculations: string[] = [];
    let exclusivePairCount = 0;
    for (const { servant, scenario, calculation } of calculations) {
      const userEffects = calculation.effects.filter((effect) => effect.controllability === 'user');
      for (const effect of userEffects) {
        const assumptions = assumptionsForProjection(effect, true);
        const active = calculateScenario(
          { ...scenario, effectAssumptions: assumptions },
          master,
          versions,
        );
        const activeEffect = active.effects.find(
          (candidate) => candidate.projectionKey === effect.projectionKey,
        );
        if (
          assumptions.length === 0 ||
          !activeEffect ||
          (activeEffect.outcome === effect.outcome &&
            activeEffect.decision.state === effect.decision.state)
        )
          inertUserProjections.push(`${servant.id}:${effect.projectionKey}`);
      }

      const exclusiveCandidates = userEffects.map((effect) => ({
        effect,
        assumptions: assumptionsForProjection(effect, true),
      }));
      const checkedPairs = new Set<string>();
      for (let leftIndex = 0; leftIndex < exclusiveCandidates.length; leftIndex += 1) {
        const left = exclusiveCandidates[leftIndex]!;
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < exclusiveCandidates.length;
          rightIndex += 1
        ) {
          const right = exclusiveCandidates[rightIndex]!;
          const conflicts = left.assumptions.some((leftAssumption) => {
            const leftAssertion = leftAssumption.assertion;
            if (
              leftAssertion?.kind !== 'trait' ||
              !leftAssertion.present ||
              !leftAssertion.exclusiveGroup
            )
              return false;
            return right.assumptions.some((rightAssumption) => {
              const rightAssertion = rightAssumption.assertion;
              return (
                rightAssertion?.kind === 'trait' &&
                rightAssertion.present &&
                rightAssertion.scope === leftAssertion.scope &&
                rightAssertion.exclusiveGroup === leftAssertion.exclusiveGroup &&
                rightAssertion.trait !== leftAssertion.trait
              );
            });
          });
          if (!conflicts) continue;
          const pairKey = `${left.effect.projectionKey}|${right.effect.projectionKey}`;
          if (checkedPairs.has(pairKey)) continue;
          checkedPairs.add(pairKey);
          exclusivePairCount += 1;
          const conflict = calculateScenario(
            {
              ...scenario,
              effectAssumptions: [...left.assumptions, ...right.assumptions],
            },
            master,
            versions,
          );
          const outcomes = conflict.effects
            .filter(
              (effect) =>
                effect.projectionKey === left.effect.projectionKey ||
                effect.projectionKey === right.effect.projectionKey,
            )
            .map((effect) => effect.outcome);
          if (
            conflict.result.status !== 'unsupported' ||
            !conflict.effectWarnings.some((warning) =>
              warning.startsWith('exclusiveAssumptionConflict:'),
            ) ||
            outcomes.includes('applied')
          )
            invalidExclusiveCalculations.push(`${servant.id}:${pairKey}`);
        }
      }
    }

    expect(master.servants).toHaveLength(469);
    expect(calculations).toHaveLength(420);
    expect(unsupportedFamilies).toEqual(expectedUnsupportedFamilies);
    expect(missingCandidateValues).toEqual([]);
    expect(inertUserProjections).toEqual([]);
    expect(exclusivePairCount).toBeGreaterThan(0);
    expect(invalidExclusiveCalculations).toEqual([]);
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
  }, 15_000);
});
