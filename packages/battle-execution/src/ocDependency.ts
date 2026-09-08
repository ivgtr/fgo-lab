import {
  ocGaugeDependencies,
  type OcDependencySource,
  type OcResourceDependencyContext,
} from './ocResourceDependencies';
import {
  canonicalRequirementLeaves,
  type MasterEffect,
  type NoblePhantasmVariant,
} from '@fgo-lab/master-data';
import { terminalResourceHasReader } from './ocTerminalDependencies';

function rowsDiffer(rows: readonly unknown[]): boolean {
  return rows.length > 1 && rows.some((row) => JSON.stringify(row) !== JSON.stringify(rows[0]));
}
export function effectReadsOc(effect: MasterEffect): boolean {
  const relevant = effect.execution.some(
    (operation) =>
      operation.kind !== 'stateMutation' &&
      operation.kind !== 'boundedPhaseIrrelevant' &&
      operation.kind !== 'ocStateNonIntersection',
  );
  if (relevant && effect.proc.kind !== 'guaranteed' && rowsDiffer(effect.proc.ratePermille))
    return true;
  return effect.execution.some((operation) => {
    if ('values' in operation && rowsDiffer(operation.values)) return true;
    if ('valueExpressions' in operation && rowsDiffer(operation.valueExpressions)) return true;
    if ('cells' in operation && rowsDiffer(operation.cells)) return true;
    if ('applicationRates' in operation && rowsDiffer(operation.applicationRates)) return true;
    return (
      operation.kind === 'resourceMutation' &&
      operation.amount.kind === 'fixed' &&
      rowsDiffer(operation.amount.values)
    );
  });
}
const terminalOcSensitivity = new WeakMap<NoblePhantasmVariant, boolean>();
export function noblePhantasmReadsOc(variant: NoblePhantasmVariant): boolean {
  const cached = terminalOcSensitivity.get(variant);
  if (cached !== undefined) return cached;
  const reads =
    variant.effects.some((effect, index) => {
      if (variant.kind !== 'attack') return effectReadsOc(effect);
      if (effect.timing !== 'beforeDamage') return false;
      return effectReadsOc({
        ...effect,
        execution: effect.execution.filter(
          (operation) =>
            operation.kind === 'damageModifier' ||
            operation.kind === 'modifierRateChange' ||
            operation.kind === 'ignoreDefense' ||
            operation.kind === 'ignoreDamageCut' ||
            (operation.kind === 'resourceMutation' &&
              terminalResourceHasReader(variant, index, operation.resource)) ||
            (operation.kind === 'contextMutation' && operation.damageRelevant) ||
            (operation.kind === 'unsupported' && operation.damageRelevant),
        ),
      });
    }) ||
    (variant.kind === 'attack' &&
      variant.damage.some((damage) => rowsDiffer(damage.parametersByOvercharge)));
  terminalOcSensitivity.set(variant, reads);
  return reads;
}

/** Backward slice retains ordered prerequisites; an unknown writer is never proof of irrelevance. */
export function ocRelevantSourceIndexes(
  sources: readonly OcDependencySource[],
  terminalReadsOc: boolean,
  resources?: OcResourceDependencyContext,
): ReadonlySet<number> {
  const relevant = new Set<number>();
  const gauge = resources ? ocGaugeDependencies(sources, resources) : null;
  let oc = terminalReadsOc;
  let rate = false;
  let condition = false;
  let hp = false;
  const readsHpCondition = (effect: MasterEffect) =>
    canonicalRequirementLeaves(effect.requirement.expression).some(
      (leaf) => leaf.kind === 'quantity' && leaf.quantity === 'attackerHpPermille',
    );
  const possibleHpRate = (end: number) =>
    resources?.automaticEffects === undefined ||
    [
      ...resources.automaticEffects,
      ...sources.slice(0, end + 1).flatMap((source) => source.effects),
    ].some((effect) =>
      effect.execution.some(
        (operation) =>
          operation.kind === 'grantOcApplicationRate' &&
          [...operation.cells, ...(operation.limitBreakCells ?? [])].some((row) =>
            row.some(
              (cell) =>
                cell.amount.kind === 'inverseHpLinear' || cell.amount.kind === 'hpRangeLinear',
            ),
          ),
      ),
    );
  for (let index = sources.length - 1; index >= 0; index--) {
    const source = sources[index]!;
    for (const effect of [...source.effects].reverse()) {
      for (const operation of [...effect.execution].reverse()) {
        if (operation.kind === 'grantOcBoost' && oc) {
          relevant.add(index);
          rate = true;
          hp ||= readsHpCondition(effect) || possibleHpRate(index);
          condition = true;
        }
        if (operation.kind === 'grantOcApplicationRate' && rate) {
          hp ||= readsHpCondition(effect);
          relevant.add(index);
          condition = true;
        }
        if (operation.kind === 'ocRemovalResistance' && (oc || rate)) relevant.add(index);
        if (
          operation.kind === 'removeOcState' &&
          (oc || rate) &&
          (resources?.automaticEffects === undefined ||
            [
              ...resources.automaticEffects,
              ...sources.slice(0, index + 1).flatMap((source) => source.effects),
            ].some((effect) =>
              effect.execution.some(
                (candidate) =>
                  ((candidate.kind === 'grantOcBoost' && oc) ||
                    (candidate.kind === 'grantOcApplicationRate' && rate)) &&
                  candidate.stateTraits.some((trait) => operation.selector.includes(trait)),
              ),
            ))
        ) {
          relevant.add(index);
          condition = true;
        }
        if (
          operation.kind === 'resourceMutation' &&
          ((operation.resource === 'npGauge' &&
            (oc || gauge?.reachability) &&
            (gauge === null || gauge.changed.has(index))) ||
            (operation.resource === 'hp' && hp))
        )
          relevant.add(index);
        if (operation.kind === 'contextMutation' && condition) relevant.add(index);
      }
    }
    if (source.kind === 'noblePhantasm' && source.effects.some(effectReadsOc)) oc = true;
  }
  return relevant;
}
