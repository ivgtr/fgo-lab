import { noblePhantasmVariantKey, type ServantMaster } from '@fgo-lab/master-data';
import {
  attackProfileForSelection,
  attackProfileKey,
  createStaticActorFormProfiles,
} from './attackProfile';
import type { ResolvedAttackerFormExecution } from '@fgo-lab/battle-execution';
import type { ScenarioPreparationOutcome } from './scenario';
import type {
  OrderedScenarioExecution,
  PreparedOrderedScenario,
  ResolvedCanonicalInputSet,
} from '@fgo-lab/battle-execution';
import {
  collectActivationRequirementOwners,
  projectBattleTraitPresence,
} from '@fgo-lab/battle-execution';
import type { ActorFormId } from '@fgo-lab/master-data';
import type { CalculationScenario } from '@fgo-lab/schema';
import type {
  AttackProfileContinuity,
  ResolvedCalculationInput,
  CalculationApplicationOutcome,
} from './scenario';
import { calculateDamageResolutionValue, type DamageResolutionValue } from './damageResolution';
import type { PreparedDamageMatrixCache } from './preparedDamageInputCache';
import { evaluateCalculationEvidence } from './evidence';

type ResolvedCalculationScenario = Extract<CalculationScenario, { mode: 'resolved' }>;
type DamageMatrixCache = PreparedDamageMatrixCache<DamageResolutionValue>;

/** Project completed execution into application input/result; no ranking-specific rules. */
export function resolvePreparedOrderedScenario(
  scenario: ResolvedCalculationScenario,
  prepared: PreparedOrderedScenario,
  canonicalInputs: ResolvedCanonicalInputSet,
  execution: OrderedScenarioExecution,
  terminalActorFormId: ActorFormId,
  profileContinuity: AttackProfileContinuity,
): Extract<ResolvedCalculationInput, { status: 'executable' }> {
  const projections = [...execution.projections, ...execution.retainedProjections];
  const damageState = execution.operations.find(
    ({ operation, outcome }) => operation.kind === 'executeNpDamage' && outcome === 'applied',
  )?.state;
  const warnings = execution.issues.map((issue) => {
    if (issue.kind === 'invalidTargetContext')
      return `${issue.kind}:${issue.detail}:${issue.sourceKeys.join(',')}`;
    if (issue.kind === 'invalidCanonicalInput')
      return `${issue.kind}:${issue.inputKey}:${issue.detail}`;
    if (issue.kind === 'constraintValidationUnsupported')
      return `${issue.kind}:${issue.sourceKeys.join(',')}:${issue.reason}`;
    if (issue.kind === 'constraintConflict')
      return `${issue.kind}:${issue.sourceKeys.join(',')}:${issue.conflicts
        .map((conflict) => {
          if (conflict.kind === 'exclusiveTrait')
            return `${conflict.kind}:${conflict.scope}:${conflict.group}:${conflict.traits.join(',')}`;
          if (conflict.kind === 'traitPolarity')
            return `${conflict.kind}:${conflict.scope}:${conflict.trait}`;
          if (conflict.kind === 'quantityEquality')
            return `${conflict.kind}:${conflict.quantity}:${conflict.values.join(',')}`;
          if (conflict.kind === 'quantityRange')
            return `${conflict.kind}:${conflict.quantity}:${conflict.ranges
              .map((range) => `${String(range.min)}-${String(range.max)}`)
              .join(',')}`;
          if (conflict.kind === 'cardMismatch')
            return `${conflict.kind}:${conflict.cards.join(',')}`;
          return conflict.kind;
        })
        .join('|')}`;
    if (issue.kind === 'unsupportedParameter')
      return `${issue.kind}:${issue.operationId}:${issue.parameter}`;
    if (issue.kind === 'invalidActivationContext')
      return `${issue.kind}:${issue.factKey ?? 'missing'}:${issue.detail}`;
    return `${issue.kind}:${issue.operationId}:${issue.detail}`;
  });
  const decisionTrace = scenario.effectDecisions.map((decision) => ({
    step: 'user-decision',
    detail: `${decision.decisionKey}:operation:${String(decision.operationEnabled)}:condition:${decision.conditionSatisfaction}`,
  }));
  const worldFactTrace = scenario.worldFactAssertions.map((assertion) => ({
    step: 'world-fact',
    detail:
      assertion.fact.kind === 'trait'
        ? `${assertion.decisionKey}:trait:${assertion.fact.scope}:${assertion.fact.trait}:${String(assertion.fact.present)}`
        : `${assertion.decisionKey}:quantity:${assertion.fact.quantity}:${String(assertion.fact.value)}`,
  }));
  const activationTrace = scenario.activationFacts.map((fact) => ({
    step: 'activation-fact',
    detail:
      fact.kind === 'choice'
        ? `${fact.source.sourceInstanceId}:choice:${fact.family}:${fact.candidate}`
        : fact.kind === 'operationTrigger'
          ? `${fact.source.sourceInstanceId}:operation-trigger:${String(fact.position)}`
          : `${fact.source.sourceInstanceId}:source-quantity:${fact.quantity}:${fact.subjectId}:${fact.comparison}:${String(fact.value)}`,
  }));
  const canonicalInputTrace = Object.entries(canonicalInputs.values).map(([key, value]) => ({
    step: 'canonical-input',
    detail: `${key}:${String(value)}:${scenario.canonicalInputValues[key] ? 'explicit' : 'default'}`,
  }));
  return {
    status: 'executable',
    noblePhantasmVariant: execution.state.noblePhantasmVariant,
    terminalActorFormId,
    profileContinuity,
    input: execution.input,
    precision:
      prepared.preparationRequiredInputs.length > 0 ? 'inputRequired' : execution.precision,
    evidenceKeys: [
      'master:normalized-v7',
      ...projections.flatMap((projection) =>
        projection.outcome === 'applied' &&
        projection.modifier &&
        projection.modifier !== 'npSpecial'
          ? [`effect-operation:${projection.modifier}`]
          : [],
      ),
    ],
    warnings,
    effects: projections,
    effectiveContributions: execution.effectiveContributions,
    requiredInputs: [
      ...new Map(
        [
          ...prepared.preparationRequiredInputs.map(({ definition, effectOccurrenceIds }) => ({
            ...definition,
            effectOccurrenceIds,
          })),
          ...execution.requiredInputs,
        ].map((definition) => [definition.key, definition]),
      ).values(),
    ],
    inputDefinitions: [...execution.inputDefinitions],
    activationRequirements: collectActivationRequirementOwners(prepared.operations),
    appliedPreparationActions: prepared.appliedPreparationActions,
    targetStateTraitsAtDamage: damageState
      ? [...projectBattleTraitPresence(damageState, 'targetState').entries()].flatMap(
          ([trait, present]) => (present ? [trait] : []),
        )
      : [],
    preparationRejection: null,
    trace: [
      ...decisionTrace,
      ...activationTrace,
      ...worldFactTrace,
      ...canonicalInputTrace,
      ...execution.operations.map((operation) => ({
        step: `${operation.operation.phase}:${operation.operation.kind}`,
        detail: `${operation.operation.order}:${operation.operation.operationId}:${operation.outcome}`,
      })),
    ],
  };
}

function requiredInputsForResult(inputs: ResolvedCalculationInput['requiredInputs']) {
  return inputs.map(
    ({ key, owner, label, description, minimum, maximum, step, effectOccurrenceIds }) => ({
      key,
      owner,
      label,
      description,
      minimum,
      maximum,
      step,
      effectOccurrenceIds,
    }),
  );
}

export function resolvedCalculationResult(
  resolved: ResolvedCalculationInput,
  damageCache: DamageMatrixCache,
): CalculationApplicationOutcome {
  if (resolved.status === 'invalid')
    return {
      status: 'invalid',
      issue: resolved.issue,
      issues: [
        {
          code: resolved.issue.kind,
          detail: `${resolved.issue.servantId}:${String(resolved.issue.level)}`,
        },
      ],
    };
  if (resolved.status === 'rejected') {
    const evidence = evaluateCalculationEvidence(resolved.evidenceKeys);
    const issue = {
      code: `preparation:${resolved.preparationRejection.code}`,
      detail: resolved.preparationRejection.operationId,
    };
    const common = {
      rows: [] as [],
      effects: [],
      assumptions: [],
      issues: [issue],
      trace: resolved.trace,
      evidence: evidence.evidence,
    };
    const rejection = resolved.preparationRejection.code;
    if (
      rejection === 'attackerDead' ||
      rejection === 'insufficientNpGauge' ||
      rejection === 'resourceRequirementExceedsCapacity'
    )
      return {
        ...common,
        status: 'unavailable',
        reason:
          rejection === 'attackerDead'
            ? 'attackerDead'
            : rejection === 'insufficientNpGauge'
              ? 'insufficientNpGauge'
              : 'npCapacityExceeded',
      };
    return resolved.preparationRejection.code === 'preparationInputRequired'
      ? {
          ...common,
          status: 'inputRequired',
          requiredInputs: requiredInputsForResult(resolved.requiredInputs),
        }
      : {
          ...common,
          status: 'unsupported',
          missingEvidence: [`preparation:${resolved.preparationRejection.code}`],
        };
  }
  if (
    resolved.profileContinuity &&
    resolved.precision !== 'inputRequired' &&
    resolved.profileContinuity.kind !== 'matched'
  ) {
    const continuity = resolved.profileContinuity;
    const evidence = evaluateCalculationEvidence(resolved.evidenceKeys);
    const common = {
      rows: [] as [],
      effects: resolved.effects.map((effect) => ({
        projectionKey: effect.projectionKey,
        outcome: effect.outcome,
        explanationCode: effect.explanation.code,
      })),
      assumptions: [],
      issues: resolved.warnings.map((warning) => ({ code: warning, detail: warning })),
      trace: resolved.trace,
      evidence: evidence.evidence,
    };
    return continuity.kind === 'unresolved'
      ? {
          ...common,
          status: 'unsupported',
          missingEvidence: [`attackProfileContinuity:${continuity.reason}`],
        }
      : {
          ...common,
          status: 'unavailable',
          reason:
            continuity.kind === 'unavailableNoAttack'
              ? 'selectedAttackProfileHasNoAttack'
              : 'selectedAttackProfileChanged',
        };
  }
  const calculation = resolved.noblePhantasmVariant
    ? damageCache.getOrCreate(
        { noblePhantasmVariant: resolved.noblePhantasmVariant.ref, input: resolved.input },
        () => calculateDamageResolutionValue(resolved.input),
      )
    : calculateDamageResolutionValue(resolved.input);
  const evidence = evaluateCalculationEvidence([
    ...calculation.evidence.map((entry) => entry.key),
    ...resolved.evidenceKeys,
  ]);
  const effects = resolved.effects.map((effect) => ({
    projectionKey: effect.projectionKey,
    outcome: effect.outcome,
    explanationCode: effect.explanation.code,
  }));
  const resolutionIssues = resolved.warnings.map((warning) => ({ code: warning, detail: warning }));
  return resolved.precision === 'inputRequired'
    ? {
        status: 'inputRequired',
        rows: [],
        requiredInputs: requiredInputsForResult(resolved.requiredInputs),
        effects,
        assumptions: calculation.assumptions,
        issues: [...calculation.issues, ...resolutionIssues],
        trace: [...calculation.trace, ...resolved.trace],
        evidence: evidence.evidence,
      }
    : calculation.status === 'unsupported' ||
        resolved.precision === 'unsupported' ||
        evidence.status === 'unsupported'
      ? {
          status: 'unsupported',
          rows: [],
          effects,
          assumptions: calculation.assumptions,
          issues: [...calculation.issues, ...resolutionIssues],
          trace: [...calculation.trace, ...resolved.trace],
          missingEvidence: [
            ...(calculation.status === 'unsupported' ? calculation.missingEvidence : []),
            ...resolved.warnings,
            ...(evidence.status === 'unsupported' ? evidence.missingEvidence : []),
          ],
          evidence: evidence.evidence,
        }
      : {
          ...calculation,
          effects,
          precision: evidence.precision,
          evidence: evidence.evidence,
          issues: [...calculation.issues, ...resolutionIssues],
          trace: [...calculation.trace, ...resolved.trace],
        };
}
export function resolveAttackProfileContinuity(
  servant: ServantMaster,
  formExecution: ResolvedAttackerFormExecution,
  scenario: ResolvedCalculationScenario,
  prepared: PreparedOrderedScenario,
  execution: OrderedScenarioExecution,
): AttackProfileContinuity {
  const intendedVariant = formExecution.state.selectedNoblePhantasmVariant;
  if (!intendedVariant) return { kind: 'unresolved', reason: 'intendedAttackVariantMissing' };
  const profiles = createStaticActorFormProfiles(servant);
  let intendedProfileKey: string;
  try {
    intendedProfileKey = attackProfileKey(
      attackProfileForSelection(
        servant,
        profiles,
        formExecution.state.currentFormId,
        intendedVariant,
      ),
    );
  } catch {
    return { kind: 'unresolved', reason: 'intendedAttackProfileUnresolved' };
  }
  const actualVariant = execution.state.noblePhantasmVariant;
  let actualProfileKey: string | null = null;
  if (actualVariant.kind === 'attack') {
    try {
      actualProfileKey = attackProfileKey(
        attackProfileForSelection(
          servant,
          profiles,
          execution.state.actorFormId,
          actualVariant.ref,
        ),
      );
    } catch {
      return { kind: 'unresolved', reason: 'actualAttackProfileUnresolved' };
    }
  }
  if (actualProfileKey === intendedProfileKey)
    return { kind: 'matched', intendedProfileKey, actualProfileKey };
  const disabledSelection = prepared.operations.find(
    (operation) =>
      operation.kind === 'selectNoblePhantasmVariant' &&
      noblePhantasmVariantKey(operation.variant) === noblePhantasmVariantKey(intendedVariant) &&
      scenario.effectDecisions.some(
        (decision) => decision.decisionKey === operation.decisionKey && !decision.operationEnabled,
      ),
  );
  if (!disabledSelection)
    return { kind: 'unresolved', reason: 'selectionChangedWithoutDisabledStructuralControl' };
  if (actualVariant.kind === 'nonAttack') {
    if (
      execution.requiredInputs.length > 0 ||
      prepared.preparationRequiredInputs.length > 0 ||
      execution.issues.length !== 1 ||
      execution.issues[0]?.kind !== 'invalidNoblePhantasmVariant' ||
      execution.issues[0].detail !== 'nonAttackDamage'
    )
      return { kind: 'unresolved', reason: 'nonAttackSelectionHasAdditionalIssues' };
    return {
      kind: 'unavailableNoAttack',
      intendedProfileKey,
      actualProfileKey: null,
      disabledSelectionOperationId: disabledSelection.operationId,
    };
  }
  if (execution.precision !== 'exact' || prepared.preparationRequiredInputs.length > 0)
    return { kind: 'unresolved', reason: 'changedSelectionHasAdditionalIssues' };
  if (actualProfileKey === null)
    return { kind: 'unresolved', reason: 'changedAttackProfileMissing' };
  return {
    kind: 'unavailableDifferentAttack',
    intendedProfileKey,
    actualProfileKey,
    disabledSelectionOperationId: disabledSelection.operationId,
  };
}

export function manualResolvedInput(
  scenario: Extract<CalculationScenario, { mode: 'manual' }>,
): Extract<ResolvedCalculationInput, { status: 'executable' }> {
  return {
    status: 'executable',
    input: scenario.manual,
    precision: 'exact',
    evidenceKeys: ['input:manual-final-modifiers'],
    warnings: [],
    trace: [{ step: 'input-mode', detail: 'manual_final_values' }],
    effects: [],
    effectiveContributions: { contributions: [], effectivePresentationGroupIds: new Set() },
    requiredInputs: [],
    inputDefinitions: [],
    activationRequirements: [],
    appliedPreparationActions: [],
    targetStateTraitsAtDamage: scenario.manual.targetStateTraits,
    noblePhantasmVariant: null,
    terminalActorFormId: null,
    preparationRejection: null,
  };
}

export function rejectedPreparationResolvedInput(
  outcome: Extract<ScenarioPreparationOutcome, { status: 'rejected' }>,
): Extract<ResolvedCalculationInput, { status: 'rejected' }> {
  return {
    status: 'rejected',
    noblePhantasmVariant: null,
    terminalActorFormId: null,
    precision:
      outcome.rejection.code === 'preparationInputRequired' ? 'inputRequired' : 'unsupported',
    evidenceKeys: ['master:normalized-v7'],
    warnings: [],
    trace: [
      {
        step: 'preparation-rejection',
        detail: `${outcome.rejection.operationId}:${outcome.rejection.code}`,
      },
    ],
    effects: [],
    effectiveContributions: { contributions: [], effectivePresentationGroupIds: new Set() },
    requiredInputs: [...outcome.requiredInputs],
    inputDefinitions: [
      ...new Map(
        [...(outcome.recoveryInputDefinitions ?? []), ...outcome.requiredInputs].map((input) => [
          input.key,
          input,
        ]),
      ).values(),
    ],
    activationRequirements: [],
    appliedPreparationActions: outcome.appliedPreparationActions,
    targetStateTraitsAtDamage: [],
    preparationRejection: outcome.rejection,
  };
}

export function invalidResolvedInput(
  outcome: Extract<ScenarioPreparationOutcome, { status: 'invalid' }>,
): Extract<ResolvedCalculationInput, { status: 'invalid' }> {
  return {
    status: 'invalid',
    issue: outcome.issue,
    noblePhantasmVariant: null,
    terminalActorFormId: null,
    precision: 'invalid',
    evidenceKeys: ['master:normalized-v7'],
    warnings: [],
    trace: [
      {
        step: 'scenario-invalid',
        detail: `${outcome.issue.kind}:${outcome.issue.servantId}:${String(outcome.issue.level)}`,
      },
    ],
    effects: [],
    effectiveContributions: { contributions: [], effectivePresentationGroupIds: new Set() },
    requiredInputs: [],
    inputDefinitions: [],
    activationRequirements: [],
    appliedPreparationActions: [],
    targetStateTraitsAtDamage: [],
    preparationRejection: null,
  };
}
