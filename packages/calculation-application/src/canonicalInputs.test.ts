import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalRequirementLeaves, masterSnapshotSchema } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyCanonicalInputCommand, resolveCanonicalInputValues } from './canonicalInputs';
import { applyEffectPresentationDecision } from './effectDecision';
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
    JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
  );
});

function calculate(attackerId: string) {
  const servant = master.servants.find((candidate) => candidate.id === attackerId)!;
  const scenario = createDefaultResolvedScenario(master, undefined, servant);
  return {
    scenario,
    calculation: calculateScenario(scenario, master, {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    }),
  };
}

describe('canonical special input application boundary', () => {
  it('projects John count semantics next to the two NP damage effects', () => {
    const { calculation } = calculate('1102000');
    expect(calculation.effectInputs).toMatchObject([
      {
        kind: 'matchingActorCount',
        label: '〔王〕一致数',
        control: 'stepper',
        value: 1,
        defaultValue: 1,
        defaultReason: '攻撃役本人を含む保証済み最低値',
        section: 'own',
        relatedEffectLabels: ['宝具威力アップ'],
      },
      {
        kind: 'matchingActorCount',
        label: '〔悪〕一致数',
        control: 'stepper',
        value: 1,
        defaultValue: 1,
        section: 'own',
        relatedEffectLabels: ['宝具威力アップ'],
      },
    ]);
    expect(calculation.input.npDamageBuff).toBe(0.2);
  });

  it('uses a compact semantic control for Habetrot enemy population', () => {
    const { calculation } = calculate('2801300');
    expect(calculation.effectInputs.find((input) => input.label === '敵の合計数')).toMatchObject({
      kind: 'matchingActorCount',
      control: 'segmented',
      minimum: 1,
      maximum: 3,
      value: 1,
      defaultReason: '現在の宝具対象1体を含む保証済み最低値',
      relatedEffectLabels: ['宝具威力アップ'],
    });
    expect(calculation.input.npDamageBuff).toBe(0.1);
  });

  it('keeps a shared star input available while threshold effects are hidden', () => {
    const { calculation } = calculate('2801300');
    const stars = calculation.effectInputs.find((input) => input.kind === 'criticalStars')!;
    expect(stars).toMatchObject({
      key: 'battle:criticalStars',
      control: 'stepper',
      value: 0,
      relatedEffectLabels: ['攻撃力アップ'],
    });
    expect(stars.relatedProjectionKeys).toHaveLength(1);
    expect(
      calculation.effectControls.filter(
        (control) => control.key === stars.relatedProjectionKeys[0],
      ),
    ).toHaveLength(1);
    expect(calculation.effectInputs.filter((input) => input.key === stars.key)).toHaveLength(1);
  });

  it('routes Habetrot stars through one decision and ten internal thresholds', () => {
    const { scenario, calculation } = calculate('2801300');
    const control = calculation.effectControls.find(
      (candidate) => candidate.projection.label === '攻撃力アップ',
    )!;
    expect(control.interaction).toBe('toggle');
    expect(control.operationIds).toHaveLength(10);
    expect(
      calculation.effectControls.filter(
        (candidate) => candidate.projection.label === '攻撃力アップ',
      ),
    ).toHaveLength(1);
    const buster = calculation.effects.find(
      (effect) =>
        effect.source.origin === 'attacker' &&
        effect.source.skillId === control.projection.source.skillId &&
        effect.label === 'バスターアップ',
    )!;
    const enabled = applyEffectPresentationDecision(
      applyEffectPresentationDecision(
        scenario,
        control.projection,
        true,
        calculation.activationRequirements,
        calculation.effects,
      ),
      buster,
      true,
      calculation.activationRequirements,
      calculation.effects,
    );
    const resolved = calculateScenario(
      applyCanonicalInputCommand(enabled, {
        kind: 'setCanonicalIntegerInput',
        key: 'battle:criticalStars',
        value: 99,
      }),
      master,
      {
        schemaVersion: SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
        appVersion: '0.1.0',
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
        masterDataVersion: master.version,
      },
    );

    expect(resolved.result.status).toBe('calculated');
    expect(resolved.input.attackBuff).toBe(0.5);
    expect(resolved.input.cardBuff).toBe(0.4);
    expect(resolved.input.npDamageBuff).toBe(0.1);
    expect(resolved.result.status === 'calculated' ? resolved.result.rows[0].average : null).toBe(
      96_206.99,
    );
    expect(
      resolved.effects.filter(
        (effect) => effect.projectionKey === control.key && effect.outcome === 'applied',
      ),
    ).toHaveLength(10);
  });

  it('evaluates one Tonelico skill decision as an ordered cumulative HP threshold series', () => {
    const servant = master.servants.find((candidate) => candidate.id === '505300')!;
    const skill = servant.skills.find((candidate) => candidate.id === '2239550')!;
    const series = skill.effects.filter(
      (effect) => effect.interaction?.kind === 'quantityThresholdSeries',
    );
    expect(series).toHaveLength(5);
    expect(new Set(series.map((effect) => effect.interaction?.key)).size).toBe(1);
    expect(
      series.map((effect) =>
        canonicalRequirementLeaves(effect.requirement.expression).filter(
          (requirement) => requirement.kind === 'quantity',
        ),
      ),
    ).toEqual([
      [],
      [{ kind: 'quantity', quantity: 'attackerHpPermille', comparison: 'atMost', value: 990 }],
      [{ kind: 'quantity', quantity: 'attackerHpPermille', comparison: 'atMost', value: 750 }],
      [{ kind: 'quantity', quantity: 'attackerHpPermille', comparison: 'atMost', value: 500 }],
      [{ kind: 'quantity', quantity: 'attackerHpPermille', comparison: 'atMost', value: 250 }],
    ]);
    expect(series.map((effect) => effect.atlasEvidence.buffConditionKeys)).toEqual([
      [],
      ['HP_LOWER'],
      ['HP_LOWER'],
      ['HP_LOWER'],
      ['HP_LOWER'],
    ]);

    const defaultExecution = calculate('505300');
    const skillAction = defaultExecution.calculation.appliedPreparationActions.find(
      ({ sourceKind, sourceId }) => sourceKind === 'skill' && sourceId === skill.id,
    );
    if (!skillAction || skillAction.command.kind !== 'useSkillSlot')
      throw new TypeError('tonelico_skill_action_missing');
    const scenario = {
      ...defaultExecution.scenario,
      preNoblePhantasmPlan: [skillAction.command, { kind: 'executeAttackNoblePhantasm' as const }],
    };
    const calculation = calculateScenario(scenario, master, {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    });
    const control = calculation.effectControls.find(
      (candidate) => candidate.operationIds.length === 5,
    )!;
    expect(control).toMatchObject({
      valueDisplay: 'sum',
      projection: {
        label: '攻撃力アップ',
        requiredQuantity: 'attackerHpPermille',
        requiredQuantityOwner: 'attacker',
      },
    });
    expect(new Set(control.operationIds).size).toBe(5);

    const expected = [
      [1_000, 0.2, [37_262.615, 49_683.66, 55_894.18, 58_999.44, 62_104.685], 1],
      [990, 0.3, [40_367.875, 53_824, 60_552.07, 63_916.09, 67_280.115], 2],
      [760, 0.3, [40_367.875, 53_824, 60_552.07, 63_916.09, 67_280.115], 2],
      [750, 0.4, [43_473.15, 57_964.375, 65_209.955, 68_832.755, 72_455.565], 3],
      [510, 0.4, [43_473.15, 57_964.375, 65_209.955, 68_832.755, 72_455.565], 3],
      [500, 0.5, [46_578.4, 62_104.685, 69_867.85, 73_749.425, 77_631], 4],
      [260, 0.5, [46_578.4, 62_104.685, 69_867.85, 73_749.425, 77_631], 4],
      [250, 0.6, [49_683.655, 66_245.04, 74_525.74, 78_666.06, 82_806.43], 5],
      [0, 0.6, [49_683.655, 66_245.04, 74_525.74, 78_666.06, 82_806.43], 5],
    ] as const;
    const versions = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP' as const,
      masterDataLocale: 'ja-JP' as const,
      masterDataVersion: master.version,
    };
    for (const [hp, attackBuff, averages, appliedCount] of expected) {
      const hpScenario = { ...scenario, attackerHpPermille: hp };
      const disabledScenario = applyEffectPresentationDecision(
        hpScenario,
        control.projection,
        false,
        calculation.activationRequirements,
        calculation.effects,
      );
      const disabled = calculateScenario(disabledScenario, master, versions);
      expect(disabled.input.attackBuff, `disabled at HP ${String(hp)}`).toBe(0);
      expect(
        disabled.effects
          .filter((effect) => control.operationIds.includes(effect.operationId))
          .every((effect) => effect.outcome === 'notApplied'),
        `disabled outcomes at HP ${String(hp)}`,
      ).toBe(true);

      const enabled = calculateScenario(
        applyEffectPresentationDecision(
          disabledScenario,
          control.projection,
          true,
          disabled.activationRequirements,
          disabled.effects,
        ),
        master,
        versions,
      );
      expect(enabled.result.status).toBe('calculated');
      expect(enabled.input.attackBuff, `HP ${String(hp)}`).toBe(attackBuff);
      expect(
        enabled.result.status === 'calculated' ? enabled.result.rows.map((row) => row.average) : [],
      ).toEqual(averages);
      expect(
        enabled.effects.filter(
          (effect) =>
            control.operationIds.includes(effect.operationId) && effect.outcome === 'applied',
        ),
      ).toHaveLength(appliedCount);
      expect(
        enabled.effectControls.find((candidate) => candidate.key === control.key)?.projection.value,
      ).toBe(attackBuff);
    }
  });

  it('evaluates Cú Chulainn own HP-linear attack effect from the shared HP input', () => {
    const servant = master.servants.find((candidate) => candidate.id === '300100')!;
    const skill = servant.skills.find((candidate) => candidate.id === '759550')!;
    const base = createDefaultResolvedScenario(master, undefined, servant);
    const skillCommand = base.preNoblePhantasmPlan.find(
      (command) => command.kind === 'useSkillSlot' && command.slot === skill.slot,
    );
    if (!skillCommand || skillCommand.kind !== 'useSkillSlot')
      throw new TypeError('cu_chulainn_hp_skill_action_missing');
    const scenario = {
      ...base,
      attackerHpPermille: 500,
      preNoblePhantasmPlan: [skillCommand, { kind: 'executeAttackNoblePhantasm' as const }],
    };
    const calculation = calculateScenario(scenario, master, {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    });
    const effect = calculation.effects.find(
      (candidate) => candidate.source.skillId === skill.id && candidate.label === '攻撃力アップ',
    )!;

    expect(effect).toMatchObject({
      requiredQuantity: 'attackerHpPermille',
      requiredQuantityOwner: 'attacker',
      outcome: 'applied',
      value: 0.35,
    });
    expect(calculation.input.attackBuff).toBe(0.35);
    expect(calculation.result.status).toBe('calculated');
  });

  it('does not project input consumed only by a non-damage operation', () => {
    const { calculation } = calculate('3300200');
    expect(calculation.inputDefinitions.some((input) => input.kind === 'friendshipLevel')).toBe(
      true,
    );
    expect(calculation.effectInputs.some((input) => input.kind === 'friendshipLevel')).toBe(false);
  });

  it('rejects a value below the derived minimum without clamping', () => {
    const { scenario, calculation } = calculate('1102000');
    const king = calculation.effectInputs.find((input) => input.label === '〔王〕一致数')!;
    const invalidScenario = applyCanonicalInputCommand(scenario, {
      kind: 'setCanonicalIntegerInput',
      key: king.key,
      value: 0,
    });
    const invalid = calculateScenario(invalidScenario, master, {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    });
    expect(invalid.result).toMatchObject({ status: 'inputRequired', rows: [] });
    expect(invalid.effectInputs.find((input) => input.key === king.key)).toMatchObject({
      value: 0,
      invalid: true,
      explicit: true,
    });
    expect(invalid.input.npDamageBuff).toBe(0.1);
  });

  it('resolves defaults and invalid explicit values before execution', () => {
    const definition = calculate('2801300').calculation.inputDefinitions.find(
      (input) => input.label === '敵の合計数',
    )!;
    expect(resolveCanonicalInputValues([definition], {})).toEqual({
      values: { [definition.key]: 1 },
      missingDefinitions: [],
      invalidInputKeys: [],
    });
    expect(
      resolveCanonicalInputValues([definition], {
        [definition.key]: { kind: 'integer', value: 0 },
      }),
    ).toMatchObject({ values: {}, missingDefinitions: [{ key: definition.key }] });
  });

  it('fails closed when portable scenario data contains an unknown canonical key', () => {
    const { scenario } = calculate('2801300');
    const invalid = calculateScenario(
      {
        ...scenario,
        canonicalInputValues: {
          unknown: { kind: 'integer', value: 1 },
        },
      },
      master,
      {
        schemaVersion: SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
        appVersion: '0.1.0',
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
        masterDataVersion: master.version,
      },
    );
    expect(invalid.result).toMatchObject({ status: 'unsupported', rows: [] });
    expect(invalid.effectWarnings).toContain('invalidCanonicalInput:unknown:unknownInputKey');
  });
});
