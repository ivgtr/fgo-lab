import type { HpState } from './hpResource';
import type {
  CanonicalInputDefinition,
  CanonicalTargetDomain,
  NoblePhantasmVariant,
  NpDamageSpec,
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
  OperationOutcome,
  OperationSource,
} from './contracts';
import type { TargetResolution } from './targetContext';
import type { AppliedPreparationAction } from './preNoblePhantasm';

export type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

export interface OrderedScenarioExecution extends BattleExecutionResult {
  input: DamageResolutionInput;
}

export interface PreparedOrderedScenario {
  hp?: HpState | undefined;
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
