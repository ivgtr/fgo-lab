import { it, expect } from 'vitest';
import type { AtlasFunction } from './atlasContract';
import { normalizePopulationFunctions } from './populationFunctionNormalization';
const names = new Map([
  [1, 'beneficial'],
  [2, 'marker'],
  [3, 'counter'],
]);
const catalog = { stateOnlyTraits: new Set<string>(), populationBuffTraits: new Set(['counter']) };
function functions(): AtlasFunction[] {
  return [
    {
      funcType: 'subState',
      funcTargetType: 'enemyAll',
      traitVals: [{ id: 1 }],
      svals: [{ Rate: 1000, Value: 0, Value2: 1 }],
    },
    {
      funcType: 'addState',
      funcTargetType: 'enemyAll',
      buffs: [{ type: 'downCriticalrate', vals: [{ id: 2 }] }],
      svals: [{ Rate: -5000, Count: -1, Turn: 3, Value: 100 }],
    },
    {
      funcType: 'addState',
      funcTargetType: 'enemyAll',
      functvals: [{ id: 2 }],
      buffs: [{ type: 'addIndividuality', vals: [{ id: 3 }] }],
      svals: [{ Rate: 5000, Count: -1, Turn: 1, Value: 9999, ForceAddState: 1 }],
    },
  ];
}
it('compiles the marker backwards slice into positioned per-target functions and initial inputs', () => {
  const f = functions(),
    result = normalizePopulationFunctions(f, names, catalog);
  expect(result.size).toBe(3);
  expect(result.get(f[1]!)?.operation).toMatchObject({
    kind: 'populationFunction',
    position: 1,
    action: { kind: 'grant', previousSuccess: true, traits: ['marker'] },
  });
  expect([...result.values()].map((entry) => entry.operation)).toEqual([
    expect.objectContaining({ position: 0 }),
    expect.objectContaining({ position: 1 }),
    expect.objectContaining({ position: 2 }),
  ]);
  expect(result.get(f[0]!)?.operation).toMatchObject({
    action: {
      inputKeys: [
        'population:enemy:0:removableBuffs:beneficial',
        'population:enemy:1:removableBuffs:beneficial',
        'population:enemy:2:removableBuffs:beneficial',
      ],
    },
  });
  expect(result.get(f[2]!)?.operation).toMatchObject({
    action: {
      condition: {
        inputKeys: [
          'population:enemy:0:traitPresence:marker',
          'population:enemy:1:traitPresence:marker',
          'population:enemy:2:traitPresence:marker',
        ],
      },
    },
  });
  expect(
    result
      .get(f[0]!)
      ?.inputs.filter((i) => i.kind === 'populationActorValue')
      .map((i) => i.maximum),
  ).toEqual([1, 1, 1]);
  expect(result.get(f[2]!)?.operation).toMatchObject({
    action: { condition: { trait: 'marker' } },
  });
});

it('excludes actor, population-read, and state-only identities from individuality grants', () => {
  for (const catalog of [
    {
      stateOnlyTraits: new Set(['counter']),
      populationBuffTraits: new Set(['counter']),
    },
    {
      stateOnlyTraits: new Set<string>(),
      populationReadTraits: new Set(['counter']),
      populationBuffTraits: new Set(['counter']),
    },
    {
      stateOnlyTraits: new Set<string>(),
      actorTraitReferences: new Set([3]),
      populationBuffTraits: new Set(['counter']),
    },
  ]) {
    const f = functions();
    f[2]!.svals![0]!.Value = 3;
    expect(normalizePopulationFunctions(f, names, catalog).size).toBe(0);
  }
});
it('refuses partial/unknown, damage-affecting, finite-use and negative-predicate branches as one slice', () => {
  for (const mutate of [
    (f: AtlasFunction[]) => {
      f[0]!.svals![0]!.Value2 = 2;
    },
    (f: AtlasFunction[]) => {
      f[1]!.buffs![0]!.type = 'upAttack';
    },
    (f: AtlasFunction[]) => {
      f[1]!.svals![0]!.Count = 1;
    },
    (f: AtlasFunction[]) => {
      f[2]!.functvals![0]!.negative = true;
    },
    (f: AtlasFunction[]) => {
      f[1]!.svals![0]!.Rate = -500;
    },
  ]) {
    const f = functions();
    mutate(f);
    expect(normalizePopulationFunctions(f, names, catalog).size).toBe(0);
  }
});

it('fails closed on a cyclic marker dependency without retaining a partial slice', () => {
  const f = functions();
  f[1]!.svals![0]!.Rate = 5000;
  f[1]!.functvals = [{ id: 3 }];
  expect(normalizePopulationFunctions(f, names, catalog).size).toBe(0);
});
