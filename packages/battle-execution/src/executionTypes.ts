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
  ExecutionIssue,
} from './contracts';
import type { TargetResolution } from './targetContext';
import type { AppliedPreparationAction } from './preNoblePhantasm';

export type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

export interface OrderedScenarioExecution extends BattleExecutionResult {
  input: DamageResolutionInput;
}

export interface PreparedOrderedScenario {
  baseInput: DamageResolutionInput;
  scenario: ResolvedScenario;
  attackerTraits: readonly string[];
  baseNoblePhantasmVariant: NoblePhantasmVariant;
  noblePhantasmVariants: readonly NoblePhantasmVariant[];
  attackerPredicates: readonly TargetPredicate[];
  damage: NpDamageSpec | undefined;
  operations: readonly BattleOperation[];
  compileProjections: readonly EffectProjection[];
  sourceIssues: readonly ExecutionIssue[];
  targetResolution: TargetResolution;
  targetDomain: CanonicalTargetDomain;
  attackerClass: string;
  attackerAttribute: CombatAttribute;
  inputDefinitions: readonly CanonicalInputDefinition[];
  appliedPreparationActions: readonly AppliedPreparationAction[];
}

export interface ResolvedCanonicalInputSet {
  values: Readonly<Record<string, number>>;
  missingDefinitions: readonly CanonicalInputDefinition[];
  invalidInputKeys: readonly string[];
}

export interface DamageContributionProjection {
  includedOperationIds: ReadonlySet<string>;
  excludedOperationIds: ReadonlySet<string>;
  excludedStateTraitContributions: {
    attackerState: ReadonlySet<string>;
    targetState: ReadonlySet<string>;
  };
}
