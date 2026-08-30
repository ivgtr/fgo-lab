import type {
  CalculationResult,
  CalculationScenario,
  CraftEssenceCopy,
  DamageResolutionInput,
  ServantBuild,
  SupportTemplate,
} from '@fgo-lab/schema';
import type { CalculationExecution } from './scenario';
import type { NoblePhantasmVariantRef } from '@fgo-lab/master-data';
import type { AttackProfile } from './attackProfile';
import type { DamageContributionProjection } from '@fgo-lab/battle-execution';

type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

export type RankingComparisonMode = 'standard' | 'owned';
export type RankingNpLevel = 1 | 2 | 3 | 4 | 5;
export type RankingClassAffinity = 'neutral' | 'favorable';
export type RankingSelfBuffs = 'included' | 'excluded';
export type RankingDamageContributionProjection =
  'standardWithSelfSkills' | 'counterfactualWithoutVoluntarySkillModifiers';

export const rankingDamageContributionProjection = (
  selfBuffs: RankingSelfBuffs,
): RankingDamageContributionProjection =>
  selfBuffs === 'included'
    ? 'standardWithSelfSkills'
    : 'counterfactualWithoutVoluntarySkillModifiers';
export type RankingSpecialAttack = 'inactive' | 'active';
export type RankingField = 'inactive' | 'active';

export interface RankingConditions {
  comparisonMode: RankingComparisonMode;
  npLevel: RankingNpLevel;
  classAffinity: RankingClassAffinity;
  selfBuffs: RankingSelfBuffs;
  specialAttack: RankingSpecialAttack;
  field: RankingField;
}

export const DEFAULT_RANKING_CONDITIONS: RankingConditions = {
  comparisonMode: 'standard',
  npLevel: 1,
  classAffinity: 'neutral',
  selfBuffs: 'included',
  specialAttack: 'inactive',
  field: 'inactive',
};

export const STANDARD_RANKING_SCENARIO_POLICY = {
  level: 'naturalLimit',
  fouAtk: 1_000,
  overcharge: 1,
  skillLevel: 10,
  attributeRelation: 'neutral',
  craftEssence: null,
  mysticCode: null,
  support: null,
  attackerHpPermille: 1_000,
  criticalStars: 0,
  currentTurn: 1,
  battlePointPhase: 0,
  stochasticOutcome: 'success',
  chainedStochasticOutcome: 'maximum',
  quantitySelection: 'canonicalMinimum',
} as const;

export interface RankingProfileInput {
  servantBuilds: Readonly<Record<string, ServantBuild>>;
  craftEssences: readonly CraftEssenceCopy[];
  supportTemplates: readonly SupportTemplate[];
}

export interface RankingRowSummary {
  entryId: string;
  servantId: string;
  name: string;
  imageKey: string | null;
  classId: string;
  rarity: number;
  npCard: 'buster' | 'arts' | 'quick';
  npTarget: 'single' | 'all';
  noblePhantasmVariant: NoblePhantasmVariantRef;
  noblePhantasmName: string;
  attackProfile: AttackProfile;
  minimum: number;
  average: number;
  maximum: number;
  precision: 'exact' | 'approximate';
  appliedEffectCount: number;
  supportEffectCount: number;
  supportSourceCount: number;
  specialAttackApplied: boolean;
  level: number;
  npLevel: number;
  owned: boolean;
}

export interface RankingFailure {
  servantId: string;
  name: string;
  status: 'inputRequired' | 'unsupported';
  reason: string;
}

export interface RankingDetail {
  entryId: string;
  servantId: string;
  noblePhantasmVariant: NoblePhantasmVariantRef;
  noblePhantasmName: string;
  attackProfile: AttackProfile;
  npCard: 'buster' | 'arts' | 'quick';
  npTarget: 'single' | 'all';
  scenario: ResolvedScenario;
  input: DamageResolutionInput;
  result: CalculationResult;
  effects: CalculationExecution['effects'];
  effectInputs: CalculationExecution['effectInputs'];
  warnings: CalculationExecution['effectWarnings'];
  appliedPreparationActions: CalculationExecution['appliedPreparationActions'];
  contributionProjection: DamageContributionProjection;
  areaContribution: {
    withoutAreaScenario: ResolvedScenario;
    withoutAreaInput: DamageResolutionInput;
    withoutAreaResult: CalculationResult;
    withoutAreaEffects: CalculationExecution['effects'];
    contributionProjection: DamageContributionProjection;
    warnings: CalculationExecution['effectWarnings'];
  } | null;
  executionMetrics: {
    worldCandidateCount: number;
    scenarioCalculationCount: number;
  };
}

export interface RankingCalculation {
  rows: RankingRowSummary[];
  failures: RankingFailure[];
  details: Record<string, RankingDetail>;
  damageCache: {
    requestCount: number;
    distinctDamageInputCount: number;
    cacheHitCount: number;
    cacheHitRate: number;
  };
}

export interface RankingSummary {
  rows: RankingRowSummary[];
  failures: RankingFailure[];
}

export type RankingSummaryMatrix = readonly [
  RankingSummary,
  RankingSummary,
  RankingSummary,
  RankingSummary,
  RankingSummary,
];
