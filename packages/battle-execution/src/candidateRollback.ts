import type { ExecutableBattleState, ExecutionIssue, OperationResult } from './contracts';
import { cloneBattleState } from './state';

export function markOperationGroupUnsupported(
  results: OperationResult[],
  startIndex: number,
  state: ExecutableBattleState,
  issues: readonly ExecutionIssue[],
): void {
  for (let index = startIndex; index < results.length; index += 1) {
    const result = results[index]!;
    results[index] = {
      ...result,
      outcome: 'unsupported',
      state: cloneBattleState(state),
      projection: {
        ...result.projection,
        outcome: 'unsupported',
        explanation: { ...result.projection.explanation, code: 'unresolved' },
      },
      issue: result.issue ?? issues[0]!,
    };
  }
}

/** A missing active input invalidates the whole source transaction without creating an
 * unsupported-semantics issue. The caller publishes the required canonical input separately. */
export function markOperationGroupInputRequired(
  results: OperationResult[],
  startIndex: number,
  state: ExecutableBattleState,
): void {
  for (let index = startIndex; index < results.length; index += 1) {
    const result = results[index]!;
    results[index] = {
      ...result,
      outcome: 'notApplied',
      state: cloneBattleState(state),
      projection: {
        ...result.projection,
        outcome: 'notApplied',
        explanation: { ...result.projection.explanation, code: 'unresolved' },
      },
      issue: null,
    };
  }
}
