import { describe, expect, it } from 'vitest';
import { normalizeContributionScope, normalizeExecutionSemantics } from './executionSemantics';

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

  it('coalesces duplicate state evidence into one damage-relevant mutation', () => {
    expect(
      normalizeExecutionSemantics({
        fn: { funcType: 'addState', funcTargetType: 'enemy' },
        parameterSets: [[]],
        valueExpressions: [[], [], [], [], []],
        cardTypes: [],
        canonicalOperations: [],
        contextChanges: {
          addedFieldTraits: [],
          removedFieldTraits: [],
          addedRecipientTraits: ['marking'],
          addedRecipientStateTraits: ['marking'],
          removedRecipientTraits: [],
          removedRecipientStateTraits: [],
        },
        quantityApplicationTiming: 'duringExecution',
      }),
    ).toEqual([
      {
        kind: 'contextMutation',
        mutation: 'addTrait',
        scope: 'recipientState',
        targetPolicy: 'enemy',
        contributionScope: 'enemyApplied',
        trait: 'marking',
        damageRelevant: true,
      },
    ]);
  });
});
