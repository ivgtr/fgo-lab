import { sourceActivationOutcome } from './conditionRead';
import type { SourceActivationReceipt } from './conditionRead';
import type {
  CanonicalInputDefinition,
  CanonicalOutcomeGroup,
  EffectProc,
} from '@fgo-lab/master-data';
import type { BattleOperation, ExecutionIssue } from './contracts';
import type { ResolvedCanonicalInputSet } from './executionTypes';

export type ResolvedStochasticOutcome =
  | { status: 'success' }
  | { status: 'failure' }
  | { status: 'inputRequired'; inputKey: string }
  | { status: 'invalid'; issue: Extract<ExecutionIssue, { kind: 'invalidStochasticOutcome' }> };

export interface ResolvedStochasticOutcomeSet {
  outcomes: ReadonlyMap<string, ResolvedStochasticOutcome>;
  issues: readonly ExecutionIssue[];
}

const guaranteedSuccess: ResolvedStochasticOutcome = { status: 'success' };

export interface StochasticActivationContract {
  operationId: string;
  sourceActivation: SourceActivationReceipt;
  proc: EffectProc;
  stochasticOutcome?: CanonicalOutcomeGroup | null;
  inputDefinitions: readonly CanonicalInputDefinition[];
}

function invalidOutcome(
  operation: StochasticActivationContract,
  detail: Extract<ExecutionIssue, { kind: 'invalidStochasticOutcome' }>['detail'],
): Extract<ResolvedStochasticOutcome, { status: 'invalid' }> {
  return {
    status: 'invalid',
    issue: { kind: 'invalidStochasticOutcome', operationId: operation.operationId, detail },
  };
}

export function resolveStochasticActivationOutcome(
  operation: StochasticActivationContract,
  resolvedInputs: ResolvedCanonicalInputSet,
): ResolvedStochasticOutcome {
  const native = sourceActivationOutcome(operation.sourceActivation);
  if (native) return native;
  if (operation.proc.kind === 'guaranteed')
    return operation.stochasticOutcome
      ? invalidOutcome(operation, 'contradictoryStochasticOutcome')
      : { status: 'success' };
  const group = operation.stochasticOutcome;
  if (!group) return invalidOutcome(operation, 'missingStochasticOutcome');
  const chained = operation.proc.kind === 'chainedRolls';
  if (chained !== (group.kind === 'successCount'))
    return invalidOutcome(operation, 'partialStochasticOutcome');
  if (group.kind === 'binary') return { status: group.defaultOutcome };
  if (operation.proc.kind !== 'chainedRolls')
    return invalidOutcome(operation, 'partialStochasticOutcome');
  const definition = operation.inputDefinitions.find(
    (candidate) => candidate.kind === 'procSuccessCount' && candidate.key === group.key,
  );
  if (
    !definition ||
    definition.minimum !== 0 ||
    definition.maximum !== group.maximumSuccesses ||
    definition.maximum !== operation.proc.maximumSuccesses
  )
    return invalidOutcome(operation, 'missingSuccessCountDefinition');
  if (resolvedInputs.missingDefinitions.some(({ key }) => key === group.key))
    return { status: 'inputRequired', inputKey: group.key };
  const successes = resolvedInputs.values[group.key] ?? definition.defaultValue;
  if (
    successes === null ||
    !Number.isInteger(successes) ||
    successes < definition.minimum ||
    successes > definition.maximum
  )
    return invalidOutcome(operation, 'invalidSuccessCountValue');
  return { status: successes > operation.proc.index ? 'success' : 'failure' };
}

export function resolvedStochasticOutcomeForOperation(
  operation: BattleOperation,
  outcomes: ReadonlyMap<string, ResolvedStochasticOutcome>,
): ResolvedStochasticOutcome {
  return (
    sourceActivationOutcome(operation.sourceActivation) ??
    (operation.proc.kind === 'guaranteed' && !operation.stochasticOutcome
      ? guaranteedSuccess
      : (outcomes.get(operation.operationId) ??
        invalidOutcome(operation, 'missingStochasticOutcome')))
  );
}

export function resolveStochasticOutcomes(
  operations: readonly BattleOperation[],
  resolvedInputs: ResolvedCanonicalInputSet,
): ResolvedStochasticOutcomeSet {
  const outcomes = new Map<string, ResolvedStochasticOutcome>();
  const issues: ExecutionIssue[] = [];
  for (const operation of operations) {
    if (operation.proc.kind === 'guaranteed' && !operation.stochasticOutcome) continue;
    const outcome = resolveStochasticActivationOutcome(operation, resolvedInputs);
    outcomes.set(operation.operationId, outcome);
    if (outcome.status === 'invalid') issues.push(outcome.issue);
  }
  return { outcomes, issues };
}
