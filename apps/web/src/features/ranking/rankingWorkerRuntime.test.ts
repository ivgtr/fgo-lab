import {
  master as stackMaster,
  servant as stackServant,
  source as stackSource,
} from '../../../../../packages/calculation-application/src/stackQuantityFixture';
import { parseRankingWorkerResponse } from './rankingWorkerProtocol';
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
const profile = { servantBuilds: {} };
const versions = {
  schemaVersion: SCHEMA_VERSION,
  masterDataVersion: master.version,
  engineVersion: ENGINE_VERSION,
  appVersion: APP_VERSION,
  gameRegion: 'JP' as const,
  masterDataLocale: 'ja-JP' as const,
};

describe('ranking worker canonical runtime', () => {
  it('preserves maximum stack evidence across the worker parser and rejects tampered count provenance', () => {
    const result = calculateRankingPolicyDetail(
      stackServant,
      stackMaster,
      profile,
      { ...DEFAULT_RANKING_POLICY_CONDITIONS, conditionalEffects: 'satisfied' },
      versions,
    );
    if (result.status !== 'calculated') throw new Error('stack fixture');
    const envelope = {
      kind: 'detail',
      contextId: 'stack',
      requestId: 'stack-detail',
      fingerprint: 'stack',
      entryId: result.detail.entryId,
      detail: result.detail,
    };
    expect(parseRankingWorkerResponse(envelope)).toEqual(envelope);
    const presentation = presentRankingDetailEvidence(result.detail, stackMaster);
    expect(
      presentation.conditions.some(({ value }) => value === '4回・準備開始時の仮定（最大回数）'),
    ).toBe(true);
    expect(
      parseRankingWorkerResponse({
        ...envelope,
        detail: {
          ...result.detail,
          scenario: {
            ...result.detail.scenario,
            canonicalInputValues: {
              [stackSource.key]: { kind: 'integer', value: 1, origin: 'maximum' },
            },
          },
        },
      }),
    ).toBeNull();
  });

  it('shares one seven-condition cache identity and returns calculator-parity detail evidence', () => {
    const calculate = vi.fn(calculateRankingPolicy);
    const detail = vi.fn(calculateRankingPolicyDetail);
    const runtime = createRankingWorkerRuntime({ calculate, detail });
    // E2E-A013-DETAIL
    expect(
      runtime.handle({
        kind: 'initialize',
        requestId: 'init',
        contextId: 'context',
        master,
        profile,
        versions,
      }),
    ).toEqual({ kind: 'ready', requestId: 'init', contextId: 'context' });

    const first = runtime.handle({
      kind: 'calculate',
      contextId: 'context',
      requestId: 'summary-1',
      conditions: DEFAULT_RANKING_POLICY_CONDITIONS,
    });
    const second = runtime.handle({
      kind: 'calculate',
      contextId: 'context',
      requestId: 'summary-2',
      conditions: { ...DEFAULT_RANKING_POLICY_CONDITIONS },
    });
    expect(calculate).toHaveBeenCalledTimes(1);
    expect(first.kind).toBe('result');
    expect(parseRankingWorkerResponse(first)).toEqual(first);
    expect(second.kind).toBe('result');
    if (first.kind !== 'result') throw new TypeError('expected ranking result');
    expect(first.exclusions).toEqual([]);
    expect(first.rows.length).toBeGreaterThan(0);

    const alternate = runtime.handle({
      kind: 'calculate',
      contextId: 'context',
      requestId: 'summary-3',
      conditions: { ...DEFAULT_RANKING_POLICY_CONDITIONS, conditionalEffects: 'satisfied' },
    });
    expect(alternate.kind).toBe('result');
    const restored = runtime.handle({
      kind: 'calculate',
      contextId: 'context',
      requestId: 'summary-4',
      conditions: DEFAULT_RANKING_POLICY_CONDITIONS,
    });
    expect(restored.kind).toBe('result');
    expect(calculate).toHaveBeenCalledTimes(3);

    const row = first.rows[0]!;
    const detailResponse = runtime.handle({
      kind: 'detail',
      contextId: 'context',
      requestId: 'detail-1',
      fingerprint: first.fingerprint,
      entryId: row.entryId,
    });
    runtime.handle({
      kind: 'detail',
      contextId: 'context',
      requestId: 'detail-2',
      fingerprint: first.fingerprint,
      entryId: row.entryId,
    });
    expect(detail).toHaveBeenCalledTimes(2);
    expect(detailResponse.kind).toBe('detail');
    expect(parseRankingWorkerResponse(detailResponse)).toEqual(detailResponse);
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

describe('ranking worker trust and identity boundaries', () => {
  it('rejects contradictory detail identity before either cached or uncached lookup', () => {
    const calculate = vi.fn(calculateRankingPolicy);
    const detail = vi.fn(calculateRankingPolicyDetail);
    const runtime = createRankingWorkerRuntime({ calculate, detail });
    runtime.handle({
      kind: 'initialize',
      requestId: 'i',
      contextId: 'a',
      master,
      profile,
      versions,
    });
    const summary = runtime.handle({
      kind: 'calculate',
      requestId: 's',
      contextId: 'a',
      conditions: DEFAULT_RANKING_POLICY_CONDITIONS,
    });
    if (summary.kind !== 'result') throw new Error('summary required');
    const entryId = summary.rows[0]!.entryId;
    const request = {
      kind: 'detail',
      requestId: 'd',
      contextId: 'a',
      fingerprint: summary.fingerprint,
      entryId,
    };
    for (const cached of [false, true]) {
      if (cached) expect(runtime.handle(request).kind).toBe('detail');
      const calls = detail.mock.calls.length;
      expect(runtime.handle({ ...request, servantId: 'contradictory' })).toMatchObject({
        kind: 'error',
        status: 'invalid',
      });
      expect(runtime.handle({ ...request, entryId: 'not-a-member' })).toMatchObject({
        kind: 'error',
        status: 'invalid',
      });
      expect(detail).toHaveBeenCalledTimes(calls);
    }
    expect(calculate).toHaveBeenCalledTimes(1);
    runtime.handle({
      kind: 'initialize',
      requestId: 'i2',
      contextId: 'b',
      master,
      profile,
      versions,
    });
    expect(runtime.handle(request)).toMatchObject({ kind: 'error', status: 'invalid' });
    expect(runtime.handle({ ...request, contextId: 'b' })).toMatchObject({
      kind: 'error',
      status: 'invalid',
    });
  });

  it('reuses record validation and never calculates under a failed replacement context', () => {
    const calculate = vi.fn(calculateRankingPolicy);
    const runtime = createRankingWorkerRuntime({ calculate, detail: calculateRankingPolicyDetail });
    const initialize = {
      kind: 'initialize',
      requestId: 'i',
      contextId: 'a',
      master,
      profile,
      versions,
    };
    runtime.handle(initialize);
    const malformed = {
      servantBuilds: JSON.parse(
        '{"__proto__":{"servantId":"__proto__","level":1,"ascension":0,"npLevel":1,"fouAtk":0,"skills":{},"appends":{},"updatedAt":"2026-09-05T00:00:00.000Z"}}',
      ) as unknown,
    };
    expect(runtime.handle({ ...initialize, profile: malformed })).toMatchObject({
      kind: 'error',
      status: 'invalid',
    });
    expect(
      runtime.handle({
        kind: 'calculate',
        requestId: 's',
        contextId: 'a',
        conditions: DEFAULT_RANKING_POLICY_CONDITIONS,
      }),
    ).toMatchObject({ kind: 'error', status: 'invalid' });
    expect(calculate).not.toHaveBeenCalled();
    expect(runtime.handle(initialize).kind).toBe('ready');
    expect(
      runtime.handle({
        kind: 'calculate',
        requestId: 's',
        contextId: 'a',
        conditions: { ...DEFAULT_RANKING_POLICY_CONDITIONS, levelBasis: 'ownedLevel' },
      }),
    ).toMatchObject({ kind: 'error', status: 'invalid', stage: 'summary' });
    expect(calculate).not.toHaveBeenCalled();
  });
});
