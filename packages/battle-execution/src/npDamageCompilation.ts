import { defaultTargetClassRelation } from '@fgo-lab/calc-core';
import {
  noblePhantasmVariantKey,
  type AttackNoblePhantasmVariant,
  type CombatRules,
  type NpDamageSpec,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { DamageResolutionInput } from '@fgo-lab/schema';
import type {
  BattleOperation,
  ConditionExpression,
  EffectProjection,
  OperationSource,
} from './contracts';
import type { ResolvedScenario } from './executionTypes';
import { traitCountProjections } from './projection';

export function noblePhantasmDamageCondition(
  damage: NpDamageSpec,
  overcharge: number,
  npLevel = 1,
): ConditionExpression {
  const item = damage.parametersByOvercharge[overcharge - 1]?.[npLevel - 1];
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
          : {
              kind: 'trait',
              scope: damage.stateTraitNames.includes(trait.name) ? 'targetState' : 'target',
              trait: trait.name,
              present: true,
            },
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

export function noblePhantasmDamageDependency(
  damage: NpDamageSpec,
  overcharge: number,
  npLevel = 1,
): ConditionExpression {
  const item = damage.parametersByOvercharge[overcharge - 1]?.[npLevel - 1];
  if (!item) return { kind: 'always' };
  if (damage.kind === 'hpRatioLow')
    return {
      kind: 'quantity',
      quantity: 'attackerHpPermille',
      comparison: 'lessThan',
      value: 1_000,
    };
  if (damage.kind === 'battlePointPhase') {
    if (item.targetId === undefined) throw new TypeError('missing_np_battle_point_domain');
    return {
      kind: 'quantity',
      quantity: 'battlePointPhase',
      subjectId: String(item.targetId),
      comparison: 'atLeast',
      value: 0,
    };
  }
  if (damage.kind === 'traitCount' && damage.quantity.kind === 'stacks')
    return {
      kind: 'any',
      expressions: damage.quantity.inputs.map((input) => ({
        kind: 'inputQuantity',
        inputKey: input.key,
        comparison: 'atLeast',
        value: 1,
      })),
    };
  if (damage.kind === 'traitCount') {
    const scope = item.targetId === 1 ? 'target' : 'attacker';
    return {
      kind: 'any',
      expressions: (item.targetTraits ?? []).map((trait): ConditionExpression =>
        trait.kind === 'targetPredicate'
          ? { kind: 'targetPredicate', scope, predicate: trait.predicate, present: true }
          : {
              kind: 'traitCount',
              scope: damage.stateTraitNames.includes(trait.name)
                ? scope === 'target'
                  ? 'targetState'
                  : 'attackerState'
                : scope,
              traits: [trait.name],
              comparison: 'atLeast',
              count: 1,
            },
      ),
    };
  }
  return noblePhantasmDamageCondition(damage, overcharge, npLevel);
}

function targetPredicateSelected(
  scenario: ResolvedScenario,
  target: Extract<ConditionExpression, { kind: 'targetPredicate' }>['predicate'],
): boolean {
  if (target.kind === 'classIdentity')
    return (
      scenario.targetContext.class.kind === 'concrete' &&
      scenario.targetContext.class.classId === target.classId
    );
  if (target.kind === 'attributeIdentity')
    return (
      scenario.targetContext.attribute.kind === 'concrete' &&
      scenario.targetContext.attribute.attribute === target.attribute
    );
  return scenario.targetContext.families.some(({ familyId }) => familyId === target.familyId);
}

export function compileNoblePhantasmDamageOperation(
  baseInput: DamageResolutionInput,
  scenario: ResolvedScenario,
  attacker: ServantMaster,
  np: AttackNoblePhantasmVariant,
  damage: NpDamageSpec,
  operationOrder: number,
  combatRules?: CombatRules,
): { operation: BattleOperation; projections: readonly EffectProjection[] } {
  const variantKey = noblePhantasmVariantKey(np.ref);
  const damageCondition = noblePhantasmDamageCondition(
    damage,
    baseInput.overcharge,
    baseInput.npLevel,
  );
  const damageDependency = noblePhantasmDamageDependency(
    damage,
    baseInput.overcharge,
    baseInput.npLevel,
  );
  const specialAttackDecisionKey =
    damageCondition.kind === 'always' ? null : `np:${variantKey}:${damage.functionId}:condition`;
  const operationId = `np:${variantKey}:${damage.functionId}:damage`;
  const source: OperationSource = {
    origin: 'np',
    sourceInstanceId: `np:${variantKey}`,
    sourceId: attacker.id,
    skillId: `np:${variantKey}`,
    effectId: damage.functionId,
    effectOccurrenceId: `damage:${damage.functionId}`,
  };
  const projections = traitCountProjections(
    variantKey,
    operationId,
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
    const enabled = targetPredicateSelected(scenario, target);
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
                relation: defaultTargetClassRelation(attacker.classId, combatRules),
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
      sourceActivation: { kind: 'unread' },
      operationId,
      order: operationOrder,
      phase: 'npDamage',
      source,
      contributionScope: 'personal',
      condition: { kind: 'noblePhantasmVariant', variant: np.ref },
      decisionKey: null,
      decisionPlan: { activation: 'automatic', condition: 'evaluate' },
      sourceEnabled: true,
      enabledByDefault: true,
      gameActivation: 'npBeforeDamage',
      proc: { kind: 'guaranteed' },
      stochasticOutcome: null,
      procRatePermille: 1_000,
      activation: { kind: 'sourceDefault' },
      evidence: { rawPath: damage.rawPath, functionId: damage.functionId },
      presentation: {
        label: damage.kind === 'targetRarity' ? 'レアリティ特攻宝具' : '特攻宝具',
        sourceName: attacker.name,
        skillName: np.name,
      },
      inputDefinitions:
        damage.kind === 'traitCount' && damage.quantity.kind === 'stacks'
          ? damage.quantity.inputs
          : [],
      kind: 'executeNpDamage',
      damage,
      overcharge: baseInput.overcharge,
      selectedNpLevel: baseInput.npLevel,
      npMultipliers: damage.parametersByOvercharge[baseInput.overcharge - 1]!.map(
        (item) => item.valuePermille / 10,
      ) as [number, number, number, number, number],
      specialAttackCondition: damageCondition,
      specialAttackDependency: damageDependency,
      specialAttackDecisionKey,
    },
  };
}
