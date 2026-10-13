import { describe, expect, it } from 'vitest';
import { parseRawFunctionValues } from './rawFunctionValues';

describe('raw Atlas function value parsing', () => {
  it('reads positional skill cells and named values without losing the source rate', () => {
    expect(parseRawFunctionValues('[1200,3,-1,90,HideMiss:1]', 'addStateShort')).toEqual({
      Rate: 1200,
      Turn: 3,
      Count: -1,
      Value: 90,
      HideMiss: 1,
    });
  });

  it('resolves nested dependency values and keeps the referenced function ID', () => {
    expect(
      parseRawFunctionValues(
        '[1000,DependFuncId1:[3962],DependFuncVals1:[1000,2000]]',
        'gainHpFromTargets',
        {
          functionKindById: (id) => {
            expect(id).toBe(3962);
            return 'lossHpSafe';
          },
        },
      ),
    ).toEqual({
      Rate: 1000,
      DependFuncId: 3962,
      DependFuncVals: { Rate: 1000, Value: 2000 },
    });
  });

  it('rejects a positional value with no meaning in the function kind', () => {
    expect(() => parseRawFunctionValues('[1000,1,2,3,4,5,6]', 'addStateShort')).toThrow(
      'raw_function_values:unknown_position',
    );
  });

  it('reports an identical duplicate and rejects contradictory values', () => {
    const duplicates: string[] = [];
    expect(
      parseRawFunctionValues('[1000,ForceAddState:1,ForceAddState:1]', 'addState', {
        onIdenticalDuplicate: (key) => duplicates.push(key),
      }),
    ).toEqual({ Rate: 1000, ForceAddState: 1 });
    expect(duplicates).toEqual(['ForceAddState']);
    expect(() =>
      parseRawFunctionValues('[1000,ForceAddState:1,ForceAddState:2]', 'addState'),
    ).toThrow('raw_function_values:contradictory_duplicate:ForceAddState');
  });
});
