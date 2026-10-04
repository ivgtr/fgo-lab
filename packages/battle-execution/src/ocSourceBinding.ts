import type { CanonicalInputDefinition, OcExecutionOperation } from '@fgo-lab/master-data';
import {
  containsUnsupportedCondition,
  evaluateCondition,
  type ConditionEvaluationState,
} from './condition';
import { procIsGuaranteed } from './conditionRead';
import { contributionPolicyDecisions } from './effectiveContributions';
import { resolveContributionScope, resolveTargetPolicy } from './effectRouting';
import type { ContributionApplicationPolicy } from './executionTypes';
import { evaluateOcSourceCondition, type OcSourceProgram } from './ocSourceProgram';
import { ocRemovalIntersects, type OcActionStep, type OcState } from './ocState';
import { sourceIdentity } from './operationCompiler';
import { requiredOcConditionInput } from './ocConditionInputs';

export interface OcSourceBindingContext {
  facts: ConditionEvaluationState;
  policy: ContributionApplicationPolicy;
  /** Required for NP sources; each source selects cells using its own action's receipt. */
  npActionId: string | null;
  procWitnesses: Readonly<Record<string, number>>;
  conditionInput?: CanonicalInputDefinition;
}

export function ocSourceOperationKey(program: OcSourceProgram, index: number): string {
  const { source } = program;
  return JSON.stringify([
    source.origin,
    source.sourceInstanceId,
    source.skillId,
    source.effect.occurrenceId,
    source.constantFormKey ?? null,
    index,
  ]);
}

function sourceActor(program: OcSourceProgram): string {
  return ['attacker', 'passive', 'np', 'craftEssence'].includes(program.source.origin)
    ? 'attacker'
    : program.source.sourceInstanceId;
}

function recipientActor(program: OcSourceProgram, operation: OcExecutionOperation): string | null {
  const resolved = resolveTargetPolicy(program.source.origin, operation.route.target);
  if (resolved) return resolved;
  return operation.route.target === 'sourceSelf' || operation.route.target === 'sourceActor'
    ? sourceActor(program)
    : null;
}

/** Binding is performed at execution, after NP-use and earlier operations have committed locally. */
export function bindOcSourceOperation(
  program: OcSourceProgram,
  index: number,
  context: OcSourceBindingContext,
  state: OcState,
): OcActionStep {
  const { source } = program;
  const operation = program.operations[index];
  if (!operation) return { kind: 'reject', status: 'invalid', reason: 'missingOcOperation' };
  if (!source.sourceEnabled || operation.kind === 'ocStateNonIntersection')
    return { kind: 'skip', outcome: 'notApplicable' };
  if (operation.kind === 'unsupported')
    return { kind: 'reject', status: 'unsupported', reason: operation.reason };
  const recipient = recipientActor(program, operation);
  if (recipient === null) return { kind: 'skip', outcome: 'notApplicable' };
  const eligibility = operation.route.eligibility;
  if (eligibility.kind !== 'anyRecipient' && recipient !== eligibility.recipient)
    return eligibility.onMismatch === 'ignore'
      ? { kind: 'skip', outcome: 'notApplicable' }
      : { kind: 'reject', status: 'unsupported', reason: 'ocRecipientMismatch' };
  if (
    operation.kind === 'removeOcState' &&
    !ocRemovalIntersects(state, recipient, operation.selector)
  )
    return { kind: 'skip', outcome: 'notApplicable' };
  const decisions = contributionPolicyDecisions(
    {
      source: {
        origin: source.origin,
        sourceInstanceId: source.sourceInstanceId,
        sourceId: source.sourceId,
        skillId: source.skillId,
        effectId: source.effect.id,
        effectOccurrenceId: source.effect.occurrenceId,
      },
      gameActivation: source.effect.gameActivation,
      contributionScope: resolveContributionScope(source.origin, operation.route.contributionScope),
    },
    evaluateCondition(program.condition, context.facts),
    context.policy,
    procIsGuaranteed(
      source.effect.proc,
      source.effect.proc.kind === 'guaranteed'
        ? 1000
        : (source.effect.proc.ratePermille[source.valueSetIndex]?.[source.valueIndex] ?? null),
    ),
  );
  const included = Object.values(decisions).every(({ kind }) => kind === 'included');
  const condition = evaluateOcSourceCondition(program, context.facts);
  if (condition === false) return { kind: 'skip', outcome: 'conditionFalse' };
  const finiteRateMayParticipate = state.rates.some(
    (rate) =>
      rate.included &&
      rate.uses.kind === 'finite' &&
      rate.uses.remaining > 0 &&
      (rate.turns.kind === 'unlimited' || rate.turns.remaining > 0) &&
      (rate.formKey === undefined || rate.formKey === state.activeFormKey) &&
      rate.owner === (rate.role === 'casterGrant' ? sourceActor(program) : recipient),
  );
  // This bounded program has only the attacker's NP uses. A support's boost can still
  // matter through finite rate consumption, so erase it only after proving that absent.
  if (
    operation.kind === 'grantOcBoost' &&
    recipient !== 'attacker' &&
    !finiteRateMayParticipate &&
    !state.uncertainRates.some(
      (rate) =>
        rate.uses.kind === 'finite' &&
        rate.uses.remaining > 0 &&
        rate.owner === (rate.role === 'casterGrant' ? sourceActor(program) : recipient),
    )
  )
    return { kind: 'skip', outcome: 'notApplicable' };
  if (
    condition === null &&
    !included &&
    (operation.kind === 'grantOcBoost' || operation.kind === 'grantOcApplicationRate')
  ) {
    return finiteRateMayParticipate
      ? { kind: 'reject', status: 'unsupported', reason: 'uncertainOcRateConsumption' }
      : { kind: 'skip', outcome: 'policyExcluded' };
  }
  if (condition === null && operation.kind === 'grantOcApplicationRate') {
    if (finiteRateMayParticipate && operation.lifetime !== 'constant')
      return { kind: 'reject', status: 'unsupported', reason: 'uncertainOcRateConsumption' };
    const row =
      source.origin === 'np'
        ? state.receipts.find((receipt) => receipt.actionId === context.npActionId)?.effectiveOc
        : source.valueSetIndex + 1;
    const cell =
      row === undefined
        ? undefined
        : (source.limitBreak ? operation.limitBreakCells : operation.cells)?.[row - 1]?.[
            source.valueIndex
          ];
    if (!cell) return { kind: 'reject', status: 'invalid', reason: 'missingOcCell' };
    return {
      kind: 'uncertainRate',
      rate: {
        sourceKey: ocSourceOperationKey(program, index),
        owner: recipient,
        role: operation.role,
        lifetime: operation.lifetime,
        stateTraits: operation.stateTraits,
        turns: cell.turns,
        uses: cell.uses,
        requiredInput: containsUnsupportedCondition(program.condition)
          ? null
          : (context.conditionInput ?? requiredOcConditionInput(program, context.facts)),
        occurrenceId: source.effect.occurrenceId,
        ...(source.constantFormKey === undefined ? {} : { formKey: source.constantFormKey }),
      },
    };
  }
  // Resistance is a possible unrepresented write, not an eager condition reader.
  // Its uncertainty matters only if a later removal intersects live OC state.
  if (condition === null && operation.kind !== 'ocRemovalResistance')
    return {
      kind: 'reject',
      status: containsUnsupportedCondition(program.condition) ? 'unsupported' : 'inputRequired',
      reason: `ocCondition:${ocSourceOperationKey(program, index)}`,
    };
  let valueSetIndex = source.valueSetIndex;
  if (source.origin === 'np') {
    const receipt = state.receipts.find(({ actionId }) => actionId === context.npActionId);
    if (!receipt) return { kind: 'reject', status: 'invalid', reason: 'missingNpOcReceipt' };
    valueSetIndex = receipt.effectiveOc - 1;
  }
  if (operation.kind === 'ocRemovalResistance') {
    const cell = (source.limitBreak ? operation.limitBreakCells : operation.cells)?.[
      valueSetIndex
    ]?.[source.valueIndex];
    if (!cell)
      return { kind: 'reject', status: 'invalid', reason: 'missingOcRemovalResistanceCell' };
    const inactive =
      cell.applicationRatePermille === 0 ||
      (cell.turns.kind === 'finite' && cell.turns.remaining === 0) ||
      (cell.uses.kind === 'finite' && cell.uses.remaining === 0) ||
      (cell.amount.kind === 'fixed' && cell.amount.value === 0);
    return inactive
      ? { kind: 'skip', outcome: 'notApplicable' }
      : {
          kind: 'removalResistance',
          actor: recipient,
          ...(source.constantFormKey === undefined ? {} : { formKey: source.constantFormKey }),
        };
  }
  const sourceKey = ocSourceOperationKey(program, index);
  const witness = context.procWitnesses[sourceKey];
  if (witness !== undefined && witness !== 0 && witness !== 1)
    return { kind: 'reject', status: 'invalid', reason: `invalidOcProc:${sourceKey}` };
  const proc: { procWitness?: 0 | 1 } = witness === undefined ? {} : { procWitness: witness };
  if (operation.kind === 'removeOcState') {
    const applicationRate = operation.applicationRates[valueSetIndex]?.[source.valueIndex];
    return applicationRate === null || applicationRate === undefined
      ? { kind: 'reject', status: 'invalid', reason: 'missingOcRemovalCell' }
      : { kind: 'remove', recipient, selector: operation.selector, applicationRate, ...proc };
  }
  return {
    kind: 'grant',
    grant: operation,
    sourceKey,
    sourceEvidence: {
      source: sourceIdentity(source),
      sourceName: source.sourceName,
      skillName: source.skillName,
      label: source.effect.label,
    },
    caster: sourceActor(program),
    recipient,
    valueSetIndex,
    valueIndex: source.valueIndex,
    limitBreak: source.limitBreak,
    included,
    condition,
    ...(source.constantFormKey === undefined ? {} : { formKey: source.constantFormKey }),
    ...proc,
  };
}
