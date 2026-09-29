import { runtimeInputKey } from './runtimeInputIdentity';
import { canonicalRequirementLeaves, type CanonicalInputDefinition } from '@fgo-lab/master-data';
import type { ConditionExpression } from './contracts';
import { evaluateCondition, type ConditionEvaluationState } from './condition';
import { runtimeInputDefinitionsForSource } from './operationCompiler';
import { resolveStochasticActivationOutcome } from './stochasticOutcomes';
import {
  beginHpConditionCapture,
  finishHpConditionCapture,
  type HpQuantityRead,
} from './hpExecutionObservation';
import type { OcSourceProgram } from './ocSourceProgram';

/** A trigger on the selected command is known; absent trigger metadata is not a guessed activation. */
function commandCondition(
  condition: ConditionExpression,
  program: OcSourceProgram,
): ConditionExpression {
  if (condition.kind === 'inputQuantity') {
    const definition = runtimeInputDefinitionsForSource(program.source).find(
      (input) => input.key === condition.inputKey,
    );
    if (
      definition?.kind === 'effectStackCount' &&
      program.conditionActor === 'source' &&
      definition.quantitySource.scope === 'attackerState'
    )
      return { kind: 'unsupported', reason: 'unresolvedRecipient', readDependency: condition };
  }
  if (
    condition.kind === 'operationTrigger' &&
    condition.source.sourceInstanceId === program.source.sourceInstanceId
  )
    return program.source.effect.operationTrigger?.position === condition.position
      ? { kind: 'always' }
      : { kind: 'not', expression: { kind: 'always' } };
  if (condition.kind === 'all' || condition.kind === 'any')
    return {
      ...condition,
      expressions: condition.expressions.map((child) => commandCondition(child, program)),
    };
  if (condition.kind === 'not')
    return { ...condition, expression: commandCondition(condition.expression, program) };
  return condition;
}

export function resolvePreparationSourceFacts(
  program: OcSourceProgram,
  facts: ConditionEvaluationState,
  onHpRead?: (read: HpQuantityRead) => void,
) {
  const definitions = runtimeInputDefinitionsForSource(program.source);
  let values = { ...facts.resolvedInputValues };
  const missingDefinitions: CanonicalInputDefinition[] = [];
  for (const definition of definitions) {
    const value = values[definition.key] ?? definition.defaultValue;
    if (
      value === null ||
      !Number.isInteger(value) ||
      value < definition.minimum ||
      value > definition.maximum ||
      (value - definition.minimum) % definition.step !== 0
    ) {
      values = Object.fromEntries(Object.entries(values).filter(([key]) => key !== definition.key));
      missingDefinitions.push(
        definition.kind === 'effectStackCount'
          ? definition
          : { ...definition, defaultValue: null, defaultReason: null },
      );
    } else values[definition.key] = value;
  }
  const resolved = { ...facts, resolvedInputValues: values };
  const condition = commandCondition(program.condition, program);
  const previous = onHpRead ? beginHpConditionCapture(resolved, onHpRead) : undefined;
  let outcome: boolean | null;
  try {
    outcome = evaluateCondition(condition, resolved);
  } finally {
    if (onHpRead) finishHpConditionCapture(resolved, previous);
  }
  const inputKeys = new Set(
    canonicalRequirementLeaves(program.source.effect.requirement.expression).flatMap((leaf) =>
      leaf.kind === 'inputQuantity'
        ? [
            runtimeInputKey(
              program.source.origin,
              program.source.sourceInstanceId,
              program.source.skillId,
              program.source.effect.occurrenceId,
              leaf.inputKey,
            ),
          ]
        : [],
    ),
  );
  const missingCondition =
    outcome === false
      ? undefined
      : missingDefinitions.find((definition) => inputKeys.has(definition.key));
  const stochastic = resolveStochasticActivationOutcome(
    {
      operationId: `preparation:${program.source.effect.occurrenceId}`,
      proc: program.source.effect.proc,
      stochasticOutcome:
        program.source.effect.selection?.kind === 'stochasticOutcome'
          ? {
              ...program.source.effect.selection.group,
              key: runtimeInputKey(
                program.source.origin,
                program.source.sourceInstanceId,
                program.source.skillId,
                program.source.effect.occurrenceId,
                program.source.effect.selection.group.key,
              ),
            }
          : null,
      inputDefinitions: definitions,
    },
    { values, missingDefinitions, invalidInputKeys: [] },
  );
  return { facts: resolved, condition, outcome, missingCondition, stochastic, definitions };
}
