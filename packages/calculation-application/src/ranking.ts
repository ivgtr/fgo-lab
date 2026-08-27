import { attributeAffinity, classAffinity, servantAttribute } from '@fgo-lab/calc-core';
import {
  getPrimaryNoblePhantasm,
  getPrimaryNpDamage,
  getPrimaryNpPresentation,
  naturalServantLevel,
  type MasterDataSnapshot,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type {
  CalculationResult,
  CalculationScenario,
  CraftEssenceCopy,
  DamageResolutionInput,
  ServantBuild,
  SupportTemplate,
  VersionContext,
} from '@fgo-lab/schema';
import { applyCanonicalInputCommand } from './canonicalInputs';
import { applyEffectProjectionDecision } from './effectDecision';
import {
  calculateScenario,
  createDefaultResolvedScenario,
  type CalculationExecution,
} from './scenario';

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
  scenario: CalculationScenario;
  input: DamageResolutionInput;
  result: CalculationResult;
  effects: CalculationExecution['effects'];
  effectInputs: CalculationExecution['effectInputs'];
}

export interface RankingCalculation {
  rows: RankingRowSummary[];
  failures: RankingFailure[];
  details: Record<string, RankingDetail>;
}

function standardLevel(servant: ServantMaster, rule: RankingLevelRule): number {
  if (rule === 'natural') return naturalServantLevel(servant.rarity);
  if (rule === 'level90') return 90;
  if (rule === 'level100') return 100;
  return 120;
}

function selectedSupport(
  profile: RankingProfileInput,
  templateId: string | null,
): SupportTemplate | undefined {
  return templateId
    ? profile.supportTemplates.find((candidate) => candidate.templateId === templateId)
    : undefined;
}

function classAffinityValue(servant: ServantMaster, conditions: RankingConditions): number {
  if (conditions.classAffinityRule === 'auto')
    return classAffinity(servant.classId, conditions.targetClassId);
  if (conditions.classAffinityRule === 'favorable') return 2;
  if (conditions.classAffinityRule === 'attackAdvantage') return 1.5;
  if (conditions.classAffinityRule === 'unfavorable') return 0.5;
  return 1;
}

function attributeAffinityValue(servant: ServantMaster, conditions: RankingConditions): number {
  if (conditions.attributeAffinityRule === 'auto')
    return attributeAffinity(servantAttribute(servant.traits), conditions.targetAttribute);
  if (conditions.attributeAffinityRule === 'favorable') return 1.1;
  if (conditions.attributeAffinityRule === 'unfavorable') return 0.9;
  return 1;
}

function worldFactAssertions(
  conditions: RankingConditions,
): ResolvedScenario['worldFactAssertions'] {
  return [
    ...[...new Set(conditions.targetTraits)].sort().map((trait) => ({
      decisionKey: `ranking:target:${trait}`,
      fact: { kind: 'trait' as const, scope: 'target' as const, trait, present: true },
    })),
    ...[...new Set(conditions.fieldTraits)].sort().map((trait) => ({
      decisionKey: `ranking:field:${trait}`,
      fact: { kind: 'trait' as const, scope: 'field' as const, trait, present: true },
    })),
  ];
}

function baseRankingScenario(
  servant: ServantMaster,
  build: ServantBuild | undefined,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
): ResolvedScenario {
  const owned = conditions.comparisonMode === 'owned';
  if (owned && (!build || build.npLevel === 0))
    throw new TypeError(`ranking_owned_build_missing:${servant.id}`);
  const support = selectedSupport(profile, conditions.supportTemplateId);
  const scenario = createDefaultResolvedScenario(master, owned ? build : undefined, servant);
  const code = conditions.mysticCode
    ? master.mysticCodes.find((candidate) => candidate.id === conditions.mysticCode?.mysticCodeId)
    : undefined;
  return {
    ...scenario,
    attacker: {
      ...scenario.attacker,
      source: owned ? 'owned' : 'master',
      level: owned ? build!.level : standardLevel(servant, conditions.levelRule),
      npLevel: owned ? build!.npLevel : conditions.npLevel,
      fouAtk: owned ? build!.fouAtk : conditions.fouAtk,
    },
    overcharge: conditions.overcharge,
    target: {
      classId: conditions.targetClassId,
      attribute: conditions.targetAttribute,
    },
    assumptions: {
      classAffinity: classAffinityValue(servant, conditions),
      attributeAffinity: attributeAffinityValue(servant, conditions),
    },
    attackerHpPermille: conditions.attackerHpPermille,
    battleState: { battlePointPhase: conditions.battlePointPhase },
    craftEssence: conditions.craftEssence,
    attackerSkills: servant.skills.slice(0, 3).map((skill, index) => ({
      skillId: skill.id,
      skillLevel: owned ? (build!.skills[String(index + 1)] ?? 1) : 10,
    })),
    mysticCode:
      code && conditions.mysticCode
        ? {
            mysticCodeId: code.id,
            skills: code.skills.map((skill) => ({
              skillId: skill.id,
              skillLevel: conditions.mysticCode!.skillLevel,
              enabled: true,
            })),
          }
        : null,
    support: support
      ? {
          sourceTemplateId: support.templateId,
          composition: structuredClone(support.composition),
        }
      : null,
    worldFactAssertions: worldFactAssertions(conditions),
  };
}

function supportEffectExcluded(
  template: SupportTemplate,
  projection: CalculationExecution['effects'][number],
) {
  return template.composition.effectInclusions.some(
    (override) =>
      override.sourceInstanceId === projection.source.sourceInstanceId &&
      override.skillId === projection.source.skillId &&
      override.effectId === projection.source.effectId &&
      override.effectOccurrenceId === projection.source.effectOccurrenceId,
  );
}

function applyStoredSupportExclusions(
  scenario: ResolvedScenario,
  calculation: CalculationExecution,
  support: SupportTemplate | undefined,
): ResolvedScenario {
  if (!support) return scenario;
  return calculation.effects
    .filter(
      (projection) =>
        projection.source.origin === 'support' && supportEffectExcluded(support, projection),
    )
    .reduce(
      (current, projection) => applyEffectProjectionDecision(current, projection, false),
      scenario,
    );
}

function shouldControlSelfEffect(projection: CalculationExecution['effects'][number]): boolean {
  return (
    projection.visibility === 'visible' &&
    (projection.source.origin === 'attacker' ||
      projection.source.origin === 'passive' ||
      projection.source.origin === 'np')
  );
}

function applySelfEffectPolicy(
  scenario: ResolvedScenario,
  calculation: CalculationExecution,
  conditions: RankingConditions,
): ResolvedScenario {
  let next = scenario;
  for (const control of calculation.effectControls) {
    const projection = control.projection;
    if (!shouldControlSelfEffect(projection)) continue;
    if (control.interaction === 'singleChoice') continue;
    if (projection.proc.kind === 'chainedRolls') {
      const procInput = calculation.effectInputs.find(
        (input) =>
          input.kind === 'procSuccessCount' &&
          input.relatedProjectionKeys.includes(projection.projectionKey),
      );
      if (!procInput)
        throw new TypeError(`ranking_chained_input_missing:${projection.projectionKey}`);
      next = applyCanonicalInputCommand(next, {
        kind: 'setCanonicalIntegerInput',
        key: procInput.key,
        value:
          conditions.includeSelfEffects && conditions.chainedProcPolicy === 'maximum'
            ? procInput.maximum
            : procInput.minimum,
      });
      continue;
    }
    if (projection.decision.state === 'none') continue;
    const include =
      conditions.includeSelfEffects &&
      (projection.proc.kind === 'guaranteed' || conditions.procPolicy === 'success');
    next = applyEffectProjectionDecision(next, projection, include);
  }
  return next;
}

function inputPolicyValue(
  definition: CalculationExecution['inputDefinitions'][number],
  policy: RankingCanonicalInputPolicy,
): number | null {
  if (definition.kind === 'matchingActorCount') {
    if (definition.countSemantics.population === 'enemies') return policy.enemyCount;
    if (definition.countSemantics.population === 'allies') return policy.allyCount;
    return policy.allActorCount;
  }
  if (definition.kind === 'procSuccessCount') return null;
  return policy[definition.kind] ?? null;
}

function applyCanonicalInputPolicy(
  scenario: ResolvedScenario,
  calculation: CalculationExecution,
  policy: RankingCanonicalInputPolicy,
): ResolvedScenario {
  return calculation.inputDefinitions.reduce((current, definition) => {
    const value = inputPolicyValue(definition, policy);
    return value === null
      ? current
      : applyCanonicalInputCommand(current, {
          kind: 'setCanonicalIntegerInput',
          key: definition.key,
          value,
        });
  }, scenario);
}

function applyNonSelfProcPolicy(
  scenario: ResolvedScenario,
  calculation: CalculationExecution,
  conditions: RankingConditions,
): ResolvedScenario {
  if (conditions.procPolicy === 'success' && conditions.chainedProcPolicy === 'maximum')
    return scenario;
  let next = scenario;
  for (const control of calculation.effectControls) {
    const projection = control.projection;
    if (shouldControlSelfEffect(projection) || projection.proc.kind === 'guaranteed') continue;
    if (projection.proc.kind === 'chainedRolls') {
      const procInput = calculation.effectInputs.find(
        (input) =>
          input.kind === 'procSuccessCount' &&
          input.relatedProjectionKeys.includes(projection.projectionKey),
      );
      if (procInput && conditions.chainedProcPolicy === 'minimum')
        next = applyCanonicalInputCommand(next, {
          kind: 'setCanonicalIntegerInput',
          key: procInput.key,
          value: procInput.minimum,
        });
      continue;
    }
    if (conditions.procPolicy === 'failure' && projection.decision.state !== 'none')
      next = applyEffectProjectionDecision(next, projection, false);
  }
  return next;
}

export function createRankingScenario(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
): ResolvedScenario {
  const build = profile.servantBuilds[servant.id];
  let scenario = baseRankingScenario(servant, build, master, profile, conditions);
  let calculation = calculateScenario(scenario, master, versions);
  const support = selectedSupport(profile, conditions.supportTemplateId);
  scenario = applyStoredSupportExclusions(scenario, calculation, support);
  calculation = calculateScenario(scenario, master, versions);
  scenario = applySelfEffectPolicy(scenario, calculation, conditions);
  calculation = calculateScenario(scenario, master, versions);
  scenario = applyCanonicalInputPolicy(scenario, calculation, conditions.canonicalInputs);
  calculation = calculateScenario(scenario, master, versions);
  return applyNonSelfProcPolicy(scenario, calculation, conditions);
}

function resultFailure(servant: ServantMaster, result: CalculationResult): RankingFailure {
  if (result.status === 'inputRequired')
    return {
      servantId: servant.id,
      name: servant.name,
      status: 'inputRequired',
      reason: result.requiredInputs.map((input) => input.label).join('、') || '入力が必要です',
    };
  if (result.status === 'calculated')
    throw new TypeError(`ranking_calculated_result_is_not_failure:${servant.id}`);
  return {
    servantId: servant.id,
    name: servant.name,
    status: 'unsupported',
    reason:
      result.issues.map((issue) => issue.code).join('、') ||
      result.missingEvidence.join('、') ||
      '正確に計算できません',
  };
}

export function calculateRanking(
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
): RankingCalculation {
  const rows: RankingRowSummary[] = [];
  const failures: RankingFailure[] = [];
  const details: Record<string, RankingDetail> = {};
  const servants = master.servants.filter((servant) => {
    if (!getPrimaryNoblePhantasm(servant) || !getPrimaryNpDamage(servant)) return false;
    if (conditions.comparisonMode === 'standard') return true;
    return (profile.servantBuilds[servant.id]?.npLevel ?? 0) > 0;
  });
  for (const servant of servants) {
    const presentation = getPrimaryNpPresentation(servant);
    if (!presentation) continue;
    const scenario = createRankingScenario(servant, master, profile, conditions, versions);
    const execution = calculateScenario(scenario, master, versions);
    details[servant.id] = {
      servantId: servant.id,
      scenario,
      input: execution.input,
      result: execution.result,
      effects: execution.effects,
      effectInputs: execution.effectInputs,
    };
    if (execution.result.status !== 'calculated') {
      failures.push(resultFailure(servant, execution.result));
      continue;
    }
    const selected = execution.result.rows[scenario.attacker.npLevel - 1];
    if (!selected) throw new RangeError(`ranking_np_row_missing:${servant.id}`);
    const applied = execution.effects.filter(
      (effect) => effect.visibility === 'visible' && effect.outcome === 'applied',
    );
    const supportSources = new Set(
      applied
        .filter((effect) => effect.source.origin === 'support')
        .map((effect) => effect.source.sourceInstanceId),
    );
    rows.push({
      servantId: servant.id,
      name: servant.name,
      imageKey: servant.imageKey,
      classId: servant.classId,
      rarity: servant.rarity,
      npCard: presentation.card,
      npTarget: presentation.target,
      minimum: selected.minimum,
      average: selected.average,
      maximum: selected.maximum,
      precision: execution.result.precision,
      appliedEffectCount: new Set(applied.map((effect) => effect.projectionKey)).size,
      supportEffectCount: new Set(
        applied
          .filter((effect) => effect.source.origin === 'support')
          .map((effect) => effect.projectionKey),
      ).size,
      supportSourceCount: supportSources.size,
      level: scenario.attacker.level,
      npLevel: scenario.attacker.npLevel,
      owned: conditions.comparisonMode === 'owned',
    });
  }
  return { rows, failures, details };
}
