import type { CanonicalInputDefinition, EffectExecutionOperation } from '@fgo-lab/master-data';
import type { AtlasFunction } from './atlasContract';
import {
  stateMutationTraitName,
  type DamageReachableStateCatalog,
} from './targetStateNormalization';

/** Compile only the bounded backwards slice of a population-count marker writer. */
export function normalizePopulationFunctions(
  functions: readonly AtlasFunction[],
  names: ReadonlyMap<number, string>,
  catalog: DamageReachableStateCatalog,
) {
  const result = new Map<
    AtlasFunction,
    { operation: EffectExecutionOperation; inputs: CanonicalInputDefinition[] }
  >();
  const name = (trait: { id?: number; name?: string }) => stateMutationTraitName(trait, names);
  const cells = (fn: AtlasFunction) =>
    [fn.svals, fn.svals2, fn.svals3, fn.svals4, fn.svals5].flatMap((row) => row ?? []);
  const input = (trait: string, quantity: 'removableBuffs' | 'traitPresence', maximum: number) =>
    [0, 1, 2].map((actorIndex) => ({
      kind: 'populationActorValue' as const,
      actorIndex,
      quantity,
      trait,
      key: `population:enemy:${actorIndex}:${quantity}:${trait}`,
      owner: 'target' as const,
      label: `敵${actorIndex + 1}の${quantity === 'removableBuffs' ? '解除可能な強化数' : '初期条件状態'}`,
      description:
        quantity === 'removableBuffs'
          ? `${trait}に一致し解除が成功する通常のバフ数（${maximum}個以上は${maximum}）。解除耐性・解除不能分は含めない`
          : `${trait}の初期状態（0:なし、1:あり）`,
      minimum: 0,
      maximum,
      step: 1,
      defaultValue: 0,
      defaultReason: '初期状態を追加しない',
    }));
  const size: CanonicalInputDefinition = {
    kind: 'populationSize',
    side: 'enemies',
    key: 'population:enemies:additional',
    owner: 'field',
    label: '追加の敵人数',
    description: '宝具対象以外の場にいる敵の人数',
    minimum: 0,
    maximum: 2,
    step: 1,
    defaultValue: 0,
    defaultReason: '追加の対象を指定しない',
  };
  const visiting = new Set<AtlasFunction>();
  const compile = (fn: AtlasFunction): boolean => {
    if (visiting.has(fn)) return false;
    visiting.add(fn);
    try {
      return compileFunction(fn);
    } finally {
      visiting.delete(fn);
    }
  };
  const compileFunction = (fn: AtlasFunction): boolean => {
    if (result.has(fn)) return true;
    const position = functions.indexOf(fn),
      rows = cells(fn);
    if (
      fn.funcTargetType !== 'enemyAll' ||
      !rows.length ||
      rows.some((cell) => Math.abs(cell.Rate ?? 0) < 1000)
    )
      return false;
    if (fn.funcType === 'subState') {
      const traits = (fn.traitVals ?? []).map(name);
      if (
        traits.length !== 1 ||
        !traits[0] ||
        fn.traitVals?.some((t) => t.negative) ||
        fn.functvals?.length ||
        rows.some(
          (cell) =>
            Object.keys(cell).some(
              (key) => !['Rate', 'Value', 'Value2', 'HideMiss', 'HideNoEffect'].includes(key),
            ) ||
            cell.Value !== 0 ||
            cell.Value2 !== 1,
        )
      )
        return false;
      const maximum = functions.filter(
        (other) =>
          other.funcType === 'subState' &&
          other.funcTargetType === 'enemyAll' &&
          JSON.stringify(other.traitVals) === JSON.stringify(fn.traitVals),
      ).length;
      const inputs = input(traits[0], 'removableBuffs', maximum);
      result.set(fn, {
        operation: {
          kind: 'populationFunction',
          scope: 'enemies',
          position,
          action: {
            kind: 'removeOne',
            trait: traits[0],
            inputKeys: inputs.map((i) => i.key) as [string, string, string],
          },
        },
        inputs: [size, ...inputs],
      });
      return true;
    }
    if (
      fn.funcType !== 'addState' ||
      fn.buffs?.length !== 1 ||
      rows.some(
        (cell) =>
          Object.keys(cell).some(
            (key) =>
              ![
                'Rate',
                'Value',
                'Turn',
                'Count',
                'HideMiss',
                'HideNoEffect',
                'ShowState',
                'ForceAddState',
              ].includes(key),
          ) || cell.Count !== -1,
      )
    )
      return false;
    const buff = fn.buffs[0]!;
    if (!['downCriticalrate', 'downCriticalpoint', 'addIndividuality'].includes(buff.type ?? ''))
      return false;
    if (
      buff.type === 'addIndividuality' &&
      rows.some(
        (cell) =>
          catalog.actorTraitReferences?.has(cell.Value ?? 0) ||
          catalog.populationReadTraits?.has(name({ id: cell.Value ?? 0 }) ?? '') ||
          catalog.stateOnlyTraits.has(name({ id: cell.Value ?? 0 }) ?? ''),
      )
    )
      return false;
    if (
      buff.ckSelfIndv?.length ||
      buff.ckOpIndv?.length ||
      Object.keys(buff.script ?? {}).some((key) => key !== 'missText')
    )
      return false;
    const traits = (buff.vals ?? []).map(name);
    if (traits.some((t) => !t) || !traits.length) return false;
    const previousSuccess = rows.every((cell) => (cell.Rate ?? 0) < 0 && cell.ForceAddState !== 1);
    if (previousSuccess && (!functions[position - 1] || !compile(functions[position - 1]!)))
      return false;
    if (!previousSuccess && rows.some((cell) => (cell.Rate ?? 0) < 0)) return false;
    const conditions = (fn.functvals ?? []).map(name);
    if (
      conditions.length > 1 ||
      conditions.some((t) => !t) ||
      fn.functvals?.some((t) => t.negative)
    )
      return false;
    const conditionTrait = conditions[0];
    if (conditionTrait) {
      const producers = functions.filter((other) =>
        (other.buffs ?? []).some((b) => (b.vals ?? []).some((t) => name(t) === conditionTrait)),
      );
      if (!producers.length || producers.some((other) => other === fn || !compile(other)))
        return false;
    }
    const inputs = conditionTrait ? input(conditionTrait, 'traitPresence', 1) : [];
    result.set(fn, {
      operation: {
        kind: 'populationFunction',
        scope: 'enemies',
        position,
        action: {
          kind: 'grant',
          traits: traits as string[],
          previousSuccess,
          condition: conditionTrait
            ? {
                trait: conditionTrait,
                inputKeys: inputs.map((i) => i.key) as [string, string, string],
              }
            : null,
        },
      },
      inputs: [size, ...inputs],
    });
    return true;
  };
  for (const fn of functions) {
    if (
      !(fn.buffs ?? []).some((buff) =>
        (buff.vals ?? []).some((trait) => catalog.populationBuffTraits?.has(name(trait) ?? '')),
      ) ||
      !fn.functvals?.length
    )
      continue;
    const previous = new Map(result);
    if (!compile(fn)) {
      result.clear();
      for (const entry of previous) result.set(...entry);
    }
  }
  return result;
}
