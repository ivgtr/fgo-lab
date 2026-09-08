import { effectExecutesInNpProgram } from './npProgramScope';
import type { MasterEffect } from '@fgo-lab/master-data';
import type { ConditionEvaluationState } from './condition';
import type { ConditionExpression } from './contracts';
import { traitConditionReadScopes } from './conditionSemantics';
import type { PreNoblePhantasmState } from './preparationContracts';
import { resolveTargetPolicy, type Origin } from './effectRouting';

type Writes = PreNoblePhantasmState['uncertainContextWrites'];

/** Removing all active instances proves the quantity again; adding one does not. */
export function closeUncertainPreparationWrites(
  writes: Writes,
  effect: MasterEffect,
  origin: Origin,
): Writes {
  const resets = effect.execution.flatMap((operation) =>
    operation.kind === 'contextMutation' && operation.mutation === 'removeTrait'
      ? uncertainPreparationWrites({ ...effect, execution: [operation] }, origin)
      : [],
  );
  return writes.filter(
    (write) =>
      !resets.some(
        (reset) =>
          reset.scope === write.scope && reset.trait === write.trait && reset.actor === write.actor,
      ),
  );
}
export function uncertainPreparationWrites(
  effect: MasterEffect,
  origin: Origin,
  sourceInstanceId?: string,
): Writes {
  if (!effectExecutesInNpProgram(effect)) return [];
  return effect.execution.flatMap((operation) => {
    if (operation.kind !== 'contextMutation' || !('scope' in operation)) return [];
    const recipient = resolveTargetPolicy(origin, operation.route.target);
    const scope =
      operation.scope === 'field'
        ? 'field'
        : recipient === 'attacker'
          ? 'attackerState'
          : recipient === 'target'
            ? 'targetState'
            : null;
    if (scope !== null) return [{ scope, trait: operation.trait }];
    return sourceInstanceId && ['sourceSelf', 'sourceActor'].includes(operation.route.target)
      ? [{ scope: 'attackerState' as const, trait: operation.trait, actor: sourceInstanceId }]
      : [];
  });
}
/** Preserve unknown writes until the actual reader; normal Boolean evaluation still short-circuits. */
export function closePreparationConditionReads(
  condition: ConditionExpression,
  writes: Writes,
  facts: ConditionEvaluationState,
  hpUnknown = false,
): ConditionExpression {
  if (writes.length === 0 && !hpUnknown) return condition;
  if (condition.kind === 'all' || condition.kind === 'any')
    return {
      ...condition,
      expressions: condition.expressions.map((child) =>
        closePreparationConditionReads(child, writes, facts, hpUnknown),
      ),
    };
  if (condition.kind === 'not')
    return {
      ...condition,
      expression: closePreparationConditionReads(condition.expression, writes, facts, hpUnknown),
    };
  if (condition.kind === 'quantity' && condition.quantity === 'attackerHpPermille' && hpUnknown)
    return { kind: 'unsupported', reason: 'unresolvedPreparationWrite', readDependency: condition };
  const read =
    condition.kind === 'trait' || condition.kind === 'traitCount'
      ? writes.some(
          (write) =>
            traitConditionReadScopes(condition.scope).includes(write.scope) &&
            (condition.kind === 'trait'
              ? condition.trait === write.trait
              : condition.traits.includes(write.trait)),
        )
      : condition.kind === 'inputQuantity' &&
        writes.some((write) => {
          const source = facts.stackQuantitySources[condition.inputKey];
          return source?.scope === write.scope && source.trait === write.trait;
        });
  return read
    ? { kind: 'unsupported', reason: 'unresolvedPreparationWrite', readDependency: condition }
    : condition;
}
