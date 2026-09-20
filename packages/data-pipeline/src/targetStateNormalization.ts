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

export type PopulationTraitRole = 'actorReference' | 'populationRead' | 'stateOnly';

export interface PopulationTraitCatalogEntry {
  readonly roles: ReadonlySet<PopulationTraitRole>;
  readonly grantable: boolean;
}

export interface PopulationTraitGrantability {
  readonly name: string | null;
  readonly roles: ReadonlySet<PopulationTraitRole>;
  readonly grantable: boolean;
}

export interface DamageReachableStateCatalog {
  readonly npTransferChargeResistance?: boolean;
  readonly attackReadTraits?: ReadonlySet<string>;
  readonly populationTraitGrantSelectors?: ReadonlyMap<string, readonly string[]>;
  readonly populationTraitCatalog?: ReadonlyMap<string, PopulationTraitCatalogEntry>;
  readonly populationReadTraits?: ReadonlySet<string>;
  readonly populationBuffTraits?: ReadonlySet<string>;
  readonly populationIntrinsicTraits?: ReadonlySet<string>;
  readonly countedBuffMaximums?: ReadonlyMap<string, number>;
  readonly countedBuffTraits?: ReadonlySet<string>;
  readonly countedBuffDefinitions?: ReadonlyMap<string, readonly string[]>;
  readonly actorTraitReferences?: ReadonlySet<number>;
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

export function classifyPopulationTraitGrantability(
  trait: AtlasTraitRef,
  traitNameById: ReadonlyMap<number, string>,
  catalog: DamageReachableStateCatalog,
): PopulationTraitGrantability {
  const name = stateMutationTraitName(trait, traitNameById);
  const roles = new Set<PopulationTraitRole>(
    name ? (catalog.populationTraitCatalog?.get(name)?.roles ?? []) : [],
  );
  if (name && catalog.populationReadTraits?.has(name)) roles.add('populationRead');
  if (name && catalog.stateOnlyTraits.has(name)) roles.add('stateOnly');
  if (typeof trait.id === 'number' && catalog.actorTraitReferences?.has(trait.id))
    roles.add('actorReference');
  return { name, roles, grantable: roles.size === 0 };
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
  scalarTargetIsTrait = true,
): string[] {
  if (!fn.funcType?.startsWith('damageNp')) return [];
  return [fn.svals, fn.svals2, fn.svals3, fn.svals4, fn.svals5]
    .flatMap((parameters) => parameters ?? [])
    .flatMap((parameter) => [
      ...(scalarTargetIsTrait && typeof parameter.Target === 'number' ? [parameter.Target] : []),
      ...(parameter.TargetList ?? []),
      ...(parameter.AndCheckIndividualityList ?? []),
    ])
    .flatMap((id) => {
      const name = stateMutationTraitName({ id }, traitNameById);
      return name ? [name] : [];
    });
}

function buildPopulationTraitCatalog(
  populationReadTraits: ReadonlySet<string>,
  stateOnlyTraits: ReadonlySet<string>,
  actorTraitReferences: ReadonlySet<number>,
  traitNameById: ReadonlyMap<number, string>,
): ReadonlyMap<string, PopulationTraitCatalogEntry> {
  const rolesByName = new Map<string, Set<PopulationTraitRole>>();
  for (const name of populationReadTraits)
    rolesByName.set(name, new Set([...(rolesByName.get(name) ?? []), 'populationRead']));
  for (const name of stateOnlyTraits)
    rolesByName.set(name, new Set([...(rolesByName.get(name) ?? []), 'stateOnly']));
  for (const id of actorTraitReferences) {
    const name = stateMutationTraitName({ id }, traitNameById);
    if (!name) continue;
    rolesByName.set(name, new Set([...(rolesByName.get(name) ?? []), 'actorReference']));
  }
  return new Map(
    [...rolesByName].map(([name, roles]) => [name, { roles, grantable: roles.size === 0 }]),
  );
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
  const populationReadTraits = new Set(
    functions
      .filter((fn) => ['gainNpTargetSum', 'gainNpIndividualSum'].includes(fn.funcType ?? ''))
      .flatMap((fn) =>
        (fn.traitVals ?? []).flatMap((trait) => {
          const name = stateMutationTraitName(trait, traitNameById);
          return name ? [name] : [];
        }),
      ),
  );
  const populationTraitGrantSelectors = new Map<string, string[]>();
  for (const fn of functions) {
    const buffs = (fn.buffs ?? []).filter((buff) => buff.type === 'addIndividuality');
    if (!buffs.length) continue;
    const selectors = buffs.flatMap((buff) =>
      (buff.vals ?? []).flatMap((value) => {
        const name = stateMutationTraitName(value, traitNameById);
        return name ? [name] : [];
      }),
    );
    for (const cell of [fn.svals, fn.svals2, fn.svals3, fn.svals4, fn.svals5].flatMap(
      (row) => row ?? [],
    )) {
      const trait =
        typeof cell.Value === 'number'
          ? stateMutationTraitName({ id: cell.Value }, traitNameById)
          : null;
      if (trait && populationReadTraits.has(trait))
        populationTraitGrantSelectors.set(trait, [
          ...new Set([...(populationTraitGrantSelectors.get(trait) ?? []), ...selectors]),
        ]);
    }
  }
  const populationBuffTraits = new Set(
    functions.flatMap((fn) =>
      (fn.buffs ?? []).flatMap((buff) =>
        (buff.vals ?? []).flatMap((trait) => {
          const name = stateMutationTraitName(trait, traitNameById);
          return name && populationReadTraits.has(name) ? [name] : [];
        }),
      ),
    ),
  );
  const countedBuffTraits = new Set(
    functions
      .filter((fn) => fn.funcType === 'gainNpBuffIndividualSum')
      .flatMap((fn) =>
        (fn.traitVals ?? []).flatMap((trait) => {
          const name = stateMutationTraitName(trait, traitNameById);
          return name ? [name] : [];
        }),
      ),
  );
  const countedBuffMaximums = new Map<string, number>();
  for (const trait of countedBuffTraits) {
    const grants = functions.filter(
      (fn) =>
        STATE_GRANT_FUNCTIONS.has(fn.funcType ?? '') &&
        fn.buffs?.some((buff) =>
          buff.vals?.some((value) => stateMutationTraitName(value, traitNameById) === trait),
        ),
    );
    const bounds = grants.flatMap((fn) => {
      const cells = [fn.svals, fn.svals2, fn.svals3, fn.svals4, fn.svals5].flatMap(
        (row) => row ?? [],
      );
      if (!cells.length) return [undefined];
      return cells.map((cell) =>
        typeof cell.SameBuffLimitTargetIndividuality === 'number' &&
        stateMutationTraitName({ id: cell.SameBuffLimitTargetIndividuality }, traitNameById) ===
          trait &&
        typeof cell.SameBuffLimitNum === 'number' &&
        Number.isSafeInteger(cell.SameBuffLimitNum) &&
        cell.SameBuffLimitNum > 0
          ? cell.SameBuffLimitNum
          : undefined,
      );
    });
    const maximum = bounds[0];
    if (maximum !== undefined && bounds.every((bound) => bound === maximum))
      countedBuffMaximums.set(trait, maximum);
  }
  const countedBuffDefinitions = new Map<string, readonly string[]>();
  for (const trait of countedBuffTraits) {
    const signatures = new Map(
      functions.flatMap((fn) =>
        (fn.buffs ?? []).flatMap((buff) => {
          const traits = [
            ...new Set(
              (buff.vals ?? []).flatMap((item) => {
                const name = stateMutationTraitName(item, traitNameById);
                return name ? [name] : [];
              }),
            ),
          ].sort();
          return traits.includes(trait) ? [[JSON.stringify(traits), traits] as const] : [];
        }),
      ),
    );
    if (signatures.size === 1) countedBuffDefinitions.set(trait, [...signatures.values()][0]!);
  }
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
  const actorTraitReferences = new Set(
    [
      ...input.servants.flatMap((servant) => servant.traits ?? []),
      ...functions.flatMap((fn) => [
        ...(fn.functvals ?? []),
        ...(['gainNpTargetSum', 'gainNpIndividualSum'].includes(fn.funcType ?? '')
          ? (fn.traitVals ?? [])
          : []),
        ...(fn.buffs ?? []).flatMap((buff) => [
          ...(buff.ckSelfIndv ?? []),
          ...(buff.ckOpIndv ?? []),
        ]),
      ]),
    ].flatMap((trait) => (typeof trait.id === 'number' && trait.id > 0 ? [trait.id] : [])),
  );
  const stateOnlyTraits = new Set(
    [...stateIdentities].filter((trait) => consumers.has(trait) && !permanentTraits.has(trait)),
  );
  return {
    npTransferChargeResistance: functions.some((fn) =>
      (fn.buffs ?? []).some((buff) => /resistanceDelayNpturn/i.test(buff.type ?? '')),
    ),
    attackReadTraits: new Set([
      ...functions.flatMap((fn) =>
        [
          ...(fn.functvals ?? []),
          ...(fn.buffs ?? []).flatMap((buff) => [
            ...(buff.ckSelfIndv ?? []),
            ...(buff.ckOpIndv ?? []),
          ]),
        ].flatMap((trait) => {
          const name = stateMutationTraitName(trait, traitNameById);
          return name ? [name] : [];
        }),
      ),
      ...functions
        .filter((fn) =>
          ['damageNpIndividual', 'damageNpIndividualSum', 'damageNpStateIndividualFix'].includes(
            fn.funcType ?? '',
          ),
        )
        .flatMap((fn) =>
          noblePhantasmDamageTraits(fn, traitNameById, fn.funcType !== 'damageNpIndividualSum'),
        ),
    ]),
    populationReadTraits,
    populationTraitGrantSelectors,
    populationTraitCatalog: buildPopulationTraitCatalog(
      populationReadTraits,
      stateOnlyTraits,
      actorTraitReferences,
      traitNameById,
    ),
    populationBuffTraits,
    populationIntrinsicTraits: permanentTraits,
    countedBuffTraits,
    countedBuffDefinitions,
    countedBuffMaximums,
    actorTraitReferences,
    stackLabels: new Map(
      [...labels].flatMap(([key, values]) => (values.size === 1 ? [[key, [...values][0]!]] : [])),
    ),
    stateOnlyTraits,
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
