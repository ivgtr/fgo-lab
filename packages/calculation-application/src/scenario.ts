import { executeOrderedScenario, type EffectProjection } from '@fgo-lab/battle-execution';
import { classAttackRate } from '@fgo-lab/calc-core';
import {
  deriveCraftEssenceAtk,
  deriveNpMultipliers,
  getPrimaryNoblePhantasm,
  getPrimaryNpDamage,
  naturalServantLevel,
  type MasterDataSnapshot,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type {
  CalculationResult,
  CalculationScenario,
  DamageResolutionInput,
  ServantBuild,
  VersionContext,
} from '@fgo-lab/schema';
import { calculateDamageResolution } from './damageResolution';
import { evaluateCalculationEvidence } from './evidence';

export interface ResolvedCalculationInput {
  input: DamageResolutionInput;
  precision: 'exact' | 'approximate' | 'unsupported';
  evidenceKeys: string[];
  warnings: string[];
  trace: { step: string; detail: string }[];
  effects: EffectProjection[];
}

export interface CalculationExecution {
  scenario: CalculationScenario;
  scenarioInput: DamageResolutionInput;
  input: DamageResolutionInput;
  effects: EffectProjection[];
  effectWarnings: string[];
  result: CalculationResult;
}

type ResolvedCalculationScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

export function createDefaultResolvedScenario(
  master: MasterDataSnapshot,
  build: ServantBuild | undefined,
  servant: ServantMaster = master.servants[0]!,
): ResolvedCalculationScenario {
  const noblePhantasm = getPrimaryNoblePhantasm(servant);
  const damage = getPrimaryNpDamage(servant);
  if (!noblePhantasm || !damage) throw new TypeError(`attack_np_missing:${servant.id}`);
  return {
    mode: 'resolved',
    attacker: {
      servantId: servant.id,
      source: build?.npLevel ? 'owned' : 'master',
      level: build?.level ?? naturalServantLevel(servant.rarity),
      npLevel: Math.max(1, build?.npLevel ?? 1),
      fouAtk: build?.fouAtk ?? 1000,
    },
    overcharge: 1,
    target: { classId: 'affinity:2', attribute: 'unknown' },
    attackerHpPermille: null,
    battleState: { battlePointPhase: null },
    assumptions: { classAffinity: 2, attributeAffinity: 1 },
    craftEssence: null,
    attackerSkills: servant.skills.slice(0, 3).map((skill, index) => ({
      skillId: skill.id,
      skillLevel: build?.npLevel ? (build.skills[String(index + 1)] ?? 1) : 10,
    })),
    mysticCode: null,
    support: null,
    effectDecisions: [],
    worldFactAssertions: [],
    explicitOverrides: {},
  };
}

function resolvedScenarioBaseInput(
  scenario: ResolvedCalculationScenario,
  master: MasterDataSnapshot,
): DamageResolutionInput {
  const servant = master.servants.find((candidate) => candidate.id === scenario.attacker.servantId);
  if (!servant) throw new TypeError(`scenario_attacker_missing:${scenario.attacker.servantId}`);
  const noblePhantasm = getPrimaryNoblePhantasm(servant);
  const damage = getPrimaryNpDamage(servant);
  if (!noblePhantasm || !damage) throw new TypeError(`attack_np_missing:${servant.id}`);
  const craftEssence = scenario.craftEssence
    ? master.craftEssences.find(
        (candidate) => candidate.id === scenario.craftEssence?.craftEssenceId,
      )
    : undefined;
  return {
    attackerId: servant.id,
    attackerLevel: scenario.attacker.level,
    attackerAtk:
      scenario.explicitOverrides.attackerAtk ??
      servant.atkByLevel[String(scenario.attacker.level)] ??
      0,
    fouAtk: scenario.explicitOverrides.fouAtk ?? scenario.attacker.fouAtk,
    craftEssenceId: scenario.craftEssence?.craftEssenceId ?? null,
    craftEssenceAtk:
      scenario.explicitOverrides.craftEssenceAtk ??
      (craftEssence && scenario.craftEssence
        ? deriveCraftEssenceAtk(
            craftEssence,
            scenario.craftEssence.level,
            scenario.craftEssence.limitBreak,
          )
        : 0),
    npLevel: scenario.attacker.npLevel,
    overcharge: scenario.overcharge,
    npMultipliers: deriveNpMultipliers(damage, scenario.overcharge),
    damageFunction: { status: 'resolved', kind: damage.kind, ignoreDefense: false },
    cardType: noblePhantasm.card,
    classAttackRate: scenario.explicitOverrides.classAttackRate ?? classAttackRate(servant.classId),
    classAffinity: scenario.assumptions.classAffinity,
    attributeAffinity: scenario.assumptions.attributeAffinity,
    attackBuff: 0,
    defenseBuff: 0,
    cardBuff: 0,
    cardResistance: 0,
    npDamageBuff: 0,
    npResistance: 0,
    powerMod: 0,
    eventDamageBuff: 0,
    npSpecialMultipliers: [1, 1, 1, 1, 1],
    specialDamageBuff: 0,
    specialResistance: 0,
    flatDamage: 0,
    damageCut: 0,
    ignoreDamageCut: false,
    fieldTraits: [],
    attackerStateTraits: [],
    attackerHpPermille: scenario.attackerHpPermille,
    targetRarity: null,
    targetStateTraits: [],
    battlePointPhase: scenario.battleState.battlePointPhase,
    target: { classId: scenario.target.classId, attribute: scenario.target.attribute, traits: [] },
  };
}

export function resolveScenario(
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
): ResolvedCalculationInput {
  if (scenario.mode === 'manual')
    return {
      input: scenario.manual,
      precision: 'exact',
      evidenceKeys: ['input:manual-final-modifiers'],
      warnings: [],
      trace: [{ step: 'input-mode', detail: 'manual_final_values' }],
      effects: [],
    };
  const baseInput = resolvedScenarioBaseInput(scenario, master);
  const execution = executeOrderedScenario(baseInput, scenario, master);
  const warnings = execution.issues.map((issue) => {
    if (issue.kind === 'contradictoryWorldFacts')
      return `${issue.kind}:${issue.decisionKeys.join(',')}`;
    if (issue.kind === 'exclusiveWorldFactConflict')
      return `${issue.kind}:${issue.scope}:${issue.group}:${issue.traits.join(',')}:${issue.decisionKeys.join(',')}`;
    if (issue.kind === 'conditionDecisionConflict')
      return `${issue.kind}:${issue.decisionKeys.join(',')}:${issue.conflicts
        .map((conflict) =>
          conflict.kind === 'exclusiveTrait'
            ? `${conflict.kind}:${conflict.scope}:${conflict.group}:${conflict.traits.join(',')}`
            : conflict.kind === 'traitPolarity'
              ? `${conflict.kind}:${conflict.scope}:${conflict.trait}`
              : `${conflict.kind}:${conflict.quantity}:${conflict.values.join(',')}`,
        )
        .join('|')}`;
    if (issue.kind === 'unsupportedParameter')
      return `${issue.kind}:${issue.operationId}:${issue.parameter}`;
    return `${issue.kind}:${issue.operationId}:${issue.detail}`;
  });
  const decisionTrace = scenario.effectDecisions.map((decision) => ({
    step: 'user-decision',
    detail: `${decision.decisionKey}:operation:${String(decision.operationEnabled)}:condition:${decision.conditionSatisfaction}`,
  }));
  const worldFactTrace = scenario.worldFactAssertions.map((assertion) => ({
    step: 'world-fact',
    detail:
      assertion.fact.kind === 'trait'
        ? `${assertion.decisionKey}:trait:${assertion.fact.scope}:${assertion.fact.trait}:${String(assertion.fact.present)}`
        : `${assertion.decisionKey}:quantity:${assertion.fact.quantity}:${String(assertion.fact.value)}`,
  }));
  return {
    input: execution.input,
    precision: execution.precision,
    evidenceKeys: [
      'master:normalized-v7',
      ...execution.projections.flatMap((projection) =>
        projection.outcome === 'applied' &&
        projection.modifier &&
        projection.modifier !== 'npSpecial'
          ? [`effect-operation:${projection.modifier}`]
          : [],
      ),
    ],
    warnings,
    effects: [...execution.projections],
    trace: [
      ...decisionTrace,
      ...worldFactTrace,
      ...execution.operations.map((operation) => ({
        step: `${operation.operation.phase}:${operation.operation.kind}`,
        detail: `${operation.operation.order}:${operation.operation.operationId}:${operation.outcome}`,
      })),
    ],
  };
}

function evaluateResolvedCalculation(
  scenario: CalculationScenario,
  scenarioInput: DamageResolutionInput,
  resolved: ResolvedCalculationInput,
  versions: VersionContext,
): CalculationExecution {
  const calculation = calculateDamageResolution(resolved.input, versions);
  const evidence = evaluateCalculationEvidence([
    ...calculation.evidence.map((entry) => entry.key),
    ...resolved.evidenceKeys,
  ]);
  const effects = resolved.effects.map((effect) => ({
    projectionKey: effect.projectionKey,
    outcome: effect.outcome,
    explanationCode: effect.explanation.code,
  }));
  const resolutionIssues = resolved.warnings.map((warning) => ({ code: warning, detail: warning }));
  const result: CalculationResult =
    calculation.status === 'unsupported' ||
    resolved.precision === 'unsupported' ||
    evidence.status === 'unsupported'
      ? {
          status: 'unsupported',
          rows: [],
          effects,
          assumptions: calculation.assumptions,
          issues: [...calculation.issues, ...resolutionIssues],
          trace: [...calculation.trace, ...resolved.trace],
          missingEvidence: [
            ...(calculation.status === 'unsupported' ? calculation.missingEvidence : []),
            ...resolved.warnings,
            ...(evidence.status === 'unsupported' ? evidence.missingEvidence : []),
          ],
          versions,
          evidence: evidence.evidence,
        }
      : {
          ...calculation,
          effects,
          precision: evidence.precision,
          evidence: evidence.evidence,
          issues: [...calculation.issues, ...resolutionIssues],
          trace: [...calculation.trace, ...resolved.trace],
        };
  return {
    scenario,
    scenarioInput,
    input: resolved.input,
    effects: resolved.effects,
    effectWarnings: resolved.warnings,
    result,
  };
}

export function calculateScenario(
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
  versions: VersionContext,
): CalculationExecution {
  const scenarioInput =
    scenario.mode === 'manual' ? scenario.manual : resolvedScenarioBaseInput(scenario, master);
  return evaluateResolvedCalculation(
    scenario,
    scenarioInput,
    resolveScenario(scenario, master),
    versions,
  );
}
