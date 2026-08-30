import type {
  CanonicalNpGaugeRecipient,
  CanonicalNpGaugeRequirement,
  CanonicalNpGaugeTransition,
  CanonicalNpResourceSemantics,
  CanonicalValueSets,
} from '@fgo-lab/master-data';
import type { AtlasFunction, AtlasFunctionValue } from './atlasContract';

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

function normalizeRecipient(fn: AtlasFunction): CanonicalNpGaugeRecipient {
  const target = fn.funcTargetType ?? 'unknown';
  if (target === 'enemyAll') return 'allEnemies';
  if (target === 'enemy' || fn.funcTargetTeam === 'enemy') return 'selectedEnemy';
  if (target === 'self') return 'sourceActor';
  if (target === 'ptOne') return 'selectedAlly';
  if (target === 'ptAll') return 'allAllies';
  if (target === 'ptOther') return 'otherAllies';
  if (target === 'ptSelfAnotherFirst') return 'sourceAndFirstOtherAlly';
  throw new TypeError(`unsupported_np_gauge_recipient:${target}`);
}

const dependentFamilies = {
  gainMultiplyNp: 'currentGaugeMultiplier',
  gainNpTargetSum: 'matchingTargetCount',
  gainNpIndividualSum: 'matchingTargetCount',
  gainNpBuffIndividualSum: 'matchingBuffCount',
  gainNpFromTargets: 'dependentTargetResult',
} as const;

export function normalizeNpGaugeTransition(
  fn: AtlasFunction,
  parameterSets: readonly (readonly AtlasFunctionValue[])[],
): CanonicalNpGaugeTransition | null {
  const family = fn.funcType
    ? dependentFamilies[fn.funcType as keyof typeof dependentFamilies]
    : undefined;
  if (family) return { kind: 'unsupported', recipient: normalizeRecipient(fn), family };
  if (fn.funcType !== 'gainNp' && fn.funcType !== 'lossNp') return null;
  const amounts = parameterSets.map((set) =>
    set.map(({ Value }) => {
      if (!Number.isInteger(Value) || Value! < 0)
        throw new TypeError(`invalid_np_gauge_amount:${String(fn.funcId)}:${String(Value)}`);
      return Value!;
    }),
  ) as CanonicalValueSets;
  return {
    kind: 'fixed',
    recipient: normalizeRecipient(fn),
    direction: fn.funcType === 'gainNp' ? 'gain' : 'loss',
    amounts,
    overflow: 'clampToCapacity',
    underflow: 'clampToZero',
  };
}
