// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../../packages/test-fixtures/master/fixture.json';
import { activeServantSkillSchema, masterSnapshotSchema } from '@fgo-lab/master-data';
import { createProfileCollection } from '@fgo-lab/profile-domain';
import {
  calculateRankingPolicy,
  currentCalculationVersionContext,
  DEFAULT_RANKING_POLICY_CONDITIONS,
} from '@fgo-lab/calculation-application';
import { APP_VERSION, servantBuildSchema } from '@fgo-lab/schema';
import { useRanking } from '../features/ranking/useRanking';
import { RankingRoute } from './RankingRoute';
import { createCalculationMutationGate, type UpdateActiveProfile } from './portableDraft';
import { rankingResponseFixture } from '../features/ranking/rankingResponseFixture';

vi.mock('../features/ranking/useRanking', () => ({ useRanking: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('AttackProfile calculator recovery', () => {
  it('shows missing saved growth and opens the existing editor without overwriting the calculation', async () => {
    const source = masterSnapshotSchema.parse(fixture);
    const actor = source.servants[0]!;
    const skill = activeServantSkillSchema.parse({
      id: 'route-skill',
      slot: 1,
      priority: 0,
      name: 'route-skill',
      detail: '',
      imageKey: null,
      resourceRequirement: null,
      effects: [],
    });
    const master = masterSnapshotSchema.parse({
      ...source,
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
    const profile = createProfileCollection(
      'recovery',
      { now: () => new Date('2026-10-04T00:00:00.000Z') },
      { next: () => '00000000-0000-4000-8000-000000000001' },
    ).profiles[0]!;
    profile.servantBuilds[actor.id] = servantBuildSchema.parse({
      servantId: actor.id,
      level: 90,
      ascension: 4,
      npLevel: 1,
      fouAtk: 1234,
      skills: {},
      appends: {},
      updatedAt: '2026-10-04T00:00:00.000Z',
    });
    const row = calculateRankingPolicy(
      master,
      { servantBuilds: {} },
      DEFAULT_RANKING_POLICY_CONDITIONS,
      {
        ...currentCalculationVersionContext(master),
        appVersion: APP_VERSION,
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
      },
    ).rows[0]!;
    vi.mocked(useRanking).mockReturnValue({
      rows: [],
      exclusions: [
        {
          entryId: row.entryId,
          servantId: row.servantId,
          name: row.name,
          attackProfile: row.attackProfile,
          status: 'inputRequired',
          reason: 'inputRequired:target.hp',
          requiredInputs: [],
          issues: [],
          recovery: { kind: 'openCalculator' },
        },
      ],
      fingerprint: '',
      error: '',
      errorIdentity: '',
      details: {},
      detailErrors: {},
      requestDetail: vi.fn(),
      clearDetail: vi.fn(),
      loading: false,
    });
    const setCalculation = vi.fn();
    const setCalculationSessionId = vi.fn();
    const updateActiveProfile = vi.fn();
    const replaceRoute = vi.fn();
    const retained = structuredClone(profile);
    const view = render(
      <RankingRoute
        master={master}
        profile={profile}
        setCalculation={setCalculation}
        setCalculationSessionId={setCalculationSessionId}
        updateActiveProfile={updateActiveProfile}
        replaceRoute={replaceRoute}
        calculationMutation={createCalculationMutationGate()}
      />,
    );
    fireEvent.click(view.getByText('順位外 1件', { selector: 'summary' }));
    fireEvent.click(view.getByRole('button', { name: '通常の計算機で入力を補う' }));
    await waitFor(() =>
      expect(view.getByRole('alert').textContent).toContain('保存育成が不足または不正'),
    );
    expect(profile).toEqual(retained);
    for (const writer of [
      setCalculation,
      setCalculationSessionId,
      updateActiveProfile,
      replaceRoute,
    ])
      expect(writer).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole('button', { name: '保存育成を編集' }));
    expect(replaceRoute).toHaveBeenCalledWith('servants');
  });
});

function calculatedRouteProps() {
  const source = rankingResponseFixture();
  const profile = createProfileCollection(
    'handoff',
    { now: () => new Date('2026-10-04T00:00:00.000Z') },
    { next: () => '00000000-0000-4000-8000-000000000001' },
  ).profiles[0]!;
  vi.mocked(useRanking).mockReturnValue({
    rows: source.summary.rows,
    exclusions: [],
    fingerprint: '',
    error: '',
    errorIdentity: '',
    details: { [source.detail.entryId]: source.detail.detail },
    detailErrors: {},
    requestDetail: vi.fn(),
    clearDetail: vi.fn(),
    loading: false,
  });
  return {
    master: source.master,
    profile,
    setCalculation: vi.fn(),
    setCalculationSessionId: vi.fn(),
    updateActiveProfile: vi.fn<UpdateActiveProfile>(),
    replaceRoute: vi.fn(),
    calculationMutation: createCalculationMutationGate(),
  };
}

describe('current and stale ranking handoff publication', () => {
  it('shows a durable failure for the calculated detail without publishing workspace, session or route', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const props = calculatedRouteProps();
    const retained = structuredClone(props.profile);
    props.updateActiveProfile.mockRejectedValue(new Error('durable-write-failed'));
    const view = render(<RankingRoute {...props} />);
    fireEvent.click(view.getAllByRole('button', { name: /の計算詳細を開く/ })[0]!);
    fireEvent.click(await view.findByRole('button', { name: '同じ条件で計算機を開く' }));
    await waitFor(() => expect(view.getByRole('alert').textContent).toContain('引継ぎに失敗'));
    expect(props.updateActiveProfile).toHaveBeenCalledOnce();
    expect(props.profile).toEqual(retained);
    for (const writer of [props.setCalculation, props.setCalculationSessionId, props.replaceRoute])
      expect(writer).not.toHaveBeenCalled();
  });

  it.each(['committed', 'failed'] as const)(
    'rejects stale %s completion after saved growth changes',
    async (completion) => {
      vi.stubGlobal('crypto', webcrypto);
      const props = calculatedRouteProps();
      let complete!: (value: { status: 'committed' }) => void;
      let fail!: (error: Error) => void;
      const pendingWrite = new Promise<Awaited<ReturnType<UpdateActiveProfile>>>(
        (resolve, reject) => {
          complete = resolve;
          fail = reject;
        },
      );
      props.updateActiveProfile.mockReturnValue(pendingWrite);
      const view = render(<RankingRoute {...props} />);
      fireEvent.click(view.getAllByRole('button', { name: /の計算詳細を開く/ })[0]!);
      fireEvent.click(await view.findByRole('button', { name: '同じ条件で計算機を開く' }));
      await waitFor(() => expect(props.updateActiveProfile).toHaveBeenCalledOnce());
      const guard = props.updateActiveProfile.mock.calls[0]![1]!;
      expect(guard.isCurrent()).toBe(true);
      const actor = props.master.servants[0]!;
      view.rerender(
        <RankingRoute
          {...props}
          profile={{
            ...props.profile,
            servantBuilds: {
              [actor.id]: servantBuildSchema.parse({
                servantId: actor.id,
                level: 90,
                ascension: 4,
                npLevel: 2,
                fouAtk: 1234,
                skills: {},
                appends: {},
                updatedAt: '2026-10-04T00:00:00.000Z',
              }),
            },
          }}
        />,
      );
      expect(guard.signal.aborted).toBe(true);
      expect(guard.isCurrent()).toBe(false);
      await act(async () => {
        if (completion === 'committed') complete({ status: 'committed' });
        else fail(new Error('late-write-failure'));
        await pendingWrite.catch(() => undefined);
      });
      expect(view.queryByRole('alert')).toBeNull();
      for (const writer of [
        props.setCalculation,
        props.setCalculationSessionId,
        props.replaceRoute,
      ])
        expect(writer).not.toHaveBeenCalled();
    },
  );
});
