// @vitest-environment jsdom
import { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { createProfileCollection } from '@fgo-lab/profile-domain';
import { historicalCalculationHistoryEntrySchema, type LocalProfile } from '@fgo-lab/schema';
import {
  createDefaultCalculatorPortableRequest,
  executePortableCalculation,
} from '@fgo-lab/calculation-application';
import { finalizeHistory, portableCalculationFingerprint } from '@fgo-lab/workspace-domain';
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
  const { initialOvercharge, ...legacyScenario } = requestB.scenario;
  expect(initialOvercharge).toBe(1);
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
