import type { PreparedOrderedScenario } from './executionTypes';
import type { SourceEffect } from './sourceCollection';

const compiledSources = new WeakMap<PreparedOrderedScenario, readonly SourceEffect[]>();

export function retainCompiledSources(
  plan: PreparedOrderedScenario,
  sources: readonly SourceEffect[],
): void {
  compiledSources.set(plan, sources);
}

export function compiledSourcesFor(
  plan: PreparedOrderedScenario,
): readonly SourceEffect[] | undefined {
  return compiledSources.get(plan);
}
