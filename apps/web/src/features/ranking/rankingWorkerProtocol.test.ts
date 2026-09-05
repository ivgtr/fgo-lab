import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  createRankingPortableRequest,
  currentCalculationVersionContext,
  executePortableCalculation,
  type RankingPolicyDetail,
} from '@fgo-lab/calculation-application';
import { parseRankingWorkerResponse } from './rankingWorkerProtocol';
import { rankingResponseFixture } from './rankingResponseFixture';
import { RankingEffectDetails } from './RankingEffectDetails';

const fixture = rankingResponseFixture();
const detail = fixture.detail.detail;
const populatedDetail = {
  ...detail,
  // Exercise the schema-legal non-null area branch even when the default winner has no area.
  areaContribution: {
    withoutAreaScenario: detail.scenario,
    withoutAreaInput: detail.input,
    withoutAreaResult: detail.result,
    withoutAreaEffects: detail.effects,
    contributionPolicy: detail.contributionPolicy,
    effectiveContributions: detail.effectiveContributions,
    warnings: detail.warnings,
  },
};
function corrupted(value: unknown, path: readonly string[], replacement: unknown): unknown {
  const copy: unknown = structuredClone(value);
  let cursor = copy;
  for (const key of path.slice(0, -1)) {
    if (!cursor || typeof cursor !== 'object')
      throw new Error(`missing fixture branch: ${path.join('.')}`);
    cursor = (cursor as Record<string, unknown>)[key];
  }
  if (!cursor || typeof cursor !== 'object')
    throw new Error(`missing fixture parent: ${path.join('.')}`);
  (cursor as Record<string, unknown>)[path[path.length - 1]!] = replacement;
  return copy;
}

describe('ranking response consumer contract', () => {
  it('preserves complete normal transport data, presentation, and portable replay', () => {
    for (const response of [
      fixture.ready,
      fixture.summary,
      fixture.detail,
      { ...fixture.detail, detail: populatedDetail },
    ])
      expect(parseRankingWorkerResponse(structuredClone(response))).toEqual(response);
    const parsed = parseRankingWorkerResponse(fixture.detail);
    if (parsed?.kind !== 'detail') throw new Error('detail required');
    expect(
      renderToStaticMarkup(
        createElement(RankingEffectDetails, {
          detail: parsed.detail,
          master: fixture.master,
          onOpenCalculator: () => {},
        }),
      ),
    ).toContain('同じ条件で計算機を開く');
    const request = createRankingPortableRequest(
      parsed.detail,
      currentCalculationVersionContext(fixture.master),
    );
    const replay = executePortableCalculation(request, fixture.master);
    expect(replay.status).toBe('executed');
    if (replay.status === 'executed') expect(replay.execution.result).toEqual(detail.result);
  });

  it('accepts schema-legal populated inputs and alternate projection decisions without inventing defaults', () => {
    const input = {
      kind: 'criticalStars' as const,
      key: 'criticalStars',
      owner: 'field' as const,
      label: 'スター',
      description: '現在のスター数',
      minimum: 0,
      maximum: 50,
      step: 1,
      defaultValue: 0,
      defaultReason: 'baseline',
    };
    const base = detail.effects[0]!;
    const decisions: (typeof base.decision)[] = [
      { state: 'none' },
      {
        kind: 'effect',
        state: 'enabled',
        decisionKey: 'effect',
        plan: { activation: 'user', condition: 'userMayAssume' },
        targetContext: {
          predicates: [{ kind: 'classIdentity', classId: 'lancer' }],
          fallbackClass: { kind: 'relative', relation: 'neutral' },
          fallbackAttribute: { kind: 'relative', relation: 'neutral' },
        },
      },
      {
        kind: 'worldFact',
        state: 'disabled',
        decisionKey: 'field',
        fact: { kind: 'trait', scope: 'field', trait: 'field:test', present: false },
      },
      {
        kind: 'targetPredicate',
        state: 'enabled',
        decisionKey: 'target',
        target: { kind: 'classIdentity', classId: 'lancer' },
        fallbackClass: null,
        fallbackAttribute: null,
      },
    ];
    for (const decision of decisions) {
      const enriched: RankingPolicyDetail = {
        ...populatedDetail,
        warnings: ['fixture warning'],
        effects: [
          {
            ...base,
            decision,
            requiredInputs: [input],
            explanation: {
              code: 'conditionNotMet',
              condition: {
                kind: 'all',
                expressions: [
                  { kind: 'trait', scope: 'target', trait: 'trait:test', present: true },
                  {
                    kind: 'not',
                    expression: {
                      kind: 'inputQuantity',
                      inputKey: input.key,
                      comparison: 'lessThan',
                      value: 10,
                    },
                  },
                ],
              },
            },
          },
        ],
        effectInputs: [
          {
            ...input,
            control: 'stepper',
            value: 10,
            explicit: true,
            invalid: false,
            section: 'own',
            relatedProjectionKeys: [base.projectionKey],
            relatedEffectLabels: [base.label],
          },
        ],
      };
      const response = { ...fixture.detail, detail: enriched };
      const parsed = parseRankingWorkerResponse(response);
      expect(parsed).toEqual(response);
      if (parsed?.kind !== 'detail') throw new Error('detail required');
      expect(() =>
        renderToStaticMarkup(
          createElement(RankingEffectDetails, {
            detail: parsed.detail,
            master: fixture.master,
            onOpenCalculator: () => {},
          }),
        ),
      ).not.toThrow();
    }
  });

  it('rejects missing detail metadata and malformed nested consumer payloads as one family', () => {
    expect(detail.effects.length).toBeGreaterThan(0);
    expect(detail.appliedPreparationActions.length).toBeGreaterThan(0);
    expect(detail.effectiveContributions.contributions.length).toBeGreaterThan(0);
    const cases: [string[], unknown][] = [
      [['attackProfile'], undefined],
      [['attackProfile', 'id', 'terminalActorFormProfileId', 'semantics'], {}],
      [['noblePhantasmName'], undefined],
      [['noblePhantasmVariant'], {}],
      [['appliedPreparationActions'], [{}]],
      [['appliedPreparationActions', '0', 'command'], { kind: 'unknown' }],
      [['appliedPreparationActions', '0', 'resourceBefore'], null],
      [['appliedPreparationActions', '0', 'selectedEffects'], [{}]],
      [['appliedPreparationActions', '0', 'transition'], {}],
      [['effects', '0', 'source'], {}],
      [['effects', '0', 'explanation'], {}],
      [['effects', '0', 'explanation', 'condition'], { kind: 'all', expressions: [{}] }],
      [['effects', '0', 'proc'], { kind: 'chainedRolls' }],
      [['effects', '0', 'requiredInputs'], [{}]],
      [['effects', '0', 'decision'], { state: 'enabled', kind: 'effect' }],
      [['effectInputs'], [{ relatedProjectionKeys: [] }]],
      [['effectiveContributions', 'contributions', '0', 'selfDecision'], {}],
      [['effectiveContributions', 'contributions', '0', 'conditionDecision'], { kind: 'excluded' }],
      [['effectiveContributions', 'contributions', '0', 'areaViewDecision'], null],
      [['effectiveContributions', 'effectivePresentationGroupIds'], new Set([{}])],
      [['warnings'], [{}]],
      [['areaContribution', 'withoutAreaEffects'], [{}]],
      [['areaContribution', 'effectiveContributions', 'contributions'], [{}]],
      [['areaContribution', 'warnings'], [{}]],
      [['result', 'rows'], []],
    ];
    for (const [path, replacement] of cases)
      expect(
        parseRankingWorkerResponse({
          ...fixture.detail,
          detail: corrupted(populatedDetail, path, replacement),
        }),
        path.join('.'),
      ).toBeNull();
  });

  it('validates summary, exclusion and error siblings while keeping empty results and nullable metadata', () => {
    for (const path of [
      ['attackProfile'],
      ['attackProfile', 'id', 'terminalActorFormProfileId'],
      ['noblePhantasmVariant'],
    ])
      expect(
        parseRankingWorkerResponse({
          ...fixture.summary,
          rows: [corrupted(fixture.summary.rows[0], path, undefined)],
        }),
      ).toBeNull();
    expect(
      parseRankingWorkerResponse({
        ...fixture.summary,
        exclusions: [
          {
            entryId: 'x',
            servantId: 'x',
            name: 'x',
            status: 'invalid',
            reason: 'invalid',
            issues: [{}],
          },
        ],
      }),
    ).toBeNull();
    const empty = { ...fixture.summary, rows: [], exclusions: [] };
    expect(parseRankingWorkerResponse(empty)).toEqual(empty);
    const base = {
      kind: 'error',
      requestId: 'r',
      contextId: 'c',
      status: 'invalid',
      reason: 'invalid',
    };
    for (const stage of ['initialization', 'summary']) {
      const response = { ...base, stage, fingerprint: null };
      expect(parseRankingWorkerResponse(response)).toEqual(response);
    }
    const detailError = { ...base, stage: 'detail', entryId: 'entry', fingerprint: 'fingerprint' };
    expect(parseRankingWorkerResponse(detailError)).toEqual(detailError);
    expect(parseRankingWorkerResponse({ ...detailError, entryId: undefined })).toBeNull();
    expect(parseRankingWorkerResponse({ ...detailError, fingerprint: null })).toBeNull();
  });
});
