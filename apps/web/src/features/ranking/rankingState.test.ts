import { describe, expect, it } from 'vitest';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from '@fgo-lab/calculation-application';
import {
  DEFAULT_RANKING_URL_STATE,
  parseRankingUrlState,
  serializeRankingUrlState,
} from './rankingState';

describe('ranking URL state', () => {
  it('round-trips calculation conditions, filters, and metric through one model', () => {
    const state = {
      ...DEFAULT_RANKING_URL_STATE,
      conditions: {
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        initialOvercharge: 3 as const,
        population: 'owned' as const,
        npLevelBasis: { kind: 'specified' as const, npLevel: 5 as const },
        classAffinity: 'favorable' as const,
        selfBuffs: 'excluded' as const,
        conditionalEffects: 'satisfied' as const,
      },
      metric: 'maximum' as const,
      filters: {
        ...DEFAULT_RANKING_URL_STATE.filters,
        search: 'アルトリア',
        card: 'buster' as const,
      },
    };
    expect(parseRankingUrlState(serializeRankingUrlState(state))).toEqual(state);
  });

  it('rejects out-of-domain values without guessing executable defaults', () => {
    const state = parseRankingUrlState(
      '?rNp=9&rMode=unknown&rAffinity=invalid&rSelf=invalid&rConditional=invalid&rSpecial=active&rField=active',
    );
    expect(state.conditions).toBeNull();
    expect(serializeRankingUrlState(state, '?rSpecial=active&rField=active')).not.toMatch(
      /rSpecial|rField/,
    );
  });
});

describe('strict comparison URL boundary', () => {
  it('rejects partial, duplicate, mixed and noncanonical NP tokens, preserving invalid state on filter edits', () => {
    const canonical = serializeRankingUrlState(DEFAULT_RANKING_URL_STATE);
    expect(parseRankingUrlState('')).toEqual(DEFAULT_RANKING_URL_STATE);
    for (const query of [
      '?rPopulation=all',
      `${canonical}&rPopulation=all`,
      `${canonical}&rMode=standard`,
      `${canonical}&rNp=1`,
      canonical.replace('rOc=1', 'rOc=2'),
      canonical.replace('rOc=1', 'rOc=1.0'),
      canonical.replace(/&?rOc=1/, ''),
      `${canonical}&rOc=1`,
      canonical.replace('rNpBasis=1', 'rNpBasis=1.0'),
      canonical.replace('rNpBasis=1', 'rNpBasis='),
      canonical.replace('rLevelBasis=naturalLimit', 'rLevelBasis=ownedLevel'),
    ]) {
      const state = parseRankingUrlState(query);
      expect(state.conditions, query).toBeNull();
      const changed = {
        ...state,
        metric: 'maximum' as const,
        filters: { ...state.filters, search: 'test' },
      };
      expect(parseRankingUrlState(serializeRankingUrlState(changed)).conditions).toBeNull();
      expect(
        parseRankingUrlState(
          serializeRankingUrlState({
            ...changed,
            conditions: DEFAULT_RANKING_URL_STATE.conditions,
          }),
        ).conditions,
      ).toEqual(DEFAULT_RANKING_URL_STATE.conditions);
    }
  });
});
