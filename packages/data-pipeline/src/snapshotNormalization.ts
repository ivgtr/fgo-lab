import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import {
  actorFormKey,
  canonicalNoblePhantasmVariantSemanticsKey,
  masterSnapshotSchema,
} from '@fgo-lab/master-data';
import type {
  AtlasEquip,
  AtlasFunction,
  AtlasItem,
  AtlasMaterialStep,
  AtlasMysticCode,
  AtlasReferencedSkill,
  AtlasServant,
} from './atlasContract';
import { inventoryAtlasAttackFunctions } from './atlasInventory';
import { cardMap, normalizeFunctions, normalizeNpDamageFunction } from './effectNormalization';
import { normalizeCraftEssenceLimitBreakEffects } from './craftEssenceNormalization';
import { normalizeNoblePhantasmVariants } from './noblePhantasmVariantNormalization';
import { canonicalTargetPredicate, normalizeTargetSemantics } from './targetTaxonomy';
import { collectDamageReachableStateCatalog } from './targetStateNormalization';
import {
  canonicalNpResourceSemantics,
  normalizeNpGaugeRequirement,
} from './npResourceNormalization';
import { sha256 } from './artifact';

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
  referencedSkills?: unknown;
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
  const atlasReferencedSkills = (input.referencedSkills ?? []) as AtlasReferencedSkill[];
  const referencedSkills = new Map(
    atlasReferencedSkills.flatMap((skill) =>
      typeof skill.id === 'number' ? ([[skill.id, skill]] as const) : [],
    ),
  );
  const attackInventory = inventoryAtlasAttackFunctions(atlasServants);
  if (attackInventory.unknown.length > 0)
    throw new TypeError(`unknown_attack_functions:${attackInventory.unknown.join(',')}`);
  const targetSemantics = normalizeTargetSemantics(atlasServants);
  const excludedAttackFunctionCandidates = atlasServants.flatMap((servant) => {
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
  for (const trait of atlasReferencedSkills.flatMap((skill) =>
    collectFunctionTraitNames(skill.functions),
  ))
    if (typeof trait.id === 'number' && trait.name && trait.name !== 'unknown')
      traitNameById.set(trait.id, trait.name);
  const stateCatalog = collectDamageReachableStateCatalog(
    {
      servants: atlasServants,
      equips: atlasEquips,
      mysticCodes: atlasMysticCodes,
      referencedSkills: atlasReferencedSkills,
    },
    traitNameById,
  );
  const servants = atlasServants.flatMap((servant) => {
    if (!servant.collectionNo || !['normal', 'heroine'].includes(servant.type ?? '')) return [];
    if (
      typeof servant.id !== 'number' ||
      !servant.name ||
      !servant.className ||
      typeof servant.rarity !== 'number'
    )
      return [];
    const noblePhantasmModel = normalizeNoblePhantasmVariants({
      servant,
      allServants: atlasServants,
      traitNameById,
    });
    const normalizeVariant = (
      form: (typeof noblePhantasmModel.groups)[number]['variants'][number]['form'],
      np: NonNullable<AtlasServant['noblePhantasms']>[number],
    ) => {
      const maximumBattlePointPhaseById = new Map(
        (form.actor.battlePoints ?? []).flatMap((battlePoint) => {
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
      if (typeof np.id !== 'number')
        throw new TypeError(`missing_np_id:actorForm:${JSON.stringify(form.id)}`);
      const firstDamageIndex = damageFunctions[0]?.functionIndex ?? -1;
      const effectFunctions = indexedFunctions.filter(
        ({ fn }) => !fn.funcType?.startsWith('damageNp') && typeof fn.funcId === 'number',
      );
      const normalizedEffects = normalizeFunctions(
        effectFunctions.map(({ fn }) => fn),
        traitNameById,
        'np',
        Number(form.id.actorId),
        referencedSkills,
        'duringExecution',
        noblePhantasmModel.canonicalOperationsByFunction,
        noblePhantasmModel.variantStateTraits,
        stateCatalog,
      );
      const common = {
        ref: { actorFormId: form.id, noblePhantasmId: String(np.id) },
        name: np.name ?? '不明な宝具',
        priority: np.priority ?? 0,
        effects: normalizedEffects.map((effect, index) => ({
          ...effect,
          timing:
            firstDamageIndex >= 0 && effectFunctions[index]!.functionIndex < firstDamageIndex
              ? ('beforeDamage' as const)
              : ('afterDamage' as const),
        })),
      };
      if (damageFunctions.length === 0) {
        const nonAttackVariant = { kind: 'nonAttack' as const, ...common };
        return {
          ...nonAttackVariant,
          canonicalId: sha256(canonicalNoblePhantasmVariantSemanticsKey(nonAttackVariant)),
        };
      }
      const damage = damageFunctions.map(({ fn, functionIndex }) =>
        normalizeNpDamageFunction(
          fn,
          `actorForms[${form.id.actorId}:${String(form.id.limitCount)}].noblePhantasms[${String(np.id)}].functions[${String(functionIndex)}]`,
          traitNameById,
          maximumBattlePointPhaseById,
          stateCatalog,
        ),
      );
      const targets = [...new Set(damage.map((spec) => spec.target))];
      if (targets.length !== 1)
        throw new TypeError(
          `ambiguous_np_target_scope:${JSON.stringify(form.id)}:${String(np.id)}`,
        );
      const card = cardMap[np.card ?? ''];
      if (card === undefined) throw new TypeError(`unknown_np_card:${String(np.card)}`);
      const attackVariant = {
        kind: 'attack' as const,
        ...common,
        card,
        targetScope: targets[0]!,
        damage,
      };
      return {
        ...attackVariant,
        canonicalId: sha256(canonicalNoblePhantasmVariantSemanticsKey(attackVariant)),
      };
    };
    const noblePhantasmVariantGroups = noblePhantasmModel.groups.map((group) => ({
      id: group.id,
      baseVariant: group.baseVariant,
      variants: group.variants.map(({ form, np }) => normalizeVariant(form, np)),
    }));
    const image = servant.extraAssets?.faces?.ascension?.['1'] ?? null;
    const activeSkills = noblePhantasmModel.skills;
    const normalizeSkill = (
      skill: NonNullable<AtlasServant['skills']>[number],
      source: 'skill' | 'passive',
    ) => ({
      id: String(skill.id),
      ...(source === 'skill' ? { slot: skill.num } : {}),
      priority: skill.priority ?? 0,
      name: skill.name ?? '不明なスキル',
      detail: skill.detail ?? '',
      imageKey: skill.icon ?? null,
      resourceRequirement: normalizeNpGaugeRequirement(skill.script?.NP_HIGHER),
      effects: normalizeFunctions(
        skill.functions,
        traitNameById,
        source,
        servant.id,
        referencedSkills,
        source === 'passive' ? 'representedByCurrentInput' : 'duringExecution',
        noblePhantasmModel.canonicalOperationsByFunction,
        noblePhantasmModel.variantStateTraits,
        stateCatalog,
      ),
    });
    const skills = activeSkills
      .filter((skill) => typeof skill.id === 'number' && skill.name)
      .map((skill) => normalizeSkill(skill, 'skill'));
    const passives = noblePhantasmModel.passives
      .filter((skill) => typeof skill.id === 'number' && skill.name)
      .map((skill) => normalizeSkill(skill, 'passive'));
    const actorFormTransitions = noblePhantasmModel.transitions.map((transition) => {
      const npSource = noblePhantasmVariantGroups
        .flatMap(({ variants }) => variants)
        .find(
          (variant) =>
            transition.sourceKind === 'noblePhantasm' &&
            variant.ref.noblePhantasmId === transition.sourceId &&
            variant.ref.actorFormId.actorId === transition.from.actorId &&
            variant.ref.actorFormId.limitCount === transition.from.limitCount,
        );
      const sources = transition.sourceKind === 'skill' ? skills : passives;
      const source =
        transition.sourceKind === 'noblePhantasm'
          ? npSource
          : sources.find(({ id }) => id === transition.sourceId);
      const transitionEffect = source?.effects.find(
        ({ occurrenceId }) => occurrenceId === transition.effectOccurrenceId,
      );
      if (!source || !transitionEffect)
        throw new TypeError(
          `unresolved_actor_form_transition_activation:${transition.sourceId}:${transition.effectOccurrenceId}`,
        );
      const activationEffects = source.effects.filter(
        ({ selection }) => JSON.stringify(selection) === JSON.stringify(transitionEffect.selection),
      );
      const operations = activationEffects.flatMap(({ execution }) => execution);
      const transformed = operations.filter((operation) => operation.kind === 'transformActorForm');
      const selected = operations.filter(
        (operation) => operation.kind === 'selectNoblePhantasmVariant',
      );
      if (transformed.length !== 1 || selected.length !== 1)
        throw new TypeError(
          `non_atomic_actor_form_transition:${transition.sourceId}:${transition.effectOccurrenceId}:${String(transformed.length)}:${String(selected.length)}`,
        );
      return {
        id: JSON.stringify([
          transition.from.actorId,
          transition.from.limitCount,
          transition.to.actorId,
          transition.to.limitCount,
          transition.sourceKind,
          transition.sourceId,
          transition.effectOccurrenceId,
        ]),
        from: transition.from,
        to: transition.to,
        direction: transition.direction,
        activation: {
          sourceKind: transition.sourceKind,
          sourceId: transition.sourceId,
          effectOccurrenceIds: activationEffects.map(({ occurrenceId }) => occurrenceId),
        },
        operations,
      };
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
        hpByLevel: Object.fromEntries(
          (servant.hpGrowth ?? []).map((hp, index) => [String(index + 1), hp]),
        ),
        atkByLevel: Object.fromEntries(
          (servant.atkGrowth ?? []).map((atk, index) => [String(index + 1), atk]),
        ),
        actorFormGraph: {
          actorId: String(servant.id),
          forms: noblePhantasmModel.actorForms.map(
            ({ id, name, traits, skillIds, passiveIds, baseNoblePhantasmVariant }) => ({
              id,
              name,
              traits,
              skillIds,
              passiveIds,
              baseNoblePhantasmVariant,
            }),
          ),
          initialFormIds: noblePhantasmModel.initialFormIds,
          defaultInitialFormId: noblePhantasmModel.defaultInitialFormId,
          transitions: actorFormTransitions,
        },
        baseNoblePhantasmGroupId: noblePhantasmModel.baseNoblePhantasmGroupId,
        noblePhantasmVariantGroups,
        traits: (servant.traits ?? []).flatMap((trait) => (trait.name ? [trait.name] : [])),
        predicates: (servant.traits ?? []).flatMap((trait) => {
          if (!trait.name) return [];
          const predicate = canonicalTargetPredicate(trait.name);
          return predicate ? [predicate] : [];
        }),
        imageKey: image,
        skills,
        passives,
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
    const normalEffects = normalizeFunctions(
      normalSkill?.functions,
      traitNameById,
      'craftEssence',
      undefined,
      referencedSkills,
      undefined,
      undefined,
      undefined,
      stateCatalog,
    );
    const limitBreakEffects = limitBreakSkill
      ? normalizeFunctions(
          limitBreakSkill.functions,
          traitNameById,
          'craftEssence',
          undefined,
          referencedSkills,
          undefined,
          undefined,
          undefined,
          stateCatalog,
        )
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
        hpByLevel: Object.fromEntries(
          (equip.hpGrowth ?? []).map((hp, index) => [String(index + 1), hp]),
        ),
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
              resourceRequirement: null,
              effects: normalizeFunctions(
                skill.functions,
                traitNameById,
                'mysticCode',
                undefined,
                referencedSkills,
                undefined,
                undefined,
                undefined,
                stateCatalog,
              ),
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
      count +
      servant.noblePhantasmVariantGroups.reduce(
        (groupCount, group) =>
          groupCount +
          group.variants.reduce(
            (variantCount, variant) =>
              variantCount + (variant.kind === 'attack' ? variant.damage.length : 0),
            0,
          ),
        0,
      ),
    0,
  );
  const includedAttackFunctionKeys = new Set(
    servants.flatMap((servant) =>
      servant.noblePhantasmVariantGroups.flatMap((group) =>
        group.variants.flatMap((variant) =>
          variant.kind === 'attack'
            ? variant.damage.map(
                (damage) =>
                  `${actorFormKey(variant.ref.actorFormId)}:${variant.ref.noblePhantasmId}:${damage.functionId}`,
              )
            : [],
        ),
      ),
    ),
  );
  const excludedAttackFunctions = excludedAttackFunctionCandidates.filter(
    (excluded) =>
      !includedAttackFunctionKeys.has(
        `${excluded.servantId}:${excluded.noblePhantasmId}:${excluded.functionId}`,
      ),
  );
  return masterSnapshotSchema.parse({
    version: input.version,
    npResourceSemantics: canonicalNpResourceSemantics,
    normalization: {
      attackFunctions: {
        sourceCount: attackInventory.attackEntries,
        includedCount,
        expansionCount:
          includedCount + excludedAttackFunctions.length - attackInventory.attackEntries,
        excluded: excludedAttackFunctions,
      },
    },
    targetSemantics,
    servants,
    craftEssences,
    mysticCodes,
    materials,
  });
}
