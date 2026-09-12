import { describe, expect, it } from 'vitest';
import type { AtlasFunction } from './atlasContract';
import { normalizeNpBuffCount, normalizeCountedBuffMutation } from './npCountNormalization';
import { normalizeFunctions } from './effectNormalization';

const names = new Map([
  [17, 'counted'],
  [18, 'positive'],
]);
const definitions = new Map([['counted', ['counted', 'positive']]]);
const selectors = new Set(['counted']);
const count: AtlasFunction = {
  funcId: 1,
  funcType: 'gainNpBuffIndividualSum',
  funcTargetType: 'self',
  funcTargetTeam: 'player',
  traitVals: [{ id: 17 }],
  svals: [{ Rate: 1000, Value: 5000 }],
};
const rows = [count.svals!, [], [], [], []];

describe('NP buff instance count normalization', () => {
  it('normalizes anonymous actor identities only through explicit actor readers, independently of buff markers', () => {
    const fn: AtlasFunction = {
      funcId: 4,
      funcType: 'addState',
      funcTargetType: 'self',
      funcTargetTeam: 'player',
      buffs: [{ type: 'addIndividuality', vals: [{ id: 17 }] }],
      svals: [{ Rate: 1000, Value: 10009, Count: -1, Turn: 3 }],
    };
    const catalog = {
      stateOnlyTraits: new Set<string>(),
      actorTraitReferences: new Set([10009]),
      countedBuffTraits: selectors,
      countedBuffDefinitions: definitions,
    };
    const normalized = normalizeFunctions(
      [fn],
      names,
      'skill',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      catalog,
    )[0]!;
    expect(normalized.execution).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'contextMutation',
          mutation: 'addTrait',
          trait: 'traitId:10009',
        }),
        expect.objectContaining({
          kind: 'buffInstanceMutation',
          mutation: 'grant',
          traits: ['counted'],
        }),
      ]),
    );
    const marker = normalizeFunctions(
      [{ ...fn, svals: [{ Rate: 1000, Value: 9999, Count: -1, Turn: 3 }] }],
      names,
      'skill',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      catalog,
    )[0]!;
    expect(marker.execution.some((operation) => operation.kind === 'contextMutation')).toBe(false);
  });
  it('keeps the count selector, every amount cell and an initial instance signature', () => {
    const result = normalizeNpBuffCount(count, rows, names, definitions);
    expect(result).toMatchObject({
      operation: {
        kind: 'resourceMutation',
        resource: 'npGauge',
        amount: { kind: 'buffCount', trait: 'counted', values: [[5000], [], [], [], []] },
      },
      input: {
        kind: 'buffInstanceCount',
        instanceTraits: ['counted', 'positive'],
        defaultValue: 0,
        maximum: 6,
      },
    });
    expect(
      normalizeNpBuffCount(
        { ...count, traitVals: [{ id: 17 }, { id: 18 }] },
        rows,
        names,
        definitions,
      ),
    ).toBeNull();
    expect(
      normalizeNpBuffCount(
        count,
        [[{ Value: 5000, GainNpTargetPassiveIndividuality: 1 }], [], [], [], []],
        names,
        definitions,
      ),
    ).toBeNull();
    expect(normalizeNpBuffCount(count, rows, names, new Map())).toBeNull();
  });

  it('keeps buff identity independent of the actor individuality Value', () => {
    const grant: AtlasFunction = {
      funcId: 2,
      funcType: 'addState',
      funcTargetType: 'self',
      funcTargetTeam: 'player',
      buffs: [{ type: 'addIndividuality', vals: [{ id: 17 }, { id: 18 }] }],
      svals: [{ Value: 9999, Count: -1, Turn: 3 }],
    };
    expect(normalizeCountedBuffMutation(grant, names, selectors, definitions, false)).toEqual([
      {
        kind: 'buffInstanceMutation',
        mutation: 'grant',
        recipient: 'sourceSelf',
        lifetime: 'active',
        traits: ['counted', 'positive'],
      },
    ]);
    expect(
      normalizeCountedBuffMutation(
        { ...grant, svals: [{ Value: 0, Count: 1 }] },
        names,
        selectors,
        definitions,
        false,
      )[0],
    ).toMatchObject({ mutation: 'unsupported' });
    expect(
      normalizeCountedBuffMutation(
        { ...grant, svals: [{ Value: 0, SameBuffLimitNum: 3 }] },
        names,
        selectors,
        definitions,
        false,
      )[0],
    ).toMatchObject({ mutation: 'unsupported' });
    for (const metadata of [{ IgnoreIndividuality: 1 }, { UnSubState: 1 }, { AddIndividualty: 17 }])
      expect(
        normalizeCountedBuffMutation(
          { ...grant, svals: [{ Value: 0, Count: -1, ...metadata }] },
          names,
          selectors,
          definitions,
          false,
        )[0],
      ).toMatchObject({ mutation: 'unsupported' });
    expect(
      normalizeCountedBuffMutation(
        {
          ...grant,
          buffs: [{ type: 'upAtk', vals: [{ id: 18 }] }],
          svals: [{ Value: 0, Count: -1, AddIndividualty: 17 }],
        },
        names,
        selectors,
        definitions,
        false,
      )[0],
    ).toMatchObject({ mutation: 'unsupported' });
    expect(
      normalizeCountedBuffMutation(
        { ...grant, funcType: 'moveState', traitVals: [{ id: 18 }] },
        names,
        selectors,
        definitions,
        false,
      )[0],
    ).toMatchObject({ mutation: 'move' });
    expect(
      normalizeCountedBuffMutation(
        { ...grant, funcType: 'subState', traitVals: [{ id: 18 }], svals: [{ Rate: 1000 }] },
        names,
        selectors,
        definitions,
        false,
      )[0],
    ).toMatchObject({ mutation: 'remove' });
  });
});
