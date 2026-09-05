import type {
  CanonicalEffectRequirement,
  CanonicalInputDefinition,
  CanonicalTargetPolicy,
  MasterEffect,
  MasterSkill,
  ServantMaster,
} from '@fgo-lab/master-data';
import {
  canonicalRequirementLeaves,
  findActorForm,
  findNoblePhantasmVariant,
} from '@fgo-lab/master-data';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';
import type {
  PreNoblePhantasmState,
  PreparationExecutionContext,
  PreparationFailureCode,
} from './preparationContracts';
import {
  applyNpResourceTransaction,
  type NpResourceMutation,
  type NpResourceTransactionResult,
} from './npResource';
import { resolveTargetPolicy } from './effectRouting';
import type { Origin } from './effectRouting';
import { runtimeInputKey } from './runtimeInputIdentity';
import { resolveStochasticActivationOutcome } from './stochasticOutcomes';

interface PreparationInputSource {
  origin: Origin;
  sourceInstanceId: string;
  skillId: string;
}

function runtimeDefinition(
  source: PreparationInputSource,
  effect: MasterEffect,
  definition: CanonicalInputDefinition,
): CanonicalInputDefinition {
  return {
    ...definition,
    key: runtimeInputKey(
      source.origin,
      source.sourceInstanceId,
      source.skillId,
      effect.occurrenceId,
      definition.key,
    ),
  };
}

function transitionTargetsAttacker(recipient: CanonicalTargetPolicy): boolean {
  return resolveTargetPolicy('attacker', recipient) === 'attacker';
}

type PreparationRequirementOutcome =
  boolean | null | { status: 'inputRequired'; definition: CanonicalInputDefinition };

function resolvedPreparationInput(
  definition: CanonicalInputDefinition,
  context: PreparationExecutionContext,
): { status: 'resolved'; value: number } | { status: 'inputRequired' } {
  const value = context.canonicalInputValues?.[definition.key] ?? definition.defaultValue;
  return value === null ||
    !Number.isInteger(value) ||
    value < definition.minimum ||
    value > definition.maximum ||
    (value - definition.minimum) % definition.step !== 0
    ? { status: 'inputRequired' }
    : { status: 'resolved', value };
}

function preparationRequirementSatisfied(
  requirement: CanonicalEffectRequirement,
  command: PreNoblePhantasmCommand,
  effect: MasterEffect,
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  context: PreparationExecutionContext,
  inputSource: PreparationInputSource,
): PreparationRequirementOutcome {
  if (requirement.kind === 'always') return true;
  if (requirement.kind === 'choice')
    return command.kind === 'useSkillSlot' && command.choice !== null
      ? requirement.family === command.choice.groupKey &&
          requirement.candidate === command.choice.candidateKey
      : false;
  if (requirement.kind === 'all') {
    const results = requirement.requirements.map((member) =>
      preparationRequirementSatisfied(
        member,
        command,
        effect,
        servant,
        state,
        context,
        inputSource,
      ),
    );
    if (results.includes(false)) return false;
    const inputRequired = results.find(
      (result): result is Extract<PreparationRequirementOutcome, { status: 'inputRequired' }> =>
        typeof result === 'object' && result !== null,
    );
    if (inputRequired) return inputRequired;
    return results.every((result) => result === true) ? true : null;
  }
  if (requirement.kind === 'any') {
    const results = requirement.requirements.map((member) =>
      preparationRequirementSatisfied(
        member,
        command,
        effect,
        servant,
        state,
        context,
        inputSource,
      ),
    );
    if (results.includes(true)) return true;
    const inputRequired = results.find(
      (result): result is Extract<PreparationRequirementOutcome, { status: 'inputRequired' }> =>
        typeof result === 'object' && result !== null,
    );
    if (inputRequired) return inputRequired;
    return results.every((result) => result === false) ? false : null;
  }
  if (requirement.kind === 'not') {
    const result = preparationRequirementSatisfied(
      requirement.requirement,
      command,
      effect,
      servant,
      state,
      context,
      inputSource,
    );
    return result === null || typeof result === 'object' ? result : !result;
  }
  if (requirement.kind === 'operationTrigger')
    return effect.operationTrigger?.position === requirement.position;
  if (requirement.kind === 'card') {
    const variant = state.selectedNoblePhantasmVariant
      ? findNoblePhantasmVariant(servant, state.selectedNoblePhantasmVariant)
      : undefined;
    return variant?.kind === 'attack'
      ? (variant.card === requirement.card) === requirement.present
      : null;
  }
  if (requirement.kind === 'attackType')
    return (requirement.attack === 'noblePhantasm') === requirement.present;
  if (requirement.kind === 'trait') {
    if (requirement.scope === 'field' || requirement.scope.startsWith('opponent')) return null;
    const formTraits = new Set(findActorForm(servant, state.currentFormId)?.traits ?? []);
    const stateTraits = state.stateTraits.attackerState;
    const present =
      requirement.scope === 'recipientState'
        ? stateTraits.has(requirement.trait)
        : formTraits.has(requirement.trait) || stateTraits.has(requirement.trait);
    return present === requirement.present;
  }
  if (requirement.kind === 'quantity') {
    if (requirement.subjectId !== undefined) return null;
    const value =
      requirement.quantity === 'attackerHpPermille'
        ? context.attackerHpPermille
        : context.battlePointPhase;
    if (value === undefined || value === null) return null;
    return requirement.comparison === 'atLeast'
      ? value >= requirement.value
      : value <= requirement.value;
  }
  if (requirement.kind === 'inputQuantity') {
    const rawDefinition = effect.inputDefinitions.find(({ key }) => key === requirement.inputKey);
    if (!rawDefinition) return null;
    const definition = runtimeDefinition(inputSource, effect, rawDefinition);
    // The support check rejects these before evaluating preparation requirements. This
    // reducer does not represent every ordered writer that the damage executor supports.
    if (definition.kind === 'effectStackCount') return null;
    const resolved = resolvedPreparationInput(definition, context);
    if (resolved.status === 'inputRequired') {
      return {
        status: 'inputRequired',
        definition: { ...definition, defaultValue: null, defaultReason: null },
      };
    }
    const { value } = resolved;
    if (requirement.comparison === 'lessThan') return value < requirement.value;
    if (requirement.comparison === 'atMost') return value <= requirement.value;
    if (requirement.comparison === 'equal') return value === requirement.value;
    if (requirement.comparison === 'atLeast') return value >= requirement.value;
    return value > requirement.value;
  }
  // Source quantities and target predicates need a resolved scenario fact. TSK-06 owns
  // materializing those finite candidates; preparation must not assume them satisfied.
  return null;
}

function effectChangesStructure(effect: MasterEffect): boolean {
  return effect.execution.some((operation) => {
    if (operation.kind === 'transformActorForm' || operation.kind === 'selectNoblePhantasmVariant')
      return true;
    return (
      operation.kind === 'contextMutation' &&
      'scope' in operation &&
      operation.scope === 'recipientState' &&
      resolveTargetPolicy('attacker', operation.route.target) === 'attacker'
    );
  });
}

export function effectChangesPreparation(effect: MasterEffect): boolean {
  return (
    effect.execution.some(
      (operation) =>
        (operation.kind === 'resourceMutation' &&
          operation.resource === 'npGauge' &&
          transitionTargetsAttacker(operation.recipient)) ||
        (operation.kind === 'unsupported' &&
          operation.reason === 'dependentResourceAmount' &&
          resolveTargetPolicy('attacker', operation.route.target) === 'attacker'),
    ) || effectChangesStructure(effect)
  );
}

/** Exact initial stack assumptions are not a proof of their value at a preparation read. */
export function hasUnsupportedPreparationStackRequirement(effect: MasterEffect): boolean {
  if (!effect.inputDefinitions.some((definition) => definition.kind === 'effectStackCount'))
    return false;
  if (!effectChangesPreparation(effect)) return false;
  const stackKeys = new Set(
    effect.inputDefinitions
      .filter((definition) => definition.kind === 'effectStackCount')
      .map(({ key }) => key),
  );
  return (
    stackKeys.size > 0 &&
    canonicalRequirementLeaves(effect.requirement.expression).some(
      (requirement) => requirement.kind === 'inputQuantity' && stackKeys.has(requirement.inputKey),
    )
  );
}

function selectedTransitionAmount(
  effect: MasterEffect,
  valueSetIndex: number,
  valueIndex: number,
): NpResourceMutation | null {
  const unsupported = effect.execution.find(
    (operation): operation is Extract<MasterEffect['execution'][number], { kind: 'unsupported' }> =>
      operation.kind === 'unsupported' &&
      operation.reason === 'dependentResourceAmount' &&
      resolveTargetPolicy('attacker', operation.route.target) === 'attacker',
  );
  if (unsupported) return { kind: 'unsupported', family: unsupported.reason };
  const transition = effect.execution.find(
    (operation) =>
      operation.kind === 'resourceMutation' &&
      operation.resource === 'npGauge' &&
      transitionTargetsAttacker(operation.recipient),
  );
  if (!transition || transition.kind !== 'resourceMutation') return null;
  if (transition.amount.kind === 'dependent')
    return { kind: 'unsupported', family: transition.amount.reason };
  const amount = transition.amount.values[valueSetIndex]?.[valueIndex];
  if (amount === null || amount === undefined)
    return { kind: 'unsupported', family: 'missingCanonicalAmount' };
  return { kind: transition.direction, amount };
}

function resourceFailureCode(
  result: Extract<NpResourceTransactionResult, { status: 'rejected' }>,
): PreparationFailureCode {
  switch (result.code) {
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
    }
  | {
      status: 'rejected';
      code: PreparationFailureCode;
      requiredInput: CanonicalInputDefinition | null;
      requiredInputEffectOccurrenceId: string | null;
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
  const activation = new Map<MasterEffect, PreparationEffectActivation>();
  for (const effect of args.effects) {
    if (!effectChangesPreparation(effect)) continue;
    const stochastic = (() => {
      if (effect.proc.kind === 'guaranteed' && effect.selection?.kind !== 'stochasticOutcome')
        return { status: 'success' } as const;
      const inputDefinitions = effect.inputDefinitions.map((definition) =>
        runtimeDefinition(args.inputSource, effect, definition),
      );
      const values = Object.fromEntries(
        inputDefinitions.flatMap((definition) => {
          const resolved = resolvedPreparationInput(definition, args.context);
          return resolved.status === 'resolved' ? [[definition.key, resolved.value]] : [];
        }),
      );
      return resolveStochasticActivationOutcome(
        {
          operationId: `preparation:${effect.occurrenceId}`,
          proc: effect.proc,
          stochasticOutcome:
            effect.selection?.kind === 'stochasticOutcome' ? effect.selection.group : null,
          inputDefinitions,
        },
        {
          values,
          missingDefinitions: inputDefinitions
            .filter(
              (definition) =>
                definition.kind !== 'effectStackCount' && values[definition.key] === undefined,
            )
            .map((definition) =>
              definition.kind === 'effectStackCount'
                ? definition
                : { ...definition, defaultValue: null, defaultReason: null },
            ),
          invalidInputKeys: [],
        },
      );
    })();
    if (stochastic.status === 'failure') {
      activation.set(effect, { procOutcome: 'failure', conditionOutcome: null });
      continue;
    }
    if (stochastic.status === 'inputRequired') {
      const definition = effect.inputDefinitions
        .map((candidate) => runtimeDefinition(args.inputSource, effect, candidate))
        .find(({ key }) => key === stochastic.inputKey);
      return definition
        ? {
            status: 'rejected',
            code: 'preparationInputRequired',
            requiredInput: definition,
            requiredInputEffectOccurrenceId: effect.occurrenceId,
          }
        : {
            status: 'rejected',
            code: 'invalidPreparationActivation',
            requiredInput: null,
            requiredInputEffectOccurrenceId: null,
          };
    }
    if (stochastic.status === 'invalid')
      return {
        status: 'rejected',
        code: 'invalidPreparationActivation',
        requiredInput: null,
        requiredInputEffectOccurrenceId: null,
      };
    if (hasUnsupportedPreparationStackRequirement(effect))
      return {
        status: 'rejected',
        code: 'unsupportedPreparationStackQuantity',
        requiredInput: null,
        requiredInputEffectOccurrenceId: null,
      };
    const outcome = preparationRequirementSatisfied(
      effect.requirement.expression,
      args.command,
      effect,
      args.servant,
      args.state,
      args.context,
      args.inputSource,
    );
    const inputRequired = outcome !== null && typeof outcome === 'object';
    if (inputRequired)
      return {
        status: 'rejected',
        code: 'preparationInputRequired',
        requiredInput: outcome.definition,
        requiredInputEffectOccurrenceId: effect.occurrenceId,
      };
    if (outcome === null) {
      // A condition-dependent resource gain is not an execution precondition. Until TSK-06
      // materializes its scenario fact, retain the effect for the ordinary executor but do not
      // speculate that its preparation mutation happened. Structural ambiguity cannot be delayed.
      if (effectChangesStructure(effect))
        return {
          status: 'rejected',
          code: 'ambiguousPreparationCondition',
          requiredInput: null,
          requiredInputEffectOccurrenceId: null,
        };
      activation.set(effect, { procOutcome: 'success', conditionOutcome: null });
    } else
      activation.set(effect, {
        procOutcome: 'success',
        conditionOutcome: outcome,
      });
  }
  const preparationEffects = args.effects.filter((effect) => {
    const outcome = activation.get(effect);
    return outcome?.procOutcome !== 'failure' && outcome?.conditionOutcome === true;
  });
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
  const mutations: NpResourceMutation[] = [
    ...(args.consumeNoblePhantasm ? [{ kind: 'consumeAll' as const }] : []),
    ...preparationEffects.flatMap((effect) => {
      const mutation = selectedTransitionAmount(effect, args.valueSetIndex, args.valueIndex);
      return mutation ? [mutation] : [];
    }),
  ];
  const resource = applyNpResourceTransaction(
    args.context.resourceSemantics,
    args.state.npResource,
    {
      requirement,
      mutations,
    },
  );
  return resource.status === 'rejected'
    ? {
        status: 'rejected',
        code: resourceFailureCode(resource),
        requiredInput: null,
        requiredInputEffectOccurrenceId: null,
      }
    : { status: 'ready', resource, preparationEffects, activation };
}
