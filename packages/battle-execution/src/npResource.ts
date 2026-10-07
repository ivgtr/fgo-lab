import type { CanonicalNpResourceSemantics, EffectExecutionOperation } from '@fgo-lab/master-data';

export const DEFAULT_NP_RESOURCE_SEMANTICS: CanonicalNpResourceSemantics = {
  unit: 'basisPoints',
  capacityByNpLevel: [10_000, 20_000, 20_000, 20_000, 30_000],
  noblePhantasmUse: {
    requirement: 10_000,
    consumption: 'all',
    baseOvercharge: { gaugePerStage: 10_000, minimumStage: 1, maximumBaseStage: 3 },
  },
};

export interface NpResourceState {
  npLevel: 1 | 2 | 3 | 4 | 5;
  capacity: number;
  gauge: number;
}

export type NpResourceMutation =
  | { kind: 'gain'; amount: number }
  | { kind: 'loss'; amount: number }
  | { kind: 'gainCurrentGaugeRatio'; permille: number }
  | { kind: 'saturatedGain' }
  | { kind: 'consumeAll' }
  | { kind: 'unsupported'; family: string };

/** Canonical amount selection is shared by execution and bounded dependency probes. */
export function npMutationFromCanonicalAmount(
  operation: Extract<EffectExecutionOperation, { kind: 'resourceMutation' }>,
  amount: number | null | undefined,
): NpResourceMutation {
  if (
    operation.resource !== 'npGauge' ||
    operation.unit !== 'fixed' ||
    operation.subjectId !== null
  )
    return { kind: 'unsupported', family: 'invalidNpResource' };
  if (operation.amount.kind === 'npTransfer')
    return { kind: 'unsupported', family: 'transferRequiresDonorSnapshot' };
  if (operation.amount.kind === 'dependent')
    return { kind: 'unsupported', family: operation.amount.reason };
  if (operation.amount.kind === 'buffCount' || operation.amount.kind === 'populationCount')
    return { kind: 'unsupported', family: 'buffCountRequiresLiveInstances' };
  if (amount === null || amount === undefined)
    return { kind: 'unsupported', family: 'missingCanonicalAmount' };
  if (operation.amount.kind === 'currentGaugeRatio') {
    if (operation.direction !== 'gain')
      return { kind: 'unsupported', family: 'invalidCurrentGaugeRatio' };
    return { kind: 'gainCurrentGaugeRatio', permille: amount };
  }
  return { kind: operation.direction, amount };
}

export interface NpResourceTransaction {
  requirement: { kind: 'atLeast'; amount: number } | null;
  mutations: readonly NpResourceMutation[];
}

export type NpResourceTransactionResult =
  | { status: 'applied'; state: NpResourceState; baseOvercharge: number | null }
  | {
      status: 'rejected';
      code:
        | 'invalidState'
        | 'requirementExceedsCapacity'
        | 'insufficientGauge'
        | 'invalidMutation'
        | 'unsupportedMutation';
      state: NpResourceState;
    };

export function npCapacityForLevel(
  semantics: CanonicalNpResourceSemantics,
  npLevel: NpResourceState['npLevel'],
): number {
  return semantics.capacityByNpLevel[npLevel - 1]!;
}

export function createNpResourceState(
  semantics: CanonicalNpResourceSemantics,
  npLevel: NpResourceState['npLevel'],
  gauge: number = semantics.noblePhantasmUse.requirement,
): NpResourceState {
  const capacity = npCapacityForLevel(semantics, npLevel);
  if (!Number.isInteger(gauge) || gauge < 0 || gauge > capacity)
    throw new RangeError('invalid_np_resource_initial_gauge');
  return { npLevel, capacity, gauge };
}

export function deriveBaseOvercharge(
  semantics: CanonicalNpResourceSemantics,
  gauge: number,
): number {
  const rule = semantics.noblePhantasmUse.baseOvercharge;
  return Math.min(
    rule.maximumBaseStage,
    Math.max(rule.minimumStage, Math.floor(gauge / rule.gaugePerStage)),
  );
}

export function applyNpResourceTransaction(
  semantics: CanonicalNpResourceSemantics,
  state: NpResourceState,
  transaction: NpResourceTransaction,
): NpResourceTransactionResult {
  const reject = (code: Extract<NpResourceTransactionResult, { status: 'rejected' }>['code']) => ({
    status: 'rejected' as const,
    code,
    state,
  });
  if (
    !Number.isInteger(state.gauge) ||
    state.gauge < 0 ||
    state.capacity !== npCapacityForLevel(semantics, state.npLevel) ||
    state.gauge > state.capacity
  )
    return reject('invalidState');
  if (transaction.requirement) {
    const amount = transaction.requirement.amount;
    if (!Number.isInteger(amount) || amount < 0) return reject('invalidMutation');
    if (amount > state.capacity) return reject('requirementExceedsCapacity');
    if (state.gauge < amount) return reject('insufficientGauge');
  }
  if (transaction.mutations.filter(({ kind }) => kind === 'consumeAll').length > 1)
    return reject('invalidMutation');
  let gauge = state.gauge;
  let baseOvercharge: number | null = null;
  for (const mutation of transaction.mutations) {
    if (mutation.kind === 'unsupported') return reject('unsupportedMutation');
    if (mutation.kind === 'saturatedGain') {
      if (gauge !== state.capacity) return reject('unsupportedMutation');
      continue;
    }
    if (mutation.kind === 'consumeAll') {
      if (gauge < semantics.noblePhantasmUse.requirement) return reject('insufficientGauge');
      baseOvercharge = deriveBaseOvercharge(semantics, gauge);
      gauge = 0;
      continue;
    }
    if (mutation.kind === 'gainCurrentGaugeRatio') {
      const product = gauge * mutation.permille;
      if (
        !Number.isSafeInteger(mutation.permille) ||
        mutation.permille < 0 ||
        !Number.isSafeInteger(product)
      )
        return reject('invalidMutation');
      gauge = Math.min(state.capacity, gauge + Math.floor(product / 1000));
      continue;
    }
    if (!Number.isInteger(mutation.amount) || mutation.amount < 0) return reject('invalidMutation');
    gauge =
      mutation.kind === 'gain'
        ? Math.min(state.capacity, gauge + mutation.amount)
        : Math.max(0, gauge - mutation.amount);
  }
  return {
    status: 'applied',
    state: { ...state, gauge },
    baseOvercharge,
  };
}
