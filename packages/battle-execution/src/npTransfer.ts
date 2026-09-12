import { canonicalRequirementLeaves } from '@fgo-lab/master-data';
import type {
  CanonicalInputDefinition,
  EffectExecutionOperation,
  CanonicalNpResourceSemantics,
} from '@fgo-lab/master-data';
import { applyNpResourceTransaction, type NpResourceState } from './npResource';
import type { SourceEffect } from './sourceCollection';
export type NpTransferAmount = Extract<
  Extract<
    EffectExecutionOperation,
    { kind: 'resourceMutation'; resource: 'npGauge' | 'criticalStars' | 'battlePoint' }
  >['amount'],
  { kind: 'npTransfer' }
>;
export interface NpTransferReceipt {
  actionId: string;
  occurrenceId: string;
  donor: NpTransferAmount['donor'];
  donors: readonly {
    inputKey: string;
    actorIndex: number;
    snapshot: number;
    attemptedLoss: number;
    actualLoss: number;
    remaining: number;
    calculatedGain: number;
  }[];
  calculatedGain: number;
  receiverGain: number;
}
export function applyNpTransfer(args: {
  amount: NpTransferAmount;
  source: SourceEffect;
  values: Readonly<Record<string, number>>;
  prior: readonly NpTransferReceipt[];
  state: NpResourceState;
  semantics: CanonicalNpResourceSemantics;
  actionId: string;
  valueSetIndex: number;
}):
  | { status: 'applied'; state: NpResourceState; receipt: NpTransferReceipt }
  | { status: 'invalid' | 'unsupported' }
  | { status: 'inputRequired'; input: CanonicalInputDefinition } {
  const { amount, source } = args;
  const attackerReceiver = ['attacker', 'np', 'passive', 'craftEssence'].includes(source.origin);
  if (!attackerReceiver && amount.donor === 'playerNp') return { status: 'unsupported' };
  if (
    new Set(amount.inputKeys).size !== amount.inputKeys.length ||
    amount.inputKeys.length !== (amount.donor === 'playerNp' ? 2 : 3)
  )
    return { status: 'invalid' };
  const cost = amount.costs[args.valueSetIndex]?.[source.valueIndex];
  const gain = (source.limitBreak ? amount.limitBreakValues : amount.values)?.[
    args.valueSetIndex
  ]?.[source.valueIndex];
  if (
    cost == null ||
    gain == null ||
    !Number.isSafeInteger(cost) ||
    cost <= 0 ||
    !Number.isSafeInteger(gain) ||
    gain <= 0 ||
    (amount.donor === 'playerNp' && cost !== gain)
  )
    return { status: 'invalid' };
  const donors: NpTransferReceipt['donors'][number][] = [];
  for (const [actorIndex, inputKey] of amount.inputKeys.entries()) {
    const input = source.effect.inputDefinitions.find(
      (input) =>
        input.kind === 'transferDonor' &&
        input.key === inputKey &&
        input.resource === amount.donor &&
        input.actorIndex === actorIndex,
    );
    if (!input) return { status: 'unsupported' };
    const snapshot =
      [...args.prior]
        .reverse()
        .flatMap((receipt) => (receipt.donor === amount.donor ? receipt.donors : []))
        .find((donor) => donor.actorIndex === actorIndex)?.remaining ??
      args.values[inputKey] ??
      input.defaultValue;
    if (
      snapshot === null ||
      !Number.isSafeInteger(snapshot) ||
      snapshot < input.minimum ||
      snapshot > input.maximum
    )
      return { status: 'inputRequired', input };
    const actualLoss = Math.min(snapshot, cost);
    donors.push({
      inputKey,
      actorIndex,
      snapshot,
      attemptedLoss: cost,
      actualLoss,
      remaining: snapshot - actualLoss,
      calculatedGain: amount.donor === 'playerNp' ? actualLoss : snapshot >= cost ? gain : 0,
    });
  }
  const calculatedGain = donors.reduce((sum, donor) => sum + donor.calculatedGain, 0);
  if (!attackerReceiver && calculatedGain !== 0) return { status: 'unsupported' };
  if (!Number.isSafeInteger(calculatedGain)) return { status: 'invalid' };
  const result = applyNpResourceTransaction(args.semantics, args.state, {
    requirement: null,
    mutations: [{ kind: 'gain', amount: calculatedGain }],
  });
  if (result.status === 'rejected') return { status: 'invalid' };
  return {
    status: 'applied',
    state: result.state,
    receipt: {
      actionId: args.actionId,
      occurrenceId: source.effect.occurrenceId,
      donor: amount.donor,
      donors,
      calculatedGain,
      receiverGain: result.state.gauge - args.state.gauge,
    },
  };
}

/** Above the sum of all attempted costs, every later transfer observes a full donor.
 * Direct input readers invalidate this quotient: they may distinguish the original quantity. */
export function npTransferInputSaturation(
  sources: readonly SourceEffect[],
): ReadonlyMap<string, number> {
  const bounds = new Map<string, number>();
  const actorCosts = new Map<string, number>();
  const inputActors = new Map<string, Set<string>>();
  const directReads = new Set<string>();
  for (const source of sources) {
    for (const leaf of canonicalRequirementLeaves(source.effect.requirement.expression))
      if (leaf.kind === 'inputQuantity') directReads.add(leaf.inputKey);
    for (const operation of source.effect.execution) {
      if (operation.kind === 'damageModifier' || operation.kind === 'modifierRateChange')
        for (const expression of [
          ...operation.valueExpressions.flat(),
          ...(operation.limitBreakValueExpressions?.flat() ?? []),
        ])
          if (expression?.kind === 'inputLinear') directReads.add(expression.inputKey);
      if (operation.kind !== 'resourceMutation' || operation.amount.kind !== 'npTransfer') continue;
      // NP cells may vary with OC; their maximum still provides a sound saturation bound.
      const costs = operation.amount.costs
        .flat()
        .filter((value): value is number => value !== null);
      const cost = Math.max(...costs);
      if (!Number.isSafeInteger(cost) || cost <= 0) continue;
      for (const [actorIndex, key] of operation.amount.inputKeys.entries()) {
        const actor = `${operation.amount.donor}:${actorIndex}`;
        actorCosts.set(actor, (actorCosts.get(actor) ?? 0) + cost);
        const actors = inputActors.get(key) ?? new Set<string>();
        actors.add(actor);
        inputActors.set(key, actors);
      }
    }
  }
  for (const [key, actors] of inputActors)
    bounds.set(key, Math.max(...[...actors].map((actor) => actorCosts.get(actor)!)));
  for (const key of directReads) bounds.delete(key);
  return bounds;
}
