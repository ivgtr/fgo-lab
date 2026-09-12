import type { MasterEffect } from '@fgo-lab/master-data';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';
import {
  activationFactKey,
  analyzeActivationFactSet,
  type ActivationFact,
  type ActivationSourceRef,
} from '@fgo-lab/schema';
import {
  ocRelevantSourceIndexes,
  npProgramEffects,
  type OcResourceDependencyContext,
  classifyContributionCondition,
  compileEffectCondition,
} from '@fgo-lab/battle-execution';
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

export interface StaticRankingProgramDisposition {
  programKey: string;
  attackProfileKey: string;
  actionAdmissions: readonly CandidateLocalActionAdmission[];
}

function classifyPrograms(
  programs: readonly StaticRankingPreparationProgram[],
  conditions: Pick<RankingPolicyConditions, 'selfBuffs' | 'conditionalEffects'>,
  resources?: OcResourceDependencyContext,
) {
  return programs.map((program) => {
    const ocRelevant = ocRelevantSourceIndexes(
      program.sourceUses,
      program.terminalReadsOc ?? false,
      resources,
    );
    return {
      program,
      admissions: program.sourceUses.map((source, index): CandidateLocalActionAdmission =>
        actionIsStructural(program, index, programs)
          ? { kind: 'admitted', role: 'structuralRequired' }
          : optionalAdmission(
              { ...source, effects: npProgramEffects(source.effects) },
              conditions,
              program,
              ocRelevant.has(index),
            ),
      ),
    };
  });
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

function effectHasDamageContribution(effect: MasterEffect): boolean {
  return effect.execution.some((operation) =>
    ['damageModifier', 'modifierRateChange', 'ignoreDefense', 'ignoreDamageCut'].includes(
      operation.kind,
    ),
  );
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
  conditions: Pick<RankingPolicyConditions, 'selfBuffs' | 'conditionalEffects'>,
  program: StaticRankingPreparationProgram,
  ocRelevant: boolean,
): CandidateLocalActionAdmission {
  if (conditions.selfBuffs === 'excluded')
    return { kind: 'policyNoOp', proof: 'noEffectiveContributionUnderPolicy' };
  const unsupported = source.effects.map(unsupportedEffect).find((item) => item !== null);
  if (unsupported !== undefined) return unsupported;
  if (ocRelevant) return { kind: 'admitted', role: 'optional' };
  if (conditions.conditionalEffects === 'baseline') {
    const attackFacts = intrinsicFactsForSource(source, program);
    if (!attackFacts) return { kind: 'policyNoOp', proof: 'noEffectiveContributionUnderPolicy' };
    const contributes = source.effects.some(
      (effect) =>
        effect.proc.kind === 'guaranteed' &&
        requirementIsUnconditionalForAttack(effect, source, program, attackFacts) &&
        effectHasDamageContribution(effect),
    );
    return contributes
      ? { kind: 'admitted', role: 'optional' }
      : { kind: 'policyNoOp', proof: 'noEffectiveContributionUnderPolicy' };
  }
  const contributesOrMutates = source.effects.some(
    (effect) =>
      effectHasDamageContribution(effect) ||
      effect.execution.some(
        (operation) =>
          operation.kind === 'contextMutation' ||
          operation.kind === 'buffInstanceMutation' ||
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
  conditions: Pick<RankingPolicyConditions, 'selfBuffs' | 'conditionalEffects'>,
  resources?: OcResourceDependencyContext,
): {
  programs: readonly AdmittedStaticRankingPreparationProgram[];
  unsupportedAttackProfileKeys: ReadonlySet<string>;
} {
  const unsupportedAttackProfileKeys = new Set<string>();
  const classified = classifyPrograms(programs, conditions, resources);
  for (const { program, admissions } of classified) {
    if (admissions.some(({ kind }) => kind === 'unsupported'))
      unsupportedAttackProfileKeys.add(attackProfileKey(program.attackProfile));
  }
  return {
    programs: classified.flatMap(({ program, admissions }) =>
      admissions.every(({ kind }) => kind === 'admitted')
        ? [{ ...program, actionAdmissions: admissions }]
        : [],
    ),
    unsupportedAttackProfileKeys,
  };
}

export function compileCandidateLocalActionAdmissionDispositions(
  programs: readonly StaticRankingPreparationProgram[],
  conditions: Pick<RankingPolicyConditions, 'selfBuffs' | 'conditionalEffects'>,
  resources?: OcResourceDependencyContext,
): readonly StaticRankingProgramDisposition[] {
  return classifyPrograms(programs, conditions, resources).map(({ program, admissions }) => ({
    programKey: program.key,
    attackProfileKey: attackProfileKey(program.attackProfile),
    actionAdmissions: admissions,
  }));
}
