import type {
  CanonicalInputDefinition,
  CanonicalValueSets,
  EffectExecutionOperation,
} from '@fgo-lab/master-data';
import type { AtlasFunction, AtlasFunctionValue } from './atlasContract';
import {
  isPlainDependentFunction,
  parseDependentFunctionCell,
} from './dependentFunctionNormalization';
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
    !isPlainDependentFunction(fn) ||
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
      const dependentCell = parseDependentFunctionCell(cell);
      if (!dependentCell) return null;
      const { child, values: val } = dependentCell;
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
