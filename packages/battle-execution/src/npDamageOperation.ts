import type { HpNpEvaluation } from './hpExecutionObservation';
import type { NpDamageSpec } from '@fgo-lab/master-data';
import type { DamageResolutionInput } from '@fgo-lab/schema';
import { targetPredicateKey } from './targetPredicate';

export interface NpDamageOperationContext {
  overcharge: number;
  selectedNpLevel: number;
  attackerTraitCounts: Readonly<Record<string, number>>;
  attackerStateTraitCounts: Readonly<Record<string, number>>;
  targetTraitCounts: Readonly<Record<string, number>>;
  targetCombinedTraitCounts: Readonly<Record<string, number>>;
  targetStateTraitCounts: Readonly<Record<string, number>>;
  targetPredicateValues: ReadonlyMap<string, boolean>;
  attackerHpRatio: number | null;
  targetRarity: number | null;
  battlePointPhase: number | null;
  effectLocalConditionSatisfied?: boolean;
  includeSpecialContribution?: boolean;
}

export type NpDamageOperationResult =
  | {
      status: 'resolved';
      npMultipliers: [number, number, number, number, number];
      npSpecialMultipliers: [number, number, number, number, number];
      ignoreDefense: boolean;
    }
  | { status: 'unsupported'; missingEvidence: string };

export interface ScalarNpDamageConsumption {
  stateAddress: 'quantity:battlePointPhase';
  value: number | null;
  consumedValue: number | null;
  disposition: 'consumed' | 'missing' | 'excluded';
  evaluation: NpDamageOperationResult;
  input: DamageResolutionInput;
}
type ScalarEvaluation = Omit<ScalarNpDamageConsumption, 'input'>;
type ScalarObserver = (consumption: ScalarNpDamageConsumption) => void;

const one = (): [number, number, number, number, number] => [1, 1, 1, 1, 1];

function countTraits(
  combinedCounts: Readonly<Record<string, number>>,
  stateCounts: Readonly<Record<string, number>>,
  stateTraitNames: ReadonlySet<string>,
  targetPredicateValues: ReadonlyMap<string, boolean>,
  required: readonly (
    | { kind: 'trait'; name: string }
    | {
        kind: 'targetPredicate';
        predicate: Parameters<typeof targetPredicateKey>[0];
      }
  )[],
): number {
  return required.reduce(
    (sum, trait) =>
      sum +
      (trait.kind === 'targetPredicate'
        ? targetPredicateValues.get(targetPredicateKey(trait.predicate)) === true
          ? 1
          : 0
        : Math.max(
            0,
            (stateTraitNames.has(trait.name) ? stateCounts : combinedCounts)[trait.name] ?? 0,
          )),
    0,
  );
}

function hasTrait(
  trait:
    | { kind: 'trait'; name: string }
    | { kind: 'targetPredicate'; predicate: Parameters<typeof targetPredicateKey>[0] },
  counts: Readonly<Record<string, number>>,
  targetPredicateValues: ReadonlyMap<string, boolean>,
): boolean {
  return trait.kind === 'targetPredicate'
    ? targetPredicateValues.get(targetPredicateKey(trait.predicate)) === true
    : (counts[trait.name] ?? 0) > 0;
}

export function evaluateNpDamageOperation(
  damage: NpDamageSpec,
  context: NpDamageOperationContext,
): NpDamageOperationResult {
  return evaluateNpDamageOperationInternal(damage, context);
}

function hpNpFailure(
  observe: ((evaluation: Omit<HpNpEvaluation, 'context' | 'input'>) => void) | undefined,
  ratio: number | null,
  missingEvidence: string,
  disposition: 'missing' | 'invalid',
): NpDamageOperationResult {
  const evaluation = { status: 'unsupported' as const, missingEvidence };
  observe?.({ ratio, disposition, evaluation });
  return evaluation;
}

function evaluateNpDamageOperationInternal(
  damage: NpDamageSpec,
  context: NpDamageOperationContext,
  observe?: (evaluation: ScalarEvaluation) => void,
  observeHp?: (evaluation: Omit<HpNpEvaluation, 'context' | 'input'>) => void,
): NpDamageOperationResult {
  const parameters = damage.parametersByOvercharge[context.overcharge - 1];
  if (!parameters) return { status: 'unsupported', missingEvidence: 'invalid_overcharge' };
  const baseMultipliers = parameters.map((parameter) => parameter.valuePermille / 10) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const resolved = (
    npMultipliers = baseMultipliers,
    npSpecialMultipliers = one(),
  ): NpDamageOperationResult => ({
    status: 'resolved',
    npMultipliers,
    npSpecialMultipliers,
    ignoreDefense: damage.kind === 'defensePiercing',
  });

  if (damage.kind === 'traitCount' && damage.quantity.kind === 'unsupported')
    return { status: 'unsupported', missingEvidence: damage.quantity.reason };
  if (context.includeSpecialContribution === false) {
    const result = resolved(baseMultipliers, one());
    if (damage.kind === 'hpRatioLow')
      observeHp?.({ ratio: context.attackerHpRatio, disposition: 'excluded', evaluation: result });
    if (observe && damage.kind === 'battlePointPhase')
      observe({
        stateAddress: 'quantity:battlePointPhase',
        value: context.battlePointPhase,
        consumedValue: null,
        disposition: 'excluded',
        evaluation: result,
      });
    return result;
  }

  if (damage.kind === 'standard' || damage.kind === 'defensePiercing') return resolved();
  if (damage.kind === 'hpRatioLow') {
    const ratio = context.attackerHpRatio;
    if (ratio === null)
      return hpNpFailure(observeHp, ratio, 'missing_attacker_hp_ratio', 'missing');
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1)
      return hpNpFailure(observeHp, ratio, 'invalid_attacker_hp_ratio', 'invalid');
    if (parameters.some((parameter) => parameter.targetId == null))
      return hpNpFailure(observeHp, ratio, 'missing_hp_ratio_coefficient', 'missing');
    const evaluation = resolved(
      parameters.map(
        (parameter) =>
          (parameter.valuePermille + Math.trunc((1 - ratio) * parameter.targetId!)) / 10,
      ) as [number, number, number, number, number],
    );
    observeHp?.({ ratio, disposition: 'consumed', evaluation });
    return evaluation;
  }
  if (damage.kind === 'battlePointPhase') {
    if (context.battlePointPhase === null) {
      const result = {
        status: 'unsupported' as const,
        missingEvidence: 'missing_battle_point_phase',
      };
      observe?.({
        stateAddress: 'quantity:battlePointPhase',
        value: null,
        consumedValue: null,
        disposition: 'missing',
        evaluation: result,
      });
      return result;
    }
    const battlePointPhase = Math.min(
      Math.max(context.battlePointPhase, 0),
      damage.maximumBattlePointPhase,
    );
    const result = resolved(
      baseMultipliers,
      parameters.map(
        (parameter) =>
          ((parameter.secondaryValuePermille ?? 1_000) +
            (parameter.correctionPermille ?? 0) * battlePointPhase) /
          1_000,
      ) as [number, number, number, number, number],
    );
    observe?.({
      stateAddress: 'quantity:battlePointPhase',
      value: context.battlePointPhase,
      consumedValue: battlePointPhase,
      disposition: 'consumed',
      evaluation: result,
    });
    return result;
  }
  if (damage.kind === 'targetRarity') {
    if (context.effectLocalConditionSatisfied && context.targetRarity === null) {
      const selected = parameters[context.selectedNpLevel - 1];
      if (!selected?.targetRarities?.length)
        return { status: 'unsupported', missingEvidence: 'missing_target_rarity_condition' };
      const witnesses = selected.targetRarities;
      const multipliers = parameters.map((parameter) => {
        const values = new Set(
          witnesses.map((rarity) =>
            parameter.targetRarities?.includes(rarity)
              ? (parameter.correctionPermille ?? 1_000) / 1_000
              : 1,
          ),
        );
        return values.size === 1 ? [...values][0] : null;
      });
      if (multipliers.includes(null))
        return { status: 'unsupported', missingEvidence: 'ambiguous_target_rarity' };
      return resolved(baseMultipliers, multipliers as [number, number, number, number, number]);
    }
    if (context.targetRarity === null)
      return { status: 'unsupported', missingEvidence: 'missing_target_rarity' };
    const targetRarity = context.targetRarity;
    return resolved(
      baseMultipliers,
      parameters.map((parameter) =>
        parameter.targetRarities?.includes(targetRarity)
          ? (parameter.correctionPermille ?? 1_000) / 1_000
          : 1,
      ) as [number, number, number, number, number],
    );
  }
  if (damage.kind === 'traitExpression')
    return resolved(
      baseMultipliers,
      parameters.map((parameter) =>
        context.effectLocalConditionSatisfied ||
        (parameter.andCheckTraits ?? []).every((trait) =>
          hasTrait(trait, context.targetTraitCounts, context.targetPredicateValues),
        )
          ? (parameter.correctionPermille ?? 1_000) / 1_000
          : 1,
      ) as [number, number, number, number, number],
    );

  const conditionCounts =
    damage.kind === 'stateTrait' ? context.targetStateTraitCounts : context.targetTraitCounts;
  if (damage.kind === 'trait' || damage.kind === 'stateTrait')
    return resolved(
      baseMultipliers,
      parameters.map((parameter) =>
        context.effectLocalConditionSatisfied ||
        (parameter.targetTrait &&
          hasTrait(parameter.targetTrait, conditionCounts, context.targetPredicateValues))
          ? (parameter.correctionPermille ?? 1_000) / 1_000
          : 1,
      ) as [number, number, number, number, number],
    );

  const sourceCounts =
    parameters[0].targetId === 1 ? context.targetCombinedTraitCounts : context.attackerTraitCounts;
  const sourceStateCounts =
    parameters[0].targetId === 1
      ? context.targetStateTraitCounts
      : context.attackerStateTraitCounts;
  const stateTraitNames = new Set(damage.stateTraitNames);
  return resolved(
    baseMultipliers,
    parameters.map((parameter) => {
      const count = countTraits(
        sourceCounts,
        sourceStateCounts,
        stateTraitNames,
        context.targetPredicateValues,
        parameter.targetTraits ?? [],
      );
      if (count === 0) return 1;
      const capped =
        parameter.maximumTargetCount && parameter.maximumTargetCount > 0
          ? Math.min(count, parameter.maximumTargetCount)
          : count;
      return (
        ((parameter.secondaryValuePermille ?? 1_000) +
          capped * (parameter.correctionPermille ?? 0)) /
        1_000
      );
    }) as [number, number, number, number, number],
  );
}

export function applyNpDamageOperation(
  input: DamageResolutionInput,
  damage: NpDamageSpec,
  context: NpDamageOperationContext,
): DamageResolutionInput {
  return npDamageInput(input, damage, evaluateNpDamageOperationInternal(damage, context));
}

/** Internal capture entry; evaluation and input construction execute exactly once. */
export function applyNpDamageOperationWithAudit(
  input: DamageResolutionInput,
  damage: NpDamageSpec,
  context: NpDamageOperationContext,
  observe?: ScalarObserver,
  observeHp?: (evaluation: HpNpEvaluation) => void,
): DamageResolutionInput {
  return observe || observeHp
    ? captureNpDamageOperation(input, damage, context, observe, observeHp)
    : applyNpDamageOperation(input, damage, context);
}

function captureNpDamageOperation(
  input: DamageResolutionInput,
  damage: NpDamageSpec,
  context: NpDamageOperationContext,
  observe: ScalarObserver | undefined,
  observeHp?: (evaluation: HpNpEvaluation) => void,
): DamageResolutionInput {
  let scalar: ScalarEvaluation | undefined;
  let hp: Omit<HpNpEvaluation, 'context' | 'input'> | undefined;
  const result = evaluateNpDamageOperationInternal(
    damage,
    context,
    (value) => {
      scalar = value;
    },
    observeHp
      ? (value) => {
          hp = value;
        }
      : undefined,
  );
  const output = npDamageInput(input, damage, result);
  if (scalar) observe?.({ ...scalar, input: output });
  if (hp) observeHp?.({ ...hp, context, input: output });
  return output;
}

function npDamageInput(
  input: DamageResolutionInput,
  damage: NpDamageSpec,
  result: NpDamageOperationResult,
): DamageResolutionInput {
  const output: DamageResolutionInput =
    result.status === 'unsupported'
      ? {
          ...input,
          damageFunction: {
            status: 'unsupported',
            kind: damage.kind,
            missingEvidence: result.missingEvidence,
          },
        }
      : {
          ...input,
          npMultipliers: result.npMultipliers,
          npSpecialMultipliers: result.npSpecialMultipliers,
          damageFunction: {
            status: 'resolved',
            kind: damage.kind,
            ignoreDefense: result.ignoreDefense,
          },
        };
  return output;
}
