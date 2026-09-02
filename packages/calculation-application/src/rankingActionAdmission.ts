import type { MasterEffect } from '@fgo-lab/master-data';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';
import { attackProfileKey } from './attackProfile';
import type { RankingPolicyConditions } from './rankingContracts';
import type {
  RankingPreparationSourceUse,
  StaticRankingPreparationProgram,
} from './rankingStaticPreparation';

export type CandidateLocalActionAdmission =
  | { kind: 'admitted'; role: 'structuralRequired' | 'optional' }
  | { kind: 'policyNoOp'; proof: 'noEffectiveContributionUnderPolicy' }
  | { kind: 'unsupported'; reason: 'unresolvedOperation' | 'dependentResourceAmount' };

export interface AdmittedStaticRankingPreparationProgram extends StaticRankingPreparationProgram {
  actionAdmissions: readonly CandidateLocalActionAdmission[];
}

function commandKey(command: PreNoblePhantasmCommand): string {
  return JSON.stringify(command);
}

function preparationCommands(program: StaticRankingPreparationProgram) {
  return program.commands.filter(({ kind }) => kind !== 'executeAttackNoblePhantasm');
}

function isSubsequence(needle: readonly string[], haystack: readonly string[]): boolean {
  let index = 0;
  for (const item of haystack) if (item === needle[index]) index += 1;
  return index === needle.length;
}

function actionIsStructural(
  program: StaticRankingPreparationProgram,
  actionIndex: number,
  inventory: readonly StaticRankingPreparationProgram[],
): boolean {
  const current = preparationCommands(program).map(commandKey);
  const withoutAction = current.filter((_, index) => index !== actionIndex);
  return !inventory.some((candidate) => {
    if (candidate === program) return false;
    if (candidate.initialFormId.actorId !== program.initialFormId.actorId) return false;
    if (candidate.initialFormId.limitCount !== program.initialFormId.limitCount) return false;
    if (attackProfileKey(candidate.attackProfile) !== attackProfileKey(program.attackProfile))
      return false;
    return isSubsequence(preparationCommands(candidate).map(commandKey), withoutAction);
  });
}

function requirementIsUnconditional(effect: MasterEffect): boolean {
  return effect.requirement.expression.kind === 'always';
}

function effectHasPositiveDamageContribution(effect: MasterEffect): boolean {
  return effect.execution.some((operation) => {
    if (operation.kind === 'damageModifier') return operation.sign === 1;
    return (
      operation.kind === 'modifierRateChange' ||
      operation.kind === 'ignoreDefense' ||
      operation.kind === 'ignoreDamageCut'
    );
  });
}

function effectHasDamageContribution(effect: MasterEffect): boolean {
  return effect.execution.some((operation) =>
    ['damageModifier', 'modifierRateChange', 'ignoreDefense', 'ignoreDamageCut'].includes(
      operation.kind,
    ),
  );
}

function unsafeBaselineEffect(effect: MasterEffect): boolean {
  if (effect.proc.kind !== 'guaranteed') return true;
  return effect.execution.some((operation) => {
    if (operation.kind === 'unsupported') return true;
    if (operation.kind === 'damageModifier') return operation.sign === -1;
    if (operation.kind === 'resourceMutation')
      return operation.direction === 'loss' || operation.amount.kind === 'dependent';
    if (operation.kind === 'stateMutation')
      return operation.polarity === 'detrimental' || operation.polarity === 'unknown';
    if (operation.kind === 'contextMutation')
      return operation.mutation === 'removeTrait' || operation.mutation === 'suppressInitialTrait';
    return (
      operation.kind === 'transformActorForm' || operation.kind === 'selectNoblePhantasmVariant'
    );
  });
}

function unsupportedEffect(effect: MasterEffect): CandidateLocalActionAdmission | null {
  if (effect.execution.some((operation) => operation.kind === 'unsupported'))
    return { kind: 'unsupported', reason: 'unresolvedOperation' };
  if (
    effect.execution.some(
      (operation) => operation.kind === 'resourceMutation' && operation.amount.kind === 'dependent',
    )
  )
    return { kind: 'unsupported', reason: 'dependentResourceAmount' };
  return null;
}

function optionalAdmission(
  source: RankingPreparationSourceUse,
  conditions: RankingPolicyConditions,
): CandidateLocalActionAdmission {
  if (conditions.selfBuffs === 'excluded')
    return { kind: 'policyNoOp', proof: 'noEffectiveContributionUnderPolicy' };
  if (conditions.conditionalEffects === 'baseline') {
    const contributes = source.effects.some(
      (effect) => requirementIsUnconditional(effect) && effectHasPositiveDamageContribution(effect),
    );
    if (!contributes) return { kind: 'policyNoOp', proof: 'noEffectiveContributionUnderPolicy' };
    const safe = source.effects.every((effect) => !unsafeBaselineEffect(effect));
    return safe
      ? { kind: 'admitted', role: 'optional' }
      : { kind: 'policyNoOp', proof: 'noEffectiveContributionUnderPolicy' };
  }
  const unsupported = source.effects.map(unsupportedEffect).find((item) => item !== null);
  if (unsupported !== undefined) return unsupported;
  const contributesOrMutates = source.effects.some(
    (effect) =>
      effectHasDamageContribution(effect) ||
      effect.execution.some(
        (operation) =>
          operation.kind === 'contextMutation' ||
          operation.kind === 'stateMutation' ||
          operation.kind === 'resourceMutation',
      ),
  );
  return contributesOrMutates
    ? { kind: 'admitted', role: 'optional' }
    : { kind: 'policyNoOp', proof: 'noEffectiveContributionUnderPolicy' };
}

export function compileCandidateLocalActionAdmission(
  programs: readonly StaticRankingPreparationProgram[],
  conditions: RankingPolicyConditions,
): {
  programs: readonly AdmittedStaticRankingPreparationProgram[];
  unsupportedAttackProfileKeys: ReadonlySet<string>;
} {
  const unsupportedAttackProfileKeys = new Set<string>();
  const admitted = programs.flatMap((program) => {
    const admissions = program.sourceUses.map((source, index): CandidateLocalActionAdmission =>
      actionIsStructural(program, index, programs)
        ? { kind: 'admitted', role: 'structuralRequired' }
        : optionalAdmission(source, conditions),
    );
    if (admissions.some(({ kind }) => kind === 'unsupported'))
      unsupportedAttackProfileKeys.add(attackProfileKey(program.attackProfile));
    return admissions.every(({ kind }) => kind === 'admitted')
      ? [{ ...program, actionAdmissions: admissions }]
      : [];
  });
  return { programs: admitted, unsupportedAttackProfileKeys };
}
