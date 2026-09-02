import type {
  CanonicalNpGaugeRequirement,
  CanonicalNpResourceSemantics,
} from '@fgo-lab/master-data';

export const canonicalNpResourceSemantics: CanonicalNpResourceSemantics = {
  unit: 'basisPoints',
  capacityByNpLevel: [10_000, 20_000, 20_000, 20_000, 30_000],
  noblePhantasmUse: {
    requirement: 10_000,
    consumption: 'all',
    baseOvercharge: { gaugePerStage: 10_000, minimumStage: 1, maximumBaseStage: 3 },
  },
};

export function normalizeNpGaugeRequirement(raw: unknown): CanonicalNpGaugeRequirement | null {
  if (raw === undefined) return null;
  if (
    !Array.isArray(raw) ||
    raw.length !== 10 ||
    raw.some((value) => !Number.isInteger(value) || (value as number) < 0)
  )
    throw new TypeError(`invalid_np_gauge_requirement:${JSON.stringify(raw)}`);
  return {
    kind: 'atLeast',
    amountsBySkillLevel: raw.map((value) => (value as number) * 100),
  };
}
