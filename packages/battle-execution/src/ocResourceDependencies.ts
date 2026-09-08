import type { CanonicalNpResourceSemantics, MasterEffect } from '@fgo-lab/master-data';
import { applyNpResourceTransaction, type NpResourceState } from './npResource';
import { resolveTargetPolicy } from './effectRouting';

export interface OcDependencySource {
  kind: 'skill' | 'noblePhantasm';
  effects: readonly MasterEffect[];
  skillLevel?: number;
}
export interface OcResourceDependencyContext {
  semantics: CanonicalNpResourceSemantics;
  npLevel: NpResourceState['npLevel'];
  initialGauge: number;
  /** Conservative automatic-source inventory; omission cannot prove state absence. */
  automaticEffects?: readonly MasterEffect[];
}
/** A bounded interval uses the resource executor itself, including saturation and all-consume. */
export function ocGaugeDependencies(
  sources: readonly OcDependencySource[],
  context: OcResourceDependencyContext,
) {
  const capacity = context.semantics.capacityByNpLevel[context.npLevel - 1]!;
  let lower = context.initialGauge;
  let upper = lower;
  const changed = new Set<number>();
  for (const [index, source] of sources.entries()) {
    if (source.kind === 'noblePhantasm') {
      const use = applyNpResourceTransaction(
        context.semantics,
        { npLevel: context.npLevel, capacity, gauge: upper },
        { requirement: null, mutations: [{ kind: 'consumeAll' }] },
      );
      if (use.status === 'applied') lower = upper = use.state.gauge;
      else {
        lower = 0;
        upper = capacity;
      }
    }
    for (const effect of source.effects)
      for (const operation of effect.execution) {
        if (operation.kind === 'unsupported' && operation.reason === 'dependentResourceAmount') {
          changed.add(index);
          lower = 0;
          upper = capacity;
          continue;
        }
        if (
          operation.kind !== 'resourceMutation' ||
          operation.resource !== 'npGauge' ||
          resolveTargetPolicy(source.kind === 'skill' ? 'attacker' : 'np', operation.recipient) !==
            'attacker'
        )
          continue;
        if (operation.amount.kind === 'dependent') {
          changed.add(index);
          lower = 0;
          upper = capacity;
          continue;
        }
        const values =
          source.kind === 'noblePhantasm'
            ? operation.amount.values.map((row) => row[context.npLevel - 1])
            : source.skillLevel === undefined
              ? operation.amount.values[0]
              : [operation.amount.values[0][source.skillLevel - 1]];
        const certain =
          effect.requirement.expression.kind === 'always' &&
          effect.proc.kind === 'guaranteed' &&
          effect.selection?.kind !== 'stochasticOutcome';
        const outcomes: number[] = certain ? [] : [lower, upper];
        if (values.length === 0) {
          outcomes.push(0, capacity);
          changed.add(index);
        }
        for (const gauge of [lower, upper])
          for (const amount of values) {
            if (amount === null || amount === undefined) {
              outcomes.push(0, capacity);
              changed.add(index);
              continue;
            }
            const result = applyNpResourceTransaction(
              context.semantics,
              { npLevel: context.npLevel, capacity, gauge },
              { requirement: null, mutations: [{ kind: operation.direction, amount }] },
            );
            if (result.status === 'rejected') {
              outcomes.push(0, capacity);
              changed.add(index);
              continue;
            }
            outcomes.push(result.state.gauge);
            if (result.state.gauge !== gauge) changed.add(index);
          }
        lower = Math.min(...outcomes);
        upper = Math.max(...outcomes);
      }
  }
  return {
    changed,
    reachability:
      lower < context.semantics.noblePhantasmUse.requirement ||
      sources.some((source) => source.kind === 'noblePhantasm'),
  };
}
