import { defaultTargetClassRelation } from '@fgo-lab/calc-core';
import {
  noblePhantasmVariantKey,
  type AttackNoblePhantasmVariant,
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
): { operation: BattleOperation; projections: readonly EffectProjection[] } {
  const variantKey = noblePhantasmVariantKey(np.ref);
  const damageCondition = npCondition(damage, baseInput.overcharge);
  const specialAttackDecisionKey =
    damageCondition.kind === 'always' ? null : `np:${variantKey}:${damage.functionId}:condition`;
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
      operationId: `np:${variantKey}:${damage.functionId}:damage`,
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
      specialAttackCondition: damageCondition,
      specialAttackDecisionKey,
    },
  };
}
