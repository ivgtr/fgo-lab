import type { PreparedOrderedScenario } from './executionTypes';
import type { SourceEffect } from './sourceCollection';
import type { BattleOperation } from './contracts';
import type { EffectExecutionOperation } from '@fgo-lab/master-data';

const compiledSources = new WeakMap<PreparedOrderedScenario, readonly SourceEffect[]>();
const operationSources = new WeakMap<BattleOperation, EffectExecutionOperation>();
const compiledOperationSources = new WeakMap<
  PreparedOrderedScenario,
  ReadonlyMap<string, EffectExecutionOperation | null>
>();

export function retainOperationSource(
  operation: BattleOperation,
  source: EffectExecutionOperation,
): void {
  operationSources.set(operation, source);
}

export function operationSourceFor(
  operation: BattleOperation,
): EffectExecutionOperation | undefined {
  return operationSources.get(operation);
}

export function retainCompiledSources(
  plan: PreparedOrderedScenario,
  sources: readonly SourceEffect[],
  operations: ReadonlyMap<string, EffectExecutionOperation | null>,
): void {
  compiledSources.set(plan, sources);
  compiledOperationSources.set(plan, operations);
}

export function compiledSourcesFor(
  plan: PreparedOrderedScenario,
): readonly SourceEffect[] | undefined {
  return compiledSources.get(plan);
}

export function compiledOperationSourceFor(
  plan: PreparedOrderedScenario,
  operation: BattleOperation,
): EffectExecutionOperation | undefined {
  return compiledOperationSources.get(plan)?.get(operation.operationId) ?? undefined;
}
