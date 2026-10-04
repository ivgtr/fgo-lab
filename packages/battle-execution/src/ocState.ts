import { evaluateHpValueExpression } from './hpValueExpression';
import { resolveApplicationRateOutcome } from './applicationRate';
import { deriveBaseOvercharge, DEFAULT_NP_RESOURCE_SEMANTICS } from './npResource';
import type {
  CanonicalInputDefinition,
  OcExecutionOperation,
  OcLifetimeLimit,
  OcStateTrait,
} from '@fgo-lab/master-data';
import type { OperationSource } from './contracts';

type BoostGrant = Extract<OcExecutionOperation, { kind: 'grantOcBoost' }>;
type RateGrant = Extract<OcExecutionOperation, { kind: 'grantOcApplicationRate' }>;
type Grant = BoostGrant | RateGrant;
export interface OcSourceEvidence {
  source: OperationSource;
  sourceName: string;
  skillName: string;
  label: string;
}
interface InstanceBase {
  instanceId: number;
  sourceKey: string;
  sourceEvidence: OcSourceEvidence;
  owner: string;
  lifetime: 'constant' | 'active';
  stateTraits: readonly OcStateTrait[];
  turns: OcLifetimeLimit;
  uses: OcLifetimeLimit;
  included: boolean;
  formKey?: string;
}
export interface OcBoostInstance extends InstanceBase {
  stages: number;
}
export interface OcRateInstance extends InstanceBase {
  amount: RateGrant['cells'][number][number]['amount'];
  valueOwner: string;
  role: RateGrant['role'];
  sign: RateGrant['sign'];
}
export interface UncertainOcRate extends Pick<
  InstanceBase,
  'sourceKey' | 'owner' | 'lifetime' | 'stateTraits' | 'turns' | 'uses' | 'formKey'
> {
  role: RateGrant['role'];
  requiredInput: CanonicalInputDefinition | null;
  occurrenceId: string;
}
export interface NpOcUseReceipt {
  actionId: string;
  gaugeBefore: number;
  baseOc: number;
  boostTotal: number;
  effectiveOc: number;
  participatingInstances: readonly number[];
  excludedInstances: readonly number[];
  boostUses: readonly (OcSourceEvidence & {
    instanceId: number;
    stages: number;
    included: boolean;
    usesBefore: OcLifetimeLimit;
  })[];
}

export function isConsistentNpOcUseReceipt(receipt: NpOcUseReceipt): boolean {
  return (
    receipt.baseOc === deriveBaseOvercharge(DEFAULT_NP_RESOURCE_SEMANTICS, receipt.gaugeBefore) &&
    receipt.effectiveOc === Math.min(5, receipt.baseOc + receipt.boostTotal) &&
    new Set(receipt.participatingInstances).size === receipt.participatingInstances.length &&
    new Set(receipt.excludedInstances).size === receipt.excludedInstances.length &&
    receipt.excludedInstances.every((id) => receipt.participatingInstances.includes(id)) &&
    receipt.boostUses.length === receipt.participatingInstances.length &&
    receipt.boostUses.every(
      (use, index) =>
        use.instanceId === receipt.participatingInstances[index] &&
        use.included === !receipt.excludedInstances.includes(use.instanceId),
    ) &&
    receipt.boostTotal ===
      receipt.boostUses.reduce((sum, use) => sum + (use.included ? use.stages : 0), 0)
  );
}
export interface OcState {
  boosts: readonly OcBoostInstance[];
  rates: readonly OcRateInstance[];
  uncertainRates: readonly UncertainOcRate[];
  nextInstanceId: number;
  removalResistance: readonly { actor: string; formKey?: string }[];
  constantSources: ReadonlySet<string>;
  executedSources: ReadonlySet<string>;
  sourceOutcomes: ReadonlyMap<string, 'success' | 'failure'>;
  committedActions: ReadonlySet<string>;
  receipts: readonly NpOcUseReceipt[];
  activeFormKey: string | null;
}
export const createOcState = (): OcState => ({
  boosts: [],
  rates: [],
  uncertainRates: [],
  nextInstanceId: 1,
  removalResistance: [],
  constantSources: new Set(),
  executedSources: new Set(),
  sourceOutcomes: new Map(),
  committedActions: new Set(),
  receipts: [],
  activeFormKey: null,
});
export type OcActionStep =
  | {
      kind: 'beginSource';
      sourceKey: string;
      outcome: 'conditionFalse' | 'notApplicable' | 'policyExcluded';
    }
  | {
      kind: 'finishSource';
      sourceKey: string;
      commit: boolean;
      outcome: 'conditionFalse' | 'notApplicable' | 'policyExcluded';
    }
  | { kind: 'uncertainRate'; rate: UncertainOcRate }
  | { kind: 'recordSource'; sourceKey: string }
  | { kind: 'activateForm'; formKey: string }
  | { kind: 'skip'; outcome: 'conditionFalse' | 'notApplicable' | 'policyExcluded' }
  | {
      kind: 'grant';
      grant: Grant;
      sourceKey: string;
      sourceEvidence: OcSourceEvidence;
      caster: string;
      recipient: string;
      valueSetIndex: number;
      valueIndex: number;
      limitBreak: boolean;
      included: boolean;
      condition: boolean | null;
      procWitness?: 0 | 1;
      formKey?: string;
    }
  | {
      kind: 'remove';
      recipient: string;
      selector: readonly OcStateTrait[];
      applicationRate: number;
      procWitness?: 0 | 1;
    }
  | { kind: 'removalResistance'; actor: string; formKey?: string }
  | { kind: 'npUse'; actor: string; gaugeBefore: number; baseOc: number }
  | { kind: 'reject'; status: 'invalid' | 'unsupported' | 'inputRequired'; reason: string };
export interface OcActionOutcome {
  step: number;
  outcome:
    | 'applied'
    | 'conditionFalse'
    | 'stochasticFailure'
    | 'alreadyApplied'
    | 'notApplicable'
    | 'policyExcluded'
    | 'pendingDependency';
  effectiveRate?: number | undefined;
}
export type OcActionResult =
  | { status: 'committed'; state: OcState; outcomes: readonly OcActionOutcome[] }
  | {
      status: 'invalid' | 'unsupported' | 'inputRequired';
      state: OcState;
      reason: string;
      requiredInput?: CanonicalInputDefinition;
      occurrenceId?: string;
      outcomes: readonly OcActionOutcome[];
    };
const live = (instance: Pick<InstanceBase, 'formKey' | 'turns' | 'uses'>, state: OcState) =>
  (instance.formKey === undefined || instance.formKey === state.activeFormKey) &&
  (instance.turns.kind === 'unlimited' || instance.turns.remaining > 0) &&
  (instance.uses.kind === 'unlimited' || instance.uses.remaining > 0);
/** A removal reads only matching active instances; constants and expired states cannot intersect. */
export function ocRemovalIntersects(
  state: OcState,
  recipient: string,
  selector: readonly string[],
  includedOnly = false,
): boolean {
  return [...state.boosts, ...state.rates, ...state.uncertainRates].some(
    (instance) =>
      instance.owner === recipient &&
      (!includedOnly || !('included' in instance) || instance.included) &&
      instance.lifetime === 'active' &&
      live(instance, state) &&
      instance.stateTraits.some((trait) => selector.includes(trait)),
  );
}
const consume = <T extends InstanceBase>(instance: T, used: ReadonlySet<number>): T =>
  used.has(instance.instanceId) && instance.uses.kind === 'finite'
    ? { ...instance, uses: { kind: 'finite', remaining: Math.max(0, instance.uses.remaining - 1) } }
    : instance;
export interface OcRateHpRead {
  rate: OcRateInstance;
  hp: number | null | undefined;
}
/** The native grant query population, before any rate value can reject the action. */
export function ocRateAppliesToGrant(
  rate: OcRateInstance,
  state: OcState,
  step: Extract<OcActionStep, { kind: 'grant' }>,
) {
  return (
    live(rate, state) &&
    rate.owner === (rate.role === 'casterGrant' ? step.caster : step.recipient) &&
    step.grant.stateTraits.includes('positive')
  );
}
function rateValue(
  rate: OcRateInstance,
  hp: Readonly<Record<string, number | null>>,
  observe?: (read: OcRateHpRead) => void,
) {
  if (rate.amount.kind === 'fixed') return { status: 'value' as const, value: rate.amount.value };
  if (rate.amount.kind !== 'inverseHpLinear' && rate.amount.kind !== 'hpRangeLinear')
    return { status: 'unsupported' as const, reason: 'unsupportedOcRateExpression' };
  const value = hp[rate.valueOwner];
  observe?.({ rate, hp: value });
  if (value === undefined || value === null)
    return { status: 'inputRequired' as const, reason: `ocRateHp:${rate.valueOwner}` };
  if (!Number.isInteger(value) || value < 0 || value > 1000)
    return { status: 'invalid' as const, reason: 'invalidOcRateHp' };
  return { status: 'value' as const, value: evaluateHpValueExpression(rate.amount, value) };
}
/** One action owns writes, receipts and finite-use consumption; any rejection returns the original state. */
export function executeOcAction(
  prior: OcState,
  actionId: string,
  steps: readonly (
    OcActionStep | ((state: OcState, outcomes: readonly OcActionOutcome[]) => OcActionStep)
  )[],
  hp: Readonly<Record<string, number | null>>,
  options: {
    hasFutureNpUse: boolean;
    resolveProcWitness?: (
      index: number,
      effectiveRate: number,
      declaredWitness: 0 | 1 | undefined,
    ) => 0 | 1 | undefined;
    observeStep?: (index: number, step: OcActionStep) => void;
    observeRateQuery?: (index: number, state: OcState, rate: OcRateInstance) => void;
    observeRateSelection?: (index: number, state: OcState) => void;
    observeRateHpRead?: (index: number, read: OcRateHpRead) => void;
  } = { hasFutureNpUse: true },
): OcActionResult {
  if (prior.committedActions.has(actionId))
    return { status: 'invalid', state: prior, reason: 'ocActionAlreadyCommitted', outcomes: [] };
  let state: OcState = {
    ...prior,
    boosts: [...prior.boosts],
    rates: [...prior.rates],
    constantSources: new Set(prior.constantSources),
    receipts: [...prior.receipts],
  };
  const used = new Set<number>();
  const sourceTransactions = new Map<string, { state: OcState; used: ReadonlySet<number> }>();
  const outcomes: OcActionOutcome[] = [];
  const reject = (
    status: 'invalid' | 'unsupported' | 'inputRequired',
    reason: string,
    requiredInput?: CanonicalInputDefinition,
    occurrenceId?: string,
  ): OcActionResult => ({
    status,
    reason,
    state: prior,
    outcomes: [],
    ...(requiredInput ? { requiredInput } : {}),
    ...(occurrenceId ? { occurrenceId } : {}),
  });
  for (const [index, instruction] of steps.entries()) {
    const step = typeof instruction === 'function' ? instruction(state, outcomes) : instruction;
    options.observeStep?.(index, step);
    if (step.kind === 'reject') return reject(step.status, step.reason);
    if (step.kind === 'beginSource') {
      if (sourceTransactions.size || sourceTransactions.has(step.sourceKey))
        return reject('invalid', 'duplicateOcSourceTransaction');
      sourceTransactions.set(step.sourceKey, { state, used: new Set(used) });
      outcomes.push({ step: index, outcome: step.outcome });
      continue;
    }
    if (step.kind === 'finishSource') {
      const transaction = sourceTransactions.get(step.sourceKey);
      if (!transaction) return reject('invalid', 'missingOcSourceTransaction');
      if (!step.commit) {
        // A completed proc failure rolls back physical writes. The completed attempt
        // remains available to the compiler; an action rejection still returns prior.
        state = { ...transaction.state, executedSources: state.executedSources };
        used.clear();
        transaction.used.forEach((instanceId) => used.add(instanceId));
      }
      sourceTransactions.delete(step.sourceKey);
      outcomes.push({ step: index, outcome: step.outcome });
      continue;
    }
    if (step.kind === 'uncertainRate') {
      if (state.uncertainRates.some((rate) => rate.sourceKey === step.rate.sourceKey)) {
        outcomes.push({ step: index, outcome: 'alreadyApplied' });
        continue;
      }
      state = { ...state, uncertainRates: [...state.uncertainRates, step.rate] };
      outcomes.push({ step: index, outcome: 'pendingDependency' });
      continue;
    }
    if (step.kind === 'recordSource') {
      state = { ...state, executedSources: new Set([...state.executedSources, step.sourceKey]) };
      continue;
    }
    if (step.kind === 'activateForm') {
      state = { ...state, activeFormKey: step.formKey };
      continue;
    }
    if (step.kind === 'skip') {
      outcomes.push({ step: index, outcome: step.outcome });
      continue;
    }
    if (step.kind === 'removalResistance') {
      state = {
        ...state,
        removalResistance: [
          ...state.removalResistance,
          { actor: step.actor, ...(step.formKey === undefined ? {} : { formKey: step.formKey }) },
        ],
      };
      continue;
    }
    if (step.kind === 'npUse') {
      if (state.receipts.some((receipt) => receipt.actionId === actionId))
        return reject('invalid', 'duplicateNpUseInAction');
      if (
        !Number.isInteger(step.baseOc) ||
        step.baseOc < 1 ||
        step.baseOc > 3 ||
        !Number.isInteger(step.gaugeBefore) ||
        step.gaugeBefore < DEFAULT_NP_RESOURCE_SEMANTICS.noblePhantasmUse.requirement ||
        step.baseOc !== deriveBaseOvercharge(DEFAULT_NP_RESOURCE_SEMANTICS, step.gaugeBefore)
      )
        return reject('invalid', 'invalidNpOcUse');
      const participating = state.boosts.filter(
        (instance) => instance.owner === step.actor && live(instance, state),
      );
      const boostTotal = participating.reduce(
        (sum, instance) => sum + (instance.included ? instance.stages : 0),
        0,
      );
      participating.forEach(({ instanceId }) => used.add(instanceId));
      state = {
        ...state,
        receipts: [
          ...state.receipts,
          {
            actionId,
            gaugeBefore: step.gaugeBefore,
            baseOc: step.baseOc,
            boostTotal,
            boostUses: participating.map((instance) => ({
              ...instance.sourceEvidence,
              instanceId: instance.instanceId,
              stages: instance.stages,
              included: instance.included,
              usesBefore: instance.uses,
            })),
            effectiveOc: Math.min(5, step.baseOc + boostTotal),
            participatingInstances: participating.map(({ instanceId }) => instanceId),
            excludedInstances: participating
              .filter(({ included }) => !included)
              .map(({ instanceId }) => instanceId),
          },
        ],
      };
      continue;
    }
    if (step.kind === 'remove') {
      const intersects = ocRemovalIntersects(state, step.recipient, step.selector, true);
      if (
        intersects &&
        state.removalResistance.some(
          (barrier) =>
            barrier.actor === step.recipient &&
            (barrier.formKey === undefined || barrier.formKey === state.activeFormKey),
        )
      ) {
        if (
          options.hasFutureNpUse ||
          !state.receipts.some((receipt) => receipt.actionId === actionId)
        )
          return reject('unsupported', 'liveOcRemovalResistance');
        // The terminal NP receipt is already frozen and no subsequent OC reader exists.
        outcomes.push({ step: index, outcome: 'notApplicable' });
        continue;
      }
      if (!Number.isInteger(step.applicationRate) || step.applicationRate < 0)
        return reject('invalid', 'invalidOcRemovalRate');
      const effectiveRate = Math.min(1000, step.applicationRate);
      const application = resolveApplicationRateOutcome(
        effectiveRate,
        options.resolveProcWitness
          ? options.resolveProcWitness(index, effectiveRate, step.procWitness)
          : step.procWitness,
      );
      if (application === 'invalid') return reject('invalid', 'invalidOcRemovalProc');
      if (application === 'inputRequired') return reject('inputRequired', `ocRemovalProc:${index}`);
      if (application === 'failure') {
        outcomes.push({ step: index, outcome: 'stochasticFailure', effectiveRate });
        continue;
      }
      const keep = (instance: Pick<InstanceBase, 'owner' | 'lifetime' | 'stateTraits'>) =>
        instance.owner !== step.recipient ||
        instance.lifetime === 'constant' ||
        !instance.stateTraits.some((trait) => step.selector.includes(trait));
      state = {
        ...state,
        boosts: state.boosts.filter(keep),
        rates: state.rates.filter(keep),
        uncertainRates: state.uncertainRates.filter(keep),
      };
      outcomes.push({ step: index, outcome: 'applied', effectiveRate });
      continue;
    }
    if (step.condition === null) return reject('inputRequired', `ocCondition:${step.sourceKey}`);
    if (!step.condition) {
      outcomes.push({ step: index, outcome: 'conditionFalse' });
      continue;
    }
    if (step.grant.lifetime === 'constant' && state.constantSources.has(step.sourceKey)) {
      outcomes.push({ step: index, outcome: 'alreadyApplied' });
      continue;
    }
    const cells = step.limitBreak ? step.grant.limitBreakCells : step.grant.cells;
    const cell = cells?.[step.valueSetIndex]?.[step.valueIndex];
    if (!cell) return reject('invalid', 'missingOcCell');
    let effectiveRate = cell.applicationRatePermille;
    if (step.grant.lifetime !== 'constant') {
      const pending = state.uncertainRates.find(
        (rate) =>
          live(rate, state) &&
          rate.owner === (rate.role === 'casterGrant' ? step.caster : step.recipient) &&
          step.grant.stateTraits.includes('positive'),
      );
      if (pending)
        return reject(
          pending.requiredInput ? 'inputRequired' : 'unsupported',
          `ocRateCondition:${pending.sourceKey}`,
          pending.requiredInput ?? undefined,
          pending.occurrenceId,
        );
      options.observeRateSelection?.(index, state);
      for (const rate of state.rates) {
        if (!ocRateAppliesToGrant(rate, state, step)) continue;
        options.observeRateQuery?.(index, state, rate);
        used.add(rate.instanceId);
        if (!rate.included) continue;
        const value = rateValue(
          rate,
          hp,
          options.observeRateHpRead ? (read) => options.observeRateHpRead!(index, read) : undefined,
        );
        if (value.status !== 'value') return reject(value.status, value.reason);
        effectiveRate += value.value * rate.sign * (rate.role === 'casterGrant' ? 1 : -1);
      }
    }
    effectiveRate = Math.min(1000, Math.max(0, effectiveRate));
    const application = resolveApplicationRateOutcome(
      effectiveRate,
      options.resolveProcWitness
        ? options.resolveProcWitness(index, effectiveRate, step.procWitness)
        : step.procWitness,
    );
    if (application === 'invalid') return reject('invalid', 'invalidOcGrantProc');
    if (application === 'inputRequired') return reject('inputRequired', `ocProc:${step.sourceKey}`);
    if (application === 'failure') {
      outcomes.push({ step: index, outcome: 'stochasticFailure', effectiveRate });
      continue;
    }
    const base: InstanceBase = {
      instanceId: state.nextInstanceId,
      sourceKey: step.sourceKey,
      sourceEvidence: step.sourceEvidence,
      owner: step.recipient,
      lifetime: step.grant.lifetime,
      stateTraits: step.grant.stateTraits,
      turns: cell.turns,
      uses: cell.uses,
      included: step.included,
      ...(step.formKey === undefined ? {} : { formKey: step.formKey }),
    };
    if (step.grant.kind === 'grantOcBoost' && 'stages' in cell)
      state = { ...state, boosts: [...state.boosts, { ...base, stages: cell.stages }] };
    else if (step.grant.kind === 'grantOcApplicationRate' && 'amount' in cell)
      state = {
        ...state,
        rates: [
          ...state.rates,
          {
            ...base,
            amount: cell.amount,
            valueOwner: step.caster,
            role: step.grant.role,
            sign: step.grant.sign,
          },
        ],
      };
    else return reject('invalid', 'ocCellKindMismatch');
    state = {
      ...state,
      nextInstanceId: state.nextInstanceId + 1,
      constantSources:
        step.grant.lifetime === 'constant'
          ? new Set([...state.constantSources, step.sourceKey])
          : state.constantSources,
    };
    outcomes.push({ step: index, outcome: 'applied', effectiveRate });
  }
  if (sourceTransactions.size) return reject('invalid', 'unclosedOcSourceTransaction');
  return {
    status: 'committed',
    outcomes,
    state: {
      ...state,
      boosts: state.boosts.map((instance) => consume(instance, used)),
      rates: state.rates.map((instance) => consume(instance, used)),
      committedActions: new Set([...state.committedActions, actionId]),
    },
  };
}
