import { preparationExecutionStateFor } from '@fgo-lab/battle-execution';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { battlePointPhase, readBattlePoint } from '@fgo-lab/battle-execution';
import {
  ENGINE_VERSION,
  SCHEMA_VERSION,
  portableCalculationRequestSchema,
  type CalculationScenario,
} from '@fgo-lab/schema';
import { applyEffectControlPresentationDecision } from './effectDecision';
import { createCalculatorPortableRequest, executePortableCalculation } from './portableCalculation';
import {
  createDefaultResolvedScenario,
  evaluatePreparedCalculationScenario,
  prepareCalculationScenarioWithPolicy,
  requireExecutableCalculation,
} from './scenario';

it('reads the prepared battle point phase and changes resolved damage through defense ignore', () => {
  const master = masterSnapshotSchema.parse(
    JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, '../../../apps/web/public/master/master.json'),
        'utf8',
      ),
    ),
  );
  const servant = master.servants.find(({ id }) => id === '3300200')!;
  const domain = servant.battlePointDomains![0]!;
  expect(battlePointPhase(domain, { kind: 'absent', eligible: true })).toBe(0);
  for (const [point, phase] of [
    [50, 6],
    [60, 7],
    [91, 10],
  ] as const)
    expect(
      battlePointPhase(domain, { kind: 'present', point, capacity: null, capacityModifiers: [] }),
    ).toBe(phase);
  const base = {
    ...createDefaultResolvedScenario(master, undefined, servant),
    enemyDefenseBuff: 0.3,
    battleState: { battlePointPhase: 7 },
  };
  const versions = {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    appVersion: '0.1.0',
    masterDataVersion: master.version,
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const run = (
    scenario: Extract<CalculationScenario, { mode: 'resolved' }>,
    initialPoint?: number,
  ) => {
    const prepared = prepareCalculationScenarioWithPolicy(
      scenario,
      master,
      { kind: 'calculator' },
      initialPoint === undefined ? {} : { initialBattlePointPoints: { [domain.id]: initialPoint } },
      true,
    );
    expect(prepared.status).toBe('executable');
    if (prepared.status !== 'executable') throw new Error('expected executable');
    return {
      prepared,
      calculation: requireExecutableCalculation(
        evaluatePreparedCalculationScenario(prepared, versions),
      ),
    };
  };
  const baseline = run(base);
  const control = baseline.calculation.effectControls.find(
    ({ projection }) =>
      projection.modifier === 'ignoreDefense' && projection.source.origin === 'np',
  )!;
  const initialPoint = baseline.prepared.executionObservation?.battlePointWitness?.[domain.id];
  expect(initialPoint).toBeDefined();
  const onScenario = applyEffectControlPresentationDecision(
    base,
    control,
    true,
    baseline.calculation.activationRequirements,
    baseline.calculation.effects,
    baseline.calculation.effectInputs,
  );
  const offScenario = applyEffectControlPresentationDecision(
    base,
    control,
    false,
    baseline.calculation.activationRequirements,
    baseline.calculation.effects,
    baseline.calculation.effectInputs,
  );
  const on = run(onScenario, initialPoint);
  const off = run(offScenario, initialPoint);
  const explicitOnScenario = {
    ...onScenario,
    battleState: { battlePointPhase: null },
    initialBattlePointPoints: { [domain.id]: initialPoint! },
  };
  const explicitOn = run(explicitOnScenario);
  expect(explicitOn.calculation.result).toEqual(on.calculation.result);
  const aboveWitnessCeiling = run(onScenario, 86);
  const aboveWitnessExecution = aboveWitnessCeiling.prepared.executionObservation?.targetExecution;
  if (aboveWitnessExecution?.selection !== 'selected')
    throw new Error('selected execution required');
  const aboveWitnessRead = aboveWitnessExecution.candidateState?.battlePointPhaseReads.find(
    (read) => read.operationId === control.projection.operationId,
  );
  expect(aboveWitnessRead).toMatchObject({
    subjectId: domain.id,
    point: 91,
    phase: 10,
    evaluated: true,
  });
  const value = readBattlePoint(preparationExecutionStateFor(on.prepared.orderedScenario)?.battlePoints, 'attacker', domain.id);
  const diagnostic = {
    initialPoint,
    preparedPoint: value?.kind === 'present' ? value.point : null,
    preparedPhase: battlePointPhase(domain, value),
    condition: control.projection.explanation.condition,
    on: {
      status: on.calculation.result.status,
      projection: on.calculation.effects.find(
        ({ operationId }) => operationId === control.projection.operationId,
      )?.outcome,
      input: on.calculation.input.damageFunction,
      defense: on.calculation.input.defenseBuff,
      row: on.calculation.result.status === 'calculated' ? on.calculation.result.rows[0] : null,
    },
    off: {
      status: off.calculation.result.status,
      projection: off.calculation.effects.find(
        ({ operationId }) => operationId === control.projection.operationId,
      )?.outcome,
      input: off.calculation.input.damageFunction,
      defense: off.calculation.input.defenseBuff,
      row: off.calculation.result.status === 'calculated' ? off.calculation.result.rows[0] : null,
    },
  };
  const canonical = servant.noblePhantasmVariantGroups
    .flatMap((group) => group.variants)
    .flatMap((variant) => variant.effects)
    .find((effect) => effect.occurrenceId === control.projection.source.effectOccurrenceId);
  expect(canonical?.requirement.expression).toMatchObject({
    kind: 'quantity',
    quantity: 'battlePointPhase',
    subjectId: domain.id,
    comparison: 'atLeast',
    value: 7,
  });
  expect({ ...onScenario, effectDecisions: [] }).toEqual({ ...offScenario, effectDecisions: [] });
  expect(initialPoint).not.toBe(value?.kind === 'present' ? value.point : null);
  expect(diagnostic.preparedPhase).toBeGreaterThanOrEqual(7);
  expect(on.calculation.profileContinuity).toMatchObject({ kind: 'matched' });
  expect(off.calculation.profileContinuity).toMatchObject({
    kind: 'matched',
    intendedProfileKey:
      on.calculation.profileContinuity?.kind === 'matched'
        ? on.calculation.profileContinuity.intendedProfileKey
        : '',
  });
  const operationId = control.projection.operationId;
  const read = (side: typeof on) => {
    const target = side.prepared.executionObservation?.targetExecution;
    return target?.selection === 'selected'
      ? target.candidateState?.battlePointPhaseReads.filter(
          (entry) => entry.operationId === operationId,
        )
      : undefined;
  };
  expect(
    read(on),
    JSON.stringify(
      on.prepared.orderedScenario?.operations.find((entry) => entry.operationId === operationId)
        ?.condition,
    ),
  ).toEqual([
    expect.objectContaining({
      subjectId: domain.id,
      actor: 'attacker',
      point: value?.kind === 'present' ? value.point : null,
      phase: diagnostic.preparedPhase,
      comparison: 'atLeast',
      expectedValue: 7,
      evaluated: true,
    }),
  ]);
  expect(read(off)).toEqual(read(on));
  const event = (side: typeof on) => {
    const target = side.prepared.executionObservation?.targetExecution;
    return target && 'operationEvents' in target
      ? target.operationEvents.find((entry) => entry.operationId === operationId)
      : undefined;
  };
  expect(event(on)).toMatchObject({ operationOutcome: 'applied', projectionOutcome: 'applied' });
  expect(event(off)).toMatchObject({
    operationOutcome: 'notApplied',
    projectionOutcome: 'notApplied',
  });
  expect(
    on.calculation.effectiveContributions.contributions.find(
      (entry) => entry.operationId === operationId,
    ),
  ).toMatchObject({ effective: true });
  expect(
    off.calculation.effectiveContributions.contributions.find(
      (entry) => entry.operationId === operationId,
    ),
  ).toMatchObject({ effective: false });
  expect(diagnostic.on.projection, JSON.stringify(diagnostic)).toBe('applied');
  expect(diagnostic.off.projection).toBe('notApplied');
  expect(diagnostic.on.input).toMatchObject({ ignoreDefense: true });
  expect(diagnostic.off.input).toMatchObject({ ignoreDefense: false });
  expect(diagnostic.on.row).not.toEqual(diagnostic.off.row);
  const portable = createCalculatorPortableRequest(explicitOnScenario, {
    schemaVersion: SCHEMA_VERSION,
    masterDataVersion: master.version,
    engineVersion: ENGINE_VERSION,
  });
  const restored = portableCalculationRequestSchema.parse(JSON.parse(JSON.stringify(portable)));
  expect(restored.scenario).toMatchObject({
    initialBattlePointPoints: { [domain.id]: initialPoint },
  });
  const portableOutcome = executePortableCalculation(restored, master);
  expect(portableOutcome.status).toBe('executed');
  if (portableOutcome.status !== 'executed') throw new Error('portable witness execution failed');
  expect(portableOutcome.execution.result).toEqual(on.calculation.result);
  const reonScenario = applyEffectControlPresentationDecision(
    offScenario,
    control,
    true,
    baseline.calculation.activationRequirements,
    baseline.calculation.effects,
    baseline.calculation.effectInputs,
  );
  expect(run(reonScenario, initialPoint).calculation.result).toEqual(on.calculation.result);
  for (const initialBattlePointPoints of [{ [domain.id]: -2 }, { 'fixture:unknown-domain': 10 }])
    expect(
      prepareCalculationScenarioWithPolicy(
        base,
        master,
        { kind: 'calculator' },
        { initialBattlePointPoints },
      ),
    ).toMatchObject({
      status: 'invalid',
      resolved: { issue: { kind: 'invalidBattlePointIntent', detail: 'invalidInitialPoint' } },
    });
  const ambiguousMaster = structuredClone(master);
  const ambiguousServant = ambiguousMaster.servants.find(({ id }) => id === servant.id)!;
  const otherDomain = { ...domain, id: 'fixture:other-battle-point-domain' };
  ambiguousMaster.battlePointDomains.push(otherDomain);
  ambiguousServant.battlePointDomains!.push(otherDomain);
  const skill = ambiguousServant.skills[0]!;
  skill.effects.push({
    ...skill.effects[0]!,
    occurrenceId: 'fixture:second-domain-read',
    requirement: {
      recipient: 'sourceSelf',
      expression: {
        kind: 'quantity',
        quantity: 'battlePointPhase',
        subjectId: otherDomain.id,
        comparison: 'atLeast',
        value: 1,
      },
    },
  });
  expect(
    prepareCalculationScenarioWithPolicy(base, ambiguousMaster, { kind: 'calculator' }),
  ).toMatchObject({
    status: 'invalid',
    resolved: { issue: { kind: 'invalidBattlePointIntent', detail: 'ambiguousDomain' } },
  });
});
