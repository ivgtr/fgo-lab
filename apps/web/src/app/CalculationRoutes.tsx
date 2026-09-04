'use client';

import dynamic from 'next/dynamic';
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
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import type { EffectProjection } from '@fgo-lab/calculation-application';
import {
  applyEffectProjectionDecisions,
  attemptPortableCalculationReset,
  attemptPortableCalculationVersionUpgrade,
  createDefaultCalculatorPortableRequest,
  createRankingPortableRequest,
  currentCalculationVersionContext,
  executePortableCalculation,
  recoverPortableCalculation,
  replacePortableCalculationScenario,
  resolveScenario,
} from '@fgo-lab/calculation-application';
import { CalculationContextNotice } from '../features/calculator/CalculationContextNotice';
import type { CalculationWorkspace, Page } from './App';

const Calculator = dynamic(() =>
  import('../features/calculator/Calculator').then((module) => module.Calculator),
);
const RejectedCalculator = dynamic(() =>
  import('../features/calculator/Calculator').then((module) => module.RejectedCalculator),
);
const Home = dynamic(() => import('../features/home/Home').then((module) => module.Home));
const Ranking = dynamic(() =>
  import('../features/ranking/Ranking').then((module) => module.Ranking),
);

type CalculationPage = Extract<Page, 'home' | 'calculate' | 'ranking'>;
type UpdateActiveProfile = (update: (profile: LocalProfile) => LocalProfile) => Promise<void>;

interface CalculationRoutesProps {
  page: CalculationPage;
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
  navigate: (page: Page) => Promise<void>;
  replaceRoute: (page: Page) => void;
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

export function CalculationRoutes({
  page,
  master,
  profile,
  calculation,
  setCalculation,
  calculationSessionId,
  setCalculationSessionId,
  updateActiveProfile,
  updateSupportTemplate,
  navigate,
  replaceRoute,
  registerFinalizer,
  recoveryFocus,
  setRecoveryFocus,
}: CalculationRoutesProps) {
  const defaultServant = master.servants[0]!;
  const defaultBuild = profile.servantBuilds[defaultServant.id];
  const currentRequest =
    calculation.request ??
    createDefaultCalculatorPortableRequest(master, defaultBuild, defaultServant);
  const currentScenario = currentRequest.scenario;
  const versions = {
    schemaVersion: SCHEMA_VERSION,
    masterDataVersion: master.version,
    engineVersion: ENGINE_VERSION,
    appVersion: APP_VERSION,
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const portableOutcome = calculation.storedResult
    ? recoverPortableCalculation(currentRequest, calculation.storedResult, master)
    : executePortableCalculation(currentRequest, master);
  const resolvedCalculation =
    portableOutcome.status === 'executed' || portableOutcome.status === 'unsupported'
      ? portableOutcome.execution
      : null;
  const input = resolvedCalculation?.status === 'executable' ? resolvedCalculation.input : null;
  const selectedAttackerId =
    input?.attackerId ??
    (currentScenario.mode === 'resolved' ? currentScenario.attacker.servantId : defaultServant.id);
  const selectedAttacker =
    master.servants.find((candidate) => candidate.id === selectedAttackerId) ?? defaultServant;
  const selectedBuild = profile.servantBuilds[selectedAttacker.id];
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
    const fingerprint = await portableCalculationFingerprint(request, async (data: Uint8Array) =>
      crypto.subtle.digest('SHA-256', new Uint8Array(data)),
    );
    const now = new Date().toISOString();
    await updateActiveProfile((current) => ({
      ...current,
      draft: {
        profileId: current.profileId,
        calculationSessionId: sessionId,
        request,
        result: nextResult,
        requestFingerprint: fingerprint,
        updatedAt: now,
      },
      updatedAt: now,
    }));
    setCalculation({ request, storedResult: nextResult, source: 'draft' });
  }

  async function savePortableDraft(
    request: PortableCalculationRequest,
    sessionId = calculationSessionId,
  ) {
    const outcome = executePortableCalculation(request, master);
    const nextResult =
      outcome.status === 'executed' || outcome.status === 'unsupported'
        ? outcome.execution.result
        : undefined;
    if (!nextResult) return outcome;
    await commitPortableDraft(request, nextResult, sessionId);
    return outcome;
  }

  async function saveScenarioDraft(scenario: CalculationScenario) {
    await savePortableDraft(replacePortableCalculationScenario(currentRequest, scenario));
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
    registerFinalizer(page === 'calculate' ? finalizeCurrentCalculation : null);
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

  if (page === 'home')
    return (
      <Home
        result={
          result?.status === 'calculated'
            ? (result.rows[
                (input?.npLevel ??
                  (currentScenario.mode === 'resolved' ? currentScenario.attacker.npLevel : 1)) - 1
              ]?.average ?? 0)
            : 0
        }
        attackerName={selectedAttacker.name}
        attackerImage={selectedAttacker.imageKey}
        owned={selectedBuild?.npLevel ? 1 : 0}
        hasHistory={profile.history.length > 0}
        onNavigate={(next) => void navigate(next)}
      />
    );

  if (page === 'ranking')
    return (
      <Ranking
        master={master}
        profile={{
          servantBuilds: profile.servantBuilds,
          craftEssences: profile.craftEssences,
          supportTemplates: profile.supportTemplates,
        }}
        versions={versions}
        onOpenCalculator={(detail) => {
          const sessionId = crypto.randomUUID();
          setCalculationSessionId(sessionId);
          void savePortableDraft(
            createRankingPortableRequest(detail, currentCalculationVersionContext(master)),
            sessionId,
          );
          replaceRoute('calculate');
        }}
      />
    );

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
