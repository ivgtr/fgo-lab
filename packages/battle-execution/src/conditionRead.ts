import type { InputFact } from './inputFacts';
import type { ExecutionIssue } from './contracts';
import type { ResolvedStochasticOutcome } from './stochasticOutcomes';
import type { ActorFormId, EffectProc } from '@fgo-lab/master-data';
import type { ConditionExpression, TraitScope } from './contracts';

/** A read belongs to one execution clock; a later form or resource cannot replace it. */
export interface ConditionReadClock {
  readonly phase: 'initial' | 'sourceUse' | 'operation' | 'damageEvaluation';
  readonly actorFormId: Readonly<ActorFormId>;
  readonly actor: string;
  readonly actionId: string | null;
  readonly operationId: string | null;
  readonly sourceInstanceId: string | null;
  readonly occurrenceId: string | null;
  readonly valueSetIndex: number | null;
  readonly valueIndex: number | null;
}

export type ConditionFactProof = {
  readonly kind:
    | 'canonicalIntrinsic'
    | 'selectedInitialResource'
    | 'legalChoice'
    | 'guaranteedWrite'
    | 'externalAssumption'
    | 'possibleOutcome';
  readonly clock: ConditionReadClock;
};

export interface ConditionFactProofs {
  traits: Record<TraitScope, ReadonlyMap<string, ConditionFactProof>>;
  suppressions: Record<'attacker' | 'target', ReadonlyMap<string, ConditionFactProof>>;
  predicates: Record<'attacker' | 'target', ReadonlyMap<string, ConditionFactProof>>;
  quantities: ReadonlyMap<string, ConditionFactProof>;
  activations: ReadonlyMap<string, ConditionFactProof>;
  markers: ReadonlyMap<string, ConditionFactProof>;
}

export interface ConditionReadEvidence {
  expression: ConditionExpression;
  value: boolean | number | null;
  proof: ConditionFactProof | null;
  quantityFact?: InputFact;
}

export type ConditionRead = {
  clock: ConditionReadClock;
  evidence: readonly ConditionReadEvidence[];
  support: readonly ConditionFactProof[];
} & (
  | { kind: 'known'; truth: boolean; certainty: 'guaranteed' | 'possible' }
  | { kind: 'inputRequired' | 'unsupported'; truth: null; certainty: null }
);

export type SourceActivationReceipt =
  | { kind: 'unread' }
  | { kind: 'notApplicable' }
  | { kind: 'read'; read: ConditionRead; proc: SourceProcRead };

export type SourceProcRead =
  | { kind: 'unread' }
  | {
      kind: 'resolved';
      outcome: 'success' | 'failure';
      certainty: 'guaranteed' | 'possible';
      ratePermille: number;
      selection: 'declared' | 'witness';
    }
  | { kind: 'inputRequired'; inputKey: string }
  | {
      kind: 'invalid';
      issue: Extract<ExecutionIssue, { kind: 'invalidStochasticOutcome' }>;
    };

export function sourceProcRead(
  proc: EffectProc,
  ratePermille: number | null,
  result: ResolvedStochasticOutcome,
  selection: 'declared' | 'witness',
): SourceProcRead {
  if (result.status === 'inputRequired')
    return { kind: 'inputRequired', inputKey: result.inputKey };
  if (result.status === 'invalid') return { kind: 'invalid', issue: result.issue };
  const rate = proc.kind === 'guaranteed' ? 1000 : ratePermille;
  if (rate === null || !Number.isInteger(rate) || rate < 0 || rate > 1000)
    throw new TypeError('invalid_source_proc_cell');
  return {
    kind: 'resolved',
    outcome: result.status,
    certainty: procIsGuaranteed(proc, rate) || rate === 0 ? 'guaranteed' : 'possible',
    ratePermille: rate,
    selection,
  };
}

export class ConditionReadIdentityError extends Error {
  constructor(readonly factKey: string) {
    super(`missing_condition_fact_proof:${factKey}`);
    this.name = 'ConditionReadIdentityError';
  }
}

export function proofIsGuaranteed(proof: ConditionFactProof): boolean {
  return proof.kind !== 'externalAssumption' && proof.kind !== 'possibleOutcome';
}

export function procIsGuaranteed(proc: EffectProc, ratePermille: number | null): boolean {
  return proc.kind === 'guaranteed' || ratePermille === 1000;
}

export function conditionWriteProof(
  read: ConditionRead,
  procGuaranteed: boolean,
): ConditionFactProof {
  return {
    kind: read.certainty === 'guaranteed' && procGuaranteed ? 'guaranteedWrite' : 'possibleOutcome',
    clock: read.clock,
  };
}

/** An empty write ledger is distinct from an initial fact or an unknown fact. */
export function emptyConditionFactProofs(): ConditionFactProofs {
  return {
    traits: {
      attacker: new Map(),
      attackerState: new Map(),
      target: new Map(),
      targetState: new Map(),
      field: new Map(),
    },
    suppressions: { attacker: new Map(), target: new Map() },
    predicates: { attacker: new Map(), target: new Map() },
    quantities: new Map(),
    activations: new Map(),
    markers: new Map(),
  };
}

export function cloneConditionFactProofs(proofs: ConditionFactProofs): ConditionFactProofs {
  return {
    traits: {
      attacker: new Map(proofs.traits.attacker),
      attackerState: new Map(proofs.traits.attackerState),
      target: new Map(proofs.traits.target),
      targetState: new Map(proofs.traits.targetState),
      field: new Map(proofs.traits.field),
    },
    suppressions: {
      attacker: new Map(proofs.suppressions.attacker),
      target: new Map(proofs.suppressions.target),
    },
    predicates: {
      attacker: new Map(proofs.predicates.attacker),
      target: new Map(proofs.predicates.target),
    },
    quantities: new Map(proofs.quantities),
    activations: new Map(proofs.activations),
    markers: new Map(proofs.markers),
  };
}

/** Quantity operands affect adoption certainty without replacing the source activation read. */
export function contributionOperandRead(
  activation: ConditionRead,
  operand: ConditionRead | null,
): ConditionRead {
  if (!operand || activation.truth !== true) return activation;
  const support = [...activation.support, ...operand.support];
  const evidence = [...activation.evidence, ...operand.evidence];
  return operand.kind === 'known'
    ? {
        ...operand,
        truth: true,
        support,
        evidence,
        certainty: support.every(proofIsGuaranteed) ? 'guaranteed' : 'possible',
      }
    : { ...operand, support, evidence };
}

export function sourceActivationOutcome(
  activation: SourceActivationReceipt,
): ResolvedStochasticOutcome | undefined {
  if (activation.kind === 'read') {
    const proc = activation.proc;
    if (proc.kind === 'resolved') return { status: proc.outcome };
    if (proc.kind === 'inputRequired') return { status: 'inputRequired', inputKey: proc.inputKey };
    if (proc.kind === 'invalid') return { status: 'invalid', issue: proc.issue };
  }
  return undefined;
}
