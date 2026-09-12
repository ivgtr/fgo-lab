import {
  applyPopulationFunctionToState,
  removePopulationFunctionState,
} from './populationFunctions';
import { isBuffCountInput, projectBuffInstanceCounts } from './buffInstances';
import { populationInputIssue } from './populationCounts';
import { resolveResourceTargetPolicy } from './effectRouting';
import { effectExecutesInNpProgram } from './npProgramScope';
import { applyBuffInstanceMutation } from './buffInstances';
import { servantBuffCountInputs } from './stackQuantities';
import { requiredOcConditionInput } from './ocConditionInputs';
import {
  closePreparationConditionReads,
  closeUncertainPreparationWrites,
  uncertainPreparationWrites,
} from './preparationContextWrites';
import { sourceHpInputKey } from './operationCompiler';
import {
  findActorForm,
  type CanonicalInputDefinition,
  type MasterEffect,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { ActivationFact } from '@fgo-lab/schema';
import type { PreparationExecutionContext, PreNoblePhantasmState } from './preparationContracts';
import { preparationConditionState, preparationSourceConditionState } from './preparationFacts';
import { compileOcSourceProgram } from './ocSourceProgram';
import { bindOcSourceOperation, ocSourceOperationKey } from './ocSourceBinding';
import { executeOcAction, hasOcHpWrite, type OcActionStep, type OcActionOutcome } from './ocState';
import type { SourceEffect } from './sourceCollection';
import { resolvePreparationStructuralOutcome } from './preparationState';
import type { ConditionEvaluationState } from './condition';
import { resolvePreparationSourceFacts } from './preparationSourceFacts';
import {
  applyPreparationNpOperation,
  isPreparationNpOperation,
  type PreparationSourceResourceResult,
} from './preparationResourcePlan';
import {
  effectRequiresPreparationDecision,
  type PreparationEffectActivation,
} from './preparationTransaction';

export function preparationEffectSource(args: {
  servant: ServantMaster;
  state: PreNoblePhantasmState;
  effect: MasterEffect;
  origin: SourceEffect['origin'];
  sourceInstanceId: string;
  skillId: string;
  skillName: string;
  valueSetIndex: number;
  valueIndex: number;
}): SourceEffect {
  return {
    phase: args.origin === 'np' ? 'preparationNoblePhantasm' : 'attackerSkill',
    origin: args.origin,
    sourceInstanceId: args.sourceInstanceId,
    sourceId: args.servant.id,
    sourceName: args.servant.name,
    sourceTraits: findActorForm(args.servant, args.state.currentFormId)?.traits ?? [],
    skillId: args.skillId,
    skillName: args.skillName,
    effect: args.effect,
    valueSetIndex: args.valueSetIndex,
    valueIndex: args.valueIndex,
    limitBreak: false,
    sourceEnabled: true,
    enabledByDefault: true,
    noblePhantasmVariant: args.origin === 'np' ? args.state.selectedNoblePhantasmVariant : null,
    preparationStochasticOutcome: null,
  };
}

export function executePreparationOc(args: {
  servant: ServantMaster;
  state: PreNoblePhantasmState;
  context: PreparationExecutionContext;
  actionId: string;
  sources: readonly SourceEffect[];
  activationFacts: readonly ActivationFact[];
  npUse: { gaugeBefore: number; baseOc: number } | null;
  activateFormKey?: string;
  terminalNp?: boolean;
}) {
  const buffInputs = [
    ...servantBuffCountInputs(args.servant),
    ...[
      ...(args.context.initialSources ?? []),
      ...(args.context.terminalSources ?? []),
      ...args.sources,
    ]
      .flatMap((source) => source.effect.inputDefinitions)
      .filter(isBuffCountInput),
  ];
  const readsBuffMutation = (
    operation: Extract<MasterEffect['execution'][number], { kind: 'buffInstanceMutation' }>,
  ) =>
    buffInputs.some((input) =>
      input.instanceTraits.some((trait) => operation.traits.includes(trait)),
    );
  let current = args.state;
  let factsState: PreNoblePhantasmState | null = null;
  let sharedFacts: ConditionEvaluationState | null = null;
  const currentFacts = () => {
    if (factsState !== current) {
      sharedFacts = preparationConditionState(
        args.servant,
        current,
        args.context,
        args.activationFacts,
      );
      factsState = current;
    }
    return sharedFacts;
  };
  const inputDefinitions = new Map(
    args.state.ocInputDefinitions.map((definition) => [definition.key, definition]),
  );
  let requiredInput: CanonicalInputDefinition | null = null;
  const resourceOutcome: {
    failure: Extract<PreparationSourceResourceResult, { status: 'rejected' }> | null;
  } = { failure: null };
  let occurrenceId: string | null = null;
  const sourceFacts = new Map<MasterEffect, ConditionEvaluationState>();
  const missingSourceConditions = new Map<MasterEffect, CanonicalInputDefinition>();
  const activation = new Map<MasterEffect, PreparationEffectActivation>();
  const effectSteps = new Map<number, MasterEffect>();
  const steps: (
    | OcActionStep
    | ((
        state: PreNoblePhantasmState['ocState'],
        outcomes: readonly OcActionOutcome[],
      ) => OcActionStep)
  )[] = [];
  if (args.activateFormKey !== undefined)
    steps.push({ kind: 'activateForm', formKey: args.activateFormKey });
  if (args.npUse) steps.push({ kind: 'npUse', actor: 'attacker', ...args.npUse });
  const witnesses = Object.fromEntries(
    Object.entries(args.context.canonicalInputValues ?? {})
      .filter(([key]) => key.startsWith('oc:proc:'))
      .map(([key, value]) => [key.slice('oc:proc:'.length), value]),
  );
  const sources = args.sources.filter(({ effect }) => effectExecutesInNpProgram(effect));
  const hasOcTransaction = sources.some((source) =>
    source.effect.execution.some(
      (operation) =>
        operation.kind === 'grantOcBoost' ||
        operation.kind === 'grantOcApplicationRate' ||
        operation.kind === 'removeOcState',
    ),
  );
  for (const source of sources) {
    let program = compileOcSourceProgram(source);
    if (!hasOcTransaction)
      program = {
        ...program,
        operations: program.operations.filter(
          (operation) =>
            operation.kind !== 'unsupported' || operation.reason === 'ocExecutionSemantics',
        ),
      };
    let sourceApplies = true;
    let sourceState = current;
    steps.push((ocState) => {
      sourceState = current;
      if (!source.sourceEnabled) {
        sourceApplies = false;
        activation.set(source.effect, { procOutcome: 'success', conditionOutcome: false });
        return { kind: 'skip', outcome: 'notApplicable' };
      }
      const facts = currentFacts();
      if (!facts) return { kind: 'reject', status: 'invalid', reason: 'invalidPreparationFacts' };
      const requiresExecution =
        effectRequiresPreparationDecision(source.effect, source.origin) ||
        source.effect.execution.some(
          (operation) => operation.kind === 'buffInstanceMutation' && readsBuffMutation(operation),
        ) ||
        program.operations.length > 0;
      const effectWrites = uncertainPreparationWrites(
        source.effect,
        source.origin,
        source.sourceInstanceId,
      );
      if (!requiresExecution && effectWrites.length === 0)
        return { kind: 'skip', outcome: 'notApplicable' };
      const boundFacts = preparationSourceConditionState(program, facts);
      const actor = program.conditionActor === 'source' ? source.sourceInstanceId : 'attacker';
      const writes = current.uncertainContextWrites.filter(
        (write) => write.scope !== 'attackerState' || (write.actor ?? 'attacker') === actor,
      );
      const resolved = resolvePreparationSourceFacts(
        {
          ...program,
          condition: closePreparationConditionReads(
            program.condition,
            writes,
            boundFacts,
            hasOcHpWrite(ocState, actor),
          ),
        },
        boundFacts,
      );
      program = { ...program, condition: resolved.condition };
      if (resolved.missingCondition)
        missingSourceConditions.set(source.effect, resolved.missingCondition);
      sourceFacts.set(source.effect, resolved.facts);
      occurrenceId = source.effect.occurrenceId;
      if (
        resolved.missingCondition &&
        effectRequiresPreparationDecision(source.effect, source.origin)
      ) {
        requiredInput = resolved.missingCondition;
        return { kind: 'reject', status: 'inputRequired', reason: 'preparationConditionInput' };
      }
      const canonicalRate = program.operations.some(
        (operation) =>
          operation.kind === 'ocRemovalResistance' ||
          operation.kind === 'grantOcBoost' ||
          operation.kind === 'grantOcApplicationRate' ||
          operation.kind === 'removeOcState',
      );
      const stochastic = canonicalRate ? { status: 'success' as const } : resolved.stochastic;
      if (stochastic.status === 'inputRequired') {
        if (!requiresExecution) {
          activation.set(source.effect, { procOutcome: null, conditionOutcome: null });
          return { kind: 'skip', outcome: 'notApplicable' };
        }
        requiredInput =
          resolved.definitions.find((definition) => definition.key === stochastic.inputKey) ?? null;
        return { kind: 'reject', status: 'inputRequired', reason: 'preparationProcInput' };
      }
      if (stochastic.status === 'invalid')
        return { kind: 'reject', status: 'invalid', reason: 'invalidPreparationActivation' };
      sourceApplies = stochastic.status !== 'failure' && resolved.outcome !== false;
      activation.set(source.effect, {
        procOutcome: stochastic.status,
        conditionOutcome: resolved.outcome,
      });
      return { kind: 'skip', outcome: 'notApplicable' };
    });
    const firstStep = steps.length;
    let ocIndex = 0;
    for (const [operationIndex, operation] of source.effect.execution.entries()) {
      if (operation.kind === 'populationFunction') {
        steps.push(() => {
          if (!sourceApplies) return { kind: 'skip', outcome: 'notApplicable' };
          const readTraits =
            operation.action.kind === 'removeOne'
              ? [operation.action.trait]
              : operation.action.condition
                ? [operation.action.condition.trait]
                : [];
          if (
            current.populationEvents.some(
              (event) =>
                event.operation.mutation === 'unsupported' &&
                event.operation.traits.some((trait) => readTraits.includes(trait)),
            )
          )
            return {
              kind: 'reject',
              status: 'unsupported',
              reason: 'populationFunctionOpaqueInput',
            };
          const definitions = sources.flatMap((source) => source.effect.inputDefinitions);
          const values = {
            ...Object.fromEntries(
              definitions
                .filter((input) => input.defaultValue !== null)
                .map((input) => [input.key, input.defaultValue!]),
            ),
            ...args.context.canonicalInputValues,
          };
          const issue = populationInputIssue(definitions, values);
          if (issue) {
            requiredInput = issue;
            occurrenceId = source.effect.occurrenceId;
            return {
              kind: 'reject',
              status: 'inputRequired',
              reason: 'preparationPopulationInput',
            };
          }
          current = applyPopulationFunctionToState(
            operation,
            current,
            values,
            args.actionId,
            source,
          );
          return { kind: 'skip', outcome: 'notApplicable' };
        });
        continue;
      }
      if (operation.kind === 'populationMutation') {
        steps.push(() => {
          const outcome = activation.get(source.effect);
          // A local false predicate cannot prove that an opaque cohort writer missed every actor.
          const unresolvedCohort =
            operation.mutation === 'unsupported' &&
            operation.scope !== 'recipient' &&
            operation.scope !== 'target' &&
            source.sourceEnabled &&
            outcome?.procOutcome !== 'failure';
          if (!sourceApplies && !unresolvedCohort)
            return { kind: 'skip', outcome: 'notApplicable' };
          const event =
            outcome?.conditionOutcome === true
              ? operation
              : { ...operation, mutation: 'unsupported' as const };
          current = {
            ...current,
            populationEvents: [
              ...current.populationEvents,
              {
                operation: event,
                source: { origin: source.origin, sourceInstanceId: source.sourceInstanceId },
              },
            ],
          };
          current = removePopulationFunctionState(current, event);
          // fieldOther has an explicit population scope; the current NP target is one member.
          if (
            operation.scope === 'otherActors' &&
            operation.basis === 'actorTraits' &&
            operation.mutation === 'grant' &&
            outcome?.conditionOutcome === true &&
            ['attacker', 'np', 'passive', 'craftEssence'].includes(source.origin)
          ) {
            const counts = { ...current.stackCounts.targetState };
            const traits = new Set(current.stateTraits.targetState);
            for (const trait of operation.traits) {
              counts[trait] = (counts[trait] ?? 0) + 1;
              traits.add(trait);
            }
            current = {
              ...current,
              stackCounts: { ...current.stackCounts, targetState: counts },
              stateTraits: { ...current.stateTraits, targetState: traits },
            };
          }
          return { kind: 'skip', outcome: 'notApplicable' };
        });
        continue;
      }
      if (operation.kind === 'buffInstanceMutation') {
        if (!readsBuffMutation(operation)) continue;
        steps.push(() => {
          if (!sourceApplies) return { kind: 'skip', outcome: 'notApplicable' };
          if (activation.get(source.effect)?.conditionOutcome !== true)
            return { kind: 'reject', status: 'unsupported', reason: 'unknownBuffInstanceMutation' };
          const instances = applyBuffInstanceMutation(
            current.buffInstances,
            operation,
            source,
            JSON.stringify([
              args.actionId,
              source.sourceInstanceId,
              source.skillId,
              source.effect.occurrenceId,
              operationIndex,
            ]),
          );
          if (instances === null)
            return {
              kind: 'reject',
              status: 'unsupported',
              reason: 'unboundBuffInstanceRecipient',
            };
          current = projectBuffInstanceCounts({ ...current, buffInstances: instances }, buffInputs);
          return { kind: 'skip', outcome: 'notApplicable' };
        });
        continue;
      }
      if (isPreparationNpOperation(operation)) {
        steps.push((ocState, outcomes) => {
          if (
            outcomes.some(
              (outcome) => outcome.step >= firstStep && outcome.outcome === 'stochasticFailure',
            )
          )
            return { kind: 'skip', outcome: 'notApplicable' };
          const receipt = args.npUse
            ? ocState.receipts.find(({ actionId }) => actionId === args.actionId)
            : null;
          if (
            sourceApplies &&
            operation.kind === 'resourceMutation' &&
            resolveResourceTargetPolicy(source.origin, operation.recipient) === 'attacker' &&
            operation.amount.kind === 'populationCount'
          ) {
            const facts = currentFacts();
            if (!facts)
              return { kind: 'reject', status: 'invalid', reason: 'invalidPopulationFacts' };
            if (
              current.uncertainContextWrites.some(
                (write) =>
                  operation.amount.kind === 'populationCount' &&
                  operation.amount.selector.traits.includes(write.trait),
              )
            )
              return { kind: 'reject', status: 'unsupported', reason: 'unresolvedPopulationWrite' };
            const issue = populationInputIssue(
              source.effect.inputDefinitions,
              facts.resolvedInputValues,
            );
            if (issue) {
              requiredInput = issue;
              return {
                kind: 'reject',
                status: 'inputRequired',
                reason: 'preparationPopulationInput',
              };
            }
          }
          const resource = applyPreparationNpOperation({
            semantics: args.context.resourceSemantics,
            initial: current.npResource,
            source,
            operation,
            activation: activation.get(source.effect),
            valueSetIndex: receipt ? receipt.effectiveOc - 1 : source.valueSetIndex,
            buffInstances: current.buffInstances,
            population: currentFacts()
              ? { facts: currentFacts()!, events: current.populationEvents }
              : undefined,
          });
          if (resource.status === 'rejected') {
            resourceOutcome.failure = resource;
            return {
              kind: 'reject',
              status:
                resource.code === 'invalidState' || resource.code === 'invalidMutation'
                  ? 'invalid'
                  : 'unsupported',
              reason: 'preparationResource',
            };
          }
          if (resource.state.gauge !== current.npResource.gauge)
            current = { ...current, npResource: resource.state };
          return { kind: 'skip', outcome: 'notApplicable' };
        });
        continue;
      }
      if (program.operations[ocIndex] !== operation) continue;
      const index = ocIndex++;
      effectSteps.set(steps.length, source.effect);
      steps.push((ocState) => {
        if (!sourceApplies) return { kind: 'skip', outcome: 'conditionFalse' };
        const facts = sourceFacts.get(source.effect)!;
        occurrenceId = source.effect.occurrenceId;
        const key = ocSourceOperationKey(program, index);
        requiredInput = {
          key: `oc:proc:${key}`,
          kind: 'procSuccessCount',
          owner: 'source',
          label: `${source.sourceName}の付与成否`,
          description: '実効付与率が0%と100%の間にある効果の成否（0:失敗、1:成功）',
          minimum: 0,
          maximum: 1,
          step: 1,
          defaultValue: null,
          defaultReason: null,
        };
        if (witnesses[key] !== undefined) inputDefinitions.set(requiredInput.key, requiredInput);
        const bound = bindOcSourceOperation(
          program,
          index,
          {
            facts,
            policy: args.context.policy ?? { kind: 'calculator' },
            npActionId: args.npUse ? args.actionId : null,
            procWitnesses: witnesses,
            ...(missingSourceConditions.has(source.effect)
              ? { conditionInput: missingSourceConditions.get(source.effect)! }
              : {}),
          },
          ocState,
        );
        if (
          bound.kind === 'reject' &&
          bound.status === 'inputRequired' &&
          bound.reason.startsWith('ocCondition:')
        )
          requiredInput =
            missingSourceConditions.get(source.effect) ?? requiredOcConditionInput(program, facts);
        return bound;
      });
    }
    if (program.operations.length > 0)
      steps.push({ kind: 'recordSource', sourceKey: ocSourceOperationKey(program, 0) });
    // Earlier canonical trait writes are visible to later OC/rate conditions in this command.
    steps.push((_, outcomes) => {
      if (
        outcomes.some(
          (outcome) => outcome.step >= firstStep && outcome.outcome === 'stochasticFailure',
        )
      ) {
        current = sourceState;
        return { kind: 'skip', outcome: 'notApplicable' };
      }
      const contextOperations = source.effect.execution.filter(
        (operation) => operation.kind === 'contextMutation',
      );
      if (contextOperations.length === 0) return { kind: 'skip', outcome: 'notApplicable' };
      if (!sourceApplies) return { kind: 'skip', outcome: 'notApplicable' };
      if (activation.get(source.effect)?.conditionOutcome !== true) {
        current = {
          ...current,
          uncertainContextWrites: [
            ...current.uncertainContextWrites,
            ...uncertainPreparationWrites(source.effect, source.origin, source.sourceInstanceId),
          ],
        };
        return { kind: 'skip', outcome: 'notApplicable' };
      }
      const externalWrites = uncertainPreparationWrites(
        source.effect,
        source.origin,
        source.sourceInstanceId,
      ).filter((write) => write.actor !== undefined);
      if (externalWrites.length)
        current = {
          ...current,
          uncertainContextWrites: [...current.uncertainContextWrites, ...externalWrites],
        };
      const structural = resolvePreparationStructuralOutcome(
        args.servant,
        current,
        [
          {
            ...source.effect,
            execution: contextOperations,
          },
        ],
        source.origin,
      );
      if (typeof structural === 'string')
        return { kind: 'reject', status: 'invalid', reason: structural };
      current = {
        ...current,
        uncertainContextWrites: closeUncertainPreparationWrites(
          current.uncertainContextWrites,
          source.effect,
          source.origin,
        ),
        currentFormId: structural.currentFormId,
        selectedNoblePhantasmVariant: structural.selectedVariant,
        stateTraits: structural.stateTraits,
        stackCounts: structural.stackCounts,
        initialTraitSuppressions: structural.initialTraitSuppressions,
      };
      current = projectBuffInstanceCounts(current, buffInputs);
      return { kind: 'skip', outcome: 'notApplicable' };
    });
  }
  const hp: Record<string, number | null> = {
    attacker: args.context.attackerHpPermille ?? null,
  };
  for (const source of [
    ...(args.context.initialSources ?? []),
    ...(args.context.terminalSources ?? []),
    ...args.sources,
  ]) {
    if (source.origin !== 'support' && source.origin !== 'mysticCode') continue;
    hp[source.sourceInstanceId] =
      args.context.canonicalInputValues?.[sourceHpInputKey(source)] ?? 1000;
  }
  let result = executeOcAction(args.state.ocState, args.actionId, steps, hp, {
    hasFutureNpUse: args.terminalNp !== true,
  });
  if (result.status !== 'committed' && result.requiredInput) {
    requiredInput = result.requiredInput;
    occurrenceId = result.occurrenceId ?? occurrenceId;
  }
  if (result.status === 'inputRequired' && result.reason.startsWith('ocRateHp:')) {
    const actor = result.reason.slice('ocRateHp:'.length);
    const source = args.sources.find((source) => source.sourceInstanceId === actor);
    requiredInput = {
      key:
        actor === 'attacker'
          ? 'oc:hp:attacker'
          : source
            ? sourceHpInputKey(source)
            : `source:${actor}:hpPermille`,
      kind: 'sourceHpPermille',
      owner: 'source',
      label: '付与元のHP割合',
      description: 'OC付与率の評価に用いる現在HP割合',
      minimum: 0,
      maximum: 1000,
      step: 10,
      defaultValue: null,
      defaultReason: null,
    };
  }
  for (const outcome of result.outcomes) {
    const effect = effectSteps.get(outcome.step);
    if (effect && outcome.outcome === 'stochasticFailure') {
      activation.set(effect, {
        procOutcome: 'failure',
        conditionOutcome: activation.get(effect)?.conditionOutcome ?? null,
      });
    }
  }
  if (result.status === 'committed') {
    const sourceOutcomes = new Map(result.state.sourceOutcomes);
    for (const source of sources) {
      const outcome = activation.get(source.effect)?.procOutcome;
      if (!outcome) continue;
      const key = ocSourceOperationKey(compileOcSourceProgram(source), 0);
      if (result.state.executedSources.has(key)) sourceOutcomes.set(key, outcome);
    }
    result = { ...result, state: { ...result.state, sourceOutcomes } };
  }
  return {
    result,
    resourceFailure: resourceOutcome.failure,
    requiredInput:
      (result.status === 'inputRequired' &&
        (result.reason.startsWith('ocCondition:') ||
          result.reason.startsWith('ocProc:') ||
          result.reason.startsWith('ocRemovalProc:') ||
          result.reason.startsWith('preparation') ||
          result.reason.startsWith('ocRateHp:'))) ||
      (result.status === 'inputRequired' && result.reason.startsWith('ocRateCondition:'))
        ? requiredInput
        : null,
    occurrenceId,
    recoveryInputDefinitions:
      result.status === 'inputRequired' && requiredInput
        ? [
            ...new Map(
              sources
                .filter((source) =>
                  source.effect.inputDefinitions.some((input) => input.key === requiredInput?.key),
                )
                .flatMap((source) => source.effect.inputDefinitions)
                .map((input) => [input.key, input]),
            ).values(),
          ]
        : [],
    structuralState: result.status === 'committed' ? current : args.state,
    inputDefinitions: [...inputDefinitions.values()],
    activation,
  };
}
