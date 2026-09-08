import type { CanonicalNpResourceSemantics } from '@fgo-lab/master-data';
import {
  initialOverchargeSchema,
  rankingNpLevelSchema,
  type CalculationScenario,
} from '@fgo-lab/schema';
type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;
export function initialOcOptions(
  semantics: CanonicalNpResourceSemantics,
  npLevel: number | null,
): readonly (1 | 2 | 3)[] {
  const capacity =
    npLevel === null
      ? Infinity
      : semantics.capacityByNpLevel[rankingNpLevelSchema.parse(npLevel) - 1]!;
  return ([1, 2, 3] as const).filter(
    (oc) => oc * semantics.noblePhantasmUse.baseOvercharge.gaugePerStage <= capacity,
  );
}
/** Explicit NP commands preserve a legal initial OC; an incompatible intent resets to OC1. */
export function initialOcAfterNpLevelChange(
  initialOvercharge: ResolvedScenario['initialOvercharge'],
  semantics: CanonicalNpResourceSemantics,
  npLevel: number,
): ResolvedScenario['initialOvercharge'] {
  return initialOcOptions(semantics, npLevel).includes(initialOvercharge) ? initialOvercharge : 1;
}
export function changeResolvedNpLevel(
  scenario: ResolvedScenario,
  semantics: CanonicalNpResourceSemantics,
  value: number,
): ResolvedScenario {
  const npLevel = rankingNpLevelSchema.parse(value);
  return {
    ...scenario,
    attacker: { ...scenario.attacker, npLevel },
    initialOvercharge: initialOcAfterNpLevelChange(scenario.initialOvercharge, semantics, npLevel),
  };
}
export function changeResolvedInitialOc(
  scenario: ResolvedScenario,
  semantics: CanonicalNpResourceSemantics,
  value: number,
): ResolvedScenario {
  const initialOvercharge = initialOverchargeSchema.parse(value);
  if (!initialOcOptions(semantics, scenario.attacker.npLevel).includes(initialOvercharge))
    throw new TypeError('initialOcExceedsNpCapacity');
  return { ...scenario, initialOvercharge };
}
