import { inputFactValues } from './inputFacts';
import { CRITICAL_STARS_INITIAL_INPUT, mutateConditionalCriticalStars } from './resourceSemantics';
import type { PhysicalInputCommit } from './executionBinding';
import {
  registerPreparationSourceExecution,
  commitPreparationSourceExecution,
  type PreparationSourceDraft,
} from './preparationExecution';
import {
  bindPreparationWriteProofs,
  commitPreparationNpQuantityWrite,
  finalizePreparationNpQuantityWrites,
} from './preparationProofs';
import { conditionWriteProof, sourceProcRead, type ConditionFactProof } from './conditionRead';
import { selectBinaryStochasticPossibility, stochasticGroupKey } from './stochasticPossibilities';
import {
  preparationHpScope,
  captureSelectedAllyMaximumFixedWrite,
  captureGiveWrite,
  captureNoHealingWrite,
  beginHpConditionCapture,
  finishHpConditionCapture,
  type PreparationHpAction,
} from './hpExecutionObservation';
import {
  preparationAttemptScope,
  preparationBattlePointScope,
  capturePreparationOcRates,
  capturePreparationSources,
  type PreparationOcAttempt,
} from './preparationAttemptObservation';
import { projectPlanningHpCondition, UnresolvedPreparationPlanningRead } from './hpPlanning';
import {
  markerEffectReads,
  terminalMarkerReads,
  markerIntersects,
  markerHasOpaqueReads,
} from './markerDependency';
import { canonicalRequirementLeaves, getNoblePhantasmVariants } from '@fgo-lab/master-data';
import { hpPermille } from './hpResource';
import {
  isHpOperation,
  executeHpOperation,
  hpEffectKey,
  type HpGainConsumption,
} from './preparationHp';
import { applyNpTransfer } from './npTransfer';
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
import { requiredOcConditionInput, providedSourceConditionInputs } from './ocConditionInputs';
import {
  closePreparationConditionReads,
  closeUncertainPreparationWrites,
  uncertainPreparationWrites,
} from './preparationContextWrites';
import {
  compileEffectCondition,
  sourceMaximumHpInput,
  sourceHpInputKey,
} from './operationCompiler';
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
import { executeOcAction, type OcActionStep, type OcActionOutcome } from './ocState';
import type { SourceEffect } from './sourceCollection';
import {
  resolvePreparationStructuralOutcome,
  requiredPreparationConditionRead,
} from './preparationState';
import {
  evaluateCondition,
  type ConditionEvaluationState,
  type ConditionReadAudit,
} from './condition';
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
import {
  applyBattlePointOperation,
  battlePointEffectKey,
  reconcilePreparationBattlePoints,
} from './battlePointResource';

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
    sourceActivation: { kind: 'unread' },
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
    operation.marker !== undefined ||
    (operation.mutation === 'remove' &&
      (args.state.buffInstances.some(
        (instance) =>
          instance.marker && instance.traits.some((trait) => operation.traits.includes(trait)),
      ) ||
        args.sources.some((source) =>
          source.effect.execution.some(
            (writer) =>
              writer.kind === 'buffInstanceMutation' &&
              writer.marker &&
              writer.traits.some((trait) => operation.traits.includes(trait)),
          ),
        ))) ||
    buffInputs.some((input) =>
      input.instanceTraits.some((trait) => operation.traits.includes(trait)),
    );
  const scope = preparationAttemptScope(args.context);
  const battlePointCapture = preparationBattlePointScope(args.context);
  const attempt: PreparationOcAttempt | undefined = scope
    ? {
        actionId: args.actionId,
        sourceExecutions: [],
        rates: { selections: [], queries: [], reads: [] },
        sources: args.sources,
        start: args.state,
        stepOrigins: [],
        reached: [],
        writes: [],
      }
    : undefined;
  if (attempt) scope!.push(attempt);
  const sourceExecutions: PreparationSourceDraft[] = [];
  if (attempt) capturePreparationSources(attempt, sourceExecutions);
  const hpScope = preparationHpScope(args.context);
  const hpAction: PreparationHpAction | undefined = hpScope
    ? {
        actionId: args.actionId,
        start: args.state,
        sources: args.sources,
        steps: [],
        operations: [],
        modifierReads: [],
        conditionAttempts: [],
        conditionReads: [],
        writes: [],
        sourceEnds: [],
      }
    : undefined;
  if (hpAction) hpScope!.push(hpAction);
  let current = args.state;
  let markerReaders: ReadonlySet<string> | undefined;
  const markerIsUnobserved = (
    operation: Extract<MasterEffect['execution'][number], { kind: 'buffInstanceMutation' }>,
  ) => {
    if (!operation.marker) return false;
    const effects = [
      ...[...args.servant.skills, ...args.servant.passives].flatMap((source) => source.effects),
      ...getNoblePhantasmVariants(args.servant).flatMap((variant) => variant.effects),
      ...[
        ...(args.context.initialSources ?? []),
        ...(args.context.terminalSources ?? []),
        ...args.sources,
      ].map((source) => source.effect),
    ];
    if (effects.some(markerHasOpaqueReads)) return false;
    markerReaders ??= new Set([
      ...[...args.servant.skills, ...args.servant.passives].flatMap((source) =>
        source.effects.flatMap(markerEffectReads),
      ),
      ...getNoblePhantasmVariants(args.servant).flatMap(terminalMarkerReads),
      ...[
        ...(args.context.initialSources ?? []),
        ...(args.context.terminalSources ?? []),
        ...args.sources,
      ].flatMap((source) => markerEffectReads(source.effect)),
    ]);
    return !markerIntersects(operation, markerReaders);
  };
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
  const resourceMutations: {
    step: number;
    occurrenceId: string;
    before: PreNoblePhantasmState['npResource'];
    after: PreNoblePhantasmState['npResource'];
  }[] = [];
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
  const sourceStepOwners = new Map<number, PreparationSourceDraft>();
  const operationStepOwners = new Map<
    number,
    {
      operation: PreparationSourceDraft['operations'][number];
      before: PreNoblePhantasmState | null;
    }
  >();
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
  for (const initialSource of sources) {
    let source = initialSource;
    const sourceFirstStep = steps.length;
    const origins = [{ index: sourceFirstStep, source, operationIndex: null as number | null }];
    let program = compileOcSourceProgram(source);
    if (source.effect.selection?.kind === 'playerChoice') {
      const family = source.effect.selection.group.key;
      program = {
        ...program,
        choiceCandidates: [
          ...new Set(
            sources
              .filter(
                (candidate) =>
                  candidate.origin === source.origin &&
                  candidate.sourceInstanceId === source.sourceInstanceId &&
                  candidate.skillId === source.skillId,
              )
              .flatMap((candidate) =>
                candidate.effect.selection?.kind === 'playerChoice' &&
                candidate.effect.selection.group.key === family
                  ? [candidate.effect.selection.group.candidate]
                  : [],
              ),
          ),
        ].sort(),
      };
    }
    if (!hasOcTransaction)
      program = {
        ...program,
        operations: program.operations.filter(
          (operation) =>
            operation.kind !== 'unsupported' ||
            operation.reason === 'ocExecutionSemantics' ||
            operation.reason === 'resourceExecutionSemantics',
        ),
      };
    const deferrableHpCondition = source.effect.execution.every(
      (operation) =>
        operation.kind === 'hpModifier' &&
        ['receive', 'give', 'noHealing'].includes(operation.action),
    );
    const sourceProof = (): ConditionFactProof => {
      const receipt = requiredPreparationConditionRead(source.effect, activation);
      if (receipt.kind === 'notApplicable' && !source.sourceEnabled)
        return {
          kind: 'guaranteedWrite',
          clock: {
            phase: 'sourceUse',
            actorFormId: current.currentFormId,
            actor: 'attacker',
            actionId: args.actionId,
            operationId: null,
            sourceInstanceId: source.sourceInstanceId,
            occurrenceId: source.effect.occurrenceId,
            valueSetIndex: source.valueSetIndex,
            valueIndex: source.valueIndex,
          },
        };
      if (receipt.kind !== 'read') throw new TypeError('missing_source_write_read');
      return conditionWriteProof(
        receipt.read,
        receipt.read.truth === false ||
          (receipt.proc.kind === 'resolved' && receipt.proc.certainty === 'guaranteed'),
      );
    };
    let sourceApplies = true;
    let sourceState = current;
    const conditionReads: ConditionReadAudit[] = [];
    const physicalInputs: PhysicalInputCommit[] = [];
    const sourceExecution: PreparationSourceDraft = {
      actionId: args.actionId,
      source: initialSource,
      status: 'unreached',
      before: null,
      attemptedAfter: null,
      committedAfter: null,
      completion: null,
      rejection: null,
      binding: {
        actionId: args.actionId,
        actorFormId: current.currentFormId,
        sourceInstanceId: source.sourceInstanceId,
        skillId: source.skillId,
        occurrenceId: source.effect.occurrenceId,
        valueSetIndex: source.valueSetIndex,
        valueIndex: source.valueIndex,
        activation: { kind: 'unread' },
        conditionReads,
        physicalInputs: [],
      },
      operations: source.effect.execution.map((operation, operationIndex) => ({
        operation,
        operationIndex,
        status: 'unreached',
        steps: [],
      })),
    };
    registerPreparationSourceExecution(args.context, sourceExecution);
    sourceExecutions.push(sourceExecution);
    let sourceResourceMutationCount = resourceMutations.length;
    let sourceNpWriteStart = current.npQuantityWrites.length;
    let sourceStochasticFailureSteps: number[] | undefined;
    const sourceStep = steps.length;
    const transactionKey = JSON.stringify([
      args.actionId,
      source.origin,
      source.sourceInstanceId,
      source.effect.occurrenceId,
      sourceStep,
    ]);
    const beginSource: (typeof steps)[number] = (ocState) => {
      const npReceipt = args.npUse
        ? ocState.receipts.find((candidate) => candidate.actionId === args.actionId)
        : undefined;
      if (args.npUse && !npReceipt) throw new TypeError('missing_source_np_use_receipt');
      if (npReceipt) {
        source = { ...source, valueSetIndex: npReceipt.effectiveOc - 1 };
        program = { ...program, source };
      }
      sourceState = current;
      sourceExecution.status = 'pending';
      sourceExecution.before = current;
      sourceExecution.binding = {
        ...sourceExecution.binding,
        actorFormId: current.currentFormId,
        valueSetIndex: source.valueSetIndex,
        valueIndex: source.valueIndex,
      };
      sourceResourceMutationCount = resourceMutations.length;
      sourceNpWriteStart = current.npQuantityWrites.length;
      if (!source.sourceEnabled) {
        sourceApplies = false;
        activation.set(source.effect, {
          procOutcome: 'success',
          conditionOutcome: false,
          sourceActivation: { kind: 'notApplicable' },
        });
        return { kind: 'skip', outcome: 'notApplicable' };
      }
      const facts = currentFacts();
      if (!facts) return { kind: 'reject', status: 'invalid', reason: 'invalidPreparationFacts' };
      if (
        source.effect.selection?.kind === 'playerChoice' &&
        source.effect.execution.some(isHpOperation)
      ) {
        const choice = {
          kind: 'choice' as const,
          source: {
            origin: source.origin,
            sourceInstanceId: source.sourceInstanceId,
            skillId: source.skillId || null,
          },
          family: source.effect.selection.group.key,
          candidate: source.effect.selection.group.candidate,
        };
        if (
          evaluateCondition(choice, facts).truth === null &&
          evaluateCondition(program.condition, preparationSourceConditionState(program, facts))
            .truth !== false
        ) {
          occurrenceId = source.effect.occurrenceId;
          requiredInput = requiredOcConditionInput({ ...program, condition: choice }, facts);
          return { kind: 'reject', status: 'inputRequired', reason: 'preparationConditionInput' };
        }
      }
      const requiresExecution =
        (effectRequiresPreparationDecision(source.effect, source.origin) &&
          !(args.context.planningOnly && source.effect.execution.every(isHpOperation))) ||
        source.effect.execution.some(
          (operation) => operation.kind === 'buffInstanceMutation' && readsBuffMutation(operation),
        ) ||
        program.operations.length > 0;
      for (const input of providedSourceConditionInputs(
        program,
        facts,
        args.context.canonicalInputValues ?? {},
      ))
        inputDefinitions.set(input.key, input);
      if (args.context.planningOnly)
        program = {
          ...program,
          condition: projectPlanningHpCondition(
            program.condition,
            JSON.stringify([
              args.actionId,
              source.origin,
              source.sourceInstanceId,
              source.skillId,
              source.effect.occurrenceId,
            ]),
            args.context.planningConditionChoices ?? new Map(),
          ),
        };
      const boundFacts = preparationSourceConditionState(program, facts);
      boundFacts.conditionReadClock = {
        phase: 'sourceUse',
        actorFormId: current.currentFormId,
        actor: boundFacts.resourceActor ?? 'attacker',
        actionId: args.actionId,
        operationId: null,
        sourceInstanceId: source.sourceInstanceId,
        occurrenceId: source.effect.occurrenceId,
        valueSetIndex: source.valueSetIndex,
        valueIndex: source.valueIndex,
      };
      const actor = program.conditionActor === 'source' ? source.sourceInstanceId : 'attacker';
      const writes = current.uncertainContextWrites.filter(
        (write) => write.scope !== 'attackerState' || (write.actor ?? 'attacker') === actor,
      );
      const sourceHasHpCondition =
        hpAction &&
        !args.context.planningOnly &&
        canonicalRequirementLeaves(source.effect.requirement.expression).some(
          (leaf) => leaf.kind === 'quantity' && leaf.quantity === 'attackerHpPermille',
        );
      if (sourceHasHpCondition)
        hpAction.conditionAttempts.push({
          kind: 'source',
          source,
          operation: null,
          operationIndex: null,
          instance: null,
          step: sourceStep,
        });
      const sourceActivations: PreparationHpAction['conditionReads'][number]['reads'] = [];
      const resolved = resolvePreparationSourceFacts(
        {
          ...program,
          condition: closePreparationConditionReads(program.condition, writes, boundFacts),
        },
        boundFacts,
        args.context.stochasticSelection,
        program.operations.some((operation) =>
          [
            'ocRemovalResistance',
            'grantOcBoost',
            'grantOcApplicationRate',
            'removeOcState',
          ].includes(operation.kind),
        )
          ? 'ocRate'
          : 'source',
        sourceHasHpCondition ? (read) => sourceActivations.push(read) : undefined,
        (read) => conditionReads.push(read),
      );
      if (sourceHasHpCondition)
        hpAction.conditionReads.push({
          kind: 'source',
          source,
          operation: null,
          operationIndex: null,
          instance: null,
          step: sourceStep,
          condition: resolved.condition,
          reads: sourceActivations,
          outcome: resolved.outcome,
        });
      program = { ...program, condition: resolved.condition };
      current = { ...current, inputFacts: resolved.facts.inputFacts };
      if (resolved.missingCondition)
        missingSourceConditions.set(source.effect, resolved.missingCondition);
      sourceFacts.set(source.effect, resolved.facts);
      occurrenceId = source.effect.occurrenceId;
      if (
        resolved.missingCondition &&
        !deferrableHpCondition &&
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
      const procRead = canonicalRate
        ? { kind: 'unread' as const }
        : sourceProcRead(
            source.effect.proc,
            source.effect.proc.kind === 'guaranteed'
              ? 1000
              : (source.effect.proc.ratePermille[source.valueSetIndex]?.[source.valueIndex] ??
                  null),
            stochastic,
            args.context.stochasticSelection.kind === 'possibility' ? 'witness' : 'declared',
          );
      if (stochastic.status === 'inputRequired') {
        if (!requiresExecution) {
          activation.set(source.effect, {
            procOutcome: null,
            conditionOutcome: null,
            sourceActivation: { kind: 'read', read: resolved.conditionRead, proc: procRead },
          });
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
        sourceActivation: { kind: 'read', read: resolved.conditionRead, proc: procRead },
      });
      return { kind: 'skip', outcome: 'notApplicable' };
    };
    steps.push((ocState, outcomes) => {
      const step = beginSource(ocState, outcomes);
      sourceExecution.binding = {
        ...sourceExecution.binding,
        activation: activation.get(source.effect)?.sourceActivation ?? { kind: 'unread' },
      };
      sourceExecution.attemptedAfter = current;
      if (step.kind === 'reject') sourceExecution.status = 'rejected';
      return step.kind === 'skip'
        ? { kind: 'beginSource', sourceKey: transactionKey, outcome: step.outcome }
        : step;
    });
    const firstStep = steps.length;
    let ocIndex = 0;
    for (const [operationIndex, operation] of source.effect.execution.entries()) {
      const operationFirstStep = steps.length;
      origins.push({ index: operationFirstStep, source, operationIndex });
      if (operation.kind === 'resourceMutation' && operation.resource === 'criticalStars') {
        steps.push(() => {
          if (!sourceApplies) return { kind: 'skip', outcome: 'notApplicable' };
          const activationRead = requiredPreparationConditionRead(source.effect, activation);
          if (activationRead.kind !== 'read')
            return {
              kind: 'reject',
              status: 'unsupported',
              reason: 'unknownCriticalStarsCondition',
            };
          const amount =
            operation.amount.kind === 'fixed'
              ? ((source.limitBreak
                  ? operation.amount.limitBreakValues
                  : operation.amount.values)?.[source.valueSetIndex]?.[source.valueIndex] ?? null)
              : null;
          const mutation = mutateConditionalCriticalStars(
            current.inputFacts,
            amount,
            operation.direction,
            sourceProof(),
            activationRead,
            (() => {
              const input = requiredOcConditionInput(program, sourceFacts.get(source.effect)!);
              return input ? [input] : [];
            })(),
          );
          if (mutation.status !== 'applied') {
            if (mutation.status === 'inputRequired')
              requiredInput =
                source.effect.inputDefinitions.find((input) => input.kind === 'criticalStars') ??
                CRITICAL_STARS_INITIAL_INPUT;
            return { kind: 'reject', status: mutation.status, reason: mutation.reason };
          }
          physicalInputs.push({
            operationIndex,
            inputKey: 'battle:criticalStars',
            before: mutation.before,
            after: mutation.after,
          });
          current = { ...current, inputFacts: mutation.facts };
          return { kind: 'skip', outcome: 'notApplicable' };
        });
        continue;
      }
      // Other players are donor actors. A projected attacker-only write cannot
      // establish their post-write quantity, even when it is a no-op for the attacker.
      if (
        operation.kind === 'resourceMutation' &&
        operation.resource === 'npGauge' &&
        operation.amount.kind !== 'npTransfer' &&
        operation.recipient !== 'enemy' &&
        !(
          ['sourceSelf', 'sourceActor', 'attackerNpCard'].includes(operation.recipient) &&
          ['attacker', 'np', 'passive', 'craftEssence'].includes(source.origin)
        )
      ) {
        steps.push(() => {
          if (source.sourceEnabled && activation.get(source.effect)?.procOutcome !== 'failure')
            current = bindPreparationWriteProofs(
              current,
              { ...current, uncertainPlayerNp: true },
              sourceProof(),
            );
          return { kind: 'skip', outcome: 'notApplicable' };
        });
      }
      if (
        operation.kind === 'boundedPhaseIrrelevant' &&
        operation.proof === 'enemyChargeOutsideDamage'
      ) {
        steps.push(() => {
          if (source.sourceEnabled && activation.get(source.effect)?.procOutcome !== 'failure')
            current = bindPreparationWriteProofs(
              current,
              { ...current, uncertainEnemyCharge: true },
              sourceProof(),
            );
          return { kind: 'skip', outcome: 'notApplicable' };
        });
        continue;
      }
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
          current = bindPreparationWriteProofs(
            current,
            applyPopulationFunctionToState(operation, current, values, args.actionId, source),
            sourceProof(),
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
          current = bindPreparationWriteProofs(
            current,
            {
              ...current,
              populationEvents: [
                ...current.populationEvents,
                {
                  operation: event,
                  source: { origin: source.origin, sourceInstanceId: source.sourceInstanceId },
                },
              ],
            },
            sourceProof(),
          );
          current = bindPreparationWriteProofs(
            current,
            removePopulationFunctionState(current, event),
            sourceProof(),
          );
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
            current = bindPreparationWriteProofs(
              current,
              {
                ...current,
                stackCounts: { ...current.stackCounts, targetState: counts },
                stateTraits: { ...current.stateTraits, targetState: traits },
              },
              sourceProof(),
            );
          }
          return { kind: 'skip', outcome: 'notApplicable' };
        });
        continue;
      }
      if (operation.kind === 'buffInstanceMutation') {
        if (!readsBuffMutation(operation)) continue;
        steps.push(() => {
          let uncertainMarker = false;
          if (!sourceApplies) {
            if (operation.marker && operation.mutation === 'grant') {
              const absent = applyBuffInstanceMutation(
                current.buffInstances,
                operation,
                source,
                `absent:${source.effect.occurrenceId}`,
              );
              if (absent)
                current = bindPreparationWriteProofs(
                  current,
                  projectBuffInstanceCounts(
                    {
                      ...current,
                      buffInstances: absent.map((instance) =>
                        current.buffInstances.includes(instance)
                          ? instance
                          : { ...instance, count: 0 },
                      ),
                    },
                    buffInputs,
                  ),
                  sourceProof(),
                );
            }
            return { kind: 'skip', outcome: 'notApplicable' };
          }
          if (
            args.context.planningOnly &&
            activation.get(source.effect)?.conditionOutcome === null
          ) {
            const key = JSON.stringify([
              args.actionId,
              source.sourceInstanceId,
              source.effect.occurrenceId,
              operationIndex,
              'marker-condition',
            ]);
            const outcome = args.context.planningConditionChoices?.get(key);
            if (outcome === undefined) throw new UnresolvedPreparationPlanningRead(key);
            if (!outcome) return { kind: 'skip', outcome: 'notApplicable' };
          } else if (activation.get(source.effect)?.conditionOutcome !== true) {
            if (markerIsUnobserved(operation)) return { kind: 'skip', outcome: 'notApplicable' };
            if (operation.marker) uncertainMarker = true;
            else
              return {
                kind: 'reject',
                status: 'unsupported',
                reason: 'unknownBuffInstanceMutation',
              };
          }
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
          current = bindPreparationWriteProofs(
            current,
            projectBuffInstanceCounts(
              {
                ...current,
                buffInstances: uncertainMarker
                  ? instances.map((instance) =>
                      current.buffInstances.includes(instance)
                        ? instance
                        : {
                            ...instance,
                            uncertain: true,
                            requiredInput: sourceFacts.get(source.effect)
                              ? requiredOcConditionInput(
                                  compileOcSourceProgram(source),
                                  sourceFacts.get(source.effect)!,
                                )
                              : null,
                          },
                    )
                  : instances,
              },
              buffInputs,
            ),
            sourceProof(),
          );
          const beforeReconciliation = current;
          current = bindPreparationWriteProofs(
            current,
            reconcilePreparationBattlePoints(args.servant, current, args.context),
            sourceProof(),
          );
          if (battlePointCapture)
            battlePointCapture.push({
              kind: 'reconcile',
              owner: 'operation',
              actionId: args.actionId,
              source,
              before: beforeReconciliation,
              after: current,
              domains: args.context.battlePointDomains,
            });
          return { kind: 'skip', outcome: 'notApplicable' };
        });
        continue;
      }
      if (
        operation.kind === 'battlePointCapacityModifier' ||
        (operation.kind === 'resourceMutation' && operation.resource === 'battlePoint')
      ) {
        steps.push(() => {
          const write: PreparationOcAttempt['writes'][number] | undefined = attempt
            ? {
                source,
                operationIndex,
                step: operationFirstStep,
                status: 'notApplicable',
                before: current.battlePoints,
                after: current.battlePoints,
                receipts: [],
              }
            : undefined;
          if (write) {
            attempt!.writes.push(write);
            battlePointCapture?.push({ kind: 'write', actionId: args.actionId, write });
          }
          if (!sourceApplies) return { kind: 'skip', outcome: 'notApplicable' };
          if (activation.get(source.effect)?.conditionOutcome !== true) {
            if (
              args.context.planningOnly &&
              activation.get(source.effect)?.conditionOutcome === null
            ) {
              const key = JSON.stringify([
                args.actionId,
                source.sourceInstanceId,
                source.effect.occurrenceId,
                operationIndex,
                'battle-point-condition',
              ]);
              const outcome = args.context.planningConditionChoices?.get(key);
              if (outcome === undefined) throw new UnresolvedPreparationPlanningRead(key);
              if (!outcome) return { kind: 'skip', outcome: 'notApplicable' };
            } else if (
              args.context.policy?.kind !== 'ranking' ||
              args.context.policy.conditionalEffects !== 'satisfied'
            )
              return { kind: 'skip', outcome: 'notApplicable' };
          }
          const beforeBattlePoints = current.battlePoints;
          const applied = applyBattlePointOperation({
            state: current.battlePoints,
            domains: args.context.battlePointDomains ?? [],
            operation,
            source,
            valueSetIndex: source.valueSetIndex,
            identity: JSON.stringify([
              args.actionId,
              source.sourceInstanceId,
              source.effect.occurrenceId,
              operationIndex,
            ]),
          });
          if (write) {
            write.status = applied.status;
            write.before = beforeBattlePoints;
            write.after = applied.state;
            write.receipts = applied.state.receipts.slice(beforeBattlePoints.receipts.length);
          }
          if (applied.status !== 'applied')
            return { kind: 'reject', status: applied.status, reason: 'battlePointMutation' };
          current = bindPreparationWriteProofs(
            current,
            { ...current, battlePoints: applied.state },
            sourceProof(),
          );
          return { kind: 'skip', outcome: 'notApplicable' };
        });
        continue;
      }
      if (isHpOperation(operation)) {
        if (args.context.planningOnly) continue;
        const hpStep = steps.length;
        steps.push((ocState) => {
          if (!source.sourceEnabled || activation.get(source.effect)?.procOutcome === 'failure') {
            hpAction?.steps.push({
              source,
              operation,
              operationIndex,
              step: hpStep,
              decision: 'skipped',
            });
            return { kind: 'skip', outcome: 'notApplicable' };
          }
          if (!current.hp) {
            hpAction?.steps.push({
              source,
              operation,
              operationIndex,
              step: hpStep,
              decision: 'missingHpState',
            });
            return { kind: 'reject', status: 'unsupported', reason: 'missingHpState' };
          }
          hpAction?.steps.push({
            source,
            operation,
            operationIndex,
            step: hpStep,
            decision: 'attempted',
          });
          const receipt = args.npUse
            ? ocState.receipts.find((receipt) => receipt.actionId === args.actionId)
            : null;
          const hpBefore = current.hp;
          const hpArguments: Parameters<typeof executeHpOperation>[0] = {
            state: current.hp,
            operation,
            source,
            values: args.context.canonicalInputValues ?? {},
            actionId: args.actionId,
            valueSetIndex: receipt ? receipt.effectiveOc - 1 : source.valueSetIndex,
            ...(hpAction
              ? {
                  observeModifierRead: (read) =>
                    hpAction.modifierReads.push({ source, operationIndex, step: hpStep, read }),
                }
              : {}),
            modifierCondition: (instance) => {
              const condition = compileEffectCondition(
                {
                  ...source.effect,
                  requirement: {
                    recipient: 'sourceSelf',
                    expression: instance.operation.useCondition!,
                  },
                },
                'attacker',
                source.sourceId,
                source.sourceInstanceId,
                source.skillId,
                true,
              );
              const queryProgram = {
                ...program,
                condition,
                conditionActor:
                  instance.actor === 'attacker' ? ('attacker' as const) : ('source' as const),
                source: {
                  ...source,
                  sourceInstanceId: instance.actor,
                  sourceTraits:
                    [
                      ...(args.context.initialSources ?? []),
                      ...(args.context.terminalSources ?? []),
                      ...args.sources,
                    ].find((s) => s.sourceInstanceId === instance.actor)?.sourceTraits ?? [],
                },
              };
              const facts = preparationSourceConditionState(queryProgram, currentFacts()!);
              const modifierHasHpCondition =
                hpAction &&
                canonicalRequirementLeaves(instance.operation.useCondition!).some(
                  (leaf) => leaf.kind === 'quantity' && leaf.quantity === 'attackerHpPermille',
                );
              if (modifierHasHpCondition)
                hpAction.conditionAttempts.push({
                  kind: 'modifierUse',
                  source,
                  operation: instance.operation,
                  operationIndex,
                  instance,
                  step: hpStep,
                });
              const reads: PreparationHpAction['conditionReads'][number]['reads'] = [];
              const previous = modifierHasHpCondition
                ? beginHpConditionCapture(facts, (read) => reads.push(read))
                : undefined;
              let outcome: boolean | null;
              try {
                outcome = evaluateCondition(condition, facts).truth;
              } finally {
                if (modifierHasHpCondition) finishHpConditionCapture(facts, previous);
              }
              if (modifierHasHpCondition)
                hpAction.conditionReads.push({
                  kind: 'modifierUse',
                  source,
                  operation: instance.operation,
                  operationIndex,
                  instance,
                  step: hpStep,
                  condition,
                  reads,
                  outcome,
                });
              return {
                outcome,
                input: requiredOcConditionInput(queryProgram, facts),
              };
            },
            conditionForRecipient: (actor) => {
              const facts = currentFacts()!;
              if (actor === 'attacker')
                return {
                  outcome: evaluateCondition(program.condition, facts).truth,
                  input: requiredOcConditionInput(
                    { ...program, conditionActor: 'attacker' },
                    facts,
                  ),
                };
              if (actor.startsWith('enemy:'))
                return {
                  outcome: activation.get(source.effect)?.conditionOutcome ?? null,
                  input: requiredOcConditionInput(program, sourceFacts.get(source.effect)!),
                };
              const recipientSource = [
                ...(args.context.initialSources ?? []),
                ...(args.context.terminalSources ?? []),
                ...args.sources,
              ].find((candidate) => candidate.sourceInstanceId === actor);
              const recipientProgram = {
                ...program,
                conditionActor: 'source' as const,
                source: {
                  ...program.source,
                  sourceInstanceId: actor,
                  sourceTraits: recipientSource?.sourceTraits ?? [],
                },
              };
              const bound = preparationSourceConditionState(recipientProgram, facts);
              return {
                outcome: evaluateCondition(program.condition, bound).truth,
                input: requiredOcConditionInput(recipientProgram, bound),
              };
            },
          };
          if (
            hpAction &&
            source.origin === 'attacker' &&
            operation.kind === 'resourceMutation' &&
            operation.direction === 'gain' &&
            operation.amount.kind === 'fixed' &&
            operation.unit === 'fixed' &&
            operation.recipient === 'sourceSelf' &&
            (operation.selection === undefined || operation.selection === 'direct')
          )
            hpArguments.observeGain = (consumption: HpGainConsumption) => {
              // Only retain receive consumers, not unrelated HP gains.
              if (
                consumption.receive.instances.some(
                  (instance) => instance.operation.action === 'receive',
                )
              )
                (hpAction.receiveConsumptions ??= []).push({
                  source,
                  operationIndex,
                  valueSetIndex: receipt ? receipt.effectiveOc - 1 : source.valueSetIndex,
                  valueIndex: source.valueIndex,
                  consumption,
                });
            };
          if (
            hpAction &&
            source.origin === 'attacker' &&
            operation.kind === 'resourceMutation' &&
            operation.direction === 'gain' &&
            operation.amount.kind === 'fixed' &&
            operation.unit === 'fixed' &&
            (operation.recipient === 'sourceSelf' || operation.recipient === 'partyMember') &&
            (operation.selection === undefined || operation.selection === 'direct')
          )
            hpArguments.observeGiveGain = (consumption) => {
              if (consumption.give.instances.length)
                (hpAction.giveConsumptions ??= []).push({
                  source,
                  operationIndex,
                  valueSetIndex: receipt ? receipt.effectiveOc - 1 : source.valueSetIndex,
                  valueIndex: source.valueIndex,
                  consumption,
                });
              else if (
                hpBefore.modifiers?.some(
                  (instance) =>
                    instance.actor === consumption.give.actor &&
                    instance.operation.action === 'give',
                )
              )
                (hpAction.giveExcludedConsumptions ??= []).push({
                  source,
                  operationIndex,
                  valueSetIndex: receipt ? receipt.effectiveOc - 1 : source.valueSetIndex,
                  valueIndex: source.valueIndex,
                  consumption,
                });
            };
          const result = executeHpOperation(hpArguments);
          hpAction?.operations.push({
            source,
            operation,
            operationIndex,
            step: hpStep,
            before: hpBefore,
            result,
          });
          if (
            hpAction &&
            operation.kind === 'resourceMutation' &&
            operation.amount.kind === 'hpTransfer'
          )
            (hpAction.transferOperations ??= []).push({
              source,
              operationIndex,
              step: hpStep,
              before: hpBefore,
              result,
              receipts:
                result.status === 'applied'
                  ? result.state.receipts.slice(hpBefore.receipts.length)
                  : [],
              donorReceipts:
                result.status === 'applied'
                  ? (result.state.donorReceipts ?? []).slice(hpBefore.donorReceipts?.length ?? 0)
                  : [],
            });
          if (result.status !== 'applied') {
            if (result.status === 'inputRequired') {
              requiredInput = result.requiredInput;
              return { kind: 'reject', status: 'inputRequired', reason: 'unknownHpCondition' };
            }
            if (current.hp.actors.attacker?.kind === 'missing') {
              requiredInput = requiredOcConditionInput(
                {
                  ...program,
                  conditionActor: 'attacker',
                  condition: {
                    kind: 'quantity',
                    quantity: 'attackerHpPermille',
                    comparison: 'atLeast',
                    value: 0,
                  },
                },
                currentFacts()!,
              );
              return { kind: 'reject', status: 'inputRequired', reason: 'missingInitialHp' };
            }
            return { kind: 'reject', status: result.status, reason: 'hpMutation' };
          }
          if (
            hpAction &&
            source.origin === 'attacker' &&
            operation.kind === 'resourceMutation' &&
            operation.amount.kind === 'fixed' &&
            operation.unit === 'fixed' &&
            operation.recipient === 'sourceSelf' &&
            (operation.selection === undefined || operation.selection === 'direct')
          )
            hpAction.writes.push({
              source,
              operationIndex,
              before: hpBefore,
              after: result.state,
              receipts: result.state.receipts.slice(hpBefore.receipts.length),
            });
          if (
            hpAction &&
            source.origin === 'attacker' &&
            operation.kind === 'hpModifier' &&
            operation.action === 'maximumFixed' &&
            operation.lifetime === 'active' &&
            operation.route.target === 'sourceSelf' &&
            (operation.selection === undefined || operation.selection === 'direct') &&
            operation.bounds.minimum === null &&
            operation.bounds.maximum === null &&
            (operation.useCondition === undefined || operation.useCondition.kind === 'always')
          )
            (hpAction.modifierWrites ??= []).push({
              source,
              operationIndex,
              operation,
              valueSetIndex: receipt ? receipt.effectiveOc - 1 : source.valueSetIndex,
              valueIndex: source.valueIndex,
              before: hpBefore,
              after: result.state,
              modifiers: (result.state.modifiers ?? []).slice(hpBefore.modifiers?.length ?? 0),
              receipts: result.state.receipts.slice(hpBefore.receipts.length),
            });
          if (hpAction && operation.kind === 'hpModifier')
            captureSelectedAllyMaximumFixedWrite(
              hpAction,
              source,
              operation,
              operationIndex,
              hpBefore,
              result.state,
              receipt ? receipt.effectiveOc - 1 : source.valueSetIndex,
            );
          if (
            hpAction &&
            source.origin === 'attacker' &&
            operation.kind === 'hpModifier' &&
            operation.action === 'receive' &&
            operation.sign === 1 &&
            operation.lifetime === 'active' &&
            operation.route.target === 'sourceSelf' &&
            (operation.selection === undefined || operation.selection === 'direct') &&
            operation.bounds.minimum === 0 &&
            operation.bounds.maximum === 50000 &&
            (operation.useCondition === undefined || operation.useCondition.kind === 'always')
          )
            (hpAction.receiveWrites ??= []).push({
              source,
              operationIndex,
              operation,
              valueSetIndex: receipt ? receipt.effectiveOc - 1 : source.valueSetIndex,
              valueIndex: source.valueIndex,
              before: hpBefore,
              after: result.state,
              modifiers: (result.state.modifiers ?? []).slice(hpBefore.modifiers?.length ?? 0),
              receipts: result.state.receipts.slice(hpBefore.receipts.length),
            });
          if (hpAction && hpArguments.observeGiveGain)
            (hpAction.giveGains ??= []).push({
              source,
              operationIndex,
              before: hpBefore,
              after: result.state,
              receipts: result.state.receipts.slice(hpBefore.receipts.length),
            });
          if (hpAction)
            captureGiveWrite(
              hpAction,
              source,
              operation,
              operationIndex,
              hpBefore,
              result.state,
              receipt ? receipt.effectiveOc - 1 : source.valueSetIndex,
            );
          if (hpAction)
            captureNoHealingWrite(
              hpAction,
              source,
              operation,
              operationIndex,
              hpBefore,
              result.state,
              receipt ? receipt.effectiveOc - 1 : source.valueSetIndex,
            );
          current = bindPreparationWriteProofs(
            current,
            { ...current, hp: result.state },
            sourceProof(),
          );
          return { kind: 'skip', outcome: 'notApplicable' };
        });
        continue;
      }
      if (isPreparationNpOperation(operation)) {
        const resourceStep = steps.length;
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
            (operation.amount.kind === 'buffCount' || operation.amount.kind === 'populationCount')
          ) {
            const amount = operation.amount;
            const traits = amount.kind === 'buffCount' ? [amount.trait] : amount.selector.traits;
            const unknown = current.buffInstances.find(
              (instance) =>
                instance.uncertain &&
                instance.count > 0 &&
                (amount.kind !== 'buffCount' || instance.actor === 'attacker') &&
                traits.some(
                  (trait) =>
                    instance.traits.includes(trait) || instance.marker?.actorTrait === trait,
                ),
            );
            if (unknown) {
              requiredInput = unknown.requiredInput ?? null;
              return {
                kind: 'reject',
                status: requiredInput ? 'inputRequired' : 'unsupported',
                reason: 'unknownMarkerRead',
              };
            }
          }
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
              return {
                kind: 'reject',
                status: 'unsupported',
                reason: 'unresolvedPopulationWrite',
              };
            const issue = populationInputIssue(
              source.effect.inputDefinitions,
              inputFactValues(facts.inputFacts),
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
          if (
            operation.kind === 'resourceMutation' &&
            operation.resource === 'npGauge' &&
            operation.amount.kind === 'npTransfer'
          ) {
            if (!sourceApplies) return { kind: 'skip', outcome: 'notApplicable' };
            if (activation.get(source.effect)?.conditionOutcome !== true)
              return {
                kind: 'reject',
                status: 'unsupported',
                reason: 'unknownTransferCondition',
              };
            if (
              (operation.amount.donor === 'enemyCharge' && current.uncertainEnemyCharge) ||
              (operation.amount.donor === 'playerNp' && current.uncertainPlayerNp)
            )
              return {
                kind: 'reject',
                status: 'unsupported',
                reason: 'unresolvedTransferDonorWrite',
              };
            const transfer = applyNpTransfer({
              amount: operation.amount,
              source,
              values: args.context.canonicalInputValues ?? {},
              prior: current.npTransfers ?? [],
              state: current.npResource,
              semantics: args.context.resourceSemantics,
              actionId: args.actionId,
              valueSetIndex: receipt ? receipt.effectiveOc - 1 : source.valueSetIndex,
            });
            if (transfer.status === 'inputRequired') {
              requiredInput = transfer.input;
              return {
                kind: 'reject',
                status: 'inputRequired',
                reason: 'preparationTransferInput',
              };
            }
            if (transfer.status !== 'applied')
              return { kind: 'reject', status: transfer.status, reason: 'npTransfer' };
            resourceMutations.push({
              step: resourceStep,
              occurrenceId: source.effect.occurrenceId,
              before: current.npResource,
              after: transfer.state,
            });
            current = bindPreparationWriteProofs(
              current,
              {
                ...current,
                npResource: transfer.state,
                npTransfers: [...(current.npTransfers ?? []), transfer.receipt],
              },
              sourceProof(),
            );
            return { kind: 'skip', outcome: 'notApplicable' };
          }
          const resource = applyPreparationNpOperation({
            semantics: args.context.resourceSemantics,
            initial: current.npResource,
            source,
            operation,
            sourceActivation: requiredPreparationConditionRead(source.effect, activation),
            phase: 'sourceStage',
            valueSetIndex: receipt ? receipt.effectiveOc - 1 : source.valueSetIndex,
            buffInstances: current.buffInstances,
            population: currentFacts()
              ? { facts: currentFacts()!, events: current.populationEvents }
              : undefined,
          });
          if (resource.status === 'rejected') {
            if (resource.code === 'ambiguousCondition') {
              const facts = sourceFacts.get(source.effect);
              const markerInput = facts ? requiredOcConditionInput(program, facts) : null;
              if (markerInput) {
                requiredInput = markerInput;
                return {
                  kind: 'reject',
                  status: 'inputRequired',
                  reason: 'unknownMarkerCondition',
                };
              }
            }
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
          const writesQuantity =
            operation.kind === 'resourceMutation' &&
            operation.resource === 'npGauge' &&
            resolveResourceTargetPolicy(source.origin, operation.recipient) === 'attacker' &&
            (operation.amount.kind === 'fixed' || operation.amount.kind === 'currentGaugeRatio') &&
            sourceApplies &&
            activation.get(source.effect)?.conditionOutcome === true;
          if (resource.state.gauge !== current.npResource.gauge)
            resourceMutations.push({
              step: resourceStep,
              occurrenceId: source.effect.occurrenceId,
              before: current.npResource,
              after: resource.state,
            });
          if (
            writesQuantity &&
            (operation.amount.kind === 'fixed' || operation.amount.kind === 'currentGaugeRatio')
          ) {
            const activationReceipt = requiredPreparationConditionRead(source.effect, activation);
            if (activationReceipt.kind !== 'read')
              throw new TypeError('missing_np_write_activation');
            const valueSetIndex = receipt ? receipt.effectiveOc - 1 : source.valueSetIndex;
            const cell = (
              source.limitBreak ? operation.amount.limitBreakValues : operation.amount.values
            )?.[valueSetIndex]?.[source.valueIndex];
            if (cell === null || cell === undefined) throw new TypeError('missing_np_write_cell');
            current = commitPreparationNpQuantityWrite({
              state: current,
              after: resource.state,
              kind: operation.amount.kind,
              direction: operation.direction,
              cell,
              clock: {
                ...activationReceipt.read.clock,
                phase: 'operation',
                operationId: JSON.stringify([
                  args.actionId,
                  source.sourceInstanceId,
                  source.effect.occurrenceId,
                  operationIndex,
                ]),
                valueSetIndex,
                valueIndex: source.valueIndex,
              },
              sourceActivation: activationReceipt,
              activationProof: sourceProof(),
            });
          } else if (resource.state.gauge !== current.npResource.gauge)
            current = bindPreparationWriteProofs(
              current,
              { ...current, npResource: resource.state },
              sourceProof(),
            );
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
            activation: (() => {
              const receipt = requiredPreparationConditionRead(source.effect, activation);
              if (receipt.kind !== 'read') throw new TypeError('missing_oc_source_activation');
              return receipt;
            })(),
            executionIntent:
              args.context.stochasticSelection.kind === 'possibility'
                ? 'physicalBranch'
                : 'declared',
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
    origins.push({ index: steps.length, source, operationIndex: null });
    if (program.operations.length > 0)
      steps.push({ kind: 'recordSource', sourceKey: ocSourceOperationKey(program, 0) });
    // Earlier canonical trait writes are visible to later OC/rate conditions in this command.
    const completePhysicalSource = (
      outcomes: readonly OcActionOutcome[],
      commit: boolean,
    ): OcActionStep => {
      if (!commit) {
        current = sourceState;
        resourceMutations.splice(sourceResourceMutationCount);
        if (hpAction)
          sourceStochasticFailureSteps = outcomes.flatMap((outcome) =>
            outcome.step >= firstStep && outcome.outcome === 'stochasticFailure'
              ? [outcome.step]
              : [],
          );
        return { kind: 'skip', outcome: 'notApplicable' };
      }
      const structuralOperations = source.effect.execution.filter(
        (operation) =>
          operation.kind === 'contextMutation' ||
          operation.kind === 'transformActorForm' ||
          operation.kind === 'selectNoblePhantasmVariant',
      );
      if (structuralOperations.length === 0) return { kind: 'skip', outcome: 'notApplicable' };
      if (!sourceApplies) return { kind: 'skip', outcome: 'notApplicable' };
      if (activation.get(source.effect)?.conditionOutcome !== true) {
        current = bindPreparationWriteProofs(
          current,
          {
            ...current,
            uncertainContextWrites: [
              ...current.uncertainContextWrites,
              ...uncertainPreparationWrites(source.effect, source.origin, source.sourceInstanceId),
            ],
          },
          sourceProof(),
        );
        return { kind: 'skip', outcome: 'notApplicable' };
      }
      const externalWrites = uncertainPreparationWrites(
        source.effect,
        source.origin,
        source.sourceInstanceId,
      ).filter((write) => write.actor !== undefined);
      if (externalWrites.length)
        current = bindPreparationWriteProofs(
          current,
          {
            ...current,
            uncertainContextWrites: [...current.uncertainContextWrites, ...externalWrites],
          },
          sourceProof(),
        );
      const structural = resolvePreparationStructuralOutcome(
        args.servant,
        current,
        [
          {
            ...source.effect,
            execution: structuralOperations,
          },
        ],
        source.origin,
      );
      if (typeof structural === 'string')
        return { kind: 'reject', status: 'invalid', reason: structural };
      current = bindPreparationWriteProofs(
        current,
        {
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
        },
        sourceProof(),
      );
      current = bindPreparationWriteProofs(
        current,
        projectBuffInstanceCounts(current, buffInputs),
        sourceProof(),
      );
      const beforeReconciliation = current;
      current = bindPreparationWriteProofs(
        current,
        reconcilePreparationBattlePoints(args.servant, current, args.context),
        sourceProof(),
      );
      if (battlePointCapture)
        battlePointCapture.push({
          kind: 'reconcile',
          owner: 'source',
          actionId: args.actionId,
          source,
          before: beforeReconciliation,
          after: current,
          domains: args.context.battlePointDomains,
        });
      return { kind: 'skip', outcome: 'notApplicable' };
    };
    const completeSource: (typeof steps)[number] = (_state, outcomes) => {
      sourceExecution.attemptedAfter = current;
      const commit = !outcomes.some(
        (outcome) => outcome.step >= firstStep && outcome.outcome === 'stochasticFailure',
      );
      const step = completePhysicalSource(outcomes, commit);
      if (step.kind !== 'reject') {
        sourceExecution.status = 'completed';
        sourceExecution.binding = {
          ...sourceExecution.binding,
          activation: requiredPreparationConditionRead(source.effect, activation),
          physicalInputs: commit ? [...physicalInputs] : [],
        };
        current = {
          ...current,
          sourceBindings: [...current.sourceBindings, sourceExecution.binding],
        };
      } else {
        sourceExecution.status = 'rejected';
      }
      if (step.kind === 'skip' && current.npQuantityWrites.length > sourceNpWriteStart) {
        const receipt = requiredPreparationConditionRead(source.effect, activation);
        if (receipt.kind !== 'read') throw new TypeError('missing_committed_np_write_activation');
        current = finalizePreparationNpQuantityWrites(
          current,
          sourceNpWriteStart,
          receipt,
          sourceProof(),
        );
      }
      return step.kind === 'skip'
        ? {
            kind: 'finishSource',
            sourceKey: transactionKey,
            commit,
            outcome: step.outcome,
          }
        : step;
    };
    const sourceEndStep = steps.length;
    steps.push(
      battlePointCapture || hpAction
        ? (state, outcomes) => {
            const before = current;
            const step = completeSource(state, outcomes);
            hpAction?.sourceEnds.push({
              source,
              step: sourceEndStep,
              before,
              after: current,
              ...(sourceStochasticFailureSteps?.length
                ? {
                    sourceStart: sourceState,
                    stochasticFailureSteps: sourceStochasticFailureSteps,
                  }
                : {}),
            });
            battlePointCapture?.push({
              kind: 'sourceEnd',
              actionId: args.actionId,
              source,
              state: current.battlePoints,
            });
            return step;
          }
        : completeSource,
    );
    for (let index = firstStep; index < sourceEndStep; index++) {
      const origin = [...origins].reverse().find((item) => item.index <= index)!;
      if (origin.operationIndex === null) continue;
      const operationExecution = sourceExecution.operations[origin.operationIndex]!;
      const nativeStep = steps[index]!;
      const owner = { operation: operationExecution, before: null as PreNoblePhantasmState | null };
      operationStepOwners.set(index, owner);
      steps[index] = (state, outcomes) => {
        owner.before = current;
        const step = typeof nativeStep === 'function' ? nativeStep(state, outcomes) : nativeStep;
        operationExecution.status = 'reached';
        sourceExecution.attemptedAfter = current;
        if (step.kind === 'reject') sourceExecution.status = 'rejected';
        return step;
      };
    }
    for (let index = sourceFirstStep; index < steps.length; index++)
      sourceStepOwners.set(index, sourceExecution);
    if (attempt)
      for (let index = sourceFirstStep; index < steps.length; index++) {
        const origin = [...origins].reverse().find((item) => item.index <= index)!;
        attempt.stepOrigins.push({ ...origin, index });
      }
  }
  const hp: Record<string, number | null> = {
    get attacker() {
      return hpPermille(current.hp?.actors.attacker);
    },
  };
  for (const source of [
    ...(args.context.initialSources ?? []),
    ...(args.context.terminalSources ?? []),
    ...args.sources,
  ]) {
    if (source.origin !== 'support' && source.origin !== 'mysticCode') continue;
    Object.defineProperty(hp, source.sourceInstanceId, {
      configurable: true,
      get: () => hpPermille(current.hp?.actors[source.sourceInstanceId]),
    });
  }
  const selectedProc = args.context.stochasticSelection;
  const procOptions = {
    resolveProcWitness: (
      step: number,
      effectiveRate: number,
      declaredWitness: 0 | 1 | undefined,
    ): 0 | 1 | undefined => {
      const effect = effectSteps.get(step);
      const source = sources.find((candidate) => candidate.effect === effect);
      if (!effect || !source) throw new TypeError('missing_oc_proc_source');
      const receipt = requiredPreparationConditionRead(effect, activation);
      if (receipt.kind !== 'read') throw new TypeError('missing_oc_source_activation');
      const key =
        effect.selection?.kind === 'stochasticOutcome'
          ? stochasticGroupKey(
              source.origin,
              source.sourceInstanceId,
              source.skillId,
              effect.selection.group,
              args.actionId,
            )
          : JSON.stringify([
              'ocOperation',
              args.actionId,
              source.origin,
              source.sourceInstanceId,
              source.skillId,
              effect.occurrenceId,
              step,
            ]);
      const witness =
        selectedProc.kind === 'possibility'
          ? selectBinaryStochasticPossibility(key, effectiveRate, selectedProc) === 'success'
            ? 1
            : 0
          : effectiveRate === 0
            ? 0
            : effectiveRate === 1000
              ? 1
              : declaredWitness;
      if (witness === undefined) return undefined;
      const outcome = witness === 1 ? 'success' : 'failure';
      activation.set(effect, {
        conditionOutcome: receipt.read.truth,
        procOutcome: outcome,
        sourceActivation: {
          ...receipt,
          proc: {
            kind: 'resolved',
            outcome,
            certainty: effectiveRate === 0 || effectiveRate === 1000 ? 'guaranteed' : 'possible',
            ratePermille: effectiveRate,
            selection: selectedProc.kind === 'possibility' ? 'witness' : 'declared',
          },
        },
      });
      return witness;
    },
  };
  const rateObservation = attempt ? capturePreparationOcRates(attempt) : undefined;
  const completeStep: NonNullable<Parameters<typeof executeOcAction>[4]>['completeStep'] = (
    index,
    native,
  ) => {
    const sourceExecution = sourceStepOwners.get(index);
    const sourceActivation =
      sourceExecution && activation.get(sourceExecution.source.effect)?.sourceActivation;
    if (
      sourceExecution &&
      sourceActivation &&
      sourceActivation !== sourceExecution.binding.activation
    )
      sourceExecution.binding = {
        ...sourceExecution.binding,
        activation: sourceActivation,
      };
    const owner = operationStepOwners.get(index);
    if (owner) {
      if (!owner.before) throw new TypeError('missing_preparation_operation_start');
      const before = { ...owner.before, ocState: native.before };
      const after = { ...current, ocState: native.after };
      owner.operation.steps.push({ step: native.step, before, after, native });
      if (sourceExecution) sourceExecution.attemptedAfter = after;
    }
    if (sourceExecution && native.rejection) {
      sourceExecution.status = 'rejected';
      sourceExecution.rejection = native.rejection;
    }
    if (sourceExecution && sourceExecution.before && native.step.kind === 'beginSource')
      sourceExecution.before = { ...sourceExecution.before, ocState: native.before };
    if (sourceExecution && native.step.kind === 'finishSource' && !native.rejection) {
      if (!sourceExecution.attemptedAfter)
        throw new TypeError('missing_source_attempted_finish_state');
      sourceExecution.attemptedAfter = {
        ...(native.step.commit ? current : sourceExecution.attemptedAfter),
        ocState: native.before,
      };
      sourceExecution.committedAfter = { ...current, ocState: native.after };
      sourceExecution.completion = native.step.commit ? 'committed' : 'stochasticFailure';
    }
    if (
      sourceExecution &&
      native.step.kind === 'finishSource' &&
      native.step.commit &&
      !native.rejection
    )
      commitPreparationSourceExecution(args.context, sourceExecution);
  };
  let result = executeOcAction(
    args.state.ocState,
    args.actionId,
    steps,
    hp,
    attempt
      ? {
          ...procOptions,
          completeStep,
          hasFutureNpUse: args.terminalNp !== true,
          observeStep: (index, step) => attempt.reached.push({ index, step }),
          observeRateSelection: (step, state) =>
            rateObservation!.selections.push({ step, state, hp: current.hp }),
          observeRateQuery: (step, state, rate) =>
            rateObservation!.queries.push({ step, state, rate, hp: current.hp }),
          observeRateHpRead: (step, read) => rateObservation!.reads.push({ step, ...read }),
        }
      : { ...procOptions, completeStep, hasFutureNpUse: args.terminalNp !== true },
  );
  if (result.status !== 'committed' && result.requiredInput) {
    requiredInput = result.requiredInput;
    occurrenceId = result.occurrenceId ?? occurrenceId;
  }
  if (result.status === 'inputRequired' && result.reason.startsWith('ocRateHp:')) {
    const actor = result.reason.slice('ocRateHp:'.length);
    const source = args.sources.find((source) => source.sourceInstanceId === actor);
    if (
      actor !== 'attacker' &&
      source &&
      current.hp?.receipts.some((receipt) => receipt.actor === actor)
    )
      requiredInput = sourceMaximumHpInput(source);
    else
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
      const receipt = requiredPreparationConditionRead(effect, activation);
      if (receipt.kind !== 'read' || outcome.effectiveRate === undefined)
        throw new TypeError('missing_oc_failure_activation');
      activation.set(effect, {
        procOutcome: 'failure',
        conditionOutcome: activation.get(effect)?.conditionOutcome ?? null,
        sourceActivation: {
          ...receipt,
          proc: {
            kind: 'resolved',
            outcome: 'failure',
            certainty: outcome.effectiveRate === 0 ? 'guaranteed' : 'possible',
            ratePermille: outcome.effectiveRate,
            selection: selectedProc.kind === 'possibility' ? 'witness' : 'declared',
          },
        },
      });
    }
  }
  if (result.status === 'committed') {
    if ((hpAction?.receiveWrites?.length || hpAction?.giveWrites?.length) && current.hp)
      hpAction.commitStartHp = current.hp;
    const beforeCommit = current.battlePoints;
    current = {
      ...current,
      battlePoints: {
        ...current.battlePoints,
        executedEffects: [
          ...new Set([
            ...current.battlePoints.executedEffects,
            ...sources
              .filter((source) =>
                source.effect.execution.some(
                  (operation) =>
                    operation.kind === 'battlePointCapacityModifier' ||
                    (operation.kind === 'resourceMutation' && operation.resource === 'battlePoint'),
                ),
              )
              .map(battlePointEffectKey),
          ]),
        ],
      },
    };
    if (!args.context.planningOnly && current.hp)
      current = {
        ...current,
        hp: {
          ...current.hp,
          executedEffects: [
            ...new Set([
              ...(current.hp.executedEffects ?? []),
              ...sources
                .filter((source) => source.effect.execution.some(isHpOperation))
                .map(hpEffectKey),
            ]),
          ],
        },
      };
    if (battlePointCapture)
      battlePointCapture.push({
        kind: 'commit',
        actionId: args.actionId,
        before: beforeCommit,
        after: current.battlePoints,
      });
    const sourceOutcomes = new Map(result.state.sourceOutcomes);
    for (const source of sources) {
      const outcome = activation.get(source.effect)?.procOutcome;
      if (!outcome) continue;
      const key = ocSourceOperationKey(compileOcSourceProgram(source), 0);
      if (result.state.executedSources.has(key)) sourceOutcomes.set(key, outcome);
    }
    result = { ...result, state: { ...result.state, sourceOutcomes } };
  }
  if (hpAction) {
    hpAction.native = result;
    if (result.status === 'inputRequired' && requiredInput && occurrenceId)
      hpAction.rejectionInput = { requiredInput, occurrenceId };
    hpAction.attempted = current;
    hpAction.returned = result.status === 'committed' ? current : args.state;
  }
  if (attempt) {
    attempt.native = result;
    attempt.attempted = current.battlePoints;
    attempt.returned = result.status === 'committed' ? current : args.state;
  }
  return {
    result,
    resourceMutations: result.status === 'committed' ? resourceMutations : [],
    resourceFailure: resourceOutcome.failure,
    requiredInput: result.status === 'inputRequired' ? requiredInput : null,
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
