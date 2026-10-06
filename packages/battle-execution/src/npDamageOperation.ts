import type { HpNpEvaluation } from './hpExecutionObservation';
import type { NpDamageSpec } from '@fgo-lab/master-data';
import type { DamageResolutionInput } from '@fgo-lab/schema';
import { targetPredicateKey } from './targetPredicate';
import type { TraitQuantityRead } from './traitFactLayers';
import type { ConditionRead } from './conditionRead';

export interface NpBattlePointRead {
  dependency: ConditionRead;
  included: boolean;
}

export function npBattlePointValue(read: NpBattlePointRead, subjectId: string): number | null {
  const evidence = read.dependency.evidence;
  if (
    evidence.length !== 1 ||
    evidence[0]!.expression.kind !== 'quantity' ||
    evidence[0]!.expression.quantity !== 'battlePointPhase' ||
    evidence[0]!.expression.subjectId !== subjectId
  )
    throw new TypeError('invalid_np_battle_point_read');
  const value = evidence[0]!.value;
  return typeof value === 'number' ? value : null;
}

export interface NpDamageOperationContext {
  overcharge: number;
  selectedNpLevel: number;
  traitQuantity: (
    actor: 'attacker' | 'target',
    layer: 'combined' | 'state',
    trait: string,
  ) => TraitQuantityRead;
  targetTraits: ReadonlyMap<string, boolean>;
  targetStateTraits: ReadonlyMap<string, boolean>;
  targetPredicateValues: ReadonlyMap<string, boolean>;
  attackerHpRatio: number | null;
  targetRarity: number | null;
  battlePointPhase: (npLevel: number, subjectId: string) => NpBattlePointRead;
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
  cells: readonly {
    npLevel: number;
    subjectId: string;
    read: NpBattlePointRead;
    value: number | null;
    consumedValue: number | null;
    disposition: 'consumed' | 'missing' | 'excluded';
  }[];
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
  readQuantity: (layer: 'combined' | 'state', trait: string) => TraitQuantityRead,
  stateTraitNames: ReadonlySet<string>,
  targetPredicateValues: ReadonlyMap<string, boolean>,
  required: readonly (
    | { kind: 'trait'; name: string }
    | {
        kind: 'targetPredicate';
        predicate: Parameters<typeof targetPredicateKey>[0];
      }
  )[],
): number | null {
  let total = 0;
  for (const trait of required) {
    if (trait.kind === 'targetPredicate') {
      const present = targetPredicateValues.get(targetPredicateKey(trait.predicate));
      if (present === undefined) return null;
      total += Number(present);
    } else {
      const read = readQuantity(stateTraitNames.has(trait.name) ? 'state' : 'combined', trait.name);
      if (read.value === null) return null;
      total += read.value;
    }
  }
  return total;
}

function hasTrait(
  trait:
    | { kind: 'trait'; name: string }
    | { kind: 'targetPredicate'; predicate: Parameters<typeof targetPredicateKey>[0] },
  presence: ReadonlyMap<string, boolean>,
  targetPredicateValues: ReadonlyMap<string, boolean>,
): boolean {
  return trait.kind === 'targetPredicate'
    ? targetPredicateValues.get(targetPredicateKey(trait.predicate)) === true
    : presence.get(trait.name) === true;
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
  if (context.includeSpecialContribution === false && damage.kind !== 'battlePointPhase') {
    const result = resolved(baseMultipliers, one());
    if (damage.kind === 'hpRatioLow')
      observeHp?.({ ratio: context.attackerHpRatio, disposition: 'excluded', evaluation: result });
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
    const cells = parameters.map((parameter, index) => {
      if (parameter.targetId === undefined) throw new TypeError('missing_np_battle_point_domain');
      const subjectId = String(parameter.targetId);
      const read = context.battlePointPhase(index + 1, subjectId);
      const value = npBattlePointValue(read, subjectId);
      const disposition =
        value === null
          ? ('missing' as const)
          : read.included
            ? ('consumed' as const)
            : ('excluded' as const);
      return {
        npLevel: index + 1,
        subjectId,
        read,
        value,
        disposition,
        consumedValue:
          disposition === 'consumed'
            ? Math.min(Math.max(value!, 0), damage.maximumBattlePointPhase)
            : null,
      };
    });
    const selected = cells[context.selectedNpLevel - 1];
    if (!selected) throw new TypeError('invalid_np_battle_point_cell');
    const result: NpDamageOperationResult = cells.some((cell) => cell.disposition === 'missing')
      ? { status: 'unsupported', missingEvidence: 'missing_battle_point_phase' }
      : resolved(
          baseMultipliers,
          parameters.map((parameter, index) => {
            const cell = cells[index]!;
            return cell.disposition === 'excluded'
              ? 1
              : ((parameter.secondaryValuePermille ?? 1_000) +
                  (parameter.correctionPermille ?? 0) * cell.consumedValue!) /
                  1_000;
          }) as [number, number, number, number, number],
        );
    observe?.({
      stateAddress: 'quantity:battlePointPhase',
      cells,
      value: selected.value,
      consumedValue: selected.consumedValue,
      disposition: selected.disposition,
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
          hasTrait(trait, context.targetTraits, context.targetPredicateValues),
        )
          ? (parameter.correctionPermille ?? 1_000) / 1_000
          : 1,
      ) as [number, number, number, number, number],
    );

  const conditionPresence =
    damage.kind === 'stateTrait' ? context.targetStateTraits : context.targetTraits;
  if (damage.kind === 'trait' || damage.kind === 'stateTrait')
    return resolved(
      baseMultipliers,
      parameters.map((parameter) =>
        context.effectLocalConditionSatisfied ||
        (parameter.targetTrait &&
          hasTrait(parameter.targetTrait, conditionPresence, context.targetPredicateValues))
          ? (parameter.correctionPermille ?? 1_000) / 1_000
          : 1,
      ) as [number, number, number, number, number],
    );

  const actor = parameters[0].targetId === 1 ? 'target' : 'attacker';
  const stateTraitNames = new Set(damage.stateTraitNames);
  const quantities = parameters.map((parameter) =>
    countTraits(
      (layer, trait) => context.traitQuantity(actor, layer, trait),
      stateTraitNames,
      context.targetPredicateValues,
      parameter.targetTraits ?? [],
    ),
  );
  if (quantities.some((count) => count === null))
    return { status: 'unsupported', missingEvidence: 'unknown_trait_quantity' };
  return resolved(
    baseMultipliers,
    parameters.map((parameter, index) => {
      const count = quantities[index]!;
      if (count === null) throw new TypeError('validated_trait_quantity_required');
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
