import type { ConditionFactProof } from './conditionRead';
import { cloneConditionFactProofs } from './conditionRead';
import type { PreNoblePhantasmState } from './preparationContracts';

/** The value owner supplies the before/after states and the proof of that committed write. */
export function bindPreparationWriteProofs(
  before: PreNoblePhantasmState,
  after: PreNoblePhantasmState,
  proof: ConditionFactProof,
): PreNoblePhantasmState {
  const facts = cloneConditionFactProofs(before.conditionWriteProofs);
  for (const scope of ['attackerState', 'targetState', 'field'] as const)
    for (const [trait, value] of Object.entries(after.stackCounts[scope]))
      if (before.stackCounts[scope][trait] !== value)
        (facts.traits[scope] as Map<string, ConditionFactProof>).set(trait, proof);
  for (const actor of ['attacker', 'target'] as const)
    for (const trait of after.initialTraitSuppressions[actor])
      if (!before.initialTraitSuppressions[actor].has(trait))
        (facts.suppressions[actor] as Map<string, ConditionFactProof>).set(trait, proof);
  for (const instance of after.buffInstances) {
    const previous = before.buffInstances.find(({ identity }) => identity === instance.identity);
    if (!previous || previous.count !== instance.count || previous.uncertain !== instance.uncertain)
      (facts.markers as Map<string, ConditionFactProof>).set(instance.identity, proof);
  }
  if (before.npResource.gauge !== after.npResource.gauge)
    (facts.quantities as Map<string, ConditionFactProof>).set('npGauge:attacker', proof);
  if (before.hp !== after.hp)
    for (const [actor, value] of Object.entries(after.hp?.actors ?? {}))
      if (before.hp?.actors[actor] !== value)
        (facts.quantities as Map<string, ConditionFactProof>).set(
          actor === 'attacker' ? 'attackerHpPermille' : `hp:${actor}`,
          proof,
        );
  for (const [actor, domains] of Object.entries(after.battlePoints.actors))
    for (const [subject, value] of Object.entries(domains.domains))
      if (before.battlePoints.actors[actor]?.domains[subject] !== value)
        (facts.quantities as Map<string, ConditionFactProof>).set(
          `battlePoint:${actor}:${subject}`,
          proof,
        );
  return { ...after, conditionWriteProofs: facts };
}
