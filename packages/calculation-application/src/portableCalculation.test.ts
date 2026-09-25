import { rankingBasisFixture } from './rankingBasisFixture';
import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  APP_VERSION,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  portableCalculationRequestSchema,
  parseStoredProfileCollection,
  parseUserDataBackup,
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
  createCalculatorPortableRequestForAttackProfile,
} from './portableCalculation';
import {
  attackProfileForTerminalState,
  attackProfileKey,
  createStaticActorFormProfiles,
} from './attackProfile';
import { planPreNoblePhantasmCandidates } from './preNoblePhantasmPlanner';
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

  it('constructs a normal calculator request for the selected AttackProfile', () => {
    const ranking = calculateRankingPolicy(
      master,
      profile,
      DEFAULT_RANKING_POLICY_CONDITIONS,
      versions,
    );
    const selected = Object.values(ranking.profileResults).find(
      (candidate) => candidate.status === 'calculated',
    );
    if (!selected) throw new Error('calculated profile missing');
    const servant = master.servants.find(({ id }) => id === selected.detail.servantId);
    if (!servant) throw new Error('servant missing');
    const request = createCalculatorPortableRequestForAttackProfile(
      master,
      undefined,
      servant,
      selected.detail.attackProfile,
    );
    expect(request.executionIntent).toEqual({ kind: 'calculator', initialNpGauge: 10_000 });
    if (request.scenario.mode !== 'resolved') throw new Error('resolved request required');
    const planned = planPreNoblePhantasmCandidates(servant, master.npResourceSemantics, 1, 1);
    const profiles = createStaticActorFormProfiles(servant);
    const expected = planned.candidates.find((candidate) => {
      try {
        return (
          attackProfileKey(
            attackProfileForTerminalState(servant, profiles, candidate.terminalState),
          ) === attackProfileKey(selected.detail.attackProfile)
        );
      } catch {
        return false;
      }
    });
    expect(expected).toBeDefined();
    expect(request.scenario.preNoblePhantasmPlan).toEqual(expected?.commands);
    expect(executePortableCalculation(request, master).status).toBe('executed');
  });

  it('changes initial OC and calculator start NP together while reset permits a retained scenario OC', () => {
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
    ).toBe(true);
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

    const reset = attemptPortableCalculationReset(request, retainedResult, missingMaster);
    expect(reset).toMatchObject({
      status: 'rejected',
      retainedRequest: request,
      retainedResult,
      failure: { status: 'invalid', reason: 'attackerLevelStatUnavailable' },
    });

    const historicalRequest = upgradePortableCalculationRequestVersion(request, {
      schemaVersion: SCHEMA_VERSION,
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
      schemaVersion: SCHEMA_VERSION,
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
        battleState: { battlePointPhase: 3 },
        canonicalInputValues: {
          'ranking:quantity': { kind: 'integer', value: 3, origin: 'maximum' },
        },
        preNoblePhantasmPlan: [
          {
            kind: 'useSkillSlot',
            slot: 1,
            skillLevel: 1,
            choice: {
              groupKey: 'ranking-choice',
              candidateKey: 'ranking-candidate',
            },
          },
          { kind: 'executeAttackNoblePhantasm' },
        ],
        effectDecisions: [
          {
            decisionKey: 'ranking:effect',
            operationEnabled: true,
            conditionSatisfaction: 'assumeSatisfied',
          },
        ],
        activationFacts: [
          {
            kind: 'operationTrigger',
            source: {
              origin: 'attacker',
              sourceInstanceId: 'ranking:action',
              skillId: 'ranking:skill',
            },
            position: 0,
          },
        ],
        worldFactAssertions: [
          {
            decisionKey: 'ranking:target',
            fact: { kind: 'trait', scope: 'target', trait: 'chaotic', present: true },
          },
          {
            decisionKey: 'ranking:hp',
            fact: { kind: 'quantity', quantity: 'attackerHpPermille', value: 123 },
          },
        ],
        explicitOverrides: { attackerAtk: 1234 },
      },
    });
    const historicalContaminated = portableCalculationRequestSchema.parse({
      ...contaminated,
      versionContext: historicalRequest.versionContext,
    });
    const reset = resetPortableCalculationRequest(historicalContaminated);
    expect(reset.versionContext).toEqual(historicalContaminated.versionContext);
    expect(reset.executionIntent).toEqual({
      kind: 'calculator',
      initialNpGauge: 10_000,
    });
    expect(reset.scenario).toEqual(historicalContaminated.scenario);
    expect(reset.executionIntent).not.toHaveProperty('policy');
    expect(reset.executionIntent).not.toHaveProperty('basis');
  });

  it('resolves reset from the retained request subject and ignores any other selected build', () => {
    const retainedRequest = createCalculatorPortableRequest(
      createDefaultResolvedScenario(master, undefined),
      versionContext,
    );
    const retained = executePortableCalculation(retainedRequest, master);
    if (retained.status !== 'executed') throw new Error('retained result required');
    if (retainedRequest.scenario.mode !== 'resolved') throw new Error('resolved request required');
    const attempt = attemptPortableCalculationReset(
      retainedRequest,
      retained.execution.result,
      master,
    );

    expect(attempt.status).toBe('committed');
    if (attempt.status !== 'committed' || attempt.request.scenario.mode !== 'resolved') return;
    expect(attempt.request.scenario.attacker).toEqual(retainedRequest.scenario.attacker);
  });

  it('keeps a nonbaseline scenario while normalizing calculator execution to NP100 and OC1', () => {
    const scenario = {
      ...createDefaultResolvedScenario(master, undefined),
      initialOvercharge: 2 as const,
    };
    const request = createCalculatorPortableRequest(scenario, versionContext);
    const reset = resetPortableCalculationRequest(request);
    expect(reset.versionContext).toEqual(request.versionContext);
    expect(reset.scenario).toEqual(request.scenario);
    expect(reset.executionIntent).toEqual({ kind: 'calculator', initialNpGauge: 10_000 });
    const outcome = executePortableCalculation(reset, master);
    expect(outcome.status).toBe('executed');
    if (outcome.status !== 'executed') return;
    expect(outcome.execution.appliedPreparationActions.at(-1)?.ocUse).toMatchObject({
      gaugeBefore: 10_000,
      baseOc: 1,
    });
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
      schemaVersion: SCHEMA_VERSION,
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
      versionContext: {
        schemaVersion: SCHEMA_VERSION,
        masterDataVersion: 'old-master',
        engineVersion: 'old-engine',
      },
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

  it('retains the historical pair when current equipment cannot resolve initial HP', () => {
    const currentRequest = createCalculatorPortableRequest(
      {
        ...createDefaultResolvedScenario(master, undefined),
        craftEssence: { craftEssenceId: 'missing', level: 1, limitBreak: 0 },
      },
      versionContext,
    );
    const retainedRequest = upgradePortableCalculationRequestVersion(currentRequest, {
      schemaVersion: SCHEMA_VERSION,
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
      failure: { status: 'invalid', reason: 'initialHpUnavailable' },
    });
  });
});

it('retains schema 38 ranking history with its exact initial OC basis and old engine identity', () => {
  const ranking = calculateRankingPolicy(
    master,
    profile,
    DEFAULT_RANKING_POLICY_CONDITIONS,
    versions,
  );
  const selected = Object.values(ranking.profileResults).find(
    (candidate) => candidate.status === 'calculated',
  );
  if (selected?.status !== 'calculated') throw new Error('fixture ranking unavailable');
  const currentRequest = createRankingPortableRequest(selected.detail, {
    ...versionContext,
    engineVersion: '37.0.0',
  });
  if (currentRequest.scenario.mode !== 'resolved')
    throw new Error('resolved ranking request required');
  const request = {
    ...currentRequest,
    versionContext: {
      masterDataVersion: currentRequest.versionContext.masterDataVersion,
      engineVersion: currentRequest.versionContext.engineVersion,
    },
    scenario: Object.fromEntries(
      Object.entries(currentRequest.scenario).filter(
        ([key]) => key !== 'enemyDefenseBuff' && key !== 'initialBattlePointPoints',
      ),
    ),
  };
  const profileId = '00000000-0000-4000-8000-000000000046';
  const timestamp = '2026-09-09T00:00:00.000Z';
  const snapshot = {
    profileId,
    calculationSessionId: '00000000-0000-4000-8000-000000000047',
    request,
    result: {
      ...selected.detail.result,
      versions: { ...versions, schemaVersion: 38, engineVersion: '37.0.0' },
    },
    requestFingerprint: 'a'.repeat(64),
    updatedAt: timestamp,
  };
  const collection = {
    schemaVersion: 38,
    activeProfileId: profileId,
    profiles: [
      {
        profileId,
        name: 'fixture',
        createdAt: timestamp,
        updatedAt: timestamp,
        servantBuilds: {},
        servantTargets: {},
        craftEssences: [],
        supportTemplates: [],
        draft: snapshot,
        history: [
          {
            ...snapshot,
            historyId: '00000000-0000-4000-8000-000000000048',
            finalizedAt: timestamp,
            lastUsedAt: timestamp,
          },
        ],
      },
    ],
  };
  const contradictory = structuredClone(collection);
  Object.assign(contradictory.profiles[0]!.draft.result, {
    status: 'unavailable',
    rows: [],
    reason: 'insufficientNpGauge',
  });
  expect(() => parseStoredProfileCollection(contradictory)).toThrow();
  const migrated = parseStoredProfileCollection(collection);
  expect(migrated.collection.profiles[0]).toMatchObject({
    draft: null,
    history: [
      {
        disposition: 'historicalOnly',
        sourceSchemaVersion: 38,
        legacyRankingIntent: request.executionIntent,
        scenario: request.scenario,
        result: { versions: { schemaVersion: SCHEMA_VERSION, engineVersion: '37.0.0' } },
      },
    ],
  });
  expect(
    parseUserDataBackup({
      kind: 'fgo-lab-user-backup',
      schemaVersion: 38,
      exportedAt: timestamp,
      appVersion: APP_VERSION,
      profiles: collection,
    }).profiles,
  ).toEqual(migrated.collection);
});
