import { describe, expect, it } from 'vitest';
import {
  seedBuffInstances,
  countBuffInstances,
  applyBuffInstanceMutation,
  projectBuffInstanceCounts,
  type BuffCountInput,
} from './buffInstances';

const input: BuffCountInput = {
  kind: 'effectStackCount',
  key: 'count:a',
  owner: 'attacker',
  quantitySource: { scope: 'attackerState', trait: 'a' },
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
    const alias = {
      ...input,
      key: 'count:positive',
      quantitySource: { scope: 'attackerState' as const, trait: 'positive' },
    };
    const state = seedBuffInstances([input, alias], { 'count:a': 2, 'count:positive': 2 });
    expect(state).toHaveLength(1);
    expect(countBuffInstances(state, 'a')).toBe(2);
    expect(countBuffInstances(state, 'positive')).toBe(2);
    expect(countBuffInstances([{ ...state[0]!, lifetime: 'constant' }], 'a')).toBe(0);
    expect(countBuffInstances([{ ...state[0]!, actor: 'target' }], 'a')).toBe(0);
  });

  it('rejects contradictory, missing and ambiguous initial state without silently seeding zero', () => {
    expect(() => seedBuffInstances([{ ...input, defaultValue: Number.NaN }], {})).toThrow(
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

it('keeps recipient counts separate, applies the grant cap live, and projects removal back to stack reads', () => {
  const target = {
    ...input,
    key: 'stack:targetState:a',
    owner: 'target' as const,
    quantitySource: { scope: 'targetState' as const, trait: 'a' },
  };
  const instances = seedBuffInstances([input, target], { [input.key]: 2, [target.key]: 5 });
  const grant = {
    kind: 'buffInstanceMutation' as const,
    mutation: 'grant' as const,
    recipient: 'partyMember' as const,
    traits: ['a', 'positive'],
    lifetime: 'active' as const,
    grantLimit: { trait: 'a', maximum: 3 },
  };
  const withConstant = [
    ...instances,
    {
      identity: 'constant',
      actor: 'attacker' as const,
      traits: ['a'],
      lifetime: 'constant' as const,
      count: 1,
    },
  ];
  expect(countBuffInstances(withConstant, 'a', 'attacker')).toBe(2);
  expect(
    applyBuffInstanceMutation(withConstant, grant, { origin: 'support' }, 'constant-cap'),
  ).toBe(withConstant);
  const next = applyBuffInstanceMutation(instances, grant, { origin: 'support' }, 'grant')!;
  expect(countBuffInstances(next, 'a', 'attacker')).toBe(3);
  expect(countBuffInstances(next, 'a', 'target')).toBe(5);
  expect(applyBuffInstanceMutation(next, grant, { origin: 'support' }, 'capped')).toBe(next);
  expect(
    applyBuffInstanceMutation(
      next,
      { ...grant, recipient: 'sourceSelf' },
      { origin: 'support' },
      'other-owner',
    ),
  ).toBe(next);
  const removed = applyBuffInstanceMutation(
    next,
    {
      kind: 'buffInstanceMutation',
      mutation: 'remove',
      recipient: 'enemy',
      traits: ['positive'],
      lifetime: 'active',
    },
    { origin: 'attacker' },
    'remove',
  )!;
  const projected = projectBuffInstanceCounts(
    {
      buffInstances: removed,
      stackCounts: { attackerState: {}, targetState: {}, field: {} },
      stateTraits: { attackerState: new Set<string>(), targetState: new Set<string>(['a']) },
    },
    [input, target],
  );
  expect(projected.stackCounts).toEqual({
    attackerState: { a: 3 },
    targetState: { a: 0 },
    field: {},
  });
  expect(projected.stateTraits.targetState.has('a')).toBe(false);
  expect(countBuffInstances(instances, 'a', 'target')).toBe(5);
});
