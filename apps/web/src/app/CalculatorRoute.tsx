'use client';

import { useEffect, useLayoutEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import {
  addSupportTemplate as appendSupportTemplate,
  updateSupportTemplate as patchSupportTemplate,
} from '@fgo-lab/profile-domain';
import { finalizeHistory, portableCalculationFingerprint } from '@fgo-lab/workspace-domain';
import type {
  CalculationResult,
  CalculationScenario,
  CurrentCalculationHistoryEntry,
  LocalProfile,
  PortableCalculationRequest,
  SupportTemplate,
} from '@fgo-lab/schema';
import type { EffectProjection } from '@fgo-lab/calculation-application';
import {
  applyEffectProjectionDecisions,
  attemptPortableCalculationReset,
  attemptPortableCalculationVersionUpgrade,
  createDefaultCalculatorPortableRequest,
  currentCalculationVersionContext,
  executePortableCalculation,
  recoverPortableCalculation,
  attemptPortableCalculationScenarioChange,
  resolveScenario,
} from '@fgo-lab/calculation-application';
import { CalculationContextNotice } from '../features/calculator/CalculationContextNotice';
import { Calculator, RejectedCalculator } from '../features/calculator/Calculator';
import type { CalculationWorkspace } from './App';
import {
  commitPortableDraft as commitPortableDraftRecord,
  type UpdateActiveProfile,
} from './portableDraft';

interface CalculatorRouteProps {
  master: MasterDataSnapshot;
  profile: LocalProfile;
  calculation: CalculationWorkspace;
  setCalculation: Dispatch<SetStateAction<CalculationWorkspace>>;
  calculationSessionId: string;
  setCalculationSessionId: Dispatch<SetStateAction<string>>;
  updateActiveProfile: UpdateActiveProfile;
  updateSupportTemplate: (
    templateId: string,
    patch: Partial<Pick<SupportTemplate, 'name' | 'lastUsedAt' | 'composition'>>,
  ) => Promise<void>;
  registerFinalizer: (finalizer: (() => Promise<void>) | null) => void;
  recoveryFocus: 'result' | 'error' | null;
  setRecoveryFocus: Dispatch<SetStateAction<'result' | 'error' | null>>;
}

function supportDecisionKeys(effects: readonly EffectProjection[]) {
  return new Set(
    effects
      .filter((effect) => effect.source.origin === 'support')
      .map((effect) => effect.projectionKey),
  );
}

function excludedSupportEffects(template: SupportTemplate, effects: readonly EffectProjection[]) {
  return effects.filter(
    (effect) =>
      effect.source.origin === 'support' &&
      template.composition.effectInclusions.some(
        (override) =>
          override.sourceInstanceId === effect.source.sourceInstanceId &&
          override.skillId === effect.source.skillId &&
          override.effectId === effect.source.effectId &&
          override.effectOccurrenceId === effect.source.effectOccurrenceId,
      ),
  );
}

export function CalculatorRoute({
  master,
  profile,
  calculation,
  setCalculation,
  calculationSessionId,
  setCalculationSessionId,
  updateActiveProfile,
  updateSupportTemplate,
  registerFinalizer,
  recoveryFocus,
  setRecoveryFocus,
}: CalculatorRouteProps) {
  const defaultServant = master.servants[0]!;
  const defaultBuild = profile.servantBuilds[defaultServant.id];
  const currentRequest =
    calculation.request ??
    createDefaultCalculatorPortableRequest(master, defaultBuild, defaultServant);
  const currentScenario = currentRequest.scenario;
  const portableOutcome = calculation.storedResult
    ? recoverPortableCalculation(currentRequest, calculation.storedResult, master)
    : executePortableCalculation(currentRequest, master);
  const resolvedCalculation =
    portableOutcome.status === 'executed' || portableOutcome.status === 'unsupported'
      ? portableOutcome.execution
      : null;
  const calculationSupportTemplate = profile.supportTemplates.find(
    (template) =>
      template.templateId ===
      (currentScenario.mode === 'resolved' ? currentScenario.support?.sourceTemplateId : undefined),
  );
  const result =
    portableOutcome.status === 'historicalOnly'
      ? portableOutcome.result
      : resolvedCalculation?.result;

  async function commitPortableDraft(
    request: PortableCalculationRequest,
    nextResult: CalculationResult,
    sessionId = calculationSessionId,
  ) {
    await commitPortableDraftRecord({
      request,
      result: nextResult,
      sessionId,
      updateActiveProfile,
      setCalculation,
    });
  }

  async function saveScenarioDraft(scenario: CalculationScenario) {
    const retainedResult = calculation.storedResult ?? result;
    const attempt = attemptPortableCalculationScenarioChange(
      currentRequest,
      retainedResult,
      scenario,
      master,
    );
    if (attempt.status !== 'committed') return;
    await commitPortableDraft(attempt.request, attempt.result);
  }

  async function resetPortableDraft() {
    const retainedResult = calculation.storedResult ?? result;
    if (!retainedResult) return;
    const attempt = attemptPortableCalculationReset(
      currentRequest,
      retainedResult,
      master,
      profile.servantBuilds,
    );
    if (attempt.status !== 'committed') return;
    await commitPortableDraft(attempt.request, attempt.result);
  }

  async function copyHistoryToDraft(entry: CurrentCalculationHistoryEntry) {
    const sessionId = crypto.randomUUID();
    setCalculationSessionId(sessionId);
    setCalculation({ request: entry.request, storedResult: entry.result, source: 'history' });
    const now = new Date().toISOString();
    await updateActiveProfile((current) => ({
      ...current,
      draft: {
        profileId: current.profileId,
        calculationSessionId: sessionId,
        request: entry.request,
        result: entry.result,
        requestFingerprint: entry.requestFingerprint,
        updatedAt: now,
      },
      updatedAt: now,
    }));
  }

  async function finalizeCurrentCalculation() {
    if (!result) return;
    const fingerprint = await portableCalculationFingerprint(
      currentRequest,
      async (data: Uint8Array) => crypto.subtle.digest('SHA-256', new Uint8Array(data)),
    );
    const now = new Date().toISOString();
    await updateActiveProfile((current) =>
      finalizeHistory(current, {
        sessionId: calculationSessionId,
        request: currentRequest,
        result,
        fingerprint,
        now,
        historyId: crypto.randomUUID(),
      }),
    );
  }

  useEffect(() => {
    registerFinalizer(finalizeCurrentCalculation);
    return () => registerFinalizer(null);
  });

  useLayoutEffect(() => {
    if (!recoveryFocus) return;
    const selector =
      recoveryFocus === 'result'
        ? '[data-calculation-result-heading]'
        : '[data-calculation-error-summary]';
    document.querySelector<HTMLElement>(selector)?.focus();
    setRecoveryFocus(null);
  }, [recoveryFocus, setRecoveryFocus]);

  return (
    <>
      {resolvedCalculation?.status === 'rejected' && currentScenario.mode === 'resolved' && (
        <RejectedCalculator
          result={resolvedCalculation.result}
          scenario={currentScenario}
          effectInputs={resolvedCalculation.effectInputs}
          onScenarioChange={saveScenarioDraft}
        />
      )}
      {portableOutcome.status === 'historicalOnly' && (
        <CalculationContextNotice
          state="historicalOnly"
          request={currentRequest}
          result={portableOutcome.result}
          {...(calculation.upgradeAttempt ? { upgradeAttempt: calculation.upgradeAttempt } : {})}
          onUpgrade={async () => {
            const attempt = attemptPortableCalculationVersionUpgrade(
              currentRequest,
              portableOutcome.result,
              currentCalculationVersionContext(master),
              master,
            );
            if (attempt.status === 'committed') {
              await commitPortableDraft(attempt.request, attempt.result);
              setRecoveryFocus('result');
              return;
            }
            setCalculation((current) => ({ ...current, upgradeAttempt: attempt }));
            setRecoveryFocus('error');
          }}
        />
      )}
      {portableOutcome.status === 'invalid' && (
        <CalculationContextNotice
          state="invalid"
          request={currentRequest}
          reason={portableOutcome.reason}
          onReset={resetPortableDraft}
        />
      )}
      {portableOutcome.status === 'unsupported' && resolvedCalculation?.status === 'rejected' && (
        <CalculationContextNotice
          state="unsupported"
          request={currentRequest}
          onReset={resetPortableDraft}
        />
      )}
      {(portableOutcome.status === 'executed' || portableOutcome.status === 'unsupported') &&
        resolvedCalculation?.status === 'executable' &&
        result && (
          <Calculator
            master={master}
            resolvedInput={resolvedCalculation.input}
            scenarioInput={resolvedCalculation.scenarioInput}
            resolvedEffects={resolvedCalculation.effects}
            effectControls={resolvedCalculation.effectControls}
            effectWarnings={resolvedCalculation.effectWarnings}
            effectInputs={resolvedCalculation.effectInputs}
            activationRequirements={resolvedCalculation.activationRequirements}
            result={result}
            request={currentRequest}
            scenario={currentScenario}
            servants={master.servants}
            builds={profile.servantBuilds}
            craftEssenceCopies={profile.craftEssences}
            craftEssences={master.craftEssences}
            supportTemplates={profile.supportTemplates}
            history={profile.history}
            selectedSupport={calculationSupportTemplate}
            onScenarioChange={saveScenarioDraft}
            onSupportSelect={async (template) => {
              if (currentScenario.mode !== 'resolved') return;
              const currentSupportDecisionKeys = supportDecisionKeys(resolvedCalculation.effects);
              const retainedDecisions = currentScenario.effectDecisions.filter(
                (decision) => !currentSupportDecisionKeys.has(decision.decisionKey),
              );
              const retainedWorldFacts = currentScenario.worldFactAssertions.filter(
                (assertion) => !currentSupportDecisionKeys.has(assertion.decisionKey),
              );
              if (!template) {
                await saveScenarioDraft({
                  ...currentScenario,
                  support: null,
                  effectDecisions: retainedDecisions,
                  worldFactAssertions: retainedWorldFacts,
                });
                return;
              }
              const lastUsedAt = new Date().toISOString();
              await updateSupportTemplate(template.templateId, { lastUsedAt });
              const candidate = {
                ...currentScenario,
                support: {
                  sourceTemplateId: template.templateId,
                  composition: structuredClone(template.composition),
                },
                effectDecisions: retainedDecisions,
                worldFactAssertions: retainedWorldFacts,
              };
              const candidateEffects = resolveScenario(candidate, master).effects;
              await saveScenarioDraft(
                applyEffectProjectionDecisions(
                  candidate,
                  excludedSupportEffects(template, candidateEffects),
                  false,
                ),
              );
            }}
            onSupportSave={async (mode) => {
              if (currentScenario.mode !== 'resolved' || !currentScenario.support) return;
              if (mode === 'source' && currentScenario.support.sourceTemplateId) {
                await updateSupportTemplate(currentScenario.support.sourceTemplateId, {
                  composition: structuredClone(currentScenario.support.composition),
                });
                return;
              }
              const templateId = crypto.randomUUID();
              const now = new Date().toISOString();
              await updateActiveProfile((current) =>
                patchSupportTemplate(
                  appendSupportTemplate(current, master.version, templateId, now),
                  templateId,
                  { composition: structuredClone(currentScenario.support!.composition) },
                  now,
                ),
              );
              await saveScenarioDraft({
                ...currentScenario,
                support: { ...currentScenario.support, sourceTemplateId: templateId },
              });
            }}
            onFinalize={finalizeCurrentCalculation}
            onHistorySelect={copyHistoryToDraft}
            onResetPortableRequest={resetPortableDraft}
          />
        )}
    </>
  );
}
