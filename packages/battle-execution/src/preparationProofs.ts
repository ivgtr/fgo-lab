import type {
  ConditionFactProof,
  ConditionReadClock,
  SourceActivationReceipt,
} from './conditionRead';
import { cloneConditionFactProofs, proofIsGuaranteed } from './conditionRead';
import { hpPermille } from './hpResource';
import type { PreNoblePhantasmState } from './preparationContracts';

/** The value owner supplies the before/after states and the proof of that committed write. */
export function bindPreparationWriteProofs(
  before: PreNoblePhantasmState,
  after: PreNoblePhantasmState,
  proof: ConditionFactProof,
): PreNoblePhantasmState {
  const facts = cloneConditionFactProofs(before.conditionFactProofs);
  for (const actor of ['attacker', 'target'] as const)
    for (const trait of after.initialTraitSuppressions[actor])
      if (!before.initialTraitSuppressions[actor].has(trait))
        (facts.suppressions[actor] as Map<string, ConditionFactProof>).set(trait, proof);
  for (const instance of after.buffInstances) {
    const previous = before.buffInstances.find(({ identity }) => identity === instance.identity);
    if (!previous || previous.count !== instance.count || previous.uncertain !== instance.uncertain)
      (facts.markers as Map<string, ConditionFactProof>).set(instance.identity, proof);
  }
  if (before.npResource.gauge !== after.npResource.gauge)
    (facts.quantities as Map<string, ConditionFactProof>).set('npGauge:attacker', proof);
  if (before.hp !== after.hp)
    for (const [actor, value] of Object.entries(after.hp?.actors ?? {}))
      if (before.hp?.actors[actor] !== value)
        (facts.quantities as Map<string, ConditionFactProof>).set(
          actor === 'attacker' ? 'attackerHpPermille' : `hp:${actor}`,
          proof,
        );
  for (const [actor, domains] of Object.entries(after.battlePoints.actors))
    for (const [subject, value] of Object.entries(domains.domains))
      if (before.battlePoints.actors[actor]?.domains[subject] !== value)
        (facts.quantities as Map<string, ConditionFactProof>).set(
          `battlePoint:${actor}:${subject}`,
          proof,
        );
  const attackerHpChanged = before.hp?.actors.attacker !== after.hp?.actors.attacker;
  return {
    ...after,
    ...(attackerHpChanged
      ? {
          quantities: {
            ...after.quantities,
            attackerHpPermille: hpPermille(after.hp?.actors.attacker),
          },
        }
      : {}),
    conditionFactProofs: facts,
  };
}

export interface PreparationNpQuantityWrite {
  quantity: 'npGauge:attacker';
  mutation: { kind: 'fixed' | 'currentGaugeRatio'; direction: 'gain' | 'loss'; cell: number };
  clock: ConditionReadClock;
  sourceActivation: Extract<SourceActivationReceipt, { kind: 'read' }>;
  before: number;
  after: number;
  reads: readonly {
    kind: 'previousQuantity' | 'capacity' | 'canonicalCell';
    value: number;
    proof: ConditionFactProof;
    influencesResult: boolean;
  }[];
  proof: ConditionFactProof;
}

function npWriteProof(
  write: Pick<PreparationNpQuantityWrite, 'clock' | 'reads'>,
  activationProof: ConditionFactProof,
): ConditionFactProof {
  return {
    kind:
      proofIsGuaranteed(activationProof) &&
      write.reads.every(
        ({ proof, influencesResult }) => !influencesResult || proofIsGuaranteed(proof),
      )
        ? 'guaranteedWrite'
        : 'possibleOutcome',
    clock: write.clock,
  };
}

/** The NP writer supplies the actual cell and result, including same-value writes. */
export function commitPreparationNpQuantityWrite(args: {
  state: PreNoblePhantasmState;
  after: PreNoblePhantasmState['npResource'];
  kind: 'fixed' | 'currentGaugeRatio';
  direction: 'gain' | 'loss';
  cell: number;
  clock: ConditionReadClock;
  sourceActivation: Extract<SourceActivationReceipt, { kind: 'read' }>;
  activationProof: ConditionFactProof;
}): PreNoblePhantasmState {
  const prior = args.state.conditionFactProofs.quantities.get('npGauge:attacker');
  if (!prior) throw new TypeError('missing_np_quantity_write_dependency');
  if (!Number.isSafeInteger(args.cell) || args.cell < 0)
    throw new TypeError('invalid_np_quantity_write_cell');
  const intrinsic: ConditionFactProof = { kind: 'canonicalIntrinsic', clock: args.clock };
  // Fixed writes spanning the entire physical domain establish a constant value.
  // A ratio or a smaller delta still depends on the quantity read before this write.
  const dependsOnPrevious = args.kind !== 'fixed' || args.cell < args.state.npResource.capacity;
  const reads: PreparationNpQuantityWrite['reads'] = [
    {
      kind: 'previousQuantity',
      value: args.state.npResource.gauge,
      proof: prior,
      influencesResult: dependsOnPrevious,
    },
    {
      kind: 'capacity',
      value: args.state.npResource.capacity,
      proof: intrinsic,
      influencesResult: true,
    },
    { kind: 'canonicalCell', value: args.cell, proof: intrinsic, influencesResult: true },
  ];
  const write: PreparationNpQuantityWrite = {
    quantity: 'npGauge:attacker',
    mutation: { kind: args.kind, direction: args.direction, cell: args.cell },
    clock: args.clock,
    sourceActivation: args.sourceActivation,
    before: args.state.npResource.gauge,
    after: args.after.gauge,
    reads,
    proof: npWriteProof({ clock: args.clock, reads }, args.activationProof),
  };
  const facts = cloneConditionFactProofs(args.state.conditionFactProofs);
  (facts.quantities as Map<string, ConditionFactProof>).set(write.quantity, write.proof);
  return {
    ...args.state,
    npResource: args.after,
    conditionFactProofs: facts,
    npQuantityWrites: [...args.state.npQuantityWrites, write],
  };
}

/** Bind a staged source's actual OC proc receipt only when that source commits. */
export function finalizePreparationNpQuantityWrites(
  state: PreNoblePhantasmState,
  startIndex: number,
  activation: Extract<SourceActivationReceipt, { kind: 'read' }>,
  activationProof: ConditionFactProof,
): PreNoblePhantasmState {
  const updatedProofs = new Map<string, ConditionFactProof>();
  const writes = state.npQuantityWrites.map((write, index) => {
    if (index < startIndex) return write;
    const reads = write.reads.map((read) => ({
      ...read,
      proof: updatedProofs.get(JSON.stringify(read.proof.clock)) ?? read.proof,
    }));
    const updated = {
      ...write,
      sourceActivation: activation,
      reads,
      proof: npWriteProof({ ...write, reads }, activationProof),
    };
    updatedProofs.set(JSON.stringify(write.proof.clock), updated.proof);
    return updated;
  });
  const facts = cloneConditionFactProofs(state.conditionFactProofs);
  const currentProof = facts.quantities.get('npGauge:attacker');
  const updated = currentProof && updatedProofs.get(JSON.stringify(currentProof.clock));
  if (updated)
    (facts.quantities as Map<string, ConditionFactProof>).set('npGauge:attacker', updated);
  return { ...state, npQuantityWrites: writes, conditionFactProofs: facts };
}
