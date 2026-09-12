import type {
  CanonicalInputDefinition,
  PopulationCountSelector,
  ModifierValueExpression,
  CanonicalTargetPolicy,
  EffectExecutionOperation,
} from '@fgo-lab/master-data';
import type { ActivationSourceRef } from '@fgo-lab/schema';
import type { ConditionExpression, OperationModifierValueExpression } from './contracts';

/** Physical actor identity is independent of a BP domain or a source's skill identity. */
type ResourceSingleActor =
  | { kind: 'attacker' }
  | { kind: 'target' }
  | { kind: 'source'; origin: ActivationSourceRef['origin']; sourceInstanceId: string }
  | { kind: 'unresolved' };
export type ResourceActor =
  ResourceSingleActor | { kind: 'allies'; excluded: ResourceSingleActor | null };
export type ResourceKind = 'hp' | 'npGauge' | 'battlePoint' | 'criticalStars';
export type ResourceQuery =
  | { resource: 'hp'; measure: 'ratio' | 'alive' | 'maximum' | 'current'; actor: ResourceActor }
  | { resource: 'npGauge'; measure: 'current' | 'capacity'; actor: ResourceActor }
  | {
      resource: 'battlePoint';
      measure: 'phase' | 'rate' | 'current' | 'capacity';
      actor: ResourceActor;
      domain: string | null;
    }
  | { resource: 'criticalStars'; measure: 'current'; actor: { kind: 'party' } };
export type QuantityRead =
  | { kind: 'resource'; query: ResourceQuery }
  | { kind: 'population'; selector: PopulationCountSelector; recipient: ResourceActor }
  | { kind: 'buffInstances'; actor: ResourceActor; trait: string; lifetime: 'active' | 'all' }
  | { kind: 'input'; inputKey: string }
  | { kind: 'unresolved'; reason: string; resources: readonly ResourceKind[] };
export interface ResourceReadContext {
  /** Actor against which the condition facts or value expression are evaluated. */
  actor: ResourceActor;
  /** Physical owner of source-bound inputs; independent of the condition facts actor. */
  sourceActor: ResourceActor;
  inputDefinitions?: readonly CanonicalInputDefinition[];
}
export const ATTACKER_RESOURCE_ACTOR: ResourceSingleActor = { kind: 'attacker' };

export function resourceSourceActor(
  source: Pick<ActivationSourceRef, 'origin' | 'sourceInstanceId'>,
): ResourceSingleActor {
  switch (source.origin) {
    case 'attacker':
    case 'passive':
    case 'np':
    case 'craftEssence':
      return ATTACKER_RESOURCE_ACTOR;
    case 'support':
    case 'mysticCode':
      return { kind: 'source', origin: source.origin, sourceInstanceId: source.sourceInstanceId };
  }
}

/** A source-local read must not be discarded merely because its writer misses the attacker. */
export function resourceRecipientActor(
  source: Pick<ActivationSourceRef, 'origin' | 'sourceInstanceId'>,
  recipient: CanonicalTargetPolicy,
): ResourceActor {
  switch (recipient) {
    case 'sourceSelf':
      return resourceSourceActor(source);
    case 'enemy':
      return { kind: 'target' };
    case 'partyMember':
      return { kind: 'allies', excluded: null };
    case 'partyOther':
      return { kind: 'allies', excluded: resourceSourceActor(source) };
    case 'attackerNpCard':
      return resourceSourceActor(source);
    case 'unresolved':
      return { kind: 'unresolved' };
  }
}

export function currentResourceQuery(
  resource: ResourceKind,
  actor: ResourceActor,
  domain: string | null,
): ResourceQuery {
  if (resource === 'criticalStars')
    return { resource, measure: 'current', actor: { kind: 'party' } };
  if (resource === 'battlePoint') return { resource, measure: 'current', actor, domain };
  return { resource, measure: 'current', actor };
}

/** Canonical amount dependencies are distinct from the mutation's recipient write. */
export function mutationResourceAccess(
  operation: Extract<EffectExecutionOperation, { kind: 'resourceMutation' }>,
  source: Pick<ActivationSourceRef, 'origin' | 'sourceInstanceId'>,
): { write: ResourceQuery; amountReads: readonly QuantityRead[] } {
  const actor = resourceRecipientActor(source, operation.recipient);
  const write = currentResourceQuery(operation.resource, actor, operation.subjectId);
  if (operation.amount.kind === 'populationCount')
    return {
      write,
      amountReads: [
        { kind: 'input', inputKey: operation.amount.inputKey },
        { kind: 'population', selector: operation.amount.selector, recipient: actor },
      ],
    };
  if (operation.amount.kind === 'buffCount')
    return {
      write,
      amountReads: [
        { kind: 'buffInstances', actor, trait: operation.amount.trait, lifetime: 'active' },
      ],
    };
  if (operation.amount.kind === 'dependent')
    return {
      write,
      amountReads: [
        {
          kind: 'unresolved',
          reason: operation.amount.reason,
          resources: ['hp', 'npGauge', 'battlePoint', 'criticalStars'],
        },
      ],
    };
  if (operation.amount.kind === 'currentGaugeRatio')
    return {
      write,
      amountReads: [{ kind: 'resource', query: currentResourceQuery('npGauge', actor, null) }],
    };
  if (operation.resource === 'hp' && operation.unit === 'percent')
    return {
      write,
      amountReads: [{ kind: 'resource', query: { resource: 'hp', measure: 'maximum', actor } }],
    };
  return { write, amountReads: [] };
}

function inputRead(inputKey: string, context: ResourceReadContext): QuantityRead {
  if (inputKey === 'battle:criticalStars')
    return {
      kind: 'resource',
      query: { resource: 'criticalStars', measure: 'current', actor: { kind: 'party' } },
    };
  const definition = context.inputDefinitions?.find((input) => input.key === inputKey);
  if (definition?.kind === 'effectStackCount' && definition.instanceTraits)
    return {
      kind: 'buffInstances',
      actor:
        definition.quantitySource.scope === 'attackerState'
          ? { kind: 'attacker' }
          : definition.quantitySource.scope === 'targetState'
            ? { kind: 'target' }
            : { kind: 'unresolved' },
      trait: definition.quantitySource.trait,
      lifetime: 'all',
    };
  if (definition?.kind === 'sourceHpPermille')
    return {
      kind: 'resource',
      query: { resource: 'hp', measure: 'ratio', actor: context.sourceActor },
    };
  // An arbitrary canonical input is not a proof of a physical resource. Keep its identity.
  return { kind: 'input', inputKey };
}

/** Potential reads, not condition truth. In particular any(true, unknown) retains both accesses. */
export function conditionQuantityReads(
  condition: ConditionExpression,
  context: ResourceReadContext = {
    actor: ATTACKER_RESOURCE_ACTOR,
    sourceActor: { kind: 'unresolved' },
  },
): readonly QuantityRead[] {
  switch (condition.kind) {
    case 'all':
    case 'any':
      return condition.expressions.flatMap((child) => conditionQuantityReads(child, context));
    case 'not':
      return conditionQuantityReads(condition.expression, context);
    case 'unsupported':
      // A failed trait/predicate recipient is opaque but cannot read an HP/NP/BP/star amount.
      if (condition.reason === 'unresolvedRecipient')
        return [{ kind: 'unresolved', reason: condition.reason, resources: [] }];
      if (condition.readDependency)
        return [
          { kind: 'unresolved', reason: condition.reason, resources: [] },
          ...conditionQuantityReads(condition.readDependency, context),
        ];
      return [
        {
          kind: 'unresolved',
          reason: condition.reason,
          resources: ['hp', 'npGauge', 'battlePoint', 'criticalStars'],
        },
      ];
    case 'sourceQuantity':
      return [
        {
          kind: 'resource',
          query: {
            resource: 'battlePoint',
            measure: 'rate',
            domain: condition.subjectId,
            actor: resourceSourceActor(condition.source),
          },
        },
      ];
    case 'quantity':
      switch (condition.quantity) {
        case 'attackerHpPermille':
          return [
            { kind: 'resource', query: { resource: 'hp', measure: 'ratio', actor: context.actor } },
            ...(condition.subjectId === undefined
              ? []
              : [
                  {
                    kind: 'unresolved' as const,
                    reason: 'unexpectedHpSubject',
                    resources: ['hp'] as const,
                  },
                ]),
          ];
        case 'battlePointPhase':
          return [
            {
              kind: 'resource',
              query: {
                resource: 'battlePoint',
                measure: 'phase',
                actor: context.actor,
                domain: condition.subjectId ?? null,
              },
            },
          ];
        case 'targetRarity':
          return [];
      }
      break;
    case 'inputQuantity':
      return [inputRead(condition.inputKey, context)];
    case 'always':
    case 'trait':
    case 'targetPredicate':
    case 'traitCount':
    case 'card':
    case 'noblePhantasmVariant':
    case 'choice':
    case 'operationTrigger':
      return [];
    default: {
      const unclassified: never = condition;
      throw new TypeError(`unclassified_quantity_condition:${String(unclassified)}`);
    }
  }
}

/** The context is the value owner, which can differ from the recipient and condition actor. */
export function expressionQuantityReads(
  expression:
    | ModifierValueExpression
    | OperationModifierValueExpression
    | { kind: 'fixed'; value: number }
    | null,
  context: ResourceReadContext = {
    actor: ATTACKER_RESOURCE_ACTOR,
    sourceActor: { kind: 'unresolved' },
  },
): readonly QuantityRead[] {
  if (expression === null) return [];
  switch (expression.kind) {
    case 'fixed':
      return [];
    case 'stackLinear':
      return expression.sources
        .filter((source) => source.instanceTraits !== undefined)
        .map((source) =>
          inputRead(source.key, { ...context, inputDefinitions: expression.sources }),
        );
    case 'inputLinear':
      return [inputRead(expression.inputKey, context)];
    case 'inverseHpLinear':
    case 'hpRangeLinear': {
      // Compiled source HP inputs identify an external owner; absent binding cannot mean attacker.
      const actor =
        'quantitySource' in expression
          ? expression.quantitySource.kind === 'attackerHpPermille'
            ? ATTACKER_RESOURCE_ACTOR
            : context.sourceActor
          : context.actor;
      return [{ kind: 'resource', query: { resource: 'hp', measure: 'ratio', actor } }];
    }
    default: {
      const unclassified: never = expression;
      throw new TypeError(`unclassified_quantity_expression:${String(unclassified)}`);
    }
  }
}

/** Unknown semantics may intersect every resource; they never prove a no-reader suffix. */
export function readsResource(reads: readonly QuantityRead[], resource: ResourceKind): boolean {
  return reads.some(
    (read) =>
      (read.kind === 'unresolved' && read.resources.includes(resource)) ||
      (read.kind === 'resource' && read.query.resource === resource),
  );
}

export function resourceActorsMayIntersect(
  left: ResourceQuery['actor'],
  right: ResourceQuery['actor'],
): boolean {
  if (left.kind === 'unresolved' || right.kind === 'unresolved') return true;
  if (right.kind === 'allies' && left.kind !== 'allies')
    return resourceActorsMayIntersect(right, left);
  if (left.kind === 'allies') {
    if (right.kind === 'allies') return true;
    if (right.kind === 'target' || right.kind === 'party') return false;
    return left.excluded === null || !resourceActorsDefinitelyEqual(left.excluded, right);
  }
  return resourceActorsDefinitelyEqual(left, right);
}

function resourceActorsDefinitelyEqual(
  left: ResourceQuery['actor'],
  right: ResourceQuery['actor'],
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind !== 'source' || right.kind !== 'source') return true;
  return left.origin === right.origin && left.sourceInstanceId === right.sourceInstanceId;
}

export function resourceQueriesMayIntersect(left: ResourceQuery, right: ResourceQuery): boolean {
  if (left.resource !== right.resource || !resourceActorsMayIntersect(left.actor, right.actor))
    return false;
  if (left.resource !== 'battlePoint' || right.resource !== 'battlePoint') return true;
  return left.domain === null || right.domain === null || left.domain === right.domain;
}
