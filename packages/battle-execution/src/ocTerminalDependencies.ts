import type { AttackNoblePhantasmVariant, MasterEffect } from '@fgo-lab/master-data';
import { compileEffectCached } from './operationCompiler';
import { noblePhantasmDamageDependency } from './npDamageCompilation';
import { conditionReadsResource, operationReadsResource } from './resourceSemantics';
import type { SourceEffect } from './sourceCollection';

/** Only an ordered reader can make a terminal NP's resource cell affect its damage. */
export function terminalResourceHasReader(
  variant: AttackNoblePhantasmVariant,
  effectIndex: number,
  resource: Extract<MasterEffect['execution'][number], { kind: 'resourceMutation' }>['resource'],
): boolean {
  if (resource === 'npGauge') return false; // This NP's gauge-derived OC is already frozen.
  if (
    variant.damage.some((damage) =>
      damage.parametersByOvercharge.some((row, oc) =>
        row.some((_, level) =>
          conditionReadsResource(
            noblePhantasmDamageDependency(damage, oc + 1, level + 1),
            resource,
          ),
        ),
      ),
    )
  )
    return true;
  return variant.effects.slice(effectIndex + 1).some((effect) => {
    if (effect.timing !== 'beforeDamage') return false;
    const source: SourceEffect = {
      phase: 'beforeNpDamage',
      origin: 'np',
      sourceInstanceId: 'oc-dependency',
      sourceId: variant.ref.actorFormId.actorId,
      sourceName: '',
      sourceTraits: [],
      skillId: variant.ref.noblePhantasmId,
      skillName: '',
      effect,
      valueSetIndex: 0,
      valueIndex: 0,
      limitBreak: false,
      sourceEnabled: true,
      enabledByDefault: true,
      noblePhantasmVariant: variant.ref,
      preparationStochasticOutcome: null,
      compilationPurpose: 'dependency',
    };
    return [0, 1, 2, 3, 4].some((valueSetIndex) =>
      [0, 1, 2, 3, 4].some((valueIndex) =>
        compileEffectCached({ ...source, valueSetIndex, valueIndex }, 0, []).operations.some(
          (operation) => operationReadsResource(operation, resource),
        ),
      ),
    );
  });
}
