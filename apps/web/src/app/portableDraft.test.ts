import type { ProfileWriteGuard } from '@fgo-lab/profile-domain';
import { expect, it, vi } from 'vitest';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { createProfileCollection } from '@fgo-lab/profile-domain';
import {
  createDefaultCalculatorPortableRequest,
  executePortableCalculation,
  resetPortableCalculationRequest,
} from '@fgo-lab/calculation-application';
import { portableCalculationRequestSchema } from '@fgo-lab/schema';
import fixture from '../../../../packages/test-fixtures/master/fixture.json';
import {
  commitPortableDraft,
  createCalculationMutationGate,
  startPortableDraft,
} from './portableDraft';

const alwaysCurrentMutation = {
  mutationToken: 1,
  isCurrent: () => true,
  signal: new AbortController().signal,
};

it.each(['draft', 'history'] as const)(
  'does not publish a new %s session/workspace when durable storage fails',
  async (source) => {
    const master = masterSnapshotSchema.parse(fixture);
    const request = createDefaultCalculatorPortableRequest(master, undefined);
    const outcome = executePortableCalculation(request, master);
    if (outcome.status !== 'executed') throw new Error(outcome.status);
    const setCalculation = vi.fn();
    const setCalculationSessionId = vi.fn();
    const updateActiveProfile = vi.fn().mockRejectedValue(new Error('storage unavailable'));
    await expect(
      startPortableDraft({
        request,
        result: outcome.execution.result,
        source,
        setCalculation,
        setCalculationSessionId,
        updateActiveProfile,
        ...alwaysCurrentMutation,
      }),
    ).rejects.toThrow('storage unavailable');
    expect(updateActiveProfile).toHaveBeenCalledOnce();
    expect(setCalculation).not.toHaveBeenCalled();
    expect(setCalculationSessionId).not.toHaveBeenCalled();
  },
);

const stalePublicationCases = [
  [
    'scenario edit',
    'draft',
    (request: ReturnType<typeof createDefaultCalculatorPortableRequest>) =>
      portableCalculationRequestSchema.parse({
        ...request,
        scenario: {
          ...request.scenario,
          explicitOverrides: { attackerAtk: 1234 },
        },
      }),
  ],
  [
    'normal reset',
    'draft',
    (request: ReturnType<typeof createDefaultCalculatorPortableRequest>) =>
      resetPortableCalculationRequest(
        portableCalculationRequestSchema.parse({
          ...request,
          scenario: { ...request.scenario, initialOvercharge: 2 },
          executionIntent: { kind: 'calculator', initialNpGauge: 20_000 },
        }),
      ),
  ],
  [
    'current history copy',
    'history',
    (request: ReturnType<typeof createDefaultCalculatorPortableRequest>) => request,
  ],
  [
    'historical regeneration',
    'draft',
    (request: ReturnType<typeof createDefaultCalculatorPortableRequest>) =>
      portableCalculationRequestSchema.parse({
        ...request,
        scenario: {
          ...request.scenario,
          explicitOverrides: { attackerAtk: 2345 },
        },
      }),
  ],
] as const;

it.each(stalePublicationCases)(
  'does not publish stale %s after a newer mutation starts',
  async (_operation, source, createNewerRequest) => {
    const master = masterSnapshotSchema.parse(fixture);
    const request = createDefaultCalculatorPortableRequest(master, undefined);
    const outcome = executePortableCalculation(request, master);
    if (outcome.status !== 'executed') throw new Error(outcome.status);
    const newerRequest = createNewerRequest(request);
    const profile = createProfileCollection(
      'mutation',
      { now: () => new Date('2026-09-08T00:00:00.000Z') },
      { next: () => '00000000-0000-4000-8000-000000000011' },
    ).profiles[0]!;
    const setCalculation = vi.fn();
    let current = profile;
    let queue: Promise<unknown> = Promise.resolve();
    let resolveWrite!: () => void;
    const writeFinished = new Promise<void>((resolve) => {
      resolveWrite = resolve;
    });
    const updateActiveProfile = vi.fn(
      (update: (value: typeof profile) => typeof profile, guard?: ProfileWriteGuard) => {
        const operation = queue.then(async () => {
          const next = update(current);
          await writeFinished;
          if (guard?.signal.aborted || (guard && !guard.isCurrent()))
            return { status: 'aborted' as const, reason: 'stale' as const };
          current = next;
          return { status: 'committed' as const };
        });
        queue = operation;
        return operation;
      },
    );
    const mutation = createCalculationMutationGate();
    let token = mutation.begin();
    const first = commitPortableDraft({
      request,
      result: outcome.execution.result,
      sessionId: '00000000-0000-4000-8000-000000000012',
      source,
      updateActiveProfile,
      setCalculation,
      mutationToken: token,
      isCurrent: mutation.isCurrent,
      signal: mutation.signalFor(token),
    });
    await vi.waitFor(() => expect(updateActiveProfile).toHaveBeenCalledOnce());
    token = mutation.begin();
    const second = commitPortableDraft({
      request: newerRequest,
      result: outcome.execution.result,
      sessionId: '00000000-0000-4000-8000-000000000013',
      source,
      updateActiveProfile,
      setCalculation,
      mutationToken: token,
      isCurrent: mutation.isCurrent,
      signal: mutation.signalFor(token),
    });
    resolveWrite();
    await expect(first).resolves.toEqual({ status: 'aborted', reason: 'stale' });
    await expect(second).resolves.toEqual({ status: 'committed', published: true });
    expect(setCalculation).toHaveBeenCalledOnce();
    expect(current.draft?.request).toEqual(newerRequest);
    expect(current.draft?.calculationSessionId).toBe('00000000-0000-4000-8000-000000000013');
  },
);

it('reports a committed stale draft without publishing workspace/session or compensating storage', async () => {
  const master = masterSnapshotSchema.parse(fixture);
  const request = createDefaultCalculatorPortableRequest(master, undefined);
  const execution = executePortableCalculation(request, master);
  if (execution.status !== 'executed') throw new Error(execution.status);
  const profile = createProfileCollection(
    'committed',
    { now: () => new Date('2026-10-03T00:00:00.000Z') },
    {
      next: () => '00000000-0000-4000-8000-000000000001',
    },
  ).profiles[0]!;
  const mutation = createCalculationMutationGate();
  const token = mutation.begin();
  let stored = profile;
  const updateActiveProfile = vi.fn((update: (value: typeof profile) => typeof profile) => {
    stored = update(stored);
    mutation.begin();
    return Promise.resolve({ status: 'committed' as const });
  });
  const setCalculation = vi.fn();
  const setCalculationSessionId = vi.fn();
  expect(
    await startPortableDraft({
      request,
      result: execution.execution.result,
      updateActiveProfile,
      setCalculation,
      setCalculationSessionId,
      mutationToken: token,
      isCurrent: mutation.isCurrent,
      signal: mutation.signalFor(token),
    }),
  ).toEqual({ status: 'committed', published: false });
  expect(stored.draft?.request).toBe(request);
  expect(stored.draft?.result).toBe(execution.execution.result);
  expect(updateActiveProfile).toHaveBeenCalledOnce();
  expect(setCalculation).not.toHaveBeenCalled();
  expect(setCalculationSessionId).not.toHaveBeenCalled();
});
