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
