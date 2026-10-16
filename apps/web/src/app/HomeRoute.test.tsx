// @vitest-environment jsdom
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
        hasGrowthTargets={false}
        onNavigate={vi.fn()}
        onOpenTargets={vi.fn()}
      />,
    );

    expect(screen.getByText('計算結果を利用できません')).toBeTruthy();
    expect(screen.queryByText(/^0$/)).toBeNull();
  });
});

it('does not present a current-format unavailable-engine pair as the current damage headline', () => {
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
  const request = {
    ...current,
    versionContext: { ...current.versionContext, engineVersion: 'unavailable-engine' },
  };
  const result = {
    ...outcome.execution.result,
    versions: { ...outcome.execution.result.versions, engineVersion: 'unavailable-engine' },
  };
  render(
    <HomeRoute
      master={master}
      profile={profile}
      calculation={{ request, storedResult: result, source: 'draft' }}
      navigate={vi.fn()}
    />,
  );
  expect(screen.getByText('新しい計算を始める')).toBeTruthy();
  expect(screen.queryByText('47,344.965')).toBeNull();
  return Promise.resolve();
});
