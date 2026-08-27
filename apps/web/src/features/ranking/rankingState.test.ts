import { describe, expect, it } from 'vitest';
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
        ...DEFAULT_RANKING_URL_STATE.conditions,
        comparisonMode: 'owned' as const,
        npLevel: 5 as const,
        classAffinity: 'favorable' as const,
        selfBuffs: 'excluded' as const,
        specialAttack: 'active' as const,
        field: 'active' as const,
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

  it('rejects out-of-domain values without preserving invalid input', () => {
    const state = parseRankingUrlState(
      '?rNp=9&rMode=unknown&rAffinity=invalid&rSelf=invalid&rSpecial=invalid&rField=invalid',
    );
    expect(state.conditions).toMatchObject({
      comparisonMode: 'standard',
      npLevel: 1,
      classAffinity: 'neutral',
      selfBuffs: 'included',
      specialAttack: 'inactive',
      field: 'inactive',
    });
  });
});
