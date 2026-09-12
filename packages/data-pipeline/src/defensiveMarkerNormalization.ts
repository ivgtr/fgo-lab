import type { AtlasFunction, AtlasFunctionValue } from './atlasContract';
import {
  stateMutationTraitName,
  type DamageReachableStateCatalog,
} from './targetStateNormalization';
/** Fixed reference: zero individuality plus defensive metadata, with no attack reader. */
export function isUnreferencedDefensiveMarker(
  fn: AtlasFunction,
  parameterSets: readonly (readonly AtlasFunctionValue[])[],
  traitNameById: ReadonlyMap<number, string>,
  stateCatalog: DamageReachableStateCatalog,
): boolean {
  return (
    fn.funcType === 'addState' &&
    fn.funcTargetType === 'self' &&
    fn.buffs?.length === 1 &&
    fn.buffs[0]?.type === 'addIndividuality' &&
    !Object.keys(fn.buffs[0].script ?? {}).length &&
    !fn.buffs[0].ckSelfIndv?.length &&
    !fn.buffs[0].ckOpIndv?.length &&
    !fn.functvals?.length &&
    !fn.funcquestTvals?.length &&
    !Object.keys(fn.script ?? {}).length &&
    parameterSets.flat().length > 0 &&
    parameterSets
      .flat()
      .every(
        (cell) =>
          cell.Value === 0 &&
          Number.isSafeInteger(cell.AddIndividualityEx) &&
          Number(cell.AddIndividualityEx) > 0 &&
          Object.keys(cell).every((key) =>
            ['Rate', 'Turn', 'Count', 'Value', 'AddIndividualityEx'].includes(key),
          ) &&
          stateCatalog.attackReadTraits !== undefined &&
          !stateCatalog.attackReadTraits.has(
            stateMutationTraitName({ id: Number(cell.AddIndividualityEx) }, traitNameById)!,
          ) &&
          !stateCatalog.attackReadTraits.has(stateMutationTraitName({ id: 0 }, traitNameById)!) &&
          !(fn.buffs ?? []).some((buff) =>
            (buff.vals ?? []).some(
              (trait) =>
                stateCatalog.populationReadTraits?.has(
                  stateMutationTraitName(trait, traitNameById)!,
                ) ||
                stateCatalog.countedBuffTraits?.has(stateMutationTraitName(trait, traitNameById)!),
            ),
          ),
      )
  );
}
