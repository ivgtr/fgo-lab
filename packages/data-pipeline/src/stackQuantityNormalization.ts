import {
  stackInputKey,
  type StackInputDefinition,
  type StackSource,
  type NpDamageSpec,
} from '@fgo-lab/master-data';

export function normalizeStackInput(
  source: StackSource,
  maximum: number,
  label = '状態',
): StackInputDefinition {
  return {
    kind: 'effectStackCount',
    key: stackInputKey(source),
    owner:
      source.scope === 'attackerState'
        ? 'attacker'
        : source.scope === 'targetState'
          ? 'target'
          : 'field',
    label: `${label}の付与数`,
    description: '準備開始時に付与されている状態の回数',
    minimum: 0,
    maximum,
    step: 1,
    defaultValue: 0,
    defaultReason: '外部からの状態付与なし',
    quantitySource: source,
  };
}

export function normalizeNpStackQuantity(
  cells: NpDamageSpec['parametersByOvercharge'],
  labels: ReadonlyMap<string, string> = new Map(),
): Extract<NpDamageSpec, { kind: 'traitCount' }>['quantity'] {
  const all = cells.flat();
  if (all.every((cell) => cell.maximumTargetCount === 0)) return { kind: 'finiteTraits' };
  const first = all[0]!;
  if (all.some((cell) => cell.maximumTargetCount === undefined))
    return { kind: 'unsupported', reason: 'missing_stack_maximum' };
  if (
    all.some(
      (cell) =>
        JSON.stringify([cell.targetId, cell.targetTraits, cell.maximumTargetCount]) !==
        JSON.stringify([first.targetId, first.targetTraits, first.maximumTargetCount]),
    )
  )
    return { kind: 'unsupported', reason: 'varying_stack_quantity_source' };
  const maximum = first.maximumTargetCount!;
  if (
    !Number.isInteger(maximum) ||
    maximum <= 0 ||
    maximum > 4095 ||
    ![0, 1].includes(first.targetId ?? -1)
  )
    return { kind: 'unsupported', reason: 'unsupported_stack_quantity_domain' };
  if (!first.targetTraits?.length || first.targetTraits.some((trait) => trait.kind !== 'trait'))
    return { kind: 'unsupported', reason: 'unsupported_stack_quantity_source' };
  return {
    kind: 'stacks',
    inputs: first.targetTraits.flatMap((trait) =>
      trait.kind === 'trait'
        ? [
            normalizeStackInput(
              { scope: first.targetId === 0 ? 'attackerState' : 'targetState', trait: trait.name },
              maximum,
              labels.get(trait.name),
            ),
          ]
        : [],
    ),
  };
}

export function normalizeEffectStackInputs(
  parameters: readonly Readonly<Record<string, unknown>>[],
  names: ReadonlyMap<number, string>,
  labels: ReadonlyMap<string, string> = new Map(),
): { inputs: StackInputDefinition[]; unsupported?: string } {
  const first = parameters[0] ?? {};
  const maximum = first['ParamAddMaxCount'];
  if (typeof maximum !== 'number' || !Number.isInteger(maximum) || maximum <= 0 || maximum > 4095)
    return { inputs: [], unsupported: 'missing_or_unsupported_stack_maximum' };
  const keys = ['ParamAddSelfIndividuality', 'ParamAddOpIndividuality', 'ParamAddMaxCount'];
  if (
    parameters.some((cell) =>
      keys.some((key) => JSON.stringify(cell[key]) !== JSON.stringify(first[key])),
    )
  )
    return { inputs: [], unsupported: 'varying_stack_quantity_source' };
  if (
    parameters.some((cell) =>
      [
        'ParamAddSelfIndividualityAndCheck',
        'ParamAddOpIndividualityAndCheck',
        'ParamAddOpCheckDead',
      ].some((key) => cell[key] !== undefined),
    )
  )
    return { inputs: [], unsupported: 'unsupported_stack_source_predicate' };
  const sources: StackSource[] = [];
  for (const [key, scope] of [
    ['ParamAddSelfIndividuality', 'attackerState'],
    ['ParamAddOpIndividuality', 'targetState'],
  ] as const) {
    const ids = first[key];
    if (ids === undefined) continue;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'number' || id <= 0))
      return { inputs: [], unsupported: 'unsupported_stack_source_predicate' };
    for (const id of ids as number[])
      sources.push({ scope, trait: names.get(id) ?? `traitId:${id}` });
  }
  if (!sources.length) return { inputs: [], unsupported: 'missing_stack_quantity_source' };
  return {
    inputs: [
      ...new Map(
        sources.map((source) => [
          stackInputKey(source),
          normalizeStackInput(source, maximum, labels.get(source.trait)),
        ]),
      ).values(),
    ],
  };
}
