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
  if (expression.kind === 'stackLinear')
    return {
      kind: expression.kind,
      sources: expression.sources.map(({ quantitySource }) => quantitySource),
    };
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
  if (
    operation.kind === 'grantOcBoost' ||
    operation.kind === 'grantOcApplicationRate' ||
    operation.kind === 'ocRemovalResistance'
  ) {
    return JSON.stringify({
      ...operation,
      cells: undefined,
      limitBreakCells: undefined,
      amountShapes:
        operation.kind === 'grantOcApplicationRate' || operation.kind === 'ocRemovalResistance'
          ? operation.cells.map((row) =>
              row.map(({ amount }) =>
                amount.kind === 'fixed' ? { kind: 'fixed' } : expressionShape(amount),
              ),
            )
          : undefined,
    });
  }
  if (operation.kind === 'resourceMutation' && operation.amount.kind === 'fixed')
    return JSON.stringify({
      ...operation,
      amount: { kind: 'fixed' },
    });
  if (operation.kind !== 'damageModifier' && operation.kind !== 'modifierRateChange')
    return JSON.stringify(operation);
  const semantics =
    operation.kind === 'damageModifier'
      ? {
          kind: operation.kind,
          modifier: operation.modifier,
          sign: operation.sign,
          card: operation.card,
          route: operation.route,
          semanticSupport: operation.semanticSupport,
        }
      : {
          kind: operation.kind,
          modifier: operation.modifier,
          route: operation.route,
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
    selection: effect.selection,
    triggerScope: effect.triggerScope,
    operationTrigger: effect.operationTrigger,
    operationReference: effect.operationReference,
    stateIdentity: effect.stateIdentity,
    inputDefinitions: effect.inputDefinitions,
    interaction: effect.interaction,
    requirement: effect.requirement,
    execution: effect.execution.map(operationSemanticIdentity),
  });
}

function withExplicitLimitBreakValues(effect: MasterEffect): MasterEffect {
  return {
    ...effect,
    execution: effect.execution.map((operation) =>
      operation.kind === 'ocRemovalResistance'
        ? { ...operation, limitBreakCells: operation.limitBreakCells ?? operation.cells }
        : operation.kind === 'grantOcBoost'
          ? { ...operation, limitBreakCells: operation.limitBreakCells ?? operation.cells }
          : operation.kind === 'grantOcApplicationRate'
            ? { ...operation, limitBreakCells: operation.limitBreakCells ?? operation.cells }
            : operation.kind === 'damageModifier' || operation.kind === 'modifierRateChange'
              ? {
                  ...operation,
                  limitBreakValues: operation.limitBreakValues ?? operation.values,
                  limitBreakValueExpressions:
                    operation.limitBreakValueExpressions ?? operation.valueExpressions,
                }
              : operation.kind === 'resourceMutation' && operation.amount.kind === 'fixed'
                ? {
                    ...operation,
                    amount: {
                      ...operation.amount,
                      limitBreakValues:
                        operation.amount.limitBreakValues ?? operation.amount.values,
                    },
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
      if (
        operation.kind === 'grantOcBoost' ||
        operation.kind === 'grantOcApplicationRate' ||
        operation.kind === 'ocRemovalResistance'
      ) {
        const lb = limitBreak.execution[index];
        if (operation.kind === 'ocRemovalResistance' && lb?.kind === 'ocRemovalResistance')
          return { ...operation, limitBreakCells: lb.cells };
        if (operation.kind === 'grantOcBoost' && lb?.kind === 'grantOcBoost')
          return { ...operation, limitBreakCells: lb.cells };
        if (operation.kind === 'grantOcApplicationRate' && lb?.kind === 'grantOcApplicationRate')
          return { ...operation, limitBreakCells: lb.cells };
        throw new Error('oc_limit_break_operation_mismatch');
      }
      if (operation.kind === 'resourceMutation' && operation.amount.kind === 'fixed') {
        const limitBreakOperation = limitBreak.execution[index];
        if (
          limitBreakOperation?.kind !== 'resourceMutation' ||
          limitBreakOperation.amount.kind !== 'fixed' ||
          operationSemanticIdentity(operation) !== operationSemanticIdentity(limitBreakOperation)
        )
          throw new Error(
            `craft_essence_limit_break_operation_mismatch:${String(equipId)}:${normal.occurrenceId}:${String(index)}`,
          );
        return {
          ...operation,
          amount: {
            ...operation.amount,
            limitBreakValues: limitBreakOperation.amount.values,
          },
        };
      }
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
