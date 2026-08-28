import type { EffectProjection } from '@fgo-lab/battle-execution';
import type { TargetContext } from '@fgo-lab/schema';
import { applyCanonicalInputCommand, type EffectInputViewModel } from './canonicalInputs';
import type { EffectControlViewModel } from './effectControls';
import type { ResolvedScenario } from './rankingPolicy';
import { setActivationFactsForProjection } from './activationContext';

interface RankingEffectPolicy {
  projection: EffectProjection;
  included: boolean;
}

export interface RankingExecutionPolicy {
  targetContext: TargetContext;
  effects: readonly RankingEffectPolicy[];
}

export function compileRankingExecutionPolicy(
  targetContext: TargetContext,
  controls: readonly EffectControlViewModel[],
  includedKeys: ReadonlySet<string>,
): RankingExecutionPolicy {
  return {
    targetContext,
    effects: controls
      .filter(({ interaction }) => interaction !== 'none')
      .map(({ key, projection }) => ({ projection, included: includedKeys.has(key) })),
  };
}

function setDecision(
  scenario: ResolvedScenario,
  projection: EffectProjection,
  included: boolean,
): ResolvedScenario {
  const decision = projection.decision;
  if (decision.state === 'none' || decision.kind !== 'effect') return scenario;
  return {
    ...scenario,
    effectDecisions: [
      ...scenario.effectDecisions.filter(({ decisionKey }) => decisionKey !== decision.decisionKey),
      {
        decisionKey: decision.decisionKey,
        operationEnabled: decision.plan.activation === 'user' ? included : true,
        conditionSatisfaction: 'evaluate',
      },
    ],
  };
}

function setWorldFact(
  scenario: ResolvedScenario,
  projection: EffectProjection,
  included: boolean,
): ResolvedScenario {
  const decision = projection.decision;
  if (decision.state === 'none' || decision.kind !== 'worldFact') return scenario;
  return {
    ...scenario,
    worldFactAssertions: [
      ...scenario.worldFactAssertions.filter(
        ({ decisionKey }) => decisionKey !== decision.decisionKey,
      ),
      ...(included ? [{ decisionKey: decision.decisionKey, fact: decision.fact }] : []),
    ],
  };
}

function setChainedProc(
  scenario: ResolvedScenario,
  projection: EffectProjection,
  included: boolean,
  inputs: readonly EffectInputViewModel[],
): ResolvedScenario {
  if (projection.proc.kind !== 'chainedRolls') return scenario;
  const input = inputs.find(
    (candidate) =>
      candidate.kind === 'procSuccessCount' &&
      candidate.relatedProjectionKeys.includes(projection.projectionKey),
  );
  if (!input) throw new TypeError(`ranking_chained_proc_input_missing:${projection.projectionKey}`);
  return applyCanonicalInputCommand(scenario, {
    kind: 'setCanonicalIntegerInput',
    key: input.key,
    value: included ? input.maximum : input.minimum,
  });
}

export function applyRankingExecutionPolicy(
  scenario: ResolvedScenario,
  policy: RankingExecutionPolicy,
  inputs: readonly EffectInputViewModel[],
): ResolvedScenario {
  return policy.effects.reduce(
    (current, { projection, included }) => {
      const withActivation = setActivationFactsForProjection(current, projection, included);
      const withProc = setChainedProc(withActivation, projection, included, inputs);
      if (projection.proc.kind === 'chainedRolls') return withProc;
      return setWorldFact(setDecision(withProc, projection, included), projection, included);
    },
    { ...scenario, targetContext: policy.targetContext },
  );
}
