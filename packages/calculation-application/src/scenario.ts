import {
  preparationExecutionStateFor,
  populationLocalActors,
  projectBattleTraitPresence,
  traitConditionReadScopes,
} from '@fgo-lab/battle-execution';
import { calculatorPreparationSkillLevels } from './rankingBasis';
import type {
  ExecutionPossibilityCertificate,
  StochasticSelection,
  RejectedPreparationDiagnostic,
  PreparationActionExecution,
} from '@fgo-lab/battle-execution';
import { preparationOcAttemptsFor } from '@fgo-lab/battle-execution/preparation-audit';
import {
  attachBattlePointPreparationObservation,
  carryBattlePointPreparationObservation,
  attachBattlePointPreparationRejectionObservation,
  battlePointPreparationRejectionObservationFor,
  type BattlePointPreparationObservation,
} from './battlePointPreparationObservation';
import { resolveInitialMaximumHp, type InitialHpUnavailableIssue } from './initialHp';
import {
  executeStochasticPossibilities,
  stochasticWitnessEntries,
  stochasticWitnessKey,
  collectActivationRequirementOwners,
  executeOrderedScenario,
  executeOrderedScenarioWithAuditObservation,
  prepareDiagnosticOrderedScenario,
  executeDiagnosticOrderedScenarioWithAuditObservation,
  prepareOrderedScenario,
  resolveAttackerFormExecution,
  battlePointPhase,
  battlePointPhaseCandidates,
  validateInitialBattlePointPoints,
  readBattlePoint,
  type BattlePointState,
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
  type PreNoblePhantasmState,
  type PreparationTransitionResult,
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
  canonicalRequirementLeaves,
  findActorForm,
  findNoblePhantasmVariant,
  getNoblePhantasmVariants,
  noblePhantasmVariantKey,
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
  type PreNoblePhantasmCommand,
} from '@fgo-lab/schema';
import { calculateDamageResolutionValue, type DamageResolutionValue } from './damageResolution';
import { PreparedDamageMatrixCache } from './preparedDamageInputCache';
import {
  attackProfileForSelection,
  attackProfileKey,
  createStaticActorFormProfiles,
} from './attackProfile';
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
    targetContext: createDefaultTargetContext(servant.classId),
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

function damageResolutionInputForNoblePhantasm(
  scenario: ResolvedCalculationScenario,
  servant: ServantMaster,
  noblePhantasm: Extract<NoblePhantasmVariant, { kind: 'attack' }>,
  master: MasterDataSnapshot,
  attackerAtk: number,
  effectiveOvercharge: number,
  battlePoints?: BattlePointState,
  observation?: BattlePointPreparationObservation,
): DamageResolutionInput {
  const damage = noblePhantasm.damage[0];
  if (!damage) throw new TypeError(`attack_np_damage_missing:${servant.id}`);
  const craftEssence = scenario.craftEssence
    ? master.craftEssences.find(
        (candidate) => candidate.id === scenario.craftEssence?.craftEssenceId,
      )
    : undefined;
  const parameter =
    damage.kind === 'battlePointPhase' && battlePoints
      ? damage.parametersByOvercharge[effectiveOvercharge - 1]?.[scenario.attacker.npLevel - 1]
      : undefined;
  const domain =
    damage.kind === 'battlePointPhase' && battlePoints
      ? master.battlePointDomains.find((candidate) => candidate.id === String(parameter?.targetId))
      : undefined;
  const value =
    domain && battlePoints ? readBattlePoint(battlePoints, 'attacker', domain.id) : undefined;
  const phase =
    damage.kind === 'battlePointPhase' && battlePoints
      ? domain
        ? battlePointPhase(domain, value)
        : null
      : scenario.battleState.battlePointPhase;
  const input: DamageResolutionInput = {
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
    defenseBuff: scenario.enemyDefenseBuff,
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
    battlePointPhase: phase,
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
  if (observation) {
    const capture = battlePointPreparationRejectionObservationFor(observation);
    if (capture) capture.damageInputGenerated = input;
  }
  if (observation && damage.kind === 'battlePointPhase' && battlePoints && parameter)
    observation.conversion = { state: battlePoints, domain, value, phase, input, parameter };
  return input;
}

export function resolveScenarioPreparationOutcome(
  scenario: ResolvedCalculationScenario,
  master: MasterDataSnapshot,
  preparation: CalculationPreparationOptions = {},
  policy: ContributionApplicationPolicy = { kind: 'calculator' },
): ScenarioPreparationOutcome {
  return resolveScenarioPreparationOutcomeObserved(scenario, master, preparation, policy);
}

function resolveScenarioPreparationOutcomeObserved(
  scenario: ResolvedCalculationScenario,
  master: MasterDataSnapshot,
  preparation: CalculationPreparationOptions,
  policy: ContributionApplicationPolicy,
  observation?: BattlePointPreparationObservation,
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
  const assertedHp = scenario.worldFactAssertions.flatMap(({ fact }) =>
    fact.kind === 'quantity' && fact.quantity === 'attackerHpPermille' ? [fact.value] : [],
  );
  const initialIntents = [
    ...new Set([
      ...(scenario.attackerHpPermille === null ? [] : [scenario.attackerHpPermille]),
      ...assertedHp,
    ]),
  ];
  if (initialIntents.length > 1)
    return {
      status: 'invalid',
      issue: {
        kind: 'initialHpUnavailable',
        servantId: servant.id,
        level: scenario.attacker.level,
        source: 'servant',
        reason: 'conflictingInitialIntent',
      },
    };
  if (scenario.attackerHpPermille === null && initialIntents.length === 1)
    scenario = { ...scenario, attackerHpPermille: initialIntents[0]! };
  const initialHp = resolveInitialMaximumHp(scenario, master);
  if (initialHp.status === 'invalid') return initialHp;
  const attackerAtk = scenario.explicitOverrides.attackerAtk ?? canonicalAttackerAtk;
  const formExecution = resolveAttackerFormExecution(
    scenario,
    servant,
    master.npResourceSemantics,
    preparation.initialNpGauge,
    {
      master,
      policy,
      diagnoseRejectedActions: true,
      ...(preparation.stochasticSelection
        ? { stochasticSelection: preparation.stochasticSelection }
        : {}),
      ...(observation
        ? {
            observePreparationTransition: (
              before: PreNoblePhantasmState,
              command: PreNoblePhantasmCommand,
              result: PreparationTransitionResult,
            ) => {
              battlePointPreparationRejectionObservationFor(observation)?.transitions.push({
                before,
                command,
                result,
                attempts: preparationOcAttemptsFor(result),
              });
              observation.transitions = [
                ...observation.transitions,
                {
                  before: {
                    battlePoints: before.battlePoints,
                    appliedActionCount: before.appliedActions.length,
                  },
                  command,
                  result: {
                    status: result.status,
                    state: {
                      battlePoints: result.state.battlePoints,
                      appliedActions: result.state.appliedActions,
                    },
                  },
                },
              ];
            },
          }
        : {}),
      ...(preparation.initialOvercharge === undefined
        ? {}
        : { initialOvercharge: preparation.initialOvercharge }),
      initialMaximumHp: initialHp.maximum,
      ...(preparation.initialBattlePointPoints
        ? { initialBattlePointPoints: preparation.initialBattlePointPoints }
        : {}),
    },
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
      requiredInputs: formExecution.requiredInputs.map(({ definition, effectOccurrenceIds }) => ({
        ...definition,
        effectOccurrenceIds,
      })),
      ...(formExecution.recoveryInputDefinitions
        ? { recoveryInputDefinitions: formExecution.recoveryInputDefinitions }
        : {}),
      appliedPreparationActions: formExecution.actions,
      ...(formExecution.diagnostic ? { diagnostic: formExecution.diagnostic } : {}),
      formExecution,
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
      formExecution,
    };
  return {
    status: 'executable',
    initialMaximumHp: initialHp.maximum,
    input: damageResolutionInputForNoblePhantasm(
      scenario,
      servant,
      selected,
      master,
      attackerAtk,
      formExecution.state.ocState.receipts.at(-1)!.effectiveOc,
      formExecution.state.battlePoints,
      observation,
    ),
    formExecution,
  };
}

function resolveAttackProfileContinuity(
  servant: ServantMaster,
  formExecution: ResolvedAttackerFormExecution,
  scenario: ResolvedCalculationScenario,
  prepared: PreparedOrderedScenario,
  execution: OrderedScenarioExecution,
): AttackProfileContinuity {
  const intendedVariant = formExecution.state.selectedNoblePhantasmVariant;
  if (!intendedVariant) return { kind: 'unresolved', reason: 'intendedAttackVariantMissing' };
  const profiles = createStaticActorFormProfiles(servant);
  let intendedProfileKey: string;
  try {
    intendedProfileKey = attackProfileKey(
      attackProfileForSelection(
        servant,
        profiles,
        formExecution.state.currentFormId,
        intendedVariant,
      ),
    );
  } catch {
    return { kind: 'unresolved', reason: 'intendedAttackProfileUnresolved' };
  }
  const actualVariant = execution.state.noblePhantasmVariant;
  let actualProfileKey: string | null = null;
  if (actualVariant.kind === 'attack') {
    try {
      actualProfileKey = attackProfileKey(
        attackProfileForSelection(
          servant,
          profiles,
          execution.state.actorFormId,
          actualVariant.ref,
        ),
      );
    } catch {
      return { kind: 'unresolved', reason: 'actualAttackProfileUnresolved' };
    }
  }
  if (actualProfileKey === intendedProfileKey)
    return { kind: 'matched', intendedProfileKey, actualProfileKey };
  const disabledSelection = prepared.operations.find(
    (operation) =>
      operation.kind === 'selectNoblePhantasmVariant' &&
      noblePhantasmVariantKey(operation.variant) === noblePhantasmVariantKey(intendedVariant) &&
      scenario.effectDecisions.some(
        (decision) => decision.decisionKey === operation.decisionKey && !decision.operationEnabled,
      ),
  );
  if (!disabledSelection)
    return { kind: 'unresolved', reason: 'selectionChangedWithoutDisabledStructuralControl' };
  if (actualVariant.kind === 'nonAttack') {
    if (
      execution.requiredInputs.length > 0 ||
      prepared.preparationRequiredInputs.length > 0 ||
      execution.issues.length !== 1 ||
      execution.issues[0]?.kind !== 'invalidNoblePhantasmVariant' ||
      execution.issues[0].detail !== 'nonAttackDamage'
    )
      return { kind: 'unresolved', reason: 'nonAttackSelectionHasAdditionalIssues' };
    return {
      kind: 'unavailableNoAttack',
      intendedProfileKey,
      actualProfileKey: null,
      disabledSelectionOperationId: disabledSelection.operationId,
    };
  }
  if (execution.precision !== 'exact' || prepared.preparationRequiredInputs.length > 0)
    return { kind: 'unresolved', reason: 'changedSelectionHasAdditionalIssues' };
  if (actualProfileKey === null)
    return { kind: 'unresolved', reason: 'changedAttackProfileMissing' };
  return {
    kind: 'unavailableDifferentAttack',
    intendedProfileKey,
    actualProfileKey,
    disabledSelectionOperationId: disabledSelection.operationId,
  };
}

function resolvePreparedOrderedScenario(
  scenario: ResolvedCalculationScenario,
  prepared: PreparedOrderedScenario,
  canonicalInputs: ResolvedCanonicalInputSet,
  execution: OrderedScenarioExecution,
  terminalActorFormId: ActorFormId,
  profileContinuity: AttackProfileContinuity,
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
    profileContinuity,
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
        [
          ...prepared.preparationRequiredInputs.map(({ definition, effectOccurrenceIds }) => ({
            ...definition,
            effectOccurrenceIds,
          })),
          ...execution.requiredInputs,
        ].map((definition) => [definition.key, definition]),
      ).values(),
    ],
    inputDefinitions: [...execution.inputDefinitions],
    activationRequirements: collectActivationRequirementOwners(prepared.operations),
    appliedPreparationActions: prepared.appliedPreparationActions,
    targetStateTraitsAtDamage: damageState
      ? [...projectBattleTraitPresence(damageState, 'targetState').entries()].flatMap(
          ([trait, present]) => (present ? [trait] : []),
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
    inputDefinitions: [
      ...new Map(
        [...(outcome.recoveryInputDefinitions ?? []), ...outcome.requiredInputs].map((input) => [
          input.key,
          input,
        ]),
      ).values(),
    ],
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
  return prepareCalculationScenarioWithPolicy(scenario, master, { kind: 'calculator' }, preparation)
    .resolved;
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
  damageCache: DamageMatrixCache,
): CalculationApplicationOutcome {
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
      evidence: evidence.evidence,
    };
    const rejection = resolved.preparationRejection.code;
    if (
      rejection === 'attackerDead' ||
      rejection === 'insufficientNpGauge' ||
      rejection === 'resourceRequirementExceedsCapacity'
    )
      return {
        ...common,
        status: 'unavailable',
        reason:
          rejection === 'attackerDead'
            ? 'attackerDead'
            : rejection === 'insufficientNpGauge'
              ? 'insufficientNpGauge'
              : 'npCapacityExceeded',
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
  if (
    resolved.profileContinuity &&
    resolved.precision !== 'inputRequired' &&
    resolved.profileContinuity.kind !== 'matched'
  ) {
    const continuity = resolved.profileContinuity;
    const evidence = evaluateCalculationEvidence(resolved.evidenceKeys);
    const common = {
      rows: [] as [],
      effects: resolved.effects.map((effect) => ({
        projectionKey: effect.projectionKey,
        outcome: effect.outcome,
        explanationCode: effect.explanation.code,
      })),
      assumptions: [],
      issues: resolved.warnings.map((warning) => ({ code: warning, detail: warning })),
      trace: resolved.trace,
      evidence: evidence.evidence,
    };
    return continuity.kind === 'unresolved'
      ? {
          ...common,
          status: 'unsupported',
          missingEvidence: [`attackProfileContinuity:${continuity.reason}`],
        }
      : {
          ...common,
          status: 'unavailable',
          reason:
            continuity.kind === 'unavailableNoAttack'
              ? 'selectedAttackProfileHasNoAttack'
              : 'selectedAttackProfileChanged',
        };
  }
  const calculation = resolved.noblePhantasmVariant
    ? damageCache.getOrCreate(
        { noblePhantasmVariant: resolved.noblePhantasmVariant.ref, input: resolved.input },
        () => calculateDamageResolutionValue(resolved.input),
      )
    : calculateDamageResolutionValue(resolved.input);
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
  const completed = { ...draft, outcome: resolvedCalculationResult(draft.resolved, damageCache) };
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
): PreparedCalculationScenario {
  return completePreparedCalculationScenario(
    buildConcreteCalculationScenarioWithPolicy(
      scenario,
      master,
      contributionPolicy,
      preparation,
      captureExecutionObservation,
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
  const base = resolveScenarioPreparationOutcomeObserved(
    scenario,
    master,
    preparation,
    contributionPolicy,
    battlePointPreparation,
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

function prepareRejectedCalculationDiagnostic(
  scenario: ResolvedCalculationScenario,
  master: MasterDataSnapshot,
  formExecution: ResolvedAttackerFormExecution,
  policy: ContributionApplicationPolicy,
  options: CalculationPreparationOptions,
): RejectedCalculationDiagnostic | undefined {
  const preparation = formExecution.diagnostic;
  if (!preparation || !preparation.state.terminated) return undefined;
  if (!formExecution.actionExecutions)
    throw new TypeError('diagnostic_normal_action_receipts_missing');
  const servant = master.servants.find(({ id }) => id === scenario.attacker.servantId);
  if (!servant) throw new TypeError('diagnostic_servant_missing');
  const ref = preparation.state.selectedNoblePhantasmVariant;
  const variant = ref && findNoblePhantasmVariant(servant, ref);
  const receipt = preparation.state.ocState.receipts.at(-1);
  if (!variant || variant.kind !== 'attack' || !receipt)
    throw new TypeError('diagnostic_terminal_np_receipt_missing');
  const atk =
    scenario.explicitOverrides.attackerAtk ?? servant.atkByLevel[String(scenario.attacker.level)];
  if (atk === undefined) throw new TypeError('diagnostic_attacker_stat_missing');
  const input = damageResolutionInputForNoblePhantasm(
    scenario,
    servant,
    variant,
    master,
    atk,
    receipt.effectiveOc,
    preparation.state.battlePoints,
  );
  const orderedScenario = prepareDiagnosticOrderedScenario(input, scenario, master, formExecution);
  const canonicalInputs = resolveCanonicalInputValues(
    orderedScenario.inputDefinitions,
    scenario.canonicalInputValues,
  );
  const observed = executeDiagnosticOrderedScenarioWithAuditObservation(
    orderedScenario,
    canonicalInputs,
    policy,
  );
  return {
    kind: 'rejectedCalculationDiagnostic',
    preparation,
    normalActions: formExecution.actionExecutions,
    orderedScenario,
    canonicalInputs,
    execution: observed.execution,
    executionObservation: {
      battlePointWitness: options.initialBattlePointPoints ?? null,
      targetExecution: observed.observation,
    },
  };
}

function battlePointWitnesses(
  scenario: ResolvedCalculationScenario,
  master: MasterDataSnapshot,
):
  | { status: 'ready'; witnesses: Readonly<Record<string, number>>[] }
  | {
      status: 'invalid';
      issue: BattlePointIntentIssue;
    } {
  const phase = scenario.battleState.battlePointPhase;
  if (phase === null) return { status: 'ready', witnesses: [{}] };
  const servant = master.servants.find((candidate) => candidate.id === scenario.attacker.servantId);
  if (!servant || !(servant.battlePointDomains?.length ?? 0))
    return { status: 'ready', witnesses: [{}] };
  const invalid = (detail: BattlePointIntentIssue['detail']) => ({
    status: 'invalid' as const,
    issue: {
      kind: 'invalidBattlePointIntent' as const,
      servantId: scenario.attacker.servantId,
      level: scenario.attacker.level,
      detail,
    },
  });
  const referenced = new Set<string>();
  const collectRequirementDomains = (
    effect: MasterDataSnapshot['servants'][number]['skills'][number]['effects'][number],
  ) => {
    for (const leaf of canonicalRequirementLeaves(effect.requirement.expression))
      if (
        (leaf.kind === 'quantity' && leaf.quantity === 'battlePointPhase') ||
        leaf.kind === 'sourceQuantity'
      )
        if (leaf.subjectId !== undefined) referenced.add(leaf.subjectId);
  };
  for (const variant of servant.noblePhantasmVariantGroups.flatMap((group) => group.variants)) {
    if (variant.kind === 'attack')
      for (const damage of variant.damage)
        if (damage.kind === 'battlePointPhase')
          for (const row of damage.parametersByOvercharge)
            for (const cell of row)
              if (cell.targetId !== undefined) referenced.add(String(cell.targetId));
    for (const effect of variant.effects) {
      collectRequirementDomains(effect);
      for (const operation of effect.execution)
        if (
          operation.kind === 'battlePointCapacityModifier' ||
          (operation.kind === 'resourceMutation' && operation.resource === 'battlePoint')
        )
          if (operation.subjectId !== null) referenced.add(operation.subjectId);
    }
  }
  for (const effect of [...servant.skills, ...servant.passives].flatMap((skill) => skill.effects)) {
    collectRequirementDomains(effect);
    for (const operation of effect.execution)
      if (
        operation.kind === 'battlePointCapacityModifier' ||
        (operation.kind === 'resourceMutation' && operation.resource === 'battlePoint')
      )
        if (operation.subjectId !== null) referenced.add(operation.subjectId);
  }
  if (referenced.size > 1) return invalid('ambiguousDomain');
  if ([...referenced].some((id) => !master.battlePointDomains.some((domain) => domain.id === id)))
    return invalid('unresolvedDomain');
  const traits = new Set(
    findActorForm(servant, scenario.attacker.initialActorFormId)?.traits ?? servant.traits,
  );
  let witnesses: Readonly<Record<string, number>>[] = [{}];
  for (const domain of master.battlePointDomains.filter((candidate) =>
    referenced.has(candidate.id),
  )) {
    const capacity =
      domain.capacity.traitOverrides.find((entry) => entry.all.every((trait) => traits.has(trait)))
        ?.value ?? domain.capacity.default;
    const points = phase === 0 ? [-1] : battlePointPhaseCandidates(domain, phase, capacity);
    if (!points.length) return invalid('unreachablePhase');
    witnesses = witnesses.flatMap((prior) =>
      points.map((point) => ({ ...prior, [domain.id]: point })),
    );
  }
  return { status: 'ready', witnesses };
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
): PreparedCalculationScenario {
  if (scenario.mode === 'manual' || contributionPolicy.kind === 'calculator')
    return prepareCalculationScenarioWithBattlePointWitness(
      scenario,
      master,
      contributionPolicy,
      preparation,
      captureExecutionObservation,
      damageCache,
    );
  const possibilities = executeStochasticPossibilities((stochasticSelection) =>
    prepareCalculationScenarioWithBattlePointWitness(
      scenario,
      master,
      contributionPolicy,
      { ...preparation, stochasticSelection },
      captureExecutionObservation,
      damageCache,
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
