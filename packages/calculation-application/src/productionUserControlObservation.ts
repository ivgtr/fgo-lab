import type { EffectProjection } from '@fgo-lab/battle-execution';
import type { CalculationExecution, CalculationExecutionObservation } from './scenario';
import type {
  RankingCandidateCalculation,
  RankingExecutionObservation,
} from './rankingPolicyCandidates';
import type { RankingPolicyDetail } from './rankingContracts';
import { attackProfileKey } from './attackProfile';
import type {
  ProductionUserControlEffectiveContribution,
  ProductionUserControlInputBinding,
  ProductionUserControlIdentity,
  ProductionUserControlObservation,
  ProductionUserControlOperationEvent,
  ProductionUserControlProjectionObservation,
  ProductionUserControlSideObservation,
} from './productionParityDiagnostics';

type UserControlCalculationSource = Pick<
  Extract<CalculationExecution, { status: 'executable' }>,
  | 'input'
  | 'result'
  | 'effects'
  | 'effectiveContributions'
  | 'noblePhantasmVariant'
  | 'profileContinuity'
>;

function controlDamageInputBinding(
  projection: EffectProjection,
  calculation: UserControlCalculationSource,
): ProductionUserControlInputBinding {
  const input = calculation.input;
  switch (projection.modifier) {
    case 'attackBuff':
    case 'defenseBuff':
    case 'cardBuff':
    case 'cardResistance':
    case 'npDamageBuff':
    case 'npResistance':
    case 'eventDamageBuff':
    case 'specialDamageBuff':
    case 'powerMod':
    case 'flatDamage':
      return { kind: 'bound', address: projection.modifier, value: input[projection.modifier] };
    case 'ignoreDefense':
      return {
        kind: 'bound',
        address: 'damageFunction.ignoreDefense',
        value:
          input.damageFunction.status === 'resolved'
            ? input.damageFunction.ignoreDefense
            : input.damageFunction,
      };
    case 'ignoreDamageCut':
      return { kind: 'bound', address: 'ignoreDamageCut', value: input.ignoreDamageCut };
    case 'npSpecial':
      return {
        kind: 'bound',
        address: 'npSpecialMultipliers',
        value: input.npSpecialMultipliers,
      };
    case 'npVariantSelection':
      return {
        kind: 'bound',
        address: 'npVariantSelection.damageInput',
        value: {
          variant: calculation.noblePhantasmVariant,
          cardType: input.cardType,
          npMultipliers: input.npMultipliers,
          damageFunction: input.damageFunction,
        },
      };
    case null:
      return { kind: 'unbound', reason: 'projection_has_no_damage_input_binding' };
  }
}

export function userControlSideObservation(
  projection: EffectProjection,
  calculation: Extract<CalculationExecution, { status: 'executable' }>,
  executionObservation: CalculationExecutionObservation,
): ProductionUserControlSideObservation {
  if (calculation.executionObservation !== executionObservation)
    throw new TypeError('production_control_execution_observation_identity_mismatch');
  return controlSideObservation(projection, calculation, executionObservation);
}

function controlSideObservation(
  projection: EffectProjection,
  calculation: UserControlCalculationSource,
  executionObservation: CalculationExecutionObservation,
): ProductionUserControlSideObservation {
  const operationEvents: ProductionUserControlOperationEvent[] =
    executionObservation.targetExecution?.selection === 'selected' ||
    executionObservation.targetExecution?.selection === 'unresolved'
      ? executionObservation.targetExecution.operationEvents
          .filter((event) => event.operationId === projection.operationId)
          .map((event) => ({
            projectionKey: event.projectionKey,
            operationId: event.operationId,
            contributionId: event.contributionId,
            kind: event.operationKind,
            operationOutcome: event.operationOutcome,
            projectionOutcome: event.projectionOutcome,
            projectionValuePermille: event.projectionValuePermille,
          }))
      : [];
  const projections: ProductionUserControlProjectionObservation[] = calculation.effects
    .filter(
      (candidate) =>
        candidate.projectionKey === projection.projectionKey &&
        candidate.operationId === projection.operationId &&
        candidate.contributionId === projection.contributionId,
    )
    .map((candidate) => ({
      projectionKey: candidate.projectionKey,
      operationId: candidate.operationId,
      contributionId: candidate.contributionId,
      outcome: candidate.outcome,
      valuePermille: candidate.valuePermille,
    }));
  const effectiveContributions: ProductionUserControlEffectiveContribution[] =
    projection.contributionId === null
      ? []
      : calculation.effectiveContributions.contributions
          .filter(
            (contribution) =>
              contribution.operationId === projection.operationId &&
              contribution.contributionId === projection.contributionId,
          )
          .map((contribution) => ({
            operationId: contribution.operationId,
            contributionId: contribution.contributionId,
            modifier: contribution.modifier,
            resolvedValue: contribution.resolvedValue,
            executionOutcome: contribution.executionOutcome,
            effective: contribution.effective,
          }));
  return {
    executionObservation,
    operationEvents,
    projections,
    inputBinding: controlDamageInputBinding(projection, calculation),
    damageInputDefenseBuff: calculation.input.defenseBuff,
    effectiveContributions,
    damageResult: {
      status: calculation.result.status,
      rows: 'rows' in calculation.result ? calculation.result.rows : [],
      ...(calculation.result.status === 'unavailable' ? { reason: calculation.result.reason } : {}),
    },
    ...(calculation.profileContinuity ? { profileContinuity: calculation.profileContinuity } : {}),
  };
}

export function selectedProfileControlIdentity(
  ownerId: string,
  projection: EffectProjection,
  profileKey: string,
): ProductionUserControlIdentity {
  return {
    ownerId,
    profileKey,
    path: 'selectedProfile',
    projectionKey: projection.projectionKey,
    operationId: projection.operationId,
    contributionId: projection.contributionId,
    modifier: projection.modifier,
    contributionControl: projection.contributionControl,
  };
}

export interface RankingUserControlSource {
  detail: RankingPolicyDetail;
  trace: RankingExecutionObservation | null;
  plannedCandidates: readonly {
    key: string;
    profileKey: string;
    execution: CalculationExecution;
  }[];
}

/** Uses the alternate already calculated for areaContribution; never replays a scenario. */
export function rankingWithoutAreaControlObservation(
  candidateSet: RankingCandidateCalculation,
  detail: RankingPolicyDetail,
  projection: EffectProjection,
): ProductionUserControlObservation {
  const area = detail.areaContribution;
  if (!area) throw new TypeError('production_ranking_area_contribution_missing');
  const trace = candidateSet.executionObservations?.get(detail.entryId) ?? null;
  const absent: CalculationExecutionObservation = {
    battlePointWitness: null,
    targetExecution: null,
  };
  return {
    identity: {
      ...selectedProfileControlIdentity(detail.servantId, projection, detail.entryId),
      path: 'withoutAreaAlternate',
    },
    enabled: controlSideObservation(
      projection,
      {
        ...detail,
        noblePhantasmVariant: trace?.selectedExecution.noblePhantasmVariant ?? null,
        ...(trace?.selectedExecution.profileContinuity
          ? { profileContinuity: trace.selectedExecution.profileContinuity }
          : {}),
      },
      trace?.selected ?? absent,
    ),
    excluded: controlSideObservation(
      projection,
      {
        input: area.withoutAreaInput,
        effects: area.withoutAreaEffects,
        result: area.withoutAreaResult,
        effectiveContributions: area.effectiveContributions,
        noblePhantasmVariant: trace?.withoutAreaExecution?.noblePhantasmVariant ?? null,
        ...(trace?.withoutAreaExecution?.profileContinuity
          ? { profileContinuity: trace.withoutAreaExecution.profileContinuity }
          : {}),
      },
      trace?.withoutAreaAlternate ?? absent,
    ),
    rankingSource: {
      detail,
      trace,
      plannedCandidates: candidateSet.plan.candidateKeys.flatMap((key, index) => {
        const profile = candidateSet.plan.attackProfiles[index];
        const execution = candidateSet.executions[index];
        return profile && execution
          ? [{ key, profileKey: attackProfileKey(profile), execution }]
          : [];
      }),
    },
  };
}

/** Reference checks happen before artifact serialization, while producer objects are still live. */
export function rankingUserControlChecks(
  observation: ProductionUserControlObservation,
): Record<string, boolean> {
  const source = observation.rankingSource;
  const detail = source?.detail;
  const area = detail?.areaContribution;
  const trace = source?.trace;
  const selected = trace?.selectedExecution;
  const alternate = trace?.withoutAreaExecution;
  const candidates =
    source?.plannedCandidates.filter(
      ({ key, profileKey }) =>
        key === detail?.candidateEvidence.candidateKey && profileKey === detail.entryId,
    ) ?? [];
  const candidate = candidates.length === 1 ? (candidates[0] ?? null) : null;
  const selectedProjection = detail?.effects.filter(
    (projection) =>
      projection.operationId === observation.identity.operationId &&
      projection.projectionKey === observation.identity.projectionKey &&
      projection.contributionId === observation.identity.contributionId,
  );
  const projection = selectedProjection?.length === 1 ? selectedProjection[0] : null;
  const selectedTarget = trace?.selected.targetExecution;
  const alternateTarget = trace?.withoutAreaAlternate?.targetExecution;
  const sameValue = (left: unknown, right: unknown) =>
    JSON.stringify(left) === JSON.stringify(right);
  const sideMatches = (side: ProductionUserControlSideObservation, execution: typeof selected) => {
    if (!projection || !execution?.executionObservation) return false;
    const expected = controlSideObservation(projection, execution, execution.executionObservation);
    return (
      side.executionObservation === execution.executionObservation &&
      side.damageResult.rows === ('rows' in execution.result ? execution.result.rows : undefined) &&
      sameValue(side, expected)
    );
  };
  const selectedContributions = selected?.effectiveContributions.contributions;
  const alternateContributions = alternate?.effectiveContributions.contributions;
  const policiesMatch =
    selectedContributions !== undefined &&
    alternateContributions !== undefined &&
    selectedContributions.length === alternateContributions.length &&
    selectedContributions.every((contribution) => {
      const matches = alternateContributions.filter(
        (other) =>
          other.operationId === contribution.operationId &&
          other.contributionId === contribution.contributionId,
      );
      const other = matches.length === 1 ? matches[0] : null;
      const projections =
        detail?.effects.filter((effect) => effect.operationId === contribution.operationId) ?? [];
      const scopes = new Set(projections.map((effect) => effect.contributionScope));
      const partyWide = scopes.size === 1 && scopes.has('partyWide');
      if (!other || scopes.size > 1) return false;
      const expectedAreaDecision = partyWide
        ? { kind: 'excluded', reason: 'areaView' }
        : { kind: 'included' };
      const expectedEffective =
        other.executionOutcome === 'applied' &&
        other.selfDecision.kind === 'included' &&
        other.conditionDecision.kind === 'included' &&
        !partyWide;
      return (
        sameValue(contribution.areaViewDecision, { kind: 'included' }) &&
        sameValue(other.areaViewDecision, expectedAreaDecision) &&
        sameValue(contribution.selfDecision, other.selfDecision) &&
        sameValue(contribution.conditionDecision, other.conditionDecision) &&
        // An excluded final contribution need not read its value. Retained contributions must agree.
        (partyWide ||
          (contribution.executionOutcome === other.executionOutcome &&
            contribution.resolvedValue === other.resolvedValue)) &&
        contribution.modifier === other.modifier &&
        contribution.effective ===
          (contribution.executionOutcome === 'applied' &&
            contribution.selfDecision.kind === 'included' &&
            contribution.conditionDecision.kind === 'included') &&
        other.effective === expectedEffective
      );
    });
  return {
    sourcePath: observation.identity.path === 'withoutAreaAlternate',
    sourcePresent:
      source !== undefined && detail !== undefined && area !== null && area !== undefined,
    tracePresent:
      trace !== null &&
      trace !== undefined &&
      selected !== undefined &&
      alternate !== null &&
      alternate !== undefined,
    candidateIdentity:
      candidate !== null &&
      trace?.candidateKey === candidate.key &&
      detail?.candidateEvidence.attackProfileKey === candidate.profileKey &&
      attackProfileKey(detail.attackProfile) === candidate.profileKey &&
      observation.identity.profileKey === candidate.profileKey &&
      observation.identity.ownerId === detail.servantId,
    selectedCandidateReferences:
      candidate?.execution.status === 'executable' &&
      selected !== undefined &&
      candidate.execution.input === selected.input &&
      candidate.execution.result === selected.result &&
      candidate.execution.effects === selected.effects &&
      candidate.execution.effectiveContributions === selected.effectiveContributions,
    selectedReferences:
      selected !== undefined &&
      detail !== undefined &&
      trace !== null &&
      trace !== undefined &&
      trace.selected === selected.executionObservation &&
      trace.selectedInput === selected.input &&
      trace.selectedEffectiveContributions === selected.effectiveContributions &&
      detail.input === selected.input &&
      detail.result === selected.result &&
      detail.effects === selected.effects &&
      detail.effectiveContributions === selected.effectiveContributions,
    alternateReferences:
      alternate !== null &&
      alternate !== undefined &&
      area !== null &&
      area !== undefined &&
      trace !== null &&
      trace !== undefined &&
      trace.withoutAreaAlternate === alternate.executionObservation &&
      trace.withoutAreaInput === alternate.input &&
      trace.withoutAreaEffectiveContributions === alternate.effectiveContributions &&
      area.withoutAreaInput === alternate.input &&
      area.withoutAreaResult === alternate.result &&
      area.withoutAreaEffects === alternate.effects &&
      area.effectiveContributions === alternate.effectiveContributions,
    separateExecutions:
      selected !== undefined &&
      alternate !== null &&
      alternate !== undefined &&
      selected !== alternate &&
      trace?.selected !== trace?.withoutAreaAlternate,
    targetIdentity:
      selectedTarget?.selection === 'selected' &&
      alternateTarget?.selection === 'selected' &&
      selectedTarget.candidateIndex === alternateTarget.candidateIndex &&
      sameValue(selectedTarget.targetCandidate, alternateTarget.targetCandidate),
    areaPolicies:
      detail?.contributionPolicy.kind === 'ranking' &&
      detail.contributionPolicy.areaView === 'included' &&
      area?.contributionPolicy.kind === 'ranking' &&
      area.contributionPolicy.areaView === 'excluded' &&
      detail.contributionPolicy.selfBuffs === area.contributionPolicy.selfBuffs &&
      detail.contributionPolicy.conditionalEffects === area.contributionPolicy.conditionalEffects,
    controlledScope: projection?.contributionScope === 'partyWide',
    contributionDecisions: policiesMatch,
    selectedSideSource: sideMatches(observation.enabled, selected),
    alternateSideSource: sideMatches(observation.excluded, alternate ?? undefined),
  };
}
