import {
  canonicalRequirementLeaves,
  type MasterEffect,
  type NoblePhantasmVariant,
  type EffectExecutionOperation,
} from '@fgo-lab/master-data';
import { effectExecutesInNpProgram } from './npProgramScope';

const cache = new WeakMap<MasterEffect, readonly string[]>();
export function markerHasOpaqueReads(effect: MasterEffect): boolean {
  return (
    effectExecutesInNpProgram(effect) &&
    effect.execution.some(
      (operation) =>
        (operation.kind === 'unsupported' && operation.damageRelevant) ||
        (operation.kind === 'resourceMutation' &&
          (operation.amount.kind === 'dependent' || operation.resource === 'battlePoint')) ||
        (operation.kind === 'contextMutation' && operation.mutation === 'addQuantity') ||
        ('semanticSupport' in operation && operation.semanticSupport === 'unresolved'),
    )
  );
}
/** Canonical readers only. A conservative union covers alternate recipients and read clocks. */
export function markerEffectReads(effect: MasterEffect): readonly string[] {
  const found = cache.get(effect);
  if (found) return found;
  if (!effectExecutesInNpProgram(effect)) return [];
  const reads = new Set(
    canonicalRequirementLeaves(effect.requirement.expression).flatMap((leaf) =>
      leaf.kind === 'trait' ? [leaf.trait] : [],
    ),
  );
  for (const input of effect.inputDefinitions) {
    if (input.kind === 'effectStackCount') reads.add(input.quantitySource.trait);
    if (input.kind === 'populationCount')
      for (const trait of input.selector.traits) reads.add(trait);
  }
  for (const operation of effect.execution) {
    if (operation.kind === 'hpModifier' && operation.useCondition)
      for (const leaf of canonicalRequirementLeaves(operation.useCondition))
        if (leaf.kind === 'trait') reads.add(leaf.trait);
    if (operation.kind === 'resourceMutation') {
      if (operation.amount.kind === 'buffCount') reads.add(operation.amount.trait);
      if (operation.amount.kind === 'populationCount')
        for (const trait of operation.amount.selector.traits) reads.add(trait);
    }
    if (operation.kind === 'damageModifier' || operation.kind === 'modifierRateChange')
      for (const expression of [
        ...operation.valueExpressions.flat(),
        ...(operation.limitBreakValueExpressions?.flat() ?? []),
      ])
        if (expression?.kind === 'stackLinear')
          for (const source of expression.sources) reads.add(source.quantitySource.trait);
  }
  const result = [...reads];
  cache.set(effect, result);
  return result;
}
export function terminalMarkerReads(variant: NoblePhantasmVariant): readonly string[] {
  return [
    ...new Set([
      ...variant.effects.flatMap(markerEffectReads),
      ...(variant.kind === 'attack'
        ? variant.damage.flatMap((damage) => [
            ...damage.stateTraitNames,
            ...(damage.kind === 'traitCount' && damage.quantity.kind === 'stacks'
              ? damage.quantity.inputs.map((input) => input.quantitySource.trait)
              : []),
            ...damage.parametersByOvercharge
              .flat()
              .flatMap((cell) =>
                [
                  ...(cell.targetTrait ? [cell.targetTrait] : []),
                  ...(cell.targetTraits ?? []),
                  ...(cell.andCheckTraits ?? []),
                ].flatMap((trait) => (trait.kind === 'trait' ? [trait.name] : [])),
              ),
          ])
        : []),
    ]),
  ];
}
export function markerIntersects(
  operation: Extract<EffectExecutionOperation, { kind: 'buffInstanceMutation' }>,
  reads: ReadonlySet<string>,
): boolean {
  return (
    operation.traits.some((trait) => reads.has(trait)) ||
    (operation.marker !== undefined && reads.has(operation.marker.actorTrait))
  );
}

export function markerRelevantSourceIndexes(
  sources: readonly { effects: readonly MasterEffect[] }[],
  terminalReads: readonly string[],
  automaticEffects: readonly MasterEffect[] = [],
): ReadonlySet<number> {
  // Skill order is selected by the application. The source list is not an execution order.
  const allEffects = [...automaticEffects, ...sources.flatMap((source) => source.effects)];
  if (
    !allEffects.some((effect) =>
      effect.execution.some((operation) => operation.kind === 'buffInstanceMutation'),
    )
  )
    return new Set();
  const reads = new Set([...terminalReads, ...allEffects.flatMap(markerEffectReads)]);
  let opaque = allEffects.some(markerHasOpaqueReads);
  const result = new Set<number>();
  const written = new Set(
    allEffects.flatMap((effect) =>
      effect.execution.flatMap((operation) =>
        operation.kind === 'buffInstanceMutation' && operation.marker
          ? [...operation.traits, operation.marker.actorTrait]
          : [],
      ),
    ),
  );
  for (let index = sources.length - 1; index >= 0; index--) {
    for (const effect of [...sources[index]!.effects].reverse()) {
      if (!effectExecutesInNpProgram(effect)) continue;
      if (markerEffectReads(effect).some((trait) => written.has(trait))) result.add(index);
      if (
        effect.execution.some(
          (operation) =>
            operation.kind === 'buffInstanceMutation' &&
            (opaque || markerIntersects(operation, reads)),
        )
      )
        result.add(index);
      opaque ||= markerHasOpaqueReads(effect);
      for (const trait of markerEffectReads(effect)) reads.add(trait);
    }
  }
  return result;
}
