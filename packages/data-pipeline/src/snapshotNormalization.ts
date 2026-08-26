import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import type {
  AtlasEquip,
  AtlasFunction,
  AtlasItem,
  AtlasMaterialStep,
  AtlasMysticCode,
  AtlasServant,
} from './atlasContract';
import { inventoryAtlasAttackFunctions } from './atlasInventory';
import { cardMap, normalizeFunctions, normalizeNpDamageFunction } from './effectNormalization';
import { normalizeCraftEssenceLimitBreakEffects } from './craftEssenceNormalization';

function growthSteps(source: AtlasMaterialStep | undefined, prefix: string, repeat = 1) {
  const result: { from: string; to: string; materialId: string; amount: number; qp: number }[] = [];
  if (!source) return result;
  for (const [level, step] of Object.entries(source)) {
    const from = Number(level);
    if (!Number.isInteger(from)) continue;
    for (let slot = 1; slot <= repeat; slot += 1)
      for (const item of step.items ?? []) {
        if (typeof item.item?.id !== 'number' || typeof item.amount !== 'number') continue;
        result.push({
          from: `${prefix}:${String(slot)}:${String(from)}`,
          to: `${prefix}:${String(slot)}:${String(from + 1)}`,
          materialId: String(item.item.id),
          amount: item.amount,
          qp: step.qp ?? 0,
        });
      }
  }
  return result;
}

function collectFunctionTraitNames(functions: readonly AtlasFunction[] | undefined) {
  return (functions ?? []).flatMap((fn) => [
    ...(fn.functvals ?? []),
    ...(fn.funcquestTvals ?? []),
    ...(fn.script?.funcIndividuality ?? []),
    ...(fn.buffs ?? []).flatMap((buff) => [
      ...(buff.vals ?? []),
      ...(buff.tvals ?? []),
      ...(buff.ckSelfIndv ?? []),
      ...(buff.ckOpIndv ?? []),
      ...(buff.script?.INDIVIDUALITIE ? [buff.script.INDIVIDUALITIE] : []),
    ]),
  ]);
}

function collectTraitNameById(
  servants: readonly AtlasServant[],
  equips: readonly AtlasEquip[],
  mysticCodes: readonly AtlasMysticCode[],
) {
  const traits = [
    ...servants.flatMap((servant) => [
      ...(servant.traits ?? []),
      ...[...(servant.skills ?? []), ...(servant.classPassive ?? [])].flatMap((skill) =>
        collectFunctionTraitNames(skill.functions),
      ),
      ...(servant.noblePhantasms ?? []).flatMap((np) => collectFunctionTraitNames(np.functions)),
    ]),
    ...equips.flatMap((equip) =>
      (equip.skills ?? []).flatMap((skill) => collectFunctionTraitNames(skill.functions)),
    ),
    ...mysticCodes.flatMap((mysticCode) =>
      (mysticCode.skills ?? []).flatMap((skill) => collectFunctionTraitNames(skill.functions)),
    ),
  ];
  return new Map(
    traits.flatMap((trait) =>
      typeof trait.id === 'number' && trait.name && trait.name !== 'unknown'
        ? ([[trait.id, trait.name]] as const)
        : [],
    ),
  );
}

export function normalizeAtlasSnapshot(input: {
  version: string;
  servants: unknown;
  equips: unknown;
  mysticCodes: unknown;
  items: unknown;
}): MasterDataSnapshot {
  if (
    !Array.isArray(input.servants) ||
    !Array.isArray(input.equips) ||
    !Array.isArray(input.mysticCodes) ||
    !Array.isArray(input.items)
  )
    throw new TypeError('atlas_exports_must_be_arrays');
  const atlasServants = input.servants as AtlasServant[];
  const atlasEquips = input.equips as AtlasEquip[];
  const atlasMysticCodes = input.mysticCodes as AtlasMysticCode[];
  const attackInventory = inventoryAtlasAttackFunctions(atlasServants);
  if (attackInventory.unknown.length > 0)
    throw new TypeError(`unknown_attack_functions:${attackInventory.unknown.join(',')}`);
  const excludedAttackFunctions = atlasServants.flatMap((servant) => {
    const reason = !servant.collectionNo
      ? ('missingCollectionNo' as const)
      : !['normal', 'heroine'].includes(servant.type ?? '')
        ? ('servantTypeExcluded' as const)
        : typeof servant.id !== 'number' ||
            !servant.name ||
            !servant.className ||
            typeof servant.rarity !== 'number'
          ? ('servantIdentityIncomplete' as const)
          : null;
    if (!reason) return [];
    return (servant.noblePhantasms ?? []).flatMap((np) =>
      (np.functions ?? []).flatMap((fn) =>
        fn.funcType?.startsWith('damageNp')
          ? [
              {
                servantId: String(servant.id ?? 'missing'),
                noblePhantasmId: String(np.id ?? 'missing'),
                functionId: String(fn.funcId ?? 'missing'),
                rawFunctionType: fn.funcType,
                reason,
              },
            ]
          : [],
      ),
    );
  });
  const traitNameById = collectTraitNameById(atlasServants, atlasEquips, atlasMysticCodes);
  const servants = atlasServants.flatMap((servant, servantIndex) => {
    if (!servant.collectionNo || !['normal', 'heroine'].includes(servant.type ?? '')) return [];
    if (
      typeof servant.id !== 'number' ||
      !servant.name ||
      !servant.className ||
      typeof servant.rarity !== 'number'
    )
      return [];
    const noblePhantasms = (servant.noblePhantasms ?? []).flatMap((np, npIndex) => {
      const maximumBattlePointPhaseById = new Map(
        (servant.battlePoints ?? []).flatMap((battlePoint) => {
          if (typeof battlePoint.id !== 'number') return [];
          const phases = (battlePoint.phases ?? []).flatMap((phase) =>
            typeof phase.phase === 'number' ? [phase.phase] : [],
          );
          return phases.length > 0 ? [[battlePoint.id, Math.max(...phases)] as const] : [];
        }),
      );
      const indexedFunctions = (np.functions ?? []).map((fn, functionIndex) => ({
        fn,
        functionIndex,
      }));
      const damageFunctions = indexedFunctions.filter(({ fn }) =>
        fn.funcType?.startsWith('damageNp'),
      );
      if (damageFunctions.length === 0) return [];
      if (typeof np.id !== 'number')
        throw new TypeError(
          `missing_np_id:servants[${String(servantIndex)}].noblePhantasms[${String(npIndex)}]`,
        );
      const firstDamageIndex = damageFunctions[0]?.functionIndex ?? -1;
      const effectFunctions = indexedFunctions.filter(
        ({ fn }) => !fn.funcType?.startsWith('damageNp') && typeof fn.funcId === 'number',
      );
      const normalizedEffects = normalizeFunctions(
        effectFunctions.map(({ fn }) => fn),
        traitNameById,
        'np',
        servant.id,
      );
      return [
        {
          id: String(np.id),
          name: np.name ?? '不明な宝具',
          priority: np.priority ?? 0,
          card: cardMap[np.card ?? ''] ?? 'buster',
          damage: damageFunctions.map(({ fn, functionIndex }) =>
            normalizeNpDamageFunction(
              fn,
              `servants[${String(servantIndex)}].noblePhantasms[${String(npIndex)}].functions[${String(functionIndex)}]`,
              traitNameById,
              maximumBattlePointPhaseById,
            ),
          ),
          effects: normalizedEffects.map((effect, index) => ({
            ...effect,
            timing:
              firstDamageIndex >= 0 && effectFunctions[index]!.functionIndex < firstDamageIndex
                ? ('beforeDamage' as const)
                : ('afterDamage' as const),
          })),
        },
      ];
    });
    const image = servant.extraAssets?.faces?.ascension?.['1'] ?? null;
    const activeSkills = [...(servant.skills ?? [])]
      .filter((skill) => typeof skill.num === 'number' && skill.num >= 1 && skill.num <= 3)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      .filter(
        (skill, index, all) => all.findIndex((candidate) => candidate.num === skill.num) === index,
      )
      .sort((a, b) => (a.num ?? 0) - (b.num ?? 0));
    const normalizeSkill = (skill: NonNullable<AtlasServant['skills']>[number]) => ({
      id: String(skill.id),
      slot: skill.num ?? 0,
      priority: skill.priority ?? 0,
      name: skill.name ?? '不明なスキル',
      detail: skill.detail ?? '',
      imageKey: skill.icon ?? null,
      effects: normalizeFunctions(skill.functions, traitNameById, 'skill', servant.id),
    });
    return [
      {
        id: String(servant.id),
        name: servant.name,
        classId: servant.className,
        attribute: ['human', 'earth', 'sky', 'star', 'beast'].includes(servant.attribute ?? '')
          ? servant.attribute
          : 'unknown',
        rarity: servant.rarity,
        atkByLevel: Object.fromEntries(
          (servant.atkGrowth ?? []).map((atk, index) => [String(index + 1), atk]),
        ),
        noblePhantasms,
        traits: (servant.traits ?? []).flatMap((trait) => (trait.name ? [trait.name] : [])),
        imageKey: image,
        skills: activeSkills
          .filter((skill) => typeof skill.id === 'number' && skill.name)
          .map(normalizeSkill),
        passives: (servant.classPassive ?? [])
          .filter((skill) => typeof skill.id === 'number' && skill.name)
          .map(normalizeSkill),
        growth: [
          ...growthSteps(servant.ascensionMaterials, 'ascension'),
          ...growthSteps(servant.skillMaterials, 'skill', 3),
          ...growthSteps(servant.appendSkillMaterials, 'append', 5),
        ],
      },
    ];
  });
  const craftEssences = atlasEquips.flatMap((equip) => {
    if (
      !equip.collectionNo ||
      typeof equip.id !== 'number' ||
      !equip.name ||
      typeof equip.lvMax !== 'number'
    )
      return [];
    const initial = Math.min(20, equip.lvMax);
    const increment = (equip.lvMax - initial) / 4;
    const normalSkill = [...(equip.skills ?? [])]
      .filter((skill) => (skill.condLimitCount ?? 0) === 0)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
    const limitBreakSkill = [...(equip.skills ?? [])]
      .filter((skill) => skill.condLimitCount === 4)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
    const normalEffects = normalizeFunctions(normalSkill?.functions, traitNameById);
    const limitBreakEffects = limitBreakSkill
      ? normalizeFunctions(limitBreakSkill.functions, traitNameById)
      : null;
    const effects = normalizeCraftEssenceLimitBreakEffects({
      equipId: equip.id,
      normalEffects,
      limitBreakEffects,
    });
    return [
      {
        id: String(equip.id),
        name: equip.name,
        maxLevelByLimitBreak: [0, 1, 2, 3, 4].map((index) =>
          Math.round(initial + increment * index),
        ) as [number, number, number, number, number],
        atkMin: equip.atkBase ?? 0,
        atkMax: equip.atkMax ?? 0,
        imageKey: equip.extraAssets?.equipFace?.equip?.[String(equip.id)] ?? null,
        effects,
      },
    ];
  });
  const mysticCodes = atlasMysticCodes.flatMap((mysticCode) => {
    if (
      typeof mysticCode.id !== 'number' ||
      !mysticCode.name ||
      typeof mysticCode.maxLv !== 'number'
    )
      return [];
    const skills = (mysticCode.skills ?? []).flatMap((skill, skillIndex) =>
      typeof skill.id === 'number' && skill.name
        ? [
            {
              id: String(skill.id),
              slot: skillIndex + 1,
              priority: skill.priority ?? 0,
              name: skill.name,
              detail: skill.detail ?? '',
              imageKey: skill.icon ?? null,
              effects: normalizeFunctions(skill.functions, traitNameById),
            },
          ]
        : [],
    );
    if (skills.length === 0) return [];
    return [
      {
        id: String(mysticCode.id),
        name: mysticCode.name,
        maxLevel: mysticCode.maxLv,
        imageKey:
          mysticCode.extraAssets?.item?.male ?? mysticCode.extraAssets?.item?.female ?? null,
        skills,
      },
    ];
  });
  const materials = (input.items as AtlasItem[]).flatMap((item) =>
    typeof item.id === 'number' &&
    item.name &&
    item.uses?.some((use) => ['ascension', 'skill', 'appendSkill'].includes(use))
      ? [
          {
            id: String(item.id),
            name: item.name,
            category: item.type ?? 'material',
            sortOrder: item.priority ?? item.id,
            imageKey: item.icon ?? null,
          },
        ]
      : [],
  );
  const includedCount = servants.reduce(
    (count, servant) =>
      count + servant.noblePhantasms.reduce((npCount, np) => npCount + np.damage.length, 0),
    0,
  );
  return masterSnapshotSchema.parse({
    version: input.version,
    normalization: {
      attackFunctions: {
        sourceCount: attackInventory.attackEntries,
        includedCount,
        excluded: excludedAttackFunctions,
      },
    },
    servants,
    craftEssences,
    mysticCodes,
    materials,
  });
}
