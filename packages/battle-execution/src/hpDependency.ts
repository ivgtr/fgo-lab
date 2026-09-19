import type { MasterEffect, NoblePhantasmVariant } from '@fgo-lab/master-data';
import { canonicalRequirementLeaves } from '@fgo-lab/master-data';
import { npProgramEffects } from './npProgramScope';
import { isHpOperation } from './preparationHp';
import {
  ATTACKER_RESOURCE_ACTOR,
  conditionQuantityReads,
  expressionQuantityReads,
  resourceActorsMayIntersect,
  resourceRecipientActor,
  type QuantityRead,
  type ResourceActor,
} from './resourceQueries';

function hpActors(reads: readonly QuantityRead[]): ResourceActor[] {
  return reads.flatMap((read): ResourceActor[] =>
    read.kind === 'resource' && read.query.resource === 'hp'
      ? [read.query.actor]
      : read.kind === 'unresolved' && read.resources.includes('hp')
        ? [{ kind: 'unresolved' }]
        : [],
  );
}
const source = { origin: 'attacker', sourceInstanceId: 'hp-dependency' } as const;
const effectReadCache = new WeakMap<MasterEffect, readonly ResourceActor[]>();
function effectReads(effect: MasterEffect): readonly ResourceActor[] {
  const cached = effectReadCache.get(effect);
  if (cached) return cached;
  const context = {
    actor: resourceRecipientActor(source, effect.requirement.recipient),
    sourceActor: ATTACKER_RESOURCE_ACTOR,
    inputDefinitions: effect.inputDefinitions,
  };
  const reads = [
    ...canonicalRequirementLeaves(effect.requirement.expression).flatMap((leaf) =>
      leaf.kind === 'quantity' || leaf.kind === 'inputQuantity'
        ? hpActors(conditionQuantityReads(leaf, context))
        : [],
    ),
    ...effect.execution.flatMap((operation) => {
      const expressions =
        operation.kind === 'damageModifier' || operation.kind === 'modifierRateChange'
          ? operation.valueExpressions.flat()
          : operation.kind === 'grantOcApplicationRate'
            ? [...operation.cells, ...(operation.limitBreakCells ?? [])]
                .flat()
                .map((cell) => cell.amount)
            : [];
      return expressions.flatMap((expression) =>
        expression ? hpActors(expressionQuantityReads(expression, context)) : [],
      );
    }),
  ];
  effectReadCache.set(effect, reads);
  return reads;
}
function damageReads(effects: readonly MasterEffect[]): ResourceActor[] {
  return npProgramEffects(effects).flatMap((effect) =>
    effect.execution.some((operation) =>
      ['damageModifier', 'modifierRateChange', 'ignoreDefense', 'ignoreDamageCut'].includes(
        operation.kind,
      ),
    )
      ? effectReads(effect)
      : [],
  );
}
const terminalReads = new WeakMap<NoblePhantasmVariant, readonly ResourceActor[]>();
export function terminalHpReaders(variant: NoblePhantasmVariant): readonly ResourceActor[] {
  const cached = terminalReads.get(variant);
  if (cached) return cached;
  const reads = [
    ...(variant.kind === 'attack' && variant.damage.some((damage) => damage.kind === 'hpRatioLow')
      ? [ATTACKER_RESOURCE_ACTOR]
      : []),
    ...(variant.effects.some(
      (effect) =>
        effect.timing === 'beforeDamage' &&
        effect.execution.some(
          (operation) =>
            operation.kind === 'resourceMutation' &&
            operation.resource === 'hp' &&
            operation.direction === 'loss' &&
            operation.lossFloor === 'zero',
        ),
    )
      ? [ATTACKER_RESOURCE_ACTOR]
      : []),
    ...damageReads(variant.effects.filter((effect) => effect.timing === 'beforeDamage')),
    ...npProgramEffects(
      variant.effects.filter((effect) => effect.timing === 'beforeDamage'),
    ).flatMap(effectReads),
  ];
  terminalReads.set(variant, reads);
  return reads;
}

/** HP can contribute to damage even when an accompanying NP gain is capped. Track the physical
 * recipients and ordered readers independently of NP/OC, then let common execution prove the world.
 */
export function hpRelevantSourceIndexes(
  sources: readonly { effects: readonly MasterEffect[] }[],
  terminalReaders: readonly ResourceActor[],
  automaticEffects: readonly MasterEffect[] = [],
): ReadonlySet<number> {
  const relevant = new Set<number>();
  const readers: ResourceActor[] = [
    ...terminalReaders,
    ...damageReads(automaticEffects),
    ...sources.flatMap(({ effects }) => damageReads(effects)),
  ];
  // A normal loss can make the terminal life guard observable; earlier healing/max changes must
  // remain available even for an NP without a ratio coefficient. Safe loss alone cannot do this.
  if (
    sources.some(({ effects }) =>
      npProgramEffects(effects).some((effect) =>
        effect.execution.some(
          (operation) =>
            operation.kind === 'resourceMutation' &&
            operation.resource === 'hp' &&
            operation.direction === 'loss' &&
            operation.lossFloor === 'zero',
        ),
      ),
    )
  )
    readers.push(ATTACKER_RESOURCE_ACTOR);
  for (let index = sources.length - 1; index >= 0; index--) {
    if (damageReads(sources[index]!.effects).length) relevant.add(index);
    for (const effect of [...npProgramEffects(sources[index]!.effects)].reverse()) {
      for (const operation of [...effect.execution].reverse()) {
        if (isHpOperation(operation)) {
          const recipient =
            operation.kind === 'resourceMutation' ? operation.recipient : operation.route.target;
          const actor: ResourceActor =
            operation.selection === 'selectedAlly'
              ? ATTACKER_RESOURCE_ACTOR
              : operation.selection === 'lowestHpRatio'
                ? { kind: 'allies', excluded: null }
                : recipient === 'sourceActor'
                  ? ATTACKER_RESOURCE_ACTOR
                  : resourceRecipientActor(source, recipient);
          if (readers.some((reader) => resourceActorsMayIntersect(actor, reader))) {
            relevant.add(index);
            readers.push(actor);
            if (operation.kind === 'resourceMutation' && operation.amount.kind === 'hpTransfer')
              readers.push({ kind: 'target' });
          }
        }
        if (operation.kind === 'contextMutation' && readers.length) relevant.add(index);
      }
      readers.push(...effectReads(effect));
    }
  }
  return relevant;
}
