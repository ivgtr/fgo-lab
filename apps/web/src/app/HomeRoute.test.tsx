// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Home } from '../features/home/Home';
import { homeDamageHeadline, HomeRoute } from './HomeRoute';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { createProfileCollection } from '@fgo-lab/profile-domain';
import fixture from '../../../../packages/test-fixtures/master/fixture.json';
import {
  createDefaultCalculatorPortableRequest,
  executePortableCalculation,
} from '@fgo-lab/calculation-application';
import {
  historicalCalculationDraftV40Schema,
  portableCalculationRequestV40Schema,
} from '@fgo-lab/schema';
import { portableCalculationFingerprint } from '@fgo-lab/workspace-domain';

afterEach(cleanup);

describe('HomeRoute damage headline', () => {
  it('presents a nonnumeric calculation as explicitly unavailable instead of zero', () => {
    const result = homeDamageHeadline(undefined, 1);
    expect(result).toBeNull();

    render(
      <Home
        result={result}
        attackerName="test attacker"
        attackerImage={null}
        owned={0}
        hasHistory
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByText('計算結果を利用できません')).toBeTruthy();
    expect(screen.queryByText(/^0$/)).toBeNull();
  });
});

it('does not present a historical draft as the current damage headline', async () => {
  const master = masterSnapshotSchema.parse(fixture);
  const profile = createProfileCollection(
    'test',
    { now: () => new Date('2026-09-25T00:00:00.000Z') },
    { next: () => '00000000-0000-4000-8000-000000000001' },
  ).profiles[0]!;
  const current = createDefaultCalculatorPortableRequest(master, undefined);
  if (current.scenario.mode !== 'resolved') throw new Error('resolved fixture required');
  const outcome = executePortableCalculation(current, master);
  if (outcome.status !== 'executed') throw new Error('executable fixture required');
  const { schemaVersion, ...oldVersionContext } = current.versionContext;
  const { enemyDefenseBuff, initialBattlePointPoints, ...oldScenario } = current.scenario;
  expect(schemaVersion).toBe(41);
  expect(enemyDefenseBuff).toBe(0);
  expect(initialBattlePointPoints).toEqual({});
  const oldRequest = portableCalculationRequestV40Schema.parse({
    ...current,
    versionContext: oldVersionContext,
    scenario: oldScenario,
  });
  const raw = {
    profileId: profile.profileId,
    calculationSessionId: profile.profileId,
    request: oldRequest,
    result: {
      ...outcome.execution.result,
      versions: { ...outcome.execution.result.versions, schemaVersion: 40 },
    },
    requestFingerprint: await portableCalculationFingerprint(oldRequest, (data) =>
      Promise.resolve(Uint8Array.from(createHash('sha256').update(data).digest()).buffer),
    ),
    updatedAt: '2026-09-25T00:00:00.000Z',
  };
  const historical = historicalCalculationDraftV40Schema.parse({
    disposition: 'historicalOnly',
    sourceSchemaVersion: 40,
    ...raw,
    scenario: oldScenario,
    result: raw.result,
    legacySnapshot: raw,
  });
  render(
    <HomeRoute
      master={master}
      profile={profile}
      calculation={{ request: undefined, storedResult: undefined, source: 'draft', historical }}
      navigate={vi.fn()}
    />,
  );
  expect(screen.getByText('新しい計算を始める')).toBeTruthy();
  expect(screen.queryByText('47,344.965')).toBeNull();
});
