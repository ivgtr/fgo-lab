import { noblePhantasmVariantKey, type MasterEffect } from '@fgo-lab/master-data';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';
import {
  ocRelevantSourceIndexes,
  markerRelevantSourceIndexes,
  hpRelevantSourceIndexes,
  npProgramEffects,
  compileEffectCondition,
  type CardType,
  type ConditionExpression,
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
              program,
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

/** Only an immutable card can prove a card requirement false before source execution. */
function invariantCard(program: StaticRankingPreparationProgram): CardType | null {
  if (
    program.initialFormId.actorId !== program.expectedTerminalFormId.actorId ||
    program.initialFormId.limitCount !== program.expectedTerminalFormId.limitCount ||
    program.initialNoblePhantasmVariant === null ||
    noblePhantasmVariantKey(program.initialNoblePhantasmVariant) !==
      noblePhantasmVariantKey(program.attackProfile.noblePhantasmVariant) ||
    program.sourceUses.some((source) =>
      source.effects.some((effect) =>
        effect.execution.some(
          (operation) =>
            operation.kind === 'selectNoblePhantasmVariant' ||
            operation.kind === 'transformActorForm',
        ),
      ),
    )
  )
    return null;
  return program.attackProfile.cardType;
}

function invariantCardTruth(condition: ConditionExpression, card: CardType): boolean | null {
  if (condition.kind === 'always') return true;
  if (condition.kind === 'card') return condition.card === card;
  if (condition.kind === 'not') {
    const inner = invariantCardTruth(condition.expression, card);
    return inner === null ? null : !inner;
  }
  if (condition.kind === 'all' || condition.kind === 'any') {
    const members = condition.expressions.map((member) => invariantCardTruth(member, card));
    if (condition.kind === 'all')
      return members.includes(false)
        ? false
        : members.every((member) => member === true)
          ? true
          : null;
    return members.includes(true)
      ? true
      : members.every((member) => member === false)
        ? false
        : null;
  }
  return null;
}

function contributionMayApply(
  effect: MasterEffect,
  source: RankingPreparationSourceUse,
  program: StaticRankingPreparationProgram,
): boolean {
  if (!effectHasDamageContribution(effect)) return false;
  const card = invariantCard(program);
  if (card === null) return true;
  const origin = source.kind === 'skill' ? 'attacker' : 'np';
  const condition = compileEffectCondition(
    effect,
    origin,
    program.attackProfile.id.servantLineageId,
    `ranking-admission:${source.kind}`,
    source.kind === 'skill' ? source.skill.id : `np:${source.noblePhantasmVariant.noblePhantasmId}`,
  );
  return invariantCardTruth(condition, card) !== false;
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
  program: StaticRankingPreparationProgram,
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
      contributionMayApply(effect, source, program) ||
      effect.execution.some(
        (operation) =>
          operation.kind === 'contextMutation' ||
          operation.kind === 'buffInstanceMutation' ||
          operation.kind === 'stateMutation' ||
          (operation.kind === 'resourceMutation' &&
            operation.resource !== 'hp' &&
            operation.resource !== 'battlePoint'),
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
