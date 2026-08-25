import type { NpDamageSpec } from '@fgo-lab/master-data';
import type { DamageResolutionInput } from '@fgo-lab/schema';

export interface NpDamageOperationContext {
  overcharge: number;
  attackerTraitCounts: Readonly<Record<string, number>>;
  targetTraitCounts: Readonly<Record<string, number>>;
  targetCombinedTraitCounts: Readonly<Record<string, number>>;
  targetStateTraitCounts: Readonly<Record<string, number>>;
  attackerHpPermille: number | null;
  targetRarity: number | null;
  battlePointPhase: number | null;
}

export type NpDamageOperationResult =
  | {
      status: 'resolved';
      npMultipliers: [number, number, number, number, number];
      npSpecialMultipliers: [number, number, number, number, number];
      ignoreDefense: boolean;
    }
  | { status: 'unsupported'; missingEvidence: string };

const one = (): [number, number, number, number, number] => [1, 1, 1, 1, 1];

function countTraits(
  counts: Readonly<Record<string, number>>,
  required: readonly { name: string }[],
): number {
  return required.reduce((sum, trait) => sum + Math.max(0, counts[trait.name] ?? 0), 0);
}

export function evaluateNpDamageOperation(
  damage: NpDamageSpec,
  context: NpDamageOperationContext,
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

  if (damage.kind === 'standard' || damage.kind === 'defensePiercing') return resolved();
  if (damage.kind === 'hpRatioLow') {
    if (context.attackerHpPermille === null)
      return { status: 'unsupported', missingEvidence: 'missing_attacker_hp_ratio' };
    const attackerHpPermille = context.attackerHpPermille;
    return resolved(
      parameters.map(
        (parameter) =>
          (parameter.valuePermille +
            Math.trunc(((1_000 - attackerHpPermille) * (parameter.targetId ?? 0)) / 1_000)) /
          10,
      ) as [number, number, number, number, number],
    );
  }
  if (damage.kind === 'battlePointPhase') {
    if (context.battlePointPhase === null)
      return { status: 'unsupported', missingEvidence: 'missing_battle_point_phase' };
    const battlePointPhase = Math.min(
      Math.max(context.battlePointPhase, 0),
      damage.maximumBattlePointPhase,
    );
    return resolved(
      baseMultipliers,
      parameters.map(
        (parameter) =>
          ((parameter.secondaryValuePermille ?? 1_000) +
            (parameter.correctionPermille ?? 0) * battlePointPhase) /
          1_000,
      ) as [number, number, number, number, number],
    );
  }
  if (damage.kind === 'targetRarity') {
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
        (parameter.andCheckTraits ?? []).every(
          (trait) => (context.targetTraitCounts[trait.name] ?? 0) > 0,
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
        parameter.targetTrait && (conditionCounts[parameter.targetTrait.name] ?? 0) > 0
          ? (parameter.correctionPermille ?? 1_000) / 1_000
          : 1,
      ) as [number, number, number, number, number],
    );

  const sourceCounts =
    parameters[0].targetId === 1 ? context.targetCombinedTraitCounts : context.attackerTraitCounts;
  return resolved(
    baseMultipliers,
    parameters.map((parameter) => {
      const count = countTraits(sourceCounts, parameter.targetTraits ?? []);
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
  const result = evaluateNpDamageOperation(damage, context);
  if (result.status === 'unsupported')
    return {
      ...input,
      damageFunction: {
        status: 'unsupported',
        kind: damage.kind,
        missingEvidence: result.missingEvidence,
      },
    };
  return {
    ...input,
    npMultipliers: result.npMultipliers,
    npSpecialMultipliers: result.npSpecialMultipliers,
    damageFunction: {
      status: 'resolved',
      kind: damage.kind,
      ignoreDefense: result.ignoreDefense,
    },
  };
}
