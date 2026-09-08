import { npProgramEffects } from './npProgramScope';
import {
  findNoblePhantasmVariant,
  noblePhantasmVariantKey,
  type ActorFormId,
  type CanonicalEffectRequirement,
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

function sourceQuantityRequirements(
  requirement: CanonicalEffectRequirement,
): Extract<CanonicalEffectRequirement, { kind: 'sourceQuantity' }>[] {
  if (requirement.kind === 'sourceQuantity') return [requirement];
  if (requirement.kind === 'all' || requirement.kind === 'any')
    return requirement.requirements.flatMap(sourceQuantityRequirements);
  return requirement.kind === 'not' ? sourceQuantityRequirements(requirement.requirement) : [];
}

export function assemblePreparationActivationFacts(
  servant: ServantMaster,
  sourceKind: 'skill' | 'noblePhantasm',
  sourceId: string,
  actorFormId: ActorFormId,
  effects: readonly MasterEffect[],
): readonly ActivationFact[] {
  const source = preparationActivationSource(servant, sourceKind, sourceId, actorFormId);
  const facts = npProgramEffects(effects).flatMap<ActivationFact>((effect) => [
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
    ...sourceQuantityRequirements(effect.requirement.expression).map((condition) => ({
      ...condition,
      source,
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
