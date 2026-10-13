import {
  resolveScenarioPreparationOutcome,
  prepareRejectedCalculationDiagnostic,
  battlePointWitnesses,
} from './scenarioPreparation';
import {
  resolvePreparedOrderedScenario,
  resolvedCalculationResult,
  resolveAttackProfileContinuity,
  manualResolvedInput,
  rejectedPreparationResolvedInput,
  invalidResolvedInput,
} from './calculationExecutionProjection';
import {
  preparationExecutionStateFor,
  populationLocalActors,
  traitConditionReadScopes,
} from '@fgo-lab/battle-execution';
import { calculatorPreparationSkillLevels } from './rankingBasis';
import type {
  ExecutionPossibilityCertificate,
  StochasticSelection,
  PreparationExecutionSession,
  RejectedPreparationDiagnostic,
  PreparationActionExecution,
} from '@fgo-lab/battle-execution';
import {
  attachBattlePointPreparationObservation,
  carryBattlePointPreparationObservation,
  attachBattlePointPreparationRejectionObservation,
  battlePointPreparationRejectionObservationFor,
  type BattlePointPreparationObservation,
} from './battlePointPreparationObservation';
import type { InitialHpUnavailableIssue } from './initialHp';
import {
  executeStochasticPossibilities,
  stochasticWitnessEntries,
  stochasticWitnessKey,
  executeOrderedScenario,
  executeOrderedScenarioWithAuditObservation,
  prepareOrderedScenario,
  validateInitialBattlePointPoints,
  type ActivationRequirementOwner,
  type AppliedPreparationAction,
  type ContributionApplicationPolicy,
  type EffectProjection,
  type EffectiveContributionSet,
  type OrderedScenarioExecution,
  type OrderedExecutionAuditObservation,
  type PreparedOrderedScenario,
  type PreparationFailureCode,
  type ResolvedAttackerFormExecution,
  type ResolvedCanonicalInputSet,
} from '@fgo-lab/battle-execution';
import { createDefaultTargetContext } from './targetContext';
import {
  findActorForm,
  findNoblePhantasmVariant,
  getNoblePhantasmVariants,
  naturalServantLevel,
  type MasterDataSnapshot,
  type ServantMaster,
  type ActorFormId,
  type CanonicalInputDefinition,
  type NoblePhantasmVariant,
} from '@fgo-lab/master-data';
import {
  type CalculationResult,
  type CalculationScenario,
  type DamageResolutionInput,
  type ServantBuild,
  type VersionContext,
} from '@fgo-lab/schema';
import type { DamageResolutionValue } from './damageResolution';
import { PreparedDamageMatrixCache } from './preparedDamageInputCache';
import {
  createEffectInputViewModels,
  resolveCanonicalInputValues,
  type EffectInputViewModel,
} from './canonicalInputs';
import { createEffectControlViewModels, type EffectControlViewModel } from './effectControls';
import {
  defaultCalculatorPreNoblePhantasmCandidate,
  defaultPreNoblePhantasmCandidate,
  type PreNoblePhantasmPlanCandidate,
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
  profileContinuity?: AttackProfileContinuity;
}

export type AttackProfileContinuity =
  | { kind: 'matched'; intendedProfileKey: string; actualProfileKey: string }
  | {
      kind: 'unavailableNoAttack';
      intendedProfileKey: string;
      actualProfileKey: null;
      disabledSelectionOperationId: string;
    }
  | {
      kind: 'unavailableDifferentAttack';
      intendedProfileKey: string;
      actualProfileKey: string;
      disabledSelectionOperationId: string;
    }
  | { kind: 'unresolved'; reason: string };

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
      issue: AttackerLevelStatUnavailableIssue | InitialHpUnavailableIssue | BattlePointIntentIssue;
      preparationRejection: null;
    });

export interface AttackerLevelStatUnavailableIssue {
  kind: 'attackerLevelStatUnavailable';
  servantId: string;
  level: number;
}

export interface BattlePointIntentIssue {
  kind: 'invalidBattlePointIntent';
  servantId: string;
  level: number;
  detail: 'ambiguousDomain' | 'unresolvedDomain' | 'unreachablePhase' | 'invalidInitialPoint';
}

export type CalculationApplicationResult =
  | CalculationResult
  | {
      status: 'invalid';
      issue: AttackerLevelStatUnavailableIssue | InitialHpUnavailableIssue | BattlePointIntentIssue;
      issues: { code: string; detail: string }[];
    };

type WithoutVersions<T> = T extends unknown ? Omit<T, 'versions'> : never;
export type CalculationApplicationOutcome = WithoutVersions<CalculationApplicationResult>;
type DamageMatrixCache = PreparedDamageMatrixCache<DamageResolutionValue>;

function publishCalculationOutcome(
  outcome: CalculationApplicationOutcome,
  versions: VersionContext,
): CalculationApplicationResult {
  return outcome.status === 'invalid' ? outcome : { ...outcome, versions };
}

interface CalculationExecutionCommon {
  possibilityCertificate: ExecutionPossibilityCertificate;
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
  profileContinuity?: AttackProfileContinuity;
  executionObservation?: CalculationExecutionObservation;
}

export interface CalculationExecutionObservation {
  battlePointWitness: Readonly<Record<string, number>> | null;
  targetExecution: OrderedExecutionAuditObservation | null;
}

export interface RejectedCalculationDiagnostic {
  readonly kind: 'rejectedCalculationDiagnostic';
  readonly preparation: RejectedPreparationDiagnostic;
  readonly normalActions: readonly PreparationActionExecution[];
  readonly orderedScenario: PreparedOrderedScenario;
  readonly canonicalInputs: ResolvedCanonicalInputSet;
  readonly execution: OrderedScenarioExecution;
  readonly executionObservation: CalculationExecutionObservation;
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
      diagnosticExecution?: RejectedCalculationDiagnostic;
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
  const candidate = defaultPreNoblePhantasmCandidate(
    servant,
    master.npResourceSemantics,
    calculatorPreparationSkillLevels(servant, build),
    npLevel,
  );
  return resolvedScenarioForPreparationCandidate(master, build, servant, candidate, npLevel);
}

/** The calculator's default world explicitly contains no external local trait additions. */
export function defaultCalculatorLocalWorldFacts(
  servant: ServantMaster,
): Extract<CalculationScenario, { mode: 'resolved' }>['worldFactAssertions'] {
  const assertions = new Map<
    string,
    Extract<CalculationScenario, { mode: 'resolved' }>['worldFactAssertions'][number]
  >();
  const variants = getNoblePhantasmVariants(servant);
  const assertAbsent = (
    scope: 'attackerState' | 'target' | 'targetState' | 'field',
    trait: string,
  ) => {
    const decisionKey = `calculator:initial:${scope}:${trait}`;
    assertions.set(decisionKey, {
      decisionKey,
      fact: { kind: 'trait', scope, trait, present: false },
    });
  };
  const effects = [
    ...servant.skills.flatMap((skill) => skill.effects),
    ...servant.passives.flatMap((passive) => passive.effects),
    ...variants.flatMap((variant) => variant.effects),
  ];
  for (const effect of effects)
    for (const operation of effect.execution) {
      if (
        operation.kind !== 'resourceMutation' ||
        operation.amount.kind !== 'populationCount' ||
        operation.amount.selector.basis !== 'actorTraits'
      )
        continue;
      for (const actor of populationLocalActors(operation.amount.selector.scope))
        for (const scope of traitConditionReadScopes(actor)) {
          if (scope === 'attacker') continue;
          for (const trait of operation.amount.selector.traits) assertAbsent(scope, trait);
        }
    }
  for (const variant of variants) {
    if (variant.kind !== 'attack') continue;
    for (const damage of variant.damage) {
      if (damage.kind !== 'traitCount' || damage.quantity.kind !== 'finiteTraits') continue;
      const stateTraits = new Set(damage.stateTraitNames);
      for (const parameter of damage.parametersByOvercharge.flat())
        for (const trait of parameter.targetTraits ?? [])
          if (trait.kind === 'trait' && stateTraits.has(trait.name))
            assertAbsent(parameter.targetId === 1 ? 'targetState' : 'attackerState', trait.name);
    }
  }
  return [...assertions.values()];
}

function resolvedScenarioForPreparationCandidate(
  master: MasterDataSnapshot,
  build: ServantBuild | undefined,
  servant: ServantMaster,
  candidate: PreNoblePhantasmPlanCandidate,
  npLevel: 1 | 2 | 3 | 4 | 5,
): ResolvedCalculationScenario {
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
    targetContext: createDefaultTargetContext(servant.classId, master.combatRules),
    enemyDefenseBuff: 0,
    attackerHpPermille: 1_000,
    battleState: { battlePointPhase: 0 },
    initialBattlePointPoints: {},
    canonicalInputValues: {},
    craftEssence: null,
    preNoblePhantasmPlan: [...candidate.commands],
    mysticCode: null,
    support: null,
    effectDecisions: [],
    activationFacts: [],
    worldFactAssertions: defaultCalculatorLocalWorldFacts(servant),
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
    calculatorPreparationSkillLevels(servant, build),
    npLevel,
  );
  return excludeDefaultAttackerSkillContributions(
    resolvedScenarioForPreparationCandidate(master, build, servant, candidate, npLevel),
    master,
  );
}

export type ScenarioPreparationOutcome =
  | {
      status: 'executable';
      input: DamageResolutionInput;
      formExecution: ResolvedAttackerFormExecution;
      initialMaximumHp: number;
    }
  | {
      status: 'rejected';
      rejection: NonNullable<ResolvedCalculationInput['preparationRejection']>;
      requiredInputs: readonly (CanonicalInputDefinition & { effectOccurrenceIds: string[] })[];
      recoveryInputDefinitions?: readonly CanonicalInputDefinition[];
      appliedPreparationActions: readonly AppliedPreparationAction[];
      diagnostic?: RejectedPreparationDiagnostic;
      formExecution: ResolvedAttackerFormExecution;
    }
  | {
      status: 'invalid';
      issue: AttackerLevelStatUnavailableIssue | InitialHpUnavailableIssue | BattlePointIntentIssue;
    };

export interface CalculationPreparationOptions {
  stochasticSelection?: StochasticSelection;
  initialNpGauge?: number;
  /** Effective starting OC selected by the execution intent. */
  initialOvercharge?: 1 | 2 | 3 | 4 | 5;
  /** Internal witness selected from the user's phase intent; never persisted. */
  initialBattlePointPoints?: Readonly<Record<string, number>>;
}

export function resolveScenario(
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
  preparation: CalculationPreparationOptions = {},
): ResolvedCalculationInput {
  return prepareCalculationScenarioWithPolicy(scenario, master, { kind: 'calculator' }, preparation)
    .resolved;
}

function evaluateResolvedCalculation(
  scenario: CalculationScenario,
  scenarioInput: DamageResolutionInput | null,
  resolved: ResolvedCalculationInput,
  versions: VersionContext,
  outcome: CalculationApplicationOutcome,
  executionObservation?: CalculationExecutionObservation,
): CalculationExecution {
  const result = publishCalculationOutcome(outcome, versions);
  const effectInputs =
    scenario.mode === 'resolved'
      ? createEffectInputViewModels({
          definitions: resolved.inputDefinitions,
          recovering: resolved.status === 'rejected',
          effects: resolved.effects,
          requiredInputs: resolved.requiredInputs,
          explicitValues: scenario.canonicalInputValues,
        })
      : [];
  const common: CalculationExecutionCommon = {
    possibilityCertificate: { kind: 'declared' },
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
      scenario.mode === 'resolved' ? scenario.targetContext : undefined,
    ),
    activationRequirements: resolved.activationRequirements,
    appliedPreparationActions: resolved.appliedPreparationActions,
    ...(resolved.profileContinuity ? { profileContinuity: resolved.profileContinuity } : {}),
    ...(executionObservation ? { executionObservation } : {}),
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
  possibilityCertificate: ExecutionPossibilityCertificate;
  master: MasterDataSnapshot;
  scenario: CalculationScenario;
  contributionPolicy: ContributionApplicationPolicy;
  preparation: CalculationPreparationOptions;
  orderedExecution: OrderedScenarioExecution | null;
  preparationExecution: ResolvedAttackerFormExecution | null;
}

type PreparedCalculationScenarioDraft =
  | (PreparedCalculationScenarioCommon & {
      status: 'executable';
      scenarioInput: DamageResolutionInput;
      resolved: Extract<ResolvedCalculationInput, { status: 'executable' }>;
      orderedScenario: PreparedOrderedScenario | null;
      canonicalInputs: ResolvedCanonicalInputSet | null;
      executionObservation?: CalculationExecutionObservation;
    })
  | (PreparedCalculationScenarioCommon & {
      status: 'rejected';
      resolved: Extract<ResolvedCalculationInput, { status: 'rejected' }>;
      orderedScenario: null;
      canonicalInputs: null;
      diagnostic?: RejectedPreparationDiagnostic;
      diagnosticExecution?: RejectedCalculationDiagnostic;
    })
  | (PreparedCalculationScenarioCommon & {
      status: 'invalid';
      resolved: Extract<ResolvedCalculationInput, { status: 'invalid' }>;
      orderedScenario: null;
      canonicalInputs: null;
    });

export type PreparedCalculationScenario = PreparedCalculationScenarioDraft & {
  readonly outcome: CalculationApplicationOutcome;
};

function completePreparedCalculationScenario(
  draft: PreparedCalculationScenarioDraft,
  damageCache: DamageMatrixCache,
): PreparedCalculationScenario {
  const completed = {
    ...draft,
    outcome: resolvedCalculationResult(draft.resolved, damageCache, draft.master.combatRules),
  };
  const capture = battlePointPreparationRejectionObservationFor(draft);
  if (capture) attachBattlePointPreparationRejectionObservation(completed, capture);
  return carryBattlePointPreparationObservation(draft, completed);
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
          recovering: resolved.status === 'rejected',
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
      scenario.mode === 'resolved' ? scenario.targetContext : undefined,
    ),
    activationRequirements: resolved.activationRequirements,
    appliedPreparationActions: resolved.appliedPreparationActions,
  };
}

export function prepareCalculationScenario(
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
  preparation: CalculationPreparationOptions = {},
  damageCache = new PreparedDamageMatrixCache<DamageResolutionValue>(),
): PreparedCalculationScenario {
  return prepareCalculationScenarioWithPolicy(
    scenario,
    master,
    { kind: 'calculator' },
    preparation,
    false,
    damageCache,
  );
}

function prepareConcreteCalculationScenarioWithPolicy(
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
  contributionPolicy: ContributionApplicationPolicy,
  preparation: CalculationPreparationOptions,
  captureExecutionObservation: boolean,
  damageCache: DamageMatrixCache,
  executionSession?: PreparationExecutionSession,
): PreparedCalculationScenario {
  return completePreparedCalculationScenario(
    buildConcreteCalculationScenarioWithPolicy(
      scenario,
      master,
      contributionPolicy,
      preparation,
      captureExecutionObservation,
      executionSession,
    ),
    damageCache,
  );
}

function buildConcreteCalculationScenarioWithPolicy(
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
  contributionPolicy: ContributionApplicationPolicy,
  preparation: CalculationPreparationOptions = {},
  captureExecutionObservation = false,
  executionSession?: PreparationExecutionSession,
): PreparedCalculationScenarioDraft {
  if (scenario.mode === 'manual')
    return {
      possibilityCertificate: { kind: 'declared' },
      status: 'executable',
      master,
      scenario,
      scenarioInput: scenario.manual,
      resolved: manualResolvedInput(scenario),
      orderedScenario: null,
      canonicalInputs: null,
      orderedExecution: null,
      preparationExecution: null,
      contributionPolicy,
      preparation,
    };
  const battlePointPreparation: BattlePointPreparationObservation | undefined =
    captureExecutionObservation ? { transitions: [] } : undefined;
  if (battlePointPreparation)
    attachBattlePointPreparationRejectionObservation(battlePointPreparation, { transitions: [] });
  const base = resolveScenarioPreparationOutcome(
    scenario,
    master,
    preparation,
    contributionPolicy,
    battlePointPreparation,
    executionSession,
  );
  if (base.status === 'invalid') {
    return {
      possibilityCertificate: { kind: 'declared' },
      status: 'invalid',
      master,
      scenario,
      resolved: invalidResolvedInput(base),
      orderedScenario: null,
      canonicalInputs: null,
      orderedExecution: null,
      preparationExecution: null,
      contributionPolicy,
      preparation,
    };
  }
  if (base.status === 'rejected') {
    const diagnosticExecution = prepareRejectedCalculationDiagnostic(
      scenario,
      master,
      base.formExecution,
      contributionPolicy,
      preparation,
    );
    const prepared: PreparedCalculationScenarioDraft = {
      possibilityCertificate: { kind: 'declared' },
      status: 'rejected',
      master,
      scenario,
      resolved: rejectedPreparationResolvedInput(base),
      orderedScenario: null,
      canonicalInputs: null,
      orderedExecution: null,
      preparationExecution: base.formExecution,
      contributionPolicy,
      preparation,
      ...(base.diagnostic ? { diagnostic: base.diagnostic } : {}),
      ...(diagnosticExecution ? { diagnosticExecution } : {}),
    };
    const capture =
      battlePointPreparation &&
      battlePointPreparationRejectionObservationFor(battlePointPreparation);
    if (capture) {
      capture.rejection = base;
      attachBattlePointPreparationRejectionObservation(prepared, capture);
    }
    return prepared;
  }
  const scenarioInput = base.input;
  const orderedScenario = prepareOrderedScenario(
    scenarioInput,
    scenario,
    master,
    base.formExecution,
  );
  const preparationCapture =
    battlePointPreparation && battlePointPreparationRejectionObservationFor(battlePointPreparation);
  if (preparationCapture) preparationCapture.orderedScenario = orderedScenario;
  const canonicalInputs = resolveCanonicalInputValues(
    orderedScenario.inputDefinitions,
    scenario.canonicalInputValues,
  );
  const observedExecution = captureExecutionObservation
    ? executeOrderedScenarioWithAuditObservation(
        orderedScenario,
        canonicalInputs,
        contributionPolicy,
      )
    : null;
  const execution =
    observedExecution?.execution ??
    executeOrderedScenario(orderedScenario, canonicalInputs, contributionPolicy);
  if (preparationCapture) preparationCapture.orderedExecution = execution;
  const executionObservation = observedExecution
    ? {
        battlePointWitness: preparation.initialBattlePointPoints ?? null,
        targetExecution: observedExecution.observation,
      }
    : undefined;
  if (
    executionObservation &&
    battlePointPreparation &&
    (preparationExecutionStateFor(orderedScenario)?.battlePoints.receipts.length ||
      preparationCapture?.transitions.some((t) =>
        t.attempts?.some((a) =>
          a.sources.some((s) =>
            s.effect.execution.some((o) => o.kind === 'battlePointCapacityModifier'),
          ),
        ),
      ))
  )
    attachBattlePointPreparationObservation(executionObservation, battlePointPreparation);
  const prepared: PreparedCalculationScenarioDraft = {
    possibilityCertificate: { kind: 'declared' },
    status: 'executable',
    master,
    scenario,
    scenarioInput,
    resolved: resolvePreparedOrderedScenario(
      scenario,
      orderedScenario,
      canonicalInputs,
      execution,
      base.formExecution.state.currentFormId,
      resolveAttackProfileContinuity(
        master.servants.find(({ id }) => id === scenario.attacker.servantId)!,
        base.formExecution,
        scenario,
        orderedScenario,
        execution,
      ),
    ),
    orderedScenario,
    canonicalInputs,
    orderedExecution: execution,
    preparationExecution: base.formExecution,
    contributionPolicy,
    preparation,
    ...(executionObservation ? { executionObservation } : {}),
  };
  const capture =
    battlePointPreparation && battlePointPreparationRejectionObservationFor(battlePointPreparation);
  if (capture) attachBattlePointPreparationRejectionObservation(prepared, capture);
  return prepared;
}

function invalidBattlePointPreparation(
  scenario: ResolvedCalculationScenario,
  master: MasterDataSnapshot,
  contributionPolicy: ContributionApplicationPolicy,
  preparation: CalculationPreparationOptions,
  detail: BattlePointIntentIssue['detail'],
  damageCache: DamageMatrixCache,
): PreparedCalculationScenario {
  const issue: BattlePointIntentIssue = {
    kind: 'invalidBattlePointIntent',
    servantId: scenario.attacker.servantId,
    level: scenario.attacker.level,
    detail,
  };
  return completePreparedCalculationScenario(
    {
      possibilityCertificate: { kind: 'declared' },
      status: 'invalid',
      master,
      scenario,
      resolved: invalidResolvedInput({ status: 'invalid', issue }),
      orderedScenario: null,
      canonicalInputs: null,
      orderedExecution: null,
      preparationExecution: null,
      contributionPolicy,
      preparation,
    },
    damageCache,
  );
}

export function prepareCalculationScenarioWithPolicy(
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
  contributionPolicy: ContributionApplicationPolicy,
  preparation: CalculationPreparationOptions = {},
  captureExecutionObservation = false,
  damageCache = new PreparedDamageMatrixCache<DamageResolutionValue>(),
  executionSession?: PreparationExecutionSession,
): PreparedCalculationScenario {
  if (scenario.mode === 'manual' || contributionPolicy.kind === 'calculator')
    return prepareCalculationScenarioWithBattlePointWitness(
      scenario,
      master,
      contributionPolicy,
      preparation,
      captureExecutionObservation,
      damageCache,
      executionSession,
    );
  const possibilities = executeStochasticPossibilities((stochasticSelection) =>
    prepareCalculationScenarioWithBattlePointWitness(
      scenario,
      master,
      contributionPolicy,
      { ...preparation, stochasticSelection },
      captureExecutionObservation,
      damageCache,
      executionSession,
    ),
  );
  const candidates = possibilities.executions.map(({ value }) => value);
  if (!candidates.length) throw new TypeError('no_legal_stochastic_witness');
  const withCertificate = (selected: PreparedCalculationScenario): PreparedCalculationScenario => {
    const selectedExecution = possibilities.executions.find(({ value }) => value === selected);
    if (!selectedExecution) throw new TypeError('detached_stochastic_selection');
    const certificate: ExecutionPossibilityCertificate = {
      kind: 'enumerated',
      policy: contributionPolicy.conditionalEffects,
      selectedWitness: stochasticWitnessEntries(selectedExecution.selection),
      attemptedExecutionCount: possibilities.attemptedExecutionCount,
      illegalWitnessCount: possibilities.illegalWitnesses.length,
      illegalWitnesses: possibilities.illegalWitnesses,
      branching: possibilities.branching,
      branches: possibilities.executions.map(({ selection, value }) => ({
        witness: stochasticWitnessEntries(selection),
        status: value.status,
        average:
          value.outcome.status === 'calculated'
            ? value.outcome.rows[scenario.attacker.npLevel - 1]!.average
            : null,
        sourceReads: [
          ...(value.preparationExecution?.initializationExecution?.sources ?? []),
          ...(value.preparationExecution?.actionExecutions ?? []).flatMap(
            (action) => action.sources,
          ),
        ]
          .filter(({ status }) => status !== 'unreached')
          .map(({ binding }) => binding.activation),
        resourceUses: value.resolved.appliedPreparationActions.map((action) => ({
          actorFormId: action.actorFormId,
          before: action.resourceBefore,
          after: action.resourceAfter,
          ocUse: action.ocUse,
        })),
      })),
    };
    const output = { ...selected, possibilityCertificate: certificate };
    const capture = battlePointPreparationRejectionObservationFor(selected);
    if (capture) attachBattlePointPreparationRejectionObservation(output, capture);
    return carryBattlePointPreparationObservation(selected, output);
  };
  const unknown = candidates.find((candidate) => {
    if (candidate.status === 'rejected')
      return ![
        'attackerDead',
        'insufficientNpGauge',
        'resourceRequirementExceedsCapacity',
      ].includes(candidate.resolved.preparationRejection.code);
    return (
      candidate.status === 'invalid' ||
      candidate.outcome.status === 'unsupported' ||
      candidate.outcome.status === 'inputRequired'
    );
  });
  if (unknown) return withCertificate(unknown);
  const rejected = candidates.find((candidate) => candidate.status === 'rejected');
  if (contributionPolicy.conditionalEffects === 'baseline' && rejected)
    return withCertificate(rejected);
  const executable = candidates.filter(
    (candidate): candidate is Extract<PreparedCalculationScenario, { status: 'executable' }> =>
      candidate.status === 'executable',
  );
  if (!executable.length) return withCertificate(candidates[0]!);
  const evaluated = executable.map((candidate) => {
    const result = candidate.outcome;
    if (result.status !== 'calculated') throw new TypeError('unresolved_stochastic_damage');
    const average = result.rows[scenario.attacker.npLevel - 1]!.average;
    return { candidate, average };
  });
  const direction = contributionPolicy.conditionalEffects === 'baseline' ? 1 : -1;
  evaluated.sort((left, right) => {
    const difference = direction * (left.average - right.average);
    if (difference !== 0) return difference;
    const leftExecution = possibilities.executions.find(({ value }) => value === left.candidate)!;
    const rightExecution = possibilities.executions.find(({ value }) => value === right.candidate)!;
    const leftKey = stochasticWitnessKey(stochasticWitnessEntries(leftExecution.selection));
    const rightKey = stochasticWitnessKey(stochasticWitnessEntries(rightExecution.selection));
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  return withCertificate(evaluated[0]!.candidate);
}

function prepareCalculationScenarioWithBattlePointWitness(
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
  contributionPolicy: ContributionApplicationPolicy,
  preparation: CalculationPreparationOptions = {},
  captureExecutionObservation = false,
  damageCache = new PreparedDamageMatrixCache<DamageResolutionValue>(),
  executionSession?: PreparationExecutionSession,
): PreparedCalculationScenario {
  const scenarioPoints =
    scenario.mode === 'resolved' ? scenario.initialBattlePointPoints : undefined;
  const explicitScenarioPoints =
    scenarioPoints && Object.keys(scenarioPoints).length > 0 ? scenarioPoints : undefined;
  if (
    scenario.mode === 'resolved' &&
    explicitScenarioPoints &&
    (scenario.battleState.battlePointPhase !== null ||
      (preparation.initialBattlePointPoints &&
        JSON.stringify(preparation.initialBattlePointPoints) !==
          JSON.stringify(explicitScenarioPoints)))
  )
    return invalidBattlePointPreparation(
      scenario,
      master,
      contributionPolicy,
      preparation,
      'invalidInitialPoint',
      damageCache,
    );
  const effectivePreparation = explicitScenarioPoints
    ? { ...preparation, initialBattlePointPoints: explicitScenarioPoints }
    : preparation;
  if (scenario.mode === 'resolved' && effectivePreparation.initialBattlePointPoints) {
    const servant = master.servants.find(({ id }) => id === scenario.attacker.servantId);
    if (servant) {
      const traits = new Set(
        findActorForm(servant, scenario.attacker.initialActorFormId)?.traits ?? servant.traits,
      );
      const valid = validateInitialBattlePointPoints({
        domains: servant.battlePointDomains ?? [],
        actorId: scenario.attacker.initialActorFormId.actorId,
        traits,
        points: effectivePreparation.initialBattlePointPoints,
      });
      if (valid.status === 'invalid')
        return invalidBattlePointPreparation(
          scenario,
          master,
          contributionPolicy,
          effectivePreparation,
          'invalidInitialPoint',
          damageCache,
        );
    }
  }
  if (scenario.mode === 'manual' || effectivePreparation.initialBattlePointPoints)
    return prepareConcreteCalculationScenarioWithPolicy(
      scenario,
      master,
      contributionPolicy,
      effectivePreparation,
      captureExecutionObservation,
      damageCache,
      executionSession,
    );
  const witnessResult = battlePointWitnesses(scenario, master);
  if (witnessResult.status === 'invalid')
    return invalidBattlePointPreparation(
      scenario,
      master,
      contributionPolicy,
      effectivePreparation,
      witnessResult.issue.detail,
      damageCache,
    );
  const witnesses = witnessResult.witnesses;
  if (witnesses.length === 1)
    return prepareConcreteCalculationScenarioWithPolicy(
      scenario,
      master,
      contributionPolicy,
      {
        ...effectivePreparation,
        initialBattlePointPoints: witnesses[0]!,
      },
      captureExecutionObservation,
      damageCache,
      executionSession,
    );
  const candidates = witnesses.map((initialBattlePointPoints) =>
    prepareConcreteCalculationScenarioWithPolicy(
      scenario,
      master,
      contributionPolicy,
      {
        ...effectivePreparation,
        initialBattlePointPoints,
      },
      captureExecutionObservation,
      damageCache,
      executionSession,
    ),
  );
  const executable = candidates.filter(
    (candidate): candidate is Extract<PreparedCalculationScenario, { status: 'executable' }> =>
      candidate.status === 'executable',
  );
  const unresolved = candidates.find(
    (candidate) => candidate.status !== 'executable' || candidate.outcome.status !== 'calculated',
  );
  if (unresolved)
    return carryBattlePointPreparationObservation(unresolved, {
      ...unresolved,
      scenario,
      preparation: effectivePreparation,
    });
  if (!executable.length)
    return carryBattlePointPreparationObservation(candidates[0]!, {
      ...candidates[0]!,
      scenario,
      preparation: effectivePreparation,
    });
  const selected = executable
    .map((candidate) => {
      const result = candidate.outcome;
      if (result.status !== 'calculated') throw new TypeError('unresolved_battle_point_damage');
      return { candidate, maximum: result.rows[scenario.attacker.npLevel - 1]!.maximum };
    })
    .sort((left, right) => right.maximum - left.maximum)[0]!.candidate;
  return carryBattlePointPreparationObservation(selected, {
    ...selected,
    scenario,
    preparation: effectivePreparation,
  });
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
    prepared.status === 'executable' && prepared.executionObservation !== undefined,
  );
}

export function reapplyPreparedCalculationPolicy(
  prepared: PreparedCalculationScenario,
  policy: ContributionApplicationPolicy,
  damageCache = new PreparedDamageMatrixCache<DamageResolutionValue>(),
): PreparedCalculationScenario {
  if (JSON.stringify(prepared.contributionPolicy) === JSON.stringify(policy)) return prepared;
  return prepareCalculationScenarioWithPolicy(
    prepared.scenario,
    prepared.master,
    policy,
    prepared.preparation,
    prepared.status === 'executable' && prepared.executionObservation !== undefined,
    damageCache,
  );
}

export function evaluatePreparedCalculationScenario(
  prepared: PreparedCalculationScenario,
  versions: VersionContext,
): CalculationExecution {
  const calculation = evaluateResolvedCalculation(
    prepared.scenario,
    prepared.status === 'executable' ? prepared.scenarioInput : null,
    prepared.resolved,
    versions,
    prepared.outcome,
    prepared.status === 'executable' ? prepared.executionObservation : undefined,
  );
  if (
    calculation.status === 'rejected' &&
    prepared.status === 'rejected' &&
    prepared.diagnosticExecution
  )
    calculation.diagnosticExecution = prepared.diagnosticExecution;
  const capture = battlePointPreparationRejectionObservationFor(prepared);
  if (capture) {
    attachBattlePointPreparationRejectionObservation(calculation, capture);
    attachBattlePointPreparationRejectionObservation(calculation.result, capture);
  }
  calculation.possibilityCertificate = prepared.possibilityCertificate;
  return calculation;
}

export function evaluatePreparedCalculationResult(
  prepared: PreparedCalculationScenario,
  versions: VersionContext,
): CalculationApplicationResult {
  const result = publishCalculationOutcome(prepared.outcome, versions);
  const capture = battlePointPreparationRejectionObservationFor(prepared);
  if (capture) attachBattlePointPreparationRejectionObservation(result, capture);
  return result;
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
