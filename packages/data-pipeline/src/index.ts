import { createHash } from 'node:crypto';
import type { MasterDataSnapshot, MasterManifest, NpDamageSpec } from '@fgo-lab/master-data';
import {
  masterManifestSchema,
  masterSnapshotSchema,
  validateMasterSnapshot,
} from '@fgo-lab/master-data';

export function sha256(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}
export interface FileArtifact {
  key: string;
  file: string;
  content: string;
  required: boolean;
}
export function createManifest(input: {
  masterDataVersion: string;
  createdAt: string;
  retrievedAt: string;
  minimalAppVersion: string;
  artifactKind: 'production' | 'diagnostic';
  imagesEnabled: boolean;
  files: readonly FileArtifact[];
}): MasterManifest {
  return masterManifestSchema.parse({
    manifestVersion: 1,
    masterDataVersion: input.masterDataVersion,
    createdAt: input.createdAt,
    source: { name: 'Atlas Academy', region: 'JP', retrievedAt: input.retrievedAt },
    minimalAppVersion: input.minimalAppVersion,
    schemaVersion: 5,
    artifactKind: input.artifactKind,
    imagesEnabled: input.imagesEnabled,
    files: input.files.map((file) => ({
      key: file.key,
      file: file.file,
      bytes: Buffer.byteLength(file.content),
      sha256: sha256(file.content),
      required: file.required,
    })),
  });
}

export function assertMasterVersionIdentity(
  current: MasterManifest | undefined,
  candidate: MasterManifest,
): void {
  if (!current || current.masterDataVersion !== candidate.masterDataVersion) return;
  const currentMaster = current.files.find((file) => file.key === 'master' && file.required);
  const candidateMaster = candidate.files.find((file) => file.key === 'master' && file.required);
  if (!currentMaster || !candidateMaster || currentMaster.sha256 !== candidateMaster.sha256)
    throw new Error(`master_version_reused:${candidate.masterDataVersion}`);
}

export interface AtlasFunctionInventory {
  attackEntries: number;
  counts: Record<string, number>;
  unknown: string[];
}
const ATTACK_TYPES = new Set([
  'damageNp',
  'damageNpIndividual',
  'damageNpPierce',
  'damageNpIndividualSum',
  'damageNpStateIndividualFix',
  'damageNpHpratioLow',
  'damageNpBattlePointPhase',
  'damageNpRare',
  'damageNpAndOrCheckIndividuality',
]);
export function inventoryAtlasAttackFunctions(
  servants: readonly unknown[],
): AtlasFunctionInventory {
  const counts: Record<string, number> = {};
  for (const value of servants) {
    if (!value || typeof value !== 'object') continue;
    const nps = (value as { noblePhantasms?: unknown }).noblePhantasms;
    if (!Array.isArray(nps)) continue;
    for (const np of nps) {
      if (!np || typeof np !== 'object') continue;
      const functions = (np as { functions?: unknown }).functions;
      if (!Array.isArray(functions)) continue;
      for (const fn of functions) {
        if (!fn || typeof fn !== 'object') continue;
        const type = (fn as { funcType?: unknown }).funcType;
        if (typeof type === 'string' && type.startsWith('damageNp'))
          counts[type] = (counts[type] ?? 0) + 1;
      }
    }
  }
  const unknown = Object.keys(counts)
    .filter((type) => !ATTACK_TYPES.has(type))
    .sort();
  return {
    attackEntries: Object.values(counts).reduce((sum, count) => sum + count, 0),
    counts: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
    unknown,
  };
}
export function validatePublishedArtifact(
  manifestValue: unknown,
  files: Readonly<Record<string, string>>,
) {
  const manifest = masterManifestSchema.parse(manifestValue);
  const errors: string[] = [];
  for (const file of manifest.files) {
    const content = files[file.file];
    if (content === undefined) {
      if (file.required) errors.push(`missing:${file.file}`);
      continue;
    }
    if (Buffer.byteLength(content) !== file.bytes) errors.push(`bytes:${file.file}`);
    if (sha256(content) !== file.sha256) errors.push(`sha256:${file.file}`);
    if (file.key === 'master') {
      try {
        const report = validateMasterSnapshot(JSON.parse(content));
        errors.push(
          ...report.errors.map((error) => `schema:${error}`),
          ...report.unknownAttackFunctions.map((type) => `unknown:${type}`),
        );
      } catch {
        errors.push(`json:${file.file}`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

type AtlasMaterialStep = Record<
  string,
  { items?: { item?: { id?: number }; amount?: number }[]; qp?: number }
>;
type AtlasTraitRef = { id?: number; name?: string; negative?: boolean };
type AtlasBuff = {
  type?: string;
  vals?: AtlasTraitRef[];
  tvals?: AtlasTraitRef[];
  ckSelfIndv?: AtlasTraitRef[];
  ckOpIndv?: AtlasTraitRef[];
  script?: { UpBuffRateBuffIndiv?: AtlasTraitRef[] };
};
type AtlasFunction = {
  funcId?: number;
  funcType?: string;
  funcTargetType?: string;
  funcPopupText?: string;
  functvals?: AtlasTraitRef[];
  funcquestTvals?: AtlasTraitRef[];
  script?: { funcIndividuality?: AtlasTraitRef[] };
  buffs?: AtlasBuff[];
  overWriteTvalsList?: unknown[];
  svals?: AtlasFunctionValue[];
  svals2?: AtlasFunctionValue[];
  svals3?: AtlasFunctionValue[];
  svals4?: AtlasFunctionValue[];
  svals5?: AtlasFunctionValue[];
};
type AtlasFunctionValue = {
  Rate?: number;
  Value?: number;
  Value2?: number;
  Target?: number;
  Correction?: number;
  TargetList?: number[];
  ParamAddMaxCount?: number;
  TargetRarityList?: number[];
  AndCheckIndividualityList?: number[];
  AddIndividualty?: number;
  AddIndividualtyList?: number[];
  IncludeIgnoreIndividuality?: number;
  IgnoreIndivUnreleaseable?: number;
  CheckDead?: number;
  HideMiss?: number;
  HideNoEffect?: number;
};
type AtlasServant = {
  id?: number;
  collectionNo?: number;
  type?: string;
  name?: string;
  className?: string;
  attribute?: string;
  rarity?: number;
  atkGrowth?: number[];
  traits?: { id?: number; name?: string }[];
  skills?: {
    id?: number;
    num?: number;
    priority?: number;
    name?: string;
    detail?: string;
    icon?: string;
    functions?: AtlasFunction[];
  }[];
  classPassive?: AtlasServant['skills'];
  noblePhantasms?: AtlasNp[];
  extraAssets?: { faces?: { ascension?: Record<string, string> } };
  ascensionMaterials?: AtlasMaterialStep;
  skillMaterials?: AtlasMaterialStep;
  appendSkillMaterials?: AtlasMaterialStep;
};
type AtlasNp = {
  id?: number;
  name?: string;
  card?: string;
  priority?: number;
  functions?: AtlasFunction[];
};
type AtlasEquip = {
  id?: number;
  collectionNo?: number;
  name?: string;
  lvMax?: number;
  atkBase?: number;
  atkMax?: number;
  skills?: {
    id?: number;
    condLimitCount?: number;
    priority?: number;
    functions?: AtlasFunction[];
  }[];
  extraAssets?: { equipFace?: { equip?: Record<string, string> } };
};
type AtlasMysticCode = {
  id?: number;
  name?: string;
  maxLv?: number;
  extraAssets?: { item?: { male?: string; female?: string } };
  skills?: {
    id?: number;
    name?: string;
    detail?: string;
    icon?: string;
    priority?: number;
    functions?: AtlasFunction[];
  }[];
};
type AtlasItem = {
  id?: number;
  name?: string;
  type?: string;
  priority?: number;
  icon?: string;
  uses?: string[];
};
const cardMap: Record<string, 'buster' | 'arts' | 'quick'> = { 1: 'arts', 2: 'buster', 3: 'quick' };
const cardTypeByTrait: Record<string, 'buster' | 'arts' | 'quick'> = {
  cardArts: 'arts',
  cardBuster: 'buster',
  cardQuick: 'quick',
};

const damageKindByFunction = {
  damageNp: 'standard',
  damageNpPierce: 'defensePiercing',
  damageNpIndividual: 'trait',
  damageNpIndividualSum: 'traitCount',
  damageNpStateIndividualFix: 'stateTrait',
  damageNpHpratioLow: 'hpRatioLow',
  damageNpBattlePointPhase: 'battlePointPhase',
  damageNpRare: 'targetRarity',
  damageNpAndOrCheckIndividuality: 'traitExpression',
} as const satisfies Record<string, NpDamageSpec['kind']>;

function normalizeNpDamageFunction(
  fn: AtlasFunction,
  rawPath: string,
  traitNameById: ReadonlyMap<number, string>,
): NpDamageSpec {
  const rawFunctionType = fn.funcType;
  if (!rawFunctionType || !(rawFunctionType in damageKindByFunction))
    throw new TypeError(`unknown_attack_function:${rawPath}:${rawFunctionType ?? 'missing'}`);
  if (typeof fn.funcId !== 'number') throw new TypeError(`missing_function_id:${rawPath}`);
  const sources = [fn.svals, fn.svals2, fn.svals3, fn.svals4, fn.svals5];
  const parametersByOvercharge = sources.map((source, overchargeIndex) => {
    if (!source || source.length !== 5)
      throw new TypeError(`invalid_np_parameter_count:${rawPath}:oc${String(overchargeIndex + 1)}`);
    return source.map((value, npLevelIndex) => {
      if (typeof value.Rate !== 'number' || typeof value.Value !== 'number')
        throw new TypeError(
          `missing_np_parameter:${rawPath}:oc${String(overchargeIndex + 1)}:np${String(npLevelIndex + 1)}`,
        );
      return {
        ratePermille: value.Rate,
        valuePermille: value.Value,
        ...(typeof value.Value2 === 'number' ? { secondaryValuePermille: value.Value2 } : {}),
        ...(typeof value.Target === 'number' ? { targetId: value.Target } : {}),
        ...(['damageNpIndividual', 'damageNpStateIndividualFix'].includes(rawFunctionType) &&
        typeof value.Target === 'number'
          ? {
              targetTrait: {
                id: value.Target,
                name: traitNameById.get(value.Target) ?? `trait:${String(value.Target)}`,
              },
            }
          : {}),
        ...(typeof value.Correction === 'number' ? { correctionPermille: value.Correction } : {}),
        ...(value.TargetList ? { targetIds: value.TargetList } : {}),
        ...(value.TargetList
          ? {
              targetTraits: value.TargetList.map((id) => ({
                id,
                name: traitNameById.get(id) ?? `trait:${String(id)}`,
              })),
            }
          : {}),
        ...(typeof value.ParamAddMaxCount === 'number'
          ? { maximumTargetCount: value.ParamAddMaxCount }
          : {}),
        ...(value.TargetRarityList ? { targetRarities: value.TargetRarityList } : {}),
        ...(value.AndCheckIndividualityList
          ? { andCheckTraitIds: value.AndCheckIndividualityList }
          : {}),
        ...(typeof value.AddIndividualty === 'number'
          ? { additionalTraitId: value.AddIndividualty }
          : {}),
        ...(value.AddIndividualtyList ? { additionalTraitIds: value.AddIndividualtyList } : {}),
        ...(typeof value.IncludeIgnoreIndividuality === 'number'
          ? { includeIgnoreIndividuality: value.IncludeIgnoreIndividuality }
          : {}),
        ...(typeof value.IgnoreIndivUnreleaseable === 'number'
          ? { ignoreUnreleaseableTraits: value.IgnoreIndivUnreleaseable }
          : {}),
        ...(typeof value.CheckDead === 'number' ? { checkDead: value.CheckDead } : {}),
        ...(typeof value.HideMiss === 'number' ? { hideMiss: value.HideMiss } : {}),
        ...(typeof value.HideNoEffect === 'number' ? { hideNoEffect: value.HideNoEffect } : {}),
        ...(value.AndCheckIndividualityList
          ? {
              andCheckTraits: value.AndCheckIndividualityList.map((id) => ({
                id,
                name: traitNameById.get(id) ?? `trait:${String(id)}`,
              })),
            }
          : {}),
      };
    });
  });
  return {
    kind: damageKindByFunction[rawFunctionType as keyof typeof damageKindByFunction],
    rawFunctionType: rawFunctionType as NpDamageSpec['rawFunctionType'],
    functionId: String(fn.funcId),
    target: fn.funcTargetType === 'enemyAll' ? 'all' : 'single',
    parametersByOvercharge: parametersByOvercharge as NpDamageSpec['parametersByOvercharge'],
    rawPath,
  } as NpDamageSpec;
}

function buffRateTargets(buffs: AtlasBuff[] | undefined) {
  return (buffs ?? []).flatMap((buff) =>
    (buff.script?.UpBuffRateBuffIndiv ?? []).flatMap((trait) => (trait.name ? [trait.name] : [])),
  );
}

function normalizeFunctions(functions: AtlasFunction[] | undefined) {
  return (functions ?? []).flatMap((fn) =>
    typeof fn.funcId === 'number'
      ? [
          {
            id: String(fn.funcId),
            type: fn.funcType ?? 'unknown',
            target: fn.funcTargetType ?? 'unknown',
            label: fn.funcPopupText ?? fn.funcType ?? '効果',
            values: (fn.svals ?? []).slice(0, 10).map((value) => value.Value ?? value.Rate ?? 0),
            recipientTraits: (fn.functvals ?? []).flatMap((trait) =>
              trait.name && !trait.negative ? [trait.name] : [],
            ),
            targetCondition: {
              anyOf: (fn.buffs ?? []).flatMap((buff) =>
                (buff.ckOpIndv ?? []).flatMap((trait) =>
                  trait.name && !trait.negative ? [trait.name] : [],
                ),
              ),
              noneOf: (fn.buffs ?? []).flatMap((buff) =>
                (buff.ckOpIndv ?? []).flatMap((trait) =>
                  trait.name && trait.negative ? [trait.name] : [],
                ),
              ),
            },
            requiredFieldTraits: (fn.funcquestTvals ?? []).flatMap((trait) =>
              trait.name ? [trait.name] : [],
            ),
            buffTypes: (fn.buffs ?? []).flatMap((buff) => (buff.type ? [buff.type] : [])),
            ...(buffRateTargets(fn.buffs).length
              ? { buffRateTargets: buffRateTargets(fn.buffs) }
              : {}),
            cardTypes: [
              ...new Set(
                (fn.buffs ?? []).flatMap((buff) =>
                  [...(buff.tvals ?? []), ...(buff.ckSelfIndv ?? [])].flatMap((trait) =>
                    trait.name && cardTypeByTrait[trait.name] ? [cardTypeByTrait[trait.name]] : [],
                  ),
                ),
              ),
            ],
          },
        ]
      : [],
  );
}

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
            ),
          ),
          effects: indexedFunctions.flatMap(({ fn, functionIndex }) =>
            fn.funcType?.startsWith('damageNp')
              ? []
              : normalizeFunctions([fn]).map((effect) => ({
                  ...effect,
                  timing:
                    firstDamageIndex >= 0 && functionIndex < firstDamageIndex
                      ? ('beforeDamage' as const)
                      : ('afterDamage' as const),
                })),
          ),
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
      effects: normalizeFunctions(skill.functions),
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
    const normalEffects = normalizeFunctions(normalSkill?.functions);
    const limitBreakEffects = normalizeFunctions(limitBreakSkill?.functions);
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
        effects: normalEffects.map((effect, index) => {
          const occurrence = normalEffects
            .slice(0, index)
            .filter((candidate) => candidate.id === effect.id).length;
          const limitBreakEffect = limitBreakEffects.filter(
            (candidate) => candidate.id === effect.id,
          )[occurrence];
          return {
            ...effect,
            values: [
              effect.values[0] ?? 0,
              limitBreakEffect?.values[0] ?? effect.values[0] ?? 0,
            ] as [number, number],
          };
        }),
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
              effects: normalizeFunctions(skill.functions),
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
        imageKey: mysticCode.extraAssets?.item?.male ?? mysticCode.extraAssets?.item?.female ?? null,
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
