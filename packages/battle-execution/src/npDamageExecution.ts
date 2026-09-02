import type { DamageResolutionInput } from '@fgo-lab/schema';
import type { BattleOperation, EffectDecision, ExecutableBattleState } from './contracts';
import type { ContributionApplicationPolicy } from './executionTypes';
import { contributionIsIncluded } from './effectiveContributions';
import { evaluateCondition } from './condition';
import { applyNpDamageOperation } from './npDamageOperation';
import { combinedTraitCounts } from './state';

export function applyNoblePhantasmDamage(
  input: DamageResolutionInput,
  operation: Extract<BattleOperation, { kind: 'executeNpDamage' }>,
  state: ExecutableBattleState,
  decisions: ReadonlyMap<string, EffectDecision>,
  contributionPolicy: ContributionApplicationPolicy = { kind: 'calculator' },
): DamageResolutionInput {
  const specialCondition = evaluateCondition(operation.specialAttackCondition, state);
  const specialDecision = operation.specialAttackDecisionKey
    ? decisions.get(operation.specialAttackDecisionKey)
    : undefined;
  const effectLocalConditionSatisfied =
    specialDecision === undefined
      ? specialCondition === true
      : specialDecision.operationEnabled &&
        (specialCondition === true || specialDecision.conditionSatisfaction === 'assumeSatisfied');
  const attackerStateTraitCounts = state.traitCounts.attackerState;
  const targetStateTraitCounts = state.traitCounts.targetState;
  const specialIncluded = contributionIsIncluded(
    operation,
    operation.specialAttackCondition,
    contributionPolicy,
  );
  return applyNpDamageOperation(input, operation.damage, {
    overcharge: operation.overcharge,
    attackerTraitCounts: combinedTraitCounts(state.traitCounts.attacker, attackerStateTraitCounts),
    attackerStateTraitCounts,
    targetTraitCounts: state.traitCounts.target,
    targetCombinedTraitCounts: combinedTraitCounts(
      state.traitCounts.target,
      targetStateTraitCounts,
    ),
    targetStateTraitCounts,
    targetPredicateValues: new Map(
      [...state.actorPredicates.target].map(([key, value]) => [key, value.present]),
    ),
    attackerHpPermille: state.quantities.attackerHpPermille,
    targetRarity: state.quantities.targetRarity,
    battlePointPhase: state.quantities.battlePointPhase,
    effectLocalConditionSatisfied: specialIncluded && effectLocalConditionSatisfied,
    includeSpecialContribution: specialIncluded,
  });
}
