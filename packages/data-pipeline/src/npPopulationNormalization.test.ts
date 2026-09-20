import { describe, expect, it } from 'vitest';
import type { AtlasFunction } from './atlasContract';
import {
  normalizeNpPopulationCount,
  normalizePopulationMutation,
} from './npPopulationNormalization';
const names = new Map([
  [1, 'first'],
  [2, 'second'],
]);
const catalog = {
  stateOnlyTraits: new Set<string>(),
  populationReadTraits: new Set(['first', 'second']),
  populationBuffTraits: new Set<string>(),
  populationIntrinsicTraits: new Set(['first', 'second']),
};
const fn: AtlasFunction = {
  funcId: 1,
  funcType: 'gainNpTargetSum',
  funcTargetType: 'self',
  funcTargetTeam: 'player',
  traitVals: [{ id: 1 }, { id: 2 }],
  svals: [{ Rate: 1000, Value: 1000, Value2: 4, GainNpTargetPassiveIndividuality: 1 }],
};
describe('NP population count canonical boundary', () => {
  it('retains recipient-independent scope, count unit, and every NP/OC cell', () => {
    const rows = [fn.svals!, [{ ...fn.svals![0]!, Value: 2000 }], [], [], []];
    const result = normalizeNpPopulationCount(fn, rows, names, catalog);
    expect(result?.operation).toMatchObject({
      kind: 'resourceMutation',
      recipient: 'sourceSelf',
      amount: {
        kind: 'populationCount',
        selector: {
          scope: 'otherActors',
          counting: 'actors',
          basis: 'actorTraits',
          traits: ['first', 'second'],
          includePassive: true,
        },
        values: [[1000], [2000], [], [], []],
      },
    });
    expect(result?.inputs.filter((input) => input.kind === 'populationSize')).toHaveLength(2);
    if (result?.operation.kind !== 'resourceMutation') throw new Error('population operation');
    if (result.operation.amount.kind !== 'populationCount') throw new Error('population amount');
    expect(result.operation.amount.inputKey).toBe(
      result.inputs.find((input) => input.kind === 'populationCount')?.key,
    );
    const individual = normalizeNpPopulationCount(
      { ...fn, funcType: 'gainNpIndividualSum' },
      rows,
      names,
      catalog,
    );
    expect(individual?.operation).toMatchObject({
      amount: { selector: { counting: 'individualities' } },
    });
  });

  it.each([
    [0, 'recipient', 0],
    [1, 'allies', 1],
    [2, 'enemies', 1],
    [3, 'allActors', 2],
    [4, 'otherActors', 2],
  ] as const)(
    'maps Atlas scope %s to %s without changing recipient inputs',
    (value, scope, size) => {
      const result = normalizeNpPopulationCount(
        { ...fn, funcTargetType: 'enemy', funcTargetTeam: 'enemy' },
        [[{ ...fn.svals![0]!, Value2: value }]],
        names,
        catalog,
      );
      expect(result?.operation).toMatchObject({
        recipient: 'enemy',
        amount: { selector: { scope } },
      });
      expect(result?.inputs.filter((input) => input.kind === 'populationSize')).toHaveLength(size);
    },
  );

  it('keeps in-battle basis and buff-instance basis distinct from actor traits', () => {
    const inBattle = normalizeNpPopulationCount(
      {
        ...fn,
        funcType: 'gainNpIndividualSum',
        traitVals: [{ id: 5000 }],
      },
      [fn.svals!],
      new Map([...names, [5000, 'inBattle']]),
      catalog,
    );
    expect(inBattle?.operation).toMatchObject({
      amount: {
        selector: { basis: 'inBattle', counting: 'individualities', traits: ['inBattle'] },
      },
    });
    expect(inBattle?.inputs.filter((input) => input.kind === 'populationCount')).toHaveLength(0);

    const buff = normalizeNpPopulationCount(
      {
        ...fn,
        funcType: 'gainNpIndividualSum',
        traitVals: [{ id: 3 }],
      },
      [[{ ...fn.svals![0]!, Value2: 2, GainNpTargetPassiveIndividuality: 0 }]],
      new Map([...names, [3, 'countedBuff']]),
      { ...catalog, populationBuffTraits: new Set(['countedBuff']) },
    );
    expect(buff?.operation).toMatchObject({
      amount: {
        selector: {
          scope: 'enemies',
          basis: 'buffInstances',
          counting: 'individualities',
          includePassive: false,
        },
      },
    });
    expect(buff?.inputs.find((input) => input.kind === 'populationCount')).toMatchObject({
      maximum: 30,
    });
  });

  it('refuses unknown metadata, changed scope, negative selectors, mixed intrinsic/buff identity', () => {
    expect(
      normalizeNpPopulationCount(fn, [[{ ...fn.svals![0]!, FutureKey: 1 }]], names, catalog),
    ).toBeNull();
    expect(
      normalizeNpPopulationCount(
        fn,
        [[fn.svals![0]!, { ...fn.svals![0]!, Value2: 2 }]],
        names,
        catalog,
      ),
    ).toBeNull();
    expect(
      normalizeNpPopulationCount(
        { ...fn, traitVals: [{ id: 1, negative: true }] },
        [fn.svals!],
        names,
        catalog,
      ),
    ).toBeNull();
    expect(
      normalizeNpPopulationCount(fn, [fn.svals!], names, {
        ...catalog,
        populationBuffTraits: new Set(['first']),
      }),
    ).toBeNull();
  });
  it('keeps cohort-wide grant ownership and refuses finite/conditional lifetimes', () => {
    const grant: AtlasFunction = {
      funcId: 2,
      funcType: 'addState',
      funcTargetType: 'fieldOther',
      funcTargetTeam: 'playerAndEnemy',
      buffs: [{ type: 'addIndividuality', vals: [] }],
      svals: [{ Rate: 1000, Value: 1, Turn: 3, Count: -1 }],
    };
    expect(normalizePopulationMutation(grant, names, catalog, false)).toEqual([
      {
        kind: 'populationMutation',
        mutation: 'grant',
        basis: 'actorTraits',
        scope: 'otherActors',
        traits: ['first'],
        includePassive: false,
      },
    ]);
    expect(
      normalizePopulationMutation(
        { ...grant, svals: [{ ...grant.svals![0]!, Count: 1 }] },
        names,
        catalog,
        false,
      )[0],
    ).toMatchObject({ mutation: 'unsupported' });
  });
  it('refuses actor-trait removal selected through a buff identity and changing grant cells', () => {
    const remove: AtlasFunction = {
      funcId: 3,
      funcType: 'subState',
      funcTargetType: 'enemyAll',
      traitVals: [{ id: 2 }],
      svals: [{ Rate: 1000 }],
    };
    expect(
      normalizePopulationMutation(
        remove,
        names,
        { ...catalog, populationTraitGrantSelectors: new Map([['first', ['second']]]) },
        false,
      ),
    ).toContainEqual({
      kind: 'populationMutation',
      mutation: 'unsupported',
      scope: 'enemies',
      basis: 'actorTraits',
      traits: ['first'],
      includePassive: false,
    });
    const grant: AtlasFunction = {
      funcId: 4,
      funcType: 'addState',
      funcTargetType: 'enemyAll',
      buffs: [{ type: 'addIndividuality' }],
      svals: [
        { Value: 1, Count: -1 },
        { Value: 2, Count: -1 },
      ],
    };
    expect(normalizePopulationMutation(grant, names, catalog, false)[0]).toMatchObject({
      mutation: 'unsupported',
    });
  });
});
