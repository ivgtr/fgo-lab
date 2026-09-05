import { describe, expect, it, vi } from 'vitest';
import fixture from '../../../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import {
  calculateRankingPolicy,
  calculateRankingPolicyDetail,
  calculateScenarioWithPolicy,
  DEFAULT_RANKING_POLICY_CONDITIONS,
} from '@fgo-lab/calculation-application';
import { createRankingWorkerRuntime } from './rankingWorkerRuntime';
import { presentRankingDetailEvidence } from './rankingDetailPresentation';

const master = masterSnapshotSchema.parse(fixture);
const profile = { servantBuilds: {}, craftEssences: [], supportTemplates: [] };
const versions = {
  schemaVersion: SCHEMA_VERSION,
  masterDataVersion: master.version,
  engineVersion: ENGINE_VERSION,
  appVersion: APP_VERSION,
  gameRegion: 'JP' as const,
  masterDataLocale: 'ja-JP' as const,
};

describe('ranking worker canonical runtime', () => {
  it('shares one five-condition cache identity and returns calculator-parity detail evidence', () => {
    const calculate = vi.fn(calculateRankingPolicy);
    const detail = vi.fn(calculateRankingPolicyDetail);
    const runtime = createRankingWorkerRuntime({ calculate, detail });
    // E2E-A013-DETAIL
    expect(
      runtime.handle({ kind: 'initialize', requestId: 'init', master, profile, versions }),
    ).toEqual({ kind: 'ready', requestId: 'init' });

    const first = runtime.handle({
      kind: 'calculate',
      requestId: 'summary-1',
      conditions: DEFAULT_RANKING_POLICY_CONDITIONS,
    });
    const second = runtime.handle({
      kind: 'calculate',
      requestId: 'summary-2',
      conditions: { ...DEFAULT_RANKING_POLICY_CONDITIONS },
    });
    expect(calculate).toHaveBeenCalledTimes(1);
    expect(first.kind).toBe('result');
    expect(second.kind).toBe('result');
    if (first.kind !== 'result') throw new TypeError('expected ranking result');
    expect(first.exclusions).toEqual([]);
    expect(first.rows.length).toBeGreaterThan(0);

    const row = first.rows[0]!;
    const detailResponse = runtime.handle({
      kind: 'detail',
      requestId: 'detail-1',
      fingerprint: first.fingerprint,
      entryId: row.entryId,
      servantId: row.servantId,
      attackProfile: row.attackProfile,
    });
    runtime.handle({
      kind: 'detail',
      requestId: 'detail-2',
      fingerprint: first.fingerprint,
      entryId: row.entryId,
      servantId: row.servantId,
      attackProfile: row.attackProfile,
    });
    expect(detail).toHaveBeenCalledTimes(1);
    expect(detailResponse.kind).toBe('detail');
    if (detailResponse.kind !== 'detail') throw new TypeError('expected ranking detail');
    expect(detailResponse.detail.candidateEvidence.policyKey).toBe('included:baseline');
    const recalculated = calculateScenarioWithPolicy(
      detailResponse.detail.scenario,
      master,
      versions,
      detailResponse.detail.contributionPolicy,
      { initialNpGauge: detailResponse.detail.candidateEvidence.startNpGauge },
    );
    expect(recalculated.result).toEqual(detailResponse.detail.result);
    expect(recalculated.effects).toEqual(detailResponse.detail.effects);
    const presentation = presentRankingDetailEvidence(
      {
        ...detailResponse.detail,
        candidateEvidence: {
          ...detailResponse.detail.candidateEvidence,
          startNpGauge: 15_000,
        },
        scenario: {
          ...detailResponse.detail.scenario,
          worldFactAssertions: [
            ...detailResponse.detail.scenario.worldFactAssertions,
            {
              decisionKey: 'ranking:test:negative',
              fact: { kind: 'trait', scope: 'target', trait: 'dragon', present: false },
            },
          ],
        },
      },
      master,
    );
    expect(presentation.profile.map(({ label }) => label)).toEqual([
      '開始形態',
      '終端形態',
      '攻撃宝具',
    ]);
    expect(presentation.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '開始NP', value: '150%' }),
        expect.objectContaining({ value: '竜ではない' }),
      ]),
    );
    expect(presentation.actions.at(-1)?.label).toContain('攻撃宝具');
  });
});
