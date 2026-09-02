// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  calculateRankingPolicyDetail,
  DEFAULT_RANKING_POLICY_CONDITIONS,
} from '@fgo-lab/calculation-application';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { RankingEffectDetails } from './RankingEffectDetails';

afterEach(cleanup);

describe('ranking contribution detail', () => {
  it('shows independent self, condition, and area decisions from the canonical result', () => {
    const master = masterSnapshotSchema.parse(fixture);
    const result = calculateRankingPolicyDetail(
      master.servants[0]!,
      master,
      { servantBuilds: {}, craftEssences: [], supportTemplates: [] },
      DEFAULT_RANKING_POLICY_CONDITIONS,
      {
        schemaVersion: SCHEMA_VERSION,
        masterDataVersion: master.version,
        engineVersion: ENGINE_VERSION,
        appVersion: APP_VERSION,
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
      },
    );
    if (result.status !== 'calculated') throw new Error('calculated fixture required');
    render(
      <RankingEffectDetails detail={result.detail} master={master} onOpenCalculator={vi.fn()} />,
    );
    const decisions = screen.getByRole('region', { name: '寄与ごとのpolicy判定' });
    expect(decisions.textContent).toContain('自己: 適用');
    expect(decisions.textContent).toContain('条件: 適用');
    expect(decisions.textContent).toContain('エリア: 適用');
    expect(decisions.textContent).toContain('damageへ適用');
  });
});
