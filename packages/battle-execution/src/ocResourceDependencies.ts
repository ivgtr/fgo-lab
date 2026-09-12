import { effectExecutesInNpProgram, npProgramEffects } from './npProgramScope';
import type { CanonicalNpResourceSemantics, MasterEffect } from '@fgo-lab/master-data';
import {
  applyNpResourceTransaction,
  npMutationFromCanonicalAmount,
  type NpResourceState,
} from './npResource';
import { resolveResourceTargetPolicy } from './effectRouting';
import { canonicalRequirementLeaves } from '@fgo-lab/master-data';
import type { SourceEffect } from './sourceCollection';
import { deriveBaseOvercharge } from './npResource';

/** Positive-only preparation cannot observe gauge except at its terminal NP use. */
export function populationGaugeHasOneTerminalOc(
  sources: readonly SourceEffect[],
  context: Pick<OcResourceDependencyContext, 'semantics' | 'npLevel' | 'initialGauge'>,
): boolean {
  const keys = new Set(
    sources.flatMap((source) =>
      source.effect.inputDefinitions
        .filter((input) => input.kind === 'populationSize' || input.kind === 'populationCount')
        .map((input) => input.key),
    ),
  );
  if (
    sources.some(
      (source) =>
        canonicalRequirementLeaves(source.effect.requirement.expression).some(
          (leaf) => leaf.kind === 'inputQuantity' && keys.has(leaf.inputKey),
        ) ||
        source.effect.execution.some(
          (operation) =>
            (operation.kind === 'damageModifier' || operation.kind === 'modifierRateChange') &&
            [
              ...operation.valueExpressions.flat(),
              ...(operation.limitBreakValueExpressions?.flat() ?? []),
            ].some(
              (expression) => expression?.kind === 'inputLinear' && keys.has(expression.inputKey),
            ),
        ),
    )
  )
    return false;
  const capacity = context.semantics.capacityByNpLevel[context.npLevel - 1]!;
  let lower = context.initialGauge;
  let upper = lower;
  if (lower < context.semantics.noblePhantasmUse.requirement) return false;
  for (const source of sources)
    for (const operation of source.effect.execution) {
      if (!effectExecutesInNpProgram(source.effect)) continue;
      if (
        operation.kind === 'populationMutation' &&
        (operation.mutation !== 'grant' ||
          source.effect.requirement.expression.kind !== 'always' ||
          source.effect.proc.kind !== 'guaranteed')
      )
        return false;
      if (
        operation.kind === 'transformActorForm' ||
        operation.kind === 'selectNoblePhantasmVariant'
      )
        return false;
      if (operation.kind !== 'resourceMutation' || operation.resource !== 'npGauge') continue;
      if (source.origin !== 'attacker' || !source.sourceEnabled || !source.enabledByDefault)
        return false;
      const recipient = resolveResourceTargetPolicy(source.origin, operation.recipient);
      if (recipient === 'unresolved') return false;
      if (recipient !== 'attacker') continue;
      if (
        operation.direction !== 'gain' ||
        operation.amount.kind === 'dependent' ||
        operation.amount.kind === 'buffCount'
      )
        return false;
      const coefficient = (
        source.limitBreak ? operation.amount.limitBreakValues : operation.amount.values
      )?.[source.valueSetIndex]?.[source.valueIndex];
      if (coefficient === undefined || coefficient === null || coefficient < 0) return false;
      let min = coefficient;
      let max = coefficient;
      if (operation.amount.kind === 'populationCount') {
        const selector = operation.amount.selector;
        const maximum =
          selector.scope === 'recipient'
            ? 1
            : selector.scope === 'allActors'
              ? 6
              : selector.scope === 'otherActors'
                ? 5
                : 3;
        min =
          selector.basis === 'inBattle'
            ? coefficient * (selector.scope === 'allActors' ? 2 : 1)
            : 0;
        max =
          selector.counting === 'actors' || selector.basis === 'inBattle'
            ? maximum * coefficient
            : capacity;
      }
      const outcomes: number[] = [];
      for (const [gauge, amount] of [
        [lower, min],
        [upper, max],
      ] as const) {
        const mutation =
          operation.amount.kind === 'populationCount'
            ? { kind: 'gain' as const, amount }
            : npMutationFromCanonicalAmount(operation, amount);
        const result = applyNpResourceTransaction(
          context.semantics,
          { npLevel: context.npLevel, capacity, gauge },
          { requirement: null, mutations: [mutation] },
        );
        if (result.status !== 'applied') return false;
        outcomes.push(result.state.gauge);
      }
      const certain =
        source.effect.requirement.expression.kind === 'always' &&
        source.effect.proc.kind === 'guaranteed' &&
        source.effect.selection?.kind !== 'stochasticOutcome';
      lower = certain ? outcomes[0]! : Math.min(lower, outcomes[0]!);
      upper = outcomes[1]!;
    }
  return (
    deriveBaseOvercharge(context.semantics, lower) ===
    deriveBaseOvercharge(context.semantics, upper)
  );
}

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
    for (const effect of npProgramEffects(source.effects))
      for (const operation of effect.execution) {
        if (operation.kind === 'unsupported' && operation.reason === 'dependentResourceAmount') {
          changed.add(index);
          lower = 0;
          upper = capacity;
          continue;
        }
        if (operation.kind !== 'resourceMutation' || operation.resource !== 'npGauge') continue;
        const recipient = resolveResourceTargetPolicy(
          source.kind === 'skill' ? 'attacker' : 'np',
          operation.recipient,
        );
        if (recipient !== 'attacker' && recipient !== 'unresolved') continue;
        if (
          recipient === 'unresolved' ||
          operation.amount.kind === 'dependent' ||
          operation.amount.kind === 'buffCount' ||
          operation.amount.kind === 'populationCount'
        ) {
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
              { requirement: null, mutations: [npMutationFromCanonicalAmount(operation, amount)] },
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
