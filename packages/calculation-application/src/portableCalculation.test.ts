import { rankingBasisFixture } from './rankingBasisFixture';
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
  replacePortableCalculationScenario,
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
};
const versions = {
  schemaVersion: SCHEMA_VERSION,
  masterDataVersion: master.version,
  engineVersion: ENGINE_VERSION,
  appVersion: APP_VERSION,
  gameRegion: 'JP' as const,
  masterDataLocale: 'ja-JP' as const,
};

function withoutScenarioLevelStat(request: ReturnType<typeof createCalculatorPortableRequest>) {
  if (request.scenario.mode !== 'resolved') throw new Error('resolved request required');
  const { servantId, level } = request.scenario.attacker;
  return masterSnapshotSchema.parse({
    ...master,
    servants: master.servants.map((servant) =>
      servant.id === servantId
        ? {
            ...servant,
            atkByLevel: Object.fromEntries(
              Object.entries(servant.atkByLevel).filter(([key]) => key !== String(level)),
            ),
          }
        : servant,
    ),
  });
}

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

  it('changes initial OC and calculator start NP together, rejecting contradictory payloads', () => {
    const initial = createDefaultResolvedScenario(master, undefined);
    const request = createCalculatorPortableRequest(initial, versionContext);
    const changed = replacePortableCalculationScenario(request, {
      ...initial,
      attacker: { ...initial.attacker, npLevel: 2 },
      initialOvercharge: 2,
    });
    expect(changed.executionIntent).toEqual({ kind: 'calculator', initialNpGauge: 20000 });
    const executed = executePortableCalculation(changed, master);
    expect(executed.status).toBe('executed');
    if (executed.status !== 'executed') return;
    expect(executed.execution.appliedPreparationActions.at(-1)?.ocUse).toMatchObject({
      gaugeBefore: 20000,
      baseOc: 2,
      effectiveOc: 2,
    });
    expect(
      portableCalculationRequestSchema.safeParse({
        ...changed,
        executionIntent: { kind: 'calculator', initialNpGauge: 10000 },
      }).success,
    ).toBe(false);
    expect(
      portableCalculationRequestSchema.safeParse({
        ...changed,
        scenario: { ...changed.scenario, overcharge: 2 },
      }).success,
    ).toBe(false);
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
      scenario: { ...request.scenario, initialOvercharge: 2 },
      executionIntent: {
        kind: 'ranking' as const,
        initialNpGauge: 20_000,
        policy: { ...DEFAULT_RANKING_POLICY_CONDITIONS, initialOvercharge: 2 },
        basis: { ...rankingBasisFixture(master.servants[0]!), initialOvercharge: 2 },
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

  it('retains portable state when the exact attacker level stat is unavailable', () => {
    const request = createCalculatorPortableRequest(
      createDefaultResolvedScenario(master, undefined),
      versionContext,
    );
    const baseline = executePortableCalculation(request, master);
    if (baseline.status !== 'executed' || request.scenario.mode !== 'resolved')
      throw new Error('baseline execution required');
    const missingMaster = withoutScenarioLevelStat(request);
    const retainedResult = baseline.execution.result;

    expect(executePortableCalculation(request, missingMaster)).toMatchObject({
      status: 'invalid',
      reason: 'attackerLevelStatUnavailable',
      request,
    });
    expect(recoverPortableCalculation(request, retainedResult, missingMaster)).toMatchObject({
      status: 'invalid',
      reason: 'attackerLevelStatUnavailable',
      request,
    });

    const reset = attemptPortableCalculationReset(request, retainedResult, missingMaster, {
      [request.scenario.attacker.servantId]: {
        servantId: request.scenario.attacker.servantId,
        level: request.scenario.attacker.level,
        ascension: 4,
        npLevel: 1,
        fouAtk: 1_000,
        skills: {},
        appends: {},
        updatedAt: '2026-09-05T00:00:00.000Z',
      },
    });
    expect(reset).toMatchObject({
      status: 'rejected',
      retainedRequest: request,
      retainedResult,
      failure: { status: 'invalid', reason: 'attackerLevelStatUnavailable' },
    });

    const historicalRequest = upgradePortableCalculationRequestVersion(request, {
      masterDataVersion: 'old-master',
      engineVersion: 'old-engine',
    });
    const historicalResult = {
      ...retainedResult,
      versions: {
        ...retainedResult.versions,
        masterDataVersion: 'old-master',
        engineVersion: 'old-engine',
      },
    };
    expect(
      attemptPortableCalculationVersionUpgrade(
        historicalRequest,
        historicalResult,
        versionContext,
        missingMaster,
      ),
    ).toMatchObject({
      status: 'rejected',
      retainedRequest: historicalRequest,
      retainedResult: historicalResult,
      failure: { status: 'invalid', reason: 'attackerLevelStatUnavailable' },
    });
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
      scenario: { ...currentRequest.scenario, initialOvercharge: 2 },
      executionIntent: {
        kind: 'ranking',
        initialNpGauge: 20_000,
        policy: { ...DEFAULT_RANKING_POLICY_CONDITIONS, initialOvercharge: 2 },
        basis: { ...rankingBasisFixture(master.servants[0]!), initialOvercharge: 2 },
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
