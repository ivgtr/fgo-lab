import { normalizeStackInput } from './stackQuantityNormalization';
import type {
  CanonicalInputDefinition,
  CanonicalValueSets,
  EffectExecutionOperation,
} from '@fgo-lab/master-data';
import type { AtlasFunction, AtlasFunctionValue } from './atlasContract';
import { stateMutationTraitName } from './targetStateNormalization';
import { normalizeTargetPolicy } from './executionSemantics';
import { canonicalNpResourceSemantics } from './npResourceNormalization';

/** Buff identity is independent of the extra actor individuality stored in Value. */
export function normalizeNpBuffCount(
  fn: AtlasFunction,
  cells: readonly (readonly AtlasFunctionValue[])[],
  names: ReadonlyMap<number, string>,
  definitions: ReadonlyMap<string, readonly string[]>,
  maximums: ReadonlyMap<string, number> = new Map(),
  labels: ReadonlyMap<string, string> = new Map(),
): { operation: EffectExecutionOperation; input: CanonicalInputDefinition } | null {
  if (fn.funcType !== 'gainNpBuffIndividualSum') return null;
  if (
    cells
      .flat()
      .some((cell) =>
        Object.keys(cell).some(
          (key) => !['Rate', 'Value', 'HideMiss', 'HideNoEffect'].includes(key),
        ),
      )
  )
    return null;
  const traits = (fn.traitVals ?? []).map((trait) => stateMutationTraitName(trait, names));
  if (traits.length !== 1 || !traits[0] || fn.traitVals?.some((trait) => trait.negative))
    return null;
  // Passive and exceptional individuality policies need their own instance lifecycle proof.
  if (cells.flat().some((cell) => cell.GainNpTargetPassiveIndividuality !== undefined)) return null;
  const values = cells.map((row) =>
    row.map((cell) => (typeof cell.Value === 'number' ? cell.Value : null)),
  ) as CanonicalValueSets;
  if (
    !values.flat().length ||
    values.flat().some((value) => value === null || !Number.isSafeInteger(value) || value <= 0)
  )
    return null;
  const trait = traits[0];
  const instanceTraits = definitions.get(trait);
  if (!instanceTraits) return null;
  const saturation = Math.ceil(
    Math.max(...canonicalNpResourceSemantics.capacityByNpLevel) /
      Math.min(...values.flat().filter((value): value is number => value !== null)),
  );
  const maximum = Math.min(maximums.get(trait) ?? saturation, saturation);
  if (!Number.isSafeInteger(maximum) || maximum <= 0 || maximum > 4095) return null;
  const input = {
    ...normalizeStackInput({ scope: 'attackerState', trait }, maximum, labels.get(trait)),
    instanceTraits: [...instanceTraits],
  };
  const inputKey = input.key;
  return {
    operation: {
      kind: 'resourceMutation',
      resource: 'npGauge',
      direction: 'gain',
      unit: 'fixed',
      recipient: normalizeTargetPolicy(fn.funcTargetType ?? '', fn.funcTargetTeam),
      subjectId: null,
      amount: { kind: 'buffCount', trait, inputKey, values },
    },
    input,
  };
}

export function normalizeCountedBuffMutation(
  fn: AtlasFunction,
  names: ReadonlyMap<number, string>,
  countedTraits: ReadonlySet<string>,
  definitions: ReadonlyMap<string, readonly string[]>,
  constant: boolean,
): EffectExecutionOperation[] {
  if (countedTraits.size === 0) return [];
  if (
    fn.funcType === 'moveState' &&
    (fn.traitVals ?? []).some((trait) => {
      const name = stateMutationTraitName(trait, names);
      return name && [...definitions.values()].some((traits) => traits.includes(name));
    })
  )
    return [
      {
        kind: 'buffInstanceMutation',
        mutation: 'move',
        lifetime: 'active',
        traits: (fn.traitVals ?? []).flatMap((trait) => {
          const name = stateMutationTraitName(trait, names);
          return name ? [name] : [];
        }),
        recipient: normalizeTargetPolicy(fn.funcTargetType ?? '', fn.funcTargetTeam),
      },
    ];
  const cells = [fn.svals, fn.svals2, fn.svals3, fn.svals4, fn.svals5].flatMap((row) => row ?? []);
  const remove = fn.funcType === 'subState';
  if (!remove && !['addState', 'addStateShort'].includes(fn.funcType ?? '')) return [];
  const dynamicTraits = cells
    .flatMap((cell) => [
      cell.AddIndividualty,
      ...(Array.isArray(cell.AddIndividualtyList) ? cell.AddIndividualtyList : []),
    ])
    .flatMap((id) => (typeof id === 'number' ? [{ id }] : []));
  const traits = (
    remove
      ? (fn.traitVals ?? [])
      : [...(fn.buffs ?? []).flatMap((buff) => buff.vals ?? []), ...dynamicTraits]
  ).flatMap((trait) => {
    const name = stateMutationTraitName(trait, names);
    return name ? [name] : [];
  });
  if (
    !traits.length ||
    (!remove && !traits.some((trait) => countedTraits.has(trait))) ||
    (remove &&
      !traits.some((trait) =>
        [...definitions.values()].some((signature) => signature.includes(trait)),
      ))
  )
    return [];
  const unsupported = (): EffectExecutionOperation[] => [
    {
      kind: 'buffInstanceMutation',
      mutation: 'unsupported',
      lifetime: 'active',
      traits,
      recipient: normalizeTargetPolicy(fn.funcTargetType ?? '', fn.funcTargetTeam),
    },
  ];
  const allowed = new Set([
    'Rate',
    'Value',
    'HideMiss',
    'HideNoEffect',
    'ShowState',
    ...(remove
      ? ['ForceSubState']
      : ['Turn', 'Count', 'ForceAddState', 'SameBuffLimitNum', 'SameBuffLimitTargetIndividuality']),
  ]);
  if (cells.some((cell) => Object.keys(cell).some((key) => !allowed.has(key))))
    return unsupported();
  if (!remove && (fn.buffs ?? []).some((buff) => Object.keys(buff.script ?? {}).length > 0))
    return unsupported();
  if (
    cells.some(
      (cell) =>
        (!remove && typeof cell.Count === 'number' && cell.Count !== -1) ||
        (remove && typeof cell.Value === 'number' && cell.Value !== 0),
    )
  )
    return unsupported();
  if (
    (remove ? (fn.traitVals ?? []) : (fn.buffs ?? []).flatMap((buff) => buff.vals ?? [])).some(
      (trait) => trait.negative,
    )
  )
    return unsupported();
  if (!remove && (fn.buffs?.length ?? 0) !== 1) return unsupported();
  let grantLimit: { trait: string; maximum: number } | undefined;
  if (
    !remove &&
    cells.some(
      (cell) =>
        cell.SameBuffLimitNum !== undefined || cell.SameBuffLimitTargetIndividuality !== undefined,
    )
  ) {
    const first = cells[0]!;
    if (
      typeof first.SameBuffLimitNum !== 'number' ||
      !Number.isSafeInteger(first.SameBuffLimitNum) ||
      first.SameBuffLimitNum <= 0 ||
      typeof first.SameBuffLimitTargetIndividuality !== 'number' ||
      cells.some(
        (cell) =>
          cell.SameBuffLimitNum !== first.SameBuffLimitNum ||
          cell.SameBuffLimitTargetIndividuality !== first.SameBuffLimitTargetIndividuality,
      )
    )
      return unsupported();
    const trait = stateMutationTraitName({ id: first.SameBuffLimitTargetIndividuality }, names);
    if (!trait || !traits.includes(trait)) return unsupported();
    grantLimit = { trait, maximum: first.SameBuffLimitNum };
  }

  return [
    {
      kind: 'buffInstanceMutation',
      mutation: remove ? 'remove' : 'grant',
      ...(grantLimit ? { grantLimit } : {}),
      traits: [...new Set(traits)],
      lifetime: constant ? 'constant' : 'active',
      recipient: normalizeTargetPolicy(fn.funcTargetType ?? '', fn.funcTargetTeam),
    },
  ];
}
