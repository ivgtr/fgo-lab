import { describe, expect, it, vi } from 'vitest';
import fixture from '../../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  calculateRankingPolicy,
  DEFAULT_RANKING_POLICY_CONDITIONS,
} from '@fgo-lab/calculation-application';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { handoffRankingCalculation } from './rankingHandoff';

const master = masterSnapshotSchema.parse(fixture);

describe('ranking handoff', () => {
  it('does not publish a draft when canonical attacker level preparation is invalid', () => {
    const ranking = calculateRankingPolicy(
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
    const result = Object.values(ranking.profileResults).find(
      (candidate) => candidate.status === 'calculated',
    );
    if (!result) throw new Error('ranking detail required');
    const { servantId, level } = result.detail.scenario.attacker;
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
    const updateActiveProfile = vi.fn();
    const replaceRoute = vi.fn();
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000046' });

    handoffRankingCalculation({
      detail: result.detail,
      master: missingMaster,
      setCalculation,
      setCalculationSessionId: vi.fn(),
      updateActiveProfile,
      replaceRoute,
    });

    expect(updateActiveProfile).not.toHaveBeenCalled();
    expect(setCalculation).not.toHaveBeenCalled();
    expect(replaceRoute).toHaveBeenCalledWith('calculate');
    vi.unstubAllGlobals();
  });
});
