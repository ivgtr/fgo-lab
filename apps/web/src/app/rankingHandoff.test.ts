import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../../packages/test-fixtures/master/fixture.json';
import {
  activeServantSkillSchema,
  masterSnapshotSchema,
  type MasterDataSnapshot,
} from '@fgo-lab/master-data';
import { createProfileCollection } from '@fgo-lab/profile-domain';
import {
  calculateRankingPolicy,
  DEFAULT_RANKING_POLICY_CONDITIONS,
} from '@fgo-lab/calculation-application';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION, servantBuildSchema } from '@fgo-lab/schema';
import {
  handoffRankingCalculation,
  handoffRankingAttackProfileCalculation,
} from './rankingHandoff';
import { createCalculationMutationGate, type UpdateActiveProfile } from './portableDraft';

const master = masterSnapshotSchema.parse(fixture);
const sessionId = '00000000-0000-4000-8000-000000000046';

function calculatedRankingDetail(snapshot: MasterDataSnapshot = master) {
  const ranking = calculateRankingPolicy(
    snapshot,
    { servantBuilds: {} },
    DEFAULT_RANKING_POLICY_CONDITIONS,
    {
      schemaVersion: SCHEMA_VERSION,
      masterDataVersion: snapshot.version,
      engineVersion: ENGINE_VERSION,
      appVersion: APP_VERSION,
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
    },
  );
  const result = Object.values(ranking.profileResults).find(
    (candidate) => candidate.status === 'calculated',
  );
  if (!result) throw new Error('ranking detail required');
  return result.detail;
}

describe('ranking handoff', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rejects an incomplete owned AttackProfile handoff without touching any writer', async () => {
    const skill = activeServantSkillSchema.parse({
      id: 'handoff-skill',
      slot: 1,
      priority: 0,
      name: 'handoff-skill',
      detail: '',
      imageKey: null,
      resourceRequirement: null,
      effects: [],
    });
    const actor = master.servants[0]!;
    const snapshot = masterSnapshotSchema.parse({
      ...master,
      servants: [
        {
          ...actor,
          skills: [skill],
          actorFormGraph: {
            ...actor.actorFormGraph,
            forms: actor.actorFormGraph.forms.map((form) => ({ ...form, skillIds: [skill.id] })),
          },
        },
      ],
    });
    const detail = calculatedRankingDetail(snapshot);
    const build = servantBuildSchema.parse({
      servantId: actor.id,
      level: 90,
      ascension: 4,
      npLevel: 1,
      fouAtk: 1234,
      skills: {},
      appends: {},
      updatedAt: '2026-10-04T00:00:00.000Z',
    });
    const profile = { servantBuilds: { [actor.id]: build } };
    const retained = structuredClone(profile);
    const setCalculation = vi.fn();
    const setCalculationSessionId = vi.fn();
    const updateActiveProfile = vi.fn();
    const replaceRoute = vi.fn();
    const randomUUID = vi.spyOn(crypto, 'randomUUID');
    const outcome = await handoffRankingAttackProfileCalculation({
      servantId: actor.id,
      attackProfile: detail.attackProfile,
      master: snapshot,
      profile,
      setCalculation,
      setCalculationSessionId,
      updateActiveProfile,
      replaceRoute,
      calculationMutation: createCalculationMutationGate(),
    });
    expect(outcome).toEqual({ status: 'rejected', reason: 'servantBuildIncomplete' });
    expect(profile).toEqual(retained);
    for (const writer of [
      setCalculation,
      setCalculationSessionId,
      updateActiveProfile,
      replaceRoute,
      randomUUID,
    ])
      expect(writer).not.toHaveBeenCalled();
  });

  it('retains every handoff writer and the current page when level preparation is invalid', async () => {
    const detail = calculatedRankingDetail();
    const { servantId, level } = detail.scenario.attacker;
    const missingMaster = masterSnapshotSchema.parse({
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
    const setCalculation = vi.fn();
    const setCalculationSessionId = vi.fn();
    const updateActiveProfile = vi.fn();
    const replaceRoute = vi.fn();
    const mutation = createCalculationMutationGate();
    const randomUUID = vi.spyOn(crypto, 'randomUUID').mockReturnValue(sessionId);

    const outcome = await handoffRankingCalculation({
      detail,
      master: missingMaster,
      setCalculation,
      setCalculationSessionId,
      updateActiveProfile,
      replaceRoute,
      calculationMutation: mutation,
    });

    expect(outcome).toMatchObject({
      status: 'invalid',
      reason: 'attackerLevelStatUnavailable',
    });
    expect(updateActiveProfile).not.toHaveBeenCalled();
    expect(setCalculation).not.toHaveBeenCalled();
    expect(setCalculationSessionId).not.toHaveBeenCalled();
    expect(replaceRoute).not.toHaveBeenCalled();
    expect(randomUUID).not.toHaveBeenCalled();
  });

  it('commits one matching durable draft, workspace, session, and route in order', async () => {
    const detail = calculatedRankingDetail();
    const profile = createProfileCollection(
      'ranking handoff',
      { now: () => new Date('2026-09-05T00:00:00.000Z') },
      { next: () => '00000000-0000-4000-8000-000000000001' },
    ).profiles[0]!;
    const events: string[] = [];
    let committedProfile = profile;
    const updateActiveProfile = vi.fn<UpdateActiveProfile>((update) => {
      committedProfile = update(profile);
      events.push('durable');
      return Promise.resolve({ status: 'committed' });
    });
    const setCalculation = vi.fn(() => events.push('workspace'));
    const setCalculationSessionId = vi.fn(() => events.push('session'));
    const replaceRoute = vi.fn(() => events.push('route'));
    const mutation = createCalculationMutationGate();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(sessionId);

    const outcome = await handoffRankingCalculation({
      detail,
      master,
      setCalculation,
      setCalculationSessionId,
      updateActiveProfile,
      replaceRoute,
      calculationMutation: mutation,
    });

    expect(outcome.status).toBe('executed');
    if (outcome.status !== 'executed') throw new Error('executed handoff required');
    expect(committedProfile.draft).toMatchObject({
      calculationSessionId: sessionId,
      request: outcome.request,
      result: outcome.execution.result,
    });
    expect(setCalculation).toHaveBeenCalledWith({
      request: outcome.request,
      storedResult: outcome.execution.result,
      source: 'draft',
    });
    expect(setCalculationSessionId).toHaveBeenCalledWith(sessionId);
    expect(replaceRoute).toHaveBeenCalledWith('calculate');
    expect(events).toEqual(['durable', 'workspace', 'session', 'route']);
  });

  it('does not publish session, workspace, or route when the durable commit fails', async () => {
    const updateActiveProfile = vi.fn().mockRejectedValue(new Error('durable-write-failed'));
    const setCalculation = vi.fn();
    const setCalculationSessionId = vi.fn();
    const replaceRoute = vi.fn();
    const mutation = createCalculationMutationGate();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(sessionId);

    await expect(
      handoffRankingCalculation({
        detail: calculatedRankingDetail(),
        master,
        setCalculation,
        setCalculationSessionId,
        updateActiveProfile,
        replaceRoute,
        calculationMutation: mutation,
      }),
    ).rejects.toThrow('durable-write-failed');

    expect(setCalculation).not.toHaveBeenCalled();
    expect(setCalculationSessionId).not.toHaveBeenCalled();
    expect(replaceRoute).not.toHaveBeenCalled();
  });
});
