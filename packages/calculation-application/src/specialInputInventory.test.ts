import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { describe, expect, it } from 'vitest';
import { applyCanonicalInputCommand } from './canonicalInputs';
import { applyEffectProjectionDecision } from './effectDecision';
import {
  calculateScenario as calculateScenarioOutcome,
  createDefaultResolvedScenario,
  requireExecutableCalculation,
} from './scenario';
const calculateScenario = (...args: Parameters<typeof calculateScenarioOutcome>) =>
  requireExecutableCalculation(calculateScenarioOutcome(...args));

const root = resolve(import.meta.dirname, '../../..');

describe('production special input inventory', () => {
  it('ratchets effect-scoped inputs and excludes duplicate or inert UI controls', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const versions = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    } as const;
    const calculations = master.servants.flatMap((servant) => {
      try {
        const scenario = createDefaultResolvedScenario(master, undefined, servant);
        return [{ servant, scenario, calculation: calculateScenario(scenario, master, versions) }];
      } catch {
        return [];
      }
    });
    const inputs = calculations.flatMap(({ calculation }) => calculation.effectInputs);
    const counts = inputs.reduce<Record<string, number>>((result, input) => {
      result[input.kind] = (result[input.kind] ?? 0) + 1;
      return result;
    }, {});
    const duplicateControls = calculations.flatMap(({ calculation }) => {
      const keys = calculation.effectInputs.map((input) => input.key);
      return keys.filter((key, index) => keys.indexOf(key) !== index);
    });

    expect(calculations).toHaveLength(422);
    const statusCounts = calculations.reduce<Record<string, number>>((result, { calculation }) => {
      result[calculation.result.status] = (result[calculation.result.status] ?? 0) + 1;
      return result;
    }, {});
    const criticalStarUnsupported = calculations.flatMap(({ servant, calculation }) =>
      calculation.result.status === 'unsupported' &&
      calculation.result.missingEvidence.some((item) => item.includes(':criticalStars'))
        ? [
            {
              servantId: servant.id,
              effects: calculation.effects
                .filter(({ outcome }) => outcome === 'unsupported')
                .map(({ source, label }) => ({ source, label })),
            },
          ]
        : [],
    );
    expect(statusCounts, JSON.stringify(criticalStarUnsupported)).toEqual({
      calculated: 420,
      unsupported: 2,
    });
    expect(criticalStarUnsupported).toEqual([]);
    expect(inputs).toHaveLength(58);
    expect(counts).toEqual({
      availableSkillCount: 1,
      criticalStars: 1,
      currentTurn: 2,
      effectStackCount: 20,
      fieldActorCount: 1,
      matchingActorCount: 3,
      populationCount: 5,
      transferDonor: 8,
      populationSize: 10,
      populationActorValue: 6,
      procSuccessCount: 1,
    });
    expect(inputs.filter((input) => input.control === 'segmented')).toHaveLength(19);
    expect(inputs.filter((input) => input.control === 'stepper')).toHaveLength(39);
    expect(inputs.filter((input) => input.section === 'support')).toHaveLength(0);
    expect(duplicateControls).toEqual([]);
    expect(inputs.some((input) => input.kind === 'friendshipLevel')).toBe(false);
    expect(inputs.every((input) => input.relatedProjectionKeys.length > 0)).toBe(true);

    const unreachableInputs = calculations.flatMap(({ servant, scenario, calculation }) =>
      calculation.effectInputs.flatMap((input) => {
        const related = calculation.effectControls.filter((control) =>
          input.relatedProjectionKeys.includes(control.key),
        );
        const enabled = related.reduce(
          (current, control) =>
            control.projection.controllability === 'user'
              ? applyEffectProjectionDecision(current, control.projection, true)
              : current,
          scenario,
        );
        const evaluate = (value: number) =>
          calculateScenarioOutcome(
            applyCanonicalInputCommand(enabled, {
              kind: 'setCanonicalIntegerInput',
              key: input.key,
              value,
            }),
            master,
            versions,
          );
        const minimum = evaluate(input.minimum);
        const maximum = evaluate(input.maximum);
        return JSON.stringify({
          input: 'input' in minimum ? minimum.input : null,
          result: minimum.result,
        }) ===
          JSON.stringify({
            input: 'input' in maximum ? maximum.input : null,
            result: maximum.result,
          })
          ? [`${servant.id}:${input.key}`]
          : [];
      }),
    );
    expect(unreachableInputs).toEqual([]);

    const singleChoiceControls = calculations.flatMap(({ calculation }) =>
      calculation.effectControls.filter((control) => control.interaction === 'singleChoice'),
    );
    expect(singleChoiceControls).toHaveLength(6);
    expect(
      new Set(
        singleChoiceControls.flatMap((control) =>
          control.projection.selectionGroups.map((group) => group.groupKey),
        ),
      ).size,
    ).toBe(2);

    const repeatedUserLabels = calculations.flatMap(({ servant, calculation }) => {
      const counts = new Map<string, number>();
      for (const control of calculation.effectControls.filter(
        (candidate) => candidate.projection.controllability === 'user',
      )) {
        const key = `${control.projection.source.sourceInstanceId}:${control.projection.label}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return [...counts.entries()].flatMap(([key, count]) =>
        count >= 3 ? [`${servant.id}:${key}:${String(count)}`] : [],
      );
    });
    expect(repeatedUserLabels).toEqual([]);

    const inoperableVisibleEffects = calculations.flatMap(({ servant, calculation }) =>
      calculation.effectControls.flatMap((control) =>
        control.projection.visibility === 'visible' && control.interaction === 'none'
          ? [`${servant.id}:${control.key}`]
          : [],
      ),
    );
    expect(inoperableVisibleEffects).toEqual([]);

    const chainedStateMismatches = calculations.flatMap(({ servant, calculation }) =>
      calculation.effectControls.flatMap((control) => {
        if (control.projection.proc.kind !== 'chainedRolls') return [];
        const input = calculation.effectInputs.find(
          (candidate) =>
            candidate.kind === 'procSuccessCount' &&
            candidate.relatedProjectionKeys.includes(control.key),
        );
        const active = (input?.value ?? input?.defaultValue ?? 0) > (input?.minimum ?? 0);
        return input && control.active === active ? [] : [`${servant.id}:${control.key}`];
      }),
    );
    expect(chainedStateMismatches).toEqual([]);

    const conditionlessUnsatisfied = calculations.flatMap(({ servant, calculation }) =>
      calculation.effectControls.flatMap((control) =>
        control.presentationState === 'conditionUnsatisfied' &&
        control.projection.explanation.condition === null
          ? [`${servant.id}:${control.key}`]
          : [],
      ),
    );
    expect(conditionlessUnsatisfied).toEqual([]);
  }, 20_000);
});
