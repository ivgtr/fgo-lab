import {
  getPrimaryNoblePhantasm,
  getPrimaryNpDamage,
  type MasterDataSnapshot,
  type NpDamageSpec,
} from '@fgo-lab/master-data';
import { defaultTargetClassRelation, servantAttribute } from '@fgo-lab/calc-core';
import type { DamageResolutionInput } from '@fgo-lab/schema';
import { planOperationActivations } from './activation';
import { containsUnsupportedCondition, requiresUserAssumption } from './condition';
import type {
  BattleOperation,
  ConditionExpression,
  EffectProjection,
  ExecutionPhase,
  OperationSource,
} from './contracts';
import type { PreparedOrderedScenario, ResolvedScenario } from './executionTypes';
import { compileEffect } from './operationCompiler';
import { traitCountProjections } from './projection';
import { collectOperationSources } from './sourceCollection';
import { resolveTargetCandidates } from './targetContext';

function npCondition(damage: NpDamageSpec, overcharge: number): ConditionExpression {
  const item = damage.parametersByOvercharge[overcharge - 1]?.[0];
  if (!item) return { kind: 'always' };
  if ((damage.kind === 'trait' || damage.kind === 'stateTrait') && item.targetTrait)
    return item.targetTrait.kind === 'targetPredicate'
      ? {
          kind: 'targetPredicate',
          scope: 'target',
          predicate: item.targetTrait.predicate,
          present: true,
        }
      : {
          kind: 'trait',
          scope: damage.kind === 'stateTrait' ? 'targetState' : 'target',
          trait: item.targetTrait.name,
          present: true,
        };
  if (damage.kind === 'traitExpression' && item.andCheckTraits)
    return {
      kind: 'all',
      expressions: item.andCheckTraits.map<ConditionExpression>((trait) =>
        trait.kind === 'targetPredicate'
          ? {
              kind: 'targetPredicate',
              scope: 'target',
              predicate: trait.predicate,
              present: true,
            }
          : { kind: 'trait', scope: 'target', trait: trait.name, present: true },
      ),
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

function compileNpDamageOperation(
  baseInput: DamageResolutionInput,
  scenario: ResolvedScenario,
  master: MasterDataSnapshot,
  attacker: MasterDataSnapshot['servants'][number],
  damage: NpDamageSpec,
  operationOrder: number,
): { operation: BattleOperation; projections: readonly EffectProjection[] } {
  const np = getPrimaryNoblePhantasm(attacker)!;
  const condition = npCondition(damage, baseInput.overcharge);
  const decisionPlan = {
    activation: condition.kind === 'always' ? ('automatic' as const) : ('user' as const),
    condition: containsUnsupportedCondition(condition)
      ? ('unsupported' as const)
      : requiresUserAssumption(condition)
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
  const projections = traitCountProjections(
    attacker.id,
    damage,
    baseInput.overcharge,
    baseInput.npLevel,
    source,
    attacker.name,
    np.name,
  ).map((projection) => {
    if (projection.decision.state === 'none' || projection.decision.kind !== 'targetPredicate')
      return projection;
    const target = projection.decision.target;
    const enabled =
      target.kind === 'classIdentity'
        ? scenario.targetContext.class.kind === 'concrete' &&
          scenario.targetContext.class.classId === target.classId
        : target.kind === 'attributeIdentity'
          ? scenario.targetContext.attribute.kind === 'concrete' &&
            scenario.targetContext.attribute.attribute === target.attribute
          : scenario.targetContext.families.some(({ familyId }) => familyId === target.familyId);
    return {
      ...projection,
      outcome: enabled ? ('applied' as const) : ('notApplied' as const),
      decision: {
        state: enabled ? ('enabled' as const) : ('disabled' as const),
        decisionKey: projection.decision.decisionKey,
        kind: 'targetPredicate' as const,
        target,
        fallbackClass:
          target.kind === 'classIdentity'
            ? ({
                kind: 'relative',
                relation: defaultTargetClassRelation(attacker.classId),
              } as const)
            : null,
        fallbackAttribute:
          target.kind === 'attributeIdentity'
            ? ({ kind: 'relative', relation: 'neutral' } as const)
            : null,
      },
    };
  });
  return {
    projections,
    operation: {
      operationId: `np:${attacker.id}:${damage.functionId}:damage`,
      order: operationOrder,
      phase: 'npDamage',
      source,
      condition,
      decisionKey:
        decisionPlan.activation === 'user' || decisionPlan.condition === 'userMayAssume'
          ? `np:${attacker.id}:${damage.functionId}:condition`
          : null,
      decisionPlan,
      sourceEnabled: true,
      enabledByDefault: true,
      gameActivation: 'npBeforeDamage',
      proc: { kind: 'guaranteed' },
      procSelection: { kind: 'effectInclusion' },
      procRatePermille: 1_000,
      activation: { kind: 'sourceDefault' },
      evidence: { rawPath: damage.rawPath, functionId: damage.functionId },
      presentation: {
        label: damage.kind === 'targetRarity' ? 'レアリティ特攻宝具' : '特攻宝具',
        sourceName: attacker.name,
        skillName: np.name,
      },
      inputDefinitions: [],
      kind: 'executeNpDamage',
      damage,
      overcharge: baseInput.overcharge,
      selectedNpLevel: baseInput.npLevel,
      npMultipliers: damage.parametersByOvercharge[baseInput.overcharge - 1]!.map(
        (item) => item.valuePermille / 10,
      ) as [number, number, number, number, number],
    },
  };
}

export function compileExecutionPlan(
  baseInput: DamageResolutionInput,
  scenario: ResolvedScenario,
  master: MasterDataSnapshot,
): PreparedOrderedScenario {
  const attacker = master.servants.find((servant) => servant.id === baseInput.attackerId);
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
    const np = compileNpDamageOperation(
      baseInput,
      scenario,
      master,
      attacker,
      damage,
      compiledOperations.length,
    );
    compileProjections.push(...np.projections);
    compiledOperations.push(np.operation);
  }
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
  const operations = [...planOperationActivations(compiledOperations)]
    .sort(
      (left, right) => phaseOrder[left.phase] - phaseOrder[right.phase] || left.order - right.order,
    )
    .map((operation, order) => ({ ...operation, order }));
  const conditionByDecisionKey = new Map(
    operations.flatMap((operation) =>
      operation.decisionKey ? [[operation.decisionKey, operation.condition] as const] : [],
    ),
  );
  const targetConstraints = scenario.effectDecisions.flatMap((decision) => {
    const expression = conditionByDecisionKey.get(decision.decisionKey);
    return decision.operationEnabled &&
      decision.conditionSatisfaction === 'assumeSatisfied' &&
      expression
      ? [{ sourceKey: decision.decisionKey, expression }]
      : [];
  });
  const attackerClass = attacker?.classId ?? '';
  const attackerAttribute = servantAttribute(attacker?.traits ?? []);
  const targetResolution = resolveTargetCandidates({
    context: scenario.targetContext,
    attackerClass,
    attackerAttribute,
    domain: master.targetSemantics.execution,
    constraints: targetConstraints,
  });
  const inputDefinitions = new Map(
    operations.flatMap((operation) =>
      operation.inputDefinitions.map((definition) => [definition.key, definition] as const),
    ),
  );
  return {
    baseInput,
    scenario,
    attackerTraits: attacker?.traits ?? [],
    attackerPredicates: attacker?.predicates ?? [],
    damage,
    operations,
    compileProjections,
    sourceIssues: collected.issues,
    targetResolution,
    targetDomain: master.targetSemantics.execution,
    attackerClass,
    attackerAttribute,
    inputDefinitions: [...inputDefinitions.values()],
  };
}
