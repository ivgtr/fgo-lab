import { describe, expect, it } from 'vitest';
import { activationFactsForCondition } from './activationContext';

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
});
