import { conditionRequiresTrait } from './activation';
import type { EffectProjection, OperationSource } from './contracts';
import type { PreparedOrderedScenario } from './executionTypes';

function sourcesShareActor(left: OperationSource, right: OperationSource): boolean {
  const actorOwnedOrigins = new Set<OperationSource['origin']>(['attacker', 'np', 'passive']);
  return (
    left.sourceId === right.sourceId &&
    ((actorOwnedOrigins.has(left.origin) && actorOwnedOrigins.has(right.origin)) ||
      (left.origin === right.origin && left.sourceInstanceId === right.sourceInstanceId))
  );
}

function activationSourcesByDecision(
  prepared: PreparedOrderedScenario,
): ReadonlyMap<string, readonly OperationSource[]> {
  const { operations } = prepared;
  const sourcesByDecision = new Map<string, OperationSource[]>();
  const addSource = (decisionKey: string, source: OperationSource) => {
    const sources = sourcesByDecision.get(decisionKey) ?? [];
    if (
      !sources.some(
        (candidate) =>
          candidate.origin === source.origin &&
          candidate.sourceInstanceId === source.sourceInstanceId &&
          candidate.skillId === source.skillId,
      )
    )
      sources.push(source);
    sourcesByDecision.set(decisionKey, sources);
  };
  for (const operation of operations) {
    if (operation.activation.kind !== 'linkedDecisions') continue;
    for (const link of operation.activation.links) addSource(link.decisionKey, operation.source);
  }
  for (const decisionOperation of operations) {
    if (decisionOperation.decisionKey === null) continue;
    for (const mutation of operations) {
      if (
        mutation.gameActivation !== 'skillUse' ||
        (mutation.kind !== 'addTrait' &&
          mutation.kind !== 'removeTrait' &&
          mutation.kind !== 'suppressInitialTrait') ||
        !sourcesShareActor(mutation.source, decisionOperation.source) ||
        !conditionRequiresTrait(
          decisionOperation.condition,
          mutation.scope,
          mutation.trait,
          mutation.kind === 'addTrait',
        )
      )
        continue;
      addSource(decisionOperation.decisionKey, mutation.source);
    }
  }
  return sourcesByDecision;
}

export function attachActivationSources(
  prepared: PreparedOrderedScenario,
  projections: readonly EffectProjection[],
): EffectProjection[] {
  const activationSources = activationSourcesByDecision(prepared);
  return projections.map((projection) => ({
    ...projection,
    activationSources:
      projection.decision.state === 'none'
        ? []
        : (activationSources.get(projection.decision.decisionKey) ?? []),
  }));
}
