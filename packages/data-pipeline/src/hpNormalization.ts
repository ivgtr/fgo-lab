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
export function normalizeHpTransfer(
  fn: AtlasFunction,
  rows: readonly (readonly AtlasFunctionValue[])[],
): { operation: EffectExecutionOperation; inputs: CanonicalInputDefinition[] } | null {
  if (
    fn.funcType !== 'gainHpFromTargets' ||
    fn.funcTargetType !== 'self' ||
    !['player', 'enemy', 'playerAndEnemy'].includes(fn.funcTargetTeam ?? '') ||
    !isPlainDependentFunction(fn, 'funcIndividualityOnly') ||
    !rows.flat().length
  )
    return null;
  if (fn.funcTargetTeam === 'enemy')
    return {
      operation: { kind: 'boundedPhaseIrrelevant', proof: 'enemyActorHpFunction' },
      inputs: [],
    };
  let donors: 'selectedEnemy' | 'otherEnemy' | 'allEnemies' | undefined;
  const values: number[][] = [];
  for (const row of rows) {
    const costs: number[] = [];
    for (const cell of row) {
      const dependentCell = parseDependentFunctionCell(cell);
      if (!dependentCell) return null;
      const { child, values: val } = dependentCell;
      if (
        child.funcType !== 'lossHpSafe' ||
        !['enemy', 'playerAndEnemy'].includes(child.funcTargetTeam ?? '') ||
        cell.Rate !== 1000 ||
        val.Rate !== 1000 ||
        Object.keys(val).some((key) => !['Rate', 'Value'].includes(key)) ||
        !Number.isSafeInteger(val.Value) ||
        val.Value! <= 0
      )
        return null;
      const selector =
        child.funcTargetType === 'enemy'
          ? 'selectedEnemy'
          : child.funcTargetType === 'enemyOneNoTargetNoAction'
            ? 'otherEnemy'
            : child.funcTargetType === 'enemyAll'
              ? 'allEnemies'
              : null;
      if (!selector || (donors && donors !== selector)) return null;
      donors = selector;
      costs.push(val.Value!);
    }
    values.push(costs);
  }
  if (!donors) return null;
  const inputs: CanonicalInputDefinition[] = Array.from({ length: 3 }, (_, actorIndex) => ({
    kind: 'transferDonor',
    resource: 'enemyHp',
    actorIndex,
    key: `transfer:enemyHp:${actorIndex}`,
    owner: 'field',
    label: `吸収元の敵${actorIndex + 1}のHP`,
    description: '準備開始時の現在HP。死亡・不在は0。生存下限1を除いて吸収し、連続吸収で共有する。',
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
    step: 1,
    defaultValue: 0,
    defaultReason: '吸収量を追加しない',
  }));
  return {
    operation: {
      kind: 'resourceMutation',
      resource: 'hp',
      direction: 'gain',
      unit: 'fixed',
      recipient: 'sourceSelf',
      subjectId: null,
      amount: {
        kind: 'hpTransfer',
        donors,
        inputKeys: inputs.map((input) => input.key),
        values: values as CanonicalValueSets,
        child: 'unconditionalUnresistedDisjoint',
      },
    },
    inputs,
  };
}
