import type { CanonicalInputDefinition, EffectExecutionOperation } from '@fgo-lab/master-data';
import type { AtlasFunction, AtlasFunctionValue } from './atlasContract';
import {
  classifyPopulationTraitGrantability,
  stateMutationTraitName,
  type DamageReachableStateCatalog,
} from './targetStateNormalization';

type PopulationFunctionResult = {
  operation: EffectExecutionOperation;
  inputs: CanonicalInputDefinition[];
};

type RemoveCandidate = {
  kind: 'removeOne';
  trait: string;
  maximum: number;
};

type GrantCandidate = {
  kind: 'grant';
  traits: string[];
  previousSuccess: boolean;
  condition: string | null;
};

type PopulationCandidate = RemoveCandidate | GrantCandidate;
type CompilePopulationFunction = (fn: AtlasFunction) => boolean;

const populationSize: CanonicalInputDefinition = {
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

function populationCells(fn: AtlasFunction): AtlasFunctionValue[] {
  return [fn.svals, fn.svals2, fn.svals3, fn.svals4, fn.svals5].flatMap((row) => row ?? []);
}

function populationInput(
  trait: string,
  quantity: 'removableBuffs' | 'traitPresence',
  maximum: number,
): CanonicalInputDefinition[] {
  return [0, 1, 2].map((actorIndex) => ({
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
}

function isEligiblePopulationFunction(fn: AtlasFunction, cells: readonly AtlasFunctionValue[]) {
  return (
    fn.funcTargetType === 'enemyAll' &&
    cells.length > 0 &&
    !cells.some((cell) => Math.abs(cell.Rate ?? 0) < 1000)
  );
}

function hasOnlyRemoveCellFields(cell: AtlasFunctionValue) {
  return (
    !Object.keys(cell).some(
      (key) => !['Rate', 'Value', 'Value2', 'HideMiss', 'HideNoEffect'].includes(key),
    ) &&
    cell.Value === 0 &&
    cell.Value2 === 1
  );
}

function hasOnlyGrantCellFields(cell: AtlasFunctionValue) {
  return (
    !Object.keys(cell).some(
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
    ) && cell.Count === -1
  );
}

function hasSameRemoveTargetShape(left: AtlasFunction, right: AtlasFunction) {
  return JSON.stringify(left.traitVals) === JSON.stringify(right.traitVals);
}

function classifyRemoveCandidate(
  fn: AtlasFunction,
  cells: readonly AtlasFunctionValue[],
  functions: readonly AtlasFunction[],
  names: ReadonlyMap<number, string>,
): RemoveCandidate | null {
  if (fn.funcType !== 'subState') return null;
  const traits = (fn.traitVals ?? []).map((trait) => stateMutationTraitName(trait, names));
  const trait = traits[0];
  if (
    traits.length !== 1 ||
    !trait ||
    fn.traitVals?.some((value) => value.negative) ||
    fn.functvals?.length ||
    cells.some((cell) => !hasOnlyRemoveCellFields(cell))
  )
    return null;
  return {
    kind: 'removeOne',
    trait,
    maximum: functions.filter(
      (other) =>
        other.funcType === 'subState' &&
        other.funcTargetType === 'enemyAll' &&
        hasSameRemoveTargetShape(other, fn),
    ).length,
  };
}

function classifyGrantCandidate(
  fn: AtlasFunction,
  cells: readonly AtlasFunctionValue[],
  functions: readonly AtlasFunction[],
  position: number,
  names: ReadonlyMap<number, string>,
  catalog: DamageReachableStateCatalog,
  compile: CompilePopulationFunction,
): GrantCandidate | null {
  if (
    fn.funcType !== 'addState' ||
    fn.buffs?.length !== 1 ||
    cells.some((cell) => !hasOnlyGrantCellFields(cell))
  )
    return null;
  const buff = fn.buffs[0]!;
  if (!['downCriticalrate', 'downCriticalpoint', 'addIndividuality'].includes(buff.type ?? ''))
    return null;
  if (
    buff.type === 'addIndividuality' &&
    cells.some(
      (cell) =>
        !classifyPopulationTraitGrantability({ id: cell.Value ?? 0 }, names, catalog).grantable,
    )
  )
    return null;
  if (
    buff.ckSelfIndv?.length ||
    buff.ckOpIndv?.length ||
    Object.keys(buff.script ?? {}).some((key) => key !== 'missText')
  )
    return null;
  const traits = (buff.vals ?? []).map((trait) => stateMutationTraitName(trait, names));
  if (traits.some((trait) => !trait) || !traits.length) return null;
  const previousSuccess = cells.every((cell) => (cell.Rate ?? 0) < 0 && cell.ForceAddState !== 1);
  if (previousSuccess && (!functions[position - 1] || !compile(functions[position - 1]!)))
    return null;
  if (!previousSuccess && cells.some((cell) => (cell.Rate ?? 0) < 0)) return null;
  const conditions = (fn.functvals ?? []).map((trait) => stateMutationTraitName(trait, names));
  if (
    conditions.length > 1 ||
    conditions.some((trait) => !trait) ||
    fn.functvals?.some((trait) => trait.negative)
  )
    return null;
  const condition = conditions[0];
  if (condition) {
    const producers = functions.filter((other) =>
      (other.buffs ?? []).some((candidate) =>
        (candidate.vals ?? []).some((trait) => stateMutationTraitName(trait, names) === condition),
      ),
    );
    if (!producers.length || producers.some((producer) => producer === fn || !compile(producer)))
      return null;
  }
  return {
    kind: 'grant',
    traits: traits as string[],
    previousSuccess,
    condition: condition ?? null,
  };
}

function buildPopulationFunction(
  candidate: PopulationCandidate,
  position: number,
): PopulationFunctionResult {
  if (candidate.kind === 'removeOne') {
    const inputs = populationInput(candidate.trait, 'removableBuffs', candidate.maximum);
    return {
      operation: {
        kind: 'populationFunction',
        scope: 'enemies',
        position,
        action: {
          kind: 'removeOne',
          trait: candidate.trait,
          inputKeys: inputs.map((input) => input.key) as [string, string, string],
        },
      },
      inputs: [populationSize, ...inputs],
    };
  }
  const inputs = candidate.condition
    ? populationInput(candidate.condition, 'traitPresence', 1)
    : [];
  return {
    operation: {
      kind: 'populationFunction',
      scope: 'enemies',
      position,
      action: {
        kind: 'grant',
        traits: candidate.traits,
        previousSuccess: candidate.previousSuccess,
        condition: candidate.condition
          ? {
              trait: candidate.condition,
              inputKeys: inputs.map((input) => input.key) as [string, string, string],
            }
          : null,
      },
    },
    inputs: [populationSize, ...inputs],
  };
}

function compilePopulationFunction(
  fn: AtlasFunction,
  functions: readonly AtlasFunction[],
  names: ReadonlyMap<number, string>,
  catalog: DamageReachableStateCatalog,
  result: Map<AtlasFunction, PopulationFunctionResult>,
  visiting: Set<AtlasFunction>,
): boolean {
  if (result.has(fn)) return true;
  if (visiting.has(fn)) return false;
  visiting.add(fn);
  try {
    const cells = populationCells(fn);
    if (!isEligiblePopulationFunction(fn, cells)) return false;
    const remove = classifyRemoveCandidate(fn, cells, functions, names);
    if (remove) {
      result.set(fn, buildPopulationFunction(remove, functions.indexOf(fn)));
      return true;
    }
    const compile = (candidate: AtlasFunction) =>
      compilePopulationFunction(candidate, functions, names, catalog, result, visiting);
    const grant = classifyGrantCandidate(
      fn,
      cells,
      functions,
      functions.indexOf(fn),
      names,
      catalog,
      compile,
    );
    if (!grant) return false;
    result.set(fn, buildPopulationFunction(grant, functions.indexOf(fn)));
    return true;
  } finally {
    visiting.delete(fn);
  }
}

function isPopulationSliceRoot(
  fn: AtlasFunction,
  names: ReadonlyMap<number, string>,
  catalog: DamageReachableStateCatalog,
) {
  return (
    (fn.buffs ?? []).some((buff) =>
      (buff.vals ?? []).some((trait) =>
        catalog.populationBuffTraits?.has(stateMutationTraitName(trait, names) ?? ''),
      ),
    ) && !!fn.functvals?.length
  );
}

/** Compile only the bounded backwards slice of a population-count marker writer. */
export function normalizePopulationFunctions(
  functions: readonly AtlasFunction[],
  names: ReadonlyMap<number, string>,
  catalog: DamageReachableStateCatalog,
) {
  const result = new Map<AtlasFunction, PopulationFunctionResult>();
  const visiting = new Set<AtlasFunction>();
  for (const fn of functions) {
    if (!isPopulationSliceRoot(fn, names, catalog)) continue;
    const previous = new Map(result);
    if (!compilePopulationFunction(fn, functions, names, catalog, result, visiting)) {
      result.clear();
      for (const entry of previous) result.set(...entry);
    }
  }
  return result;
}
