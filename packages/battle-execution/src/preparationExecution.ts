import {
  beginPreparationAttemptCapture,
  takePreparationAttemptCapture,
  publishPreparationSources,
} from './preparationAttemptObservation';
import type { MasterEffect } from '@fgo-lab/master-data';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';
import type { SourceExecutionBinding } from './executionBinding';
import type { OcActionStep, OcActionStepResult } from './ocState';
import type {
  PreparationExecutionContext,
  PreparationTransitionResult,
  PreparationCompletedTransitionResult,
  PreNoblePhantasmState,
} from './preparationContracts';
import type { SourceEffect } from './sourceCollection';

/** These are actual reducer results. An unreached operation has no read or write. */
export interface PreparationOperationExecution {
  readonly operationIndex: number;
  readonly operation: MasterEffect['execution'][number];
  readonly status: 'unreached' | 'reached';
  readonly steps: readonly {
    step: OcActionStep;
    before: PreNoblePhantasmState;
    after: PreNoblePhantasmState;
    native: OcActionStepResult;
  }[];
}

interface PreparationSourceIdentity {
  readonly actionId: string;
  readonly source: SourceEffect;
  readonly binding: SourceExecutionBinding;
  readonly operations: readonly PreparationOperationExecution[];
}

export type CompletedSourceTransaction = {
  readonly kind: 'committed' | 'stochasticFailure';
  readonly before: PreNoblePhantasmState;
  readonly attempted: PreNoblePhantasmState;
  readonly after: PreNoblePhantasmState;
};

export type RejectedSourceTransaction = {
  readonly kind: 'rejected';
  readonly before: PreNoblePhantasmState;
  readonly attempted: PreNoblePhantasmState;
  readonly rejection: NonNullable<OcActionStepResult['rejection']>;
};

/** Public results contain only sealed transactions, never an in-flight draft. */
export type PreparationSourceExecution = PreparationSourceIdentity &
  (
    | { readonly status: 'unreached'; readonly transaction?: never; readonly restored?: never }
    | {
        readonly status: 'completed';
        readonly transaction: CompletedSourceTransaction;
        readonly restored?: never;
      }
    | {
        readonly status: 'rejected';
        readonly transaction: RejectedSourceTransaction;
        readonly restored: PreNoblePhantasmState;
      }
    | {
        readonly status: 'rolledBack';
        readonly transaction: CompletedSourceTransaction;
        readonly restored: PreNoblePhantasmState;
      }
  );

/** Private reducer draft. It cannot be returned in an action result or diagnostic. */
export interface PreparationSourceDraft {
  readonly actionId: string;
  readonly source: SourceEffect;
  binding: SourceExecutionBinding;
  status: 'unreached' | 'pending' | 'completed' | 'rejected';
  before: PreNoblePhantasmState | null;
  attemptedAfter: PreNoblePhantasmState | null;
  committedAfter: PreNoblePhantasmState | null;
  completion: CompletedSourceTransaction['kind'] | null;
  rejection: OcActionStepResult['rejection'];
  readonly operations: (Omit<PreparationOperationExecution, 'status' | 'steps'> & {
    status: PreparationOperationExecution['status'];
    readonly steps: PreparationOperationExecution['steps'][number][];
  })[];
}

export type PreparationActionExecution = PreparationCompletedTransitionResult & {
  readonly command: PreNoblePhantasmCommand;
};

export type PreparationInitializationExecution = PreparationCompletedTransitionResult & {
  readonly command: null;
};

const actions = new WeakMap<
  PreparationExecutionContext,
  {
    sources: PreparationSourceDraft[];
    committedSources: PreparationSourceDraft[];
  }
>();
export function beginPreparationExecution(context: PreparationExecutionContext): void {
  if (actions.has(context)) throw new TypeError('nested_preparation_action_execution');
  actions.set(context, { sources: [], committedSources: [] });
  beginPreparationAttemptCapture(context);
}

export function registerPreparationSourceExecution(
  context: PreparationExecutionContext,
  execution: PreparationSourceDraft,
): void {
  actions.get(context)?.sources.push(execution);
}

/** Called by the source transaction's native finish step, never inferred by the caller. */
export function commitPreparationSourceExecution(
  context: PreparationExecutionContext,
  execution: PreparationSourceDraft,
): void {
  const action = actions.get(context);
  if (!action) return;
  if (!action.sources.includes(execution) || action.committedSources.includes(execution))
    throw new TypeError('invalid_preparation_source_commit');
  action.committedSources.push(execution);
}

function sealSource(
  draft: PreparationSourceDraft,
  before: PreNoblePhantasmState,
  applied: boolean,
  nativeCommit: boolean,
): PreparationSourceExecution {
  const identity = {
    actionId: draft.actionId,
    source: draft.source,
    binding: draft.binding,
    operations: draft.operations.map((operation) => ({
      ...operation,
      steps: [...operation.steps],
    })),
  };
  if (draft.status === 'unreached') {
    if (nativeCommit || draft.binding.activation.kind !== 'unread')
      throw new TypeError('unreached_source_has_execution');
    return { ...identity, status: 'unreached' };
  }
  if (!draft.before || !draft.attemptedAfter)
    throw new TypeError('missing_source_transaction_state');
  if (draft.status === 'rejected') {
    if (applied || nativeCommit || !draft.rejection)
      throw new TypeError('invalid_rejected_source_transaction');
    return {
      ...identity,
      status: 'rejected',
      transaction: {
        kind: 'rejected',
        before: draft.before,
        attempted: draft.attemptedAfter,
        rejection: draft.rejection,
      },
      restored: before,
    };
  }
  if (draft.status !== 'completed' || !draft.committedAfter || draft.completion === null)
    throw new TypeError('incomplete_source_transaction');
  if (nativeCommit !== (draft.completion === 'committed'))
    throw new TypeError('source_commit_owner_mismatch');
  const transaction: CompletedSourceTransaction = {
    kind: draft.completion,
    before: draft.before,
    attempted: draft.attemptedAfter,
    after: draft.committedAfter,
  };
  return applied
    ? { ...identity, status: 'completed', transaction }
    : { ...identity, status: 'rolledBack', transaction, restored: before };
}

export function finishPreparationExecution(
  context: PreparationExecutionContext,
  command: null,
  before: PreNoblePhantasmState,
  result: PreparationTransitionResult,
): PreparationInitializationExecution;
export function finishPreparationExecution(
  context: PreparationExecutionContext,
  command: PreNoblePhantasmCommand,
  before: PreNoblePhantasmState,
  result: PreparationTransitionResult,
): PreparationActionExecution;
export function finishPreparationExecution(
  context: PreparationExecutionContext,
  command: PreNoblePhantasmCommand | null,
  before: PreNoblePhantasmState,
  result: PreparationTransitionResult,
): PreparationCompletedTransitionResult {
  const action = actions.get(context);
  if (!action) throw new TypeError('missing_preparation_action_execution');
  const sealed = new Map(
    action.sources.map((draft) => [
      draft,
      sealSource(
        draft,
        before,
        result.status === 'applied',
        action.committedSources.includes(draft),
      ),
    ]),
  );
  const sources = [...sealed.values()];
  const observations = takePreparationAttemptCapture(context);
  for (const attempt of observations.ocAttempts) publishPreparationSources(attempt, sealed);
  actions.delete(context);
  return {
    ...result,
    before,
    command,
    sources,
    committedSources:
      result.status === 'applied' ? action.committedSources.map((draft) => sealed.get(draft)!) : [],
    observations,
  };
}

export interface RejectedPreparationDiagnostic {
  readonly kind: 'rejectedPreparationDiagnostic';
  readonly rejection: Extract<PreparationCompletedTransitionResult, { status: 'rejected' }>;
  readonly restored: PreNoblePhantasmState;
  readonly commands: readonly PreNoblePhantasmCommand[];
  readonly transitions: readonly PreparationActionExecution[];
  readonly state: PreNoblePhantasmState;
}

export function abandonPreparationExecution(context: PreparationExecutionContext): void {
  actions.delete(context);
  takePreparationAttemptCapture(context);
}
