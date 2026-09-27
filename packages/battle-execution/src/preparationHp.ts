import type { CanonicalInputDefinition, MasterEffect } from '@fgo-lab/master-data';
import type { SourceEffect } from './sourceCollection';
import {
  HpConditionUnavailable,
  hpRatio,
  hpAlive,
  changeHpModifiers,
  hpModifierValue,
  seedHp,
  transitionHp,
  type HpState,
  type HpModifierInstance,
  type HpActorState,
} from './hpResource';
import { sourceHpInputKey, sourceMaximumHpInput } from './operationCompiler';
function enemyMaximumInput(index: number, minimum: number): CanonicalInputDefinition {
  return {
    kind: 'sourceMaximumHp',
    key: `hp:enemy:${index}:maximum`,
    owner: 'field',
    label: `敵${index + 1}の準備開始時の最大HP`,
    description: '回復や割合減少の後の吸収量を初期状態から計算するための最大HP',
    minimum,
    maximum: Number.MAX_SAFE_INTEGER,
    step: 1,
    defaultValue: null,
    defaultReason: null,
  };
}
export type HpOperation =
  | Extract<MasterEffect['execution'][number], { kind: 'hpModifier' | 'removeHpModifiers' }>
  | Extract<MasterEffect['execution'][number], { kind: 'resourceMutation'; resource: 'hp' }>;
export function isHpOperation(
  operation: MasterEffect['execution'][number],
): operation is HpOperation {
  return (
    operation.kind === 'hpModifier' ||
    operation.kind === 'removeHpModifiers' ||
    (operation.kind === 'resourceMutation' && operation.resource === 'hp')
  );
}
function sourceActor(source: SourceEffect): string {
  return source.origin === 'support' || source.origin === 'mysticCode'
    ? source.sourceInstanceId
    : 'attacker';
}
function recipients(operation: HpOperation, source: SourceEffect, state: HpState): string[] | null {
  const recipient =
    operation.kind === 'resourceMutation' ? operation.recipient : operation.route.target;
  const actor = sourceActor(source);
  if (operation.selection === 'selectedAlly') return ['attacker'];
  if (operation.selection === 'allEnemies') return ['enemy:0', 'enemy:1', 'enemy:2'];
  if (operation.kind === 'resourceMutation' && operation.selection === 'lowestHpRatio') {
    const allies = [
      ...new Set([
        'attacker',
        ...(source.origin === 'mysticCode' ? [] : [actor]),
        ...Object.keys(state.actors).filter((key) => !key.startsWith('enemy:')),
      ]),
    ];
    const ratios = allies
      .filter((id) => hpAlive(state.actors[id]) !== false)
      .map((id) => ({ id, ratio: hpRatio(state.actors[id]) }));
    if (ratios.some((item) => item.ratio === null)) return null;
    if (!ratios.length) return [];
    const minimum = Math.min(...ratios.map((item) => item.ratio!));
    const lowest = ratios.filter((item) => item.ratio === minimum);
    return lowest.length ? [lowest[0]!.id] : [];
  }
  switch (recipient) {
    case 'sourceSelf':
    case 'sourceActor':
    case 'attackerNpCard':
      return [actor];
    case 'partyMember':
      return [
        ...new Set([
          'attacker',
          ...(source.origin === 'mysticCode' ? [] : [actor]),
          ...Object.keys(state.actors).filter((key) => !key.startsWith('enemy:')),
        ]),
      ];
    case 'partyOther':
      return [
        ...new Set([
          'attacker',
          ...Object.keys(state.actors).filter((key) => !key.startsWith('enemy:')),
        ]),
      ].filter((key) => key !== actor);
    case 'enemy':
      return ['enemy:0'];
    case 'unresolved':
      return null;
  }
}
/** Original HP owner inputs/results; allocated only for requested capture. */
export interface HpGainConsumption {
  actor: string;
  before: HpActorState;
  modifierState: HpState;
  receive: { instances: readonly HpModifierInstance[]; value: number };
  mutation: Parameters<typeof transitionHp>[1];
  result: ReturnType<typeof transitionHp>;
}
export interface HpGiveGainConsumption extends HpGainConsumption {
  give: { actor: string; instances: readonly HpModifierInstance[]; value: number };
}
export function executeHpOperation(args: {
  state: HpState;
  operation: HpOperation;
  source: SourceEffect;
  values: Readonly<Record<string, number>>;
  actionId: string;
  valueSetIndex: number;
  observeGain?: ((consumption: HpGainConsumption) => void) | undefined;
  observeGiveGain?: ((consumption: HpGiveGainConsumption) => void) | undefined;
  unresolvedCondition?: CanonicalInputDefinition | null;
  modifierCondition?: (instance: HpModifierInstance) => {
    outcome: boolean | null;
    input: CanonicalInputDefinition | null;
  };
  conditionForRecipient?: (actor: string) => {
    outcome: boolean | null;
    input: CanonicalInputDefinition | null;
  };
}):
  | { status: 'applied'; state: HpState }
  | { status: 'inputRequired'; requiredInput: CanonicalInputDefinition }
  | { status: 'unsupported' | 'invalid' } {
  try {
    let state = args.state;
    const { source, operation } = args;
    if (
      operation.kind === 'resourceMutation' &&
      operation.amount.kind === 'hpTransfer' &&
      (operation.direction !== 'gain' ||
        operation.unit !== 'fixed' ||
        operation.recipient !== 'sourceSelf')
    )
      return { status: 'unsupported' };
    if (operation.kind === 'resourceMutation' && operation.selection === 'lowestHpRatio') {
      for (const [actorId, actor] of Object.entries(state.actors)) {
        if (actorId === 'attacker' || actorId.startsWith('enemy:') || hpAlive(actor) === false)
          continue;
        const input = sourceMaximumHpInput({ origin: 'support', sourceInstanceId: actorId });
        const key = input.key;
        const maximum = args.values[key];
        if (
          (hpRatio(actor) === null && maximum === undefined) ||
          (maximum !== undefined && (!Number.isSafeInteger(maximum) || maximum < 1))
        )
          return { status: 'inputRequired', requiredInput: input };
        if (args.values[key] !== undefined)
          state = {
            ...state,
            inputDefinitions: [
              ...(state.inputDefinitions ?? []).filter((definition) => definition.key !== key),
              input,
            ],
          };
      }
    }
    const ids = recipients(operation, source, state);
    if (!ids) return { status: 'unsupported' };
    for (const id of ids) {
      const condition = args.conditionForRecipient?.(id);
      if (condition?.outcome === false) continue;
      const defer =
        condition?.outcome === null &&
        operation.kind === 'hpModifier' &&
        ['receive', 'give', 'noHealing'].includes(operation.action);
      if (condition?.outcome === null && !defer) {
        if (
          hpOperationIsInert(
            {
              ...state,
              actors: Object.fromEntries(
                Object.entries(state.actors).filter(([key]) => key === id),
              ),
            },
            operation,
            source,
          )
        )
          continue;
        return condition.input
          ? { status: 'inputRequired', requiredInput: condition.input }
          : { status: 'unsupported' };
      }
      let actor: HpActorState =
        state.actors[id] ??
        (id === sourceActor(source)
          ? seedHp(undefined, args.values[sourceHpInputKey(source)] ?? 1000)
          : { kind: 'missing' });
      if (state.actors[id] === undefined && id.startsWith('enemy:')) {
        const index = Number(id.slice('enemy:'.length));
        const value = args.values[`transfer:enemyHp:${index}`];
        if (
          value !== undefined &&
          Number.isSafeInteger(value) &&
          value >= 0 &&
          value <= Number.MAX_SAFE_INTEGER
        ) {
          const input = enemyMaximumInput(index, Math.max(1, value));
          const maximum = args.values[input.key];
          if (maximum !== undefined) {
            if (!Number.isSafeInteger(maximum) || maximum < input.minimum)
              return { status: 'inputRequired', requiredInput: input };
            actor = { kind: 'absolute', baseMaximum: maximum, maximum, current: value };
            state = {
              ...state,
              inputDefinitions: [
                ...(state.inputDefinitions ?? []).filter(
                  (definition) => definition.key !== input.key,
                ),
                input,
              ],
            };
          } else actor = { kind: 'currentOnly', current: value };
        }
      }
      const before = actor;
      let attempted: number | null = 0,
        actual: number | null = 0;
      if (
        operation.kind === 'resourceMutation' &&
        operation.direction === 'gain' &&
        operation.amount.kind === 'fixed' &&
        actor.kind === 'ratioOnly' &&
        actor.permille === 1000
      )
        continue;
      if (operation.kind === 'hpModifier') {
        if (
          operation.useCondition &&
          operation.useCondition.kind !== 'always' &&
          !['receive', 'give', 'noHealing'].includes(operation.action)
        )
          return { status: 'unsupported' };
        const value = (source.limitBreak ? operation.limitBreakValues : operation.values)?.[
          args.valueSetIndex
        ]?.[source.valueIndex];
        if (value == null || !Number.isSafeInteger(value)) return { status: 'invalid' };
        state = changeHpModifiers(
          { ...state, actors: { ...state.actors, [id]: actor } },
          id,
          {
            id: `${args.actionId}:${source.sourceInstanceId}:${source.effect.occurrenceId}`,
            actor: id,
            formKey: source.constantFormKey ?? null,
            operation,
            value,
            ...(defer
              ? { unresolvedCondition: condition.input }
              : Object.hasOwn(args, 'unresolvedCondition')
                ? { unresolvedCondition: args.unresolvedCondition }
                : {}),
          },
          () => false,
        );
        actor = state.actors[id]!;
      } else if (operation.kind === 'removeHpModifiers') {
        state = changeHpModifiers(
          state,
          id,
          null,
          (instance) =>
            instance.actor === id &&
            instance.operation.lifetime === 'active' &&
            instance.operation.traits.some((trait) => operation.traits.includes(trait)),
        );
        actor = state.actors[id] ?? actor;
      } else {
        let amount = (
          source.limitBreak ? operation.amount.limitBreakValues : operation.amount.values
        )?.[args.valueSetIndex]?.[source.valueIndex];
        if (amount == null) return { status: 'invalid' };
        const transfer = operation.amount.kind === 'hpTransfer' ? operation.amount : null;
        if (transfer) {
          const indexes =
            transfer.donors === 'selectedEnemy'
              ? [0]
              : transfer.donors === 'otherEnemy'
                ? [1]
                : [0, 1, 2];
          let total = 0;
          for (const index of indexes) {
            const key = transfer.inputKeys[index]!;
            const initial = args.values[key] ?? 0;
            if (
              !Number.isSafeInteger(initial) ||
              initial < 0 ||
              initial > Number.MAX_SAFE_INTEGER
            ) {
              const input = source.effect.inputDefinitions.find(
                (input) => input.kind === 'transferDonor' && input.key === key,
              );
              return input?.kind === 'transferDonor'
                ? {
                    status: 'inputRequired',
                    requiredInput: { ...input, defaultValue: null, defaultReason: null },
                  }
                : { status: 'invalid' };
            }
            const donorId = `enemy:${index}`;
            const donor = state.actors[donorId] ?? {
              kind: 'currentOnly' as const,
              current: initial,
            };
            if (donor.kind !== 'absolute' && donor.kind !== 'currentOnly') {
              const input = source.effect.inputDefinitions.find(
                (input) => input.kind === 'transferDonor' && input.key === key,
              );
              if (!Object.hasOwn(args.values, key))
                return input?.kind === 'transferDonor'
                  ? {
                      status: 'inputRequired',
                      requiredInput: { ...input, defaultValue: null, defaultReason: null },
                    }
                  : { status: 'unsupported' };
              const maximum = enemyMaximumInput(index, Math.max(1, initial));
              return Object.hasOwn(args.values, maximum.key)
                ? { status: 'unsupported' }
                : { status: 'inputRequired', requiredInput: maximum };
            }
            const calculatedGain = Math.min(Math.max(0, donor.current - 1), amount);
            const loss = transitionHp(donor, {
              direction: 'loss',
              unit: 'fixed',
              amount,
              lossFloor: 'oneIfAlive',
            });
            if (loss.status !== 'applied') return loss;
            if (loss.actor.kind !== 'currentOnly' && loss.actor.kind !== 'absolute')
              return { status: 'invalid' };
            total += calculatedGain;
            if (!Number.isSafeInteger(total)) return { status: 'invalid' };
            state = {
              ...state,
              actors: { ...state.actors, [donorId]: loss.actor },
              donorReceipts: [
                ...(state.donorReceipts ?? []),
                {
                  actor: donorId,
                  snapshot: donor.current,
                  calculatedGain,
                  actualLoss: loss.actual,
                  remaining: loss.actor.current,
                },
              ],
            };
          }
          amount = total;
        }
        const modifierState =
          operation.direction === 'gain'
            ? {
                ...state,
                modifiers: (state.modifiers ?? []).filter((instance) => {
                  if (!instance.operation.useCondition) return true;
                  const readAtReceiver =
                    instance.actor === id &&
                    (instance.operation.action === 'noHealing' ||
                      (!transfer && instance.operation.action === 'receive'));
                  const readAtSource =
                    !transfer &&
                    instance.actor === sourceActor(source) &&
                    instance.operation.action === 'give';
                  if (!readAtReceiver && !readAtSource) return true;
                  const resolved = args.modifierCondition?.(instance);
                  if (!resolved || resolved.outcome === null)
                    throw new HpConditionUnavailable(resolved?.input ?? null);
                  return resolved.outcome;
                }),
              }
            : state;
        let receiveRead: HpGainConsumption['receive'] | undefined;
        let giveRead: HpGiveGainConsumption['give'] | undefined;
        const mutation: Parameters<typeof transitionHp>[1] = {
          direction: operation.direction,
          unit: operation.unit,
          amount,
          ...(operation.direction === 'loss' ? { lossFloor: operation.lossFloor } : {}),
          receive:
            transfer || operation.direction === 'loss'
              ? 1000
              : 1000 +
                hpModifierValue(
                  modifierState,
                  id,
                  'receive',
                  args.observeGain || args.observeGiveGain
                    ? (instances, value) => {
                        receiveRead = { instances, value };
                      }
                    : undefined,
                ),
          give:
            transfer || operation.direction === 'loss'
              ? 1000
              : 1000 +
                hpModifierValue(
                  modifierState,
                  sourceActor(source),
                  'give',
                  args.observeGiveGain
                    ? (instances, value) => {
                        giveRead = { actor: sourceActor(source), instances, value };
                      }
                    : undefined,
                ),
          noHealing:
            operation.direction === 'gain' && hpModifierValue(modifierState, id, 'noHealing') > 0,
        };
        const result = transitionHp(actor, mutation);
        if (args.observeGain && receiveRead)
          args.observeGain({
            actor: id,
            before: actor,
            modifierState,
            receive: receiveRead,
            mutation,
            result,
          });
        if (args.observeGiveGain && receiveRead && giveRead)
          args.observeGiveGain({
            actor: id,
            before: actor,
            modifierState,
            receive: receiveRead,
            give: giveRead,
            mutation,
            result,
          });
        if (result.status !== 'applied') {
          if (id === 'attacker') return result;
          actor = { kind: 'missing' };
          attempted = operation.unit === 'fixed' && operation.direction === 'loss' ? amount : null;
          actual = null;
        } else {
          actor = result.actor;
          attempted = result.attempted;
          actual = result.actual;
        }
      }
      state = {
        ...state,
        actors: { ...state.actors, [id]: actor },
        receipts: [
          ...state.receipts,
          {
            actionId: args.actionId,
            occurrenceId: source.effect.occurrenceId,
            actor: id,
            before,
            after: actor,
            attempted,
            actual,
          },
        ],
      };
    }
    // A proven empty recipient set is also a committed no-op.
    if (!ids.length)
      state = {
        ...state,
        receipts: [
          ...state.receipts,
          {
            actionId: args.actionId,
            occurrenceId: source.effect.occurrenceId,
            actor: 'excluded',
            before: { kind: 'missing' },
            after: { kind: 'missing' },
            attempted: 0,
            actual: 0,
          },
        ],
      };
    return { status: 'applied', state };
  } catch (error) {
    if (error instanceof HpConditionUnavailable)
      return error.input
        ? { status: 'inputRequired', requiredInput: error.input }
        : { status: 'unsupported' };
    if (error instanceof RangeError) return { status: 'invalid' };
    throw error;
  }
}

export function hpEffectKey(source: SourceEffect): string {
  return JSON.stringify([
    source.origin,
    source.sourceInstanceId,
    source.skillId,
    source.effect.occurrenceId,
  ]);
}

/** Prove both activation outcomes leave the observed state identical before ignoring uncertainty. */
export function hpOperationIsInert(
  state: HpState,
  operation: HpOperation,
  source: SourceEffect,
): boolean {
  const ids = recipients(operation, source, state);
  if (!ids) return false;
  if (!ids.length) return true;
  if (operation.kind === 'removeHpModifiers')
    return !(state.modifiers ?? []).some(
      (instance) =>
        ids.includes(instance.actor) &&
        instance.operation.lifetime === 'active' &&
        instance.operation.traits.some((trait) => operation.traits.includes(trait)),
    );
  return (
    operation.kind === 'resourceMutation' &&
    operation.direction === 'gain' &&
    operation.amount.kind === 'fixed' &&
    ids.every((id) => {
      const actor = state.actors[id];
      return (
        (actor?.kind === 'absolute' && actor.current === actor.maximum) ||
        (actor?.kind === 'ratioOnly' && actor.permille === 1000)
      );
    })
  );
}
