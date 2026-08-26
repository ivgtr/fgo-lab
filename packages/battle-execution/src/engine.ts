import {
  getPrimaryNoblePhantasm,
  getPrimaryNpDamage,
  type MasterDataSnapshot,
  type NpDamageSpec,
} from '@fgo-lab/master-data';
import type { CalculationScenario, DamageResolutionInput } from '@fgo-lab/schema';
import type {
  BattleExecutionResult,
  BattleOperation,
  BattleState,
  ConditionExpression,
  EffectProjection,
  ExecutionIssue,
  ExecutionPhase,
  OperationResult,
  OperationSource,
} from './contracts';
import { planOperationActivations, resolveOperationActivation } from './activation';
import { containsUnsupportedCondition, evaluateCondition, isConditional } from './condition';
import {
  fixedConstraintFactsFromState,
  validateConstraintSet,
  type SatisfiableConditionConstraint,
} from './constraints';
import { canonicalExclusiveGroup, canonicalExclusiveTraits } from './conditionSemantics';
import { applyNpDamageOperation } from './npDamageOperation';
import { compileEffect } from './operationCompiler';
import {
  createOperationProjection,
  projectAtDamageEvaluation,
  resolveModifierValue,
  traitCountProjections,
} from './projection';
import { collectOperationSources } from './sourceCollection';
import {
  applyWorldFacts,
  cloneBattleState,
  combinedTraitCounts,
  createInitialBattleState,
  foldDamageInput,
  withoutTraitCount,
} from './state';

type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

export interface OrderedScenarioExecution extends BattleExecutionResult {
  input: DamageResolutionInput;
}

function applyNp(
  input: DamageResolutionInput,
  operation: Extract<BattleOperation, { kind: 'executeNpDamage' }>,
  state: BattleState,
  effectLocalConditionSatisfied: boolean,
): DamageResolutionInput {
  const attackerTraits = combinedTraitCounts(
    state.traitCounts.attacker,
    state.traitCounts.attackerState,
  );
  const targetTraits = state.traitCounts.target;
  const targetStateTraits = state.traitCounts.targetState;
  return applyNpDamageOperation(input, operation.damage, {
    overcharge: operation.overcharge,
    attackerTraitCounts: attackerTraits,
    targetTraitCounts: targetTraits,
    targetCombinedTraitCounts: combinedTraitCounts(
      state.traitCounts.target,
      state.traitCounts.targetState,
    ),
    targetStateTraitCounts: targetStateTraits,
    attackerHpPermille: state.quantities.attackerHpPermille,
    targetRarity: state.quantities.targetRarity,
    battlePointPhase: state.quantities.battlePointPhase,
    effectLocalConditionSatisfied,
  });
}

function npCondition(damage: NpDamageSpec, overcharge: number): ConditionExpression {
  const item = damage.parametersByOvercharge[overcharge - 1]?.[0];
  if (!item) return { kind: 'always' };
  if ((damage.kind === 'trait' || damage.kind === 'stateTrait') && item.targetTrait)
    return {
      kind: 'trait',
      scope: damage.kind === 'stateTrait' ? 'targetState' : 'target',
      trait: item.targetTrait.name,
      present: true,
    };
  if (damage.kind === 'traitExpression' && item.andCheckTraits)
    return {
      kind: 'all',
      expressions: item.andCheckTraits.map((trait) => ({
        kind: 'trait',
        scope: 'target',
        trait: trait.name,
        present: true,
      })),
    };
  if (damage.kind === 'targetRarity' && item.targetRarities)
    return {
      kind: 'any',
      expressions: item.targetRarities.map((rarity) => ({
        kind: 'quantity',
        quantity: 'targetRarity',
        comparison: 'equal',
        value: rarity,
      })),
    };
  return { kind: 'always' };
}

export function executeOrderedScenario(
  baseInput: DamageResolutionInput,
  scenario: ResolvedScenario,
  master: MasterDataSnapshot,
): OrderedScenarioExecution {
  const attacker = master.servants.find((servant) => servant.id === baseInput.attackerId);
  let state = createInitialBattleState(baseInput, attacker?.traits ?? []);
  const collected = collectOperationSources(baseInput, scenario, master);
  const compiledOperations: BattleOperation[] = [];
  const compileProjections: EffectProjection[] = [];
  for (const source of collected.sources) {
    const compiled = compileEffect(source, compiledOperations.length);
    compiledOperations.push(...compiled.operations);
    compileProjections.push(...compiled.unsupported);
  }
  const damage = attacker ? getPrimaryNpDamage(attacker) : undefined;
  if (attacker && damage) {
    const np = getPrimaryNoblePhantasm(attacker)!;
    const condition = npCondition(damage, baseInput.overcharge);
    const npDecisionPlan = {
      activation: 'automatic' as const,
      condition: containsUnsupportedCondition(condition)
        ? ('unsupported' as const)
        : isConditional(condition)
          ? ('userMayAssume' as const)
          : ('evaluate' as const),
    };
    const source: OperationSource = {
      origin: 'np',
      sourceInstanceId: `np:${attacker.id}`,
      sourceId: attacker.id,
      skillId: `np:${attacker.id}`,
      effectId: damage.functionId,
      effectOccurrenceId: `damage:${damage.functionId}`,
    };
    compileProjections.push(
      ...traitCountProjections(
        attacker.id,
        damage,
        baseInput.overcharge,
        baseInput.npLevel,
        source,
        attacker.name,
        np.name,
      ),
    );
    compiledOperations.push({
      operationId: `np:${attacker.id}:${damage.functionId}:damage`,
      order: compiledOperations.length,
      phase: 'npDamage',
      source,
      condition,
      decisionKey:
        npDecisionPlan.condition === 'userMayAssume'
          ? `np:${attacker.id}:${damage.functionId}:condition`
          : null,
      decisionPlan: npDecisionPlan,
      enabledByDefault: true,
      activation: { kind: 'sourceDefault' },
      evidence: { rawPath: damage.rawPath, functionId: damage.functionId, parameterKeys: [] },
      presentation: {
        label: damage.kind === 'targetRarity' ? 'レアリティ特攻宝具' : '特攻宝具',
        sourceName: attacker.name,
        skillName: np.name,
      },
      kind: 'executeNpDamage',
      damage,
      overcharge: baseInput.overcharge,
      selectedNpLevel: baseInput.npLevel,
      npMultipliers: damage.parametersByOvercharge[baseInput.overcharge - 1]!.map(
        (item) => item.valuePermille / 10,
      ) as [number, number, number, number, number],
    });
  }
  const plannedOperations = planOperationActivations(compiledOperations);
  const phaseOrder: Record<ExecutionPhase, number> = {
    passive: 0,
    attackerSkill: 1,
    craftEssence: 2,
    support: 3,
    mysticCode: 4,
    beforeNpDamage: 5,
    damageEvaluation: 6,
    npDamage: 7,
  };
  const operations = [...plannedOperations]
    .sort(
      (left, right) => phaseOrder[left.phase] - phaseOrder[right.phase] || left.order - right.order,
    )
    .map((operation, order) => ({ ...operation, order }));
  const decisions = new Map(
    scenario.effectDecisions.map((decision) => [decision.decisionKey, decision]),
  );
  const activations = new Map(
    operations.map((operation) => [
      operation.operationId,
      resolveOperationActivation(operation, decisions),
    ]),
  );
  const conditionByDecisionKey = new Map(
    operations.flatMap((operation) =>
      operation.decisionKey ? [[operation.decisionKey, operation.condition] as const] : [],
    ),
  );
  const activeConditionConstraints: SatisfiableConditionConstraint[] =
    scenario.effectDecisions.flatMap((decision) => {
      const expression = conditionByDecisionKey.get(decision.decisionKey);
      return decision.operationEnabled &&
        decision.conditionSatisfaction === 'assumeSatisfied' &&
        expression
        ? [{ sourceKey: decision.decisionKey, expression }]
        : [];
    });
  const activeMutationConstraints: SatisfiableConditionConstraint[] = operations.flatMap(
    (operation) => {
      const activation = activations.get(operation.operationId)!;
      return activation.assumesLocalCondition
        ? [{ sourceKey: operation.operationId, expression: operation.condition }]
        : [];
    },
  );
  const selectedCardMutations = operations.filter((operation) => {
    if (operation.kind !== 'changeCardType') return false;
    if (operation.decisionPlan.activation === 'automatic') return operation.enabledByDefault;
    return operation.decisionKey
      ? (decisions.get(operation.decisionKey)?.operationEnabled ?? operation.enabledByDefault)
      : operation.enabledByDefault;
  }) as Extract<BattleOperation, { kind: 'changeCardType' }>[];
  const finalSelectedCardMutation = selectedCardMutations.at(-1);
  const initialConstraintValidation = validateConstraintSet({
    fixedFacts: [
      ...fixedConstraintFactsFromState(state, 'initial').filter(
        ({ fact }) => !finalSelectedCardMutation || fact.kind !== 'card',
      ),
      ...(finalSelectedCardMutation
        ? [
            {
              sourceKey:
                finalSelectedCardMutation.decisionKey ?? finalSelectedCardMutation.operationId,
              fact: { kind: 'card' as const, card: finalSelectedCardMutation.card },
            },
          ]
        : []),
      ...scenario.worldFactAssertions.map((assertion) => ({
        sourceKey: assertion.decisionKey,
        fact: assertion.fact,
      })),
    ],
    expressions: [...activeConditionConstraints, ...activeMutationConstraints],
  });
  const constraintIssues =
    initialConstraintValidation.status === 'satisfied' ? [] : [initialConstraintValidation.issue];
  if (initialConstraintValidation.status === 'satisfied')
    state = applyWorldFacts(state, scenario.worldFactAssertions);
  const invalidDecisionKeys = new Set(
    initialConstraintValidation.status === 'satisfied'
      ? []
      : [
          ...activeConditionConstraints.map((constraint) => constraint.sourceKey),
          ...operations.flatMap(
            (operation) => activations.get(operation.operationId)!.activeDecisionKeys,
          ),
        ],
  );
  const resolvedCompileProjections = compileProjections.map((projection) => {
    const choice = decisions.get(projection.projectionKey);
    const enabled =
      choice?.operationEnabled ??
      (projection.decision.state === 'none' || projection.decision.state === 'enabled');
    if (invalidDecisionKeys.has(projection.projectionKey))
      return {
        ...projection,
        outcome: 'notApplied' as const,
        decision:
          projection.decision.state === 'none'
            ? projection.decision
            : {
                ...projection.decision,
                state: enabled ? ('enabled' as const) : ('disabled' as const),
              },
        explanation: { ...projection.explanation, code: 'conditionNotMet' as const },
      };
    if (projection.executionSupport === 'unsupported' && enabled)
      return {
        ...projection,
        outcome: 'unsupported' as const,
        decision:
          projection.decision.state === 'none'
            ? projection.decision
            : { ...projection.decision, state: 'enabled' as const },
        explanation: { ...projection.explanation, code: 'unresolved' as const },
      };
    return enabled
      ? projection
      : {
          ...projection,
          outcome: 'notApplied' as const,
          decision:
            projection.decision.state === 'none'
              ? projection.decision
              : { ...projection.decision, state: 'disabled' as const },
          explanation: { ...projection.explanation, code: 'disabled' as const },
        };
  });
  const results: OperationResult[] = [];
  let input = baseInput;
  for (const operation of operations) {
    const choice = operation.decisionKey ? decisions.get(operation.decisionKey) : undefined;
    const activation = activations.get(operation.operationId)!;
    const enabled = activation.enabled;
    const condition = evaluateCondition(operation.condition, state);
    const resolvedModifierValue =
      operation.kind === 'addModifier' ? resolveModifierValue(operation, state) : null;
    const decisionConditionSatisfied =
      choice?.conditionSatisfaction === 'assumeSatisfied' &&
      operation.decisionPlan.condition === 'userMayAssume';
    const localConditionSatisfied = decisionConditionSatisfied || activation.assumesLocalCondition;
    let outcome: OperationResult['outcome'] = 'applied';
    let code: EffectProjection['explanation']['code'] = 'applied';
    let issue: ExecutionIssue | null = null;
    if (
      (operation.decisionKey && invalidDecisionKeys.has(operation.decisionKey)) ||
      activation.activeDecisionKeys.some((key) => invalidDecisionKeys.has(key))
    ) {
      outcome = 'notApplied';
      code = 'conditionNotMet';
    } else if (!enabled) {
      outcome = 'notApplied';
      code = 'disabled';
    } else if (
      operation.kind === 'changeCardType' &&
      finalSelectedCardMutation !== undefined &&
      operation.operationId !== finalSelectedCardMutation.operationId &&
      operation.order < finalSelectedCardMutation.order
    ) {
      outcome = 'notRelevant';
      code = 'disabled';
    } else if (operation.kind === 'addModifier' && resolvedModifierValue === null) {
      outcome = 'unsupported';
      code = 'unresolved';
      issue = {
        kind: 'unsupportedOperation',
        operationId: operation.operationId,
        detail: 'modifier_value_quantity_missing',
      };
    } else if (
      decisionConditionSatisfied &&
      (operation.kind === 'addTrait' || operation.kind === 'removeTrait')
    ) {
      outcome = 'unsupported';
      code = 'unresolved';
      issue = {
        kind: 'unsafeLocalConditionDecision',
        operationId: operation.operationId,
        detail: 'condition_satisfaction_would_create_world_fact',
      };
    } else if (condition === null && localConditionSatisfied) {
      outcome = 'applied';
    } else if (
      condition === null &&
      operation.decisionKey &&
      choice?.conditionSatisfaction !== 'assumeSatisfied'
    ) {
      outcome = 'notApplied';
      code = 'unresolved';
    } else if (
      condition === null &&
      (operation.kind === 'addTrait' || operation.kind === 'removeTrait')
    ) {
      outcome = 'notApplied';
      code = 'unresolved';
    } else if (condition === null) {
      outcome = 'unsupported';
      code = 'unresolved';
      issue = {
        kind: 'unsupportedCondition',
        operationId: operation.operationId,
        detail: 'quantity_missing',
      };
    } else if (!condition && !localConditionSatisfied) {
      outcome = 'notApplied';
      code = 'conditionNotMet';
    }
    if (outcome === 'applied') {
      const candidateState = cloneBattleState(state);
      if (operation.kind === 'addTrait') {
        (candidateState.traits[operation.scope] as Map<string, boolean>).set(operation.trait, true);
        candidateState.traitCounts[operation.scope] = {
          ...candidateState.traitCounts[operation.scope],
          [operation.trait]:
            (candidateState.traitCounts[operation.scope][operation.trait] ?? 0) + 1,
        };
      } else if (operation.kind === 'removeTrait') {
        (candidateState.traits[operation.scope] as Map<string, boolean>).set(
          operation.trait,
          false,
        );
        candidateState.traitCounts[operation.scope] = withoutTraitCount(
          candidateState.traitCounts[operation.scope],
          operation.trait,
        );
      } else if (operation.kind === 'addModifier')
        candidateState.modifiers = [
          ...candidateState.modifiers,
          {
            operationId: operation.operationId,
            source: operation.source,
            modifier: operation.modifier,
            valuePermille: resolvedModifierValue!,
            card: operation.card,
            order: operation.order,
          },
        ];
      else if (operation.kind === 'changeModifierRate')
        candidateState.modifierRates = {
          ...candidateState.modifierRates,
          [operation.modifier]: Math.max(
            candidateState.modifierRates[operation.modifier] ?? 0,
            operation.ratePermille,
          ),
        };
      else if (operation.kind === 'changeCardType') {
        candidateState.card = operation.card;
        for (const trait of operation.stateTraits) {
          const group = canonicalExclusiveGroup('attackerState', trait);
          if (group)
            for (const conflictingTrait of canonicalExclusiveTraits('attackerState', group)) {
              if (conflictingTrait === trait) continue;
              (candidateState.traits.attackerState as Map<string, boolean>).set(
                conflictingTrait,
                false,
              );
              candidateState.traitCounts.attackerState = withoutTraitCount(
                candidateState.traitCounts.attackerState,
                conflictingTrait,
              );
            }
          (candidateState.traits.attackerState as Map<string, boolean>).set(trait, true);
          candidateState.traitCounts.attackerState = {
            ...candidateState.traitCounts.attackerState,
            [trait]: 1,
          };
        }
      } else if (operation.kind === 'ignoreDefense') candidateState.ignoreDefense = true;
      else if (operation.kind === 'ignoreDamageCut') candidateState.ignoreDamageCut = true;
      else input = applyNp(input, operation, state, localConditionSatisfied);
      const mutationValidation =
        operation.kind === 'addTrait' ||
        operation.kind === 'removeTrait' ||
        operation.kind === 'changeCardType'
          ? validateConstraintSet({
              fixedFacts: fixedConstraintFactsFromState(candidateState, operation.operationId),
              expressions: activeConditionConstraints
                .filter((constraint) => !invalidDecisionKeys.has(constraint.sourceKey))
                .concat(activeMutationConstraints),
            })
          : { status: 'satisfied' as const, alternativeCount: 1 };
      if (mutationValidation.status !== 'satisfied') {
        outcome = 'unsupported';
        code = 'unresolved';
        issue = mutationValidation.issue;
        mutationValidation.issue.sourceKeys.forEach((key) => invalidDecisionKeys.add(key));
        activation.activeDecisionKeys.forEach((key) => invalidDecisionKeys.add(key));
      } else {
        state = candidateState;
        state.evidence = [...state.evidence, operation.evidence];
      }
    }
    if (issue) state.unresolved = [...state.unresolved, issue];
    results.push({
      operation,
      outcome,
      condition: condition === null ? 'unresolved' : condition ? 'satisfied' : 'unsatisfied',
      state: cloneBattleState(state),
      projection: createOperationProjection(
        operation,
        outcome,
        code,
        enabled,
        condition,
        choice,
        resolvedModifierValue,
      ),
      issue,
    });
  }
  const issues = [
    ...constraintIssues,
    ...collected.issues,
    ...resolvedCompileProjections
      .filter((projection) => projection.outcome === 'unsupported')
      .map<ExecutionIssue>((projection) => ({
        kind: 'unsupportedOperation',
        operationId: projection.operationId,
        detail: 'effect_semantics_unresolved',
      })),
    ...state.unresolved,
  ];
  const projectionByKey = new Map<string, EffectProjection>();
  for (const projection of [
    ...resolvedCompileProjections,
    ...results.map((result) => projectAtDamageEvaluation(result, state)),
  ]) {
    const prior = projectionByKey.get(projection.projectionKey);
    if (!prior || (prior.visibility === 'hidden' && projection.visibility === 'visible'))
      projectionByKey.set(projection.projectionKey, projection);
  }
  const projections = [...projectionByKey.values()];
  return {
    input: foldDamageInput(input, state),
    state,
    operations: results,
    projections,
    precision: issues.length ? 'unsupported' : 'exact',
    issues,
  };
}
