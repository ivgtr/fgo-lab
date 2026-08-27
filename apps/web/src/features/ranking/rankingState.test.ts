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
        levelRule: 'level120' as const,
        npLevel: 5,
        supportTemplateId: '00000000-0000-4000-8000-000000000001',
        targetTraits: ['dragon', 'divine'],
        canonicalInputs: {
          ...DEFAULT_RANKING_URL_STATE.conditions.canonicalInputs,
          criticalStars: 50,
          enemyCount: 3,
        },
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
    const state = parseRankingUrlState('?rNp=9&rHp=-1&rStars=1000&rMode=unknown');
    expect(state.conditions).toMatchObject({
      comparisonMode: 'standard',
      npLevel: 1,
      attackerHpPermille: 1_000,
      canonicalInputs: { criticalStars: null },
    });
  });

  it('preserves an explicitly missing required battle quantity', () => {
    const state = {
      ...DEFAULT_RANKING_URL_STATE,
      conditions: {
        ...DEFAULT_RANKING_URL_STATE.conditions,
        attackerHpPermille: null,
        battlePointPhase: null,
      },
    };
    expect(parseRankingUrlState(serializeRankingUrlState(state))).toEqual(state);
  });
});
