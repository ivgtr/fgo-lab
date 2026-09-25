import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { applyEffectControlPresentationDecision } from './effectDecision';
import {
  attemptPortableCalculationScenarioChange,
  createCalculatorPortableRequest,
  currentCalculationVersionContext,
} from './portableCalculation';
import {
  calculateScenario,
  createDefaultResolvedScenario,
  requireExecutableCalculation,
} from './scenario';
import {
  auditProductionUserControlObservations,
  type ProductionUserControlObservation,
  type ProductionUserControlOperationEvent,
} from './productionParityDiagnostics';

const identity: ProductionUserControlObservation['identity'] = {
  ownerId: 'fixture-owner',
  profileKey: 'selected',
  path: 'selectedProfile',
  projectionKey: 'fixture:structural-control',
  operationId: 'fixture:variant-selection',
  contributionId: null,
  modifier: 'npVariantSelection',
  contributionControl: 'operation',
};

function side(
  applied: boolean,
  profileContinuity: NonNullable<ProductionUserControlObservation['enabled']['profileContinuity']>,
  damageResult: ProductionUserControlObservation['enabled']['damageResult'],
): ProductionUserControlObservation['enabled'] {
  const event: ProductionUserControlOperationEvent = {
    projectionKey: identity.projectionKey,
    operationId: identity.operationId,
    contributionId: null,
    kind: 'selectNoblePhantasmVariant',
    operationOutcome: applied ? 'applied' : 'notApplied',
    projectionOutcome: applied ? 'applied' : 'notApplied',
    projectionValuePermille: null,
  };
  return {
    executionObservation: {
      battlePointWitness: null,
      targetExecution: {
        selection: 'selected',
        candidateIndex: 0,
        targetCandidate: { classId: 'saber', attribute: 'man', families: [], facts: [] },
        operationEvents: [
          {
            sequence: 0,
            operationId: event.operationId,
            projectionKey: event.projectionKey,
            contributionId: event.contributionId,
            operationKind: event.kind,
            operationOutcome: event.operationOutcome,
            projectionOutcome: event.projectionOutcome,
            condition: 'satisfied',
            projectionValuePermille: null,
          },
        ],
      },
    },
    operationEvents: [event],
    projections: [
      {
        projectionKey: identity.projectionKey,
        operationId: identity.operationId,
        contributionId: null,
        outcome: event.projectionOutcome,
        valuePermille: null,
      },
    ],
    inputBinding: {
      kind: 'bound',
      address: 'npVariantSelection.damageInput',
      value: {
        variant: applied ? 'selected' : 'other',
        cardType: 'buster',
        npMultipliers: [1, 1, 1, 1, 1],
        damageFunction: { status: 'resolved', kind: 'standard', ignoreDefense: false },
      },
    },
    effectiveContributions: [],
    damageResult,
    profileContinuity,
  };
}

function gate(excluded: ProductionUserControlObservation['excluded']) {
  return auditProductionUserControlObservations({
    expectedProjectionCount: 1,
    expectedIdentities: [identity],
    observations: [
      {
        identity,
        enabled: side(
          true,
          {
            kind: 'matched',
            intendedProfileKey: 'selected',
            actualProfileKey: 'selected',
          },
          { status: 'calculated', rows: [{ average: 100 }] },
        ),
        excluded,
      },
    ],
  });
}

describe('production structural control proof', () => {
  it('keeps the selected profile across all four published structural controls and recovers on re-enable', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(
        await readFile(
          resolve(import.meta.dirname, '../../../apps/web/public/master/master.json'),
          'utf8',
        ),
      ),
    );
    const versions = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP' as const,
      masterDataLocale: 'ja-JP' as const,
      masterDataVersion: master.version,
    };
    for (const [ownerId, occurrenceId, expectedAverage, unavailableReason] of [
      ['505600', '2619550:532:0', 63235.92, 'selectedAttackProfileHasNoAttack'],
      ['205000', '2281675:532:0', 88414.945, 'selectedAttackProfileChanged'],
    ] as const) {
      const servant = master.servants.find(({ id }) => id === ownerId);
      expect(servant).toBeDefined();
      const scenario = createDefaultResolvedScenario(master, undefined, servant);
      const baseline = requireExecutableCalculation(calculateScenario(scenario, master, versions));
      for (const kind of ['transformActorForm', 'selectNoblePhantasmVariant'] as const) {
        const operationSuffix = kind === 'transformActorForm' ? ':actor-form' : ':np-variant';
        const control = baseline.effectControls.find(({ projection }) =>
          projection.projectionKey.includes(occurrenceId),
        );
        expect(
          baseline.effects.some(
            ({ projectionKey, operationId }) =>
              projectionKey.includes(occurrenceId) && operationId.endsWith(operationSuffix),
          ),
        ).toBe(true);
        expect(control, `${ownerId}:${kind}`).toBeDefined();
        const enabledScenario = applyEffectControlPresentationDecision(
          scenario,
          control!,
          true,
          baseline.activationRequirements,
          baseline.effects,
          baseline.effectInputs,
        );
        const enabled = requireExecutableCalculation(
          calculateScenario(enabledScenario, master, versions),
        );
        expect(enabled.result.status).toBe('calculated');
        if (enabled.result.status !== 'calculated') continue;
        expect(enabled.result.rows[0].average).toBe(expectedAverage);
        expect(enabled.profileContinuity?.kind).toBe('matched');
        const activeControl = enabled.effectControls.find(({ key }) => key === control!.key)!;
        const excludedScenario = applyEffectControlPresentationDecision(
          enabledScenario,
          activeControl,
          false,
          enabled.activationRequirements,
          enabled.effects,
          enabled.effectInputs,
        );
        const retained = createCalculatorPortableRequest(
          enabledScenario,
          currentCalculationVersionContext(master),
        );
        const off = attemptPortableCalculationScenarioChange(
          retained,
          enabled.result,
          excludedScenario,
          master,
        );
        expect(off.status).toBe('committed');
        if (off.status !== 'committed') continue;
        expect(off.result).toMatchObject({
          status: 'unavailable',
          reason: unavailableReason,
          rows: [],
        });
        expect(
          off.execution.effects.find(
            ({ projectionKey, operationId }) =>
              projectionKey.includes(occurrenceId) && operationId.endsWith(operationSuffix),
          )?.outcome,
        ).toBe('notApplied');
        expect(off.execution.profileContinuity?.kind).toBe(
          ownerId === '505600' ? 'unavailableNoAttack' : 'unavailableDifferentAttack',
        );
        const recovery = attemptPortableCalculationScenarioChange(
          off.request,
          off.result,
          enabledScenario,
          master,
        );
        expect(recovery.status, `${ownerId}:${kind}:recovery`).toBe('committed');
        if (recovery.status !== 'committed') continue;
        expect(recovery.result.status, `${ownerId}:${kind}:recovery-result`).toBe('calculated');
        if (recovery.result.status === 'calculated')
          expect(recovery.result.rows[0].average, `${ownerId}:${kind}:recovery-average`).toBe(
            expectedAverage,
          );
      }
    }
  }, 60_000);

  it('accepts an alternate ordered path that reaches the same profile', () => {
    const excluded = side(
      false,
      { kind: 'matched', intendedProfileKey: 'selected', actualProfileKey: 'selected' },
      { status: 'calculated', rows: [{ average: 90 }] },
    );
    expect(gate(excluded)).toMatchObject({ status: 'passed', failures: [] });
  });

  it('accepts typed no-attack and different-attack unavailability', () => {
    for (const [proof, reason] of [
      [{ kind: 'unavailableNoAttack', actualProfileKey: null }, 'selectedAttackProfileHasNoAttack'],
      [
        { kind: 'unavailableDifferentAttack', actualProfileKey: 'other' },
        'selectedAttackProfileChanged',
      ],
    ] as const) {
      const excluded = side(
        false,
        {
          ...proof,
          intendedProfileKey: 'selected',
          disabledSelectionOperationId: identity.operationId,
        },
        { status: 'unavailable', reason, rows: [] },
      );
      expect(gate(excluded)).toMatchObject({ status: 'passed', failures: [] });
    }
  });

  it('rejects a calculated result from a different attack profile', () => {
    const excluded = side(
      false,
      {
        kind: 'unavailableDifferentAttack',
        intendedProfileKey: 'selected',
        actualProfileKey: 'other',
        disabledSelectionOperationId: identity.operationId,
      },
      { status: 'calculated', rows: [{ average: 200 }] },
    );
    expect(gate(excluded)).toMatchObject({
      status: 'failed',
      failures: [{ reason: 'userControlSelectedProfileProofMissing' }],
    });
  });

  it('rejects missing proof, unresolved selection and a numeric row on unavailable', () => {
    const missing = side(
      false,
      { kind: 'matched', intendedProfileKey: 'selected', actualProfileKey: 'selected' },
      { status: 'calculated', rows: [{ average: 90 }] },
    );
    delete missing.profileContinuity;
    const unresolved = side(
      false,
      { kind: 'unresolved', reason: 'actualAttackProfileUnresolved' },
      { status: 'unsupported', rows: [] },
    );
    const numericUnavailable = side(
      false,
      {
        kind: 'unavailableDifferentAttack',
        intendedProfileKey: 'selected',
        actualProfileKey: 'other',
        disabledSelectionOperationId: identity.operationId,
      },
      { status: 'unavailable', reason: 'selectedAttackProfileChanged', rows: [{ average: 90 }] },
    );
    for (const excluded of [missing, unresolved, numericUnavailable])
      expect(gate(excluded)).toMatchObject({
        status: 'failed',
        failures: [{ reason: 'userControlSelectedProfileProofMissing' }],
      });
  });
});
