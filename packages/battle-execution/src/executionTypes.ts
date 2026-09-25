import type { HpState } from './hpResource';
import type { BattlePointState } from './battlePointResource';
import type {
  CanonicalInputDefinition,
  BattlePointDomain,
  CanonicalTargetDomain,
  NoblePhantasmVariant,
  NpDamageSpec,
  ActorFormId,
} from '@fgo-lab/master-data';
import type { CombatAttribute } from '@fgo-lab/calc-core';
import type { CalculationScenario, DamageResolutionInput, TargetPredicate } from '@fgo-lab/schema';
import type {
  BattleExecutionResult,
  BattleOperation,
  EffectProjection,
  ContributionComponent,
  ContributionId,
  ExecutionIssue,
  ModifierKind,
  OperationResult,
  OperationOutcome,
  OperationSource,
  CardType,
} from './contracts';
import type { TargetCandidate, TargetResolution } from './targetContext';
import type { AppliedPreparationAction } from './preNoblePhantasm';

export type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

export interface OrderedScenarioExecution extends BattleExecutionResult {
  input: DamageResolutionInput;
}

export interface OrderedExecutionAuditEvent {
  sequence: number;
  operationId: string;
  projectionKey: string;
  contributionId: string | null;
  operationKind: BattleOperation['kind'];
  operationOutcome: OperationOutcome;
  projectionOutcome: EffectProjection['outcome'];
  condition: OperationResult['condition'];
  projectionValuePermille: EffectProjection['valuePermille'];
}

export interface OrderedInputQuantityReadAuditEvent {
  operationSequence: number;
  operationGroupIndex: number;
  operationId: string;
  inputKey: string;
  value: number | null;
}
export interface OrderedBattlePointPhaseReadAuditEvent {
  operationSequence: number;
  operationGroupIndex: number;
  operationId: string;
  subjectId: string;
  actor: string;
  point: number | null;
  phase: number | null;
  comparison: 'lessThan' | 'atMost' | 'equal' | 'atLeast' | 'greaterThan';
  expectedValue: number;
  evaluated: boolean | null;
}

export interface OrderedMutationAuditEvent {
  operationSequence: number;
  operationId: string;
  operationKind: 'resourceMutation' | 'addQuantity';
  stateAddress: string;
  before: number | null;
  attemptedAfter: number | null;
  afterTransaction: number | null;
}

export interface OrderedExecutionGroupAuditEvent {
  groupIndex: number;
  transactionIdentity: {
    origin: BattleOperation['source']['origin'];
    sourceInstanceId: string;
    transactionGroupId: string | null;
    fallbackEffectIdentity: { skillId: string; effectOccurrenceId: string } | null;
  };
  operationIds: readonly string[];
  appliedOperationIds: readonly string[];
  outcome: 'committed' | 'rolledBack';
  issues: readonly ExecutionIssue[];
  mutations: readonly OrderedMutationAuditEvent[];
  rollbackProof: {
    battleStateRestored: boolean;
    damageInputRestored: boolean;
  } | null;
}

export interface OrderedCandidateStateAudit {
  preGroupContextResolution: {
    appliedOperationIds: readonly string[];
    before: {
      actorFormId: ActorFormId;
      noblePhantasmVariantKey: string;
      card: CardType;
    };
    resolved: {
      actorFormId: ActorFormId;
      noblePhantasmVariantKey: string;
      card: CardType;
    };
  } | null;
  executionGroups: readonly OrderedExecutionGroupAuditEvent[];
  inputQuantityReads: readonly OrderedInputQuantityReadAuditEvent[];
  battlePointPhaseReads: readonly OrderedBattlePointPhaseReadAuditEvent[];
}

export type OrderedExecutionAuditObservation =
  | {
      selection: 'selected';
      candidateIndex: number;
      targetCandidate: TargetCandidate;
      operationEvents: readonly OrderedExecutionAuditEvent[];
      candidateState?: OrderedCandidateStateAudit;
    }
  | {
      selection: 'ambiguous';
      candidates: readonly {
        candidateIndex: number;
        targetCandidate: TargetCandidate;
        operationEvents: readonly OrderedExecutionAuditEvent[];
        candidateState?: OrderedCandidateStateAudit;
      }[];
    }
  | {
      selection: 'unresolved';
      targetResolution: Extract<TargetResolution, { kind: 'impossible' | 'unsupported' }>;
      operationEvents: readonly OrderedExecutionAuditEvent[];
      candidateState?: OrderedCandidateStateAudit;
    };

export interface OrderedScenarioExecutionWithAuditObservation {
  execution: OrderedScenarioExecution;
  observation: OrderedExecutionAuditObservation;
}

export interface PreparedOrderedScenario {
  hp?: HpState | undefined;
  battlePoints?: BattlePointState | undefined;
  battlePointDomains: readonly BattlePointDomain[];
  baseInput: DamageResolutionInput;
  scenario: ResolvedScenario;
  attackerTraits: readonly string[];
  baseNoblePhantasmVariant: NoblePhantasmVariant;
  noblePhantasmVariants: readonly NoblePhantasmVariant[];
  attackerPredicates: readonly TargetPredicate[];
  damage: NpDamageSpec | undefined;
  operations: readonly BattleOperation[];
  compileProjections: readonly EffectProjection[];
  retainedProjections: readonly EffectProjection[];
  sourceIssues: readonly ExecutionIssue[];
  targetResolution: TargetResolution;
  targetDomain: CanonicalTargetDomain;
  attackerClass: string;
  attackerAttribute: CombatAttribute;
  inputDefinitions: readonly CanonicalInputDefinition[];
  preparationRequiredInputs: readonly (CanonicalInputDefinition & {
    effectOccurrenceIds: string[];
  })[];
  preparationInputKeys: ReadonlySet<string>;
  appliedPreparationActions: readonly AppliedPreparationAction[];
}

export interface ResolvedCanonicalInputSet {
  values: Readonly<Record<string, number>>;
  missingDefinitions: readonly CanonicalInputDefinition[];
  invalidInputKeys: readonly string[];
}

export type ContributionApplicationPolicy =
  | { kind: 'calculator' }
  | {
      kind: 'ranking';
      selfBuffs: 'included' | 'excluded';
      conditionalEffects: 'baseline' | 'satisfied';
      areaView: 'included' | 'excluded';
    };

export type ContributionPolicyDecision =
  | { kind: 'included' }
  | { kind: 'excluded'; reason: 'selfBuffPolicy' | 'conditionalEffectPolicy' | 'areaView' };

export interface EffectiveContribution {
  contributionId: ContributionId;
  presentationGroupId: string;
  operationId: string;
  component: ContributionComponent;
  modifier: ModifierKind | 'npSpecial' | null;
  resolvedValue: number | null;
  outputAddress:
    | 'damage.modifier'
    | 'damage.modifierRate'
    | 'damage.ignore'
    | 'damage.npBase'
    | 'damage.npSpecial';
  source: OperationSource;
  executionOutcome: OperationOutcome;
  selfDecision: ContributionPolicyDecision;
  conditionDecision: ContributionPolicyDecision;
  areaViewDecision: ContributionPolicyDecision;
  effective: boolean;
  presentationCounted: boolean;
}

export interface EffectiveContributionSet {
  contributions: readonly EffectiveContribution[];
  effectivePresentationGroupIds: ReadonlySet<string>;
}
