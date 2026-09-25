// @vitest-environment jsdom
import { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { createProfileCollection } from '@fgo-lab/profile-domain';
import {
  historicalCalculationDraftV40Schema,
  historicalCalculationHistoryEntrySchema,
  portableCalculationRequestV40Schema,
  type LocalProfile,
} from '@fgo-lab/schema';
import {
  createDefaultCalculatorPortableRequest,
  executePortableCalculation,
} from '@fgo-lab/calculation-application';
import {
  canonicalize,
  finalizeHistory,
  portableCalculationFingerprint,
} from '@fgo-lab/workspace-domain';
import fixture from '../../../../packages/test-fixtures/master/fixture.json';
import { CalculatorRoute } from './CalculatorRoute';
import type { CalculationWorkspace } from './App';

const master = masterSnapshotSchema.parse({
  ...fixture,
  servants: [
    fixture.servants[0],
    JSON.parse(
      JSON.stringify(fixture.servants[0])
        .replaceAll('fixture-saber', 'fixture-second')
        .replaceAll('検証用セイバー', '別の検証役'),
    ),
  ],
});
const now = '2026-09-08T00:00:00.000Z';
const sessionA = '00000000-0000-4000-8000-000000000001';
const sessionB = '00000000-0000-4000-8000-000000000002';
const requestA = createDefaultCalculatorPortableRequest(master, undefined, master.servants[0]);
const requestB = createDefaultCalculatorPortableRequest(master, undefined, master.servants[1]);
function resultFor(request: typeof requestA) {
  const outcome = executePortableCalculation(request, master);
  if (outcome.status !== 'executed') throw new Error(outcome.status);
  return outcome.execution.result;
}
const resultA = resultFor(requestA);
const resultB = resultFor(requestB);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function setup(
  kind: 'historicalOnly' | 'current',
  failure?: 'missingSubject' | 'missingLevel',
) {
  const fingerprint = (request: typeof requestA) =>
    portableCalculationFingerprint(request, (bytes) =>
      crypto.subtle.digest('SHA-256', new Uint8Array(bytes)),
    );
  const base = createProfileCollection(
    'history',
    { now: () => new Date(now) },
    { next: () => sessionA },
  ).profiles[0]!;
  const currentB = finalizeHistory(base, {
    sessionId: sessionB,
    request: requestB,
    result: resultB,
    fingerprint: await fingerprint(requestB),
    now,
    historyId: sessionB,
  }).history[0]!;
  if (requestB.scenario.mode !== 'resolved') throw new Error('resolved fixture required');
  const { initialOvercharge, enemyDefenseBuff, initialBattlePointPoints, ...legacyScenario } =
    requestB.scenario;
  expect(initialOvercharge).toBe(1);
  expect(enemyDefenseBuff).toBe(0);
  expect(initialBattlePointPoints).toEqual({});
  const entryB =
    kind === 'current'
      ? currentB
      : historicalCalculationHistoryEntrySchema.parse({
          ...currentB,
          disposition: 'historicalOnly',
          sourceSchemaVersion: 37,
          legacyResultSchemaVersion: 37,
          scenario: { ...legacyScenario, overcharge: 1 },
          legacyRankingIntent: requestB.executionIntent,
        });
  const initialProfile: LocalProfile = {
    ...base,
    history: [entryB],
    draft: {
      profileId: base.profileId,
      calculationSessionId: sessionA,
      request: requestA,
      result: resultA,
      requestFingerprint: await fingerprint(requestA),
      updatedAt: now,
    },
  };
  const routeMaster = {
    ...master,
    servants:
      failure === 'missingSubject'
        ? [master.servants[0]!]
        : master.servants.map((servant, index) =>
            failure === 'missingLevel' && index === 1 ? { ...servant, atkByLevel: {} } : servant,
          ),
  };

  let observed = {
    profile: initialProfile,
    session: sessionA,
    workspace: {
      request: requestA,
      storedResult: resultA,
      source: 'draft',
    } as CalculationWorkspace,
  };
  let finalizer: (() => Promise<void>) | null = null;
  let mutation = 0;
  const calculationMutation = {
    begin: () => ++mutation,
    isCurrent: (token: number) => token === mutation,
  };
  function Harness() {
    const [profile, setProfile] = useState(initialProfile);
    const [session, setSession] = useState(sessionA);
    const [workspace, setWorkspace] = useState(observed.workspace);
    useEffect(() => {
      observed = { profile, session, workspace };
    }, [profile, session, workspace]);
    return (
      <CalculatorRoute
        master={routeMaster}
        profile={profile}
        calculation={workspace}
        setCalculation={setWorkspace}
        calculationSessionId={session}
        setCalculationSessionId={setSession}
        updateActiveProfile={(update) => {
          setProfile(update);
          return Promise.resolve();
        }}
        updateSupportTemplate={() => Promise.resolve()}
        registerFinalizer={(value) => {
          finalizer = value;
        }}
        recoveryFocus={null}
        setRecoveryFocus={() => {}}
        calculationMutation={calculationMutation}
      />
    );
  }
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  const view = render(<Harness />);
  return {
    view,
    entryB,
    current: () => observed,
    leave: async () => {
      await act(async () => {
        await finalizer?.();
      });
    },
  };
}

it.each(
  (['historicalOnly', 'current'] as const).flatMap((kind) =>
    [false, true].flatMap((sharedA) =>
      (['share', 'leave'] as const).map((finish) => ({ kind, sharedA, finish })),
    ),
  ),
)(
  'isolates $kind history (current shared=$sharedA, finalize=$finish)',
  async ({ kind, sharedA, finish }) => {
    const test = await setup(kind);
    if (sharedA) {
      fireEvent.click(test.view.getByRole('button', { name: 'URLをコピー' }));
      await waitFor(() => expect(test.current().profile.history).toHaveLength(2));
    }
    const savedA = test
      .current()
      .profile.history.find((entry) => entry.calculationSessionId === sessionA)!;
    fireEvent.click(test.view.getByRole('button', { name: /履歴（/ }));
    fireEvent.click(test.view.getByRole('button', { name: /別の検証役/ }));
    await waitFor(() => expect(test.current().session).not.toBe(sessionA));
    const selected = test.current();
    expect(selected.profile.draft?.calculationSessionId).toBe(selected.session);
    expect(selected.workspace.request).toEqual(requestB);
    if (finish === 'leave') await test.leave();
    else {
      fireEvent.click(test.view.getByRole('button', { name: 'URLをコピー' }));
      await waitFor(() =>
        expect(test.current().profile.history.at(-1)?.calculationSessionId).toBe(selected.session),
      );
    }
    expect(test.current().profile.history).toHaveLength(
      sharedA ? 3 : kind === 'historicalOnly' ? 2 : 1,
    );
    if (sharedA) expect(test.current().profile.history).toContainEqual(savedA);
    if (kind === 'historicalOnly' || sharedA)
      expect(test.current().profile.history).toContainEqual(test.entryB);
    // A consecutive identical current calculation retains the existing fingerprint deduplication.

    const saved = test.current().profile.history.at(-1);
    expect(saved?.calculationSessionId).toBe(selected.session);
    expect(saved).toHaveProperty('request', requestB);
    expect(saved?.result).toEqual(resultB);
  },
);

it.each(['missingSubject', 'missingLevel'] as const)(
  'retains the current draft/session when regeneration has %s',
  async (failure) => {
    const test = await setup('historicalOnly', failure);
    const original = test.current();
    fireEvent.click(test.view.getByRole('button', { name: /履歴（/ }));
    const button = test.view.getByRole('button', { name: /旧版履歴/ });
    if (failure === 'missingSubject') expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(test.current()).toEqual(original);
  },
);

it('shows a v40 draft as historical and creates a separate v41 draft only on explicit recalculation', async () => {
  if (requestA.scenario.mode !== 'resolved') throw new Error('resolved fixture required');
  const { schemaVersion, ...oldContext } = requestA.versionContext;
  const { enemyDefenseBuff, initialBattlePointPoints, ...oldScenario } = requestA.scenario;
  expect(schemaVersion).toBe(41);
  expect(enemyDefenseBuff).toBe(0);
  expect(initialBattlePointPoints).toEqual({});
  const oldRequest = portableCalculationRequestV40Schema.parse({
    ...requestA,
    versionContext: oldContext,
    scenario: oldScenario,
  });
  const oldResult = { ...resultA, versions: { ...resultA.versions, schemaVersion: 40 as const } };
  const fingerprint = await portableCalculationFingerprint(oldRequest, (bytes) =>
    crypto.subtle.digest('SHA-256', new Uint8Array(bytes)),
  );
  const base = createProfileCollection(
    'history',
    { now: () => new Date(now) },
    { next: () => sessionA },
  ).profiles[0]!;
  const raw = {
    profileId: base.profileId,
    calculationSessionId: sessionA,
    request: oldRequest,
    result: oldResult,
    requestFingerprint: fingerprint,
    updatedAt: now,
  };
  const historicalDraft = historicalCalculationDraftV40Schema.parse({
    disposition: 'historicalOnly',
    sourceSchemaVersion: 40,
    profileId: base.profileId,
    calculationSessionId: sessionA,
    scenario: oldScenario,
    result: oldResult,
    requestFingerprint: fingerprint,
    updatedAt: now,
    legacySnapshot: raw,
  });
  let observed: { profile: LocalProfile; workspace: CalculationWorkspace } = {
    profile: { ...base, historicalDraft },
    workspace: {
      request: undefined,
      storedResult: undefined,
      source: 'draft',
      historical: historicalDraft,
    },
  };
  let mutation = 0;
  function Harness() {
    const [profile, setProfile] = useState(observed.profile);
    const [workspace, setWorkspace] = useState(observed.workspace);
    useEffect(() => {
      observed = { profile, workspace };
    }, [profile, workspace]);
    return (
      <CalculatorRoute
        master={master}
        profile={profile}
        calculation={workspace}
        setCalculation={setWorkspace}
        calculationSessionId={sessionA}
        setCalculationSessionId={() => {}}
        updateActiveProfile={(update) => {
          setProfile(update);
          return Promise.resolve();
        }}
        updateSupportTemplate={() => Promise.resolve()}
        registerFinalizer={() => {}}
        recoveryFocus={null}
        setRecoveryFocus={() => {}}
        calculationMutation={{ begin: () => ++mutation, isCurrent: (token) => token === mutation }}
      />
    );
  }
  const view = render(<Harness />);
  expect(view.getByText('履歴値・再計算されていません')).toBeTruthy();
  expect(observed.profile.draft).toBeNull();
  fireEvent.click(view.getByRole('button', { name: '現在のバージョンで再計算' }));
  await waitFor(() =>
    expect(observed.profile.draft?.request.versionContext.schemaVersion).toBe(41),
  );
  expect(observed.profile.historicalDraft?.legacySnapshot).toEqual(raw);
  expect(observed.profile.draft?.request.scenario).toMatchObject({ enemyDefenseBuff: 0 });
  expect(observed.profile.draft?.requestFingerprint).not.toBe(fingerprint);
  expect(canonicalize(observed.profile.draft?.request)).not.toBe(canonicalize(oldRequest));
});
