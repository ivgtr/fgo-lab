import {
  masterEffectSchema,
  type EffectExecutionOperation,
  type MasterEffect,
  type ModifierValueExpression,
} from '@fgo-lab/master-data';

type ValuedOperation = Extract<
  EffectExecutionOperation,
  { kind: 'damageModifier' | 'modifierRateChange' }
>;

function expressionShape(expression: ModifierValueExpression | null) {
  if (expression === null) return null;
  return expression.kind === 'inverseHpLinear'
    ? { kind: expression.kind }
    : expression.kind === 'hpRangeLinear'
      ? {
          kind: expression.kind,
          minimumHpPermille: expression.minimumHpPermille,
          maximumHpPermille: expression.maximumHpPermille,
        }
      : {
          kind: expression.kind,
          inputKey: expression.inputKey,
        };
}

function operationSemanticIdentity(operation: EffectExecutionOperation): string {
  if (operation.kind !== 'damageModifier' && operation.kind !== 'modifierRateChange')
    return JSON.stringify(operation);
  const semantics =
    operation.kind === 'damageModifier'
      ? {
          kind: operation.kind,
          modifier: operation.modifier,
          sign: operation.sign,
          card: operation.card,
          targetPolicy: operation.targetPolicy,
          expectedRecipient: operation.expectedRecipient,
          targetMismatch: operation.targetMismatch,
          semanticSupport: operation.semanticSupport,
        }
      : {
          kind: operation.kind,
          modifier: operation.modifier,
          targetPolicy: operation.targetPolicy,
          expectedRecipient: operation.expectedRecipient,
          targetMismatch: operation.targetMismatch,
          semanticSupport: operation.semanticSupport,
        };
  return JSON.stringify({
    ...semantics,
    valueExpressionShape: operation.valueExpressions.map((set) => set.map(expressionShape)),
  });
}

function effectSemanticIdentity(effect: MasterEffect): string {
  return JSON.stringify({
    id: effect.id,
    inclusionPolicy: effect.inclusionPolicy,
    gameActivation: effect.gameActivation,
    proc: effect.proc,
    choice: effect.choice,
    triggerScope: effect.triggerScope,
    operationTrigger: effect.operationTrigger,
    operationReference: effect.operationReference,
    stateIdentity: effect.stateIdentity,
    quantityConditions: effect.quantityConditions,
    sourceQuantityConditions: effect.sourceQuantityConditions,
    inputQuantityConditions: effect.inputQuantityConditions,
    inputDefinitions: effect.inputDefinitions,
    interaction: effect.interaction,
    conditions: effect.conditions,
    conditionTargetPolicy: effect.conditionTargetPolicy,
    execution: effect.execution.map(operationSemanticIdentity),
  });
}

function withExplicitLimitBreakValues(effect: MasterEffect): MasterEffect {
  return {
    ...effect,
    execution: effect.execution.map((operation) =>
      operation.kind === 'damageModifier' || operation.kind === 'modifierRateChange'
        ? {
            ...operation,
            limitBreakValues: operation.limitBreakValues ?? operation.values,
            limitBreakValueExpressions:
              operation.limitBreakValueExpressions ?? operation.valueExpressions,
          }
        : operation,
    ),
  };
}

function mergeSharedEffect(
  equipId: number,
  normal: MasterEffect,
  limitBreak: MasterEffect,
): MasterEffect {
  if (effectSemanticIdentity(normal) !== effectSemanticIdentity(limitBreak))
    throw new Error(
      `craft_essence_limit_break_semantics_mismatch:${String(equipId)}:${normal.occurrenceId}`,
    );
  return {
    ...normal,
    execution: normal.execution.map((operation, index) => {
      if (operation.kind !== 'damageModifier' && operation.kind !== 'modifierRateChange')
        return operation;
      const limitBreakOperation = limitBreak.execution[index] as ValuedOperation | undefined;
      if (
        !limitBreakOperation ||
        operationSemanticIdentity(operation) !== operationSemanticIdentity(limitBreakOperation)
      )
        throw new Error(
          `craft_essence_limit_break_operation_mismatch:${String(equipId)}:${normal.occurrenceId}:${String(index)}`,
        );
      return {
        ...operation,
        limitBreakValues: limitBreakOperation.values,
        limitBreakValueExpressions: limitBreakOperation.valueExpressions,
      };
    }),
    atlasEvidence: {
      ...normal.atlasEvidence,
      limitBreakParameterSets: limitBreak.atlasEvidence.parameterSets,
    },
  };
}

export function normalizeCraftEssenceLimitBreakEffects(input: {
  equipId: number;
  normalEffects: readonly unknown[];
  limitBreakEffects: readonly unknown[] | null;
}): MasterEffect[] {
  const normalEffects = input.normalEffects.map((effect) => masterEffectSchema.parse(effect));
  if (input.limitBreakEffects === null) return normalEffects.map(withExplicitLimitBreakValues);
  const limitBreakEffects = input.limitBreakEffects.map((effect) =>
    masterEffectSchema.parse(effect),
  );
  const normalByOccurrence = new Map(
    normalEffects.map((effect) => [effect.occurrenceId, effect] as const),
  );
  const limitBreakByOccurrence = new Map(
    limitBreakEffects.map((effect) => [effect.occurrenceId, effect] as const),
  );
  if (
    normalByOccurrence.size !== normalEffects.length ||
    limitBreakByOccurrence.size !== limitBreakEffects.length
  )
    throw new Error(`craft_essence_limit_break_occurrence_ambiguous:${String(input.equipId)}`);

  for (const normal of normalEffects)
    if (!limitBreakByOccurrence.has(normal.occurrenceId))
      throw new Error(
        `craft_essence_limit_break_effect_missing:${String(input.equipId)}:${normal.occurrenceId}`,
      );

  const sharedOrder = limitBreakEffects
    .filter((effect) => normalByOccurrence.has(effect.occurrenceId))
    .map((effect) => effect.occurrenceId);
  if (
    JSON.stringify(sharedOrder) !==
    JSON.stringify(normalEffects.map((effect) => effect.occurrenceId))
  )
    throw new Error(`craft_essence_limit_break_effect_order_mismatch:${String(input.equipId)}`);

  return limitBreakEffects.map((limitBreak) => {
    const normal = normalByOccurrence.get(limitBreak.occurrenceId);
    return withExplicitLimitBreakValues(
      normal
        ? mergeSharedEffect(input.equipId, normal, limitBreak)
        : { ...limitBreak, availability: 'maximumLimitBreakOnly' },
    );
  });
}
