import type { MasterEffect } from '@fgo-lab/master-data';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';
import {
  ocRelevantSourceIndexes,
  markerRelevantSourceIndexes,
  hpRelevantSourceIndexes,
  npProgramEffects,
  type OcResourceDependencyContext,
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
    const hpRelevant = hpRelevantSourceIndexes(
      program.sourceUses,
      program.terminalHpReaders ?? [],
      resources?.automaticEffects,
    );
    const markerRelevant = markerRelevantSourceIndexes(
      program.sourceUses,
      program.terminalMarkerReads ?? [],
      resources?.automaticEffects,
    );
    const battlePointRelevant = new Set(
      program.sourceUses.flatMap((source, index) =>
        source.effects.some((effect) =>
          effect.execution.some(
            (operation) =>
              (operation.kind === 'resourceMutation' &&
                operation.resource === 'battlePoint' &&
                operation.subjectId !== null &&
                (program.terminalBattlePointDomainIds ?? []).includes(operation.subjectId)) ||
              (operation.kind === 'battlePointCapacityModifier' &&
                (program.terminalBattlePointDomainIds ?? []).includes(operation.subjectId)),
          ),
        )
          ? [index]
          : [],
      ),
    );
    return {
      program,
      admissions: program.sourceUses.map((source, index): CandidateLocalActionAdmission =>
        actionIsStructural(program, index, programs)
          ? { kind: 'admitted', role: 'structuralRequired' }
          : optionalAdmission(
              { ...source, effects: npProgramEffects(source.effects) },
              conditions,
              ocRelevant.has(index) ||
                hpRelevant.has(index) ||
                markerRelevant.has(index) ||
                battlePointRelevant.has(index),
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

function effectHasDamageContribution(effect: MasterEffect): boolean {
  return effect.execution.some((operation) =>
    ['damageModifier', 'modifierRateChange', 'ignoreDefense', 'ignoreDamageCut'].includes(
      operation.kind,
    ),
  );
}

function unsupportedEffect(effect: MasterEffect): CandidateLocalActionAdmission | null {
  if (
    effect.execution.some(
      (operation) => operation.kind === 'unsupported' && operation.damageRelevant,
    )
  )
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
  resourceRelevant: boolean,
): CandidateLocalActionAdmission {
  if (conditions.selfBuffs === 'excluded')
    return { kind: 'policyNoOp', proof: 'noEffectiveContributionUnderPolicy' };
  const unsupported = source.effects.map(unsupportedEffect).find((item) => item !== null);
  if (unsupported !== undefined) return unsupported;
  if (resourceRelevant) return { kind: 'admitted', role: 'optional' };
  // Admission preserves the finite action universe. The common executor owns condition
  // truth, certainty and resource legality at each read; terminal traits cannot prove a use.
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
