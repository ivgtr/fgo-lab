import { describe, expect, it } from 'vitest';
import { normalizeContributionScope } from './executionSemantics';

describe('canonical effect contribution scope', () => {
  it.each([
    ['self', undefined, 'personal'],
    ['commandTypeSelfTreasureDevice', 'player', 'personal'],
    ['ptOne', 'player', 'personal'],
    ['ptAll', 'player', 'partyWide'],
    ['ptFull', 'player', 'partyWide'],
    ['ptOther', 'player', 'partyOther'],
    ['ptOtherFull', 'player', 'partyOther'],
    ['enemy', 'playerAndEnemy', 'enemyApplied'],
    ['enemyAll', 'enemy', 'enemyApplied'],
    ['self', 'enemy', 'enemyApplied'],
  ] as const)('normalizes %s/%s without reusing recipient routing', (target, team, expected) => {
    expect(normalizeContributionScope(target, team)).toBe(expected);
  });

  it('does not guess an unknown raw target', () => {
    expect(normalizeContributionScope('unknownTarget')).toBeNull();
  });
});
