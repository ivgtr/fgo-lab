import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION, type VersionContext } from '@fgo-lab/schema';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyCanonicalInputCommand } from './canonicalInputs';
import {
  applyEffectControlPresentationDecision,
  applyEffectPresentationDecision,
} from './effectDecision';
import { calculateScenario, createDefaultResolvedScenario } from './scenario';
import { appendCalculationSupportSource, setAttackerSkillLevel } from './scenarioCommands';

const root = resolve(import.meta.dirname, '../../..');
let master: ReturnType<typeof masterSnapshotSchema.parse>;
let versions: VersionContext;

beforeAll(async () => {
  master = masterSnapshotSchema.parse(
    JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
  );
  versions = {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    appVersion: '0.1.0',
    gameRegion: 'JP',
    masterDataLocale: 'ja-JP',
    masterDataVersion: master.version,
  };
});

function scenarioFor(servantId: string) {
  const servant = master.servants.find((candidate) => candidate.id === servantId)!;
  return createDefaultResolvedScenario(master, undefined, servant);
}

function withProcResults(
  servantId: string,
  value: (minimum: number, maximum: number) => number,
  overcharge = 1,
) {
  let scenario = { ...scenarioFor(servantId), overcharge };
  const initial = calculateScenario(scenario, master, versions);
  expect(initial.result.status).toBe('calculated');
  const procControls = initial.effectControls.filter(
    ({ projection }) =>
      projection.proc.kind === 'singleRoll' || projection.proc.kind === 'independentRolls',
  );
  const procSourceKeys = new Set(
    procControls.map(
      ({ projection }) =>
        `${projection.source.origin}:${projection.source.sourceInstanceId}:${projection.source.skillId}`,
    ),
  );
  for (const control of initial.effectControls.filter(
    ({ projection }) =>
      procSourceKeys.has(
        `${projection.source.origin}:${projection.source.sourceInstanceId}:${projection.source.skillId}`,
      ) &&
      (projection.proc.kind === 'singleRoll' ||
        projection.proc.kind === 'independentRolls' ||
        projection.source.origin === 'attacker' ||
        projection.source.origin === 'support' ||
        projection.source.origin === 'mysticCode'),
  ))
    scenario = applyEffectControlPresentationDecision(
      scenario,
      control,
      procControls.includes(control) ? value(0, 1) === 1 : true,
      initial.effects,
      initial.effectInputs,
    );
  for (const input of initial.effectInputs.filter(
    (candidate) => candidate.kind === 'procSuccessCount',
  ))
    scenario = applyCanonicalInputCommand(scenario, {
      kind: 'setCanonicalIntegerInput',
      key: input.key,
      value: value(input.minimum, input.maximum),
    });
  return calculateScenario(scenario, master, versions);
}

function np1Average(calculation: ReturnType<typeof calculateScenario>) {
  expect(calculation.result.status).toBe('calculated');
  if (calculation.result.status !== 'calculated') throw new TypeError('calculation_not_resolved');
  return calculation.result.rows[0].average;
}

describe('production probabilistic NP-before damage effects', () => {
  it('uses the effect toggle as the success result for simple probabilistic skills', () => {
    const cases = [
      ['100500', 37_471.765, 53_959.575],
      ['201100', 40_193.535, 52_251.735],
      ['301000', 17_898.015, 25_773.36],
      ['401200', 71_738.6, 100_364.28],
      ['502300', 26_296.635, 39_445.195],
      ['600300', 38_164.455, 49_613.94],
      ['600800', 39_139.545, 54_745.575],
      ['602700', 52_864.365, 72_953.03],
      ['1100900', 37_444.34, 44_879.31],
    ] as const;
    expect(
      cases.map(([servantId]) => {
        const failure = withProcResults(servantId, (minimum) => minimum);
        const success = withProcResults(servantId, (_minimum, maximum) => maximum);
        expect(failure.effectInputs.filter((input) => input.kind === 'procSuccessCount')).toEqual(
          [],
        );
        return [servantId, np1Average(failure), np1Average(success)] as const;
      }),
    ).toEqual(cases);
  });

  it('evaluates Caesar chained rolls from one explicit success-count input', () => {
    const averages = Array.from({ length: 6 }, (_, successes) => {
      const calculation = withProcResults('101300', () => successes);
      expect(
        calculation.effectInputs.filter((input) => input.kind === 'procSuccessCount'),
      ).toHaveLength(1);
      return np1Average(calculation);
    });
    expect(averages).toEqual([54_130.23, 59_530.825, 64_931.4, 70_331.98, 75_732.555, 81_133.125]);
  });

  it('uses Caesar success count as the sole chip-active state', () => {
    const scenario = scenarioFor('101300');
    const initial = calculateScenario(scenario, master, versions);
    const control = initial.effectControls.find(
      (candidate) => candidate.projection.proc.kind === 'chainedRolls',
    )!;
    const input = initial.effectInputs.find((candidate) => candidate.kind === 'procSuccessCount')!;
    expect(control).toMatchObject({ interaction: 'toggle', active: true });
    expect(input).toMatchObject({ value: 5, minimum: 0, maximum: 5 });
    expect(np1Average(initial)).toBe(81_133.125);

    const disabledScenario = applyEffectControlPresentationDecision(
      scenario,
      control,
      false,
      initial.effects,
      initial.effectInputs,
    );
    const disabled = calculateScenario(disabledScenario, master, versions);
    expect(disabled.effectControls.find((candidate) => candidate.key === control.key)?.active).toBe(
      false,
    );
    expect(disabled.effectInputs.find((candidate) => candidate.key === input.key)?.value).toBe(0);
    expect(np1Average(disabled)).toBe(54_130.23);

    const restoredScenario = applyEffectControlPresentationDecision(
      disabledScenario,
      disabled.effectControls.find((candidate) => candidate.key === control.key)!,
      true,
      disabled.effects,
      disabled.effectInputs,
    );
    const restored = calculateScenario(restoredScenario, master, versions);
    expect(restored.effectControls.find((candidate) => candidate.key === control.key)?.active).toBe(
      true,
    );
    expect(restored.effectInputs.find((candidate) => candidate.key === input.key)?.value).toBe(5);
    expect(np1Average(restored)).toBe(81_133.125);

    const twice = calculateScenario(
      applyCanonicalInputCommand(restoredScenario, {
        kind: 'setCanonicalIntegerInput',
        key: input.key,
        value: 2,
      }),
      master,
      versions,
    );
    expect(twice.effectControls.find((candidate) => candidate.key === control.key)?.active).toBe(
      true,
    );
    expect(np1Average(twice)).toBe(64_931.4);
    if (
      control.projection.decision.state === 'none' ||
      control.projection.decision.kind !== 'effect'
    )
      throw new TypeError('chained effect decision required');
    expect(disabledScenario.effectDecisions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ decisionKey: control.projection.decision.decisionKey }),
      ]),
    );
    const invalidDoubleState = calculateScenario(
      {
        ...scenario,
        effectDecisions: [
          ...scenario.effectDecisions,
          {
            decisionKey: control.projection.decision.decisionKey,
            operationEnabled: true,
            conditionSatisfaction: 'evaluate' as const,
          },
        ],
      },
      master,
      versions,
    );
    expect(invalidDoubleState.result.status).toBe('unsupported');
    expect(invalidDoubleState.input.attackBuff).toBe(0);
    expect(
      invalidDoubleState.effects
        .filter((effect) => effect.proc.kind === 'chainedRolls')
        .map((effect) => effect.outcome),
    ).not.toContain('applied');
    expect(invalidDoubleState.effectWarnings).toEqual(
      expect.arrayContaining([expect.stringContaining('invalidProcSelection')]),
    );
  });

  it('evaluates Sugiya independent rolls without coupling their results', () => {
    const failure = withProcResults('205100', (minimum) => minimum);
    const success = withProcResults('205100', (_minimum, maximum) => maximum);
    expect(
      failure.effectControls.filter(
        (control) =>
          (control.projection.proc.kind === 'singleRoll' ||
            control.projection.proc.kind === 'independentRolls') &&
          control.projection.visibility === 'visible',
      ),
    ).toHaveLength(3);
    expect(np1Average(failure)).toBe(43_749.28);
    expect(np1Average(success)).toBe(73_499.14);
  });

  it('derives Duryodhana roll rates from OC while leaving the result explicit', () => {
    const records = Array.from({ length: 5 }, (_, index) => {
      const overcharge = index + 1;
      const failure = withProcResults('704600', (minimum) => minimum, overcharge);
      const success = withProcResults('704600', (_minimum, maximum) => maximum, overcharge);
      const visibleProc = failure.effects.find(
        (effect) => effect.visibility === 'visible' && effect.proc.kind !== 'guaranteed',
      )!;
      return {
        overcharge,
        ratePermille: visibleProc.procRatePermille,
        failure: np1Average(failure),
        success: np1Average(success),
      };
    });
    expect(records).toEqual([
      { overcharge: 1, ratePermille: 600, failure: 23_688.94, success: 28_426.83 },
      { overcharge: 2, ratePermille: 700, failure: 23_688.94, success: 28_426.83 },
      { overcharge: 3, ratePermille: 800, failure: 23_688.94, success: 28_426.83 },
      { overcharge: 4, ratePermille: 900, failure: 23_688.94, success: 28_426.83 },
      { overcharge: 5, ratePermille: 1_000, failure: 23_688.94, success: 28_426.83 },
    ]);
  });

  it('updates Sitonai proc metadata by skill level without changing the decision identity', () => {
    const records = [1, 9, 10].map((skillLevel) => {
      const scenario = setAttackerSkillLevel(scenarioFor('1000800'), '532551', skillLevel);
      const initial = calculateScenario(scenario, master, versions);
      const proc = initial.effects.find(
        (effect) =>
          effect.visibility === 'visible' &&
          (effect.proc.kind === 'singleRoll' || effect.proc.kind === 'independentRolls'),
      )!;
      const failure = calculateScenario(
        applyEffectPresentationDecision(scenario, proc, false, initial.effects),
        master,
        versions,
      );
      const success = calculateScenario(
        applyEffectPresentationDecision(scenario, proc, true, initial.effects),
        master,
        versions,
      );
      return {
        skillLevel,
        projectionKey: proc.projectionKey,
        ratePermille: proc.procRatePermille,
        failure: np1Average(failure),
        success: np1Average(success),
      };
    });
    expect(records).toEqual([
      {
        skillLevel: 1,
        projectionKey: records[0]!.projectionKey,
        ratePermille: 800,
        failure: 57_885.73,
        success: 69_417.98,
      },
      {
        skillLevel: 9,
        projectionKey: records[0]!.projectionKey,
        ratePermille: 960,
        failure: 57_885.73,
        success: 69_417.98,
      },
      {
        skillLevel: 10,
        projectionKey: records[0]!.projectionKey,
        ratePermille: 1_000,
        failure: 57_885.73,
        success: 69_417.98,
      },
    ]);
  });

  it('uses the same simple-roll decision when Calamity Jane is a support source', () => {
    const jane = master.servants.find((candidate) => candidate.id === '203700')!;
    const attacker = master.servants.find((candidate) => candidate.id === '100100')!;
    const scenario = appendCalculationSupportSource(
      createDefaultResolvedScenario(master, undefined, attacker),
      {
        sourceInstanceId: 'support:jane',
        servantId: jane.id,
        skills: jane.skills.map((skill) => ({
          skillId: skill.id,
          skillLevel: 10,
          enabled: false,
        })),
      },
    );
    const initial = calculateScenario(scenario, master, versions);
    const proc = initial.effects.find(
      (effect) =>
        effect.source.origin === 'support' &&
        effect.visibility === 'visible' &&
        (effect.proc.kind === 'singleRoll' || effect.proc.kind === 'independentRolls'),
    )!;
    const used = applyEffectPresentationDecision(scenario, proc, true, initial.effects);
    const failure = calculateScenario(
      applyEffectPresentationDecision(used, proc, false, initial.effects),
      master,
      versions,
    );
    const success = calculateScenario(
      applyEffectPresentationDecision(used, proc, true, initial.effects),
      master,
      versions,
    );

    expect(proc.procRatePermille).toBe(800);
    expect(failure.effectInputs.filter((input) => input.kind === 'procSuccessCount')).toEqual([]);
    expect([np1Average(failure), np1Average(success)]).toEqual([33_712.6, 40_455.225]);
  });
});
