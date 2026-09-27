import type { CanonicalInputDefinition, EffectExecutionOperation } from '@fgo-lab/master-data';
/** HP arithmetic follows the adopted Chaldea reference, separately from damage Float32. */
export type HpActorState =
  | { kind: 'absolute'; baseMaximum: number; maximum: number; current: number }
  | { kind: 'currentOnly'; current: number }
  | { kind: 'ratioOnly'; permille: number }
  | { kind: 'missing' };
export interface HpMutationReceipt {
  actionId: string;
  occurrenceId: string;
  actor: string;
  before: HpActorState;
  after: HpActorState;
  attempted: number | null;
  actual: number | null;
}
export interface HpModifierInstance {
  id: string;
  actor: string;
  formKey: string | null;
  operation: Extract<EffectExecutionOperation, { kind: 'hpModifier' }>;
  value: number;
  unresolvedCondition?: CanonicalInputDefinition | null | undefined;
}
export interface HpState {
  inputDefinitions?: readonly CanonicalInputDefinition[] | undefined;
  executedEffects?: readonly string[] | undefined;
  modifiers?: readonly HpModifierInstance[] | undefined;
  donorReceipts?:
    | readonly {
        actor: string;
        snapshot: number;
        calculatedGain: number;
        actualLoss: number;
        remaining: number;
      }[]
    | undefined;
  actors: Readonly<Record<string, HpActorState>>;
  receipts: readonly HpMutationReceipt[];
}
export function seedHp(maximum: number | undefined, permille: number | null): HpActorState {
  if (permille === null) return { kind: 'missing' };
  if (!Number.isSafeInteger(permille) || permille < 0 || permille > 1000)
    throw new TypeError('invalid_initial_hp_ratio');
  if (maximum === undefined) return { kind: 'ratioOnly', permille };
  if (!Number.isSafeInteger(maximum) || maximum <= 0) throw new TypeError('invalid_maximum_hp');
  const current =
    permille === 0 ? 0 : Math.max(1, Number((BigInt(maximum) * BigInt(permille)) / 1000n));
  return { kind: 'absolute', baseMaximum: maximum, maximum, current };
}
export function hpPermille(actor: HpActorState | undefined): number | null {
  if (!actor || actor.kind === 'missing' || actor.kind === 'currentOnly') return null;
  return actor.kind === 'ratioOnly'
    ? actor.permille
    : Math.trunc((actor.current / actor.maximum) * 1000);
}
export function hpRatio(actor: HpActorState | undefined): number | null {
  if (!actor || actor.kind === 'missing' || actor.kind === 'currentOnly') return null;
  // An observed integer permille does not identify the continuous ratio between endpoints.
  if (actor.kind === 'ratioOnly')
    return actor.permille === 0 ? 0 : actor.permille === 1000 ? 1 : null;
  return actor.current / actor.maximum;
}
export function hpAlive(actor: HpActorState | undefined): boolean | null {
  if (!actor || actor.kind === 'missing') return null;
  return actor.kind === 'ratioOnly' ? actor.permille > 0 : actor.current > 0;
}
export function transitionHp(
  actor: HpActorState,
  mutation: {
    direction: 'gain' | 'loss';
    unit: 'fixed' | 'percent';
    amount: number;
    lossFloor?: 'zero' | 'oneIfAlive';
    receive?: number;
    give?: number;
    noHealing?: boolean;
  },
):
  | { status: 'applied'; actor: HpActorState; attempted: number; actual: number }
  | { status: 'unsupported' | 'invalid' } {
  if (actor.kind === 'currentOnly' && mutation.direction === 'loss' && mutation.unit === 'fixed') {
    if (!Number.isSafeInteger(mutation.amount) || mutation.amount < 0) return { status: 'invalid' };
    const current =
      actor.current === 0
        ? 0
        : Math.max(mutation.lossFloor === 'oneIfAlive' ? 1 : 0, actor.current - mutation.amount);
    return {
      status: 'applied',
      actor: { ...actor, current },
      attempted: mutation.amount,
      actual: actor.current - current,
    };
  }
  if (actor.kind !== 'absolute') return { status: 'unsupported' };
  if (!Number.isSafeInteger(mutation.amount) || mutation.amount < 0) return { status: 'invalid' };
  const base =
    mutation.unit === 'percent' ? actor.maximum * (0.001 * mutation.amount) : mutation.amount;
  const attempted =
    mutation.direction === 'gain'
      ? Math.trunc(base * (0.001 * (mutation.receive ?? 1000)) * (0.001 * (mutation.give ?? 1000)))
      : Math.trunc(base);
  if (!Number.isSafeInteger(attempted)) return { status: 'invalid' };
  if (
    actor.current === 0 ||
    (mutation.direction === 'gain' && (mutation.noHealing || attempted < 0))
  )
    return { status: 'applied', actor, attempted, actual: 0 };
  const current =
    mutation.direction === 'gain'
      ? Math.min(actor.maximum, actor.current + attempted)
      : Math.max(mutation.lossFloor === 'oneIfAlive' ? 1 : 0, actor.current - attempted);
  return {
    status: 'applied',
    actor: { ...actor, current },
    attempted,
    actual: Math.abs(current - actor.current),
  };
}

export class HpConditionUnavailable extends Error {
  constructor(readonly input: CanonicalInputDefinition | null) {
    super('unresolved_hp_modifier_condition');
  }
}
export function hpModifierValue(
  state: HpState,
  actor: string,
  action: HpModifierInstance['operation']['action'],
  observe?: (instances: readonly HpModifierInstance[], value: number) => void,
): number {
  const instances = (state.modifiers ?? []).filter(
    (instance) => instance.actor === actor && instance.operation.action === action,
  );
  const uncertain = instances.find((instance) => Object.hasOwn(instance, 'unresolvedCondition'));
  if (uncertain) throw new HpConditionUnavailable(uncertain.unresolvedCondition ?? null);
  const base = action === 'receive' || action === 'give' ? 1000 : 0;
  let value =
    base + instances.reduce((sum, instance) => sum + instance.value * instance.operation.sign, 0);
  const minima = instances.flatMap((instance) =>
    instance.operation.bounds.minimum === null ? [] : [instance.operation.bounds.minimum],
  );
  const maxima = instances.flatMap((instance) =>
    instance.operation.bounds.maximum === null ? [] : [instance.operation.bounds.maximum],
  );
  if (minima.length) value = Math.max(Math.min(...minima), value);
  if (maxima.length) value = Math.min(Math.max(...maxima), value);
  observe?.(instances, value);
  return value - base;
}
function maximumHp(state: HpState, actor: string, base: number): number {
  return Math.max(
    1,
    base +
      hpModifierValue(state, actor, 'maximumFixed') +
      hpModifierValue(state, actor, 'baseFixed') +
      Math.trunc(
        0.001 *
          ((hpModifierValue(state, actor, 'maximumRate') +
            hpModifierValue(state, actor, 'baseRate')) *
            base),
      ),
  );
}
export function changeHpModifiers(
  state: HpState,
  actorId: string,
  add: HpModifierInstance | null,
  remove: (instance: HpModifierInstance) => boolean,
): HpState {
  const removed = (state.modifiers ?? []).filter(remove);
  const modifiers = [
    ...(state.modifiers ?? []).filter((instance) => !remove(instance)),
    ...(add ? [add] : []),
  ];
  const next = { ...state, modifiers };
  const actor = state.actors[actorId];
  if (actor?.kind !== 'absolute') {
    const maximumAction = (instance: HpModifierInstance) =>
      ['maximumFixed', 'maximumRate', 'baseFixed', 'baseRate'].includes(instance.operation.action);
    const changesMaximum = (add !== null && maximumAction(add)) || removed.some(maximumAction);
    if (
      changesMaximum &&
      actor &&
      !(
        actor.kind === 'ratioOnly' &&
        actor.permille === 1000 &&
        removed.every((instance) => instance.operation.sign === 1)
      )
    )
      return { ...next, actors: { ...next.actors, [actorId]: { kind: 'missing' } } };
    return next;
  }
  const maximum = maximumHp(next, actorId, actor.baseMaximum);
  if (!Number.isSafeInteger(maximum)) throw new RangeError('unsafe_maximum_hp');
  let current = actor.current;
  if (current > 0) {
    for (const instance of removed) {
      if (instance.actor !== actorId || instance.operation.sign !== 1) continue;
      if (instance.operation.action === 'baseFixed')
        current = Math.max(1, current - instance.value);
      if (instance.operation.action === 'baseRate')
        current = Math.max(1, current - Math.trunc(0.001 * (actor.baseMaximum * instance.value)));
    }
    if (
      add &&
      ['maximumFixed', 'maximumRate', 'baseFixed', 'baseRate'].includes(add.operation.action)
    ) {
      const delta = add.operation.action.endsWith('Rate')
        ? Math.trunc(0.001 * (actor.baseMaximum * add.value))
        : add.value;
      current = Math.max(1, current + add.operation.sign * delta);
    }
    current = Math.min(current, maximum);
  }
  return { ...next, actors: { ...next.actors, [actorId]: { ...actor, maximum, current } } };
}

/** Transform updates base HP and clamps current before old form passives are removed. */
export function rebaseHpMaximum(
  state: HpState,
  actorId: string,
  baseMaximum: number,
  actionId: string,
): HpState {
  if (!Number.isSafeInteger(baseMaximum) || baseMaximum <= 0)
    throw new RangeError('invalid_form_maximum_hp');
  const actor = state.actors[actorId];
  if (actor?.kind !== 'absolute' || actor.baseMaximum === baseMaximum) return state;
  const maximum = maximumHp(state, actorId, baseMaximum);
  if (!Number.isSafeInteger(maximum)) throw new RangeError('unsafe_form_maximum_hp');
  const after = { ...actor, baseMaximum, maximum, current: Math.min(actor.current, maximum) };
  return {
    ...state,
    actors: { ...state.actors, [actorId]: after },
    receipts: [
      ...state.receipts,
      {
        actionId,
        occurrenceId: 'formBaseMaximum',
        actor: actorId,
        before: actor,
        after,
        attempted: Math.abs(maximum - actor.maximum),
        actual: actor.current - after.current,
      },
    ],
  };
}
