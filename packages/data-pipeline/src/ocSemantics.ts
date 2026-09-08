import type {
  CanonicalEffectRoute,
  EffectExecutionOperation,
  ModifierValueExpression,
  OcLifetimeLimit,
  OcStateTrait,
} from '@fgo-lab/master-data';
import type { AtlasFunction, AtlasFunctionValue, AtlasTraitRef } from './atlasContract';

const rateRoles = {
  upGrantstate: { role: 'casterGrant', sign: 1 },
  downGrantstate: { role: 'casterGrant', sign: -1 },
  upTolerance: { role: 'recipientResistance', sign: 1 },
  downTolerance: { role: 'recipientResistance', sign: -1 },
} as const;
const traits = new Map<string, OcStateTrait>([
  ['buffPositiveEffect', 'positive'],
  ['buffNegativeEffect', 'negative'],
  ['buffBuffSuccessRateUp', 'grantSuccessUp'],
]);
const amountKeys = new Set([
  'RatioHPHigh',
  'RatioHPLow',
  'RatioHPRangeHigh',
  'RatioHPRangeLow',
  'ParamAdd',
  'ParamAddValue',
  'TypeIndividualityEachFunc',
]);
const positiveSelector = (selector: readonly AtlasTraitRef[]) =>
  selector.every(({ name, negative }) => name === 'buffPositiveEffect' && !negative);

/** Skipping a recipient individuality check cannot change an empty recipient check. */
export function ocConditionParameterKeys(
  fn: AtlasFunction,
  rows: readonly (readonly AtlasFunctionValue[])[],
): string[] {
  return fn.funcType === 'subState' &&
    !fn.functvals?.length &&
    !fn.overWriteTvalsList?.length &&
    Object.keys(fn.script ?? {}).length === 0 &&
    rows
      .flat()
      .every(
        (cell) =>
          cell['NoCheckIndividualityIfNotUnit'] === undefined ||
          cell['NoCheckIndividualityIfNotUnit'] === 1,
      )
    ? ['NoCheckIndividualityIfNotUnit']
    : [];
}
export function isOcRateFunction(fn: AtlasFunction): boolean {
  return (fn.buffs ?? []).some(
    (buff) =>
      buff.type !== undefined &&
      buff.type in rateRoles &&
      (buff.tvals ?? []).some(({ name }) => name === 'buffPositiveEffect'),
  );
}
function limit(value: unknown): OcLifetimeLimit {
  if (value === -1) return { kind: 'unlimited' };
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    throw new TypeError('invalid_oc_lifetime');
  return { kind: 'finite', remaining: value };
}
function application(value: AtlasFunctionValue) {
  if (typeof value.Rate !== 'number' || !Number.isInteger(value.Rate) || value.Rate < 0)
    throw new TypeError('invalid_oc_application_rate');
  return {
    applicationRatePermille: value.Rate,
    turns: limit(value['Turn']),
    uses: limit(value['Count']),
  };
}
export function normalizeOcSemantics(args: {
  fn: AtlasFunction;
  parameterSets: readonly (readonly AtlasFunctionValue[])[];
  expressions: readonly (readonly (ModifierValueExpression | null)[])[];
  route: CanonicalEffectRoute;
  traitNameById: ReadonlyMap<number, string>;
  source: 'skill' | 'passive' | 'np' | 'reference' | 'craftEssence' | 'mysticCode';
}): EffectExecutionOperation[] | null {
  const { fn, route } = args;
  const buff = fn.buffs?.[0];
  if ((fn.buffs ?? []).some(({ type }) => type === 'upToleranceSubstate')) {
    if (fn.buffs?.length !== 1 || !['addState', 'addStateShort'].includes(fn.funcType ?? ''))
      return [{ kind: 'unsupported', route, reason: 'ocExecutionSemantics', damageRelevant: true }];
    return [
      {
        kind: 'ocRemovalResistance',
        route,
        cells: args.parameterSets.map((row, rowIndex) =>
          row.map((cell, column) => {
            if (typeof cell.Value !== 'number' || !Number.isInteger(cell.Value))
              throw new TypeError('invalid_oc_removal_resistance');
            return {
              ...application(cell),
              amount: args.expressions[rowIndex]?.[column] ?? { kind: 'fixed', value: cell.Value },
            };
          }),
        ) as Extract<EffectExecutionOperation, { kind: 'ocRemovalResistance' }>['cells'],
      },
    ];
  }
  const isBoost = (fn.buffs ?? []).some(({ type }) => type === 'upChagetd');
  const isRate = isOcRateFunction(fn);
  if (!isBoost && !isRate) {
    if (
      !['subState', 'moveState', 'extendBuffturn', 'shortenBuffcount'].includes(fn.funcType ?? '')
    )
      return null;
    if (route.target === 'enemy')
      return [{ kind: 'ocStateNonIntersection', route, proof: 'enemyRecipient' }];
    const selector = (fn.traitVals ?? []).flatMap(({ name, negative }) => {
      const trait = name === undefined ? undefined : traits.get(name);
      return trait && !negative ? [trait] : [];
    });
    if (
      selector.length &&
      (fn.traitVals ?? []).some(({ name, negative }) => !name || name === 'unknown' || negative)
    )
      return [{ kind: 'unsupported', route, reason: 'ocExecutionSemantics', damageRelevant: true }];
    if (fn.funcType === 'subState' && selector.length)
      return [
        {
          kind: 'removeOcState',
          route,
          selector,
          applicationRates: args.parameterSets.map((row) =>
            row.map((cell) => cell.Rate ?? null),
          ) as Extract<EffectExecutionOperation, { kind: 'removeOcState' }>['applicationRates'],
        },
      ];
    const rows = args.parameterSets.flat();
    const familyIds = new Set(
      [...args.traitNameById].filter(([, name]) => traits.has(name)).map(([id]) => id),
    );
    const completeFamilyIds = [...traits.keys()].every((name) =>
      [...args.traitNameById.values()].includes(name),
    );
    const disjoint = (
      selector: readonly {
        id?: number | undefined;
        name?: string | undefined;
        negative?: boolean | undefined;
      }[],
    ) =>
      selector.length > 0 &&
      selector.every(
        ({ id, name, negative }) =>
          !negative &&
          ((name !== undefined &&
            name !== 'unknown' &&
            !traits.has(name) &&
            (id === undefined || !familyIds.has(id))) ||
            (name === 'unknown' && id !== undefined && completeFamilyIds && !familyIds.has(id))),
      );
    const proven =
      fn.funcType === 'subState'
        ? disjoint(fn.traitVals ?? [])
        : rows.length > 0 &&
          rows.every((cell) => {
            if (fn.funcType === 'moveState') {
              const dependency = cell['DependFunc'] as AtlasFunction | undefined;
              return dependency?.funcType === 'subState' && disjoint(dependency.traitVals ?? []);
            }
            return (
              cell.Target === -1 &&
              Array.isArray(cell.TargetList) &&
              disjoint(cell.TargetList.map((id) => ({ id, name: args.traitNameById.get(id) })))
            );
          });
    return proven
      ? [{ kind: 'ocStateNonIntersection', route, proof: 'stateSelector' }]
      : [{ kind: 'unsupported', route, reason: 'ocExecutionSemantics', damageRelevant: true }];
  }
  if (
    !buff ||
    fn.buffs?.length !== 1 ||
    buff.buffGroup !== 0 ||
    buff.maxRate !== (isBoost ? 5 : 5000) ||
    !['addState', 'addStateShort'].includes(fn.funcType ?? '') ||
    Object.keys(buff.script ?? {}).length > 0 ||
    !positiveSelector(buff.tvals ?? []) ||
    !positiveSelector(buff.ckSelfIndv ?? []) ||
    !positiveSelector(buff.ckOpIndv ?? []) ||
    (isBoost && [buff.tvals, buff.ckSelfIndv, buff.ckOpIndv].some((value) => value?.length))
  )
    return [{ kind: 'unsupported', route, reason: 'ocExecutionSemantics', damageRelevant: true }];
  const stateTraits = (buff.vals ?? []).map(({ name, negative }) =>
    name === undefined || negative ? undefined : traits.get(name),
  );
  if (!stateTraits.length || stateTraits.some((value) => value === undefined))
    return [{ kind: 'unsupported', route, reason: 'ocExecutionSemantics', damageRelevant: true }];
  const common = {
    route,
    lifetime:
      args.source === 'passive' || args.source === 'craftEssence'
        ? ('constant' as const)
        : ('active' as const),
    stacking: 'additive' as const,
    stateTraits: stateTraits as OcStateTrait[],
  };
  if (isBoost) {
    if (stateTraits.length !== 1 || stateTraits[0] !== 'positive')
      return [{ kind: 'unsupported', route, reason: 'ocExecutionSemantics', damageRelevant: true }];
    if (
      args.parameterSets.flat().some((cell) => Object.keys(cell).some((key) => amountKeys.has(key)))
    )
      return [{ kind: 'unsupported', route, reason: 'ocExecutionSemantics', damageRelevant: true }];
    const cells = args.parameterSets.map((row) =>
      row.map((cell) => {
        if (
          typeof cell.Value !== 'number' ||
          !Number.isInteger(cell.Value) ||
          cell.Value < 1 ||
          cell.Value > 5
        )
          throw new TypeError('invalid_oc_stage_value');
        return { ...application(cell), stages: cell.Value };
      }),
    ) as Extract<EffectExecutionOperation, { kind: 'grantOcBoost' }>['cells'];
    return [{ kind: 'grantOcBoost', ...common, cells }];
  }
  const role = rateRoles[buff.type as keyof typeof rateRoles];
  if (
    args.parameterSets.some((row, rowIndex) =>
      row.some(
        (cell, column) =>
          Object.keys(cell).some((key) => amountKeys.has(key)) &&
          !args.expressions[rowIndex]?.[column],
      ),
    )
  )
    return [{ kind: 'unsupported', route, reason: 'ocExecutionSemantics', damageRelevant: true }];
  const cells = args.parameterSets.map((row, rowIndex) =>
    row.map((cell, column) => {
      if (typeof cell.Value !== 'number' || !Number.isInteger(cell.Value))
        throw new TypeError('invalid_oc_rate_amount');
      const expression = args.expressions[rowIndex]?.[column];
      return {
        ...application(cell),
        amount: expression ?? { kind: 'fixed' as const, value: cell.Value },
      };
    }),
  ) as Extract<EffectExecutionOperation, { kind: 'grantOcApplicationRate' }>['cells'];
  return [{ kind: 'grantOcApplicationRate', ...common, ...role, selector: 'positive', cells }];
}
