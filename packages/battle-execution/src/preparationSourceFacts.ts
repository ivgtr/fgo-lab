import {
  inputFactValues,
  writeInputFact,
  exactInputFactValue,
  rejectInputFact,
} from './inputFacts';
import { runtimeInputKey } from './runtimeInputIdentity';
import { canonicalRequirementLeaves, type CanonicalInputDefinition } from '@fgo-lab/master-data';
import type { ConditionExpression } from './contracts';
import {
  evaluateCondition,
  type ConditionEvaluationState,
  type ConditionReadAudit,
} from './condition';
import { runtimeInputDefinitionsForSource } from './operationCompiler';
import { resolveStochasticActivationOutcome } from './stochasticOutcomes';
import {
  stochasticGroupKey,
  selectStochasticPossibility,
  type StochasticSelection,
} from './stochasticPossibilities';
import {
  beginHpConditionCapture,
  finishHpConditionCapture,
  type HpQuantityRead,
} from './hpExecutionObservation';
import type { OcSourceProgram } from './ocSourceProgram';
import { cloneConditionFactProofs, type ConditionRead } from './conditionRead';
import { effectiveProcRate } from './procRate';

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
  selection: StochasticSelection,
  procOwner: 'source' | 'ocRate',
  onHpRead?: (read: HpQuantityRead) => void,
  onConditionRead?: (read: ConditionReadAudit) => void,
) {
  const definitions = runtimeInputDefinitionsForSource(program.source);
  let inputFacts = facts.inputFacts;
  const missingDefinitions: CanonicalInputDefinition[] = [];
  for (const definition of definitions) {
    const prior = inputFacts.get(definition.key);
    const value = prior === undefined ? definition.defaultValue : exactInputFactValue(prior);
    if (
      value === null ||
      value === undefined ||
      !Number.isInteger(value) ||
      value < definition.minimum ||
      value > definition.maximum ||
      (value - definition.minimum) % definition.step !== 0
    ) {
      if (prior === undefined) inputFacts = writeInputFact(inputFacts, definition.key, null, []);
      else if (prior.kind === 'known') inputFacts = rejectInputFact(inputFacts, definition, prior);
      missingDefinitions.push(definition);
    } else if (prior === undefined)
      inputFacts = writeInputFact(inputFacts, definition.key, value, [
        { kind: 'selectedInitialResource', clock: facts.conditionReadClock },
      ]);
  }
  const resolved = {
    ...facts,
    conditionFactProofs: cloneConditionFactProofs(facts.conditionFactProofs),
    inputFacts,
  };
  const values = inputFactValues(inputFacts);
  const condition = commandCondition(program.condition, program);
  const previous = onHpRead ? beginHpConditionCapture(resolved, onHpRead) : undefined;
  let conditionRead: ConditionRead;
  try {
    conditionRead = evaluateCondition(condition, resolved, onConditionRead);
  } finally {
    if (onHpRead) finishHpConditionCapture(resolved, previous);
  }
  const outcome = conditionRead.truth;
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
  const missingDefinition =
    outcome === false
      ? undefined
      : missingDefinitions.find((definition) => inputKeys.has(definition.key));
  const missingFact = missingDefinition && inputFacts.get(missingDefinition.key);
  const missingCondition =
    missingFact?.kind === 'conditional'
      ? (missingFact.recoveryInputs[0] ?? missingDefinition)
      : missingDefinition;
  let stochastic = resolveStochasticActivationOutcome(
    {
      operationId: `preparation:${program.source.effect.occurrenceId}`,
      sourceActivation: program.source.sourceActivation,
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
  const effect = program.source.effect;
  let procRate: number | null = null;
  if (effect.proc.kind === 'guaranteed') procRate = 1000;
  else if (stochastic.status === 'success' || stochastic.status === 'failure') {
    const baseRate =
      effect.proc.ratePermille[program.source.valueSetIndex]?.[program.source.valueIndex];
    if (baseRate === undefined) throw new TypeError('missing_stochastic_source_cell');
    const adjustmentDefinition = effect.proc.netAdjustmentInputKey
      ? definitions.find((definition) => definition.kind === 'statusApplicationAdjustment')
      : undefined;
    const adjustment = adjustmentDefinition ? (values[adjustmentDefinition.key] ?? null) : null;
    procRate = effectiveProcRate(effect.proc, baseRate, adjustment);
  }
  if (
    procOwner === 'source' &&
    selection.kind === 'possibility' &&
    outcome !== false &&
    effect.proc.kind !== 'guaranteed' &&
    effect.selection?.kind === 'stochasticOutcome' &&
    (stochastic.status === 'success' || stochastic.status === 'failure')
  ) {
    const group = effect.selection.group;
    if (procRate === null) throw new TypeError('missing_stochastic_source_cell');
    stochastic = {
      status: selectStochasticPossibility(
        stochasticGroupKey(
          program.source.origin,
          program.source.sourceInstanceId,
          program.source.skillId,
          group,
          facts.conditionReadClock.actionId,
        ),
        effect.proc,
        group,
        procRate,
        selection,
      ),
    };
  }
  return {
    facts: resolved,
    condition,
    conditionRead,
    outcome,
    missingCondition,
    stochastic,
    procRate,
    definitions,
  };
}
