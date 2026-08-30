import {
  findNoblePhantasmVariant,
  noblePhantasmVariantKey,
  type ActorFormId,
  type MasterEffect,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { ActivationFact, ActivationSourceRef } from '@fgo-lab/schema';

function preparationActivationSource(
  servant: ServantMaster,
  sourceKind: 'skill' | 'noblePhantasm',
  sourceId: string,
  actorFormId: ActorFormId,
): ActivationSourceRef {
  if (sourceKind === 'skill')
    return {
      origin: 'attacker',
      sourceInstanceId: `attacker:${servant.id}`,
      skillId: sourceId,
    };
  const variant = findNoblePhantasmVariant(servant, {
    actorFormId,
    noblePhantasmId: sourceId,
  });
  if (!variant) throw new TypeError(`preparation_np_variant_missing:${sourceId}`);
  const key = noblePhantasmVariantKey(variant.ref);
  return { origin: 'np', sourceInstanceId: `np:${key}`, skillId: `np:${key}` };
}

export function assemblePreparationActivationFacts(
  servant: ServantMaster,
  sourceKind: 'skill' | 'noblePhantasm',
  sourceId: string,
  actorFormId: ActorFormId,
  effects: readonly MasterEffect[],
): readonly ActivationFact[] {
  const source = preparationActivationSource(servant, sourceKind, sourceId, actorFormId);
  const facts = effects.flatMap<ActivationFact>((effect) => [
    ...(effect.selection?.kind === 'playerChoice'
      ? [
          {
            kind: 'choice' as const,
            source,
            family: effect.selection.group.key,
            candidate: effect.selection.group.candidate,
          },
        ]
      : []),
    ...effect.sourceQuantityConditions.map((condition) => ({
      kind: 'sourceQuantity' as const,
      source,
      ...condition,
    })),
    ...(effect.operationTrigger
      ? [
          {
            kind: 'operationTrigger' as const,
            source,
            position: effect.operationTrigger.position,
          },
        ]
      : []),
  ]);
  return [...new Map(facts.map((fact) => [JSON.stringify(fact), fact])).values()];
}
