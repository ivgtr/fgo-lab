import type { BattlePointDomain, EffectExecutionOperation } from '@fgo-lab/master-data';
import type { SourceEffect } from './sourceCollection';
import { resolveResourceTargetPolicy } from './effectRouting';
import { markerTraitCounts } from './buffInstances';
import { findActorForm, type ServantMaster } from '@fgo-lab/master-data';
import type { PreNoblePhantasmState, PreparationExecutionContext } from './preparationContracts';

export type BattlePointValue =
  | { kind: 'absent'; eligible: boolean }
  | {
      kind: 'present';
      point: number;
      capacity: number | null;
      capacityModifiers: readonly BattlePointCapacityModifier[];
    };

export interface BattlePointCapacityModifier {
  identity: string;
  amount: number;
  lifetime: 'active' | 'constant';
  traits: readonly string[];
}

export interface BattlePointActorState {
  actorId: string;
  domains: Readonly<Record<string, BattlePointValue>>;
}

export interface BattlePointState {
  actors: Readonly<Record<string, BattlePointActorState>>;
  receipts: readonly {
    identity: string;
    actor: string;
    domainId: string;
    before: BattlePointValue;
    after: BattlePointValue;
  }[];
  executedEffects: readonly string[];
}

export const emptyBattlePointState = (): BattlePointState => ({
  actors: {},
  receipts: [],
  executedEffects: [],
});

export const battlePointEffectKey = (source: SourceEffect) =>
  JSON.stringify([
    source.origin,
    source.sourceInstanceId,
    source.skillId,
    source.effect.occurrenceId,
  ]);

function definition(domains: readonly BattlePointDomain[], domainId: string) {
  return domains.find((candidate) => candidate.id === domainId);
}

function eligible(domain: BattlePointDomain, actorId: string, traits: ReadonlySet<string>) {
  return domain.eligibility.some((rule) =>
    rule.kind === 'actor' ? rule.actorId === actorId : rule.all.every((trait) => traits.has(trait)),
  );
}

function baseCapacity(domain: BattlePointDomain, traits: ReadonlySet<string>): number | null {
  const override = domain.capacity.traitOverrides.find((rule) =>
    rule.all.every((trait) => traits.has(trait)),
  );
  return override?.value ?? domain.capacity.default;
}

function effectiveCapacity(
  domain: BattlePointDomain,
  traits: ReadonlySet<string>,
  modifiers: readonly BattlePointCapacityModifier[],
) {
  const base = baseCapacity(domain, traits);
  if (base === null) return null;
  const value = base + modifiers.reduce((sum, modifier) => sum + modifier.amount, 0);
  return domain.capacity.maximum === null
    ? Math.max(0, value)
    : Math.min(domain.capacity.maximum, Math.max(0, value));
}

export function battlePointPhase(
  domain: BattlePointDomain,
  value: BattlePointValue | undefined,
): number | null {
  if (value === undefined) return null;
  if (value.kind === 'absent') return domain.phases[0]?.phase ?? 0;
  const scaled =
    domain.phaseScale === 'permille'
      ? value.capacity !== null && value.capacity > 0
        ? Math.floor((value.point * 1000) / value.capacity)
        : 0
      : value.point;
  let result = domain.phases[0]!.phase;
  for (const phase of domain.phases) if (scaled >= phase.threshold) result = phase.phase;
  return result;
}

export function battlePointRate(value: BattlePointValue | undefined): number | null {
  if (value === undefined) return null;
  if (value.kind === 'absent') return 0;
  return value.capacity !== null && value.capacity > 0
    ? Math.max(0, Math.min(1000, Math.floor((value.point * 1000) / value.capacity)))
    : 0;
}

export function battlePointPhaseCandidates(
  domain: BattlePointDomain,
  phase: number,
  capacity: number | null,
): number[] {
  if (phase === 0) return [];
  const ceiling = capacity ?? Math.max(...domain.phases.map((entry) => entry.threshold), 0);
  const values: number[] = [];
  for (let point = 0; point <= ceiling; point++) {
    const value: BattlePointValue = { kind: 'present', point, capacity, capacityModifiers: [] };
    if (battlePointPhase(domain, value) === phase) values.push(point);
  }
  return values;
}

export function reconcileBattlePointActor(args: {
  state: BattlePointState;
  actor: string;
  actorId: string;
  traits: ReadonlySet<string>;
  domains: readonly BattlePointDomain[];
  initialPoints?: Readonly<Record<string, number>>;
}): BattlePointState {
  const priorActor = args.state.actors[args.actor] ?? { actorId: args.actorId, domains: {} };
  const nextDomains: Record<string, BattlePointValue> = { ...priorActor.domains };
  for (const domain of args.domains) {
    const prior = priorActor.domains[domain.id] ?? { kind: 'absent' as const, eligible: false };
    if (!eligible(domain, args.actorId, args.traits)) {
      nextDomains[domain.id] = { kind: 'absent', eligible: false };
      continue;
    }
    const modifiers = prior.kind === 'present' ? prior.capacityModifiers : [];
    const capacity = effectiveCapacity(domain, args.traits, modifiers);
    const seed = args.initialPoints?.[domain.id] ?? 0;
    if (prior.kind === 'absent' && seed === -1) {
      nextDomains[domain.id] = { kind: 'absent', eligible: true };
      continue;
    }
    const point = prior.kind === 'present' ? prior.point : seed;
    nextDomains[domain.id] = {
      kind: 'present',
      point: capacity === null ? Math.max(0, point) : Math.min(capacity, Math.max(0, point)),
      capacity,
      capacityModifiers: modifiers,
    };
  }
  return {
    ...args.state,
    actors: { ...args.state.actors, [args.actor]: { actorId: args.actorId, domains: nextDomains } },
  };
}

export function applyBattlePointOperation(args: {
  state: BattlePointState;
  domains: readonly BattlePointDomain[];
  operation:
    | Extract<EffectExecutionOperation, { kind: 'resourceMutation' }>
    | Extract<EffectExecutionOperation, { kind: 'battlePointCapacityModifier' }>;
  source: SourceEffect;
  valueSetIndex: number;
  identity: string;
}):
  | { status: 'applied'; state: BattlePointState }
  | { status: 'unsupported' | 'invalid'; state: BattlePointState } {
  const recipient = resolveResourceTargetPolicy(args.source.origin, args.operation.recipient);
  const actor =
    recipient === 'attacker'
      ? 'attacker'
      : recipient === 'target'
        ? 'target'
        : ['sourceSelf', 'sourceActor'].includes(args.operation.recipient) &&
            ['support', 'mysticCode'].includes(args.source.origin)
          ? args.source.sourceInstanceId
          : recipient;
  if (!actor || actor === 'unresolved') return { status: 'unsupported', state: args.state };
  const actorState = args.state.actors[actor];
  if (args.operation.subjectId === null) return { status: 'invalid', state: args.state };
  const domain = definition(args.domains, args.operation.subjectId);
  if (!actorState || !domain) return { status: 'unsupported', state: args.state };
  const before = actorState.domains[domain.id] ?? { kind: 'absent' as const, eligible: false };
  if (before.kind === 'absent' && !before.eligible) return { status: 'applied', state: args.state };
  if (before.kind === 'absent' && args.operation.kind === 'battlePointCapacityModifier')
    return { status: 'applied', state: args.state };
  const values =
    args.operation.kind === 'battlePointCapacityModifier'
      ? args.operation.values
      : args.source.limitBreak
        ? args.operation.amount.kind === 'fixed'
          ? (args.operation.amount.limitBreakValues ?? args.operation.amount.values)
          : undefined
        : args.operation.amount.kind === 'fixed'
          ? args.operation.amount.values
          : undefined;
  const amount = values?.[args.valueSetIndex]?.[args.source.valueIndex];
  if (!Number.isSafeInteger(amount)) return { status: 'invalid', state: args.state };
  const presentBefore: Extract<BattlePointValue, { kind: 'present' }> =
    before.kind === 'present'
      ? before
      : {
          kind: 'present',
          point: 0,
          capacity: domain.capacity.default,
          capacityModifiers: [],
        };
  let after: BattlePointValue;
  if (args.operation.kind === 'battlePointCapacityModifier') {
    const modifiers = [
      ...presentBefore.capacityModifiers,
      {
        identity: args.identity,
        amount: amount!,
        lifetime: args.operation.lifetime,
        traits: args.operation.traits,
      },
    ];
    const capacity =
      presentBefore.capacity === null
        ? null
        : domain.capacity.maximum === null
          ? Math.max(0, presentBefore.capacity + amount!)
          : Math.min(domain.capacity.maximum, Math.max(0, presentBefore.capacity + amount!));
    after = {
      ...presentBefore,
      capacity,
      point: capacity === null ? presentBefore.point : Math.min(presentBefore.point, capacity),
      capacityModifiers: modifiers,
    };
  } else {
    const point =
      args.operation.direction === 'gain'
        ? presentBefore.point + amount!
        : presentBefore.point - amount!;
    after = {
      ...presentBefore,
      point:
        presentBefore.capacity === null
          ? Math.max(0, point)
          : Math.min(presentBefore.capacity, Math.max(0, point)),
    };
  }
  return {
    status: 'applied',
    state: {
      actors: {
        ...args.state.actors,
        [actor]: { ...actorState, domains: { ...actorState.domains, [domain.id]: after } },
      },
      receipts: [
        ...args.state.receipts,
        { identity: args.identity, actor, domainId: domain.id, before, after },
      ],
      executedEffects: args.state.executedEffects,
    },
  };
}

export function readBattlePoint(
  state: BattlePointState | undefined,
  actor: string,
  domainId: string,
) {
  return state?.actors[actor]?.domains[domainId];
}

export function reconcilePreparationBattlePoints(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  context: PreparationExecutionContext,
): PreNoblePhantasmState {
  const domains = context.battlePointDomains ?? [];
  if (!domains.length) return state;
  const sources = [...(context.initialSources ?? []), ...(context.terminalSources ?? [])];
  const actors = [
    {
      key: 'attacker',
      actorId: servant.id,
      traits: [
        ...(findActorForm(servant, state.currentFormId)?.traits ?? []),
        ...state.stateTraits.attackerState,
      ],
    },
    ...sources.map((source) => ({
      key: source.sourceInstanceId,
      actorId: source.sourceId,
      traits: source.sourceTraits,
    })),
  ];
  let battlePoints = state.battlePoints;
  for (const actor of actors) {
    const traits = new Set(actor.traits);
    for (const [trait, count] of Object.entries(markerTraitCounts(state.buffInstances, actor.key)))
      if (count > 0) traits.add(trait);
    battlePoints = reconcileBattlePointActor({
      state: battlePoints,
      actor: actor.key,
      actorId: actor.actorId,
      traits,
      domains,
      ...(actor.key === 'attacker' && context.initialBattlePointPoints
        ? { initialPoints: context.initialBattlePointPoints }
        : {}),
    });
  }
  return battlePoints === state.battlePoints ? state : { ...state, battlePoints };
}
