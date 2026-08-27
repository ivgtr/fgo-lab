import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
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
type TargetAttribute = ResolvedScenario['target']['attribute'];

export type RankingComparisonMode = 'standard' | 'owned';
export type RankingLevelRule = 'natural' | 'level90' | 'level100' | 'level120';
export type RankingAffinityRule =
  'favorable' | 'attackAdvantage' | 'neutral' | 'unfavorable' | 'auto';
export type RankingAttributeRule = 'favorable' | 'neutral' | 'unfavorable' | 'auto';
export type RankingProcPolicy = 'success' | 'failure';
export type RankingChainedProcPolicy = 'maximum' | 'minimum';

export interface RankingCraftEssenceSelection {
  craftEssenceId: string;
  level: number;
  limitBreak: number;
}

export interface RankingMysticCodeSelection {
  mysticCodeId: string;
  skillLevel: number;
}

export interface RankingCanonicalInputPolicy {
  currentTurn: number | null;
  criticalStars: number | null;
  effectStackCount: number | null;
  fieldActorCount: number | null;
  availableSkillCount: number | null;
  friendshipLevel: number | null;
  sourceHpPermille: number | null;
  allyCount: number | null;
  enemyCount: number | null;
  allActorCount: number | null;
}

export interface RankingConditions {
  comparisonMode: RankingComparisonMode;
  levelRule: RankingLevelRule;
  npLevel: number;
  fouAtk: number;
  overcharge: number;
  includeSelfEffects: boolean;
  supportTemplateId: string | null;
  craftEssence: RankingCraftEssenceSelection | null;
  mysticCode: RankingMysticCodeSelection | null;
  classAffinityRule: RankingAffinityRule;
  attributeAffinityRule: RankingAttributeRule;
  targetClassId: string;
  targetAttribute: TargetAttribute;
  targetTraits: readonly string[];
  fieldTraits: readonly string[];
  attackerHpPermille: number | null;
  battlePointPhase: number | null;
  procPolicy: RankingProcPolicy;
  chainedProcPolicy: RankingChainedProcPolicy;
  canonicalInputs: RankingCanonicalInputPolicy;
}

export const DEFAULT_RANKING_CONDITIONS: RankingConditions = {
  comparisonMode: 'standard',
  levelRule: 'natural',
  npLevel: 1,
  fouAtk: 1_000,
  overcharge: 1,
  includeSelfEffects: true,
  supportTemplateId: null,
  craftEssence: null,
  mysticCode: null,
  classAffinityRule: 'favorable',
  attributeAffinityRule: 'neutral',
  targetClassId: 'lancer',
  targetAttribute: 'unknown',
  targetTraits: [],
  fieldTraits: [],
  attackerHpPermille: 1_000,
  battlePointPhase: 0,
  procPolicy: 'success',
  chainedProcPolicy: 'maximum',
  canonicalInputs: {
    currentTurn: null,
    criticalStars: null,
    effectStackCount: null,
    fieldActorCount: null,
    availableSkillCount: null,
    friendshipLevel: null,
    sourceHpPermille: null,
    allyCount: null,
    enemyCount: null,
    allActorCount: null,
  },
};

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

export interface RankingTraitInventory {
  target: string[];
  field: string[];
}

export function collectRankingTraitInventory(master: MasterDataSnapshot): RankingTraitInventory {
  const target = new Set<string>();
  const field = new Set<string>();
  const collectEffect = (effect: ServantMaster['skills'][number]['effects'][number]) => {
    for (const trait of effect.conditions.opponent.traits)
      if (!trait.negative) target.add(trait.name);
    for (const group of [effect.conditions.field])
      for (const trait of group.traits) if (!trait.negative) field.add(trait.name);
  };
  for (const servant of master.servants) {
    for (const skill of [...servant.skills, ...servant.passives])
      for (const effect of skill.effects) collectEffect(effect);
    for (const np of servant.noblePhantasms) {
      for (const effect of np.effects) collectEffect(effect);
      for (const damage of np.damage)
        for (const row of damage.parametersByOvercharge)
          for (const parameter of row) {
            if (parameter.targetTrait) target.add(parameter.targetTrait.name);
            for (const trait of parameter.targetTraits ?? []) target.add(trait.name);
            for (const trait of parameter.andCheckTraits ?? []) target.add(trait.name);
          }
    }
  }
  return { target: [...target].sort(), field: [...field].sort() };
}
