import { describe, expect, it } from 'vitest';
import { seedBuffInstances, countBuffInstances, type BuffCountInput } from './buffInstances';

const input: BuffCountInput = {
  kind: 'buffInstanceCount',
  key: 'count:a',
  owner: 'attacker',
  trait: 'a',
  instanceTraits: ['a', 'positive'],
  label: '状態数',
  description: '初期状態数',
  minimum: 0,
  maximum: 6,
  step: 1,
  defaultValue: 0,
  defaultReason: '外部付与なし',
};

describe('initial buff instance identity', () => {
  it('counts a multi-trait instance once and keeps aliases on the same physical state', () => {
    const alias = { ...input, key: 'count:positive', trait: 'positive' };
    const state = seedBuffInstances([input, alias], { 'count:a': 2, 'count:positive': 2 });
    expect(state).toHaveLength(1);
    expect(countBuffInstances(state, 'a')).toBe(2);
    expect(countBuffInstances(state, 'positive')).toBe(2);
    expect(countBuffInstances([{ ...state[0]!, lifetime: 'constant' }], 'a')).toBe(0);
    expect(countBuffInstances([{ ...state[0]!, actor: 'target' }], 'a')).toBe(0);
  });

  it('rejects contradictory, missing and ambiguous initial state without silently seeding zero', () => {
    expect(() => seedBuffInstances([{ ...input, defaultValue: null }], {})).toThrow(
      'invalid_initial_buff_count',
    );
    for (const count of [-1, 0.5, 7, Number.NaN])
      expect(() => seedBuffInstances([input], { [input.key]: count })).toThrow(
        'invalid_initial_buff_count',
      );
    expect(() =>
      seedBuffInstances([input, { ...input, key: 'alias' }], { [input.key]: 1, alias: 2 }),
    ).toThrow('conflicting_initial_buff_counts');
    expect(() =>
      seedBuffInstances([input, { ...input, key: 'other', instanceTraits: ['a', 'negative'] }], {}),
    ).toThrow('ambiguous_initial_buff_counts');
  });
});
