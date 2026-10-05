import { preparationExecutionStateFor } from '@fgo-lab/battle-execution';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { masterSnapshotSchema, type MasterDataSnapshot } from '@fgo-lab/master-data';
import { hpPermille } from '@fgo-lab/battle-execution';
import { calculationScenarioSchema, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { applyEffectControlPresentationDecision } from './effectDecision';
import {
  createDefaultResolvedScenario,
  evaluatePreparedCalculationScenario,
  prepareCalculationScenarioWithPolicy,
  requireExecutableCalculation,
} from './scenario';

let master: MasterDataSnapshot;
beforeAll(async () => {
  master = masterSnapshotSchema.parse(
    JSON.parse(
      await readFile(
        resolve(import.meta.dirname, '../../../apps/web/public/master/master.json'),
        'utf8',
      ),
    ),
  );
});

describe('ordered HP control witness', () => {
  it('keeps initial HP separate from the live condition read and reaches final damage on/off', () => {
    const servant = master.servants.find(({ id }) => id === '1000100')!;
    const versions = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP' as const,
      masterDataLocale: 'ja-JP' as const,
      masterDataVersion: master.version,
    };
    const base = createDefaultResolvedScenario(master, undefined, servant);
    const evaluate = (scenario: typeof base) => {
      const prepared = prepareCalculationScenarioWithPolicy(
        scenario,
        master,
        { kind: 'calculator' },
        {},
        true,
      );
      expect(prepared.status).toBe('executable');
      const calculation = requireExecutableCalculation(
        evaluatePreparedCalculationScenario(prepared, versions),
      );
      return { calculation, prepared };
    };
    const defaultCalculation = evaluate(base).calculation;
    const control = defaultCalculation.effectControls.find(
      ({ projection }) =>
        projection.modifier === 'attackBuff' &&
        projection.requiredQuantity === 'attackerHpPermille' &&
        projection.requiredQuantityOwner === 'attacker',
    )!;
    expect(control.projection.explanation.condition).toEqual({
      kind: 'all',
      expressions: [
        { kind: 'quantity', quantity: 'attackerHpPermille', comparison: 'atLeast', value: 0 },
        { kind: 'quantity', quantity: 'attackerHpPermille', comparison: 'atMost', value: 500 },
      ],
    });
    const run = (initialHpPermille: number) => {
      const scenario = { ...base, attackerHpPermille: initialHpPermille };
      const onScenario = applyEffectControlPresentationDecision(
        scenario,
        control,
        true,
        defaultCalculation.activationRequirements,
        defaultCalculation.effects,
        defaultCalculation.effectInputs,
      );
      const offScenario = applyEffectControlPresentationDecision(
        scenario,
        control,
        false,
        defaultCalculation.activationRequirements,
        defaultCalculation.effects,
        defaultCalculation.effectInputs,
      );
      expect({ ...onScenario, effectDecisions: [] }).toEqual({
        ...offScenario,
        effectDecisions: [],
      });
      const on = evaluate(onScenario);
      const off = evaluate(offScenario);
      const live = hpPermille(
        on.prepared.status === 'executable'
          ? preparationExecutionStateFor(on.prepared.orderedScenario)?.hp?.actors.attacker
          : undefined,
      );
      const event = (result: typeof on) =>
        result.calculation.executionObservation?.targetExecution?.selection === 'selected'
          ? result.calculation.executionObservation.targetExecution.operationEvents.find(
              ({ operationId }) => operationId === control.projection.operationId,
            )
          : undefined;
      const projection = (result: typeof on) =>
        result.calculation.effects.find(
          ({ operationId }) => operationId === control.projection.operationId,
        );
      const contribution = (result: typeof on) =>
        result.calculation.effectiveContributions.contributions.find(
          ({ operationId }) => operationId === control.projection.operationId,
        );
      return { onScenario, on, off, live, event, projection, contribution };
    };

    const initial500 = run(500);
    expect(initial500.live).toBe(752);
    expect(initial500.event(initial500.on)?.operationOutcome).toBe('notApplied');
    expect(initial500.event(initial500.off)?.operationOutcome).toBe('notApplied');
    const initial249 = run(249);
    expect(initial249.live).toBe(501);
    expect(initial249.event(initial249.on)?.operationOutcome).toBe('notApplied');
    const witness = run(240);
    expect(witness.live).toBe(492);
    expect(witness.on.calculation.profileContinuity).toEqual(
      witness.off.calculation.profileContinuity,
    );
    expect(witness.on.calculation.result.status).toBe('calculated');
    expect(witness.off.calculation.result.status).toBe('calculated');
    expect(witness.event(witness.on)?.operationOutcome).toBe('applied');
    expect(witness.event(witness.off)?.operationOutcome).toBe('notApplied');
    expect(witness.projection(witness.on)?.outcome).toBe('applied');
    expect(witness.projection(witness.off)?.outcome).toBe('notApplied');
    expect(witness.contribution(witness.on)?.effective).toBe(true);
    expect(witness.contribution(witness.off)?.effective).toBe(false);
    expect(witness.on.calculation.input.attackBuff).toBe(0.604);
    expect(witness.off.calculation.input.attackBuff).toBe(0.3);
    if (
      witness.on.calculation.result.status === 'calculated' &&
      witness.off.calculation.result.status === 'calculated'
    ) {
      expect(witness.on.calculation.result.rows[0].average).toBe(60194.84);
      expect(witness.off.calculation.result.rows[0].average).toBe(48824.155);
    }
    const restored = calculationScenarioSchema.parse(
      JSON.parse(JSON.stringify(witness.onScenario)),
    );
    expect(restored.mode).toBe('resolved');
    if (restored.mode !== 'resolved') throw new TypeError('resolved_scenario_required');
    expect(evaluate(restored).calculation.input.attackBuff).toBe(0.604);
    const offScenario = applyEffectControlPresentationDecision(
      witness.onScenario,
      witness.on.calculation.effectControls.find(({ key }) => key === control.key)!,
      false,
      witness.on.calculation.activationRequirements,
      witness.on.calculation.effects,
      witness.on.calculation.effectInputs,
    );
    const off = evaluate(offScenario).calculation;
    const reon = applyEffectControlPresentationDecision(
      offScenario,
      off.effectControls.find(({ key }) => key === control.key)!,
      true,
      off.activationRequirements,
      off.effects,
      off.effectInputs,
    );
    expect(evaluate(reon).calculation.input.attackBuff).toBe(0.604);
  });
});
