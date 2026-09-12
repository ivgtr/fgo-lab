import { isOcRateFunction, ocConditionParameterKeys } from './ocSemantics';
import { normalizeNpStackQuantity, normalizeEffectStackInputs } from './stackQuantityNormalization';
import type {
  ActorCountPredicate,
  CanonicalEffectRequirement,
  CanonicalInputDefinition,
  CanonicalTargetPolicy,
  EffectExecutionOperation,
  ModifierValueExpression,
  MasterEffect,
  NpDamageSpec,
  CanonicalTraitProvenance,
} from '@fgo-lab/master-data';
import type {
  AtlasBuff,
  AtlasFunction,
  AtlasFunctionValue,
  AtlasReferencedSkill,
  AtlasTraitRef,
} from './atlasContract';
import { canonicalTargetPredicate } from './targetTaxonomy';
import { normalizeExecutionSemantics, normalizeTargetPolicy } from './executionSemantics';
import { normalizeNpBuffCount, normalizeCountedBuffMutation } from './npCountNormalization';
import {
  normalizeDamageReachableStateMutations,
  stateMutationTraitName,
  type DamageReachableStateCatalog,
} from './targetStateNormalization';

const EMPTY_STATE_CATALOG: DamageReachableStateCatalog = { stateOnlyTraits: new Set() };
type NormalizedTraitCondition = {
  operator: 'any' | 'all';
  traits: (
    | { name: string; negative: boolean; layer: 'combined' | 'state' }
    | { predicate: NonNullable<ReturnType<typeof canonicalTargetPredicate>>; negative: boolean }
  )[];
};

export const cardMap: Record<string, 'buster' | 'arts' | 'quick'> = {
  1: 'arts',
  2: 'buster',
  3: 'quick',
  arts: 'arts',
  buster: 'buster',
  quick: 'quick',
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
  stateCatalog: DamageReachableStateCatalog = EMPTY_STATE_CATALOG,
): NpDamageSpec {
  const normalizeDamageTrait = (id: number, targetSemantic = true) => {
    const name = traitNameById.get(id) ?? `traitId:${String(id)}`;
    const predicate = targetSemantic ? canonicalTargetPredicate(name) : null;
    return predicate
      ? { kind: 'targetPredicate' as const, predicate }
      : { kind: 'trait' as const, name };
  };
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
              targetTrait: normalizeDamageTrait(value.Target),
            }
          : {}),
        ...(typeof value.Correction === 'number' ? { correctionPermille: value.Correction } : {}),
        ...(value.TargetList ? { targetIds: value.TargetList } : {}),
        ...(value.TargetList
          ? {
              targetTraits: value.TargetList.map((id) =>
                normalizeDamageTrait(id, value.Target === 1),
              ),
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
              andCheckTraits: value.AndCheckIndividualityList.map((id) => normalizeDamageTrait(id)),
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
  const stateTraitNames = [
    ...new Set(
      parametersByOvercharge.flatMap((parameters) =>
        parameters.flatMap((parameter) => [
          ...(parameter.targetTrait?.kind === 'trait' ? [parameter.targetTrait.name] : []),
          ...(parameter.targetTraits ?? []).flatMap((trait) =>
            trait.kind === 'trait' ? [trait.name] : [],
          ),
          ...(parameter.andCheckTraits ?? []).flatMap((trait) =>
            trait.kind === 'trait' ? [trait.name] : [],
          ),
        ]),
      ),
    ),
  ].filter((trait) => stateCatalog.stateOnlyTraits.has(trait));
  return {
    kind,
    rawFunctionType: rawFunctionType as NpDamageSpec['rawFunctionType'],
    functionId: String(fn.funcId),
    target: fn.funcTargetType === 'enemyAll' ? 'all' : 'single',
    parametersByOvercharge: parametersByOvercharge as NpDamageSpec['parametersByOvercharge'],
    stateTraitNames,
    ...(kind === 'traitCount'
      ? {
          quantity: normalizeNpStackQuantity(
            parametersByOvercharge as NpDamageSpec['parametersByOvercharge'],
            stateCatalog.stackLabels,
          ),
        }
      : {}),
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
  canonicalizeTarget = false,
  stateCatalog: DamageReachableStateCatalog = EMPTY_STATE_CATALOG,
): NormalizedTraitCondition['traits'] {
  return (traits ?? []).flatMap<NormalizedTraitCondition['traits'][number]>((trait) => {
    const stateName = stateMutationTraitName(trait, traitNameById);
    const name =
      stateName && stateCatalog.stateOnlyTraits.has(stateName)
        ? stateName
        : trait.name && trait.name !== 'unknown'
          ? trait.name
          : typeof trait.id === 'number' && traitNameById.has(trait.id)
            ? traitNameById.get(trait.id)!
            : typeof trait.id === 'number'
              ? `traitId:${String(trait.id)}`
              : trait.name;
    if (!name) return [];
    const predicate = canonicalizeTarget ? canonicalTargetPredicate(name) : null;
    return predicate
      ? [{ predicate, negative: Boolean(trait.negative) }]
      : [
          {
            name,
            negative: Boolean(trait.negative),
            layer: stateCatalog.stateOnlyTraits.has(name) ? 'state' : 'combined',
          },
        ];
  });
}

function buffConditionOperator(value: number | undefined): 'any' | 'all' {
  if (value === 1 || value === 3) return 'all';
  if (value === 4) return 'any';
  return 'any';
}

function normalizeForcedEqualRange(range: unknown): {
  comparison: 'atMost' | 'atLeast' | 'equal';
  value: number;
} | null {
  if (typeof range !== 'string') return null;
  const match = /^(<=|<|>=|>|=*)(\d+)$/.exec(range.trim());
  if (!match) return null;
  const value = Number(match[2]);
  const operator = match[1];
  if (operator === '<' || operator === '<=') return { comparison: 'atMost', value };
  if (operator === '>' || operator === '>=') return { comparison: 'atLeast', value };
  return { comparison: 'equal', value };
}

type ActorCountPredicateAtom =
  | { kind: 'trait'; trait: { name: string; negative: boolean } }
  | { kind: 'actorProperty'; property: 'inBattle' };

function normalizeActorCountAtom(
  value: number,
  traitNameById: ReadonlyMap<number, string>,
): ActorCountPredicateAtom | null {
  if (Math.abs(value) === 10_000) return null;
  const id = Math.abs(value);
  const name = traitNameById.get(id);
  if (!name) throw new TypeError(`unknown_param_add_trait:${String(value)}`);
  if (name === 'canBeInBattle') return { kind: 'actorProperty', property: 'inBattle' };
  return { kind: 'trait', trait: { name, negative: value < 0 } };
}

function normalizeActorCountPredicate(
  rawTraits: unknown,
  rawClauses: unknown,
  traitNameById: ReadonlyMap<number, string>,
): ActorCountPredicate | null {
  if (rawTraits !== undefined && rawClauses !== undefined)
    throw new TypeError('ambiguous_param_add_predicate');
  if (rawTraits !== undefined) {
    if (!Array.isArray(rawTraits) || !rawTraits.every((value) => typeof value === 'number'))
      throw new TypeError(`invalid_param_add_traits:${JSON.stringify(rawTraits)}`);
    const atoms = rawTraits.flatMap((value) => {
      const atom = normalizeActorCountAtom(value, traitNameById);
      return atom ? [atom] : [];
    });
    if (atoms.length === 0) throw new TypeError('empty_param_add_traits');
    return { counting: 'matchingTraits', atoms };
  }
  if (rawClauses !== undefined) {
    if (
      !Array.isArray(rawClauses) ||
      !rawClauses.every(
        (clause) => Array.isArray(clause) && clause.every((value) => typeof value === 'number'),
      )
    )
      throw new TypeError(`invalid_param_add_clauses:${JSON.stringify(rawClauses)}`);
    const clauses = rawClauses.map((clause) =>
      clause.flatMap((value) => {
        const atom = normalizeActorCountAtom(value, traitNameById);
        return atom ? [atom] : [];
      }),
    );
    if (clauses.length === 0 || clauses.some((clause) => clause.length === 0))
      throw new TypeError('empty_param_add_clause');
    return { counting: 'matchingClauses', clauses };
  }
  return null;
}

const countTraitLabels: Readonly<Record<string, string>> = {
  king: '王',
  alignmentEvil: '悪',
};

function singlePositiveTraitLabel(predicate: ActorCountPredicate | null): string | null {
  if (!predicate) return null;
  const atoms =
    predicate.counting === 'matchingTraits'
      ? predicate.atoms
      : predicate.clauses.length === 1
        ? predicate.clauses[0]!
        : [];
  if (atoms.length !== 1 || atoms[0]?.kind !== 'trait' || atoms[0].trait.negative) return null;
  return countTraitLabels[atoms[0].trait.name] ?? null;
}

function predicateIsInBattle(predicate: ActorCountPredicate | null): boolean {
  if (!predicate) return false;
  const atoms =
    predicate.counting === 'matchingTraits'
      ? predicate.atoms
      : predicate.clauses.length === 1
        ? predicate.clauses[0]!
        : [];
  return atoms.length === 1 && atoms[0]?.kind === 'actorProperty';
}

function uniqueTraits(traits: NormalizedTraitCondition['traits']) {
  return [
    ...new Map(
      traits.map((trait) => [
        `${trait.negative ? '!' : ''}${
          'name' in trait ? trait.name : JSON.stringify(trait.predicate)
        }`,
        trait,
      ]),
    ).values(),
  ];
}

const VALUE_PARAMETER_KEYS = new Set(['Rate', 'Value']);
const LIFECYCLE_PARAMETER_KEYS = new Set([
  'CheckDead',
  'Count',
  'ExcludeUnSubStateIndiv',
  'ForceAddState',
  'OnField',
  'ProcActive',
  'SelfTurnProgressGroup',
  'Turn',
  'TriggeredFuncPositionSameTarget',
  'UnSubState',
  'UseRate',
  'Value2',
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
  'ShowCardOnly',
]);
const CONTEXT_MUTATION_PARAMETER_KEYS = new Set(['FieldIndividuality', 'TargetList']);
const BUFF_IDENTITY_PARAMETER_KEYS = new Set([
  'AddIndividualty',
  'AddIndividualtyList',
  'AddLinkageTargetIndividualty',
  'BehaveAsFamilyBuff',
  'UnSubStateWhileLinkedToOthers',
]);
const TRAIT_PROVENANCE_PARAMETER_KEYS = new Set([
  'IncludeIgnoreIndividuality',
  'IncludePassiveIndividuality',
  'IgnoreIndivUnreleaseable',
]);

function normalizeTraitProvenance(
  parameterSets: readonly (readonly AtlasFunctionValue[])[],
): CanonicalTraitProvenance {
  const flag = (key: keyof AtlasFunctionValue) => {
    const values = [
      ...new Set(
        parameterSets.flatMap((set) =>
          set.flatMap((parameter) => (parameter[key] === undefined ? [] : [parameter[key]])),
        ),
      ),
    ];
    if (values.some((value) => value !== 0 && value !== 1) || values.length > 1)
      throw new TypeError(`ambiguous_trait_read_policy:${key}:${JSON.stringify(values)}`);
    return values[0] === 1;
  };
  return {
    stateSources: flag('IncludePassiveIndividuality') ? 'activeAndPassive' : 'activeOnly',
    ignoredStateTraits: flag('IncludeIgnoreIndividuality') ? 'include' : 'exclude',
    unremovableStateTraits: flag('IgnoreIndivUnreleaseable') ? 'exclude' : 'include',
  };
}

function canonicalTraitRequirement(
  condition: NormalizedTraitCondition,
  scope: 'recipient' | 'opponent' | 'field',
  provenance: CanonicalTraitProvenance,
  cardScope: boolean,
): CanonicalEffectRequirement {
  if (condition.traits.length === 0) return { kind: 'always' };
  const requirements = condition.traits.map<CanonicalEffectRequirement>((trait) => {
    if ('predicate' in trait) {
      if (scope === 'field') throw new TypeError('target_predicate_scope:field');
      return {
        kind: 'targetPredicate',
        scope,
        predicate: trait.predicate,
        present: !trait.negative,
      };
    }
    const card = cardScope ? cardTypeByTrait[trait.name] : undefined;
    if (card) return { kind: 'card', card, present: !trait.negative };
    const attack = cardScope
      ? (
          {
            cardNP: 'noblePhantasm',
            faceCard: 'faceCard',
            cardExtra: 'extraCard',
          } as const
        )[trait.name as 'cardNP' | 'faceCard' | 'cardExtra']
      : undefined;
    if (attack) return { kind: 'attackType', attack, present: !trait.negative };
    return {
      kind: 'trait',
      scope:
        trait.layer === 'state'
          ? scope === 'recipient'
            ? 'recipientState'
            : scope === 'opponent'
              ? 'opponentState'
              : 'field'
          : scope,
      trait: trait.name,
      present: !trait.negative,
      provenance,
    };
  });
  return { kind: condition.operator, requirements };
}

function combineCanonicalRequirements(
  requirements: CanonicalEffectRequirement[],
): CanonicalEffectRequirement {
  const useful = requirements.filter(({ kind }) => kind !== 'always');
  return useful.length === 0
    ? { kind: 'always' }
    : useful.length === 1
      ? useful[0]!
      : { kind: 'all', requirements: useful };
}

function normalizeStateIdentity(
  parameterSets: readonly (readonly AtlasFunctionValue[])[],
): { kind: 'linkedTraitFamily'; key: string } | null {
  const ids = [
    ...new Set(
      parameterSets.flatMap((set) =>
        set.flatMap((parameter) =>
          typeof parameter.AddLinkageTargetIndividualty === 'number'
            ? [parameter.AddLinkageTargetIndividualty]
            : [],
        ),
      ),
    ),
  ];
  if (ids.length > 1) throw new TypeError(`ambiguous_linked_trait_identity:${JSON.stringify(ids)}`);
  return ids.length === 1 ? { kind: 'linkedTraitFamily', key: `trait:${String(ids[0])}` } : null;
}

interface NormalizedQuantityCondition {
  quantity: 'attackerHpPermille' | 'battlePointPhase';
  subjectId?: string | undefined;
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

function normalizeBuffHpConditions(
  buffs: readonly AtlasBuff[] | undefined,
  targetPolicy: CanonicalTargetPolicy,
) {
  const raw = (buffs ?? []).flatMap((buff) =>
    (['HP_LOWER', 'HP_HIGHER'] as const).flatMap((key) =>
      buff.script && Object.hasOwn(buff.script, key) ? [{ key, value: buff.script[key] }] : [],
    ),
  );
  if (raw.length === 0) return [];
  if (!['sourceSelf', 'partyMember', 'partyOther'].includes(targetPolicy))
    throw new TypeError(`unsupported_hp_condition_target:${targetPolicy}`);
  if (
    raw.some(
      ({ value }) =>
        typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1_000,
    )
  )
    throw new TypeError(`invalid_hp_condition_threshold:${JSON.stringify(raw)}`);
  const conditions = [
    ...new Map(raw.map(({ key, value }) => [`${key}:${String(value)}`, { key, value }])).values(),
  ];
  if (conditions.length !== 1)
    throw new TypeError(`ambiguous_hp_condition:${JSON.stringify(conditions)}`);
  const condition = conditions[0]!;
  return [
    {
      quantity: 'attackerHpPermille' as const,
      comparison: condition.key === 'HP_LOWER' ? ('atMost' as const) : ('atLeast' as const),
      value: condition.value as number,
    },
  ];
}

function modifierSeriesIdentity(effect: MasterEffect): string | null {
  const operations = effect.execution;
  if (operations.length !== 1) return null;
  const operation = operations[0]!;
  if (operation.kind !== 'damageModifier' && operation.kind !== 'modifierRateChange') return null;
  if (operation.valueExpressions.flat().some((expression) => expression !== null)) return null;
  return JSON.stringify({
    kind: operation.kind,
    modifier: operation.modifier,
    route: operation.route,
    ...(operation.kind === 'damageModifier' ? { sign: operation.sign, card: operation.card } : {}),
    requirement: {
      ...effect.requirement,
      expression: withoutAttackerHpRequirement(effect.requirement.expression),
    },
    inputDefinitions: effect.inputDefinitions,
    selection: effect.selection,
    operationTrigger: effect.operationTrigger,
  });
}

function withoutAttackerHpRequirement(
  requirement: CanonicalEffectRequirement,
): CanonicalEffectRequirement {
  if (requirement.kind === 'quantity' && requirement.quantity === 'attackerHpPermille')
    return { kind: 'always' };
  if (requirement.kind === 'all' || requirement.kind === 'any') {
    const requirements = requirement.requirements
      .map(withoutAttackerHpRequirement)
      .filter(({ kind }) => kind !== 'always');
    return requirements.length === 0
      ? { kind: 'always' }
      : requirements.length === 1
        ? requirements[0]!
        : { ...requirement, requirements };
  }
  return requirement.kind === 'not'
    ? { kind: 'not', requirement: withoutAttackerHpRequirement(requirement.requirement) }
    : requirement;
}

function hpThresholdConditions(effect: MasterEffect) {
  const collect = (requirement: CanonicalEffectRequirement): NormalizedQuantityCondition[] => {
    if (requirement.kind === 'quantity' && requirement.quantity === 'attackerHpPermille')
      return [
        {
          quantity: requirement.quantity,
          ...(requirement.subjectId === undefined ? {} : { subjectId: requirement.subjectId }),
          comparison: requirement.comparison,
          value: requirement.value,
        },
      ];
    if (requirement.kind === 'all' || requirement.kind === 'any')
      return requirement.requirements.flatMap(collect);
    return requirement.kind === 'not' ? collect(requirement.requirement) : [];
  };
  return collect(effect.requirement.expression);
}

function assignHpThresholdSeries(effects: readonly MasterEffect[]): MasterEffect[] {
  const result = [...effects];
  for (let start = 0; start < result.length;) {
    const identity = modifierSeriesIdentity(result[start]!);
    let end = start + 1;
    while (
      identity !== null &&
      end < result.length &&
      modifierSeriesIdentity(result[end]!) === identity
    )
      end += 1;
    const members = result.slice(start, end);
    const conditioned =
      identity === null ? [] : members.filter((effect) => hpThresholdConditions(effect).length > 0);
    if (identity !== null && members.length > 1 && conditioned.length > 0) {
      const firstConditionedIndex = members.findIndex(
        (effect) => hpThresholdConditions(effect).length > 0,
      );
      if (
        firstConditionedIndex > 1 ||
        members
          .slice(firstConditionedIndex)
          .some((effect) => hpThresholdConditions(effect).length === 0)
      )
        throw new TypeError(
          `ambiguous_hp_threshold_series:${members.map((effect) => effect.occurrenceId).join(',')}`,
        );
      const conditions = conditioned.map((effect) => {
        const hpConditions = hpThresholdConditions(effect);
        if (hpConditions.length !== 1)
          throw new TypeError(`invalid_hp_threshold_series:${effect.occurrenceId}`);
        return hpConditions[0]!;
      });
      if (new Set(conditions.map((condition) => condition.comparison)).size !== 1)
        throw new TypeError(
          `mixed_hp_threshold_direction:${conditioned
            .map((effect) => effect.occurrenceId)
            .join(',')}`,
        );
      const thresholds = conditions.map((condition) => condition.value);
      if (new Set(thresholds).size !== thresholds.length)
        throw new TypeError(`duplicate_hp_threshold:${JSON.stringify(thresholds)}`);
      const key = `attackerHpPermille:${result[start]!.occurrenceId}`;
      for (let index = start; index < end; index += 1)
        result[index] = {
          ...result[index]!,
          interaction: {
            kind: 'quantityThresholdSeries',
            key,
            quantity: 'attackerHpPermille',
          },
        };
    }
    start = end;
  }
  return result;
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
  canonicalInputKey: string,
  maximumInputUnits?: number,
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
      const basePermille = parameter['Value'];
      const paramAdd = parameter['ParamAdd'];
      const paramAddValue = parameter['ParamAddValue'];
      const typeEach = parameter['TypeIndividualityEachFunc'];
      if (typeof basePermille === 'number' && typeof paramAdd === 'number') {
        const maximumValue = parameter['ParamMax'];
        const maximumUnits =
          typeof maximumValue === 'number' && paramAdd !== 0
            ? Math.max(1, Math.floor((maximumValue - basePermille) / paramAdd) + 1)
            : 99;
        return {
          kind: 'inputLinear' as const,
          inputKey: canonicalInputKey,
          basePermille: basePermille - paramAdd,
          perUnitPermille: paramAdd,
          maximumUnits,
          maximumValuePermille: typeof maximumValue === 'number' ? maximumValue : null,
        };
      }
      if (typeof basePermille === 'number' && typeof paramAddValue === 'number') {
        if (parameter.ParamAddMaxCount === undefined && maximumInputUnits === undefined)
          return null;
        return {
          kind: 'inputLinear' as const,
          inputKey: canonicalInputKey,
          basePermille,
          perUnitPermille: paramAddValue,
          maximumUnits:
            typeof parameter.ParamAddMaxCount === 'number'
              ? parameter.ParamAddMaxCount
              : maximumInputUnits!,
          maximumValuePermille:
            typeof parameter.ParamAddMaxValue === 'number' ? parameter.ParamAddMaxValue : null,
        };
      }
      if (typeof basePermille === 'number' && Array.isArray(typeEach))
        return {
          kind: 'inputLinear' as const,
          inputKey: canonicalInputKey,
          basePermille: 0,
          perUnitPermille: basePermille,
          maximumUnits:
            typeof parameter.ParamAddMaxCount === 'number' ? parameter.ParamAddMaxCount : 3,
          maximumValuePermille: null,
        };
      if (hpKeys.length === 0) return null;
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
      Object.keys(parameter).some(
        (key) =>
          HP_VALUE_PARAMETER_KEYS.has(key) ||
          ['ParamAdd', 'ParamAddValue', 'TypeIndividualityEachFunc'].includes(key),
      ),
    ).length;
  const normalizedExpressionCount = sets.flat().filter((expression) => expression !== null).length;
  return {
    sets,
    recognizedKeys: sourceExpressionCount === normalizedExpressionCount ? presentKeys : [],
  };
}

function normalizeCanonicalInputSemantics(
  parameterSets: readonly (readonly AtlasFunctionValue[])[],
  inputKey: string,
  traitNameById: ReadonlyMap<number, string>,
  stackLabels?: ReadonlyMap<string, string>,
  stackMaximums?: ReadonlyMap<string, number>,
): {
  inputs: CanonicalInputDefinition[];
  conditions: {
    inputKey: string;
    comparison: 'lessThan' | 'atMost' | 'equal' | 'atLeast' | 'greaterThan';
    value: number;
  }[];
  recognizedKeys: string[];
  unsupported?: string;
} {
  const parameters = parameterSets.flatMap((set) => set);
  const first = parameters[0] ?? {};
  const has = (key: string) => parameters.some((parameter) => parameter[key] !== undefined);
  const input = (
    kind: Exclude<CanonicalInputDefinition['kind'], 'matchingActorCount' | 'effectStackCount'>,
    owner: CanonicalInputDefinition['owner'],
    label: string,
    description: string,
    minimum: number,
    maximum: number,
    defaultValue: number,
    defaultReason: string,
  ): CanonicalInputDefinition => ({
    key: inputKey,
    kind,
    owner,
    label,
    description,
    minimum,
    maximum,
    step: 1,
    defaultValue,
    defaultReason,
  });
  if (has('FriendShipAbove')) {
    const threshold = first.FriendShipAbove;
    if (typeof threshold !== 'number') return { inputs: [], conditions: [], recognizedKeys: [] };
    return {
      inputs: [
        input(
          'friendshipLevel',
          'attacker',
          '絆レベル',
          '攻撃役サーヴァントの現在の絆レベル',
          0,
          15,
          0,
          '未指定の育成状態では絆効果を適用しない',
        ),
      ],
      conditions: [{ inputKey, comparison: 'greaterThan', value: threshold }],
      recognizedKeys: ['FriendShipAbove'],
    };
  }
  if (has('StarHigher')) {
    const threshold = first.StarHigher;
    if (typeof threshold !== 'number') return { inputs: [], conditions: [], recognizedKeys: [] };
    return {
      inputs: [
        input(
          'criticalStars',
          'party',
          'クリティカルスター数',
          '宝具を使用する時点のクリティカルスター数',
          0,
          99,
          0,
          '戦闘開始時のスター所持数',
        ),
      ],
      conditions: [{ inputKey, comparison: 'atLeast', value: threshold }],
      recognizedKeys: ['StarHigher'],
    };
  }
  if (has('TriggeredFieldCountTarget') || has('TriggeredFieldCountRange')) {
    const ranges = [
      ...new Set(
        parameters.flatMap((parameter) =>
          parameter.TriggeredFieldCountRange === undefined
            ? []
            : [parameter.TriggeredFieldCountRange],
        ),
      ),
    ];
    const targetTypes = [
      ...new Set(
        parameters.flatMap((parameter) =>
          parameter.TriggeredFieldCountTarget === undefined
            ? []
            : [parameter.TriggeredFieldCountTarget],
        ),
      ),
    ];
    const normalizedRange = ranges.length === 1 ? normalizeForcedEqualRange(ranges[0]) : null;
    if (targetTypes.length !== 1 || targetTypes[0] !== 1 || normalizedRange === null)
      throw new TypeError(
        `unsupported_triggered_field_count:${JSON.stringify({ ranges, targetTypes })}`,
      );
    return {
      inputs: [
        input(
          'fieldActorCount',
          'field',
          '敵の数',
          '宝具対象を含むフィールド上の生存中の敵数',
          1,
          3,
          1,
          '単体の宝具ダメージ計算における対象1体',
        ),
      ],
      conditions: [{ inputKey, ...normalizedRange }],
      recognizedKeys: ['TriggeredFieldCountRange', 'TriggeredFieldCountTarget'].filter(has),
    };
  }
  if (has('ParamAdd') && !has('ParamAddValue'))
    return {
      inputs: [
        input(
          'currentTurn',
          'field',
          '現在ターン',
          '効果が適用されてから経過した自己ターンを含む現在ターン',
          1,
          99,
          1,
          '戦闘開始時の第1ターン',
        ),
      ],
      conditions: [],
      recognizedKeys: ['ParamAdd', 'ParamMax'].filter(has),
    };
  if (has('TypeIndividualityEachFunc'))
    return {
      inputs: [
        input(
          'availableSkillCount',
          'attacker',
          '使用可能なマスタースキル数',
          '条件traitを持ち現在使用可能なマスタースキル数',
          0,
          typeof first.ParamAddMaxCount === 'number' ? first.ParamAddMaxCount : 3,
          0,
          'マスター礼装を未選択の初期状態',
        ),
      ],
      conditions: [],
      recognizedKeys: ['TypeIndividualityEachFunc', 'ParamAddMaxCount'].filter(has),
    };
  if (has('ParamAddValue')) {
    const population = has('ParamAddIndividualityTargetType') || has('ParamAddOpCheckDead');
    if (population) {
      const targetTypes = [
        ...new Set(
          parameters.flatMap((parameter) =>
            typeof parameter.ParamAddIndividualityTargetType === 'number'
              ? [parameter.ParamAddIndividualityTargetType]
              : [],
          ),
        ),
      ];
      const canonicalPopulation =
        targetTypes.length === 1 && targetTypes[0] === 32
          ? ('allActors' as const)
          : targetTypes.length === 1 && targetTypes[0] === 6
            ? ('enemies' as const)
            : null;
      if (!canonicalPopulation)
        throw new TypeError(`unsupported_param_add_population:${JSON.stringify(targetTypes)}`);
      const sourcePredicate = normalizeActorCountPredicate(
        first.ParamAddSelfIndividuality,
        first.ParamAddSelfIndividualityAndCheck,
        traitNameById,
      );
      const otherPredicate = normalizeActorCountPredicate(
        first.ParamAddOpIndividuality,
        first.ParamAddOpIndividualityAndCheck,
        traitNameById,
      );
      const effectiveSourcePredicate = sourcePredicate ?? otherPredicate;
      if (!effectiveSourcePredicate && !otherPredicate)
        throw new TypeError(`missing_param_add_predicate:${inputKey}`);
      const displayTrait = singlePositiveTraitLabel(effectiveSourcePredicate);
      const enemyPopulation =
        canonicalPopulation === 'enemies' && predicateIsInBattle(otherPredicate);
      const maximum =
        typeof first.ParamAddMaxCount === 'number'
          ? first.ParamAddMaxCount
          : canonicalPopulation === 'allActors'
            ? 6
            : 3;
      return {
        inputs: [
          {
            key: inputKey,
            kind: 'matchingActorCount',
            owner: 'field',
            label: enemyPopulation
              ? '敵の合計数'
              : displayTrait
                ? `〔${displayTrait}〕一致数`
                : '特性一致数（同一対象の重複計上あり）',
            description: enemyPopulation
              ? '宝具対象を含むフィールド上の生存中の敵の合計数'
              : 'フィールド上の生存中の対象が、この効果の特性条件に一致した回数。同一対象は別の特性条件で重複計上されます',
            minimum: 0,
            maximum,
            step: 1,
            defaultValue: null,
            defaultReason: '攻撃役本人と宝具対象から保証できる最低一致数を実行時に導出する',
            countSemantics: {
              population: canonicalPopulation,
              aliveOnly: first.ParamAddOpCheckDead === 1,
              sourcePredicate: effectiveSourcePredicate,
              otherPredicate,
            },
          },
        ],
        conditions: [],
        recognizedKeys: [
          'ParamAddValue',
          'ParamAddMaxCount',
          'ParamAddMaxValue',
          'ParamAddIndividualityTargetType',
          'ParamAddSelfIndividuality',
          'ParamAddSelfIndividualityAndCheck',
          'ParamAddOpIndividuality',
          'ParamAddOpIndividualityAndCheck',
          'ParamAddOpCheckDead',
        ].filter(has),
      };
    }
    return {
      ...normalizeEffectStackInputs(parameters, traitNameById, stackLabels, stackMaximums),
      conditions: [],
      recognizedKeys: [
        'ParamAddValue',
        'ParamAddMaxCount',
        'ParamAddMaxValue',
        'ParamAddIndividualityTargetType',
        'ParamAddSelfIndividuality',
        'ParamAddSelfIndividualityAndCheck',
        'ParamAddOpIndividuality',
        'ParamAddOpIndividualityAndCheck',
        'ParamAddOpCheckDead',
      ].filter(has),
    };
  }
  return { inputs: [], conditions: [], recognizedKeys: [] };
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

type NormalizeEffectSource =
  'skill' | 'passive' | 'np' | 'reference' | 'craftEssence' | 'mysticCode';

function normalizeTriggerScope(buffs: AtlasFunction['buffs'], source: NormalizeEffectSource) {
  if (source === 'np' || source === 'reference') return null;
  if (
    (buffs ?? []).some((buff) => (buff.ckSelfIndv ?? []).some((trait) => trait.name === 'faceCard'))
  )
    return 'commandCard' as const;
  return (buffs ?? []).some((buff) => buff.type === 'attackBeforeFunction')
    ? ('commandCardAttack' as const)
    : null;
}

function procRateSeries(
  parameterSets: readonly (readonly AtlasFunctionValue[])[],
  execution: readonly MasterEffect['execution'][number][],
  source: NormalizeEffectSource,
): MasterEffect['proc'] {
  const terminal = execution.some((operation) =>
    [
      'damageModifier',
      'modifierRateChange',
      'ignoreDefense',
      'ignoreDamageCut',
      'selectNoblePhantasmVariant',
      'transformActorForm',
    ].includes(operation.kind),
  );
  if (!terminal) return { kind: 'guaranteed' };
  const values = parameterSets.map((set, index) =>
    source === 'np' || index === 0 ? set.map((value) => value.Rate) : [],
  );
  const hasRate = values.some((set) => set.some((rate) => rate !== undefined));
  if (!hasRate) return { kind: 'guaranteed' };
  if (values.some((set) => set.some((rate) => typeof rate !== 'number')))
    throw new TypeError(`invalid_proc_rate_series:${JSON.stringify(values)}`);
  const concreteRates = values.flatMap((set) => set as number[]);
  if (concreteRates.every((rate) => Number.isInteger(rate) && Math.abs(rate) >= 1_000))
    return { kind: 'guaranteed' };
  if (concreteRates.some((rate) => !Number.isInteger(rate) || Math.abs(rate) > 1_000))
    throw new TypeError(`invalid_proc_rate_series:${JSON.stringify(values)}`);
  const rates = values.map((set) => set.map((rate) => Math.abs(rate as number))) as [
    number[],
    number[],
    number[],
    number[],
    number[],
  ];
  return concreteRates.every((rate) => Math.abs(rate) === 1_000)
    ? { kind: 'guaranteed' }
    : { kind: 'singleRoll', ratePermille: rates };
}

function hasNegativeProcRate(effect: MasterEffect): boolean {
  return effect.atlasEvidence.parameterSets.some((set) =>
    set.some(
      (parameter) =>
        typeof parameter.Rate === 'number' && parameter.Rate < 0 && parameter.Rate > -1_000,
    ),
  );
}

function procInputDefinition(
  key: string,
  maximum: number,
  defaultSelection: 'minimum' | 'maximum',
): CanonicalInputDefinition {
  return {
    key,
    kind: 'procSuccessCount',
    owner: 'source',
    label: '確率効果の成功回数',
    description: '前の判定が成功した場合だけ次へ進む連鎖判定の成功回数',
    minimum: 0,
    maximum,
    step: 1,
    defaultValue: defaultSelection === 'maximum' ? maximum : 0,
    defaultReason:
      defaultSelection === 'maximum'
        ? '発動候補となるsourceの成功scenarioを既定とする'
        : 'sourceが選択されていない状態を既定とする',
  };
}

function chainedProcDefaultSelection(
  gameActivation: MasterEffect['gameActivation'],
): 'minimum' | 'maximum' {
  return gameActivation === 'npBeforeDamage' || gameActivation === 'constant'
    ? 'maximum'
    : 'minimum';
}

function assignProcSemantics(effects: readonly MasterEffect[]): MasterEffect[] {
  const result = [...effects];
  for (let index = 0; index < result.length; index += 1) {
    const effect = result[index]!;
    if (effect.proc.kind !== 'singleRoll') continue;
    if (hasNegativeProcRate(effect)) {
      if (index === 0 || result[index - 1]!.proc.kind !== 'singleRoll')
        throw new TypeError(`orphan_chained_proc:${effect.occurrenceId}`);
      continue;
    }
    let end = index + 1;
    while (end < result.length && hasNegativeProcRate(result[end]!)) end += 1;
    if (end > index + 1) {
      const members = result.slice(index, end);
      const identity = modifierSeriesIdentity(effect);
      if (
        identity === null ||
        members.some(
          (member) =>
            modifierSeriesIdentity(member) !== identity ||
            member.proc.kind !== 'singleRoll' ||
            JSON.stringify(member.proc.ratePermille) !==
              JSON.stringify(effect.proc.kind === 'singleRoll' && effect.proc.ratePermille),
        )
      )
        throw new TypeError(
          `ambiguous_chained_proc:${members.map((member) => member.occurrenceId).join(',')}`,
        );
      const key = `activation:proc:${effect.occurrenceId}`;
      const defaultSelection = chainedProcDefaultSelection(effect.gameActivation);
      const input = procInputDefinition(key, members.length, defaultSelection);
      for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1)
        result[index + memberIndex] = {
          ...members[memberIndex]!,
          interaction: { kind: 'procSeries', key },
          proc: {
            kind: 'chainedRolls',
            ratePermille: effect.proc.ratePermille,
            seriesKey: key,
            index: memberIndex,
            maximumSuccesses: members.length,
          },
          selection: {
            kind: 'stochasticOutcome',
            group: {
              kind: 'successCount',
              key,
              maximumSuccesses: members.length,
              defaultOutcome: defaultSelection,
            },
          },
          inputDefinitions: [...members[memberIndex]!.inputDefinitions, input],
          requirement: {
            ...members[memberIndex]!.requirement,
            expression: combineCanonicalRequirements([
              members[memberIndex]!.requirement.expression,
              {
                kind: 'inputQuantity',
                inputKey: key,
                comparison: 'atLeast',
                value: memberIndex + 1,
              },
            ]),
          },
        };
      index = end - 1;
      continue;
    }
    result[index] = effect;
  }
  if (result.some(hasNegativeProcRate)) {
    const invalid = result.find(
      (effect) => hasNegativeProcRate(effect) && effect.proc.kind !== 'chainedRolls',
    );
    if (invalid) throw new TypeError(`unresolved_chained_proc:${invalid.occurrenceId}`);
  }
  const independent = result
    .map((effect, index) => ({ effect, index }))
    .filter(({ effect }) => effect.proc.kind === 'singleRoll');
  if (independent.length > 1) {
    const groupKey = `activation:proc-group:${independent[0]!.effect.occurrenceId}`;
    for (let index = 0; index < independent.length; index += 1) {
      const member = independent[index]!;
      if (member.effect.proc.kind !== 'singleRoll') throw new TypeError('invalid_proc_group');
      result[member.index] = {
        ...member.effect,
        proc: {
          kind: 'independentRolls',
          ratePermille: member.effect.proc.ratePermille,
          groupKey,
          index,
          total: independent.length,
        },
      };
    }
  }
  return result.map((effect) => {
    if (effect.proc.kind === 'guaranteed') return effect;
    if (effect.selection?.kind === 'playerChoice')
      throw new TypeError(`contradictory_selection_semantics:${effect.occurrenceId}`);
    if (effect.proc.kind === 'chainedRolls') {
      if (
        effect.selection?.kind !== 'stochasticOutcome' ||
        effect.selection.group.kind !== 'successCount'
      )
        throw new TypeError(`missing_stochastic_outcome_semantics:${effect.occurrenceId}`);
      return effect;
    }
    return {
      ...effect,
      selection: {
        kind: 'stochasticOutcome',
        group: {
          kind: 'binary',
          key: `stochastic-outcome:${effect.occurrenceId}`,
          defaultOutcome: 'success',
        },
      },
    };
  });
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
  contextRecognizedKeys: readonly string[],
  referenceRecognizedKeys: readonly string[],
  additionalConditionKeys: readonly string[] = [],
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
  for (const key of additionalConditionKeys) conditionKeys.add(key);
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
    ...contextRecognizedKeys,
    ...TRAIT_PROVENANCE_PARAMETER_KEYS,
    ...referenceRecognizedKeys,
    ...['BattlePointId', 'BattlePointValue', 'StartingPosition'].filter((key) =>
      keys.includes(key),
    ),
  ]);
  return {
    value: keys.filter(
      (key) => VALUE_PARAMETER_KEYS.has(key) && !contextRecognizedKeys.includes(key),
    ),
    lifecycle: keys.filter(
      (key) =>
        LIFECYCLE_PARAMETER_KEYS.has(key) &&
        !contextRecognizedKeys.includes(key) &&
        !referenceRecognizedKeys.includes(key),
    ),
    presentation: select(PRESENTATION_PARAMETER_KEYS),
    condition: keys.filter(
      (key) =>
        conditionKeys.has(key) ||
        triggerKeys.has(key) ||
        contextRecognizedKeys.includes(key) ||
        TRAIT_PROVENANCE_PARAMETER_KEYS.has(key),
    ),
    contextMutation: keys.filter(
      (key) =>
        CONTEXT_MUTATION_PARAMETER_KEYS.has(key) ||
        ['BattlePointId', 'BattlePointValue', 'StartingPosition'].includes(key),
    ),
    choice: select(choiceKeys),
    valueExpression: keys.filter((key) => valueExpressionKeys.includes(key)),
    buffIdentity: keys.filter(
      (key) => BUFF_IDENTITY_PARAMETER_KEYS.has(key) || referenceRecognizedKeys.includes(key),
    ),
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
  source: NormalizeEffectSource = 'skill',
  ownerId?: number,
  referencedSkills: ReadonlyMap<number, AtlasReferencedSkill> = new Map(),
  quantityApplicationTiming: 'duringExecution' | 'representedByCurrentInput' = source === 'passive'
    ? 'representedByCurrentInput'
    : 'duringExecution',
  canonicalOperationsByFunction: ReadonlyMap<
    AtlasFunction,
    readonly EffectExecutionOperation[]
  > = new Map(),
  variantStateTraits: ReadonlySet<string> = new Set(),
  stateCatalog: DamageReachableStateCatalog = EMPTY_STATE_CATALOG,
) {
  const criticalStarSeriesCounts = new Map<number, number>();
  for (const fn of functions ?? []) {
    if (
      typeof fn.funcId === 'number' &&
      [fn.svals, fn.svals2, fn.svals3, fn.svals4, fn.svals5]
        .flatMap((parameters) => parameters ?? [])
        .some((parameter) => parameter.StarHigher !== undefined)
    )
      criticalStarSeriesCounts.set(fn.funcId, (criticalStarSeriesCounts.get(fn.funcId) ?? 0) + 1);
  }
  const occurrencesByFunctionId = new Map<number, number>();
  const normalized = (functions ?? []).flatMap((fn) => {
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
    const targetPolicy = normalizeTargetPolicy(fn.funcTargetType ?? 'unknown', fn.funcTargetTeam);
    const quantityConditions = [
      ...new Map(
        [
          ...normalizeQuantityConditions(parameterSets),
          ...normalizeBuffHpConditions(fn.buffs, targetPolicy),
        ].map((condition) => [JSON.stringify(condition), condition]),
      ).values(),
    ];
    const traitProvenance = normalizeTraitProvenance(parameterSets);
    const stateIdentity = normalizeStateIdentity(parameterSets);
    const sourceQuantityConditions = normalizeSourceQuantityConditions(parameterSets);
    const canonicalInputKey = parameterSets
      .flatMap((set) => set)
      .some((parameter) => parameter.StarHigher !== undefined)
      ? 'battle:criticalStars'
      : parameterSets.some((set) => set.some((parameter) => parameter.ParamAdd !== undefined))
        ? `effect:${String(ownerId ?? 'external')}:${String(fn.funcId)}:${String(occurrence)}`
        : parameterSets.some((set) =>
              set.some((parameter) => parameter.TriggeredFieldCountTarget !== undefined),
            )
          ? 'field:enemyCount'
          : `effect:${String(ownerId ?? 'external')}:${String(fn.funcId)}:${String(occurrence)}`;
    const canonicalInput = normalizeCanonicalInputSemantics(
      parameterSets,
      canonicalInputKey,
      traitNameById,
      stateCatalog.stackLabels,
      stateCatalog.countedBuffMaximums,
    );
    canonicalInput.inputs = canonicalInput.inputs.map((input) => {
      if (input.kind !== 'effectStackCount' || input.quantitySource.scope === 'field') return input;
      const traits = stateCatalog.countedBuffDefinitions?.get(input.quantitySource.trait);
      return traits ? { ...input, instanceTraits: [...traits] } : input;
    });
    const modifierValues = normalizeModifierValueExpressions(
      parameterSets,
      canonicalInputKey,
      canonicalInput.inputs[0]?.maximum,
    );
    const stackInputs = canonicalInput.inputs.filter((input) => input.kind === 'effectStackCount');
    if (stackInputs.length)
      modifierValues.sets = modifierValues.sets.map((row) =>
        row.map((expression) =>
          expression?.kind === 'inputLinear'
            ? {
                kind: 'stackLinear' as const,
                sources: stackInputs,
                basePermille: expression.basePermille,
                perUnitPermille: expression.perUnitPermille,
                maximumUnits: expression.maximumUnits,
                maximumValuePermille: expression.maximumValuePermille,
              }
            : expression,
        ),
      ) as typeof modifierValues.sets;
    const choice = normalizeEffectChoice(parameterSets);
    const operationTrigger = normalizeOperationTrigger(parameterSets);
    const triggerScope = normalizeTriggerScope(fn.buffs, source);
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
            .flatMap((parameter) =>
              (fn.buffs ?? []).some((buff) => buff.type === 'addIndividuality') &&
              typeof parameter.Value === 'number'
                ? [parameter.Value]
                : [],
            )
            .flatMap((id) => {
              const name =
                traitNameById.get(id) ??
                (stateCatalog.actorTraitReferences?.has(id)
                  ? stateMutationTraitName({ id }, traitNameById)
                  : null);
              return name ? [name] : [];
            })
            .filter((name, index, all) => all.indexOf(name) === index)
        : [],
      addedRecipientStateTraits: [] as string[],
      removedRecipientTraits: (fn.buffs ?? []).some((buff) => buff.type === 'subIndividuality')
        ? [fn.svals, fn.svals2, fn.svals3, fn.svals4, fn.svals5]
            .flatMap((parameters) => parameters ?? [])
            .flatMap((parameter) => (typeof parameter.Value === 'number' ? [parameter.Value] : []))
            .flatMap((id) => {
              const name =
                traitNameById.get(id) ??
                (stateCatalog.actorTraitReferences?.has(id)
                  ? stateMutationTraitName({ id }, traitNameById)
                  : null);
              return name ? [name] : [];
            })
            .filter((name, index, all) => all.indexOf(name) === index)
        : [],
      removedRecipientStateTraits: [] as string[],
    };
    if (targetPolicy === 'enemy') {
      const stateMutations = normalizeDamageReachableStateMutations(
        fn,
        stateCatalog,
        traitNameById,
      );
      contextChanges.addedRecipientStateTraits.push(...stateMutations.added);
      contextChanges.removedRecipientStateTraits.push(...stateMutations.removed);
    }
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
    const buffTypes = (fn.buffs ?? []).flatMap((buff) => (buff.type ? [buff.type] : []));
    const hasReferenceSemantics =
      parameterSets.some((set) => set.some((parameter) => parameter.SkillID !== undefined)) ||
      (buffTypes.some((type) =>
        ['attackBeforeFunction', 'fieldIndividualityChangedFunction'].includes(type),
      ) &&
        parameterSets.some((set) => set.some((parameter) => typeof parameter.Value === 'number')));
    const referenceRecognizedKeys = hasReferenceSemantics
      ? ['SkillID', 'SkillLV', 'Value2'].filter((key) =>
          parameterSets.some((set) => set.some((parameter) => parameter[key] !== undefined)),
        )
      : [];
    const canonicalOperations = canonicalOperationsByFunction.get(fn) ?? [];
    const canonicalOperationKeys = canonicalOperations.some(
      (operation) => operation.kind === 'transformActorForm',
    )
      ? ['Target', 'Value', 'SetLimitCount', 'CancelTransform', 'UseUserSpecifiedLimitCount']
      : [];
    const parameterSemantics = classifyParameterSemantics(
      parameterSets,
      quantityConditions,
      sourceQuantityConditions,
      modifierValues.recognizedKeys,
      choice,
      operationTrigger,
      hasNormalizedConditionRouting,
      [...canonicalInput.recognizedKeys, ...canonicalOperationKeys],
      referenceRecognizedKeys,
      ocConditionParameterKeys(fn, parameterSets),
    );
    const npBuffCount = normalizeNpBuffCount(
      fn,
      parameterSets,
      traitNameById,
      stateCatalog.countedBuffDefinitions ?? new Map(),
      stateCatalog.countedBuffMaximums,
      stateCatalog.stackLabels,
    );
    const countedBuffMutations = normalizeCountedBuffMutation(
      fn,
      traitNameById,
      stateCatalog.countedBuffTraits ?? new Set(),
      stateCatalog.countedBuffDefinitions ?? new Map(),
      source === 'passive' || source === 'craftEssence',
    );
    let execution = normalizeExecutionSemantics({
      fn,
      source,
      traitNameById,
      parameterSets,
      valueExpressions: modifierValues.sets,
      cardTypes,
      canonicalOperations: [
        ...canonicalOperations,
        ...countedBuffMutations,
        ...(npBuffCount ? [npBuffCount.operation] : []),
      ],
      contextChanges,
      quantityApplicationTiming,
    });
    const referenceCandidates = parameterSets
      .flatMap((set) => set)
      .flatMap((parameter) => {
        if (typeof parameter.SkillID === 'number')
          return [
            {
              id: parameter.SkillID,
              level: typeof parameter.SkillLV === 'number' ? parameter.SkillLV : 1,
            },
          ];
        if (
          (fn.buffs ?? []).some((buff) =>
            ['attackBeforeFunction', 'fieldIndividualityChangedFunction'].includes(buff.type ?? ''),
          ) &&
          typeof parameter.Value === 'number'
        )
          return [
            {
              id: parameter.Value,
              level: typeof parameter.Value2 === 'number' ? parameter.Value2 : 1,
            },
          ];
        return [];
      });
    const uniqueReferenceIds = [...new Set(referenceCandidates.map((reference) => reference.id))];
    if (uniqueReferenceIds.length > 1 && triggerScope === null)
      throw new TypeError(`ambiguous_referenced_skill:${String(fn.funcId)}`);
    const callback = referencedSkills.get(uniqueReferenceIds[0]!);
    const criticalOnlyCallback =
      uniqueReferenceIds.length === 1 &&
      callback?.functions?.length &&
      callback.functions.every(
        (child) =>
          ['addState', 'addStateShort'].includes(child.funcType ?? '') &&
          child.buffs?.length &&
          child.buffs.every((buff) => buff.type === 'upCriticaldamage'),
      );
    const referenceId =
      triggerScope === null || criticalOnlyCallback ? uniqueReferenceIds[0] : undefined;
    const operationReference =
      referenceId === undefined
        ? null
        : {
            kind: 'resolvedSkill' as const,
            skillId: String(referenceId),
            levelSource: parameterSets.some((set) =>
              set.some((parameter) => parameter.SkillID === referenceId),
            )
              ? ('skillLevelParameter' as const)
              : ('secondaryValueParameter' as const),
            defaultLevel: 1,
          };
    if (referenceId !== undefined) {
      const skill = referencedSkills.get(referenceId);
      if (!skill) throw new TypeError(`missing_referenced_skill:${String(referenceId)}`);
      const normalized = normalizeFunctions(
        skill.functions,
        traitNameById,
        'reference',
        ownerId,
        referencedSkills,
        quantityApplicationTiming,
        new Map(),
        new Set(),
        stateCatalog,
      );
      execution = [
        ...normalized.flatMap((effect) =>
          effect.execution.map((operation) => {
            if (operation.kind !== 'damageModifier' && operation.kind !== 'modifierRateChange')
              return operation;
            const select = <T>(sets: readonly (readonly T[])[]) =>
              parameterSets.map((parentSet) =>
                parentSet.map((parameter) => {
                  const level =
                    typeof parameter.SkillLV === 'number'
                      ? parameter.SkillLV
                      : typeof parameter.Value2 === 'number'
                        ? parameter.Value2
                        : 1;
                  const sourceSet = sets.find((set) => set.length > 0) ?? [];
                  return sourceSet[Math.min(level, sourceSet.length) - 1]!;
                }),
              ) as [T[], T[], T[], T[], T[]];
            return {
              ...operation,
              values: select(operation.values),
              valueExpressions: select(operation.valueExpressions),
            };
          }),
        ),
      ];
    }
    const unresolvedSemanticKeys = [
      ...(canonicalInput.unsupported ? [canonicalInput.unsupported] : []),
      ...unresolvedFunctionScriptKeys(fn.script).filter(
        (key) => key !== 'script:funcIndividuality',
      ),
    ];
    if (
      canonicalInput.unsupported ||
      parameterSemantics.unresolved.length > 0 ||
      unresolvedSemanticKeys.length > 0
    )
      execution = execution.map((operation) =>
        operation.kind === 'ocRemovalResistance' ||
        operation.kind === 'grantOcBoost' ||
        operation.kind === 'grantOcApplicationRate' ||
        operation.kind === 'removeOcState'
          ? {
              kind: 'unsupported' as const,
              route: operation.route,
              reason: 'ocExecutionSemantics' as const,
              damageRelevant: true,
            }
          : operation.kind === 'damageModifier' ||
              operation.kind === 'modifierRateChange' ||
              operation.kind === 'ignoreDefense' ||
              operation.kind === 'ignoreDamageCut'
            ? { ...operation, semanticSupport: 'unresolved' as const }
            : operation,
      );
    const rateSelector = isOcRateFunction(fn);
    const conditions = {
      recipient:
        (fn.overWriteTvalsList ?? []).length > 0
          ? fn.overWriteTvalsList!.map((group) => ({
              operator: 'all' as const,
              traits: signedTraits(
                Array.isArray(group) ? (group as AtlasTraitRef[]) : [],
                traitNameById,
                false,
                stateCatalog,
              ),
            }))
          : [
              {
                operator: 'any' as const,
                traits: signedTraits(fn.functvals, traitNameById, false, stateCatalog),
              },
            ],
      holder: {
        operator:
          (fn.buffs?.[0]?.ckSelfIndv ?? []).length > 0 &&
          scriptTraits.some(({ trait }) =>
            signedTraits([trait], traitNameById, false, stateCatalog).some(
              (candidate) => 'name' in candidate && variantStateTraits.has(candidate.name),
            ),
          )
            ? ('all' as const)
            : buffConditionOperator(fn.buffs?.[0]?.script?.checkIndvType),
        traits: uniqueTraits([
          ...signedTraits(
            rateSelector ? [] : fn.buffs?.[0]?.ckSelfIndv,
            traitNameById,
            false,
            stateCatalog,
          ),
          ...scriptTraits.flatMap((entry) =>
            entry.buffType === 'upCommandall' &&
            fn.funcTargetType === 'self' &&
            !isFieldTrait(entry.trait)
              ? signedTraits([entry.trait], traitNameById, false, stateCatalog)
              : [],
          ),
        ]),
      },
      opponent: {
        operator: buffConditionOperator(fn.buffs?.[0]?.script?.checkIndvType),
        traits: signedTraits(
          rateSelector ? [] : fn.buffs?.[0]?.ckOpIndv,
          traitNameById,
          true,
          stateCatalog,
        ),
      },
      field: {
        operator: 'any' as const,
        traits: uniqueTraits([
          ...signedTraits(fn.funcquestTvals, traitNameById, false, stateCatalog),
          ...scriptTraits.flatMap((entry) =>
            isFieldTrait(entry.trait) && !isCardChangeOwnerIdentity(entry)
              ? signedTraits([entry.trait], traitNameById, false, stateCatalog)
              : [],
          ),
        ]),
      },
    };
    const requirement = combineCanonicalRequirements([
      ...conditions.recipient.map((condition) =>
        canonicalTraitRequirement(
          condition,
          'recipient',
          traitProvenance,
          targetPolicy !== 'enemy',
        ),
      ),
      canonicalTraitRequirement(
        conditions.holder,
        'recipient',
        traitProvenance,
        targetPolicy !== 'enemy',
      ),
      canonicalTraitRequirement(
        conditions.opponent,
        'opponent',
        traitProvenance,
        targetPolicy === 'enemy',
      ),
      canonicalTraitRequirement(conditions.field, 'field', traitProvenance, false),
      ...quantityConditions.map<CanonicalEffectRequirement>((condition) => ({
        kind: 'quantity',
        ...condition,
      })),
      ...sourceQuantityConditions.map<CanonicalEffectRequirement>((condition) => ({
        kind: 'sourceQuantity',
        ...condition,
      })),
      ...canonicalInput.conditions.map<CanonicalEffectRequirement>((condition) => ({
        kind: 'inputQuantity',
        ...condition,
      })),
      ...(choice
        ? [
            {
              kind: 'choice' as const,
              family: choice.family === 'actSet' ? 'player-choice:0' : 'player-choice:1',
              candidate: String(choice.candidate),
            },
          ]
        : []),
      ...(operationTrigger
        ? [{ kind: 'operationTrigger' as const, position: operationTrigger.position }]
        : []),
    ]);
    return [
      {
        id: String(fn.funcId),
        occurrenceId: `${String(fn.funcId)}:${String(occurrence)}`,
        label: fn.funcPopupText ?? fn.funcType ?? '効果',
        availability: 'allLimitBreakStates' as const,
        inclusionPolicy: { default: 'include' as const },
        gameActivation:
          source === 'skill' || source === 'mysticCode'
            ? ('skillUse' as const)
            : source === 'np'
              ? ('npBeforeDamage' as const)
              : source === 'reference'
                ? ('derived' as const)
                : ('constant' as const),
        proc: procRateSeries(parameterSets, execution, source),
        selection: choice
          ? {
              kind: 'playerChoice' as const,
              group: {
                key: choice.family === 'actSet' ? 'player-choice:0' : 'player-choice:1',
                candidate: String(choice.candidate),
              },
            }
          : null,
        interaction:
          (criticalStarSeriesCounts.get(fn.funcId) ?? 0) > 1
            ? {
                kind: 'inputThresholdSeries' as const,
                key: `criticalStars:${String(fn.funcId)}`,
              }
            : null,
        triggerScope,
        operationTrigger,
        operationReference,
        stateIdentity,
        inputDefinitions: [...canonicalInput.inputs, ...(npBuffCount ? [npBuffCount.input] : [])],
        requirement: {
          recipient: targetPolicy,
          expression: requirement,
        },
        execution,
        atlasEvidence: {
          functionType: fn.funcType ?? 'unknown',
          target: fn.funcTargetType ?? 'unknown',
          parameterSets: parameterSets as MasterEffect['atlasEvidence']['parameterSets'],
          parameterSemantics,
          unresolvedSemanticKeys,
          buffTypes,
          buffRateTargets: buffRateTargets(fn.buffs),
          buffConditionKeys: [
            ...new Set(
              (fn.buffs ?? []).flatMap((buff) =>
                (['HP_LOWER', 'HP_HIGHER'] as const).filter(
                  (key) => buff.script && Object.hasOwn(buff.script, key),
                ),
              ),
            ),
          ],
        },
      },
    ];
  });
  return assignHpThresholdSeries(assignProcSemantics(normalized));
}
