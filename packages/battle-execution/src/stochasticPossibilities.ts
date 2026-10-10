import type { EffectProc, CanonicalOutcomeGroup } from '@fgo-lab/master-data';
import type { ActorFormId } from '@fgo-lab/master-data';
import type { SourceActivationReceipt } from './conditionRead';
import type { NpResourceState } from './npResource';
import type { NpOcUseReceipt } from './ocState';

export type StochasticChoice =
  { kind: 'binary'; outcome: 'success' | 'failure' } | { kind: 'successCount'; value: number };
export type StochasticSelection =
  { kind: 'declared' } | { kind: 'possibility'; choices: ReadonlyMap<string, StochasticChoice> };

export interface StochasticWitnessEntry {
  key: string;
  choice: StochasticChoice;
}
export interface IllegalExecutionWitness {
  readonly witness: readonly StochasticWitnessEntry[];
  readonly key: string;
}
export function stochasticWitnessKey(entries: readonly StochasticWitnessEntry[]): string {
  return JSON.stringify(
    [...entries].sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0)),
  );
}
export type ExecutionPossibilityCertificate =
  | { kind: 'declared' }
  | {
      kind: 'enumerated';
      policy: 'baseline' | 'satisfied';
      selectedWitness: readonly StochasticWitnessEntry[];
      attemptedExecutionCount: number;
      illegalWitnessCount: number;
      illegalWitnesses: readonly IllegalExecutionWitness[];
      branching: readonly {
        witness: readonly StochasticWitnessEntry[];
        key: string;
        choices: readonly StochasticChoice[];
      }[];
      branches: readonly {
        witness: readonly StochasticWitnessEntry[];
        status: 'executable' | 'rejected' | 'invalid';
        average: number | null;
        sourceReads: readonly SourceActivationReceipt[];
        resourceUses: readonly {
          actorFormId: ActorFormId;
          before: NpResourceState;
          after: NpResourceState;
          ocUse: NpOcUseReceipt | null;
        }[];
      }[];
    };

export function stochasticWitnessEntries(
  selection: Extract<StochasticSelection, { kind: 'possibility' }>,
): StochasticWitnessEntry[] {
  return [...selection.choices]
    .map(([key, choice]) => ({ key, choice }))
    .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
}

/** A suspended concrete execution has not committed or published a result. */
export class StochasticBranchRequired extends Error {
  constructor(
    readonly key: string,
    readonly choices: readonly StochasticChoice[],
  ) {
    super('stochastic_branch_required');
    this.name = 'StochasticBranchRequired';
  }
}
export class IllegalStochasticWitness extends Error {
  constructor(readonly key: string) {
    super('illegal_stochastic_witness');
    this.name = 'IllegalStochasticWitness';
  }
}

export function stochasticGroupKey(
  origin: string,
  sourceInstanceId: string,
  skillId: string,
  group: CanonicalOutcomeGroup,
  actionId: string | null,
): string {
  return JSON.stringify([origin, sourceInstanceId, skillId, group.kind, group.key, actionId]);
}

export interface ExecutionPossibilities<T> {
  executions: readonly {
    selection: Extract<StochasticSelection, { kind: 'possibility' }>;
    value: T;
  }[];
  illegalWitnesses: readonly IllegalExecutionWitness[];
  attemptedExecutionCount: number;
  branching: readonly {
    witness: readonly StochasticWitnessEntry[];
    key: string;
    choices: readonly StochasticChoice[];
  }[];
}

/** Enumerates canonical proc choices by suspending and replaying the same concrete executor. */
export function executeStochasticPossibilities<T>(
  run: (selection: Extract<StochasticSelection, { kind: 'possibility' }>) => T,
): ExecutionPossibilities<T> {
  const pending: Extract<StochasticSelection, { kind: 'possibility' }>[] = [
    { kind: 'possibility', choices: new Map() },
  ];
  const executions: {
    selection: Extract<StochasticSelection, { kind: 'possibility' }>;
    value: T;
  }[] = [];
  const illegalWitnesses: IllegalExecutionWitness[] = [];
  const branching: {
    witness: readonly StochasticWitnessEntry[];
    key: string;
    choices: readonly StochasticChoice[];
  }[] = [];
  let attemptedExecutionCount = 0;
  while (pending.length) {
    const selection = pending.pop()!;
    attemptedExecutionCount++;
    try {
      executions.push({ selection, value: run(selection) });
    } catch (error) {
      if (error instanceof IllegalStochasticWitness) {
        illegalWitnesses.push({ witness: stochasticWitnessEntries(selection), key: error.key });
        continue;
      }
      if (!(error instanceof StochasticBranchRequired)) throw error;
      if (!error.choices.length || selection.choices.has(error.key))
        throw new TypeError('invalid_stochastic_branch');
      branching.push({
        witness: stochasticWitnessEntries(selection),
        key: error.key,
        choices: error.choices,
      });
      if (
        executions.length + illegalWitnesses.length + pending.length + error.choices.length >
        4096
      )
        throw new TypeError('stochastic_candidate_limit');
      for (const choice of [...error.choices].reverse())
        pending.push({
          kind: 'possibility',
          choices: new Map([...selection.choices, [error.key, choice]]),
        });
    }
  }
  return { executions, illegalWitnesses, attemptedExecutionCount, branching };
}

export function selectStochasticPossibility(
  key: string,
  proc: EffectProc,
  group: CanonicalOutcomeGroup,
  ratePermille: number,
  selection: Extract<StochasticSelection, { kind: 'possibility' }>,
): 'success' | 'failure' {
  if (!Number.isInteger(ratePermille) || ratePermille < 0 || ratePermille > 1000)
    throw new TypeError('invalid_stochastic_rate_cell');
  if ((proc.kind === 'chainedRolls') !== (group.kind === 'successCount'))
    throw new TypeError('contradictory_stochastic_group');
  const choices: StochasticChoice[] =
    group.kind === 'binary'
      ? (ratePermille === 0
          ? (['failure'] as const)
          : ratePermille === 1000
            ? (['success'] as const)
            : (['failure', 'success'] as const)
        ).map((outcome) => ({ kind: 'binary', outcome }))
      : Array.from({ length: group.maximumSuccesses + 1 }, (_, value): StochasticChoice => ({
          kind: 'successCount',
          value,
        })).filter((choice) => {
          if (choice.kind !== 'successCount' || proc.kind !== 'chainedRolls') return false;
          return ratePermille === 0
            ? choice.value <= proc.index
            : ratePermille === 1000
              ? choice.value > proc.index
              : true;
        });
  const selected = selection.choices.get(key);
  if (!selected) {
    if (choices.length === 1 && choices[0]?.kind === 'binary') return choices[0].outcome;
    throw new StochasticBranchRequired(key, choices);
  }
  if (!choices.some((choice) => JSON.stringify(choice) === JSON.stringify(selected)))
    throw new IllegalStochasticWitness(key);
  return selected.kind === 'binary'
    ? selected.outcome
    : proc.kind === 'chainedRolls' && selected.value > proc.index
      ? 'success'
      : 'failure';
}

export function selectBinaryStochasticPossibility(
  key: string,
  ratePermille: number,
  selection: Extract<StochasticSelection, { kind: 'possibility' }>,
): 'success' | 'failure' {
  if (!Number.isInteger(ratePermille) || ratePermille < 0 || ratePermille > 1000)
    throw new TypeError('invalid_stochastic_rate_cell');
  const selected = selection.choices.get(key);
  const choices: StochasticChoice[] = (
    ratePermille === 0
      ? (['failure'] as const)
      : ratePermille === 1000
        ? (['success'] as const)
        : (['failure', 'success'] as const)
  ).map((outcome) => ({ kind: 'binary', outcome }));
  if (!selected) {
    if (choices.length === 1 && choices[0]?.kind === 'binary') return choices[0].outcome;
    throw new StochasticBranchRequired(key, choices);
  }
  if (
    selected.kind !== 'binary' ||
    !choices.some((choice) => choice.kind === 'binary' && choice.outcome === selected.outcome)
  )
    throw new IllegalStochasticWitness(key);
  return selected.outcome;
}
