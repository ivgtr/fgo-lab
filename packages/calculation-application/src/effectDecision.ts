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
): ResolvedScenario {
  return applyEffectDecisionCommand(scenario, commandForEffectProjection(projection, enabled));
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
