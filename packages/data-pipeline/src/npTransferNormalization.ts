import type {
  CanonicalInputDefinition,
  CanonicalValueSets,
  EffectExecutionOperation,
} from '@fgo-lab/master-data';
import type { AtlasFunction, AtlasFunctionValue } from './atlasContract';

const empty = (value: unknown) =>
  value === undefined ||
  (Array.isArray(value)
    ? value.length === 0
    : typeof value === 'object' && value !== null && Object.keys(value).length === 0);
export function plainFunction(fn: AtlasFunction): boolean {
  if (
    Object.keys(fn).some(
      (key) =>
        ![
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
        ].includes(key),
    ) ||
    !empty((fn as Record<string, unknown>).funcGroup)
  )
    return false;
  return [
    fn.functvals,
    fn.funcquestTvals,
    fn.traitVals,
    fn.script,
    fn.buffs,
    fn.overWriteTvalsList,
  ].every(empty);
}
/** Fixed reference contract: no probabilistic/conditional/reactive child is admitted. */
export function normalizeNpTransfer(
  fn: AtlasFunction,
  rows: readonly (readonly AtlasFunctionValue[])[],
  chargeResistance = false,
): { operation: EffectExecutionOperation; inputs: CanonicalInputDefinition[] } | null {
  if (
    fn.funcType !== 'gainNpFromTargets' ||
    fn.funcTargetType !== 'self' ||
    fn.funcTargetTeam !== 'player' ||
    !plainFunction(fn) ||
    !rows.flat().length
  )
    return null;
  let donor: 'playerNp' | 'enemyCharge' | undefined;
  const costs: (number | null)[][] = [];
  const gains: (number | null)[][] = [];
  for (const row of rows) {
    const costRow: number[] = [],
      gainRow: number[] = [];
    for (const cell of row) {
      if (cell.Rate !== undefined && (!Number.isSafeInteger(cell.Rate) || cell.Rate < 0))
        return null;
      if (
        Object.keys(cell).some(
          (key) =>
            ![
              'Rate',
              'DependFuncId',
              'DependFunc',
              'DependFuncVals',
              'HideMiss',
              'HideNoEffect',
            ].includes(key),
        )
      )
        return null;
      const child = cell.DependFunc as AtlasFunction | undefined;
      const val = cell.DependFuncVals as AtlasFunctionValue | undefined;
      if (
        !child ||
        !val ||
        !plainFunction(child) ||
        !Number.isSafeInteger(child.funcId) ||
        child.funcId! <= 0 ||
        cell.DependFuncId !== child.funcId ||
        val.Rate !== 1000 ||
        Object.keys(val).some((key) => !['Rate', 'Value', 'Value2'].includes(key))
      )
        return null;
      const kind =
        child.funcType === 'lossNp' &&
        child.funcTargetType === 'ptOther' &&
        child.funcTargetTeam === 'player'
          ? 'playerNp'
          : child.funcType === 'delayNpturn' &&
              child.funcTargetType === 'enemyAll' &&
              child.funcTargetTeam === 'enemy'
            ? 'enemyCharge'
            : null;
      if (!kind || (donor && donor !== kind) || !Number.isSafeInteger(val.Value) || val.Value! <= 0)
        return null;
      if (kind === 'playerNp' && val.Value2 !== undefined) return null;
      const gain = kind === 'playerNp' ? val.Value : val.Value2;
      if (!Number.isSafeInteger(gain) || gain! <= 0) return null;
      donor = kind;
      costRow.push(val.Value!);
      gainRow.push(gain!);
    }
    costs.push(costRow);
    gains.push(gainRow);
  }
  if (!donor || (donor === 'enemyCharge' && chargeResistance)) return null;
  const inputs: CanonicalInputDefinition[] = Array.from(
    { length: donor === 'playerNp' ? 2 : 3 },
    (_, actorIndex) => ({
      kind: 'transferDonor',
      resource: donor,
      actorIndex,
      key: `transfer:${donor}:${actorIndex}`,
      owner: 'field',
      label:
        donor === 'playerNp'
          ? `吸収元の味方${actorIndex + 1}のNP（0.01%）`
          : `吸収元の敵${actorIndex + 1}のチャージ`,
      description: '準備開始時の吸収元の残量。不在の対象は0。実行中の減少は共通状態へ反映',
      minimum: 0,
      maximum: donor === 'playerNp' ? 30000 : Number.MAX_SAFE_INTEGER,
      step: 1,
      defaultValue: 0,
      defaultReason: '吸収元の残量を追加しない',
    }),
  );
  return {
    operation: {
      kind: 'resourceMutation',
      resource: 'npGauge',
      direction: 'gain',
      unit: 'fixed',
      recipient: 'sourceSelf',
      subjectId: null,
      amount: {
        kind: 'npTransfer',
        donor,
        inputKeys: inputs.map((input) => input.key),
        costs: costs as CanonicalValueSets,
        values: gains as CanonicalValueSets,
        child: 'unconditionalUnresistedDisjoint',
      },
    },
    inputs,
  };
}
