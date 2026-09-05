import type {
  AtlasEquip,
  AtlasFunction,
  AtlasMysticCode,
  AtlasReferencedSkill,
  AtlasServant,
  AtlasTraitRef,
} from './atlasContract';
import { functionReachesDamageModifier, normalizeTargetPolicy } from './executionSemantics';

const STATE_GRANT_FUNCTIONS = new Set(['addState', 'addStateShort']);

export interface DamageReachableStateCatalog {
  readonly stackLabels?: ReadonlyMap<string, string>;
  readonly stateOnlyTraits: ReadonlySet<string>;
}

export function stateMutationTraitName(
  trait: AtlasTraitRef,
  traitNameById: ReadonlyMap<number, string>,
): string | null {
  if (trait.name && trait.name !== 'unknown') return trait.name;
  if (typeof trait.id !== 'number') return null;
  return traitNameById.get(trait.id) ?? `traitId:${String(trait.id)}`;
}

function allFunctions(input: {
  servants: readonly AtlasServant[];
  equips: readonly AtlasEquip[];
  mysticCodes: readonly AtlasMysticCode[];
  referencedSkills: readonly AtlasReferencedSkill[];
}): AtlasFunction[] {
  return [
    ...input.servants.flatMap((servant) => [
      ...[...(servant.skills ?? []), ...(servant.classPassive ?? [])].flatMap(
        (skill) => skill.functions ?? [],
      ),
      ...(servant.noblePhantasms ?? []).flatMap((np) => np.functions ?? []),
    ]),
    ...input.equips.flatMap((equip) =>
      (equip.skills ?? []).flatMap((skill) => skill.functions ?? []),
    ),
    ...input.mysticCodes.flatMap((mysticCode) =>
      (mysticCode.skills ?? []).flatMap((skill) => skill.functions ?? []),
    ),
    ...input.referencedSkills.flatMap((skill) => skill.functions ?? []),
  ];
}

function permanentTraitIdentities(
  servants: readonly AtlasServant[],
  traitNameById: ReadonlyMap<number, string>,
): ReadonlySet<string> {
  return new Set(
    servants.flatMap((servant) =>
      [
        ...(servant.traits ?? []),
        ...Object.values(servant.ascensionAdd?.individuality?.ascension ?? {}).flat(),
        ...Object.values(servant.ascensionAdd?.individuality?.costume ?? {}).flat(),
      ].flatMap((trait) => {
        const name = stateMutationTraitName(trait, traitNameById);
        return name ? [name] : [];
      }),
    ),
  );
}

function functionStateIdentities(
  fn: AtlasFunction,
  traitNameById: ReadonlyMap<number, string>,
): string[] {
  if (
    !STATE_GRANT_FUNCTIONS.has(fn.funcType ?? '') ||
    normalizeTargetPolicy(fn.funcTargetType ?? '', fn.funcTargetTeam) !== 'enemy'
  )
    return [];
  return (fn.buffs ?? []).flatMap((buff) =>
    (buff.vals ?? []).flatMap((trait) => {
      const name = stateMutationTraitName(trait, traitNameById);
      return name ? [name] : [];
    }),
  );
}

function conditionTraits(fn: AtlasFunction, traitNameById: ReadonlyMap<number, string>): string[] {
  if (!functionReachesDamageModifier(fn)) return [];
  return [
    ...(fn.functvals ?? []),
    ...(fn.buffs ?? []).flatMap((buff) => [...(buff.ckSelfIndv ?? []), ...(buff.ckOpIndv ?? [])]),
  ].flatMap((trait) => {
    const name = stateMutationTraitName(trait, traitNameById);
    return name ? [name] : [];
  });
}

function noblePhantasmDamageTraits(
  fn: AtlasFunction,
  traitNameById: ReadonlyMap<number, string>,
): string[] {
  if (!fn.funcType?.startsWith('damageNp')) return [];
  return [fn.svals, fn.svals2, fn.svals3, fn.svals4, fn.svals5]
    .flatMap((parameters) => parameters ?? [])
    .flatMap((parameter) => [
      ...(typeof parameter.Target === 'number' ? [parameter.Target] : []),
      ...(parameter.TargetList ?? []),
      ...(parameter.AndCheckIndividualityList ?? []),
    ])
    .flatMap((id) => {
      const name = stateMutationTraitName({ id }, traitNameById);
      return name ? [name] : [];
    });
}

export function collectDamageReachableStateCatalog(
  input: {
    servants: readonly AtlasServant[];
    equips: readonly AtlasEquip[];
    mysticCodes: readonly AtlasMysticCode[];
    referencedSkills: readonly AtlasReferencedSkill[];
  },
  traitNameById: ReadonlyMap<number, string>,
): DamageReachableStateCatalog {
  const functions = allFunctions(input);
  const stateIdentities = new Set(
    functions.flatMap((fn) => functionStateIdentities(fn, traitNameById)),
  );
  const consumers = new Set([
    ...functions.flatMap((fn) => conditionTraits(fn, traitNameById)),
    ...functions.flatMap((fn) => noblePhantasmDamageTraits(fn, traitNameById)),
  ]);
  const permanentTraits = permanentTraitIdentities(input.servants, traitNameById);
  const labels = new Map<string, Set<string>>();
  for (const fn of functions)
    for (const buff of fn.buffs ?? [])
      for (const trait of buff.vals ?? []) {
        const name = stateMutationTraitName(trait, traitNameById);
        if (!name || !buff.name) continue;
        const values = labels.get(name) ?? new Set<string>();
        values.add(buff.name);
        labels.set(name, values);
      }
  return {
    stackLabels: new Map(
      [...labels].flatMap(([key, values]) => (values.size === 1 ? [[key, [...values][0]!]] : [])),
    ),
    stateOnlyTraits: new Set(
      [...stateIdentities].filter((trait) => consumers.has(trait) && !permanentTraits.has(trait)),
    ),
  };
}

export function normalizeDamageReachableStateMutations(
  fn: AtlasFunction,
  catalog: DamageReachableStateCatalog,
  traitNameById: ReadonlyMap<number, string>,
): { added: string[]; removed: string[] } {
  const added = functionStateIdentities(fn, traitNameById).filter((trait) =>
    catalog.stateOnlyTraits.has(trait),
  );
  const removed =
    fn.funcType === 'subState'
      ? (fn.traitVals ?? []).flatMap((trait) => {
          const name = stateMutationTraitName(trait, traitNameById);
          return name && catalog.stateOnlyTraits.has(name) ? [name] : [];
        })
      : [];
  return {
    added: [...new Set(added)],
    removed: [...new Set(removed)],
  };
}
