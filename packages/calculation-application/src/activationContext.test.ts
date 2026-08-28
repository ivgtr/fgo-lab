import { describe, expect, it } from 'vitest';
import {
  activationFactsForCondition,
  setActivationWitnessesForConsumer,
} from './activationContext';

describe('activation fact materialization', () => {
  it('materializes the only activation-owned branch of a mixed OR condition', () => {
    expect(
      activationFactsForCondition({
        kind: 'any',
        expressions: [
          { kind: 'trait', scope: 'field', trait: 'fieldSunlight', present: true },
          { kind: 'operationTrigger', source: 'skill', position: 1 },
        ],
      }),
    ).toEqual([{ kind: 'operationTrigger', source: 'skill', position: 1 }]);
  });

  it('rejects an OR whose activation witness is not uniquely selectable', () => {
    expect(() =>
      activationFactsForCondition({
        kind: 'any',
        expressions: [
          { kind: 'choice', group: 'mode', candidate: 'attack' },
          { kind: 'choice', group: 'mode', candidate: 'npDamage' },
        ],
      }),
    ).toThrow('ambiguous_activation_condition_alternative');
  });

  it('stores one canonical fact with every consumer and removes only the disabled consumer', () => {
    const fact = { kind: 'choice' as const, group: 'skill:choice', candidate: '2' };
    const first = setActivationWitnessesForConsumer([], 'effect:attack', [fact], true);
    const shared = setActivationWitnessesForConsumer(first, 'effect:npDamage', [fact], true);
    expect(shared).toEqual([
      {
        fact,
        consumerDecisionKeys: ['effect:attack', 'effect:npDamage'],
      },
    ]);
    expect(setActivationWitnessesForConsumer(shared, 'effect:attack', [fact], false)).toEqual([
      { fact, consumerDecisionKeys: ['effect:npDamage'] },
    ]);
  });

  it('replaces an exclusive choice witness instead of retaining conflicting consumers', () => {
    const attack = { kind: 'choice' as const, group: 'skill:choice', candidate: 'attack' };
    const npDamage = { kind: 'choice' as const, group: 'skill:choice', candidate: 'npDamage' };
    const initial = setActivationWitnessesForConsumer([], 'effect:attack', [attack], true);
    expect(setActivationWitnessesForConsumer(initial, 'effect:npDamage', [npDamage], true)).toEqual(
      [{ fact: npDamage, consumerDecisionKeys: ['effect:npDamage'] }],
    );
  });
});
