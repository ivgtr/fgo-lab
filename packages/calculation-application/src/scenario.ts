import {
  collectActivationRequirementOwners,
  executeOrderedScenario,
  prepareOrderedScenario,
  resolveAttackerFormExecution,
  type ActivationRequirementOwner,
  type AppliedPreparationAction,
  type ContributionApplicationPolicy,
  type EffectProjection,
  type EffectiveContributionSet,
  type OrderedScenarioExecution,
  type PreparedOrderedScenario,
  type PreparationFailureCode,
  type ResolvedAttackerFormExecution,
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
  type ActorFormId,
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

interface ResolvedCalculationInputCommon {
  noblePhantasmVariant: NoblePhantasmVariant | null;
  terminalActorFormId: ActorFormId | null;
  precision: 'exact' | 'approximate' | 'inputRequired' | 'invalid' | 'unsupported';
  evidenceKeys: string[];
  warnings: string[];
  trace: { step: string; detail: string }[];
  effects: EffectProjection[];
  effectiveContributions: EffectiveContributionSet;
  requiredInputs: Extract<CalculationResult, { status: 'inputRequired' }>['requiredInputs'];
  inputDefinitions: CanonicalInputDefinition[];
  activationRequirements: ActivationRequirementOwner[];
  appliedPreparationActions: readonly AppliedPreparationAction[];
  targetStateTraitsAtDamage: readonly string[];
}

export type ResolvedCalculationInput =
  | (ResolvedCalculationInputCommon & {
      status: 'executable';
      input: DamageResolutionInput;
      preparationRejection: null;
    })
  | (ResolvedCalculationInputCommon & {
      status: 'rejected';
      preparationRejection: {
        code: PreparationFailureCode;
        operationId: string;
      };
    })
  | (ResolvedCalculationInputCommon & {
      status: 'invalid';
      issue: AttackerLevelStatUnavailableIssue;
      preparationRejection: null;
    });

export interface AttackerLevelStatUnavailableIssue {
  kind: 'attackerLevelStatUnavailable';
  servantId: string;
  level: number;
}

export type CalculationApplicationResult =
  | CalculationResult
  | {
      status: 'invalid';
      issue: AttackerLevelStatUnavailableIssue;
      issues: { code: string; detail: string }[];
    };

interface CalculationExecutionCommon {
  noblePhantasmVariant: NoblePhantasmVariant | null;
  terminalActorFormId: ActorFormId | null;
  scenario: CalculationScenario;
  effects: EffectProjection[];
  effectiveContributions: EffectiveContributionSet;
  effectWarnings: string[];
  inputDefinitions: CanonicalInputDefinition[];
  effectInputs: EffectInputViewModel[];
  effectControls: EffectControlViewModel[];
  activationRequirements: ActivationRequirementOwner[];
  appliedPreparationActions: readonly AppliedPreparationAction[];
}

export type CalculationExecution =
  | (CalculationExecutionCommon & {
      status: 'executable';
      result: CalculationResult;
      scenarioInput: DamageResolutionInput;
      input: DamageResolutionInput;
    })
  | (CalculationExecutionCommon & {
      status: 'rejected';
      result: CalculationResult;
    })
  | (CalculationExecutionCommon & {
      status: 'invalid';
      result: Extract<CalculationApplicationResult, { status: 'invalid' }>;
    });

export function requireExecutableCalculation(
  execution: CalculationExecution,
): Extract<CalculationExecution, { status: 'executable' }> {
  if (execution.status !== 'executable')
    throw new TypeError(
      `calculation_execution_rejected:${execution.result.issues.map(({ code }) => code).join(',')}`,
    );
  return execution;
}

type ResolvedCalculationScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

export function createDefaultResolvedScenario(
  master: MasterDataSnapshot,
  build: ServantBuild | undefined,
  servant: ServantMaster = master.servants[0]!,
): ResolvedCalculationScenario {
  const npLevel = Math.max(1, build?.npLevel ?? 1) as 1 | 2 | 3 | 4 | 5;
  const candidate = defaultPreNoblePhantasmCandidate(servant, master.npResourceSemantics, npLevel);
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
      npLevel,
      fouAtk: build?.fouAtk ?? 1000,
    },
    initialOvercharge: 1,
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
  const npLevel = Math.max(1, build?.npLevel ?? 1) as 1 | 2 | 3 | 4 | 5;
  const candidate = defaultCalculatorPreNoblePhantasmCandidate(
    servant,
    master.npResourceSemantics,
    npLevel,
  );
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

export type ScenarioPreparationOutcome =
  | {
      status: 'executable';
      input: DamageResolutionInput;
      formExecution: ResolvedAttackerFormExecution;
    }
  | {
      status: 'rejected';
      rejection: NonNullable<ResolvedCalculationInput['preparationRejection']>;
      requiredInputs: readonly (CanonicalInputDefinition & { effectOccurrenceIds: string[] })[];
      appliedPreparationActions: readonly AppliedPreparationAction[];
    }
  | {
      status: 'invalid';
      issue: AttackerLevelStatUnavailableIssue;
    };

export interface CalculationPreparationOptions {
  initialNpGauge?: number;
}

function damageResolutionInputForNoblePhantasm(
  scenario: ResolvedCalculationScenario,
  servant: ServantMaster,
  noblePhantasm: Extract<NoblePhantasmVariant, { kind: 'attack' }>,
  master: MasterDataSnapshot,
  attackerAtk: number,
  effectiveOvercharge: number,
): DamageResolutionInput {
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
    attackerAtk,
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
    overcharge: effectiveOvercharge,
    npMultipliers: deriveNpMultipliers(damage, effectiveOvercharge),
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

export function resolveScenarioPreparationOutcome(
  scenario: ResolvedCalculationScenario,
  master: MasterDataSnapshot,
  preparation: CalculationPreparationOptions = {},
  policy: ContributionApplicationPolicy = { kind: 'calculator' },
): ScenarioPreparationOutcome {
  const servant = master.servants.find((candidate) => candidate.id === scenario.attacker.servantId);
  if (!servant) throw new TypeError(`scenario_attacker_missing:${scenario.attacker.servantId}`);
  const canonicalAttackerAtk = servant.atkByLevel[String(scenario.attacker.level)];
  if (canonicalAttackerAtk === undefined)
    return {
      status: 'invalid',
      issue: {
        kind: 'attackerLevelStatUnavailable',
        servantId: servant.id,
        level: scenario.attacker.level,
      },
    };
  const attackerAtk = scenario.explicitOverrides.attackerAtk ?? canonicalAttackerAtk;
  const formExecution = resolveAttackerFormExecution(
    scenario,
    servant,
    master.npResourceSemantics,
    preparation.initialNpGauge,
    { master, policy },
  );
  const selected = formExecution.state.selectedNoblePhantasmVariant
    ? findNoblePhantasmVariant(servant, formExecution.state.selectedNoblePhantasmVariant)
    : undefined;
  if (formExecution.rejection || formExecution.issues.length > 0) {
    const rejection = formExecution.rejection ?? {
      code: 'invalidPreparationActivation' as const,
      operationId: 'preparation:source-collection',
    };
    return {
      status: 'rejected',
      rejection,
      requiredInputs: [...formExecution.requiredInputs],
      appliedPreparationActions: formExecution.actions,
    };
  }
  if (selected?.kind !== 'attack')
    return {
      status: 'rejected',
      rejection: {
        code: 'attackNoblePhantasmUnavailable',
        operationId: `preparation:${servant.id}:terminal`,
      },
      requiredInputs: [],
      appliedPreparationActions: formExecution.actions,
    };
  return {
    status: 'executable',
    input: damageResolutionInputForNoblePhantasm(
      scenario,
      servant,
      selected,
      master,
      attackerAtk,
      formExecution.state.ocState.receipts.at(-1)!.effectiveOc,
    ),
    formExecution,
  };
}

function resolvePreparedOrderedScenario(
  scenario: ResolvedCalculationScenario,
  prepared: PreparedOrderedScenario,
  canonicalInputs: ResolvedCanonicalInputSet,
  execution: OrderedScenarioExecution,
  terminalActorFormId: ActorFormId,
): Extract<ResolvedCalculationInput, { status: 'executable' }> {
  const projections = [...execution.projections, ...execution.retainedProjections];
  const damageState = execution.operations.find(
    ({ operation, outcome }) => operation.kind === 'executeNpDamage' && outcome === 'applied',
  )?.state;
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
    status: 'executable',
    noblePhantasmVariant: execution.state.noblePhantasmVariant,
    terminalActorFormId,
    input: execution.input,
    precision:
      prepared.preparationRequiredInputs.length > 0 ? 'inputRequired' : execution.precision,
    evidenceKeys: [
      'master:normalized-v7',
      ...projections.flatMap((projection) =>
        projection.outcome === 'applied' &&
        projection.modifier &&
        projection.modifier !== 'npSpecial'
          ? [`effect-operation:${projection.modifier}`]
          : [],
      ),
    ],
    warnings,
    effects: projections,
    effectiveContributions: execution.effectiveContributions,
    requiredInputs: [
      ...new Map(
        [...prepared.preparationRequiredInputs, ...execution.requiredInputs].map((definition) => [
          definition.key,
          definition,
        ]),
      ).values(),
    ],
    inputDefinitions: [...execution.inputDefinitions],
    activationRequirements: collectActivationRequirementOwners(prepared.operations),
    appliedPreparationActions: prepared.appliedPreparationActions,
    targetStateTraitsAtDamage: damageState
      ? [...damageState.traits.targetState.entries()].flatMap(([trait, present]) =>
          present ? [trait] : [],
        )
      : [],
    preparationRejection: null,
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
): Extract<ResolvedCalculationInput, { status: 'executable' }> {
  return {
    status: 'executable',
    input: scenario.manual,
    precision: 'exact',
    evidenceKeys: ['input:manual-final-modifiers'],
    warnings: [],
    trace: [{ step: 'input-mode', detail: 'manual_final_values' }],
    effects: [],
    effectiveContributions: { contributions: [], effectivePresentationGroupIds: new Set() },
    requiredInputs: [],
    inputDefinitions: [],
    activationRequirements: [],
    appliedPreparationActions: [],
    targetStateTraitsAtDamage: scenario.manual.targetStateTraits,
    noblePhantasmVariant: null,
    terminalActorFormId: null,
    preparationRejection: null,
  };
}

function rejectedPreparationResolvedInput(
  outcome: Extract<ScenarioPreparationOutcome, { status: 'rejected' }>,
): Extract<ResolvedCalculationInput, { status: 'rejected' }> {
  return {
    status: 'rejected',
    noblePhantasmVariant: null,
    terminalActorFormId: null,
    precision:
      outcome.rejection.code === 'preparationInputRequired' ? 'inputRequired' : 'unsupported',
    evidenceKeys: ['master:normalized-v7'],
    warnings: [],
    trace: [
      {
        step: 'preparation-rejection',
        detail: `${outcome.rejection.operationId}:${outcome.rejection.code}`,
      },
    ],
    effects: [],
    effectiveContributions: { contributions: [], effectivePresentationGroupIds: new Set() },
    requiredInputs: [...outcome.requiredInputs],
    inputDefinitions: [...outcome.requiredInputs],
    activationRequirements: [],
    appliedPreparationActions: outcome.appliedPreparationActions,
    targetStateTraitsAtDamage: [],
    preparationRejection: outcome.rejection,
  };
}

function invalidResolvedInput(
  outcome: Extract<ScenarioPreparationOutcome, { status: 'invalid' }>,
): Extract<ResolvedCalculationInput, { status: 'invalid' }> {
  return {
    status: 'invalid',
    issue: outcome.issue,
    noblePhantasmVariant: null,
    terminalActorFormId: null,
    precision: 'invalid',
    evidenceKeys: ['master:normalized-v7'],
    warnings: [],
    trace: [
      {
        step: 'scenario-invalid',
        detail: `${outcome.issue.kind}:${outcome.issue.servantId}:${String(outcome.issue.level)}`,
      },
    ],
    effects: [],
    effectiveContributions: { contributions: [], effectivePresentationGroupIds: new Set() },
    requiredInputs: [],
    inputDefinitions: [],
    activationRequirements: [],
    appliedPreparationActions: [],
    targetStateTraitsAtDamage: [],
    preparationRejection: null,
  };
}

export function resolveScenario(
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
  preparation: CalculationPreparationOptions = {},
): ResolvedCalculationInput {
  if (scenario.mode === 'manual') return manualResolvedInput(scenario);
  const base = resolveScenarioPreparationOutcome(scenario, master, preparation);
  if (base.status === 'invalid') return invalidResolvedInput(base);
  if (base.status === 'rejected') return rejectedPreparationResolvedInput(base);
  const baseInput = base.input;
  const prepared = prepareOrderedScenario(baseInput, scenario, master, base.formExecution);
  const canonicalInputs = resolveCanonicalInputValues(
    prepared.inputDefinitions,
    scenario.canonicalInputValues,
  );
  return resolvePreparedOrderedScenario(
    scenario,
    prepared,
    canonicalInputs,
    executeOrderedScenario(prepared, canonicalInputs),
    base.formExecution.state.currentFormId,
  );
}

function requiredInputsForResult(inputs: ResolvedCalculationInputCommon['requiredInputs']) {
  return inputs.map(
    ({ key, owner, label, description, minimum, maximum, step, effectOccurrenceIds }) => ({
      key,
      owner,
      label,
      description,
      minimum,
      maximum,
      step,
      effectOccurrenceIds,
    }),
  );
}

function resolvedCalculationResult(
  resolved: ResolvedCalculationInput,
  versions: VersionContext,
  cachedCalculation?: ReturnType<typeof calculateDamageResolution>,
): CalculationApplicationResult {
  if (resolved.status === 'invalid')
    return {
      status: 'invalid',
      issue: resolved.issue,
      issues: [
        {
          code: resolved.issue.kind,
          detail: `${resolved.issue.servantId}:${String(resolved.issue.level)}`,
        },
      ],
    };
  if (resolved.status === 'rejected') {
    const evidence = evaluateCalculationEvidence(resolved.evidenceKeys);
    const issue = {
      code: `preparation:${resolved.preparationRejection.code}`,
      detail: resolved.preparationRejection.operationId,
    };
    const common = {
      rows: [] as [],
      effects: [],
      assumptions: [],
      issues: [issue],
      trace: resolved.trace,
      versions,
      evidence: evidence.evidence,
    };
    return resolved.preparationRejection.code === 'preparationInputRequired'
      ? {
          ...common,
          status: 'inputRequired',
          requiredInputs: requiredInputsForResult(resolved.requiredInputs),
        }
      : {
          ...common,
          status: 'unsupported',
          missingEvidence: [`preparation:${resolved.preparationRejection.code}`],
        };
  }
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
        requiredInputs: requiredInputsForResult(resolved.requiredInputs),
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
  scenarioInput: DamageResolutionInput | null,
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
  const common: CalculationExecutionCommon = {
    noblePhantasmVariant: resolved.noblePhantasmVariant,
    terminalActorFormId: resolved.terminalActorFormId,
    scenario,
    effects: resolved.effects,
    effectiveContributions: resolved.effectiveContributions,
    effectWarnings: resolved.warnings,
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
  if (result.status === 'invalid') return { status: 'invalid', ...common, result };
  if (resolved.status === 'invalid') throw new TypeError('invalid_result_status_mismatch');
  if (resolved.status === 'rejected') return { status: 'rejected', ...common, result };
  if (!scenarioInput) throw new TypeError('damage_resolution_input_required');
  return {
    status: 'executable',
    ...common,
    result,
    scenarioInput,
    input: resolved.input,
  };
}

interface PreparedCalculationScenarioCommon {
  master: MasterDataSnapshot;
  scenario: CalculationScenario;
  contributionPolicy: ContributionApplicationPolicy;
  preparation: CalculationPreparationOptions;
}

export type PreparedCalculationScenario =
  | (PreparedCalculationScenarioCommon & {
      status: 'executable';
      scenarioInput: DamageResolutionInput;
      resolved: Extract<ResolvedCalculationInput, { status: 'executable' }>;
      orderedScenario: PreparedOrderedScenario | null;
      canonicalInputs: ResolvedCanonicalInputSet | null;
    })
  | (PreparedCalculationScenarioCommon & {
      status: 'rejected';
      resolved: Extract<ResolvedCalculationInput, { status: 'rejected' }>;
      orderedScenario: null;
      canonicalInputs: null;
    })
  | (PreparedCalculationScenarioCommon & {
      status: 'invalid';
      resolved: Extract<ResolvedCalculationInput, { status: 'invalid' }>;
      orderedScenario: null;
      canonicalInputs: null;
    });

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
  preparation: CalculationPreparationOptions = {},
): PreparedCalculationScenario {
  return prepareCalculationScenarioWithPolicy(
    scenario,
    master,
    { kind: 'calculator' },
    preparation,
  );
}

export function prepareCalculationScenarioWithPolicy(
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
  contributionPolicy: ContributionApplicationPolicy,
  preparation: CalculationPreparationOptions = {},
): PreparedCalculationScenario {
  if (scenario.mode === 'manual')
    return {
      status: 'executable',
      master,
      scenario,
      scenarioInput: scenario.manual,
      resolved: manualResolvedInput(scenario),
      orderedScenario: null,
      canonicalInputs: null,
      contributionPolicy,
      preparation,
    };
  const base = resolveScenarioPreparationOutcome(scenario, master, preparation, contributionPolicy);
  if (base.status === 'invalid') {
    return {
      status: 'invalid',
      master,
      scenario,
      resolved: invalidResolvedInput(base),
      orderedScenario: null,
      canonicalInputs: null,
      contributionPolicy,
      preparation,
    };
  }
  if (base.status === 'rejected') {
    return {
      status: 'rejected',
      master,
      scenario,
      resolved: rejectedPreparationResolvedInput(base),
      orderedScenario: null,
      canonicalInputs: null,
      contributionPolicy,
      preparation,
    };
  }
  const scenarioInput = base.input;
  const orderedScenario = prepareOrderedScenario(
    scenarioInput,
    scenario,
    master,
    base.formExecution,
  );
  const canonicalInputs = resolveCanonicalInputValues(
    orderedScenario.inputDefinitions,
    scenario.canonicalInputValues,
  );
  return {
    status: 'executable',
    master,
    scenario,
    scenarioInput,
    resolved: resolvePreparedOrderedScenario(
      scenario,
      orderedScenario,
      canonicalInputs,
      executeOrderedScenario(orderedScenario, canonicalInputs, contributionPolicy),
      base.formExecution.state.currentFormId,
    ),
    orderedScenario,
    canonicalInputs,
    contributionPolicy,
    preparation,
  };
}

export function rematerializePreparedCalculationInputs(
  prepared: PreparedCalculationScenario,
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
): PreparedCalculationScenario {
  if (prepared.scenario.mode === 'manual' || scenario.mode === 'manual')
    throw new TypeError('prepared_resolved_scenario_required');
  return prepareCalculationScenarioWithPolicy(
    scenario,
    master,
    prepared.contributionPolicy,
    prepared.preparation,
  );
}

export function reapplyPreparedCalculationPolicy(
  prepared: PreparedCalculationScenario,
  policy: ContributionApplicationPolicy,
): PreparedCalculationScenario {
  if (JSON.stringify(prepared.contributionPolicy) === JSON.stringify(policy)) return prepared;
  return prepareCalculationScenarioWithPolicy(
    prepared.scenario,
    prepared.master,
    policy,
    prepared.preparation,
  );
}

export function evaluatePreparedCalculationScenario(
  prepared: PreparedCalculationScenario,
  versions: VersionContext,
  cachedCalculation?: ReturnType<typeof calculateDamageResolution>,
): CalculationExecution {
  return evaluateResolvedCalculation(
    prepared.scenario,
    prepared.status === 'executable' ? prepared.scenarioInput : null,
    prepared.resolved,
    versions,
    cachedCalculation,
  );
}

export function evaluatePreparedCalculationResult(
  prepared: PreparedCalculationScenario,
  versions: VersionContext,
  cachedCalculation?: ReturnType<typeof calculateDamageResolution>,
): CalculationApplicationResult {
  return resolvedCalculationResult(prepared.resolved, versions, cachedCalculation);
}

export function calculateScenario(
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
  versions: VersionContext,
  preparation: CalculationPreparationOptions = {},
): CalculationExecution {
  return evaluatePreparedCalculationScenario(
    prepareCalculationScenario(scenario, master, preparation),
    versions,
  );
}

export function calculateScenarioWithPolicy(
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
  versions: VersionContext,
  contributionPolicy: ContributionApplicationPolicy,
  preparation: CalculationPreparationOptions = {},
): CalculationExecution {
  return evaluatePreparedCalculationScenario(
    prepareCalculationScenarioWithPolicy(scenario, master, contributionPolicy, preparation),
    versions,
  );
}
