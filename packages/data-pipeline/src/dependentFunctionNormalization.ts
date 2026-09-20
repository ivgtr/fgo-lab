import type { AtlasFunction, AtlasFunctionValue } from './atlasContract';

type PlainFunctionScriptPolicy = 'empty' | 'funcIndividualityOnly';

export type DependentFunctionCell = {
  readonly child: AtlasFunction;
  readonly values: AtlasFunctionValue;
  readonly cellRate: number | undefined;
};

const plainFunctionKeys = new Set([
  'funcId',
  'funcType',
  'funcTargetType',
  'funcTargetTeam',
  'funcPopupText',
  'funcPopupIcon',
  'functvals',
  'funcquestTvals',
  'traitVals',
  'script',
  'buffs',
  'overWriteTvalsList',
  'funcGroup',
  'svals',
  'svals2',
  'svals3',
  'svals4',
  'svals5',
]);

const dependentCellKeys = new Set([
  'Rate',
  'DependFuncId',
  'DependFunc',
  'DependFuncVals',
  'HideMiss',
  'HideNoEffect',
]);

const dependentValueKeys = new Set(['Rate', 'Value', 'Value2']);

const empty = (value: unknown) =>
  value === undefined ||
  (Array.isArray(value)
    ? value.length === 0
    : typeof value === 'object' && value !== null && Object.keys(value).length === 0);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const scriptAllowed = (fn: AtlasFunction, policy: PlainFunctionScriptPolicy) => {
  if (policy === 'empty') return empty(fn.script);
  return (
    fn.script === undefined ||
    (isRecord(fn.script) && Object.keys(fn.script).every((key) => key === 'funcIndividuality'))
  );
};

/** Raw Atlas dependent functions share this narrow, unconditional metadata contract. */
export function isPlainDependentFunction(
  fn: AtlasFunction,
  scriptPolicy: PlainFunctionScriptPolicy = 'empty',
): boolean {
  if (
    !isRecord(fn) ||
    Object.keys(fn).some((key) => !plainFunctionKeys.has(key)) ||
    !empty((fn as Record<string, unknown>).funcGroup) ||
    !scriptAllowed(fn, scriptPolicy)
  )
    return false;
  return [fn.functvals, fn.funcquestTvals, fn.traitVals, fn.buffs, fn.overWriteTvalsList].every(
    empty,
  );
}

/** Parses only the shared cell/value envelope; NP and HP retain their domain meaning. */
export function parseDependentFunctionCell(cell: AtlasFunctionValue): DependentFunctionCell | null {
  if (
    !isRecord(cell) ||
    (cell.Rate !== undefined && (!Number.isSafeInteger(cell.Rate) || cell.Rate < 0)) ||
    Object.keys(cell).some((key) => !dependentCellKeys.has(key))
  )
    return null;
  const child = isRecord(cell.DependFunc) ? (cell.DependFunc as AtlasFunction) : undefined;
  const values = isRecord(cell.DependFuncVals)
    ? (cell.DependFuncVals as AtlasFunctionValue)
    : undefined;
  if (
    !child ||
    !values ||
    !isPlainDependentFunction(child) ||
    !Number.isSafeInteger(child.funcId) ||
    child.funcId! <= 0 ||
    cell.DependFuncId !== child.funcId ||
    values.Rate !== 1000 ||
    Object.keys(values).some((key) => !dependentValueKeys.has(key))
  )
    return null;
  return { child, values, cellRate: cell.Rate };
}
