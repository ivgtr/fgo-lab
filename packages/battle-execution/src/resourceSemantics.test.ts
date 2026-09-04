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

  it.each(['gain', 'loss'] as const)(
    'routes a star %s through ordered state when a later damage condition reads stars',
    (direction) => {
      const stars = {
        ...resourceOperation,
        resource: 'criticalStars',
        direction,
      } as BattleOperation;
      const reader = {
        kind: 'addModifier',
        condition: {
          kind: 'inputQuantity',
          inputKey: 'battle:criticalStars',
          comparison: 'atLeast',
          value: 10,
        },
        valueExpression: null,
      } as unknown as BattleOperation;
      expect(closeResourceMutationSemantics([stars, reader])[0]).toMatchObject({
        kind: 'resourceMutation',
        resource: 'criticalStars',
        resolution: 'orderedCriticalStars',
        direction,
      });
    },
  );

  it('uses an ordered suffix proof instead of treating an earlier reader as downstream', () => {
    const stars = { ...resourceOperation, resource: 'criticalStars' } as BattleOperation;
    const reader = {
      kind: 'addModifier',
      condition: {
        kind: 'inputQuantity',
        inputKey: 'battle:criticalStars',
        comparison: 'atLeast',
        value: 10,
      },
      valueExpression: null,
    } as unknown as BattleOperation;
    expect(closeResourceMutationSemantics([reader, stars])[1]).toMatchObject({
      resolution: 'noDamageReader',
    });
  });
});
