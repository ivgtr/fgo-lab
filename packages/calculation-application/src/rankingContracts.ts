import type {
  CalculationResult,
  CalculationScenario,
  CraftEssenceCopy,
  DamageResolutionInput,
  ServantBuild,
  SupportTemplate,
} from '@fgo-lab/schema';
import type { CalculationExecution } from './scenario';

type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

export type RankingComparisonMode = 'standard' | 'owned';
export type RankingNpLevel = 1 | 2 | 3 | 4 | 5;
export type RankingClassAffinity = 'neutral' | 'favorable';
export type RankingSelfBuffs = 'included' | 'excluded';
export type RankingSpecialAttack = 'inactive' | 'active';

export interface RankingConditions {
  comparisonMode: RankingComparisonMode;
  npLevel: RankingNpLevel;
  classAffinity: RankingClassAffinity;
  selfBuffs: RankingSelfBuffs;
  specialAttack: RankingSpecialAttack;
}

export const DEFAULT_RANKING_CONDITIONS: RankingConditions = {
  comparisonMode: 'standard',
  npLevel: 1,
  classAffinity: 'neutral',
  selfBuffs: 'included',
  specialAttack: 'inactive',
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
  procSelection: 'success',
  chainedProcSelection: 'maximum',
  quantitySelection: 'canonicalMinimum',
} as const;

export interface RankingProfileInput {
  servantBuilds: Readonly<Record<string, ServantBuild>>;
  craftEssences: readonly CraftEssenceCopy[];
  supportTemplates: readonly SupportTemplate[];
}

export interface RankingRowSummary {
  servantId: string;
  name: string;
  imageKey: string | null;
  classId: string;
  rarity: number;
  npCard: 'buster' | 'arts' | 'quick';
  npTarget: 'single' | 'all';
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
  servantId: string;
  scenario: ResolvedScenario;
  input: DamageResolutionInput;
  result: CalculationResult;
  effects: CalculationExecution['effects'];
  effectInputs: CalculationExecution['effectInputs'];
  warnings: CalculationExecution['effectWarnings'];
  areaContribution: {
    withoutAreaScenario: ResolvedScenario;
    withoutAreaInput: DamageResolutionInput;
    withoutAreaResult: CalculationResult;
    withoutAreaEffects: CalculationExecution['effects'];
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
