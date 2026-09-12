import { isBuffCountInput } from './buffInstances';
import { effectExecutesInNpProgram } from './npProgramScope';
import type { CanonicalNpResourceSemantics, MasterEffect } from '@fgo-lab/master-data';
import {
  applyNpResourceTransaction,
  npMutationFromCanonicalAmount,
  type NpResourceMutation,
  type NpResourceState,
  type NpResourceTransactionResult,
} from './npResource';
import { resolveTargetPolicy, resolveResourceTargetPolicy } from './effectRouting';
import type { SourceEffect } from './sourceCollection';
import type { PreparationEffectActivation } from './preparationTransaction';
import { countBuffInstances, type CountedBuffInstance } from './buffInstances';
import { readPopulationCount, type PopulationEvent } from './populationCounts';
import type { ConditionEvaluationState } from './condition';

type Operation = MasterEffect['execution'][number];

export function isPreparationNpOperation(operation: Operation): boolean {
  return (
    (operation.kind === 'resourceMutation' && operation.resource === 'npGauge') ||
    (operation.kind === 'unsupported' && operation.reason === 'dependentResourceAmount')
  );
}

function selectedNpMutation(
  source: SourceEffect,
  operation: Operation,
  valueSetIndex: number,
  instances: readonly CountedBuffInstance[],
  population?: { facts: ConditionEvaluationState; events: readonly PopulationEvent[] },
): NpResourceMutation | null {
  if (
    operation.kind === 'unsupported' &&
    operation.reason === 'dependentResourceAmount' &&
    resolveTargetPolicy(source.origin, operation.route.target) === 'attacker'
  )
    return { kind: 'unsupported', family: operation.reason };
  if (operation.kind !== 'resourceMutation' || operation.resource !== 'npGauge') return null;
  const recipient = resolveResourceTargetPolicy(source.origin, operation.recipient);
  if (recipient === 'unresolved')
    return { kind: 'unsupported', family: 'unresolvedResourceRecipient' };
  if (recipient !== 'attacker') return null;
  if (operation.amount.kind === 'npTransfer')
    return { kind: 'unsupported', family: 'unboundNpTransfer' };
  if (operation.amount.kind === 'dependent')
    return { kind: 'unsupported', family: operation.amount.reason };
  const countAmount = operation.amount;
  if (
    countAmount.kind === 'buffCount' &&
    !source.effect.inputDefinitions.some(
      (input) =>
        isBuffCountInput(input) &&
        input.key === countAmount.inputKey &&
        input.quantitySource.trait === countAmount.trait &&
        input.instanceTraits.includes(input.quantitySource.trait),
    )
  )
    return { kind: 'unsupported', family: 'unboundBuffCountInput' };
  const values = source.limitBreak ? operation.amount.limitBreakValues : operation.amount.values;
  const amount = values?.[valueSetIndex]?.[source.valueIndex];
  if (operation.amount.kind === 'populationCount') {
    if (!population) return { kind: 'unsupported', family: 'missingPopulationState' };
    const count = readPopulationCount({
      ...population,
      selector: operation.amount.selector,
      inputKey: operation.amount.inputKey,
      values: population.facts.resolvedInputValues,
    });
    return count === null
      ? { kind: 'unsupported', family: 'unresolvedPopulationCount' }
      : {
          kind: 'gain',
          amount: amount === null || amount === undefined ? Number.NaN : amount * count,
        };
  }
  const selected =
    operation.amount.kind === 'buffCount' && amount !== null && amount !== undefined
      ? amount * countBuffInstances(instances, operation.amount.trait, recipient)
      : amount;
  if (selected !== null && selected !== undefined && !Number.isSafeInteger(selected))
    return { kind: 'gain', amount: Number.NaN };
  if (operation.amount.kind === 'buffCount' && selected !== null && selected !== undefined)
    return { kind: 'gain', amount: selected };
  return npMutationFromCanonicalAmount(operation, selected);
}

export type PreparationSourceResourceResult =
  | NpResourceTransactionResult
  | { status: 'rejected'; code: 'ambiguousCondition'; state: NpResourceState };

/** One canonical step is interpreted inside the shared source transaction, never in a later pass. */
export function applyPreparationNpOperation(args: {
  semantics: CanonicalNpResourceSemantics;
  initial: NpResourceState;
  source: SourceEffect;
  operation: Operation;
  activation: PreparationEffectActivation | undefined;
  valueSetIndex: number;
  buffInstances: readonly CountedBuffInstance[];
  population?: { facts: ConditionEvaluationState; events: readonly PopulationEvent[] } | undefined;
}): PreparationSourceResourceResult {
  const { initial, source, operation, activation, valueSetIndex } = args;
  const unchanged = { status: 'applied' as const, state: initial, baseOvercharge: null };
  if (!effectExecutesInNpProgram(source.effect)) return unchanged;
  if (activation?.procOutcome === 'failure' || activation?.conditionOutcome === false)
    return unchanged;
  const mutation = selectedNpMutation(
    source,
    operation,
    valueSetIndex,
    args.buffInstances,
    args.population,
  );
  if (!mutation) return unchanged;
  const probe = applyNpResourceTransaction(args.semantics, initial, {
    requirement: null,
    mutations: [mutation],
  });
  if (probe.status === 'rejected') return probe;
  if (activation?.conditionOutcome !== true || activation.procOutcome !== 'success') {
    // Saturation proves this individual write a no-op; cancelling later writes do not.
    if (probe.state.gauge === initial.gauge) return unchanged;
    return { status: 'rejected', code: 'ambiguousCondition', state: initial };
  }
  return probe;
}
