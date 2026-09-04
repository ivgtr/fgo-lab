import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  APP_VERSION,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  portableCalculationRequestSchema,
} from '@fgo-lab/schema';
import {
  attemptPortableCalculationVersionUpgrade,
  attemptPortableCalculationReset,
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
  schemaVersion: SCHEMA_VERSION,
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
      kind: 'calculator',
      initialNpGauge: 10_000,
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
            kind: 'ranking',
            initialNpGauge: candidate.detail.candidateEvidence.startNpGauge,
            policy: { selfBuffs, conditionalEffects },
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
        kind: 'ranking' as const,
        initialNpGauge: 20_000,
        policy: { selfBuffs: 'included' as const, conditionalEffects: 'baseline' as const },
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
    const contaminated = portableCalculationRequestSchema.parse({
      ...request,
      scenario: {
        ...request.scenario,
        attackerHpPermille: 123,
        worldFactAssertions: [
          {
            decisionKey: 'ranking:hp',
            fact: { kind: 'quantity', quantity: 'attackerHpPermille', value: 123 },
          },
        ],
      },
    });
    const historicalContaminated = portableCalculationRequestSchema.parse({
      ...contaminated,
      versionContext: historicalRequest.versionContext,
    });
    const reset = resetPortableCalculationRequest(
      historicalContaminated,
      master,
      undefined,
      master.servants[0]!,
    );
    expect(reset.versionContext).toEqual(currentCalculationVersionContext(master));
    expect(reset.executionIntent).toEqual({
      kind: 'calculator',
      initialNpGauge: 10_000,
    });
    expect(reset.scenario).toMatchObject({
      attackerHpPermille: 1_000,
      canonicalInputValues: {},
      activationFacts: [],
      worldFactAssertions: [],
      preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' }],
    });
  });

  it('resolves reset from the retained request subject and ignores any other selected build', () => {
    const retainedRequest = createCalculatorPortableRequest(
      createDefaultResolvedScenario(master, undefined),
      versionContext,
    );
    const retained = executePortableCalculation(retainedRequest, master);
    if (retained.status !== 'executed') throw new Error('retained result required');
    if (retainedRequest.scenario.mode !== 'resolved') throw new Error('resolved request required');
    const retainedId = retainedRequest.scenario.attacker.servantId;
    const unrelatedId = 'mutable-ui-selection';
    const attempt = attemptPortableCalculationReset(
      retainedRequest,
      retained.execution.result,
      master,
      {
        [retainedId]: {
          servantId: retainedId,
          level: 1,
          ascension: 0,
          npLevel: 1,
          fouAtk: 0,
          skills: {},
          appends: {},
          updatedAt: '2026-09-04T00:00:00.000Z',
        },
        [unrelatedId]: {
          servantId: unrelatedId,
          level: 120,
          ascension: 4,
          npLevel: 5,
          fouAtk: 3_000,
          skills: {},
          appends: {},
          updatedAt: '2026-09-04T00:00:00.000Z',
        },
      },
    );

    expect(attempt.status).toBe('committed');
    if (attempt.status !== 'committed' || attempt.request.scenario.mode !== 'resolved') return;
    expect(attempt.request.scenario.attacker).toMatchObject({ servantId: retainedId, level: 1 });
  });

  it('rejects a missing retained request subject before constructing a reset', () => {
    const retainedRequest = createCalculatorPortableRequest(
      createDefaultResolvedScenario(master, undefined),
      versionContext,
    );
    const retained = executePortableCalculation(retainedRequest, master);
    if (retained.status !== 'executed' || retainedRequest.scenario.mode !== 'resolved')
      throw new Error('retained result required');
    const missingRequest = portableCalculationRequestSchema.parse({
      ...retainedRequest,
      scenario: {
        ...retainedRequest.scenario,
        attacker: { ...retainedRequest.scenario.attacker, servantId: 'missing-retained-servant' },
      },
    });

    const attempt = attemptPortableCalculationReset(
      missingRequest,
      retained.execution.result,
      master,
      {},
    );

    expect(attempt).toMatchObject({
      status: 'rejected',
      retainedRequest: missingRequest,
      retainedResult: retained.execution.result,
      attemptedRequest: null,
      failure: {
        status: 'invalid',
        reason: 'scenarioInvalid',
        detail: 'retained_request_subject_unavailable',
      },
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
        kind: 'ranking',
        initialNpGauge: 20_000,
        policy: { selfBuffs: 'included', conditionalEffects: 'baseline' },
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
