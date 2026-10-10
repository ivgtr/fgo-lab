import { liveTraitQuantityRead } from './stackQuantities';
import type { HpNpEvaluation } from './hpExecutionObservation';
import { hpRatio } from './hpResource';
import type { DamageResolutionInput } from '@fgo-lab/schema';
import type { BattleOperation, EffectDecision, ExecutableBattleState } from './contracts';
import type { ContributionApplicationPolicy } from './executionTypes';
import { contributionIsIncluded } from './effectiveContributions';
import { evaluateCondition } from './condition';
import { noblePhantasmDamageDependency } from './npDamageCompilation';
import {
  applyNpDamageOperationWithAudit,
  npBattlePointValue,
  type NpBattlePointRead,
  type ScalarNpDamageConsumption,
} from './npDamageOperation';
import {
  readTraitQuantity,
  projectBattleTraitPresence,
  type TraitQuantityRead,
} from './traitFactLayers';
import { proofIsGuaranteed, type ConditionRead } from './conditionRead';

export function applyNoblePhantasmDamage(
  input: DamageResolutionInput,
  operation: Extract<BattleOperation, { kind: 'executeNpDamage' }>,
  state: ExecutableBattleState,
  decisions: ReadonlyMap<string, EffectDecision>,
  contributionPolicy: ContributionApplicationPolicy = { kind: 'calculator' },
  observe?: (consumption: ScalarNpDamageConsumption) => void,
  observeHp?: (evaluation: HpNpEvaluation) => void,
  observeDependency?: (read: ConditionRead) => void,
  scalarBattlePointSubject?: string,
): DamageResolutionInput {
  const binding = operation.runtimeBinding?.source;
  const readState = {
    ...state,
    conditionReadClock: {
      ...state.conditionReadClock,
      phase: 'damageEvaluation' as const,
      operationId: operation.operationId,
      sourceInstanceId: operation.source.sourceInstanceId,
      occurrenceId: operation.source.effectOccurrenceId,
      ...(binding
        ? {
            actorFormId: binding.actorFormId,
            actionId: binding.actionId,
            valueSetIndex: binding.valueSetIndex,
            valueIndex: binding.valueIndex,
          }
        : {}),
    },
  };
  const traitQuantity = (
    actor: 'attacker' | 'target',
    layer: 'combined' | 'state',
    trait: string,
  ): TraitQuantityRead => {
    const scope = actor === 'attacker' ? 'attackerState' : 'targetState';
    if (operation.damage.kind === 'traitCount' && operation.damage.quantity.kind === 'stacks') {
      const definition = operation.damage.quantity.inputs.find(
        (input) => input.quantitySource.trait === trait && input.quantitySource.scope === scope,
      );
      if (!definition) return { value: null, support: [] };
      const read = liveTraitQuantityRead(state, definition.quantitySource);
      return { value: read.value === undefined ? null : read.value, support: read.support };
    }
    if (
      operation.damage.kind === 'traitCount' &&
      operation.damage.quantity.kind === 'finiteTraits'
    ) {
      const read = evaluateCondition(
        { kind: 'trait', scope: layer === 'state' ? scope : actor, trait, present: true },
        state,
      );
      return { value: read.truth === null ? null : Number(read.truth), support: read.support };
    }
    const applied = readTraitQuantity(state.traitFactLayers, scope, trait);
    if (layer === 'state') return applied;
    const intrinsic = readTraitQuantity(state.traitFactLayers, actor, trait);
    return {
      value:
        intrinsic.value === null || applied.value === null ? null : intrinsic.value + applied.value,
      support: [...intrinsic.support, ...applied.support],
    };
  };
  const dependencyState =
    scalarBattlePointSubject === undefined ? readState : { ...readState, scalarBattlePointSubject };
  let dependencyRead = evaluateCondition(operation.specialAttackDependency, dependencyState);
  let unknownQuantity = false;
  if (operation.damage.kind === 'traitCount' && operation.damage.quantity.kind === 'stacks') {
    const parameters = operation.damage.parametersByOvercharge[operation.overcharge - 1];
    if (!parameters) throw new TypeError('missing_np_quantity_cell');
    const actor = parameters[0].targetId === 1 ? 'target' : 'attacker';
    const reads = parameters.flatMap((parameter) =>
      (parameter.targetTraits ?? []).flatMap((trait) =>
        trait.kind === 'trait' ? [traitQuantity(actor, 'state', trait.name)] : [],
      ),
    );
    unknownQuantity = reads.some((read) => read.value === null);
    const support = [...dependencyRead.support, ...reads.flatMap((read) => read.support)];
    dependencyRead = unknownQuantity
      ? { ...dependencyRead, kind: 'inputRequired', truth: null, certainty: null, support }
      : dependencyRead.kind === 'known'
        ? {
            ...dependencyRead,
            support,
            certainty: support.every(proofIsGuaranteed) ? 'guaranteed' : 'possible',
          }
        : { ...dependencyRead, support };
  }
  const battlePointReads = new Map<number, NpBattlePointRead>();
  const battlePointPhase = (npLevel: number, subjectId: string): NpBattlePointRead => {
    const existing = battlePointReads.get(npLevel);
    if (existing) {
      npBattlePointValue(existing, subjectId);
      return existing;
    }
    const dependency =
      npLevel === operation.selectedNpLevel
        ? dependencyRead
        : evaluateCondition(
            noblePhantasmDamageDependency(operation.damage, operation.overcharge, npLevel),
            dependencyState,
          );
    const read = {
      dependency,
      included: contributionIsIncluded(operation, dependency, contributionPolicy),
    };
    battlePointReads.set(npLevel, read);
    return read;
  };
  let damageInput = input;
  if (operation.damage.kind === 'battlePointPhase') {
    const parameter =
      operation.damage.parametersByOvercharge[operation.overcharge - 1]?.[
        operation.selectedNpLevel - 1
      ];
    if (parameter?.targetId === undefined) throw new TypeError('missing_np_battle_point_domain');
    const subjectId = String(parameter.targetId);
    damageInput = {
      ...input,
      battlePointPhase: npBattlePointValue(
        battlePointPhase(operation.selectedNpLevel, subjectId),
        subjectId,
      ),
    };
  }
  observeDependency?.(dependencyRead);
  const specialCondition = evaluateCondition(operation.specialAttackCondition, readState).truth;
  const specialDecision = operation.specialAttackDecisionKey
    ? decisions.get(operation.specialAttackDecisionKey)
    : undefined;
  const effectLocalConditionSatisfied =
    specialDecision === undefined
      ? specialCondition === true
      : specialDecision.operationEnabled &&
        (specialCondition === true || specialDecision.conditionSatisfaction === 'assumeSatisfied');
  const specialIncluded = contributionIsIncluded(operation, dependencyRead, contributionPolicy);
  const specialContributionEnabled =
    (specialIncluded || unknownQuantity) &&
    specialDecision?.operationEnabled !== false &&
    (operation.damage.kind !== 'targetRarity' ||
      specialDecision !== undefined ||
      state.quantities.targetRarity !== null);
  return applyNpDamageOperationWithAudit(
    damageInput,
    operation.damage,
    {
      overcharge: operation.overcharge,
      selectedNpLevel: operation.selectedNpLevel,
      traitQuantity,
      targetTraits: projectBattleTraitPresence(state, 'target'),
      targetStateTraits: projectBattleTraitPresence(state, 'targetState'),
      targetPredicateValues: new Map(
        [...state.actorPredicates.target].map(([key, value]) => [key, value.present]),
      ),
      attackerHpRatio: state.hp ? hpRatio(state.hp.actors.attacker) : null,
      targetRarity: state.quantities.targetRarity,
      battlePointPhase,
      effectLocalConditionSatisfied: specialContributionEnabled && effectLocalConditionSatisfied,
      includeSpecialContribution: specialContributionEnabled,
    },
    observe,
    observeHp,
  );
}
