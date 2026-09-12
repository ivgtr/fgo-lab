import type {
  CanonicalInputDefinition,
  CanonicalValueSets,
  EffectExecutionOperation,
  PopulationCountSelector,
} from '@fgo-lab/master-data';
import type { AtlasFunction, AtlasFunctionValue } from './atlasContract';
import {
  stateMutationTraitName,
  type DamageReachableStateCatalog,
} from './targetStateNormalization';
import { normalizeTargetPolicy } from './executionSemantics';

const scopes: PopulationCountSelector['scope'][] = [
  'recipient',
  'allies',
  'enemies',
  'allActors',
  'otherActors',
];
const sides = (scope: PopulationCountSelector['scope']) =>
  scope === 'recipient'
    ? []
    : scope === 'enemies'
      ? (['enemies'] as const)
      : scope === 'allies'
        ? (['allies'] as const)
        : (['allies', 'enemies'] as const);

export function normalizeNpPopulationCount(
  fn: AtlasFunction,
  rows: readonly (readonly AtlasFunctionValue[])[],
  names: ReadonlyMap<number, string>,
  catalog: DamageReachableStateCatalog,
): { operation: EffectExecutionOperation; inputs: CanonicalInputDefinition[] } | null {
  if (!['gainNpTargetSum', 'gainNpIndividualSum'].includes(fn.funcType ?? '')) return null;
  const cells = rows.flat();
  if (
    !cells.length ||
    cells.some((cell) =>
      Object.keys(cell).some(
        (key) =>
          ![
            'Rate',
            'Value',
            'Value2',
            'GainNpTargetPassiveIndividuality',
            'HideMiss',
            'HideNoEffect',
          ].includes(key),
      ),
    )
  )
    return null;
  const first = cells[0]!;
  const scope = scopes[first.Value2 ?? 0];
  if (
    !scope ||
    cells.some(
      (cell) =>
        (cell.Value2 ?? 0) !== (first.Value2 ?? 0) ||
        (cell.GainNpTargetPassiveIndividuality ?? 0) !==
          (first.GainNpTargetPassiveIndividuality ?? 0),
    )
  )
    return null;
  if (
    first.GainNpTargetPassiveIndividuality !== undefined &&
    first.GainNpTargetPassiveIndividuality !== 0 &&
    first.GainNpTargetPassiveIndividuality !== 1
  )
    return null;
  const traits = (fn.traitVals ?? []).map((trait) => stateMutationTraitName(trait, names));
  if (
    !traits.length ||
    traits.some((trait) => !trait) ||
    fn.traitVals?.some((trait) => trait.negative)
  )
    return null;
  const named = [...new Set(traits as string[])].sort();
  const buff = named.filter((trait) => catalog.populationBuffTraits?.has(trait));
  // Mixed intrinsic/instance selectors require an overlap proof before actor de-duplication.
  if (
    buff.length &&
    (buff.length !== named.length ||
      named.length !== 1 ||
      fn.funcType === 'gainNpTargetSum' ||
      named.some((trait) => catalog.populationIntrinsicTraits?.has(trait)))
  )
    return null;
  const values = rows.map((row) => row.map((cell) => cell.Value ?? null)) as CanonicalValueSets;
  if (values.flat().some((value) => value === null || !Number.isSafeInteger(value) || value <= 0))
    return null;
  const selector: PopulationCountSelector = {
    scope,
    counting: fn.funcType === 'gainNpTargetSum' ? 'actors' : 'individualities',
    basis:
      fn.traitVals?.length === 1 && fn.traitVals[0]?.id === 5000
        ? 'inBattle'
        : buff.length
          ? 'buffInstances'
          : 'actorTraits',
    traits: named,
    includePassive: first.GainNpTargetPassiveIndividuality === 1,
  };
  const key = `population:count:${encodeURIComponent(JSON.stringify(selector))}`;
  const externalMaximum = sides(scope).length * 2;
  const countMaximum =
    selector.counting === 'actors' || selector.basis === 'inBattle'
      ? externalMaximum
      : Math.ceil(
          30000 / Math.min(...values.flat().filter((value): value is number => value !== null)),
        );
  const inputs: CanonicalInputDefinition[] = sides(scope).map((side) => ({
    kind: 'populationSize',
    side,
    key: `population:${side}:additional`,
    owner: 'field',
    label: side === 'allies' ? '追加の味方人数' : '追加の敵人数',
    description:
      side === 'allies' ? '攻撃役以外の場にいる味方の人数' : '宝具対象以外の場にいる敵の人数',
    minimum: 0,
    maximum: 2,
    step: 1,
    defaultValue: 0,
    defaultReason: '追加の対象を指定しない',
  }));
  if (selector.basis !== 'inBattle' && externalMaximum > 0)
    inputs.push({
      kind: 'populationCount',
      selector,
      key,
      owner: 'field',
      label:
        selector.basis === 'buffInstances'
          ? '対象全体の初期該当バフ数'
          : selector.counting === 'actors'
            ? '追加対象の初期該当人数'
            : '追加対象の初期該当数',
      description:
        selector.basis === 'buffInstances'
          ? '計数範囲全体の該当バフの初期個数。実行中の付与・解除は別途反映'
          : `攻撃役と宝具対象を除く追加対象の該当特性の初期${selector.counting === 'actors' ? '該当人数' : '一致数'}。実行中の付与・解除は別途反映`,
      minimum: 0,
      maximum: countMaximum,
      step: 1,
      defaultValue: 0,
      defaultReason: '外部の該当状態を追加しない',
    });
  return {
    operation: {
      kind: 'resourceMutation',
      resource: 'npGauge',
      direction: 'gain',
      unit: 'fixed',
      recipient: normalizeTargetPolicy(fn.funcTargetType ?? '', fn.funcTargetTeam),
      subjectId: null,
      amount: { kind: 'populationCount', selector, inputKey: key, values },
    },
    inputs,
  };
}

export function normalizePopulationMutation(
  fn: AtlasFunction,
  names: ReadonlyMap<number, string>,
  catalog: DamageReachableStateCatalog,
  constant: boolean,
): EffectExecutionOperation[] {
  const refs = catalog.populationReadTraits;
  if (!refs?.size) return [];
  const rows = [fn.svals, fn.svals2, fn.svals3, fn.svals4, fn.svals5].flatMap((row) => row ?? []);
  const buffTraits = (fn.buffs ?? [])
    .flatMap((buff) => buff.vals ?? [])
    .flatMap((trait) => {
      const name = stateMutationTraitName(trait, names);
      return name && refs.has(name) ? [name] : [];
    });
  const actorTraits = (fn.buffs ?? []).some(
    (buff) => buff.type === 'addIndividuality' || buff.type === 'subIndividuality',
  )
    ? rows.flatMap((cell) => {
        const name =
          typeof cell.Value === 'number' ? stateMutationTraitName({ id: cell.Value }, names) : null;
        return name && refs.has(name) ? [name] : [];
      })
    : [];
  const removed =
    fn.funcType === 'subState'
      ? (fn.traitVals ?? []).flatMap((trait) => {
          const name = stateMutationTraitName(trait, names);
          return name && refs.has(name) ? [name] : [];
        })
      : [];
  const removalSelectors = new Set(
    (fn.traitVals ?? []).flatMap((trait) => {
      const name = stateMutationTraitName(trait, names);
      return name ? [name] : [];
    }),
  );
  const removedActorTraits =
    fn.funcType === 'subState'
      ? [...(catalog.populationTraitGrantSelectors ?? [])].flatMap(([trait, selectors]) =>
          selectors.some((selector) => removalSelectors.has(selector)) ? [trait] : [],
        )
      : [];
  const traits = [...new Set([...buffTraits, ...actorTraits, ...removed])];
  if (!traits.length && !removedActorTraits.length) return [];
  const scope: PopulationCountSelector['scope'] | 'target' | null =
    fn.funcTargetType === 'self'
      ? 'recipient'
      : fn.funcTargetType === 'enemy'
        ? 'target'
        : fn.funcTargetType === 'enemyAll'
          ? 'enemies'
          : fn.funcTargetType === 'ptAll'
            ? 'allies'
            : fn.funcTargetType === 'fieldOther'
              ? 'otherActors'
              : null;
  const allowed = [
    'Rate',
    'Value',
    'Turn',
    'Count',
    'HideMiss',
    'HideNoEffect',
    'ShowState',
    'ForceAddState',
    'ForceSubState',
  ];
  const supported =
    scope &&
    !(fn.buffs ?? []).some((buff) => buff.type === 'subIndividuality') &&
    rows.length > 0 &&
    (!actorTraits.length || new Set(rows.map((cell) => cell.Value)).size === 1) &&
    rows.every(
      (cell) =>
        Object.keys(cell).every((key) => allowed.includes(key)) &&
        (cell.Count === undefined || cell.Count === -1),
    ) &&
    !(fn.buffs ?? []).some(
      (buff) =>
        Object.keys(buff.script ?? {}).length || buff.ckSelfIndv?.length || buff.ckOpIndv?.length,
    ) &&
    !fn.functvals?.length;
  return [
    ...(removedActorTraits.length
      ? [
          {
            kind: 'populationMutation' as const,
            mutation: 'unsupported' as const,
            scope: scope ?? ('allActors' as const),
            basis: 'actorTraits' as const,
            traits: removedActorTraits,
            includePassive: constant,
          },
        ]
      : []),
    ...(traits.length
      ? [
          {
            kind: 'populationMutation' as const,
            mutation: supported
              ? removed.length
                ? ('remove' as const)
                : ('grant' as const)
              : ('unsupported' as const),
            scope: scope ?? ('allActors' as const),
            basis: actorTraits.length ? ('actorTraits' as const) : ('buffInstances' as const),
            traits,
            includePassive: constant,
          },
        ]
      : []),
  ];
}
