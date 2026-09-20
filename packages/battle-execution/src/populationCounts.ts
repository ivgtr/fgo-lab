import type { PopulationTargetState } from './populationFunctions';
import type {
  CanonicalInputDefinition,
  EffectExecutionOperation,
  PopulationCountSelector,
} from '@fgo-lab/master-data';
import type { ConditionEvaluationState } from './condition';
import type { SourceEffect } from './sourceCollection';
import { resourceSourceActor } from './resourceQueries';
import { canonicalRequirementLeaves } from '@fgo-lab/master-data';

/** Above this count, every selected positive NP reader saturates even from an empty gauge. */
export function populationCountSaturation(
  sources: readonly SourceEffect[],
  capacity: number,
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  for (const source of sources)
    for (const operation of source.effect.execution) {
      if (
        operation.kind !== 'resourceMutation' ||
        operation.amount.kind !== 'populationCount' ||
        operation.amount.selector.basis !== 'actorTraits'
      )
        continue;
      const amount = operation.amount;
      const opaque = sources.some(
        (other) =>
          canonicalRequirementLeaves(other.effect.requirement.expression).some(
            (leaf) => leaf.kind === 'inputQuantity' && leaf.inputKey === amount.inputKey,
          ) ||
          other.effect.execution.some(
            (writer) =>
              (writer.kind === 'populationMutation' &&
                writer.mutation !== 'grant' &&
                writer.traits.some((trait) => amount.selector.traits.includes(trait))) ||
              ((writer.kind === 'damageModifier' || writer.kind === 'modifierRateChange') &&
                [
                  ...writer.valueExpressions.flat(),
                  ...(writer.limitBreakValueExpressions?.flat() ?? []),
                ].some(
                  (expression) =>
                    expression?.kind === 'inputLinear' && expression.inputKey === amount.inputKey,
                )),
          ),
      );
      const coefficients =
        (source.limitBreak ? amount.limitBreakValues : amount.values)?.flatMap(
          (row) => row[source.valueIndex] ?? [],
        ) ?? [];
      if (opaque || !coefficients.length || coefficients.some((value) => value <= 0)) {
        result.set(amount.inputKey, Number.POSITIVE_INFINITY);
        continue;
      }
      result.set(
        amount.inputKey,
        Math.max(result.get(amount.inputKey) ?? 0, Math.ceil(capacity / Math.min(...coefficients))),
      );
    }
  return result;
}

export type PopulationMutation = Extract<EffectExecutionOperation, { kind: 'populationMutation' }>;
export interface PopulationEvent {
  operation: PopulationMutation;
  affectedCount?: number;
  targetState?: PopulationTargetState;
  source: Pick<SourceEffect, 'origin' | 'sourceInstanceId'>;
}

type PopulationSide = 'allies' | 'enemies';
type PopulationScope = PopulationCountSelector['scope'] | 'target';

function populationScopeSides(scope: PopulationScope): readonly PopulationSide[] {
  switch (scope) {
    case 'recipient':
    case 'target':
      return [];
    case 'allies':
      return ['allies'];
    case 'enemies':
      return ['enemies'];
    case 'allActors':
    case 'otherActors':
      return ['allies', 'enemies'];
  }
}

function populationSideSize(
  side: PopulationSide,
  values: Readonly<Record<string, number>>,
): number {
  return values[`population:${side}:additional`] ?? 0;
}

function populationScopeCapacity(
  scope: PopulationScope,
  values: Readonly<Record<string, number>>,
): number {
  return populationScopeSides(scope).reduce(
    (sum, side) => sum + populationSideSize(side, values),
    0,
  );
}

/** Equal keys preserve every population read, including any subset/order of cohort writes.
 * Legality is checked first; a representative retains its actual initial input, never a sum
 * masquerading as a per-side population. Unknown writers retain the entire tuple.
 */
export function populationInputEquivalenceKey(
  sources: readonly SourceEffect[],
  values: Readonly<Record<string, number>>,
): string {
  if (
    sources.some((source) => source.effect.execution.some((op) => op.kind === 'populationFunction'))
  )
    return JSON.stringify(values);
  const observed: unknown[] = [];
  const operations = sources.flatMap((source) => source.effect.execution);
  for (const source of sources) {
    for (const leaf of canonicalRequirementLeaves(source.effect.requirement.expression))
      if (leaf.kind === 'inputQuantity' && leaf.inputKey in values)
        observed.push([leaf.inputKey, values[leaf.inputKey]]);
    for (const operation of source.effect.execution) {
      if (operation.kind === 'damageModifier' || operation.kind === 'modifierRateChange')
        for (const expression of [
          ...operation.valueExpressions.flat(),
          ...(operation.limitBreakValueExpressions?.flat() ?? []),
        ])
          if (expression?.kind === 'inputLinear' && expression.inputKey in values)
            observed.push([expression.inputKey, values[expression.inputKey]]);
      if (operation.kind !== 'resourceMutation' || operation.amount.kind !== 'populationCount')
        continue;
      const { selector, inputKey } = operation.amount;
      const querySides = populationScopeSides(selector.scope);
      const total = querySides.reduce((sum, side) => sum + populationSideSize(side, values), 0);
      observed.push(selector.basis === 'inBattle' ? total : (values[inputKey] ?? 0));
      for (const writer of operations) {
        if (
          writer.kind !== 'populationMutation' ||
          !writer.traits.some((trait) => selector.traits.includes(trait))
        )
          continue;
        if (writer.mutation === 'unsupported') return JSON.stringify(values);
        if (writer.basis !== selector.basis) continue;
        const overlap = querySides.filter((side) =>
          populationScopeSides(writer.scope).includes(side),
        );
        observed.push(overlap.reduce((sum, side) => sum + populationSideSize(side, values), 0));
        // Actor union and buff full-scope removal also observe the query cohort size.
        if (selector.counting === 'actors' || writer.mutation === 'remove') observed.push(total);
      }
    }
  }
  return JSON.stringify(observed);
}

/** Shared legality check for initial count intents, before policy candidates or execution. */
type PopulationInputDefinition = Extract<
  CanonicalInputDefinition,
  { kind: 'populationSize' | 'populationCount' | 'populationActorValue' }
>;

function isPopulationInputDefinition(
  definition: CanonicalInputDefinition,
): definition is PopulationInputDefinition {
  switch (definition.kind) {
    case 'populationSize':
    case 'populationCount':
    case 'populationActorValue':
      return true;
    default:
      return false;
  }
}

function populationCountInputExceedsCohort(
  definition: Extract<PopulationInputDefinition, { kind: 'populationCount' }>,
  value: number,
  values: Readonly<Record<string, number>>,
): boolean {
  if (definition.selector.basis === 'buffInstances') return false;
  const capacity = populationScopeCapacity(definition.selector.scope, values);
  return capacity === 0 && value > 0
    ? true
    : definition.selector.counting === 'actors' && value > capacity;
}

export function populationInputIssue(
  definitions: readonly CanonicalInputDefinition[],
  values: Readonly<Record<string, number>>,
): CanonicalInputDefinition | null {
  for (const definition of definitions) {
    if (!isPopulationInputDefinition(definition)) continue;
    const value = values[definition.key] ?? definition.defaultValue;
    if (
      value === null ||
      !Number.isSafeInteger(value) ||
      value < definition.minimum ||
      value > definition.maximum
    )
      return definition;
    switch (definition.kind) {
      case 'populationSize':
        break;
      case 'populationActorValue':
        if (definition.actorIndex > populationSideSize('enemies', values) && value > 0)
          return definition;
        break;
      case 'populationCount':
        if (populationCountInputExceedsCohort(definition, value, values)) return definition;
        break;
    }
  }
  return null;
}

function localTraitCount(
  selector: PopulationCountSelector,
  facts: ConditionEvaluationState,
  actor: 'attacker' | 'target',
): number {
  if (selector.basis === 'inBattle') return 1;
  const stateScope = actor === 'attacker' ? 'attackerState' : 'targetState';
  const count = selector.traits.reduce((sum, trait) => {
    const intrinsic = facts.initialTraitSuppressions[actor].has(trait)
      ? 0
      : (facts.traitCounts[actor][trait] ?? Number(facts.traits[actor].get(trait) === true));
    const applied =
      facts.traitCounts[stateScope][trait] ?? Number(facts.traits[stateScope].get(trait) === true);
    return sum + intrinsic + applied;
  }, 0);
  return selector.counting === 'actors' ? Number(count > 0) : count;
}

type PopulationEventObservation =
  | { kind: 'ignored' }
  | { kind: 'unknown' }
  | {
      kind: 'affected';
      count: number;
      affected: number;
      coversQuery: boolean;
    };

function observePopulationEvent(
  selector: PopulationCountSelector,
  event: PopulationEvent,
  values: Readonly<Record<string, number>>,
  querySides: readonly PopulationSide[],
): PopulationEventObservation {
  const operation = event.operation;
  if (
    operation.basis !== selector.basis ||
    !operation.traits.some((trait) => selector.traits.includes(trait)) ||
    (!selector.includePassive && operation.includePassive && selector.basis === 'buffInstances')
  )
    return { kind: 'ignored' };
  if (resourceSourceActor(event.source).kind !== 'attacker' && !event.targetState)
    return { kind: 'unknown' };
  const overlap = querySides.filter((side) => populationScopeSides(operation.scope).includes(side));
  const count = overlap.reduce((sum, side) => sum + populationSideSize(side, values), 0);
  const localAttacker =
    !['enemies', 'otherActors'].includes(selector.scope) &&
    !['enemies', 'otherActors', 'target'].includes(operation.scope);
  const localTarget =
    !['allies', 'recipient'].includes(selector.scope) &&
    !['allies', 'recipient'].includes(operation.scope);
  const affected =
    (event.affectedCount === undefined ? undefined : localTarget ? event.affectedCount : 0) ??
    (selector.basis === 'buffInstances'
      ? count + Number(localAttacker) + Number(localTarget)
      : count);
  if (
    operation.mutation === 'unsupported' &&
    count + Number(localAttacker) + Number(localTarget) > 0
  )
    return { kind: 'unknown' };
  if (!affected) return { kind: 'ignored' };
  return { kind: 'affected', count, affected, coversQuery: overlap.length === querySides.length };
}

/** Cohort-wide writes are exact on aggregate counts; partial, opaque overlap is refused. */
export function readPopulationCount(args: {
  selector: PopulationCountSelector;
  inputKey: string;
  values: Readonly<Record<string, number>>;
  facts: ConditionEvaluationState;
  events: readonly PopulationEvent[];
}): number | null {
  const { selector, values, facts } = args;
  if (
    (facts.buffInstances ?? []).some(
      (instance) =>
        instance.uncertain &&
        selector.traits.some(
          (trait) => instance.traits.includes(trait) || instance.marker?.actorTrait === trait,
        ),
    )
  )
    return null;
  const querySides = populationScopeSides(selector.scope);
  const externalSize = querySides.reduce((sum, side) => sum + populationSideSize(side, values), 0);
  let external = selector.basis === 'inBattle' ? externalSize : (values[args.inputKey] ?? 0);
  let buffCount = selector.basis === 'buffInstances' ? external : 0;
  for (const event of args.events) {
    const operation = event.operation;
    if (
      selector.basis === 'inBattle' &&
      operation.traits.some((trait) => selector.traits.includes(trait))
    )
      return null;
    const observation = observePopulationEvent(selector, event, values, querySides);
    if (observation.kind === 'unknown') return null;
    if (observation.kind === 'ignored') continue;
    const { count, affected, coversQuery } = observation;
    if (selector.basis === 'buffInstances') {
      const full =
        affected ===
        externalSize +
          Number(!['enemies', 'otherActors'].includes(selector.scope)) +
          Number(!['allies', 'recipient'].includes(selector.scope));
      if (operation.mutation === 'remove') {
        if (!full) return null;
        buffCount = 0;
      } else buffCount += affected;
    } else if (selector.counting === 'individualities' && operation.mutation === 'grant') {
      external +=
        count * operation.traits.filter((trait) => selector.traits.includes(trait)).length;
    } else if (selector.counting === 'actors' && operation.mutation === 'grant' && coversQuery) {
      external = externalSize;
    } else return null;
  }
  if (selector.basis === 'buffInstances') return buffCount;
  return (
    external +
    (['enemies', 'otherActors'].includes(selector.scope)
      ? 0
      : localTraitCount(selector, facts, 'attacker')) +
    (['allies', 'recipient'].includes(selector.scope)
      ? 0
      : localTraitCount(selector, facts, 'target'))
  );
}
