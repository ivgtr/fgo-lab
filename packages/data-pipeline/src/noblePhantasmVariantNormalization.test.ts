import { describe, expect, it } from 'vitest';
import type { AtlasFunction, AtlasServant } from './atlasContract';
import { normalizeNoblePhantasmVariants } from './noblePhantasmVariantNormalization';

function np(id: number, card: '1' | '2' | '3', priority = 1, tdTypeChangeIDs?: number[]) {
  return {
    id,
    name: `NP ${String(id)}`,
    card,
    priority,
    functions: [],
    ...(tdTypeChangeIDs ? { script: { tdTypeChangeIDs } } : {}),
  };
}

function selection(type: string, candidate = 1): AtlasFunction {
  return {
    funcId: 10,
    funcType: 'addState',
    svals: [{ ActSet: candidate }],
    buffs: [{ type }],
  };
}

function servant(
  functions: AtlasFunction[],
  noblePhantasms: ReturnType<typeof np>[],
): AtlasServant {
  return {
    id: 100,
    name: 'fixture',
    noblePhantasms,
    skills: [{ id: 20, num: 1, functions }],
  };
}

describe('canonical noble phantasm variant normalization', () => {
  const sourceRoute = {
    target: 'sourceActor' as const,
    contributionScope: 'personal' as const,
    eligibility: {
      kind: 'requiredRecipient' as const,
      recipient: 'attacker' as const,
      onMissing: 'ignore' as const,
      onMismatch: 'ignore' as const,
    },
  };
  it('uses the td suffix only as an index and preserves the selected variant identity', () => {
    const select = selection('tdTypeChangeBuster');
    const source = servant([select], [np(101, '1', 2, [197, 198]), np(197, '2'), np(198, '1')]);
    const result = normalizeNoblePhantasmVariants({
      servant: source,
      allServants: [source],
      traitNameById: new Map(),
    });
    expect(result.canonicalOperationsByFunction.get(select)).toEqual([
      {
        kind: 'selectNoblePhantasmVariant',
        route: sourceRoute,
        variant: { actorFormId: { actorId: '100', limitCount: 0 }, noblePhantasmId: '198' },
      },
    ]);
    expect(
      result.groups[0]?.variants.find(({ ref }) => ref.noblePhantasmId === '198')?.np.card,
    ).toBe('1');
  });

  it('rejects missing and duplicate indexed variants', () => {
    const select = selection('tdTypeChangeArts');
    const missing = servant([select], [np(101, '1', 2, [198])]);
    expect(() =>
      normalizeNoblePhantasmVariants({
        servant: missing,
        allServants: [missing],
        traitNameById: new Map(),
      }),
    ).toThrow('unknown_td_type_change_id');
    const duplicate = servant([select], [np(101, '1', 2, [198]), np(198, '1'), np(198, '1')]);
    expect(() =>
      normalizeNoblePhantasmVariants({
        servant: duplicate,
        allServants: [duplicate],
        traitNameById: new Map(),
      }),
    ).toThrow('unresolved_td_type_change_variant');
  });

  it('rejects conflicting td indexes before operation generation', () => {
    const select = {
      ...selection('tdTypeChangeArts'),
      buffs: [{ type: 'tdTypeChangeArts' }, { type: 'tdTypeChangeQuick' }],
    };
    const source = servant(
      [select],
      [np(101, '1', 2, [198, 197, 196]), np(198, '1'), np(197, '2'), np(196, '3')],
    );
    expect(() =>
      normalizeNoblePhantasmVariants({
        servant: source,
        allServants: [source],
        traitNameById: new Map(),
      }),
    ).toThrow('ambiguous_td_type_change_index');
  });

  it('qualifies a transformed-form selection without servant-specific handling', () => {
    const transform: AtlasFunction = {
      funcId: 11,
      funcType: 'transformServant',
      svals: [{ Value: 200, SetLimitCount: 0, ActSelectIndex: 1 }],
    };
    const select = {
      ...selection('tdTypeChangeQuick'),
      svals: [{ ActSelectIndex: 1 }],
    };
    const base = servant([transform, select], [np(101, '1', 2)]);
    const form = {
      ...servant([], [np(201, '2', 2, [202, 203, 204]), np(202, '1'), np(203, '2'), np(204, '3')]),
      id: 200,
    };
    const result = normalizeNoblePhantasmVariants({
      servant: base,
      allServants: [base, form],
      traitNameById: new Map(),
    });
    expect(result.canonicalOperationsByFunction.get(transform)).toEqual([
      {
        kind: 'transformActorForm',
        route: sourceRoute,
        targetFormId: { actorId: '200', limitCount: 0 },
      },
    ]);
    expect(result.canonicalOperationsByFunction.get(select)).toEqual([
      {
        kind: 'selectNoblePhantasmVariant',
        route: sourceRoute,
        variant: { actorFormId: { actorId: '200', limitCount: 0 }, noblePhantasmId: '204' },
      },
    ]);
  });
});
