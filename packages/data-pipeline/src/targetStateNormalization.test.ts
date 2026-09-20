import { describe, expect, it } from 'vitest';
import type { AtlasFunction, AtlasServant } from './atlasContract';
import { normalizeFunctions, normalizeNpDamageFunction } from './effectNormalization';
import {
  classifyPopulationTraitGrantability,
  collectDamageReachableStateCatalog,
  normalizeDamageReachableStateMutations,
} from './targetStateNormalization';

const poisonGrant: AtlasFunction = {
  funcId: 1,
  funcType: 'addState',
  funcTargetType: 'enemy',
  buffs: [
    {
      type: 'poison',
      vals: [
        { id: 3_005, name: 'buffNegativeEffect' },
        { id: 3_017, name: 'buffPoison' },
        { id: 9_999, name: 'damageIrrelevantState' },
      ],
    },
  ],
  svals: [{ Rate: 1_000 }],
};
const poisonConsumer: AtlasFunction = {
  funcId: 2,
  funcType: 'damageNpStateIndividualFix',
  funcTargetType: 'enemy',
  svals: Array.from({ length: 5 }, () => ({
    Rate: 1_000,
    Value: 9_000,
    Target: 3_017,
    Correction: 1_500,
  })),
  svals2: Array.from({ length: 5 }, () => ({ Rate: 1_000, Value: 9_000, Target: 3_017 })),
  svals3: Array.from({ length: 5 }, () => ({ Rate: 1_000, Value: 9_000, Target: 3_017 })),
  svals4: Array.from({ length: 5 }, () => ({ Rate: 1_000, Value: 9_000, Target: 3_017 })),
  svals5: Array.from({ length: 5 }, () => ({ Rate: 1_000, Value: 9_000, Target: 3_017 })),
};
const rawServant: AtlasServant = {
  id: 1,
  skills: [{ id: 10, functions: [poisonGrant] }],
  noblePhantasms: [{ id: 11, functions: [poisonConsumer] }],
};
const traitNames = new Map([
  [3_005, 'buffNegativeEffect'],
  [3_017, 'buffPoison'],
]);

describe('damage-reachable target-state normalization', () => {
  it('normalizes only state identities read by a damage consumer', () => {
    const catalog = collectDamageReachableStateCatalog(
      { servants: [rawServant], equips: [], mysticCodes: [], referencedSkills: [] },
      traitNames,
    );
    expect([...catalog.stateOnlyTraits]).toEqual(['buffPoison']);
    expect(catalog.populationTraitCatalog?.get('buffPoison')).toMatchObject({
      grantable: false,
    });
    expect(catalog.populationTraitCatalog?.get('buffPoison')?.roles).toContain('stateOnly');
    expect(classifyPopulationTraitGrantability({ id: 3_017 }, traitNames, catalog)).toMatchObject({
      name: 'buffPoison',
      grantable: false,
    });
    expect(normalizeDamageReachableStateMutations(poisonGrant, catalog, traitNames)).toEqual({
      added: ['buffPoison'],
      removed: [],
    });
    expect(
      normalizeFunctions(
        [poisonGrant],
        traitNames,
        'skill',
        1,
        new Map(),
        undefined,
        undefined,
        undefined,
        catalog,
      )[0]?.execution,
    ).toContainEqual({
      kind: 'contextMutation',
      mutation: 'addTrait',
      scope: 'recipientState',
      route: {
        target: 'enemy',
        contributionScope: 'enemyApplied',
        eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
      },
      trait: 'buffPoison',
      damageRelevant: true,
    });
  });

  it('marks state-only trait-count inputs without changing permanent traits', () => {
    const catalog = { stateOnlyTraits: new Set(['buffPoison']) };
    const damage = normalizeNpDamageFunction(
      {
        ...poisonConsumer,
        funcType: 'damageNpIndividualSum',
        svals: (poisonConsumer.svals ?? []).map((value) => ({
          ...value,
          Target: 1,
          TargetList: [3_017],
          ParamAddMaxCount: 1,
        })),
        svals2: (poisonConsumer.svals2 ?? []).map((value) => ({
          ...value,
          Target: 1,
          TargetList: [3_017],
        })),
        svals3: (poisonConsumer.svals3 ?? []).map((value) => ({
          ...value,
          Target: 1,
          TargetList: [3_017],
        })),
        svals4: (poisonConsumer.svals4 ?? []).map((value) => ({
          ...value,
          Target: 1,
          TargetList: [3_017],
        })),
        svals5: (poisonConsumer.svals5 ?? []).map((value) => ({
          ...value,
          Target: 1,
          TargetList: [3_017],
        })),
      },
      'fixture',
      traitNames,
      new Map(),
      catalog,
    );
    expect(damage.stateTraitNames).toEqual(['buffPoison']);
  });

  it('does not route attacker state through the target-state operation family', () => {
    const catalog = collectDamageReachableStateCatalog(
      {
        servants: [
          {
            ...rawServant,
            skills: [{ id: 10, functions: [{ ...poisonGrant, funcTargetType: 'self' }] }],
          },
        ],
        equips: [],
        mysticCodes: [],
        referencedSkills: [],
      },
      traitNames,
    );
    expect([...catalog.stateOnlyTraits]).toEqual([]);
    const effects = normalizeFunctions(
      [{ ...poisonGrant, funcTargetType: 'self' }],
      traitNames,
      'skill',
      1,
      new Map(),
      undefined,
      undefined,
      undefined,
      catalog,
    );
    expect(effects[0]?.execution).not.toContainEqual(
      expect.objectContaining({ kind: 'contextMutation', scope: 'recipientState' }),
    );
  });

  it('keeps identities that can be intrinsic on the combined trait layer', () => {
    const catalog = collectDamageReachableStateCatalog(
      {
        servants: [{ ...rawServant, traits: [{ id: 3_017, name: 'buffPoison' }] }],
        equips: [],
        mysticCodes: [],
        referencedSkills: [],
      },
      traitNames,
    );
    expect([...catalog.stateOnlyTraits]).toEqual([]);
  });

  it('normalizes explicit removal with the same canonical identity', () => {
    const removal: AtlasFunction = {
      funcId: 3,
      funcType: 'subState',
      funcTargetType: 'enemy',
      traitVals: [{ id: 3_017, name: 'buffPoison' }],
    };
    expect(
      normalizeDamageReachableStateMutations(
        removal,
        { stateOnlyTraits: new Set(['buffPoison']) },
        traitNames,
      ),
    ).toEqual({ added: [], removed: ['buffPoison'] });
  });
});
