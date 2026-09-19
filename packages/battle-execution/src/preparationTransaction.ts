import { isHpOperation } from './preparationHp';
import { hpAlive } from './hpResource';
import { effectExecutesInNpProgram } from './npProgramScope';
import type { PreparationSourceResourceResult } from './preparationResourcePlan';
import type {
  CanonicalInputDefinition,
  CanonicalTargetPolicy,
  MasterEffect,
  MasterSkill,
  ServantMaster,
} from '@fgo-lab/master-data';
import { findNoblePhantasmVariant } from '@fgo-lab/master-data';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';
import type {
  PreNoblePhantasmState,
  PreparationExecutionContext,
  PreparationFailureCode,
} from './preparationContracts';
import { applyNpResourceTransaction, type NpResourceTransactionResult } from './npResource';
import { resolveTargetPolicy } from './effectRouting';
import type { Origin } from './effectRouting';
import { executePreparationOc, preparationEffectSource } from './preparationOc';
import { assemblePreparationActivationFacts } from './preparationEvidence';
import type { OcState, NpOcUseReceipt, OcActionOutcome } from './ocState';

interface PreparationInputSource {
  origin: Origin;
  sourceInstanceId: string;
  skillId: string;
}

function transitionTargetsAttacker(
  recipient: CanonicalTargetPolicy,
  origin: Origin = 'attacker',
): boolean {
  return resolveTargetPolicy(origin, recipient) === 'attacker';
}

function effectChangesStructure(effect: MasterEffect, origin: Origin = 'attacker'): boolean {
  if (!effectExecutesInNpProgram(effect)) return false;
  return effect.execution.some((operation) => {
    if (operation.kind === 'transformActorForm' || operation.kind === 'selectNoblePhantasmVariant')
      return true;
    if (
      operation.kind === 'buffInstanceMutation' ||
      operation.kind === 'populationMutation' ||
      operation.kind === 'populationFunction'
    )
      return true;
    return (
      operation.kind === 'contextMutation' &&
      'scope' in operation &&
      operation.scope === 'recipientState' &&
      resolveTargetPolicy(origin, operation.route.target) === 'attacker'
    );
  });
}

function effectChangesIdentity(effect: MasterEffect): boolean {
  if (!effectExecutesInNpProgram(effect)) return false;
  return effect.execution.some(
    (operation) =>
      operation.kind === 'transformActorForm' || operation.kind === 'selectNoblePhantasmVariant',
  );
}

export function effectRequiresPreparationDecision(
  effect: MasterEffect,
  origin: Origin = 'attacker',
): boolean {
  if (!effectExecutesInNpProgram(effect)) return false;
  return (
    effect.execution.some(
      (operation) =>
        (operation.kind === 'boundedPhaseIrrelevant' &&
          operation.proof === 'enemyChargeOutsideDamage') ||
        operation.kind === 'populationMutation' ||
        operation.kind === 'populationFunction' ||
        (operation.kind === 'buffInstanceMutation' && operation.marker !== undefined) ||
        isHpOperation(operation) ||
        (operation.kind === 'unsupported' && operation.reason === 'resourceExecutionSemantics') ||
        (operation.kind === 'resourceMutation' &&
          operation.resource === 'npGauge' &&
          (operation.amount.kind === 'npTransfer' ||
            transitionTargetsAttacker(operation.recipient, origin))) ||
        (operation.kind === 'unsupported' &&
          operation.reason === 'dependentResourceAmount' &&
          resolveTargetPolicy(origin, operation.route.target) === 'attacker'),
    ) || effectChangesIdentity(effect)
  );
}

export function effectChangesPreparation(
  effect: MasterEffect,
  origin: Origin = 'attacker',
): boolean {
  return (
    effectRequiresPreparationDecision(effect, origin) || effectChangesStructure(effect, origin)
  );
}

export function resourceFailureCode(
  result: Extract<PreparationSourceResourceResult, { status: 'rejected' }>,
): PreparationFailureCode {
  switch (result.code) {
    case 'ambiguousCondition':
      return 'ambiguousPreparationCondition';
    case 'invalidState':
      return 'invalidResourceState';
    case 'requirementExceedsCapacity':
      return 'resourceRequirementExceedsCapacity';
    case 'insufficientGauge':
      return 'insufficientNpGauge';
    case 'invalidMutation':
      return 'invalidResourceMutation';
    case 'unsupportedMutation':
      return 'unsupportedResourceMutation';
  }
}

export type PreparationResourcePlanResult =
  | {
      status: 'ready';
      resource: NpResourceTransactionResult & { status: 'applied' };
      preparationEffects: readonly MasterEffect[];
      activation: ReadonlyMap<MasterEffect, PreparationEffectActivation>;
      ocState: OcState;
      hp: PreNoblePhantasmState['hp'];
      populationEvents: PreNoblePhantasmState['populationEvents'];
      npTransfers: NonNullable<PreNoblePhantasmState['npTransfers']>;
      uncertainEnemyCharge: boolean;
      uncertainPlayerNp: boolean;
      buffInstances: PreNoblePhantasmState['buffInstances'];
      contextState: Pick<
        PreNoblePhantasmState,
        'stackCounts' | 'stateTraits' | 'initialTraitSuppressions'
      >;
      ocInputDefinitions: readonly CanonicalInputDefinition[];
      uncertainContextWrites: PreNoblePhantasmState['uncertainContextWrites'];
      ocUse: NpOcUseReceipt | null;
      ocOutcomes: readonly OcActionOutcome[];
    }
  | {
      status: 'rejected';
      code: PreparationFailureCode;
      requiredInput: CanonicalInputDefinition | null;
      requiredInputEffectOccurrenceId: string | null;
      recoveryInputDefinitions?: readonly CanonicalInputDefinition[];
    };

export interface PreparationEffectActivation {
  procOutcome: 'success' | 'failure' | null;
  conditionOutcome: boolean | null;
}

export function planPreparationResourceTransaction(args: {
  context: PreparationExecutionContext;
  servant: ServantMaster;
  state: PreNoblePhantasmState;
  command: PreNoblePhantasmCommand;
  skill: MasterSkill | null;
  effects: readonly MasterEffect[];
  valueSetIndex: number;
  valueIndex: number;
  consumeNoblePhantasm: boolean;
  inputSource: PreparationInputSource;
}): PreparationResourcePlanResult {
  if (args.consumeNoblePhantasm && hpAlive(args.state.hp?.actors.attacker) === false)
    return {
      status: 'rejected',
      code: 'attackerDead',
      requiredInput: null,
      requiredInputEffectOccurrenceId: null,
    };
  const requirement = args.skill?.resourceRequirement
    ? {
        kind: 'atLeast' as const,
        amount: args.skill.resourceRequirement.amountsBySkillLevel[args.valueIndex]!,
      }
    : args.consumeNoblePhantasm
      ? {
          kind: 'atLeast' as const,
          amount: args.context.resourceSemantics.noblePhantasmUse.requirement,
        }
      : null;
  const resourceStart = applyNpResourceTransaction(
    args.context.resourceSemantics,
    args.state.npResource,
    {
      requirement,
      mutations: args.consumeNoblePhantasm ? [{ kind: 'consumeAll' }] : [],
    },
  );
  if (resourceStart.status === 'rejected')
    return {
      status: 'rejected',
      code: resourceFailureCode(resourceStart),
      requiredInput: null,
      requiredInputEffectOccurrenceId: null,
    };
  const actionId = `preparation:${args.state.appliedActions.length}:${args.command.kind}`;
  const sourceId = args.skill?.id ?? args.state.selectedNoblePhantasmVariant?.noblePhantasmId;
  const actionFacts = sourceId
    ? assemblePreparationActivationFacts(
        args.servant,
        args.skill ? 'skill' : 'noblePhantasm',
        sourceId,
        args.state.currentFormId,
        args.effects,
      ).filter((fact) => fact.kind !== 'sourceQuantity')
    : [];
  if (args.command.kind === 'useSkillSlot' && args.command.choice)
    actionFacts.push({
      kind: 'choice',
      source: {
        origin: args.inputSource.origin,
        sourceInstanceId: args.inputSource.sourceInstanceId,
        skillId: args.inputSource.skillId,
      },
      family: args.command.choice.groupKey,
      candidate: args.command.choice.candidateKey,
    });
  const namedSource =
    args.skill ??
    (args.state.selectedNoblePhantasmVariant
      ? findNoblePhantasmVariant(args.servant, args.state.selectedNoblePhantasmVariant)
      : undefined);
  if (!namedSource) throw new TypeError('preparation_source_missing');
  const sources = args.effects.map((effect) =>
    preparationEffectSource({ ...args, effect, ...args.inputSource, skillName: namedSource.name }),
  );
  const oc = executePreparationOc({
    servant: args.servant,
    state: { ...args.state, npResource: resourceStart.state },
    context: args.context,
    actionId,
    terminalNp: args.command.kind === 'executeAttackNoblePhantasm',
    sources,
    activationFacts: actionFacts,
    npUse:
      resourceStart.baseOvercharge === null
        ? null
        : { gaugeBefore: args.state.npResource.gauge, baseOc: resourceStart.baseOvercharge },
  });
  if (oc.result.status !== 'committed')
    return {
      status: 'rejected',
      code: oc.resourceFailure
        ? resourceFailureCode(oc.resourceFailure)
        : oc.result.status === 'inputRequired'
          ? 'preparationInputRequired'
          : oc.result.status === 'invalid'
            ? oc.result.reason === 'invalidPreparationActivation'
              ? 'invalidPreparationActivation'
              : oc.result.reason === 'hpMutation'
                ? 'invalidHpExecution'
                : 'invalidOcExecution'
            : [
                  'unknownHpCondition',
                  'missingHpState',
                  'hpMutation',
                  'resourceExecutionSemantics',
                ].includes(oc.result.reason)
              ? 'unsupportedHpExecution'
              : 'unsupportedOcExecution',
      requiredInput: oc.requiredInput,
      requiredInputEffectOccurrenceId: oc.requiredInput ? oc.occurrenceId : null,
      ...(oc.recoveryInputDefinitions.length
        ? { recoveryInputDefinitions: oc.recoveryInputDefinitions }
        : {}),
    };
  if (args.consumeNoblePhantasm && hpAlive(oc.structuralState.hp?.actors.attacker) === false)
    return {
      status: 'rejected',
      code: 'attackerDead',
      requiredInput: null,
      requiredInputEffectOccurrenceId: null,
    };
  const ocUse = oc.result.state.receipts.find((receipt) => receipt.actionId === actionId) ?? null;
  const activation = oc.activation;
  for (const effect of args.effects) {
    if (!effectChangesPreparation(effect)) continue;
    const applied = activation.get(effect);
    if (applied?.procOutcome === 'failure') continue;
    if (applied?.conditionOutcome === null && effectChangesIdentity(effect))
      return {
        status: 'rejected',
        code: 'ambiguousPreparationCondition',
        requiredInput: null,
        requiredInputEffectOccurrenceId: null,
      };
  }
  const preparationEffects = args.effects.filter((effect) => {
    const outcome = activation.get(effect);
    return outcome?.procOutcome !== 'failure' && outcome?.conditionOutcome === true;
  });
  return {
    status: 'ready',
    resource: { ...resourceStart, state: oc.structuralState.npResource },
    preparationEffects,
    activation,
    ocState: oc.result.state,
    hp: oc.structuralState.hp,
    populationEvents: oc.structuralState.populationEvents,
    npTransfers: oc.structuralState.npTransfers ?? [],
    uncertainEnemyCharge: oc.structuralState.uncertainEnemyCharge ?? false,
    uncertainPlayerNp: oc.structuralState.uncertainPlayerNp ?? false,
    buffInstances: oc.structuralState.buffInstances,
    contextState: {
      stackCounts: oc.structuralState.stackCounts,
      stateTraits: oc.structuralState.stateTraits,
      initialTraitSuppressions: oc.structuralState.initialTraitSuppressions,
    },
    ocInputDefinitions: oc.inputDefinitions,
    uncertainContextWrites: oc.structuralState.uncertainContextWrites,
    ocUse,
    ocOutcomes: oc.result.outcomes,
  };
}
