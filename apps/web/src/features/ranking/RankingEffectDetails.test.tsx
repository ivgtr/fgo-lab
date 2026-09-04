// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  calculateRankingPolicyDetail,
  DEFAULT_RANKING_POLICY_CONDITIONS,
  type EffectProjection,
  type RankingPolicyDetail,
} from '@fgo-lab/calculation-application';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { RankingEffectDetails } from './RankingEffectDetails';

type EffectiveContribution = RankingPolicyDetail['effectiveContributions']['contributions'][number];

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

  it('renders mixed trait-count projections from each final outcome over one contribution', () => {
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
    const operationId = 'fixture:trait-count:damage';
    const contributionId = `${operationId}:npSpecial` as const;
    const source = {
      origin: 'np' as const,
      sourceInstanceId: 'fixture:np',
      sourceId: master.servants[0]!.id,
      skillId: 'fixture:np',
      effectId: 'fixture:trait-count',
      effectOccurrenceId: 'fixture:trait-count:0',
    };
    const projection = (trait: string, outcome: 'applied' | 'notApplied'): EffectProjection => ({
      projectionKey: `fixture:trait-count:${trait}`,
      operationId,
      contributionId,
      label: `${trait}特攻`,
      sourceName: master.servants[0]!.name,
      skillName: '混在特攻宝具',
      gameActivation: 'npBeforeDamage',
      sourceActive: true,
      proc: { kind: 'guaranteed' },
      procRatePermille: 1_000,
      valuePermille: 1_200,
      value: 1.2,
      requiredQuantity: null,
      requiredQuantityOwner: null,
      requiredInputs: [],
      modifier: 'npSpecial',
      source,
      contributionScope: 'personal',
      contributionControl: 'worldAssumption',
      activationSources: [],
      executionSupport: 'supported',
      outcome,
      visibility: 'visible',
      controllability: 'automatic',
      selectionGroups: [],
      decision: { state: 'none' },
      conditionDecision: 'none',
      explanation: {
        code: outcome === 'applied' ? 'applied' : 'conditionNotMet',
        condition: { kind: 'trait', scope: 'target', trait, present: true },
      },
    });
    const specialContribution: EffectiveContribution = {
      contributionId,
      presentationGroupId: 'fixture:trait-count',
      operationId,
      component: 'npSpecial',
      modifier: 'npSpecial',
      resolvedValue: 1_200,
      outputAddress: 'damage.npSpecial',
      source,
      executionOutcome: 'applied',
      selfDecision: { kind: 'included' },
      conditionDecision: { kind: 'included' },
      areaViewDecision: { kind: 'included' },
      effective: true,
      presentationCounted: true,
    };
    render(
      <RankingEffectDetails
        detail={{
          ...result.detail,
          effects: [projection('burn', 'applied'), projection('poison', 'notApplied')],
          effectiveContributions: {
            contributions: [specialContribution],
            effectivePresentationGroupIds: new Set([specialContribution.presentationGroupId]),
          },
        }}
        master={master}
        onOpenCalculator={vi.fn()}
      />,
    );

    const burnChip = screen.getByText('burn特攻').closest('li');
    const poisonChip = screen.getByText('poison特攻').closest('li');
    expect(burnChip?.getAttribute('data-active')).toBe('true');
    expect(burnChip?.textContent).toContain('1.20倍');
    expect(poisonChip?.getAttribute('data-active')).toBe('false');
    expect(poisonChip?.textContent).toContain('条件未選択');
  });
});
