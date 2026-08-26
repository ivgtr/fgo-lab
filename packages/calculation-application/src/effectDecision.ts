import type { EffectProjection } from '@fgo-lab/battle-execution';
import type { CalculationScenario } from '@fgo-lab/schema';

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
    conditionSatisfaction:
      enabled && projection.decision.plan.condition === 'userMayAssume'
        ? 'assumeSatisfied'
        : 'evaluate',
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
  peers: readonly EffectProjection[] = [],
): ResolvedScenario {
  const exclusiveDecisionKeys = new Set(
    enabled
      ? peers.flatMap((peer) => {
          if (peer.decision.state === 'none' || peer.projectionKey === projection.projectionKey)
            return [];
          const conflicts = projection.selectionGroups.some((selectedGroup) =>
            peer.selectionGroups.some(
              (peerGroup) =>
                peerGroup.groupKey === selectedGroup.groupKey &&
                peerGroup.candidateKey !== selectedGroup.candidateKey,
            ),
          );
          return conflicts ? [peer.decision.decisionKey] : [];
        })
      : [],
  );
  const withoutExclusivePeers: ResolvedScenario = {
    ...scenario,
    effectDecisions: scenario.effectDecisions.filter(
      (decision) => !exclusiveDecisionKeys.has(decision.decisionKey),
    ),
    worldFactAssertions: scenario.worldFactAssertions.filter(
      (assertion) => !exclusiveDecisionKeys.has(assertion.decisionKey),
    ),
  };
  const decided = applyEffectDecisionCommand(
    withoutExclusivePeers,
    commandForEffectProjection(projection, enabled),
  );
  if (projection.source.origin !== 'support' || !decided.support) return decided;
  const reference = {
    sourceInstanceId: projection.source.sourceInstanceId,
    skillId: projection.source.skillId,
    effectId: projection.source.effectId,
    effectOccurrenceId: projection.source.effectOccurrenceId,
  };
  const exclusiveReferences = peers.flatMap((peer) =>
    peer.decision.state !== 'none' && exclusiveDecisionKeys.has(peer.decision.decisionKey)
      ? [peer.source]
      : [],
  );
  const selected = decided.support.composition.selectedEffects.filter(
    (candidate) =>
      !exclusiveReferences.some(
        (reference) =>
          candidate.sourceInstanceId === reference.sourceInstanceId &&
          candidate.skillId === reference.skillId &&
          candidate.effectId === reference.effectId &&
          candidate.effectOccurrenceId === reference.effectOccurrenceId,
      ),
  );
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
        selectedEffects: enabled
          ? selected.some(matches)
            ? selected
            : [...selected, reference]
          : selected.filter((candidate) => !matches(candidate)),
      },
    },
  };
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
