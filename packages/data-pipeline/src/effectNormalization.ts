import type { ModifierValueExpression, NpDamageSpec } from '@fgo-lab/master-data';
import type { AtlasBuff, AtlasFunction, AtlasFunctionValue, AtlasTraitRef } from './atlasContract';
import { normalizeExecutionSemantics, normalizeTargetPolicy } from './executionSemantics';

export const cardMap: Record<string, 'buster' | 'arts' | 'quick'> = {
  1: 'arts',
  2: 'buster',
  3: 'quick',
};
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

export function normalizeNpDamageFunction(
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
const LIFECYCLE_PARAMETER_KEYS = new Set([
  'Count',
  'ForceAddState',
  'OnField',
  'ProcActive',
  'Turn',
  'UnSubState',
]);
const PRESENTATION_PARAMETER_KEYS = new Set([
  'AuraEffectId',
  'DisplayNoEffectCauses',
  'HideMiss',
  'HideNoEffect',
  'InvalidHide',
  'DisplayLastFuncInvalidType',
  'ShowQuestNoEffect',
  'ShowState',
  'SetPassiveFrame',
]);
const CONTEXT_MUTATION_PARAMETER_KEYS = new Set(['FieldIndividuality', 'TargetList']);
const BUFF_IDENTITY_PARAMETER_KEYS = new Set([
  'AddIndividualty',
  'AddIndividualtyList',
  'AddLinkageTargetIndividualty',
]);

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

function normalizeSourceQuantityConditions(
  parameterSets: readonly (readonly AtlasFunctionValue[])[],
) {
  const values = parameterSets
    .flatMap((set) => set)
    .flatMap((parameter) =>
      parameter['TriggeredTargetBattlePointRateRange'] === undefined
        ? []
        : [parameter['TriggeredTargetBattlePointRateRange']],
    );
  if (values.length === 0) return [];
  const uniqueValues = [...new Set(values.map((value) => JSON.stringify(value)))];
  const value = values[0];
  if (uniqueValues.length !== 1 || !Array.isArray(value) || value.length !== 1) return [];
  const item: unknown = value[0];
  if (!item || typeof item !== 'object') return [];
  const battlePointId = (item as Record<string, unknown>)['battlePointId'];
  const range = (item as Record<string, unknown>)['range'];
  if (
    typeof battlePointId !== 'number' ||
    !Number.isInteger(battlePointId) ||
    !Array.isArray(range) ||
    range.length !== 1 ||
    typeof range[0] !== 'string'
  )
    return [];
  const atMost = /^<=(-?\d+)$/.exec(range[0]);
  const atLeast = /^(-?\d+)<=$/.exec(range[0]);
  if (!atMost && !atLeast) return [];
  return [
    {
      quantity: 'battlePointRate' as const,
      subjectId: String(battlePointId),
      comparison: atMost ? ('atMost' as const) : ('atLeast' as const),
      value: Number((atMost ?? atLeast)![1]),
    },
  ];
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

function normalizeNpCardTypeChange(
  buffs: AtlasFunction['buffs'],
  traitNameById: ReadonlyMap<number, string>,
) {
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
  if (cards.length !== 1) return null;
  const card = cards[0]!;
  const matchingType =
    card === 'arts'
      ? 'tdTypeChangeArts'
      : card === 'buster'
        ? 'tdTypeChangeBuster'
        : 'tdTypeChangeQuick';
  const stateTraits = uniqueTraits(
    (buffs ?? []).flatMap((buff) =>
      buff.type === matchingType
        ? signedTraits(
            (buff.vals ?? []).filter((trait) => trait.id !== 3004),
            traitNameById,
          )
        : [],
    ),
  ).map((trait) => trait.name);
  return { card, stateTraits };
}

function normalizeTriggerScope(buffs: AtlasFunction['buffs'], source: 'skill' | 'np') {
  if (source !== 'skill') return null;
  if (
    (buffs ?? []).some((buff) => (buff.ckSelfIndv ?? []).some((trait) => trait.name === 'faceCard'))
  )
    return 'commandCard' as const;
  return (buffs ?? []).some((buff) => buff.type === 'attackBeforeFunction')
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
  sourceQuantityConditions: ReturnType<typeof normalizeSourceQuantityConditions>,
  valueExpressionKeys: readonly string[],
  choice: ReturnType<typeof normalizeEffectChoice>,
  operationTrigger: ReturnType<typeof normalizeOperationTrigger>,
  hasNormalizedConditionRouting: boolean,
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
  if (sourceQuantityConditions.length > 0) conditionKeys.add('TriggeredTargetBattlePointRateRange');
  if (hasNormalizedConditionRouting) conditionKeys.add('FuncCheckTargetIndividualityTargetType');
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
    ...BUFF_IDENTITY_PARAMETER_KEYS,
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
    buffIdentity: select(BUFF_IDENTITY_PARAMETER_KEYS),
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

export function normalizeFunctions(
  functions: AtlasFunction[] | undefined,
  traitNameById: ReadonlyMap<number, string>,
  source: 'skill' | 'np' = 'skill',
  ownerId?: number,
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
    const sourceQuantityConditions = normalizeSourceQuantityConditions(parameterSets);
    const modifierValues = normalizeModifierValueExpressions(parameterSets);
    const choice = normalizeEffectChoice(parameterSets);
    const npCardTypeChange = normalizeNpCardTypeChange(fn.buffs, traitNameById);
    const operationTrigger = normalizeOperationTrigger(parameterSets);
    const conditionRoutingValues = [
      ...new Set(
        parameterSets.flatMap((set) =>
          set.flatMap((parameter) =>
            parameter['FuncCheckTargetIndividualityTargetType'] === undefined
              ? []
              : [parameter['FuncCheckTargetIndividualityTargetType']],
          ),
        ),
      ),
    ];
    const hasNormalizedConditionRouting =
      conditionRoutingValues.length === 1 && conditionRoutingValues[0] === 0;
    const scriptTraits = (fn.buffs ?? []).flatMap((buff) =>
      buff.script?.INDIVIDUALITIE
        ? [{ buffType: buff.type, trait: buff.script.INDIVIDUALITIE }]
        : [],
    );
    const isFieldTrait = (trait: AtlasTraitRef) =>
      trait.name?.startsWith('field') === true || trait.name === 'milleniumCastle';
    const isCardChangeOwnerIdentity = ({ buffType, trait }: (typeof scriptTraits)[number]) =>
      ['tdTypeChange', 'tdTypeChangeArts', 'tdTypeChangeBuster', 'tdTypeChangeQuick'].includes(
        buffType ?? '',
      ) && trait.id === ownerId;
    const contextChanges = {
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
            .flatMap((parameter) => (typeof parameter.Value === 'number' ? [parameter.Value] : []))
            .flatMap((id) => {
              const name = traitNameById.get(id);
              return name ? [name] : [];
            })
            .filter((name, index, all) => all.indexOf(name) === index)
        : [],
      removedRecipientTraits: [],
    };
    const cardTypes = [
      ...new Set(
        (fn.buffs ?? []).flatMap((buff) =>
          [...(buff.tvals ?? []), ...(buff.ckSelfIndv ?? [])].flatMap((trait) => {
            const card = trait.name ? cardTypeByTrait[trait.name] : undefined;
            return card ? [card] : [];
          }),
        ),
      ),
    ];
    const parameterSemantics = classifyParameterSemantics(
      parameterSets,
      quantityConditions,
      sourceQuantityConditions,
      modifierValues.recognizedKeys,
      choice,
      operationTrigger,
      hasNormalizedConditionRouting,
    );
    const buffTypes = (fn.buffs ?? []).flatMap((buff) => (buff.type ? [buff.type] : []));
    let execution = normalizeExecutionSemantics({
      fn,
      parameterSets,
      valueExpressions: modifierValues.sets,
      cardTypes,
      cardTypeMutation: npCardTypeChange,
      contextChanges,
    });
    const unresolvedSemanticKeys = unresolvedFunctionScriptKeys(fn.script);
    if (parameterSemantics.unresolved.length > 0 || unresolvedSemanticKeys.length > 0)
      execution = execution.map((operation) =>
        operation.kind === 'damageModifier' ||
        operation.kind === 'modifierRateChange' ||
        operation.kind === 'ignoreDefense' ||
        operation.kind === 'ignoreDamageCut' ||
        operation.kind === 'cardTypeMutation'
          ? { ...operation, semanticSupport: 'unresolved' as const }
          : operation,
      );
    return [
      {
        id: String(fn.funcId),
        occurrenceId: `${String(fn.funcId)}:${String(occurrence)}`,
        label: fn.funcPopupText ?? fn.funcType ?? '効果',
        choice,
        triggerScope: normalizeTriggerScope(fn.buffs, source),
        operationTrigger,
        quantityConditions,
        sourceQuantityConditions,
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
            traits: uniqueTraits([
              ...signedTraits(fn.buffs?.[0]?.ckSelfIndv, traitNameById),
              ...scriptTraits.flatMap((entry) =>
                entry.buffType === 'upCommandall' &&
                fn.funcTargetType === 'self' &&
                !isFieldTrait(entry.trait)
                  ? signedTraits([entry.trait], traitNameById)
                  : [],
              ),
            ]),
          },
          opponent: {
            operator: buffConditionOperator(fn.buffs?.[0]?.script?.checkIndvType),
            traits: signedTraits(fn.buffs?.[0]?.ckOpIndv, traitNameById),
          },
          field: {
            operator: 'any' as const,
            traits: uniqueTraits([
              ...signedTraits(fn.funcquestTvals, traitNameById),
              ...scriptTraits.flatMap((entry) =>
                isFieldTrait(entry.trait) && !isCardChangeOwnerIdentity(entry)
                  ? signedTraits([entry.trait], traitNameById)
                  : [],
              ),
            ]),
          },
        },
        conditionTargetPolicy: normalizeTargetPolicy(fn.funcTargetType ?? 'unknown'),
        execution,
        atlasEvidence: {
          functionType: fn.funcType ?? 'unknown',
          target: fn.funcTargetType ?? 'unknown',
          parameterSets,
          parameterSemantics,
          unresolvedSemanticKeys,
          buffTypes,
          buffRateTargets: buffRateTargets(fn.buffs),
        },
      },
    ];
  });
}
