import type { BattleOperation } from './contracts';
import { closeResourceMutationSemantics } from './resourceSemantics';
import { describe, expect, it } from 'vitest';

const resourceOperation = {
  kind: 'resourceMutation',
  resource: 'hp',
  resolution: 'resourceStateUnavailable',
  direction: 'loss',
  unit: 'fixed',
  amount: 1_000,
  subjectId: null,
  condition: { kind: 'always' },
} as unknown as BattleOperation;

describe('resource semantic closure', () => {
  it('proves an unread resource transition irrelevant', () => {
    expect(closeResourceMutationSemantics([resourceOperation])).toEqual([
      expect.objectContaining({
        kind: 'resourceMutation',
        resolution: 'noDamageReader',
      }),
    ]);
  });

  it('keeps an unrepresentable transition unsupported when later damage reads it', () => {
    const reader = {
      kind: 'executeNpDamage',
      condition: { kind: 'always' },
      specialAttackDependency: {
        kind: 'quantity',
        quantity: 'attackerHpPermille',
        comparison: 'lessThan',
        value: 1_000,
      },
    } as unknown as BattleOperation;
    expect(closeResourceMutationSemantics([resourceOperation, reader])[0]).toMatchObject({
      kind: 'resourceMutation',
      resource: 'hp',
      resolution: 'resourceStateUnavailable',
    });
  });

  it('routes star changes to the terminal canonical star input owner', () => {
    const stars = { ...resourceOperation, resource: 'criticalStars' } as BattleOperation;
    expect(closeResourceMutationSemantics([stars])).toEqual([
      expect.objectContaining({
        kind: 'resourceMutation',
        resource: 'criticalStars',
        resolution: 'representedByTerminalInput',
        amount: 1_000,
      }),
    ]);
  });
});
