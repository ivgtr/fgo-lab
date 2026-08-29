import {
  collectActivationRequirementOwners,
  executeOrderedScenario,
  prepareOrderedScenario,
  resolveAttackerFormExecution,
  type ActivationRequirementOwner,
  type AppliedPreparationAction,
  type DamageContributionProjection,
  type EffectProjection,
  type OrderedScenarioExecution,
  type PreparedOrderedScenario,
  type ResolvedCanonicalInputSet,
} from '@fgo-lab/battle-execution';
import {
  classAttackRate,
  resolveAttributeAffinity,
  resolveClassAffinity,
  servantAttribute,
} from '@fgo-lab/calc-core';
import { createDefaultTargetContext } from './targetContext';
import {
  deriveCraftEssenceAtk,
  deriveNpMultipliers,
  findNoblePhantasmVariant,
  naturalServantLevel,
  type MasterDataSnapshot,
  type ServantMaster,
  type CanonicalInputDefinition,
  type NoblePhantasmVariant,
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
import {
  createEffectInputViewModels,
  resolveCanonicalInputValues,
  type EffectInputViewModel,
} from './canonicalInputs';
import { createEffectControlViewModels, type EffectControlViewModel } from './effectControls';
import {
  defaultCalculatorPreNoblePhantasmCandidate,
  defaultPreNoblePhantasmCandidate,
} from './preNoblePhantasmPlanner';

export interface ResolvedCalculationInput {
  noblePhantasmVariant: NoblePhantasmVariant | null;
  input: DamageResolutionInput;
  precision: 'exact' | 'approximate' | 'inputRequired' | 'unsupported';
  evidenceKeys: string[];
  warnings: string[];
  trace: { step: string; detail: string }[];
  effects: EffectProjection[];
  requiredInputs: Extract<CalculationResult, { status: 'inputRequired' }>['requiredInputs'];
  inputDefinitions: CanonicalInputDefinition[];
  activationRequirements: ActivationRequirementOwner[];
  appliedPreparationActions: readonly AppliedPreparationAction[];
  targetStateTraitsAtDamage: readonly string[];
  intrinsicTargetStateTraitsAtDamage: readonly string[];
}

export interface CalculationExecution {
  noblePhantasmVariant: NoblePhantasmVariant | null;
  scenario: CalculationScenario;
  scenarioInput: DamageResolutionInput;
  input: DamageResolutionInput;
  effects: EffectProjection[];
  effectWarnings: string[];
  result: CalculationResult;
  inputDefinitions: CanonicalInputDefinition[];
  effectInputs: EffectInputViewModel[];
  effectControls: EffectControlViewModel[];
  activationRequirements: ActivationRequirementOwner[];
  appliedPreparationActions: readonly AppliedPreparationAction[];
}

type ResolvedCalculationScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

export function createDefaultResolvedScenario(
  master: MasterDataSnapshot,
  build: ServantBuild | undefined,
  servant: ServantMaster = master.servants[0]!,
): ResolvedCalculationScenario {
  const candidate = defaultPreNoblePhantasmCandidate(servant);
  const initialFormId = candidate.terminalState.initialFormId;
  const noblePhantasm = candidate.terminalState.selectedNoblePhantasmVariant
    ? findNoblePhantasmVariant(servant, candidate.terminalState.selectedNoblePhantasmVariant)
    : undefined;
  if (noblePhantasm?.kind !== 'attack') throw new TypeError(`attack_np_missing:${servant.id}`);
  const damage = noblePhantasm.damage[0];
  if (!damage) throw new TypeError(`attack_np_damage_missing:${servant.id}`);
  return {
    mode: 'resolved',
    attacker: {
      servantId: servant.id,
      initialActorFormId: initialFormId,
      source: build?.npLevel ? 'owned' : 'master',
      level: build?.level ?? naturalServantLevel(servant.rarity),
      npLevel: Math.max(1, build?.npLevel ?? 1),
      fouAtk: build?.fouAtk ?? 1000,
    },
    overcharge: 1,
    targetContext: createDefaultTargetContext(servant.classId),
    attackerHpPermille: 1_000,
    battleState: { battlePointPhase: 0 },
    canonicalInputValues: {},
    craftEssence: null,
    preNoblePhantasmPlan: candidate.commands.map((command) =>
      command.kind === 'useSkillSlot'
        ? {
            ...command,
            skillLevel: build?.npLevel ? (build.skills[String(command.slot)] ?? 1) : 10,
          }
        : command,
    ),
    mysticCode: null,
    support: null,
    effectDecisions: [],
    activationFacts: [],
    worldFactAssertions: [],
    explicitOverrides: {},
  };
}

const calculatorContributionModifiers = new Set([
  'attackBuff',
  'cardBuff',
  'npDamageBuff',
  'powerMod',
  'flatDamage',
  'defenseBuff',
  'cardResistance',
  'npResistance',
  'npSpecial',
  'ignoreDefense',
  'ignoreDamageCut',
]);

export function excludeDefaultAttackerSkillContributions(
  scenario: ResolvedCalculationScenario,
  master: MasterDataSnapshot,
): ResolvedCalculationScenario {
  const prepared = prepareCalculationScenario(scenario, master);
  const structuralDecisionKeys = new Set(
    prepared.resolved.effects.flatMap((effect) =>
      effect.source.origin === 'attacker' &&
      effect.gameActivation === 'skillUse' &&
      effect.modifier === 'npVariantSelection' &&
      effect.decision.state !== 'none'
        ? [effect.decision.decisionKey]
        : [],
    ),
  );
  const disabled = new Map(
    prepared.resolved.effects.flatMap((effect) =>
      effect.source.origin === 'attacker' &&
      effect.gameActivation === 'skillUse' &&
      effect.modifier !== null &&
      calculatorContributionModifiers.has(effect.modifier) &&
      !structuralDecisionKeys.has(
        effect.decision.state === 'none' ? '' : effect.decision.decisionKey,
      ) &&
      effect.decision.state !== 'none' &&
      effect.decision.kind === 'effect'
        ? [
            [
              effect.decision.decisionKey,
              {
                decisionKey: effect.decision.decisionKey,
                operationEnabled: false,
                conditionSatisfaction: 'evaluate' as const,
              },
            ] as const,
          ]
        : [],
    ),
  );
  return {
    ...scenario,
    effectDecisions: [
      ...scenario.effectDecisions.filter(({ decisionKey }) => !disabled.has(decisionKey)),
      ...disabled.values(),
    ],
  };
}

export function createDefaultCalculatorScenario(
  master: MasterDataSnapshot,
  build: ServantBuild | undefined,
  servant: ServantMaster = master.servants[0]!,
): ResolvedCalculationScenario {
  const candidate = defaultCalculatorPreNoblePhantasmCandidate(servant);
  const scenario = createDefaultResolvedScenario(master, build, servant);
  return excludeDefaultAttackerSkillContributions(
    {
      ...scenario,
      attacker: { ...scenario.attacker, initialActorFormId: candidate.terminalState.initialFormId },
      preNoblePhantasmPlan: candidate.commands.map((command) =>
        command.kind === 'useSkillSlot'
          ? {
              ...command,
              skillLevel: build?.npLevel ? (build.skills[String(command.slot)] ?? 1) : 10,
            }
          : command,
      ),
    },
    master,
  );
}

function resolvedScenarioBaseInput(
  scenario: ResolvedCalculationScenario,
  master: MasterDataSnapshot,
): DamageResolutionInput {
  const servant = master.servants.find((candidate) => candidate.id === scenario.attacker.servantId);
  if (!servant) throw new TypeError(`scenario_attacker_missing:${scenario.attacker.servantId}`);
  const formExecution = resolveAttackerFormExecution(scenario, servant);
  if (formExecution.issues.length > 0) throw new TypeError('preparation_plan_invalid');
  const noblePhantasm = formExecution.state.selectedNoblePhantasmVariant
    ? findNoblePhantasmVariant(servant, formExecution.state.selectedNoblePhantasmVariant)
    : undefined;
  if (noblePhantasm?.kind !== 'attack') throw new TypeError(`attack_np_missing:${servant.id}`);
  const damage = noblePhantasm.damage[0];
  if (!damage) throw new TypeError(`attack_np_damage_missing:${servant.id}`);
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
    classAffinity: resolveClassAffinity(servant.classId, scenario.targetContext.class),
    attributeAffinity: resolveAttributeAffinity(
      servantAttribute(servant.traits),
      scenario.targetContext.attribute,
    ),
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
    target: {
      classId:
        scenario.targetContext.class.kind === 'concrete'
          ? scenario.targetContext.class.classId
          : null,
      attribute:
        scenario.targetContext.attribute.kind === 'concrete'
          ? scenario.targetContext.attribute.attribute
          : 'unknown',
      traits: [],
    },
  };
}

function resolvePreparedOrderedScenario(
  scenario: ResolvedCalculationScenario,
  prepared: PreparedOrderedScenario,
  canonicalInputs: ResolvedCanonicalInputSet,
  execution: OrderedScenarioExecution,
): ResolvedCalculationInput {
  const damageState = execution.operations.find(
    ({ operation, outcome }) => operation.kind === 'executeNpDamage' && outcome === 'applied',
  )?.state;
  const intrinsicTargetState = new Set<string>();
  for (const result of execution.operations) {
    if (result.operation.kind === 'executeNpDamage') break;
    if (
      result.outcome !== 'applied' ||
      result.operation.source.origin !== 'np' ||
      result.operation.phase !== 'beforeNpDamage' ||
      (result.operation.kind !== 'addTrait' && result.operation.kind !== 'removeTrait') ||
      result.operation.scope !== 'targetState'
    )
      continue;
    if (result.operation.kind === 'addTrait') intrinsicTargetState.add(result.operation.trait);
    else intrinsicTargetState.delete(result.operation.trait);
  }
  const warnings = execution.issues.map((issue) => {
    if (issue.kind === 'invalidTargetContext')
      return `${issue.kind}:${issue.detail}:${issue.sourceKeys.join(',')}`;
    if (issue.kind === 'invalidCanonicalInput')
      return `${issue.kind}:${issue.inputKey}:${issue.detail}`;
    if (issue.kind === 'constraintValidationUnsupported')
      return `${issue.kind}:${issue.sourceKeys.join(',')}:${issue.reason}`;
    if (issue.kind === 'constraintConflict')
      return `${issue.kind}:${issue.sourceKeys.join(',')}:${issue.conflicts
        .map((conflict) => {
          if (conflict.kind === 'exclusiveTrait')
            return `${conflict.kind}:${conflict.scope}:${conflict.group}:${conflict.traits.join(',')}`;
          if (conflict.kind === 'traitPolarity')
            return `${conflict.kind}:${conflict.scope}:${conflict.trait}`;
          if (conflict.kind === 'quantityEquality')
            return `${conflict.kind}:${conflict.quantity}:${conflict.values.join(',')}`;
          if (conflict.kind === 'quantityRange')
            return `${conflict.kind}:${conflict.quantity}:${conflict.ranges
              .map((range) => `${String(range.min)}-${String(range.max)}`)
              .join(',')}`;
          if (conflict.kind === 'cardMismatch')
            return `${conflict.kind}:${conflict.cards.join(',')}`;
          return conflict.kind;
        })
        .join('|')}`;
    if (issue.kind === 'unsupportedParameter')
      return `${issue.kind}:${issue.operationId}:${issue.parameter}`;
    if (issue.kind === 'invalidActivationContext')
      return `${issue.kind}:${issue.factKey ?? 'missing'}:${issue.detail}`;
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
  const activationTrace = scenario.activationFacts.map((fact) => ({
    step: 'activation-fact',
    detail:
      fact.kind === 'choice'
        ? `${fact.source.sourceInstanceId}:choice:${fact.family}:${fact.candidate}`
        : fact.kind === 'operationTrigger'
          ? `${fact.source.sourceInstanceId}:operation-trigger:${String(fact.position)}`
          : `${fact.source.sourceInstanceId}:source-quantity:${fact.quantity}:${fact.subjectId}:${fact.comparison}:${String(fact.value)}`,
  }));
  const canonicalInputTrace = Object.entries(canonicalInputs.values).map(([key, value]) => ({
    step: 'canonical-input',
    detail: `${key}:${String(value)}:${scenario.canonicalInputValues[key] ? 'explicit' : 'default'}`,
  }));
  return {
    noblePhantasmVariant: execution.state.noblePhantasmVariant,
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
    requiredInputs: [...execution.requiredInputs],
    inputDefinitions: [...execution.inputDefinitions],
    activationRequirements: collectActivationRequirementOwners(prepared.operations),
    appliedPreparationActions: prepared.appliedPreparationActions,
    targetStateTraitsAtDamage: damageState
      ? [...damageState.traits.targetState.entries()].flatMap(([trait, present]) =>
          present ? [trait] : [],
        )
      : [],
    intrinsicTargetStateTraitsAtDamage: [...intrinsicTargetState].sort(),
    trace: [
      ...decisionTrace,
      ...activationTrace,
      ...worldFactTrace,
      ...canonicalInputTrace,
      ...execution.operations.map((operation) => ({
        step: `${operation.operation.phase}:${operation.operation.kind}`,
        detail: `${operation.operation.order}:${operation.operation.operationId}:${operation.outcome}`,
      })),
    ],
  };
}

function manualResolvedInput(
  scenario: Extract<CalculationScenario, { mode: 'manual' }>,
): ResolvedCalculationInput {
  return {
    input: scenario.manual,
    precision: 'exact',
    evidenceKeys: ['input:manual-final-modifiers'],
    warnings: [],
    trace: [{ step: 'input-mode', detail: 'manual_final_values' }],
    effects: [],
    requiredInputs: [],
    inputDefinitions: [],
    activationRequirements: [],
    appliedPreparationActions: [],
    targetStateTraitsAtDamage: scenario.manual.targetStateTraits,
    intrinsicTargetStateTraitsAtDamage: [],
    noblePhantasmVariant: null,
  };
}

export function resolveScenario(
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
): ResolvedCalculationInput {
  if (scenario.mode === 'manual') return manualResolvedInput(scenario);
  const baseInput = resolvedScenarioBaseInput(scenario, master);
  const prepared = prepareOrderedScenario(baseInput, scenario, master);
  const canonicalInputs = resolveCanonicalInputValues(
    prepared.inputDefinitions,
    scenario.canonicalInputValues,
  );
  return resolvePreparedOrderedScenario(
    scenario,
    prepared,
    canonicalInputs,
    executeOrderedScenario(prepared, canonicalInputs),
  );
}

function resolvedCalculationResult(
  resolved: ResolvedCalculationInput,
  versions: VersionContext,
  cachedCalculation?: ReturnType<typeof calculateDamageResolution>,
): CalculationResult {
  const calculation = cachedCalculation ?? calculateDamageResolution(resolved.input, versions);
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
  return resolved.precision === 'inputRequired'
    ? {
        status: 'inputRequired',
        rows: [],
        requiredInputs: resolved.requiredInputs,
        effects,
        assumptions: calculation.assumptions,
        issues: [...calculation.issues, ...resolutionIssues],
        trace: [...calculation.trace, ...resolved.trace],
        versions,
        evidence: evidence.evidence,
      }
    : calculation.status === 'unsupported' ||
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
}

function evaluateResolvedCalculation(
  scenario: CalculationScenario,
  scenarioInput: DamageResolutionInput,
  resolved: ResolvedCalculationInput,
  versions: VersionContext,
  cachedCalculation?: ReturnType<typeof calculateDamageResolution>,
): CalculationExecution {
  const result = resolvedCalculationResult(resolved, versions, cachedCalculation);
  const effectInputs =
    scenario.mode === 'resolved'
      ? createEffectInputViewModels({
          definitions: resolved.inputDefinitions,
          effects: resolved.effects,
          requiredInputs: resolved.requiredInputs,
          explicitValues: scenario.canonicalInputValues,
        })
      : [];
  return {
    noblePhantasmVariant: resolved.noblePhantasmVariant,
    scenario,
    scenarioInput,
    input: resolved.input,
    effects: resolved.effects,
    effectWarnings: resolved.warnings,
    result,
    inputDefinitions: resolved.inputDefinitions,
    effectInputs,
    effectControls: createEffectControlViewModels(
      resolved.effects,
      Object.fromEntries(
        effectInputs.flatMap((input) => (input.value === null ? [] : [[input.key, input.value]])),
      ),
    ),
    activationRequirements: resolved.activationRequirements,
    appliedPreparationActions: resolved.appliedPreparationActions,
  };
}

export interface PreparedCalculationScenario {
  scenario: CalculationScenario;
  scenarioInput: DamageResolutionInput;
  resolved: ResolvedCalculationInput;
  orderedScenario: PreparedOrderedScenario | null;
  canonicalInputs: ResolvedCanonicalInputSet | null;
  contributionProjection: DamageContributionProjection | null;
}

export interface PreparedCalculationProjection {
  scenario: CalculationScenario;
  inputDefinitions: CanonicalInputDefinition[];
  effects: EffectProjection[];
  effectInputs: EffectInputViewModel[];
  effectControls: EffectControlViewModel[];
  activationRequirements: ActivationRequirementOwner[];
  appliedPreparationActions: readonly AppliedPreparationAction[];
}

export function projectPreparedCalculationScenario(
  prepared: PreparedCalculationScenario,
): PreparedCalculationProjection {
  const { scenario, resolved } = prepared;
  const effectInputs =
    scenario.mode === 'resolved'
      ? createEffectInputViewModels({
          definitions: resolved.inputDefinitions,
          effects: resolved.effects,
          requiredInputs: resolved.requiredInputs,
          explicitValues: scenario.canonicalInputValues,
        })
      : [];
  return {
    scenario,
    inputDefinitions: resolved.inputDefinitions,
    effects: resolved.effects,
    effectInputs,
    effectControls: createEffectControlViewModels(
      resolved.effects,
      Object.fromEntries(
        effectInputs.flatMap((input) => (input.value === null ? [] : [[input.key, input.value]])),
      ),
    ),
    activationRequirements: resolved.activationRequirements,
    appliedPreparationActions: resolved.appliedPreparationActions,
  };
}

export function prepareCalculationScenario(
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
): PreparedCalculationScenario {
  return prepareCalculationScenarioWithContributionProjection(scenario, master, null);
}

export function prepareCalculationScenarioWithContributionProjection(
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
  contributionProjection: DamageContributionProjection | null,
): PreparedCalculationScenario {
  if (scenario.mode === 'manual')
    return {
      scenario,
      scenarioInput: scenario.manual,
      resolved: manualResolvedInput(scenario),
      orderedScenario: null,
      canonicalInputs: null,
      contributionProjection,
    };
  const scenarioInput = resolvedScenarioBaseInput(scenario, master);
  const orderedScenario = prepareOrderedScenario(scenarioInput, scenario, master);
  const canonicalInputs = resolveCanonicalInputValues(
    orderedScenario.inputDefinitions,
    scenario.canonicalInputValues,
  );
  return {
    scenario,
    scenarioInput,
    resolved: resolvePreparedOrderedScenario(
      scenario,
      orderedScenario,
      canonicalInputs,
      executeOrderedScenario(orderedScenario, canonicalInputs, contributionProjection ?? undefined),
    ),
    orderedScenario,
    canonicalInputs,
    contributionProjection,
  };
}

export function rematerializePreparedCalculationInputs(
  prepared: PreparedCalculationScenario,
  scenario: CalculationScenario,
): PreparedCalculationScenario {
  if (
    prepared.scenario.mode === 'manual' ||
    scenario.mode === 'manual' ||
    !prepared.orderedScenario
  )
    throw new TypeError('prepared_resolved_scenario_required');
  const orderedScenario: PreparedOrderedScenario = {
    ...prepared.orderedScenario,
    scenario,
  };
  const canonicalInputs = resolveCanonicalInputValues(
    orderedScenario.inputDefinitions,
    scenario.canonicalInputValues,
  );
  const inputsUnchanged =
    prepared.canonicalInputs !== null &&
    Object.keys(canonicalInputs.values).length ===
      Object.keys(prepared.canonicalInputs.values).length &&
    Object.entries(canonicalInputs.values).every(
      ([key, value]) => prepared.canonicalInputs?.values[key] === value,
    );
  if (inputsUnchanged)
    return {
      ...prepared,
      scenario,
      orderedScenario,
      canonicalInputs,
      resolved: {
        ...prepared.resolved,
        trace: prepared.resolved.trace.map((item) => {
          if (item.step !== 'canonical-input') return item;
          const separator = item.detail.lastIndexOf(':');
          const prefix = separator < 0 ? item.detail : item.detail.slice(0, separator);
          const keySeparator = prefix.lastIndexOf(':');
          const key = keySeparator < 0 ? prefix : prefix.slice(0, keySeparator);
          return {
            ...item,
            detail: `${prefix}:${scenario.canonicalInputValues[key] ? 'explicit' : 'default'}`,
          };
        }),
      },
    };
  return {
    scenario,
    scenarioInput: prepared.scenarioInput,
    orderedScenario,
    canonicalInputs,
    resolved: resolvePreparedOrderedScenario(
      scenario,
      orderedScenario,
      canonicalInputs,
      executeOrderedScenario(
        orderedScenario,
        canonicalInputs,
        prepared.contributionProjection ?? undefined,
      ),
    ),
    contributionProjection: prepared.contributionProjection,
  };
}

function sameContributionProjection(
  left: DamageContributionProjection | null,
  right: DamageContributionProjection,
): boolean {
  if (
    !left ||
    left.includedOperationIds.size !== right.includedOperationIds.size ||
    left.excludedOperationIds.size !== right.excludedOperationIds.size ||
    left.excludedStateTraitContributions.attackerState.size !==
      right.excludedStateTraitContributions.attackerState.size ||
    left.excludedStateTraitContributions.targetState.size !==
      right.excludedStateTraitContributions.targetState.size
  )
    return false;
  return (
    [...left.includedOperationIds].every((operationId) =>
      right.includedOperationIds.has(operationId),
    ) &&
    [...left.excludedOperationIds].every((operationId) =>
      right.excludedOperationIds.has(operationId),
    ) &&
    [...left.excludedStateTraitContributions.attackerState].every((trait) =>
      right.excludedStateTraitContributions.attackerState.has(trait),
    ) &&
    [...left.excludedStateTraitContributions.targetState].every((trait) =>
      right.excludedStateTraitContributions.targetState.has(trait),
    )
  );
}

export function projectPreparedCalculationContribution(
  prepared: PreparedCalculationScenario,
  projection: DamageContributionProjection,
): PreparedCalculationScenario {
  if (prepared.scenario.mode === 'manual' || !prepared.orderedScenario || !prepared.canonicalInputs)
    return prepared;
  if (sameContributionProjection(prepared.contributionProjection, projection)) return prepared;
  return {
    ...prepared,
    resolved: resolvePreparedOrderedScenario(
      prepared.scenario,
      prepared.orderedScenario,
      prepared.canonicalInputs,
      executeOrderedScenario(prepared.orderedScenario, prepared.canonicalInputs, projection),
    ),
    contributionProjection: projection,
  };
}

export function evaluatePreparedCalculationScenario(
  prepared: PreparedCalculationScenario,
  versions: VersionContext,
  cachedCalculation?: ReturnType<typeof calculateDamageResolution>,
): CalculationExecution {
  return evaluateResolvedCalculation(
    prepared.scenario,
    prepared.scenarioInput,
    prepared.resolved,
    versions,
    cachedCalculation,
  );
}

export function evaluatePreparedCalculationResult(
  prepared: PreparedCalculationScenario,
  versions: VersionContext,
  cachedCalculation?: ReturnType<typeof calculateDamageResolution>,
): CalculationResult {
  return resolvedCalculationResult(prepared.resolved, versions, cachedCalculation);
}

export function calculateScenario(
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
  versions: VersionContext,
): CalculationExecution {
  return evaluatePreparedCalculationScenario(
    prepareCalculationScenario(scenario, master),
    versions,
  );
}

export function calculateScenarioWithContributionProjection(
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
  versions: VersionContext,
  contributionProjection: DamageContributionProjection,
): CalculationExecution {
  return evaluatePreparedCalculationScenario(
    projectPreparedCalculationContribution(
      prepareCalculationScenario(scenario, master),
      contributionProjection,
    ),
    versions,
  );
}
