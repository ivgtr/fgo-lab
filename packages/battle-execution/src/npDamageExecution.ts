import type { HpNpEvaluation } from './hpExecutionObservation';
import { hpRatio } from './hpResource';
import type { DamageResolutionInput } from '@fgo-lab/schema';
import type { BattleOperation, EffectDecision, ExecutableBattleState } from './contracts';
import type { ContributionApplicationPolicy } from './executionTypes';
import { contributionIsIncluded } from './effectiveContributions';
import { evaluateCondition } from './condition';
import {
  applyNpDamageOperationWithAudit,
  type ScalarNpDamageConsumption,
} from './npDamageOperation';
import { combinedTraitCounts } from './state';

export function applyNoblePhantasmDamage(
  input: DamageResolutionInput,
  operation: Extract<BattleOperation, { kind: 'executeNpDamage' }>,
  state: ExecutableBattleState,
  decisions: ReadonlyMap<string, EffectDecision>,
  contributionPolicy: ContributionApplicationPolicy = { kind: 'calculator' },
  observe?: (consumption: ScalarNpDamageConsumption) => void,
  observeHp?: (evaluation: HpNpEvaluation) => void,
): DamageResolutionInput {
  const specialCondition = evaluateCondition(operation.specialAttackCondition, state).truth;
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
    evaluateCondition(operation.specialAttackDependency, state),
    contributionPolicy,
  );
  const specialContributionEnabled =
    specialIncluded &&
    specialDecision?.operationEnabled !== false &&
    (operation.damage.kind !== 'targetRarity' ||
      specialDecision !== undefined ||
      state.quantities.targetRarity !== null);
  return applyNpDamageOperationWithAudit(
    input,
    operation.damage,
    {
      overcharge: operation.overcharge,
      selectedNpLevel: operation.selectedNpLevel,
      attackerTraitCounts: combinedTraitCounts(
        state.traitCounts.attacker,
        attackerStateTraitCounts,
      ),
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
      attackerHpRatio: state.hp ? hpRatio(state.hp.actors.attacker) : null,
      targetRarity: state.quantities.targetRarity,
      battlePointPhase: state.quantities.battlePointPhase,
      effectLocalConditionSatisfied: specialContributionEnabled && effectLocalConditionSatisfied,
      includeSpecialContribution: specialContributionEnabled,
    },
    observe,
    observeHp,
  );
}
