import { ENGINE_VERSION, type CalculationEvidence } from '@fgo-lab/schema';

const ATLAS_DAMAGE = 'https://github.com/atlasacademy/fgo-docs/blob/master/deeper/battle/damage.md';
const ATLAS_FLOAT32 =
  'https://github.com/atlasacademy/fgo-docs/blob/master/deeper/battle/32-bit-float.md';
const CHALDEA_DAMAGE =
  'https://github.com/chaldea-center/chaldea/blob/main/lib/app/battle/functions/damage.dart';
const APPMEDIA_NP_CALCULATOR = 'https://appmedia.jp/fategrandorder/5499061';
const NP_FUNCTION_GOLDEN_CASE_IDS = {
  standard: ['standard-reference-np-row'],
  defensePiercing: ['defense-piercing-np-row'],
  trait: ['trait-special-attack-match'],
  traitCount: ['trait-count-attacker-buff-stacks', 'trait-count-target-base-and-buff'],
  stateTrait: ['state-trait-special-attack-match'],
  hpRatioLow: ['hp-ratio-low-half-hp'],
  battlePointPhase: ['battle-point-phase-four'],
  targetRarity: ['target-rarity-low-rarity-match'],
  traitExpression: ['trait-expression-and-match'],
} as const;

function evidence(
  key: string,
  subject: string,
  status: CalculationEvidence['status'],
  sources: string[],
  goldenCaseIds: string[] = [],
  differentialCaseIds: string[] = [],
): CalculationEvidence {
  return {
    key,
    subject,
    status,
    sources,
    goldenCaseIds,
    differentialCaseIds,
    reviewedAt: '2026-08-25',
    engineVersion: ENGINE_VERSION,
  };
}

const entries: CalculationEvidence[] = [
  evidence(
    'kernel:np-damage-v1',
    'NP damage formula, binary32 boundaries, and random evaluation',
    'validated',
    [ATLAS_DAMAGE, ATLAS_FLOAT32],
    ['atlas-neutral-arts-random-1000'],
  ),
  evidence(
    'master:normalized-v7',
    'Atlas JP damage Function, battle point, and effect normalization',
    'validated',
    ['Atlas Academy JP nice servant, craft essence, and mystic code datasets'],
    ['master-normalization-v53'],
  ),
  ...(
    [
      'standard',
      'defensePiercing',
      'trait',
      'traitCount',
      'stateTrait',
      'hpRatioLow',
      'battlePointPhase',
      'targetRarity',
      'traitExpression',
    ] as const
  ).map((kind) =>
    evidence(
      `np-function:${kind}`,
      `NP damage Function handler: ${kind}`,
      kind === 'standard' ? 'validated' : 'provisional',
      kind === 'standard' ? [ATLAS_DAMAGE, APPMEDIA_NP_CALCULATOR] : [ATLAS_DAMAGE, CHALDEA_DAMAGE],
      [...NP_FUNCTION_GOLDEN_CASE_IDS[kind]],
      kind === 'standard' ? ['appmedia-lilith-neutral-np5'] : [],
    ),
  ),
  ...(
    [
      'attackBuff',
      'cardBuff',
      'npDamageBuff',
      'eventDamageBuff',
      'specialDamageBuff',
      'powerMod',
      'flatDamage',
      'ignoreDefense',
      'ignoreDamageCut',
      'npDamageBuffRate',
      'cardTypeChange',
    ] as const
  ).map((kind) =>
    evidence(
      `effect-operation:${kind}`,
      `Damage effect aggregation: ${kind}`,
      'provisional',
      [ATLAS_DAMAGE],
      kind === 'ignoreDefense'
        ? ['all-effect-sources-ordered-execution', 'defense-piercing-np-row']
        : kind === 'cardTypeChange'
          ? ['master-normalization-v53']
          : ['cardBuff', 'npDamageBuff', 'flatDamage'].includes(kind)
            ? ['all-effect-sources-ordered-execution', 'mlb-only-effects-v1']
            : ['all-effect-sources-ordered-execution'],
    ),
  ),
  evidence(
    'input:manual-final-modifiers',
    'User supplied final damage modifiers',
    'provisional',
    [],
  ),
];

export const calculationEvidenceRegistry: ReadonlyMap<string, CalculationEvidence> = new Map(
  entries.map((entry) => [entry.key, entry]),
);

export function evaluateCalculationEvidence(keys: readonly string[]):
  | {
      status: 'resolved';
      precision: 'exact' | 'approximate';
      evidence: CalculationEvidence[];
    }
  | { status: 'unsupported'; missingEvidence: string[]; evidence: CalculationEvidence[] } {
  const uniqueKeys = [...new Set(keys)];
  const resolved = uniqueKeys.flatMap((key) => {
    const entry = calculationEvidenceRegistry.get(key);
    return entry ? [entry] : [];
  });
  const missingEvidence = uniqueKeys.filter((key) => !calculationEvidenceRegistry.has(key));
  if (missingEvidence.length > 0)
    return { status: 'unsupported', missingEvidence, evidence: resolved };
  return {
    status: 'resolved',
    precision: resolved.some((entry) => entry.status === 'provisional') ? 'approximate' : 'exact',
    evidence: resolved,
  };
}
