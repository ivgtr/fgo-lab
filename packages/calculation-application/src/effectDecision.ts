import type { EffectProjection } from '@fgo-lab/battle-execution';
import type { CalculationScenario } from '@fgo-lab/schema';
import { applyCanonicalInputCommand, type EffectInputViewModel } from './canonicalInputs';
import { conditionAllowsEffectLocalDecision, type EffectControlViewModel } from './effectControls';
import { setEffectSourceEnabled, setOperationSourceEnabled } from './scenarioCommands';

type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

export type EffectDecisionCommand =
  | {
      kind: 'setEffectDecision';
      decisionKey: string;
      operationEnabled: boolean;
      conditionSatisfaction: 'evaluate' | 'assumeSatisfied';
    }
  | {
      kind: 'setWorldFact';
      decisionKey: string;
      enabled: boolean;
      fact: ResolvedScenario['worldFactAssertions'][number]['fact'];
    };

export function commandForEffectProjection(
  projection: EffectProjection,
  enabled: boolean,
  conditionSatisfaction: 'evaluate' | 'assumeSatisfied' = 'evaluate',
): EffectDecisionCommand {
  if (projection.decision.state === 'none')
    throw new TypeError(`effect_projection_not_controllable:${projection.projectionKey}`);
  if (projection.decision.kind === 'worldFact')
    return {
      kind: 'setWorldFact',
      decisionKey: projection.decision.decisionKey,
      enabled,
      fact: projection.decision.fact,
    };
  return {
    kind: 'setEffectDecision',
    decisionKey: projection.decision.decisionKey,
    operationEnabled: projection.decision.plan.activation === 'user' ? enabled : true,
    conditionSatisfaction,
  };
}

export function applyEffectDecisionCommand(
  scenario: ResolvedScenario,
  command: EffectDecisionCommand,
): ResolvedScenario {
  if (command.kind === 'setWorldFact')
    return {
      ...scenario,
      worldFactAssertions: [
        ...scenario.worldFactAssertions.filter(
          (assertion) => assertion.decisionKey !== command.decisionKey,
        ),
        ...(command.enabled ? [{ decisionKey: command.decisionKey, fact: command.fact }] : []),
      ],
    };
  return {
    ...scenario,
    effectDecisions: [
      ...scenario.effectDecisions.filter(
        (decision) => decision.decisionKey !== command.decisionKey,
      ),
      {
        decisionKey: command.decisionKey,
        operationEnabled: command.operationEnabled,
        conditionSatisfaction: command.conditionSatisfaction,
      },
    ],
  };
}

export function applyEffectProjectionDecision(
  scenario: ResolvedScenario,
  projection: EffectProjection,
  enabled: boolean,
): ResolvedScenario {
  if (projection.decision.state === 'none')
    throw new TypeError(`effect_projection_not_controllable:${projection.projectionKey}`);
  const decisionKey = projection.decision.decisionKey;
  const current = scenario.effectDecisions.find((decision) => decision.decisionKey === decisionKey);
  const decided = applyEffectDecisionCommand(
    scenario,
    commandForEffectProjection(projection, enabled, current?.conditionSatisfaction ?? 'evaluate'),
  );
  if (projection.source.origin !== 'support' || !decided.support) return decided;
  const reference = {
    sourceInstanceId: projection.source.sourceInstanceId,
    skillId: projection.source.skillId,
    effectId: projection.source.effectId,
    effectOccurrenceId: projection.source.effectOccurrenceId,
  };
  const overrides = decided.support.composition.effectInclusions;
  const matches = (candidate: typeof reference) =>
    candidate.sourceInstanceId === reference.sourceInstanceId &&
    candidate.skillId === reference.skillId &&
    candidate.effectId === reference.effectId &&
    candidate.effectOccurrenceId === reference.effectOccurrenceId;
  return {
    ...decided,
    support: {
      ...decided.support,
      composition: {
        ...decided.support.composition,
        effectInclusions: enabled
          ? overrides.filter((candidate) => !matches(candidate))
          : overrides.some(matches)
            ? overrides
            : [...overrides, { ...reference, included: false }],
      },
    },
  };
}

export function applyEffectConditionDecision(
  scenario: ResolvedScenario,
  projection: EffectProjection,
  satisfied: boolean,
  peers: readonly EffectProjection[] = [],
): ResolvedScenario {
  if (projection.decision.state === 'none' || projection.decision.kind !== 'effect')
    throw new TypeError(`effect_condition_not_controllable:${projection.projectionKey}`);
  const decisionKey = projection.decision.decisionKey;
  const current = scenario.effectDecisions.find((decision) => decision.decisionKey === decisionKey);
  let next = scenario;
  if (satisfied)
    for (const peer of peers) {
      if (
        peer.projectionKey === projection.projectionKey ||
        peer.decision.state === 'none' ||
        peer.decision.kind !== 'effect'
      )
        continue;
      const conflicts = projection.selectionGroups.some((selectedGroup) =>
        peer.selectionGroups.some(
          (peerGroup) =>
            peerGroup.groupKey === selectedGroup.groupKey &&
            peerGroup.candidateKey !== selectedGroup.candidateKey,
        ),
      );
      if (!conflicts) continue;
      const peerDecisionKey = peer.decision.decisionKey;
      const peerDecision = next.effectDecisions.find(
        (decision) => decision.decisionKey === peerDecisionKey,
      );
      next = applyEffectDecisionCommand(next, {
        kind: 'setEffectDecision',
        decisionKey: peerDecisionKey,
        operationEnabled: peerDecision?.operationEnabled ?? peer.decision.state === 'enabled',
        conditionSatisfaction: 'evaluate',
      });
    }
  return applyEffectDecisionCommand(next, {
    kind: 'setEffectDecision',
    decisionKey: projection.decision.decisionKey,
    operationEnabled: current?.operationEnabled ?? projection.decision.state === 'enabled',
    conditionSatisfaction: satisfied ? 'assumeSatisfied' : 'evaluate',
  });
}

export function applyEffectProjectionDecisions(
  scenario: ResolvedScenario,
  projections: readonly EffectProjection[],
  enabled: boolean,
): ResolvedScenario {
  return projections.reduce(
    (current, projection) => applyEffectProjectionDecision(current, projection, enabled),
    scenario,
  );
}

/**
 * Maps one visible effect-chip interaction to the independent scenario contracts it needs.
 * Deterministic quantity conditions remain evaluator-owned and are never asserted here.
 */
export function applyEffectPresentationDecision(
  scenario: ResolvedScenario,
  projection: EffectProjection,
  enabled: boolean,
  peers: readonly EffectProjection[] = [],
): ResolvedScenario {
  let sourceResolved = enabled ? setEffectSourceEnabled(scenario, projection, true) : scenario;
  if (enabled)
    for (const source of projection.activationSources)
      sourceResolved = setOperationSourceEnabled(sourceResolved, source, true);
  const inclusionResolved = applyEffectProjectionDecision(sourceResolved, projection, enabled);
  if (
    projection.decision.state === 'none' ||
    projection.decision.kind !== 'effect' ||
    projection.decision.plan.condition !== 'userMayAssume' ||
    !conditionAllowsEffectLocalDecision(projection.explanation.condition)
  )
    return inclusionResolved;
  return applyEffectConditionDecision(inclusionResolved, projection, enabled, peers);
}

export function applyEffectControlPresentationDecision(
  scenario: ResolvedScenario,
  control: EffectControlViewModel,
  enabled: boolean,
  peers: readonly EffectProjection[] = [],
  inputs: readonly EffectInputViewModel[] = [],
): ResolvedScenario {
  if (control.projection.proc.kind !== 'chainedRolls')
    return applyEffectPresentationDecision(scenario, control.projection, enabled, peers);
  const procInput = inputs.find(
    (input) =>
      input.kind === 'procSuccessCount' &&
      input.relatedProjectionKeys.includes(control.projection.projectionKey),
  );
  if (!procInput)
    throw new TypeError(`chained_proc_input_missing:${control.projection.projectionKey}`);
  return applyCanonicalInputCommand(scenario, {
    kind: 'setCanonicalIntegerInput',
    key: procInput.key,
    value: enabled ? procInput.maximum : procInput.minimum,
  });
}
