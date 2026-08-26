import { createHash } from 'node:crypto';
import type {
  MasterDataSnapshot,
  MasterManifest,
  ModifierValueExpression,
  NpDamageSpec,
} from '@fgo-lab/master-data';
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
    schemaVersion: 17,
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
  script?: {
    UpBuffRateBuffIndiv?: AtlasTraitRef[];
    checkIndvType?: number;
    INDIVIDUALITIE?: AtlasTraitRef;
  };
};
type AtlasFunction = {
  funcId?: number;
  funcType?: string;
  funcTargetType?: string;
  funcPopupText?: string;
  functvals?: AtlasTraitRef[];
  funcquestTvals?: AtlasTraitRef[];
  script?: Record<string, unknown> & { funcIndividuality?: AtlasTraitRef[] };
  buffs?: AtlasBuff[];
  overWriteTvalsList?: unknown[];
  svals?: AtlasFunctionValue[];
  svals2?: AtlasFunctionValue[];
  svals3?: AtlasFunctionValue[];
  svals4?: AtlasFunctionValue[];
  svals5?: AtlasFunctionValue[];
};
type AtlasFunctionValue = Record<string, unknown> & {
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
  FieldIndividuality?: number[];
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
  battlePoints?: { id?: number; phases?: { phase?: number }[] }[];
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
  maximumBattlePointPhaseById: ReadonlyMap<number, number>,
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
  const kind = damageKindByFunction[rawFunctionType as keyof typeof damageKindByFunction];
  const battlePointId = parametersByOvercharge[0]?.[0]?.targetId;
  const maximumBattlePointPhase =
    kind === 'battlePointPhase' && battlePointId !== undefined
      ? maximumBattlePointPhaseById.get(battlePointId)
      : undefined;
  if (kind === 'battlePointPhase' && maximumBattlePointPhase === undefined)
    throw new TypeError(`missing_battle_point_definition:${rawPath}:${String(battlePointId)}`);
  return {
    kind,
    rawFunctionType: rawFunctionType as NpDamageSpec['rawFunctionType'],
    functionId: String(fn.funcId),
    target: fn.funcTargetType === 'enemyAll' ? 'all' : 'single',
    parametersByOvercharge: parametersByOvercharge as NpDamageSpec['parametersByOvercharge'],
    ...(maximumBattlePointPhase === undefined ? {} : { maximumBattlePointPhase }),
    rawPath,
  } as NpDamageSpec;
}

function buffRateTargets(buffs: AtlasBuff[] | undefined) {
  return (buffs ?? []).flatMap((buff) =>
    (buff.script?.UpBuffRateBuffIndiv ?? []).flatMap((trait) => (trait.name ? [trait.name] : [])),
  );
}

function signedTraits(
  traits: readonly AtlasTraitRef[] | undefined,
  traitNameById: ReadonlyMap<number, string>,
) {
  return (traits ?? []).flatMap((trait) =>
    trait.name && trait.name !== 'unknown'
      ? [{ name: trait.name, negative: Boolean(trait.negative) }]
      : typeof trait.id === 'number' && traitNameById.has(trait.id)
        ? [{ name: traitNameById.get(trait.id)!, negative: Boolean(trait.negative) }]
        : typeof trait.id === 'number'
          ? [{ name: `traitId:${String(trait.id)}`, negative: Boolean(trait.negative) }]
          : trait.name
            ? [{ name: trait.name, negative: Boolean(trait.negative) }]
            : [],
  );
}

function buffConditionOperator(value: number | undefined): 'any' | 'all' | 'partial' {
  if (value === 1 || value === 3) return 'all';
  if (value === 4) return 'partial';
  return 'any';
}

function uniqueTraits(traits: readonly { name: string; negative: boolean }[]) {
  return [
    ...new Map(
      traits.map((trait) => [`${trait.negative ? '!' : ''}${trait.name}`, trait]),
    ).values(),
  ];
}

const VALUE_PARAMETER_KEYS = new Set(['Rate', 'Value']);
const LIFECYCLE_PARAMETER_KEYS = new Set(['Count', 'OnField', 'Turn']);
const PRESENTATION_PARAMETER_KEYS = new Set([
  'AuraEffectId',
  'DisplayNoEffectCauses',
  'HideMiss',
  'HideNoEffect',
  'InvalidHide',
  'DisplayLastFuncInvalidType',
  'ShowQuestNoEffect',
  'ShowState',
]);
const CONTEXT_MUTATION_PARAMETER_KEYS = new Set(['FieldIndividuality', 'TargetList']);

interface NormalizedQuantityCondition {
  quantity: 'attackerHpPermille' | 'battlePointPhase';
  subjectId?: string;
  comparison: 'atMost' | 'atLeast';
  value: number;
}

function normalizeQuantityConditions(
  parameterSets: readonly (readonly AtlasFunctionValue[])[],
): NormalizedQuantityCondition[] {
  const conditions: NormalizedQuantityCondition[] = [];
  const values = parameterSets
    .flatMap((set) => set)
    .flatMap((parameter) =>
      parameter['CheckBattlePointPhaseRange'] === undefined
        ? []
        : [parameter['CheckBattlePointPhaseRange']],
    );
  if (values.length > 0) {
    const uniqueValues = [...new Set(values.map((value) => JSON.stringify(value)))];
    const value = values[0];
    if (uniqueValues.length === 1 && Array.isArray(value) && value.length === 1) {
      const item: unknown = value[0];
      if (item && typeof item === 'object') {
        const battlePointId = (item as Record<string, unknown>)['battlePointId'];
        const range = (item as Record<string, unknown>)['range'];
        if (
          typeof battlePointId === 'number' &&
          Number.isInteger(battlePointId) &&
          Array.isArray(range) &&
          range.length === 1 &&
          typeof range[0] === 'string'
        ) {
          const atMost = /^<=(-?\d+)$/.exec(range[0]);
          const atLeast = /^(-?\d+)<=$/.exec(range[0]);
          if (atMost || atLeast)
            conditions.push({
              quantity: 'battlePointPhase',
              subjectId: String(battlePointId),
              comparison: atMost ? 'atMost' : 'atLeast',
              value: Number((atMost ?? atLeast)![1]),
            });
        }
      }
    }
  }
  const hpRanges = parameterSets
    .flatMap((set) => set)
    .flatMap((parameter) =>
      typeof parameter['RatioHPRangeLow'] === 'number' &&
      typeof parameter['RatioHPRangeHigh'] === 'number'
        ? [
            {
              minimum: parameter['RatioHPRangeLow'],
              maximum: parameter['RatioHPRangeHigh'],
            },
          ]
        : [],
    );
  const uniqueHpRanges = [
    ...new Map(
      hpRanges.map((range) => [`${String(range.minimum)}:${String(range.maximum)}`, range]),
    ),
  ];
  if (uniqueHpRanges.length === 1) {
    const range = uniqueHpRanges[0]![1];
    conditions.push(
      {
        quantity: 'attackerHpPermille',
        comparison: 'atLeast',
        value: range.minimum,
      },
      {
        quantity: 'attackerHpPermille',
        comparison: 'atMost',
        value: range.maximum,
      },
    );
  }
  return conditions;
}

const HP_VALUE_PARAMETER_KEYS = new Set([
  'RatioHPHigh',
  'RatioHPLow',
  'RatioHPRangeHigh',
  'RatioHPRangeLow',
]);

function normalizeModifierValueExpressions(
  parameterSets: readonly (readonly AtlasFunctionValue[])[],
) {
  const presentKeys = [
    ...new Set(
      parameterSets.flatMap((set) =>
        set.flatMap((parameter) =>
          Object.keys(parameter).filter((key) => HP_VALUE_PARAMETER_KEYS.has(key)),
        ),
      ),
    ),
  ].sort();
  const sets = parameterSets.map((set) =>
    set.map((parameter) => {
      const hpKeys = Object.keys(parameter).filter((key) => HP_VALUE_PARAMETER_KEYS.has(key));
      if (hpKeys.length === 0) return null;
      const basePermille = parameter['Value'];
      const low = parameter['RatioHPLow'];
      const high = parameter['RatioHPHigh'];
      const rangeLow = parameter['RatioHPRangeLow'];
      const rangeHigh = parameter['RatioHPRangeHigh'];
      if (typeof basePermille !== 'number' || typeof low !== 'number') return null;
      if (rangeLow === undefined && rangeHigh === undefined && high === undefined)
        return {
          kind: 'inverseHpLinear' as const,
          basePermille,
          bonusAtZeroHpPermille: low,
        };
      if (
        typeof high === 'number' &&
        typeof rangeLow === 'number' &&
        typeof rangeHigh === 'number' &&
        rangeLow < rangeHigh
      )
        return {
          kind: 'hpRangeLinear' as const,
          basePermille,
          minimumHpPermille: rangeLow,
          maximumHpPermille: rangeHigh,
          valueAtMinimumHpPermille: low,
          valueAtMaximumHpPermille: high,
        };
      return null;
    }),
  ) as [
    (ModifierValueExpression | null)[],
    (ModifierValueExpression | null)[],
    (ModifierValueExpression | null)[],
    (ModifierValueExpression | null)[],
    (ModifierValueExpression | null)[],
  ];
  const sourceExpressionCount = parameterSets
    .flatMap((set) => set)
    .filter((parameter) =>
      Object.keys(parameter).some((key) => HP_VALUE_PARAMETER_KEYS.has(key)),
    ).length;
  const normalizedExpressionCount = sets.flat().filter((expression) => expression !== null).length;
  return {
    sets,
    recognizedKeys: sourceExpressionCount === normalizedExpressionCount ? presentKeys : [],
  };
}

function normalizeEffectChoice(parameterSets: readonly (readonly AtlasFunctionValue[])[]) {
  const parameters = parameterSets.flatMap((set) => set);
  const candidate = (key: 'ActSet' | 'ActSelectIndex') => {
    const values = [
      ...new Set(
        parameters.flatMap((parameter) =>
          typeof parameter[key] === 'number' && Number.isInteger(parameter[key])
            ? [parameter[key]]
            : parameter[key] === undefined
              ? []
              : [Number.NaN],
        ),
      ),
    ];
    return values.length === 1 && Number.isInteger(values[0]) ? values[0]! : null;
  };
  const actSet = candidate('ActSet');
  const actSelectIndex = candidate('ActSelectIndex');
  if (actSet !== null && actSelectIndex === null)
    return { family: 'actSet' as const, candidate: actSet };
  if (actSelectIndex !== null && actSet === null)
    return { family: 'actSelectIndex' as const, candidate: actSelectIndex };
  return null;
}

function normalizeNpCardTypeChange(buffs: AtlasFunction['buffs']) {
  const cards = [
    ...new Set(
      (buffs ?? []).flatMap((buff) => {
        if (buff.type === 'tdTypeChangeArts') return ['arts' as const];
        if (buff.type === 'tdTypeChangeBuster') return ['buster' as const];
        if (buff.type === 'tdTypeChangeQuick') return ['quick' as const];
        return [];
      }),
    ),
  ];
  return cards.length === 1 ? cards[0]! : null;
}

function normalizeTriggerScope(buffs: AtlasFunction['buffs'], source: 'skill' | 'np') {
  return source === 'skill' && (buffs ?? []).some((buff) => buff.type === 'attackBeforeFunction')
    ? ('commandCardAttack' as const)
    : null;
}

function normalizeOperationTrigger(parameterSets: readonly (readonly AtlasFunctionValue[])[]) {
  const values = [
    ...new Set(
      parameterSets.flatMap((set) =>
        set.flatMap((parameter) =>
          typeof parameter.TriggeredFuncPosition === 'number' &&
          Number.isInteger(parameter.TriggeredFuncPosition)
            ? [parameter.TriggeredFuncPosition]
            : parameter.TriggeredFuncPosition === undefined
              ? []
              : [Number.NaN],
        ),
      ),
    ),
  ];
  return values.length === 1 && Number.isInteger(values[0])
    ? { kind: 'functionPosition' as const, position: values[0]! }
    : null;
}

function classifyParameterSemantics(
  parameterSets: readonly (readonly AtlasFunctionValue[])[],
  quantityConditions: readonly NormalizedQuantityCondition[],
  valueExpressionKeys: readonly string[],
  choice: ReturnType<typeof normalizeEffectChoice>,
  operationTrigger: ReturnType<typeof normalizeOperationTrigger>,
) {
  const keys = [
    ...new Set(parameterSets.flatMap((set) => set.flatMap((parameter) => Object.keys(parameter)))),
  ].sort();
  const select = (accepted: ReadonlySet<string>) => keys.filter((key) => accepted.has(key));
  const conditionKeys = new Set(
    quantityConditions.some((condition) => condition.quantity === 'battlePointPhase')
      ? ['CheckBattlePointPhaseRange']
      : [],
  );
  const choiceKeys = new Set(
    choice?.family === 'actSet'
      ? ['ActSet', ...(keys.includes('ActSetWeight') ? ['ActSetWeight'] : [])]
      : choice?.family === 'actSelectIndex'
        ? ['ActSelectIndex']
        : [],
  );
  const triggerKeys = new Set(operationTrigger ? ['TriggeredFuncPosition'] : []);
  const known = new Set([
    ...VALUE_PARAMETER_KEYS,
    ...LIFECYCLE_PARAMETER_KEYS,
    ...PRESENTATION_PARAMETER_KEYS,
    ...conditionKeys,
    ...CONTEXT_MUTATION_PARAMETER_KEYS,
    ...choiceKeys,
    ...triggerKeys,
    ...valueExpressionKeys,
  ]);
  return {
    value: select(VALUE_PARAMETER_KEYS),
    lifecycle: select(LIFECYCLE_PARAMETER_KEYS),
    presentation: select(PRESENTATION_PARAMETER_KEYS),
    condition: keys.filter((key) => conditionKeys.has(key) || triggerKeys.has(key)),
    contextMutation: select(CONTEXT_MUTATION_PARAMETER_KEYS),
    choice: select(choiceKeys),
    valueExpression: keys.filter((key) => valueExpressionKeys.includes(key)),
    unresolved: keys.filter((key) => !known.has(key)),
  };
}

function unresolvedFunctionScriptKeys(script: AtlasFunction['script']): string[] {
  if (!script) return [];
  return Object.entries(script)
    .filter(([key, value]) => {
      if (key === 'overwriteTvals') return false;
      if (key === 'funcIndividuality' && Array.isArray(value) && value.length === 0) return false;
      return true;
    })
    .map(([key]) => `script:${key}`)
    .sort();
}

function normalizeFunctions(
  functions: AtlasFunction[] | undefined,
  traitNameById: ReadonlyMap<number, string>,
  source: 'skill' | 'np' = 'skill',
) {
  const occurrencesByFunctionId = new Map<number, number>();
  return (functions ?? []).flatMap((fn) => {
    if (typeof fn.funcId !== 'number') return [];
    const occurrence = occurrencesByFunctionId.get(fn.funcId) ?? 0;
    occurrencesByFunctionId.set(fn.funcId, occurrence + 1);
    const parameterSets = [fn.svals, fn.svals2, fn.svals3, fn.svals4, fn.svals5].map((parameters) =>
      (parameters ?? []).slice(0, 10),
    ) as [
      AtlasFunctionValue[],
      AtlasFunctionValue[],
      AtlasFunctionValue[],
      AtlasFunctionValue[],
      AtlasFunctionValue[],
    ];
    const quantityConditions = normalizeQuantityConditions(parameterSets);
    const modifierValues = normalizeModifierValueExpressions(parameterSets);
    const choice = normalizeEffectChoice(parameterSets);
    const npCardTypeChange = normalizeNpCardTypeChange(fn.buffs);
    const operationTrigger = normalizeOperationTrigger(parameterSets);
    return [
      {
        id: String(fn.funcId),
        occurrenceId: `${String(fn.funcId)}:${String(occurrence)}`,
        type: fn.funcType ?? 'unknown',
        target: fn.funcTargetType ?? 'unknown',
        label: fn.funcPopupText ?? fn.funcType ?? '効果',
        parameterSets,
        parameterSemantics: classifyParameterSemantics(
          parameterSets,
          quantityConditions,
          modifierValues.recognizedKeys,
          choice,
          operationTrigger,
        ),
        unresolvedSemanticKeys: unresolvedFunctionScriptKeys(fn.script),
        choice,
        npCardTypeChange,
        triggerScope: normalizeTriggerScope(fn.buffs, source),
        operationTrigger,
        quantityConditions,
        modifierValueExpressionSets: modifierValues.sets,
        conditions: {
          recipient:
            (fn.overWriteTvalsList ?? []).length > 0
              ? fn.overWriteTvalsList!.map((group) => ({
                  operator: 'all' as const,
                  traits: signedTraits(
                    Array.isArray(group) ? (group as AtlasTraitRef[]) : [],
                    traitNameById,
                  ),
                }))
              : [
                  {
                    operator: 'any' as const,
                    traits: signedTraits(fn.functvals, traitNameById),
                  },
                ],
          holder: {
            operator: buffConditionOperator(fn.buffs?.[0]?.script?.checkIndvType),
            traits: signedTraits(fn.buffs?.[0]?.ckSelfIndv, traitNameById),
          },
          opponent: {
            operator: buffConditionOperator(fn.buffs?.[0]?.script?.checkIndvType),
            traits: signedTraits(fn.buffs?.[0]?.ckOpIndv, traitNameById),
          },
          field: {
            operator: 'any' as const,
            traits: uniqueTraits([
              ...signedTraits(fn.funcquestTvals, traitNameById),
              ...(fn.buffs ?? []).flatMap((buff) =>
                signedTraits(
                  buff.script?.INDIVIDUALITIE ? [buff.script.INDIVIDUALITIE] : [],
                  traitNameById,
                ),
              ),
            ]),
          },
        },
        contextChanges: {
          addedFieldTraits:
            fn.funcType === 'addFieldChangeToField' ||
            (fn.buffs ?? []).some((buff) => buff.type === 'fieldIndividuality')
              ? [fn.svals, fn.svals2, fn.svals3, fn.svals4, fn.svals5]
                  .flatMap((parameters) => parameters ?? [])
                  .flatMap((parameter) => [
                    ...(parameter.FieldIndividuality ?? []),
                    ...((fn.buffs ?? []).some((buff) => buff.type === 'fieldIndividuality') &&
                    typeof parameter.Value === 'number'
                      ? [parameter.Value]
                      : []),
                  ])
                  .flatMap((id) => {
                    const name = traitNameById.get(id);
                    return name ? [name] : [];
                  })
                  .filter((name, index, all) => all.indexOf(name) === index)
              : [],
          removedFieldTraits: (fn.buffs ?? []).some((buff) => buff.type === 'subFieldIndividuality')
            ? [fn.svals, fn.svals2, fn.svals3, fn.svals4, fn.svals5]
                .flatMap((parameters) => parameters ?? [])
                .flatMap((parameter) => parameter.TargetList ?? [])
                .flatMap((id) => {
                  const name = traitNameById.get(id);
                  return name ? [name] : [];
                })
                .filter((name, index, all) => all.indexOf(name) === index)
            : [],
          addedRecipientTraits: (fn.buffs ?? []).some((buff) => buff.type === 'addIndividuality')
            ? [fn.svals, fn.svals2, fn.svals3, fn.svals4, fn.svals5]
                .flatMap((parameters) => parameters ?? [])
                .flatMap((parameter) =>
                  typeof parameter.Value === 'number' ? [parameter.Value] : [],
                )
                .flatMap((id) => {
                  const name = traitNameById.get(id);
                  return name ? [name] : [];
                })
                .filter((name, index, all) => all.indexOf(name) === index)
            : [],
          removedRecipientTraits: [],
        },
        buffTypes: (fn.buffs ?? []).flatMap((buff) => (buff.type ? [buff.type] : [])),
        ...(buffRateTargets(fn.buffs).length ? { buffRateTargets: buffRateTargets(fn.buffs) } : {}),
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
    ];
  });
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
      effects: normalizeFunctions(skill.functions, traitNameById),
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
    const limitBreakEffects = normalizeFunctions(limitBreakSkill?.functions, traitNameById);
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
            limitBreakParameterSets: limitBreakEffect?.parameterSets ?? effect.parameterSets,
            limitBreakModifierValueExpressionSets:
              limitBreakEffect?.modifierValueExpressionSets ?? effect.modifierValueExpressionSets,
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
