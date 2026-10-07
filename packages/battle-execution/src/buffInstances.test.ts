import { describe, expect, it } from 'vitest';
import {
  seedBuffInstances,
  countBuffInstances,
  applyBuffInstanceMutation,
  markerTraitRead,
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
  expect(countBuffInstances(removed, 'a', 'attacker', 'all')).toBe(3);
  expect(countBuffInstances(removed, 'a', 'target', 'all')).toBe(0);
  expect(markerTraitRead(removed, 'target', 'a')).toEqual({ known: true, count: 0 });
  expect(countBuffInstances(instances, 'a', 'target')).toBe(5);
});

it('retains marker instances, actor individuality, recipient identity, removal and known absence independently', () => {
  const operation = {
    kind: 'buffInstanceMutation' as const,
    mutation: 'grant' as const,
    recipient: 'sourceSelf' as const,
    traits: ['marker', 'positive'],
    lifetime: 'active' as const,
    marker: {
      actorTrait: 'actor-trait',
      buffIdentity: 'buff',
      removable: true,
      onField: false,
      recipientSide: 'both' as const,
    },
  };
  let instances = applyBuffInstanceMutation([], operation, { origin: 'attacker' }, 'first')!;
  instances = applyBuffInstanceMutation(instances, operation, { origin: 'attacker' }, 'second')!;
  instances = applyBuffInstanceMutation(
    instances,
    operation,
    { origin: 'support', sourceInstanceId: 'support:a' },
    'third',
  )!;
  expect(countBuffInstances(instances, 'marker')).toBe(2);
  expect(countBuffInstances(instances, 'actor-trait')).toBe(0);
  expect(countBuffInstances(instances, 'marker', 'support:a')).toBe(1);
  const removed = applyBuffInstanceMutation(
    instances,
    { ...operation, marker: undefined, mutation: 'remove', traits: ['positive'] },
    { origin: 'attacker' },
    'remove',
  )!;
  expect(markerTraitRead(removed, 'attacker', 'actor-trait')).toEqual({ known: true, count: 0 });
  expect(countBuffInstances(removed, 'marker', 'support:a')).toBe(1);
  expect(countBuffInstances(instances, 'marker')).toBe(2);
});

it('keeps unknown multiplicity nonnumeric and excludes the wrong recipient side', async () => {
  const { markerTraitRead } = await import('./buffInstances');
  const marker = {
    actorTrait: 'actor',
    buffIdentity: 'buff',
    removable: true,
    onField: true,
    recipientSide: 'ally' as const,
  };
  const op = {
    kind: 'buffInstanceMutation' as const,
    mutation: 'grant' as const,
    recipient: 'enemy' as const,
    traits: ['buff'],
    lifetime: 'active' as const,
    marker,
  };
  expect(applyBuffInstanceMutation([], op, { origin: 'attacker' }, 'enemy')).toEqual([]);
  const instances = [
    {
      identity: 'unknown',
      actor: 'attacker',
      count: 1,
      traits: ['buff'],
      lifetime: 'active' as const,
      marker,
      uncertain: true,
    },
  ];
  expect(countBuffInstances(instances, 'buff')).toBeNull();
  expect(markerTraitRead(instances, 'attacker', 'actor')).toEqual({ known: false, count: 0 });
  expect(markerTraitRead(instances, 'target', 'actor')).toBeNull();
  const removed = applyBuffInstanceMutation(
    instances,
    { ...op, mutation: 'remove', recipient: 'sourceSelf', marker: undefined },
    { origin: 'attacker' },
    'remove',
  )!;
  expect(countBuffInstances(removed, 'buff')).toBe(0);
  expect(markerTraitRead(removed, 'attacker', 'actor')?.known).toBe(true);
});

it('reconciles form-owned constants while retaining active and equipment instances', async () => {
  const { reconcileMarkerForm, markerTraitRead } = await import('./buffInstances');
  const marker = {
    actorTrait: 'old-actor',
    buffIdentity: 'old',
    removable: false,
    onField: true,
    recipientSide: 'both' as const,
  };
  const old = {
    identity: 'old',
    actor: 'attacker',
    traits: ['old'],
    lifetime: 'constant' as const,
    marker,
    count: 1,
    constantFormKey: 'old-form',
  };
  const { constantFormKey, ...portable } = old;
  expect(constantFormKey).toBe('old-form');
  const instances = [
    old,
    {
      ...portable,
      identity: 'active',
      lifetime: 'active' as const,
      traits: ['active'],
      marker: { ...marker, actorTrait: 'active-actor' },
    },
    {
      ...portable,
      identity: 'ce',
      traits: ['ce'],
      marker: { ...marker, actorTrait: 'ce-actor' },
    },
  ];
  const changed = reconcileMarkerForm(instances, 'new-form');
  expect(markerTraitRead(changed, 'attacker', 'old-actor')?.count).toBe(0);
  expect(countBuffInstances(changed, 'active', 'attacker', 'all')).toBe(1);
  expect(countBuffInstances(changed, 'ce', 'attacker', 'all')).toBe(1);
  expect(old.count).toBe(1);
});
