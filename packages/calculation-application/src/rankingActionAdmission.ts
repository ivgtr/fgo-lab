import type { MasterEffect } from '@fgo-lab/master-data';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';
import {
  activationFactKey,
  analyzeActivationFactSet,
  type ActivationFact,
  type ActivationSourceRef,
} from '@fgo-lab/schema';
import { classifyContributionCondition, compileEffectCondition } from '@fgo-lab/battle-execution';
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

function requirementIsUnconditionalForAttack(
  effect: MasterEffect,
  source: RankingPreparationSourceUse,
  program: StaticRankingPreparationProgram,
  attackFacts: Parameters<typeof classifyContributionCondition>[1],
): boolean {
  const origin = source.kind === 'skill' ? 'attacker' : 'np';
  const sourceInstanceId = `ranking-admission:${source.kind}`;
  const skillId =
    source.kind === 'skill' ? source.skill.id : `np:${source.noblePhantasmVariant.noblePhantasmId}`;
  const condition = compileEffectCondition(
    effect,
    origin,
    program.attackProfile.id.servantLineageId,
    sourceInstanceId,
    skillId,
  );
  return classifyContributionCondition(condition, attackFacts) === 'intrinsicSatisfied';
}

function intrinsicFactsForSource(
  source: RankingPreparationSourceUse,
  program: StaticRankingPreparationProgram,
): Parameters<typeof classifyContributionCondition>[1] | undefined {
  const origin = source.kind === 'skill' ? 'attacker' : 'np';
  const sourceInstanceId = `ranking-admission:${source.kind}`;
  const skillId =
    source.kind === 'skill' ? source.skill.id : `np:${source.noblePhantasmVariant.noblePhantasmId}`;
  const activationSource: ActivationSourceRef = { origin, sourceInstanceId, skillId };
  const facts = source.effects.flatMap<ActivationFact>((candidate) => [
    ...(candidate.selection?.kind === 'playerChoice'
      ? [
          {
            kind: 'choice' as const,
            source: activationSource,
            family: candidate.selection.group.key,
            candidate: candidate.selection.group.candidate,
          },
        ]
      : []),
    ...(candidate.operationTrigger
      ? [
          {
            kind: 'operationTrigger' as const,
            source: activationSource,
            position: candidate.operationTrigger.position,
          },
        ]
      : []),
  ]);
  const activation = analyzeActivationFactSet(
    [...new Map(facts.map((fact) => [activationFactKey(fact), fact])).values()].sort(
      (left, right) => activationFactKey(left).localeCompare(activationFactKey(right)),
    ),
  );
  if (activation.status !== 'valid') return undefined;
  return {
    card: program.attackProfile.cardType,
    noblePhantasmVariant: program.attackProfile.noblePhantasmVariant,
    attackerTraits: new Map(
      program.attackProfile.id.terminalActorFormProfileId.semantics.intrinsicTraits.map(
        (trait) => [trait, true] as const,
      ),
    ),
    activationFacts: activation.factSet,
  };
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
  program: StaticRankingPreparationProgram,
): CandidateLocalActionAdmission {
  if (conditions.selfBuffs === 'excluded')
    return { kind: 'policyNoOp', proof: 'noEffectiveContributionUnderPolicy' };
  if (conditions.conditionalEffects === 'baseline') {
    const attackFacts = intrinsicFactsForSource(source, program);
    if (!attackFacts) return { kind: 'policyNoOp', proof: 'noEffectiveContributionUnderPolicy' };
    const contributes = source.effects.some(
      (effect) =>
        requirementIsUnconditionalForAttack(effect, source, program, attackFacts) &&
        effectHasPositiveDamageContribution(effect),
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
        : optionalAdmission(source, conditions, program),
    );
    if (admissions.some(({ kind }) => kind === 'unsupported'))
      unsupportedAttackProfileKeys.add(attackProfileKey(program.attackProfile));
    return admissions.every(({ kind }) => kind === 'admitted')
      ? [{ ...program, actionAdmissions: admissions }]
      : [];
  });
  return { programs: admitted, unsupportedAttackProfileKeys };
}
