import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, portableCalculationRequestSchema } from '@fgo-lab/schema';
import {
  attemptPortableCalculationVersionUpgrade,
  createCalculatorPortableRequest,
  createRankingPortableRequest,
  currentCalculationVersionContext,
  executePortableCalculation,
  recoverPortableCalculation,
  resetPortableCalculationRequest,
  upgradePortableCalculationRequestVersion,
} from './portableCalculation';
import { createDefaultResolvedScenario } from './scenario';
import { calculateRankingPolicy } from './rankingPolicyCalculation';
import { DEFAULT_RANKING_POLICY_CONDITIONS, type RankingProfileInput } from './rankingContracts';

const master = masterSnapshotSchema.parse(fixture);
const versionContext = currentCalculationVersionContext(master);
const profile: RankingProfileInput = {
  servantBuilds: {},
  craftEssences: [],
  supportTemplates: [],
};
const versions = {
  schemaVersion: 33 as const,
  masterDataVersion: master.version,
  engineVersion: ENGINE_VERSION,
  appVersion: APP_VERSION,
  gameRegion: 'JP' as const,
  masterDataLocale: 'ja-JP' as const,
};

describe('portable calculation application owner', () => {
  it('constructs explicit calculator intent and preserves it across scenario edits', () => {
    const scenario = createDefaultResolvedScenario(master, undefined);
    const request = createCalculatorPortableRequest(scenario, versionContext);
    expect(request.executionIntent).toEqual({
      kind: 'resolved',
      origin: 'calculator',
      initialNpGauge: 10_000,
      contribution: 'standard',
    });
    expect(executePortableCalculation(request, master).status).toBe('executed');
  });

  it('reconstructs every selected ranking candidate from typed portable intent', () => {
    for (const selfBuffs of ['included', 'excluded'] as const)
      for (const conditionalEffects of ['baseline', 'satisfied'] as const) {
        const ranking = calculateRankingPolicy(
          master,
          profile,
          { ...DEFAULT_RANKING_POLICY_CONDITIONS, selfBuffs, conditionalEffects },
          versions,
        );
        for (const candidate of Object.values(ranking.profileResults)) {
          if (candidate.status !== 'calculated') continue;
          const request = createRankingPortableRequest(candidate.detail, versionContext);
          const outcome = executePortableCalculation(request, master);
          expect(outcome.status).toBe('executed');
          if (outcome.status !== 'executed') continue;
          expect(outcome.execution.result).toEqual(candidate.detail.result);
          expect(request.executionIntent).toMatchObject({
            origin: 'ranking',
            initialNpGauge: candidate.detail.candidateEvidence.startNpGauge,
            contribution: selfBuffs === 'excluded' ? 'excludeVoluntarySkillModifiers' : 'standard',
          });
        }
      }
  });

  it('fails closed on capacity and runtime version mismatches', () => {
    const scenario = createDefaultResolvedScenario(master, undefined);
    const request = createCalculatorPortableRequest(scenario, versionContext);
    if (request.scenario.mode !== 'resolved') throw new Error('resolved request expected');
    const rankingRequest = portableCalculationRequestSchema.parse({
      ...request,
      executionIntent: {
        kind: 'resolved' as const,
        origin: 'ranking' as const,
        initialNpGauge: 20_000,
        contribution: 'standard' as const,
      },
    });
    expect(executePortableCalculation(rankingRequest, master)).toMatchObject({
      status: 'invalid',
      reason: 'initialNpGaugeExceedsCapacity',
    });
    expect(
      executePortableCalculation(
        upgradePortableCalculationRequestVersion(request, {
          ...versionContext,
          engineVersion: 'unavailable-engine',
        }),
        master,
      ),
    ).toMatchObject({ status: 'invalid', reason: 'runtimeVersionMismatch' });
  });

  it('separates historical recovery, version upgrade, and ranking reset', () => {
    const detail = Object.values(
      calculateRankingPolicy(master, profile, DEFAULT_RANKING_POLICY_CONDITIONS, versions)
        .profileResults,
    ).find((candidate) => candidate.status === 'calculated');
    if (!detail) throw new Error('ranking detail missing');
    const request = createRankingPortableRequest(detail.detail, versionContext);
    const historicalRequest = upgradePortableCalculationRequestVersion(request, {
      masterDataVersion: 'old-master',
      engineVersion: 'old-engine',
    });
    const historicalResult = {
      ...detail.detail.result,
      versions: {
        ...detail.detail.result.versions,
        masterDataVersion: 'old-master',
        engineVersion: 'old-engine',
      },
    };
    expect(recoverPortableCalculation(historicalRequest, historicalResult, master)).toMatchObject({
      status: 'historicalOnly',
      reason: 'versionUnavailable',
    });
    const upgraded = upgradePortableCalculationRequestVersion(historicalRequest, versionContext);
    expect(upgraded.executionIntent).toEqual(request.executionIntent);
    const reset = resetPortableCalculationRequest(request);
    expect(reset.versionContext).toEqual(request.versionContext);
    expect(reset.executionIntent).toEqual({
      kind: 'resolved',
      origin: 'calculator',
      initialNpGauge: 10_000,
      contribution: 'standard',
    });
  });

  it('restores the same portable identity across app-only version changes', () => {
    const request = createCalculatorPortableRequest(
      createDefaultResolvedScenario(master, undefined),
      versionContext,
    );
    const outcome = executePortableCalculation(request, master);
    if (outcome.status !== 'executed') throw new Error('calculation must execute');
    expect(
      recoverPortableCalculation(
        request,
        {
          ...outcome.execution.result,
          versions: { ...outcome.execution.result.versions, appVersion: 'older-app' },
        },
        master,
      ).status,
    ).toBe('executed');
  });

  it('commits a current-version upgrade only after successful execution', () => {
    const currentRequest = createCalculatorPortableRequest(
      createDefaultResolvedScenario(master, undefined),
      versionContext,
    );
    const current = executePortableCalculation(currentRequest, master);
    if (current.status !== 'executed') throw new Error('current execution required');
    const retainedRequest = upgradePortableCalculationRequestVersion(currentRequest, {
      masterDataVersion: 'old-master',
      engineVersion: 'old-engine',
    });
    const retainedResult = {
      ...current.execution.result,
      versions: {
        ...current.execution.result.versions,
        masterDataVersion: 'old-master',
        engineVersion: 'old-engine',
      },
    };

    const attempt = attemptPortableCalculationVersionUpgrade(
      retainedRequest,
      retainedResult,
      versionContext,
      master,
    );

    expect(attempt).toMatchObject({
      status: 'committed',
      request: { versionContext },
      result: { versions: versionContext },
    });
  });

  it('retains the historical pair when a current-version upgrade is invalid', () => {
    const currentRequest = createCalculatorPortableRequest(
      createDefaultResolvedScenario(master, undefined),
      versionContext,
    );
    if (currentRequest.scenario.mode !== 'resolved') throw new Error('resolved request required');
    const retainedRequest = portableCalculationRequestSchema.parse({
      ...currentRequest,
      versionContext: { masterDataVersion: 'old-master', engineVersion: 'old-engine' },
      executionIntent: {
        kind: 'resolved',
        origin: 'ranking',
        initialNpGauge: 20_000,
        contribution: 'standard',
      },
    });
    const current = executePortableCalculation(currentRequest, master);
    if (current.status !== 'executed') throw new Error('current execution required');
    const retainedResult = {
      ...current.execution.result,
      versions: {
        ...current.execution.result.versions,
        masterDataVersion: 'old-master',
        engineVersion: 'old-engine',
      },
    };

    const attempt = attemptPortableCalculationVersionUpgrade(
      retainedRequest,
      retainedResult,
      versionContext,
      master,
    );

    expect(attempt).toMatchObject({
      status: 'rejected',
      retainedRequest,
      retainedResult,
      attemptedRequest: { versionContext },
      failure: { status: 'invalid', reason: 'initialNpGaugeExceedsCapacity' },
    });
  });

  it('retains the historical pair when current semantics are unsupported', () => {
    const currentRequest = createCalculatorPortableRequest(
      {
        ...createDefaultResolvedScenario(master, undefined),
        craftEssence: { craftEssenceId: 'missing', level: 1, limitBreak: 0 },
      },
      versionContext,
    );
    const retainedRequest = upgradePortableCalculationRequestVersion(currentRequest, {
      masterDataVersion: 'old-master',
      engineVersion: 'old-engine',
    });
    const baselineRequest = createCalculatorPortableRequest(
      createDefaultResolvedScenario(master, undefined),
      versionContext,
    );
    const baseline = executePortableCalculation(baselineRequest, master);
    if (baseline.status !== 'executed') throw new Error('baseline execution required');
    const retainedResult = {
      ...baseline.execution.result,
      versions: {
        ...baseline.execution.result.versions,
        masterDataVersion: 'old-master',
        engineVersion: 'old-engine',
      },
    };

    const attempt = attemptPortableCalculationVersionUpgrade(
      retainedRequest,
      retainedResult,
      versionContext,
      master,
    );

    expect(attempt).toMatchObject({
      status: 'rejected',
      retainedRequest,
      retainedResult,
      attemptedRequest: { versionContext },
      failure: { status: 'unsupported' },
    });
  });
});
