import type { CanonicalNpResourceSemantics, MasterEffect } from '@fgo-lab/master-data';
import {
  applyNpResourceTransaction,
  type NpResourceMutation,
  type NpResourceState,
  type NpResourceTransactionResult,
} from './npResource';
import { resolveTargetPolicy } from './effectRouting';
import type { SourceEffect } from './sourceCollection';
import type { PreparationEffectActivation } from './preparationTransaction';

export function selectedSourceNpMutations(
  source: SourceEffect,
  valueSetIndex = source.valueSetIndex,
): NpResourceMutation[] {
  return source.effect.execution.flatMap((operation): NpResourceMutation[] => {
    if (
      operation.kind === 'unsupported' &&
      operation.reason === 'dependentResourceAmount' &&
      resolveTargetPolicy(source.origin, operation.route.target) === 'attacker'
    )
      return [{ kind: 'unsupported', family: operation.reason }];
    if (
      operation.kind !== 'resourceMutation' ||
      operation.resource !== 'npGauge' ||
      resolveTargetPolicy(source.origin, operation.recipient) !== 'attacker'
    )
      return [];
    if (operation.amount.kind === 'dependent')
      return [{ kind: 'unsupported', family: operation.amount.reason }];
    const values = source.limitBreak ? operation.amount.limitBreakValues : operation.amount.values;
    const amount = values?.[valueSetIndex]?.[source.valueIndex];
    return amount === null || amount === undefined
      ? [{ kind: 'unsupported', family: 'missingCanonicalAmount' }]
      : [{ kind: operation.direction, amount }];
  });
}
export type PreparationSourceResourceResult =
  | NpResourceTransactionResult
  | { status: 'rejected'; code: 'ambiguousCondition'; state: NpResourceState };
/** Resource writes share one ordering for own commands, constant sources, and external phases. */
export function applyPreparationSourceResources(
  semantics: CanonicalNpResourceSemantics,
  initial: NpResourceState,
  sources: readonly SourceEffect[],
  activation: ReadonlyMap<MasterEffect, PreparationEffectActivation>,
  npValueSetIndex?: number,
): PreparationSourceResourceResult {
  let current = initial;
  for (const source of sources) {
    const applied = activation.get(source.effect);
    if (applied?.procOutcome === 'failure' || applied?.conditionOutcome === false) continue;
    const mutations = selectedSourceNpMutations(
      source,
      source.origin === 'np' ? npValueSetIndex : source.valueSetIndex,
    );
    if (mutations.length === 0) continue;
    const probe = applyNpResourceTransaction(semantics, current, { requirement: null, mutations });
    if (probe.status === 'rejected') return { ...probe, state: initial };
    if (applied?.conditionOutcome !== true || applied.procOutcome !== 'success') {
      // An unknown positive charge at capacity is provably a no-op, not an assumed failure.
      if (probe.state.gauge === current.gauge) continue;
      return { status: 'rejected', code: 'ambiguousCondition', state: initial };
    }
    current = probe.state;
  }
  return { status: 'applied', state: current, baseOvercharge: null };
}
