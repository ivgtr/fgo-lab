import {
  selectedAllyMaximumFixedMaySelect,
  selectedAllyMaximumFixedSelection,
  selectedAllyMaximumFixedProgram,
  selectedAllyMaximumFixedSource,
  auditPublishedSelectedAllyMaximumFixed,
  type SelectedAllyMaximumFixedSelection,
  type SelectedAllyMaximumFixedProgram,
  type SelectedAllyMaximumFixedSource,
} from './productionHpSelectedAllyMaximumFixedPreparationAudit';
import { createHash } from 'node:crypto';
import { hpProofCoverageInventory } from './productionHpProofCoverage';
import {
  reconcileHpOperationEvidence,
  type HpAuditInputCommandEdge,
} from './productionHpOperationEvidence';
import {
  noHealingSelection,
  noHealingProgram,
  noHealingSource,
  noHealingDiagnostic,
  auditNoHealing,
  type NoHealingProgram,
  type NoHealingSource,
} from './productionHpNoHealingAudit';
import {
  hpPublishedDependencyBindings,
  reconcileHpPublishedDependencyCoverage,
  type HpPublishedDependencyRequest,
} from './productionHpPublishedDependencyCoverage';
import {
  receiveCanonical,
  receiveSelection,
  receiveProgram,
  receiveSource,
  receiveDiagnostic,
  auditPublishedReceive,
  type ReceiveRequest,
  type ReceiveProgram,
  type ReceiveSource,
} from './productionHpReceivePreparationAudit';
import { evaluatePreparedCalculationResult } from './scenario';
import {
  receiveAttemptProgram,
  auditReceiveAttemptIsolation,
  receiveAttemptDiagnostic,
  type ReceiveAttemptProgram,
} from './productionHpReceivePreparationAttemptAudit';
import {
  maximumFixedCanonical,
  maximumFixedSelection,
  maximumFixedProgram,
  maximumFixedSource,
  maximumFixedDiagnostic,
  auditPublishedMaximumFixed,
  type MaximumFixedSelection,
  type MaximumFixedProgram,
  type MaximumFixedSource,
} from './productionHpMaximumFixedPreparationAudit';
import {
  hpPreparationAttemptSelection,
  hpPreparationAttemptProgram,
  hpPreparationAttemptSource,
  hpPreparationAttemptDiagnostic,
  auditPublishedHpPreparationAttempts,
  type HpPreparationAttemptProgram,
  type HpPreparationAttemptSource,
} from './productionHpPreparationAttemptAudit';
import { isDeepStrictEqual } from 'node:util';
import {
  hpPreparationSelection,
  hpPreparationCanonical,
  hpPreparationProgram,
  hpPreparationSource,
  auditPublishedHpPreparation,
  type HpPreparationSelection,
  type HpPreparationProgram,
  type HpPreparationSource,
} from './productionHpPreparationAudit';
import {
  battlePointCapacityAttemptSelection,
  battlePointCapacityAttemptProgram,
  battlePointCapacityAttemptSource,
  auditPublishedBattlePointCapacityPreparationAttempts,
  type BattlePointCapacityAttemptSelection,
  type BattlePointCapacityAttemptProgram,
  type BattlePointCapacityAttemptSource,
} from './productionBattlePointCapacityPreparationAttemptAudit';
import {
  battlePointCapacitySelection,
  battlePointCapacityPreparationProgram,
  battlePointCapacityPreparationSource,
  auditPublishedBattlePointCapacityPreparation,
  type BattlePointCapacitySelection,
  type BattlePointCapacityProgram,
  type BattlePointCapacitySource,
} from './productionBattlePointCapacityPreparationAudit';
import {
  battlePointPreparationAttemptProgram,
  battlePointPreparationAttemptSource,
  auditPublishedBattlePointPreparationAttempts,
  type BattlePointPreparationAttemptProgram,
  type BattlePointPreparationAttemptSource,
} from './productionBattlePointPreparationAttemptAudit';
import {
  battlePointPreparationProgram,
  battlePointPreparationSource,
  battlePointPreparationCanonicalInventory,
  auditPublishedBattlePointPreparationObservations,
  type BattlePointPreparationProgram,
  type BattlePointPreparationSource,
} from './productionBattlePointPreparationAudit';
import {
  scalarQuantityProgram,
  scalarQuantitySource,
  scalarQuantityCanonicalInventory,
  auditPublishedScalarQuantityObservations,
  type ScalarQuantitySource,
} from './productionScalarQuantityAudit';
import { applyCanonicalInputCommand } from './canonicalInputs';
import {
  criticalStarsForwardProgram,
  criticalStarsForwardSource,
  type CriticalStarsForwardExpectation,
} from './productionCriticalStarsAudit';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  canonicalRequirementLeaves,
  getNoblePhantasmVariants,
  masterSnapshotSchema,
} from '@fgo-lab/master-data';
import {
  canNormalizeDamageEffect,
  battlePointPhase,
  canonicalExclusiveGroup,
  canonicalExclusiveTraits,
  hpPermille,
  readBattlePoint,
  type ConditionExpression,
  type EffectProjection,
  type TraitScope,
} from '@fgo-lab/battle-execution';
import {
  activationFactKey,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  type CalculationScenario,
  type VersionContext,
} from '@fgo-lab/schema';
import { describe, expect, it, vi } from 'vitest';
import * as operationOwner from '../../battle-execution/src/candidateOperationContext';
import {
  applyEffectConditionDecision,
  applyEffectControlPresentationDecision,
  applyEffectProjectionDecision,
} from './effectDecision';
import {
  evaluatePreparedCalculationScenario,
  prepareCalculationScenarioWithPolicy,
  calculateScenario as calculateScenarioOutcome,
  createDefaultResolvedScenario,
  requireExecutableCalculation,
  type CalculationExecutionObservation,
  type CalculationPreparationOptions,
  type AttackProfileContinuity,
} from './scenario';
const calculateScenario = (...args: Parameters<typeof calculateScenarioOutcome>) =>
  requireExecutableCalculation(calculateScenarioOutcome(...args));
import { setEffectSourceEnabled } from './scenarioCommands';
import {
  attackProfileForTerminalState,
  attackProfileKey,
  createStaticActorFormProfiles,
} from './attackProfile';
import {
  materializePreNoblePhantasmPlan,
  planPreNoblePhantasmCandidates,
} from './preNoblePhantasmPlanner';
import {
  productionAuditTestOptions,
  writeProductionAuditArtifact,
  encodeProductionAuditDiagnostic,
  decodeProductionAuditDiagnostic,
  decodeStoredProductionAuditArtifact,
  readStoredProductionAuditArtifact,
} from './productionAuditArtifacts';
import {
  auditProductionUserControlObservations,
  type ProductionUserControlObservation,
} from './productionParityDiagnostics';

import {
  selectedProfileControlIdentity,
  userControlSideObservation,
} from './productionUserControlObservation';

const root = resolve(import.meta.dirname, '../../..');
let productionMaster: Promise<ReturnType<typeof masterSnapshotSchema.parse>> | undefined;
type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

function intendedProfileKey(continuity: AttackProfileContinuity | undefined): string | null {
  return continuity && continuity.kind !== 'unresolved' ? continuity.intendedProfileKey : null;
}

function assumeProjectedCondition(
  scenario: Parameters<typeof applyEffectProjectionDecision>[0],
  projection: EffectProjection,
  peers: readonly EffectProjection[] = [],
) {
  return projection.decision.state !== 'none' &&
    projection.decision.kind === 'effect' &&
    projection.decision.plan.condition === 'userMayAssume' &&
    !containsActivationCondition(projection.explanation.condition)
    ? applyEffectConditionDecision(scenario, projection, true, [], peers)
    : scenario;
}

function containsActivationCondition(condition: ConditionExpression | null): boolean {
  if (!condition) return false;
  if (
    condition.kind === 'choice' ||
    condition.kind === 'operationTrigger' ||
    condition.kind === 'sourceQuantity'
  )
    return true;
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.some(containsActivationCondition);
  return condition.kind === 'not' && containsActivationCondition(condition.expression);
}
function loadProductionMaster() {
  productionMaster ??= readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8').then(
    (content) => masterSnapshotSchema.parse(JSON.parse(content)),
  );

  return productionMaster;
}

const scalarQuantityObservations: ScalarQuantitySource[] = [];
const hpPublishedDependencyRequests: HpPublishedDependencyRequest[] = [];
const noHealingPrograms: NoHealingProgram[] = [];
const noHealingObservations: NoHealingSource[] = [];
let hpPreparationArtifactPayloads:
  | {
      preparation: ReturnType<typeof auditPublishedHpPreparation>;
      attempt: {
        gate: ReturnType<typeof auditPublishedHpPreparationAttempts>;
        proofs: ReturnType<typeof hpPreparationAttemptDiagnostic>[];
      };
    }
  | undefined;
const hpRequests: {
  prepared: ReturnType<typeof prepareCalculationScenarioWithPolicy>;
  calculation: ReturnType<typeof evaluatePreparedCalculationScenario>;
}[] = [];
const hpAttemptSelections: HpPreparationSelection[] = [];
const hpAttemptPrograms: HpPreparationAttemptProgram[] = [];
const hpAttemptObservations: HpPreparationAttemptSource[] = [];
// Scope-complete canonical request ledger, recorded before evaluation/success filtering.
const selectedAllyCanonicalRequests: ReturnType<typeof prepareCalculationScenarioWithPolicy>[] = [];
const selectedAllyRequests: {
  versions: VersionContext;
  prepared: ReturnType<typeof prepareCalculationScenarioWithPolicy>;
  calculation: ReturnType<typeof evaluatePreparedCalculationScenario>;
}[] = [];
const selectedAllySelections: SelectedAllyMaximumFixedSelection[] = [];
const selectedAllyPrograms: SelectedAllyMaximumFixedProgram[] = [];
const selectedAllyObservations: SelectedAllyMaximumFixedSource[] = [];
const maximumFixedRequests: {
  prepared: ReturnType<typeof prepareCalculationScenarioWithPolicy>;
  calculation: ReturnType<typeof evaluatePreparedCalculationScenario>;
}[] = [];
const maximumFixedSelections: MaximumFixedSelection[] = [];
const maximumFixedPrograms: MaximumFixedProgram[] = [];
const maximumFixedObservations: MaximumFixedSource[] = [];
let maximumFixedPopulationComplete = false;
const receiveRequests: ReceiveRequest[] = [];
const receivePrograms: ReceiveProgram[] = [];
const receiveAttemptPrograms: ReceiveAttemptProgram[] = [];
const receiveObservations: ReceiveSource[] = [];
const hpSelections: HpPreparationSelection[] = [];
const hpPrograms: HpPreparationProgram[] = [];
const hpObservations: HpPreparationSource[] = [];
const capacityAttemptSelections: BattlePointCapacityAttemptSelection[] = [];
const capacityAttemptPrograms: BattlePointCapacityAttemptProgram[] = [];
const capacityAttemptObservations: BattlePointCapacityAttemptSource[] = [];
const capacitySelections: BattlePointCapacitySelection[] = [];
const capacityPrograms: BattlePointCapacityProgram[] = [];
const capacityObservations: BattlePointCapacitySource[] = [];
const attemptPrograms: BattlePointPreparationAttemptProgram[] = [];
const attemptObservations: BattlePointPreparationAttemptSource[] = [];
const domainPrograms: BattlePointPreparationProgram[] = [];
const domainObservations: BattlePointPreparationSource[] = [];
const controlPreparations = new WeakMap<
  ReturnType<typeof requireExecutableCalculation>,
  ReturnType<typeof prepareCalculationScenarioWithPolicy>
>();

function evaluateWithOrderedOperationEvents(
  scenario: ResolvedScenario,
  master: ReturnType<typeof masterSnapshotSchema.parse>,
  versions: VersionContext,
  preparation: CalculationPreparationOptions = {},
) {
  const prepared = prepareCalculationScenarioWithPolicy(
    scenario,
    master,
    { kind: 'calculator' },
    preparation,
    true,
  );
  const hpDependencyRequest: HpPublishedDependencyRequest = { prepared };
  hpPublishedDependencyRequests.push(hpDependencyRequest);
  // Retain the declaration superset before evaluation; canonical choice resolution belongs to the gate.
  const maySelectAlly = selectedAllyMaximumFixedMaySelect(master, scenario);
  if (maySelectAlly) selectedAllyCanonicalRequests.push(prepared);
  const evaluated = evaluatePreparedCalculationScenario(prepared, versions);
  hpDependencyRequest.calculation = evaluated;
  const noHealing = noHealingSelection(
    prepared,
    evaluated,
    hpPublishedDependencyRequests.length - 1,
  );
  if (noHealing) {
    noHealingPrograms.push(noHealingProgram(noHealing));
    noHealingObservations.push(noHealingSource(noHealing));
  }
  if (maySelectAlly) selectedAllyRequests.push({ prepared, calculation: evaluated, versions });
  // Request population is collected before any executable/native/activation filter.
  if (receiveCanonical(prepared)) {
    receiveRequests.push({ prepared, calculation: evaluated });
    const selection = receiveSelection(prepared, evaluated, receivePrograms.length)!;
    const direct = evaluatePreparedCalculationResult(prepared, versions);
    receivePrograms.push(receiveProgram(selection, direct));
    receiveAttemptPrograms.push(
      receiveAttemptProgram(
        selection,
        {
          kind: 'boundary',
          actionIndex: selection.canonical.writers[0]!.actionIndex,
          boundary: selection.canonical.scopeBoundaries.length ? 'outsideScope' : 'nativeCommitted',
        },
        direct,
      ),
    );
    receiveObservations.push(receiveSource(selection, direct));
  }
  if (maximumFixedCanonical(prepared))
    maximumFixedRequests.push({ prepared, calculation: evaluated });
  const maximum = maximumFixedSelection(prepared, evaluated, maximumFixedSelections.length);
  if (maximum) {
    maximumFixedSelections.push(maximum);
    maximumFixedPrograms.push(maximumFixedProgram(maximum));
    maximumFixedObservations.push(maximumFixedSource(maximum));
  }
  if (hpPreparationCanonical(prepared)) hpRequests.push({ prepared, calculation: evaluated });
  const hpAttemptSelection = hpPreparationAttemptSelection(
    prepared,
    evaluated,
    hpAttemptSelections.length,
  );
  if (hpAttemptSelection) {
    hpAttemptSelections.push(hpAttemptSelection);
    hpAttemptPrograms.push(hpPreparationAttemptProgram(hpAttemptSelection));
    hpAttemptObservations.push(hpPreparationAttemptSource(hpAttemptSelection));
  }
  const hpSelection = hpPreparationSelection(prepared, evaluated, hpSelections.length);
  if (hpSelection) {
    hpSelections.push(hpSelection);
    hpPrograms.push(hpPreparationProgram(hpSelection));
    hpObservations.push(hpPreparationSource(hpSelection));
  }
  const capacityAttemptSelection = battlePointCapacityAttemptSelection(
    prepared,
    capacityAttemptSelections.length,
  );
  if (capacityAttemptSelection) capacityAttemptSelections.push(capacityAttemptSelection);
  const capacityAttempt = battlePointCapacityAttemptProgram(
    prepared,
    evaluated,
    capacityAttemptSelections.length - 1,
  );
  if (capacityAttempt) {
    capacityAttemptPrograms.push(capacityAttempt);
    capacityAttemptObservations.push(battlePointCapacityAttemptSource(capacityAttempt));
  }
  const selection = battlePointCapacitySelection(prepared, capacitySelections.length);
  if (selection) capacitySelections.push(selection);
  const capacity = battlePointCapacityPreparationProgram(
    prepared,
    evaluated,
    capacitySelections.length - 1,
  );
  if (capacity) {
    capacityPrograms.push(capacity);
    capacityObservations.push(battlePointCapacityPreparationSource(capacity));
  }

  const attemptProgram = battlePointPreparationAttemptProgram(
    prepared,
    evaluated,
    attemptPrograms.length,
  );
  if (attemptProgram) {
    attemptPrograms.push(attemptProgram);
    attemptObservations.push(battlePointPreparationAttemptSource(attemptProgram));
  }
  if (
    prepared.status !== 'executable' ||
    prepared.orderedScenario === null ||
    prepared.canonicalInputs === null ||
    prepared.executionObservation?.targetExecution === null ||
    prepared.executionObservation === undefined
  )
    throw new TypeError(
      `production_control_scenario_not_executable:${scenario.attacker.servantId}`,
    );
  const calculation = requireExecutableCalculation(evaluated);
  if (calculation.executionObservation !== prepared.executionObservation)
    throw new TypeError(`production_control_observation_mismatch:${scenario.attacker.servantId}`);
  controlPreparations.set(calculation, prepared);
  const scalar = scalarQuantityProgram(prepared, calculation);
  if (scalar) scalarQuantityObservations.push(scalarQuantitySource(scalar));
  const domain = battlePointPreparationProgram(prepared, calculation);
  if (domain) {
    domainPrograms.push(domain);
    domainObservations.push(battlePointPreparationSource(domain));
  }
  return { calculation, observation: prepared.executionObservation, prepared };
}

function battlePointPhaseLeaves(condition: ConditionExpression | null) {
  const leaves: Extract<ConditionExpression, { kind: 'quantity' }>[] = [];
  const visit = (expression: ConditionExpression): void => {
    if (expression.kind === 'quantity' && expression.quantity === 'battlePointPhase')
      leaves.push(expression);
    else if (expression.kind === 'all' || expression.kind === 'any')
      expression.expressions.forEach(visit);
    else if (expression.kind === 'not') visit(expression.expression);
  };
  if (condition) visit(condition);
  return leaves;
}

function canonicalBattlePointLeavesForProjection(
  servant: ReturnType<typeof masterSnapshotSchema.parse>['servants'][number],
  projection: EffectProjection,
) {
  const sources = [
    ...servant.skills.map((skill) => ({ sourceId: skill.id, effects: skill.effects })),
    ...servant.passives.map((skill) => ({ sourceId: skill.id, effects: skill.effects })),
    ...servant.noblePhantasmVariantGroups.flatMap((group) =>
      group.variants.map((variant) => ({
        sourceId: variant.ref.noblePhantasmId,
        effects: variant.effects,
      })),
    ),
  ];
  const matching = sources
    .flatMap(({ effects }) => effects)
    .filter((effect) => effect.occurrenceId === projection.source.effectOccurrenceId);
  const groups = [
    ...new Set(
      matching.map((effect) =>
        JSON.stringify(
          canonicalRequirementLeaves(effect.requirement.expression).flatMap((leaf) =>
            leaf.kind === 'quantity' && leaf.quantity === 'battlePointPhase'
              ? [
                  {
                    subjectId: leaf.subjectId ?? '',
                    comparison: leaf.comparison,
                    value: leaf.value,
                  },
                ]
              : [],
          ),
        ),
      ),
    ),
  ];
  if (groups.length !== 1)
    return battlePointPhaseLeaves(projection.explanation.condition).map((leaf) => ({
      subjectId: '',
      comparison: leaf.comparison,
      value: leaf.value,
    }));
  return JSON.parse(groups[0]!) as {
    subjectId: string;
    comparison: 'lessThan' | 'atMost' | 'equal' | 'atLeast' | 'greaterThan';
    value: number;
  }[];
}

function battlePointControlInitialPhases(
  leaves: readonly {
    subjectId: string;
    comparison: 'lessThan' | 'atMost' | 'equal' | 'atLeast' | 'greaterThan';
    value: number;
  }[],
  domains: ReturnType<typeof masterSnapshotSchema.parse>['battlePointDomains'],
  ownerDomains: ReturnType<
    typeof masterSnapshotSchema.parse
  >['servants'][number]['battlePointDomains'],
) {
  if (!leaves.length) return null;
  const ids = [...new Set(leaves.map(({ subjectId }) => subjectId))];
  const domainId = ids.length === 1 ? ids[0] : null;
  if (!domainId || (ownerDomains ?? []).some(({ id }) => id !== domainId)) return null;
  const domain = domains.find(({ id }) => id === domainId);
  if (!domain || domain.phases.some(({ phase }) => phase < 0 || phase > 10)) return null;
  const boundary = leaves[0]!.value;
  const capacity = domain.capacity.default;
  const ceiling = capacity ?? Math.max(0, ...domain.phases.map(({ threshold }) => threshold));
  const witnesses = [-1, ...Array.from({ length: ceiling + 1 }, (_, point) => point)]
    .map((point) => ({
      point,
      phase: battlePointPhase(
        domain,
        point === -1
          ? { kind: 'absent' as const, eligible: true }
          : { kind: 'present' as const, point, capacity, capacityModifiers: [] },
      ),
    }))
    .filter((witness): witness is { point: number; phase: number } => witness.phase !== null);
  return {
    domain,
    witnesses: witnesses.sort(
      (left, right) =>
        Math.abs(left.phase - boundary) - Math.abs(right.phase - boundary) ||
        left.phase - right.phase ||
        left.point - right.point,
    ),
  };
}

function hpControlInitialCandidates(condition: ConditionExpression): readonly number[] {
  const thresholds = new Set<number>();
  const neighbors = new Set<number>();
  const visit = (expression: ConditionExpression): void => {
    if (expression.kind === 'quantity' && expression.quantity === 'attackerHpPermille') {
      if (expression.value >= 1 && expression.value <= 1000) thresholds.add(expression.value);
      for (const value of [expression.value - 1, expression.value + 1])
        if (value >= 1 && value <= 1000) neighbors.add(value);
    } else if (expression.kind === 'all' || expression.kind === 'any') {
      expression.expressions.forEach(visit);
    } else if (expression.kind === 'not') {
      visit(expression.expression);
    }
  };
  visit(condition);
  // The ordered preparation can move a live read away from every initial threshold.
  // The complete legal initial domain is finite; evaluate only until a proven witness is found.
  return [
    ...[...thresholds].sort((left, right) => right - left),
    ...[...neighbors].sort((left, right) => right - left),
    1,
    1000,
    ...Array.from({ length: 1000 }, (_, index) => index + 1),
  ].filter((value, index, values) => values.indexOf(value) === index);
}

function hasAttackerHpCondition(condition: ConditionExpression): boolean {
  if (condition.kind === 'quantity') return condition.quantity === 'attackerHpPermille';
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.some(hasAttackerHpCondition);
  return condition.kind === 'not' && hasAttackerHpCondition(condition.expression);
}

const expectedUnsupportedFamilies = {} as const;

const expectedUnresolvedDamageSemantics = {
  parameters: {},
  scripts: {},
} as const;

function reasonFamily(reason: string): string {
  return reason.split(':', 1)[0] ?? reason;
}

function containsMultiBranchOr(condition: ConditionExpression | null): boolean {
  if (!condition) return false;
  if (condition.kind === 'any' && condition.expressions.length > 1) return true;
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.some(containsMultiBranchOr);
  return condition.kind === 'not' && containsMultiBranchOr(condition.expression);
}

function collectConditionKinds(condition: ConditionExpression | null, kinds: Set<string>): void {
  if (!condition) return;
  kinds.add(condition.kind);
  if (condition.kind === 'all' || condition.kind === 'any')
    condition.expressions.forEach((child) => collectConditionKinds(child, kinds));
  else if (condition.kind === 'not') collectConditionKinds(condition.expression, kinds);
}

function positiveTraitAtoms(
  condition: ConditionExpression | null,
  negated = false,
): { scope: TraitScope; trait: string }[] {
  if (!condition) return [];
  if (condition.kind === 'trait')
    return condition.present !== negated
      ? [{ scope: condition.scope, trait: condition.trait }]
      : [];
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.flatMap((child) => positiveTraitAtoms(child, negated));
  if (condition.kind === 'not') return positiveTraitAtoms(condition.expression, !negated);
  return [];
}

function projectionDecisionKind(
  projection: EffectProjection,
): 'effect' | 'worldFact' | 'targetPredicate' | null {
  return projection.decision.state === 'none' ? null : projection.decision.kind;
}

function hasCanonicalInputConflict(input: {
  target: { traits: readonly string[] };
  fieldTraits: readonly string[];
}): boolean {
  for (const [scope, traits] of [
    ['target', input.target.traits],
    ['field', input.fieldTraits],
  ] as const) {
    const groups = new Map<string, Set<string>>();
    for (const trait of traits) {
      const group = canonicalExclusiveGroup(scope, trait);
      if (!group) continue;
      const values = groups.get(group) ?? new Set<string>();
      values.add(trait);
      groups.set(group, values);
    }
    if ([...groups.values()].some((values) => values.size > 1)) return true;
  }
  return false;
}

describe('production master inventory ratchet', () => {
  it(
    'keeps known candidate values and bounds fail-closed servants',
    {
      timeout: 60_000,
      ...productionAuditTestOptions([
        'production-inert-control-production.json',
        'production-scalar-quantity.json',
        'production-preparation-battle-point.json',
        'production-preparation-bp-attempt.json',
        'production-preparation-bp-capacity.json',
        'production-preparation-bp-capacity-attempt.json',
        'production-hp-published-dependency.json',
      ]),
    },
    async ({ task }) => {
      hpPreparationArtifactPayloads = undefined;
      const master = await loadProductionMaster();
      const versions: VersionContext = {
        schemaVersion: SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
        appVersion: '0.1.0',
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
        masterDataVersion: master.version,
      };
      maximumFixedPopulationComplete = false;
      hpPublishedDependencyRequests.length = 0;
      noHealingPrograms.length = 0;
      noHealingObservations.length = 0;
      receiveRequests.length = 0;
      receivePrograms.length = 0;
      receiveAttemptPrograms.length = 0;
      receiveObservations.length = 0;
      selectedAllyCanonicalRequests.length = 0;
      selectedAllyRequests.length = 0;
      selectedAllySelections.length = 0;
      selectedAllyPrograms.length = 0;
      selectedAllyObservations.length = 0;
      maximumFixedRequests.length = 0;
      maximumFixedSelections.length = 0;
      maximumFixedPrograms.length = 0;
      maximumFixedObservations.length = 0;
      scalarQuantityObservations.length = 0;
      attemptPrograms.length = 0;
      attemptObservations.length = 0;
      domainPrograms.length = 0;
      domainObservations.length = 0;
      const domainInventory = battlePointPreparationCanonicalInventory(master);
      const scalarInventory = scalarQuantityCanonicalInventory(master);
      const calculations = master.servants.flatMap((servant) => {
        try {
          const scenario = createDefaultResolvedScenario(master, undefined, servant);
          return [
            {
              servant,
              scenario,
              calculation: calculateScenario(scenario, master, versions),
            },
          ];
        } catch {
          return [];
        }
      });
      const semanticInventory = {
        parameters: {} as Record<string, number>,
        scripts: {} as Record<string, number>,
      };
      const normalizationErrors: string[] = [];
      const literalUnknownTraits: string[] = [];
      const inspectEffect = (
        servantId: string,
        effect: (typeof master.servants)[number]['skills'][number]['effects'][number],
        origin: 'attacker' | 'passive' | 'np',
      ) => {
        const semanticKeys = Object.values(effect.atlasEvidence.parameterSemantics).flat();
        const rawKeys = [
          ...new Set(
            effect.atlasEvidence.parameterSets.flatMap((set) =>
              set.flatMap((item) => Object.keys(item)),
            ),
          ),
        ];
        if (
          semanticKeys.length !== new Set(semanticKeys).size ||
          [...rawKeys].sort().join('|') !== [...semanticKeys].sort().join('|')
        )
          normalizationErrors.push(`${servantId}:${effect.occurrenceId}`);
        if (
          canonicalRequirementLeaves(effect.requirement.expression).some(
            (requirement) => requirement.kind === 'trait' && requirement.trait === 'unknown',
          )
        )
          literalUnknownTraits.push(`${servantId}:${effect.occurrenceId}`);
        if (!canNormalizeDamageEffect(effect, origin)) return;
        for (const key of effect.atlasEvidence.parameterSemantics.unresolved)
          semanticInventory.parameters[key] = (semanticInventory.parameters[key] ?? 0) + 1;
        for (const key of effect.atlasEvidence.unresolvedSemanticKeys)
          semanticInventory.scripts[key] = (semanticInventory.scripts[key] ?? 0) + 1;
      };
      for (const servant of master.servants) {
        for (const skill of servant.skills)
          for (const effect of skill.effects) inspectEffect(servant.id, effect, 'attacker');
        for (const passive of servant.passives)
          for (const effect of passive.effects) inspectEffect(servant.id, effect, 'passive');
        for (const noblePhantasm of getNoblePhantasmVariants(servant))
          if (noblePhantasm.kind === 'attack')
            for (const effect of noblePhantasm.effects) inspectEffect(servant.id, effect, 'np');
      }
      const unsupported = calculations.filter(
        ({ calculation }) => calculation.result.status === 'unsupported',
      );
      const missingCandidateValues = calculations.flatMap(({ servant, calculation }) =>
        calculation.effects.flatMap((effect) =>
          effect.explanation.code === 'disabled' &&
          effect.modifier !== null &&
          effect.requiredQuantity === null &&
          effect.modifier !== 'ignoreDefense' &&
          effect.modifier !== 'ignoreDamageCut' &&
          effect.modifier !== 'npVariantSelection' &&
          effect.value === null
            ? [`${servant.id}:${effect.source.skillId}:${effect.source.effectId}`]
            : [],
        ),
      );
      const archetype = calculations.find(
        ({ servant }) => servant.name === 'アーキタイプ：アース',
      )?.calculation;
      const soujuurou = calculations.find(
        ({ servant }) => servant.name === '静希草十郎',
      )?.calculation;
      const dante = calculations.find(
        ({ servant }) => servant.name === 'ダンテ・アリギエーリ',
      )?.calculation;
      const summerWu = calculations.find(({ servant }) => servant.id === '505200')?.calculation;
      const summerLilith = calculations.find(({ servant }) => servant.id === '405900')?.calculation;
      const unsupportedFamilies = Object.fromEntries(
        unsupported.map(({ servant, calculation }) => {
          if (calculation.result.status !== 'unsupported')
            throw new Error('unsupported audit lost its discriminant');
          return [
            servant.id,
            [...new Set(calculation.result.missingEvidence.map(reasonFamily))].sort(),
          ];
        }),
      );
      const multiBranchOrEffects = calculations.flatMap(({ servant, calculation }) =>
        calculation.effects.flatMap((effect) =>
          effect.visibility === 'visible' && containsMultiBranchOr(effect.explanation.condition)
            ? [{ servantId: servant.id, projectionKey: effect.projectionKey }]
            : [],
        ),
      );
      const conditionKinds = new Set<string>();
      calculations.forEach(({ calculation }) =>
        calculation.effects.forEach((effect) =>
          collectConditionKinds(effect.explanation.condition, conditionKinds),
        ),
      );
      const allProjections = calculations.flatMap(({ calculation }) => calculation.effects);
      const expectedUserControlIdentities = calculations.flatMap(({ servant, calculation }) =>
        calculation.effectControls
          .filter(
            (control) =>
              control.projection.controllability === 'user' && control.projection.sourceActive,
          )
          .flatMap((control) =>
            calculation.effects
              .filter(
                (projection) =>
                  projection.projectionKey === control.key && projection.controllability === 'user',
              )
              .map((projection) => {
                const profileKey = intendedProfileKey(calculation.profileContinuity);
                if (!profileKey) throw new TypeError('production_control_profile_key_missing');
                return selectedProfileControlIdentity(servant.id, projection, profileKey);
              }),
          ),
      );
      const userControlObservations: ProductionUserControlObservation[] = [];
      let npSpecialOriginalRequest: {
        observationIndex: number;
        enabledScenario: CalculationScenario;
        excludedScenario: CalculationScenario;
        projection: EffectProjection;
        expectedDamageInput: {
          enabled: [number, number, number, number, number];
          excluded: [number, number, number, number, number];
        };
      } | null = null;
      let operationOriginalRequest: {
        observationIndex: number;
        enabledScenario: CalculationScenario;
        excludedScenario: CalculationScenario;
        projection: EffectProjection;
      } | null = null;
      const expectedCriticalStarsForward: CriticalStarsForwardExpectation[] = [];
      const selectedProfileKeys = new Map<string, string>();
      const preparationInventories = new Map<
        string,
        ReturnType<typeof planPreNoblePhantasmCandidates>['inventory']
      >();
      const selectedUnsupportedProjections: string[] = [];
      const targetContextRequiredProjections: string[] = [];
      const invalidAutomaticConditions: string[] = [];
      const invalidExclusiveCalculations: string[] = [];
      const invalidConflictInputs: string[] = [];
      const conflictPairs = { effectEffect: 0, factFact: 0, factEffect: 0 };
      let canonicalFactConditionConflicts = 0;
      const canonicalConflictEffects = new Set<string>();
      const canonicalConflictServants = new Set<string>();
      let exclusivePairCount = 0;
      let declaredExclusivePairCount = 0;
      const skippedExclusivePairs: string[] = [];
      for (const { servant, scenario, calculation } of calculations) {
        const userControls = calculation.effectControls.filter(
          (control) =>
            control.projection.controllability === 'user' && control.projection.sourceActive,
        );
        const userEffects = userControls.map((control) => control.projection);
        const selectedCalculations = new Map<string, ReturnType<typeof calculateScenario>>();
        for (const effect of calculation.effects) {
          if (
            effect.visibility === 'visible' &&
            effect.modifier !== null &&
            effect.executionSupport === 'supported' &&
            effect.explanation.condition !== null &&
            effect.outcome !== 'applied' &&
            effect.controllability === 'automatic'
          )
            invalidAutomaticConditions.push(`${servant.id}:${effect.projectionKey}`);
        }
        for (const effect of userEffects) {
          const control = userControls.find((candidate) => candidate.key === effect.projectionKey)!;
          const hpCondition = effect.explanation.condition;
          const hpInitialCandidates =
            hpCondition !== null &&
            hasAttackerHpCondition(hpCondition) &&
            effect.requiredQuantityOwner === 'attacker'
              ? hpControlInitialCandidates(hpCondition)
              : [];
          const decisionScenario =
            hpInitialCandidates.length > 0
              ? { ...scenario, attackerHpPermille: hpInitialCandidates[0]! }
              : scenario;
          let selectedScenario = applyEffectControlPresentationDecision(
            decisionScenario,
            control,
            true,
            calculation.activationRequirements,
            userEffects,
            calculation.effectInputs,
          );
          let { calculation: active, observation: activeObservation } =
            evaluateWithOrderedOperationEvents(selectedScenario, master, versions);
          let selectedControlMembers = calculation.effects.filter(
            (candidate) =>
              candidate.projectionKey === effect.projectionKey &&
              candidate.controllability === 'user',
          );
          let hpWitness:
            | {
                initialPermille: number;
                livePermille: number;
                currentHp: number;
                maximumHp: number;
                evaluatedCandidates: number;
              }
            | undefined;
          let battlePointWitness: ProductionUserControlObservation['battlePointWitness'];
          let selectedBattlePointPreparation: CalculationPreparationOptions = {};
          let conflictCounterexample:
            | {
                plan: ResolvedScenario['preNoblePhantasmPlan'];
                profileKey: string | null;
                issues: readonly string[];
                enabled: ReturnType<typeof calculateScenario>;
                enabledObservation: CalculationExecutionObservation;
                excluded: ReturnType<typeof calculateScenario>;
                excludedObservation: CalculationExecutionObservation;
              }
            | undefined;
          if (
            active.result.status === 'unsupported' &&
            active.result.missingEvidence.length > 0 &&
            active.result.missingEvidence.every(
              (reason) =>
                reason.startsWith('constraintConflict:selected-form:') &&
                reason.includes(':exclusiveTrait:'),
            )
          ) {
            const planned = planPreNoblePhantasmCandidates(
              servant,
              master.npResourceSemantics,
              1,
              1,
            );
            preparationInventories.set(servant.id, planned.inventory);
            const reachable = [] as Array<{
              scenario: ResolvedScenario;
              active: ReturnType<typeof calculateScenario>;
              observation: CalculationExecutionObservation;
              members: typeof selectedControlMembers;
              planKey: string;
              profileKey: string;
              retainedCommandCount: number;
            }>;
            const actorFormProfiles = createStaticActorFormProfiles(servant);
            const defaultCommands = new Set(
              decisionScenario.preNoblePhantasmPlan.map((command) => JSON.stringify(command)),
            );
            for (const candidate of planned.candidates) {
              const candidateScenario = materializePreNoblePhantasmPlan(
                decisionScenario,
                candidate,
              );
              const candidateBase = calculateScenario(candidateScenario, master, versions);
              const candidateControl = candidateBase.effectControls.find(
                ({ key, projection }) =>
                  key === control.key &&
                  projection.sourceActive &&
                  projection.controllability === 'user',
              );
              if (!candidateControl) continue;
              const candidateSelected = applyEffectControlPresentationDecision(
                candidateScenario,
                candidateControl,
                true,
                candidateBase.activationRequirements,
                candidateBase.effects,
                candidateBase.effectInputs,
              );
              const evaluated = evaluateWithOrderedOperationEvents(
                candidateSelected,
                master,
                versions,
              );
              if (evaluated.calculation.result.status !== 'calculated') continue;
              const members = evaluated.calculation.effects.filter(
                (projection) =>
                  projection.projectionKey === effect.projectionKey &&
                  projection.controllability === 'user',
              );
              if (
                members.length !== selectedControlMembers.length ||
                members.some((member) => member.outcome !== 'applied') ||
                evaluated.calculation.profileContinuity?.kind !== 'matched'
              )
                continue;
              const profileKey = attackProfileKey(
                attackProfileForTerminalState(servant, actorFormProfiles, candidate.terminalState),
              );
              if (profileKey !== intendedProfileKey(evaluated.calculation.profileContinuity))
                throw new TypeError('production_control_candidate_profile_mismatch');
              reachable.push({
                scenario: candidateSelected,
                active: evaluated.calculation,
                observation: evaluated.observation,
                members,
                planKey: JSON.stringify(candidate.commands),
                profileKey,
                retainedCommandCount: candidate.commands.filter((command) =>
                  defaultCommands.has(JSON.stringify(command)),
                ).length,
              });
            }
            const profileKeys = new Set(reachable.map(({ profileKey }) => profileKey));
            if (profileKeys.size === 1 && reachable.length > 0) {
              reachable.sort(
                (left, right) =>
                  right.retainedCommandCount - left.retainedCommandCount ||
                  left.planKey.length - right.planKey.length ||
                  left.planKey.localeCompare(right.planKey),
              );
              const chosen = reachable[0]!;
              const originalControl =
                active.effectControls.find(({ key }) => key === control.key) ?? control;
              const originalExcludedScenario = applyEffectControlPresentationDecision(
                selectedScenario,
                originalControl,
                false,
                active.activationRequirements,
                active.effects,
                active.effectInputs,
              );
              const originalExcluded = evaluateWithOrderedOperationEvents(
                originalExcludedScenario,
                master,
                versions,
              );
              conflictCounterexample = {
                plan: decisionScenario.preNoblePhantasmPlan,
                profileKey: intendedProfileKey(active.profileContinuity),
                issues: active.result.missingEvidence,
                enabled: active,
                enabledObservation: activeObservation,
                excluded: originalExcluded.calculation,
                excludedObservation: originalExcluded.observation,
              };
              selectedScenario = chosen.scenario;
              active = chosen.active;
              activeObservation = chosen.observation;
              selectedControlMembers = chosen.members;
            }
          }
          if (
            hpInitialCandidates.length > 0 &&
            active.effects.find(
              (candidate) =>
                candidate.projectionKey === effect.projectionKey &&
                candidate.operationId === effect.operationId,
            )?.outcome !== 'applied'
          ) {
            let evaluatedCandidates = 0;
            for (const initialPermille of hpInitialCandidates) {
              if (initialPermille === selectedScenario.attackerHpPermille) continue;
              evaluatedCandidates += 1;
              const candidateScenario = {
                ...selectedScenario,
                attackerHpPermille: initialPermille,
              };
              const candidate = evaluateWithOrderedOperationEvents(
                candidateScenario,
                master,
                versions,
              );
              const liveHp = candidate.prepared.orderedScenario?.hp?.actors.attacker;
              const livePermille = hpPermille(liveHp);
              const candidateEffect = candidate.calculation.effects.find(
                (projection) =>
                  projection.projectionKey === effect.projectionKey &&
                  projection.operationId === effect.operationId,
              );
              if (
                livePermille === null ||
                liveHp?.kind !== 'absolute' ||
                candidate.calculation.result.status !== 'calculated' ||
                candidate.calculation.profileContinuity?.kind !== 'matched' ||
                intendedProfileKey(candidate.calculation.profileContinuity) !==
                  intendedProfileKey(active.profileContinuity) ||
                candidateEffect?.outcome !== 'applied'
              )
                continue;
              const candidateControl = candidate.calculation.effectControls.find(
                ({ key }) => key === effect.projectionKey,
              );
              if (!candidateControl) continue;
              const offScenario = applyEffectControlPresentationDecision(
                candidateScenario,
                candidateControl,
                false,
                candidate.calculation.activationRequirements,
                candidate.calculation.effects,
                candidate.calculation.effectInputs,
              );
              const off = evaluateWithOrderedOperationEvents(offScenario, master, versions);
              const offLiveHp = off.prepared.orderedScenario?.hp?.actors.attacker;
              const onSide = userControlSideObservation(
                candidateEffect,
                candidate.calculation,
                candidate.observation,
              );
              const offSide = userControlSideObservation(
                candidateEffect,
                off.calculation,
                off.observation,
              );
              if (
                off.calculation.result.status !== 'calculated' ||
                offLiveHp?.kind !== 'absolute' ||
                offLiveHp.current !== liveHp.current ||
                offLiveHp.maximum !== liveHp.maximum ||
                off.calculation.profileContinuity?.kind !== 'matched' ||
                off.calculation.profileContinuity.intendedProfileKey !==
                  candidate.calculation.profileContinuity.intendedProfileKey ||
                !onSide.operationEvents.some(
                  ({ operationOutcome }) => operationOutcome === 'applied',
                ) ||
                !offSide.operationEvents.some(
                  ({ operationOutcome }) => operationOutcome === 'notApplied',
                ) ||
                !onSide.effectiveContributions.some(({ effective }) => effective) ||
                !offSide.effectiveContributions.some(({ effective }) => !effective) ||
                onSide.inputBinding.kind !== 'bound' ||
                offSide.inputBinding.kind !== 'bound' ||
                JSON.stringify(onSide.inputBinding.value) ===
                  JSON.stringify(offSide.inputBinding.value) ||
                JSON.stringify(onSide.damageResult.rows) ===
                  JSON.stringify(offSide.damageResult.rows)
              )
                continue;
              selectedScenario = candidateScenario;
              active = candidate.calculation;
              activeObservation = candidate.observation;
              selectedControlMembers = active.effects.filter(
                (projection) =>
                  projection.projectionKey === effect.projectionKey &&
                  projection.controllability === 'user',
              );
              hpWitness = {
                initialPermille,
                livePermille,
                currentHp: liveHp.current,
                maximumHp: liveHp.maximum,
                evaluatedCandidates,
              };
              break;
            }
          }
          const battlePointCandidates = battlePointControlInitialPhases(
            canonicalBattlePointLeavesForProjection(servant, effect),
            master.battlePointDomains,
            servant.battlePointDomains,
          );
          if (
            battlePointCandidates &&
            active.effects.find(
              (projection) =>
                projection.projectionKey === effect.projectionKey &&
                projection.operationId === effect.operationId,
            )?.outcome !== 'applied'
          ) {
            let evaluatedCandidates = 0;
            for (const {
              point: initialPoint,
              phase: initialPhase,
            } of battlePointCandidates.witnesses) {
              evaluatedCandidates += 1;
              const candidateScenario = {
                ...selectedScenario,
                enemyDefenseBuff: 0.3,
                battleState: { battlePointPhase: initialPhase },
              };
              const selectedPreparation = {
                initialBattlePointPoints: { [battlePointCandidates.domain.id]: initialPoint },
              };
              const candidate = evaluateWithOrderedOperationEvents(
                candidateScenario,
                master,
                versions,
                selectedPreparation,
              );
              if (
                candidate.observation.battlePointWitness?.[battlePointCandidates.domain.id] !==
                initialPoint
              )
                continue;
              const on = evaluateWithOrderedOperationEvents(
                candidateScenario,
                master,
                versions,
                selectedPreparation,
              );
              const preparedValue = readBattlePoint(
                on.prepared.orderedScenario?.battlePoints,
                'attacker',
                battlePointCandidates.domain.id,
              );
              const preparedPhase = battlePointPhase(battlePointCandidates.domain, preparedValue);
              const candidateEffect = on.calculation.effects.find(
                (projection) =>
                  projection.projectionKey === effect.projectionKey &&
                  projection.operationId === effect.operationId,
              );
              if (
                !candidateEffect ||
                preparedValue?.kind !== 'present' ||
                preparedPhase === null ||
                on.calculation.result.status !== 'calculated' ||
                on.calculation.profileContinuity?.kind !== 'matched' ||
                candidateEffect.outcome !== 'applied'
              )
                continue;
              const candidateControl = on.calculation.effectControls.find(
                ({ key }) => key === effect.projectionKey,
              );
              if (!candidateControl) continue;
              const offScenario = applyEffectControlPresentationDecision(
                candidateScenario,
                candidateControl,
                false,
                on.calculation.activationRequirements,
                on.calculation.effects,
                on.calculation.effectInputs,
              );
              const off = evaluateWithOrderedOperationEvents(
                offScenario,
                master,
                versions,
                selectedPreparation,
              );
              const onSide = userControlSideObservation(
                candidateEffect,
                on.calculation,
                on.observation,
              );
              const offSide = userControlSideObservation(
                candidateEffect,
                off.calculation,
                off.observation,
              );
              if (
                off.calculation.result.status !== 'calculated' ||
                off.calculation.profileContinuity?.kind !== 'matched' ||
                off.calculation.profileContinuity.intendedProfileKey !==
                  on.calculation.profileContinuity.intendedProfileKey ||
                JSON.stringify({ ...candidateScenario, effectDecisions: [] }) !==
                  JSON.stringify({ ...offScenario, effectDecisions: [] }) ||
                off.observation.battlePointWitness?.[battlePointCandidates.domain.id] !==
                  initialPoint ||
                !onSide.operationEvents.some(
                  ({ operationOutcome }) => operationOutcome === 'applied',
                ) ||
                !offSide.operationEvents.some(
                  ({ operationOutcome }) => operationOutcome === 'notApplied',
                ) ||
                !onSide.effectiveContributions.some(({ effective }) => effective) ||
                !offSide.effectiveContributions.some(({ effective }) => !effective) ||
                onSide.inputBinding.kind !== 'bound' ||
                offSide.inputBinding.kind !== 'bound' ||
                onSide.inputBinding.value !== true ||
                offSide.inputBinding.value !== false ||
                JSON.stringify(onSide.damageResult.rows) ===
                  JSON.stringify(offSide.damageResult.rows)
              )
                continue;
              selectedScenario = candidateScenario;
              active = on.calculation;
              activeObservation = on.observation;
              selectedControlMembers = active.effects.filter(
                (projection) =>
                  projection.projectionKey === effect.projectionKey &&
                  projection.controllability === 'user',
              );
              battlePointWitness = {
                domainId: battlePointCandidates.domain.id,
                initialPoint,
                preparedPoint: preparedValue.point,
                preparedPhase,
                initialPhase,
                generatedCandidates: battlePointCandidates.witnesses.length,
                evaluatedCandidates,
                enemyDefenseBuff: candidateScenario.enemyDefenseBuff,
                enabledScenario: candidateScenario,
                excludedScenario: offScenario,
              };
              selectedBattlePointPreparation = selectedPreparation;
              break;
            }
          }
          selectedCalculations.set(effect.projectionKey, active);
          const activeEffect = active.effects.find(
            (candidate) => candidate.projectionKey === effect.projectionKey,
          );
          const constraintOnlyFailure =
            active.result.status === 'unsupported' &&
            active.result.missingEvidence.length > 0 &&
            active.result.missingEvidence.every((reason) =>
              reason.startsWith('constraintConflict:'),
            );
          const targetContextFailure =
            active.result.status === 'unsupported' &&
            active.result.missingEvidence.length > 0 &&
            active.result.missingEvidence.every((reason) =>
              reason.startsWith('invalidTargetContext:'),
            );
          if (targetContextFailure)
            targetContextRequiredProjections.push(`${servant.id}:${effect.projectionKey}`);
          if (
            (active.result.status !== 'calculated' &&
              !constraintOnlyFailure &&
              !targetContextFailure) ||
            (activeEffect?.outcome === 'unsupported' &&
              !constraintOnlyFailure &&
              !targetContextFailure)
          )
            selectedUnsupportedProjections.push(`${servant.id}:${effect.projectionKey}`);
          const activeControl = active.effectControls.find(
            (candidate) => candidate.key === effect.projectionKey,
          );
          const excludedScenario = applyEffectControlPresentationDecision(
            selectedScenario,
            activeControl ?? control,
            false,
            active.activationRequirements,
            active.effects,
            active.effectInputs,
          );
          const { calculation: excluded, observation: excludedObservation } =
            evaluateWithOrderedOperationEvents(
              excludedScenario,
              master,
              versions,
              selectedBattlePointPreparation,
            );
          for (const member of selectedControlMembers) {
            const profileKey = intendedProfileKey(active.profileContinuity);
            if (!profileKey) throw new TypeError('production_control_profile_key_missing');
            selectedProfileKeys.set(`${servant.id}:${member.projectionKey}`, profileKey);
            const activePrepared = controlPreparations.get(active);
            const excludedPrepared = controlPreparations.get(excluded);
            if (!activePrepared || !excludedPrepared)
              throw new TypeError('production_control_prepared_source_missing');
            const programs = {
              enabled: criticalStarsForwardProgram(activePrepared, active),
              excluded: criticalStarsForwardProgram(excludedPrepared, excluded),
            };
            const forward = programs.enabled !== null || programs.excluded !== null;
            const identity = selectedProfileControlIdentity(servant.id, member, profileKey);
            if (forward) expectedCriticalStarsForward.push({ identity, ...programs });
            userControlObservations.push({
              ...(forward
                ? {
                    criticalStarsSource: {
                      ...(programs.enabled
                        ? {
                            enabled: criticalStarsForwardSource(
                              programs.enabled,
                              activePrepared,
                              active,
                            ),
                          }
                        : {}),
                      ...(programs.excluded
                        ? {
                            excluded: criticalStarsForwardSource(
                              programs.excluded,
                              excludedPrepared,
                              excluded,
                            ),
                          }
                        : {}),
                    },
                  }
                : {}),
              identity: selectedProfileControlIdentity(servant.id, member, profileKey),
              enabled: userControlSideObservation(member, active, activeObservation),
              excluded: userControlSideObservation(member, excluded, excludedObservation),
              preparationSelection: {
                kind: conflictCounterexample ? 'reachableAlternate' : 'default',
                plan: selectedScenario.preNoblePhantasmPlan,
              },
              ...(hpWitness ? { hpWitness } : {}),
              ...(battlePointWitness ? { battlePointWitness } : {}),
              ...(conflictCounterexample
                ? {
                    conflictCounterexample: {
                      plan: conflictCounterexample.plan,
                      profileKey: conflictCounterexample.profileKey,
                      issues: conflictCounterexample.issues,
                      enabled: userControlSideObservation(
                        member,
                        conflictCounterexample.enabled,
                        conflictCounterexample.enabledObservation,
                      ),
                      excluded: userControlSideObservation(
                        member,
                        conflictCounterexample.excluded,
                        conflictCounterexample.excludedObservation,
                      ),
                    },
                  }
                : {}),
            });
            if (
              npSpecialOriginalRequest === null &&
              member.modifier === 'npSpecial' &&
              member.valuePermille !== null
            ) {
              const selected = userControlObservations.at(-1)!;
              if (
                selected.enabled.inputBinding.kind === 'bound' &&
                selected.excluded.inputBinding.kind === 'bound' &&
                selected.enabled.inputBinding.address === 'npSpecialMultipliers' &&
                selected.excluded.inputBinding.address === 'npSpecialMultipliers' &&
                JSON.stringify(selected.enabled.inputBinding.value) !==
                  JSON.stringify(selected.excluded.inputBinding.value)
              )
                npSpecialOriginalRequest = {
                  observationIndex: userControlObservations.length - 1,
                  enabledScenario: selectedScenario,
                  excludedScenario,
                  projection: member,
                  expectedDamageInput: {
                    enabled: Array(5).fill(member.valuePermille / 1_000) as [
                      number,
                      number,
                      number,
                      number,
                      number,
                    ],
                    excluded: [1, 1, 1, 1, 1],
                  },
                };
            }
            if (operationOriginalRequest === null && member.modifier !== 'npSpecial') {
              const selected = userControlObservations.at(-1)!;
              if (
                selected.enabled.inputBinding.kind === 'bound' &&
                selected.excluded.inputBinding.kind === 'bound' &&
                JSON.stringify(selected.enabled.inputBinding.value) !==
                  JSON.stringify(selected.excluded.inputBinding.value)
              )
                operationOriginalRequest = {
                  observationIndex: userControlObservations.length - 1,
                  enabledScenario: selectedScenario,
                  excludedScenario,
                  projection: member,
                };
            }
          }
        }

        const exclusiveCandidates = userEffects;
        const checkedPairs = new Set<string>();
        for (let leftIndex = 0; leftIndex < exclusiveCandidates.length; leftIndex += 1) {
          const left = exclusiveCandidates[leftIndex]!;
          for (
            let rightIndex = leftIndex + 1;
            rightIndex < exclusiveCandidates.length;
            rightIndex += 1
          ) {
            const right = exclusiveCandidates[rightIndex]!;
            const pairKey = `${left.projectionKey}|${right.projectionKey}`;
            if (checkedPairs.has(pairKey)) continue;
            checkedPairs.add(pairKey);
            const isDeclaredExclusive = left.selectionGroups.some((leftGroup) =>
              right.selectionGroups.some(
                (rightGroup) =>
                  rightGroup.groupKey === leftGroup.groupKey &&
                  rightGroup.candidateKey !== leftGroup.candidateKey,
              ),
            );
            if (!isDeclaredExclusive) continue;
            declaredExclusivePairCount += 1;
            const leftSelected = assumeProjectedCondition(
              applyEffectProjectionDecision(
                setEffectSourceEnabled(scenario, left, true),
                left,
                true,
              ),
              left,
            );
            const rightSelected = assumeProjectedCondition(
              applyEffectProjectionDecision(
                setEffectSourceEnabled(scenario, right, true),
                right,
                true,
              ),
              right,
            );
            const rightDecisionKey =
              right.decision.state === 'none' ? right.projectionKey : right.decision.decisionKey;
            const leftOnly = selectedCalculations.get(left.projectionKey)!;
            const rightOnly = selectedCalculations.get(right.projectionKey)!;
            if (
              leftOnly.effectWarnings.some((warning) =>
                warning.startsWith('constraintConflict:'),
              ) ||
              rightOnly.effectWarnings.some((warning) => warning.startsWith('constraintConflict:'))
            ) {
              skippedExclusivePairs.push(`${servant.id}:${pairKey}`);
              continue;
            }
            const conflict = calculateScenario(
              {
                ...leftSelected,
                effectDecisions: [
                  ...new Map(
                    [
                      ...leftSelected.effectDecisions,
                      ...rightSelected.effectDecisions.filter(
                        ({ decisionKey }) => decisionKey === rightDecisionKey,
                      ),
                    ].map((decision) => [decision.decisionKey, decision]),
                  ).values(),
                ],
                activationFacts: [
                  ...new Map(
                    [...leftSelected.activationFacts, ...rightSelected.activationFacts].map(
                      (fact) => [activationFactKey(fact), fact],
                    ),
                  ).values(),
                ].sort((leftFact, rightFact) =>
                  activationFactKey(leftFact).localeCompare(activationFactKey(rightFact)),
                ),
                worldFactAssertions: [
                  ...leftSelected.worldFactAssertions,
                  ...rightSelected.worldFactAssertions.filter(
                    ({ decisionKey }) => decisionKey === rightDecisionKey,
                  ),
                ],
              },
              master,
              versions,
            );
            const hasConflict = conflict.effectWarnings.some(
              (warning) =>
                warning.startsWith('constraintConflict:') ||
                warning.startsWith('invalidActivationContext:'),
            );
            if (!hasConflict) continue;
            exclusivePairCount += 1;
            const leftKind = projectionDecisionKind(left);
            const rightKind = projectionDecisionKind(right);
            if (leftKind === 'effect' && rightKind === 'effect') conflictPairs.effectEffect += 1;
            else if (leftKind === 'worldFact' && rightKind === 'worldFact')
              conflictPairs.factFact += 1;
            else conflictPairs.factEffect += 1;
            const outcomes = conflict.effects
              .filter(
                (effect) =>
                  effect.projectionKey === left.projectionKey ||
                  effect.projectionKey === right.projectionKey,
              )
              .map((effect) => effect.outcome);
            if (conflict.result.status !== 'unsupported' || outcomes.includes('applied'))
              invalidExclusiveCalculations.push(`${servant.id}:${pairKey}`);
            if (hasCanonicalInputConflict(conflict.input))
              invalidConflictInputs.push(`${servant.id}:${pairKey}`);
          }
        }

        for (const effect of userEffects.filter(
          (candidate) => projectionDecisionKind(candidate) === 'effect',
        )) {
          const canonicalAtoms = positiveTraitAtoms(effect.explanation.condition).flatMap(
            (atom) => {
              const group = canonicalExclusiveGroup(atom.scope, atom.trait);
              return group ? [{ ...atom, group }] : [];
            },
          );
          const checkedFacts = new Set<string>();
          for (const atom of canonicalAtoms)
            for (const conflictingTrait of canonicalExclusiveTraits(atom.scope, atom.group)) {
              if (conflictingTrait === atom.trait) continue;
              const factKey = `${atom.scope}:${conflictingTrait}`;
              if (checkedFacts.has(factKey)) continue;
              checkedFacts.add(factKey);
              const selected = selectedCalculations.get(effect.projectionKey)!.scenario;
              if (selected.mode !== 'resolved') throw new Error('expected resolved scenario');
              const conflict = calculateScenario(
                {
                  ...selected,
                  worldFactAssertions: [
                    {
                      decisionKey: `audit:canonical:${effect.projectionKey}:${factKey}`,
                      fact: {
                        kind: 'trait',
                        scope: atom.scope,
                        trait: conflictingTrait,
                        present: true,
                      },
                    },
                  ],
                },
                master,
                versions,
              );
              if (
                !conflict.effectWarnings.some((warning) =>
                  warning.startsWith('constraintConflict:'),
                )
              )
                continue;
              canonicalFactConditionConflicts += 1;
              canonicalConflictEffects.add(`${servant.id}:${effect.projectionKey}`);
              canonicalConflictServants.add(servant.id);
              const outcome = conflict.effects.find(
                (candidate) => candidate.projectionKey === effect.projectionKey,
              )?.outcome;
              if (conflict.result.status !== 'unsupported' || outcome === 'applied')
                invalidExclusiveCalculations.push(
                  `${servant.id}:${effect.projectionKey}:${factKey}`,
                );
              if (hasCanonicalInputConflict(conflict.input))
                invalidConflictInputs.push(`${servant.id}:${effect.projectionKey}:${factKey}`);
            }
        }
      }

      maximumFixedPopulationComplete = true;
      const hpDependencyDeclarations = hpProofCoverageInventory(master);
      const ceConditions = hpDependencyDeclarations.filter(
        (declaration) =>
          declaration.identity.origin === 'craftEssence' &&
          declaration.identity.kind === 'condition' &&
          declaration.identity.path === 'requirement.expression' &&
          'quantity' in declaration.value &&
          declaration.value.quantity === 'attackerHpPermille' &&
          'comparison' in declaration.value &&
          declaration.value.comparison === 'atMost' &&
          'value' in declaration.value &&
          declaration.value.value === 500,
      );
      expect(ceConditions).toHaveLength(1);
      const ceCondition = ceConditions[0]!;
      const ce = master.craftEssences.find(
        (candidate) => candidate.id === ceCondition.identity.owner,
      );
      const ceActor = calculations.find(
        ({ calculation }) => calculation.result.status === 'calculated',
      )?.servant;
      if (!ce || !ceActor || !ce.effects.includes(ceCondition.effect!))
        throw new TypeError('production_ce_condition_owner_missing');
      const originalControlRequestCount = hpPublishedDependencyRequests.length;
      for (const limitBreak of [0, 4] as const)
        for (const hp of [502, 500] as const) {
          const scenario: ResolvedScenario = {
            ...createDefaultResolvedScenario(master, undefined, ceActor),
            preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' }],
            attackerHpPermille: hp,
            craftEssence: {
              craftEssenceId: ce.id,
              level: ce.maxLevelByLimitBreak[limitBreak],
              limitBreak,
            },
          };
          const { calculation } = evaluateWithOrderedOperationEvents(scenario, master, versions);
          expect(calculation.result.status).toBe('calculated');
        }
      const hpDependencyBindings = hpPublishedDependencyBindings(
        hpDependencyDeclarations,
        hpPublishedDependencyRequests,
      );
      const hpDependencyCoverage = reconcileHpPublishedDependencyCoverage(
        hpDependencyDeclarations,
        hpPublishedDependencyRequests,
        hpDependencyBindings.bindings,
      );
      const hpDependencyReceipt = await writeProductionAuditArtifact(
        task.meta,
        'production-hp-published-dependency.json',
        hpDependencyCoverage,
      );
      const hpDependencyBytes = await readStoredProductionAuditArtifact(
        'production-hp-published-dependency.json',
      );
      expect([
        hpDependencyBytes.length,
        createHash('sha256').update(hpDependencyBytes).digest('hex'),
      ]).toEqual([hpDependencyReceipt.expectedBytes, hpDependencyReceipt.expectedSha256]);
      expect(
        isDeepStrictEqual(
          decodeStoredProductionAuditArtifact(hpDependencyBytes),
          hpDependencyCoverage,
        ),
      ).toBe(true);
      expect(hpDependencyCoverage.gate.failures).toEqual([]);
      expect(hpDependencyCoverage.productClosure).toBe(false);
      expect(originalControlRequestCount).toBe(3182);
      expect(hpDependencyCoverage.requestCount).toBe(originalControlRequestCount + 4);
      expect(
        hpDependencyCoverage.requests
          .slice(0, originalControlRequestCount)
          .every(
            (request) =>
              request.scenario.mode === 'resolved' && request.scenario.craftEssence === null,
          ),
      ).toBe(true);
      const ceRow = hpDependencyCoverage.declarations.find((declaration) =>
        isDeepStrictEqual(declaration.identity, ceCondition.identity),
      );
      expect(ceRow?.directScenarioOwnerRequests).toEqual([
        originalControlRequestCount,
        originalControlRequestCount + 1,
        originalControlRequestCount + 2,
        originalControlRequestCount + 3,
      ]);
      for (const [offset, hp] of [501, 500, 501, 500].entries()) {
        const requestIndex = originalControlRequestCount + offset;
        expect(hpDependencyCoverage.requests[requestIndex]?.targetSelection).toBe('selected');
        const ceBindings = hpDependencyCoverage.bindings.filter(
          (binding) =>
            binding.requestIndex === requestIndex &&
            isDeepStrictEqual(binding.declaration, ceCondition.identity),
        );
        expect(ceBindings.map((binding) => binding.stage)).toEqual([
          'canonicalCondition',
          'actualConditionRead',
        ]);
        expect(ceBindings[1]?.detail).toMatchObject({
          permille: hp,
          evaluated: hp === 500,
          transaction: 'committed',
          modifierConsumed: hp === 500,
        });
      }
      const unconnectedHpDependencies = (kind: string) =>
        hpDependencyCoverage.declarations.filter(
          (declaration) =>
            declaration.identity.kind === kind &&
            declaration.stages.every((stage) => stage.observation === 'unobserved'),
        );
      expect(
        unconnectedHpDependencies('condition').filter(
          (declaration) => declaration.identity.origin === 'craftEssence',
        ),
      ).toEqual([]);
      expect(
        unconnectedHpDependencies('hpRatioLow')
          .map((declaration) => declaration.directScenarioOwnerRequests.length)
          .sort((a, b) => a - b),
      ).toEqual([2, 4]);
      expect(
        unconnectedHpDependencies('valueExpression').map(
          (declaration) => declaration.directScenarioOwnerRequests.length,
        ),
      ).toEqual(Array(10).fill(0));
      expect(
        unconnectedHpDependencies('ocRateExpression').map(
          (declaration) => declaration.directScenarioOwnerRequests.length,
        ),
      ).toEqual(Array(24).fill(10));
      const ocRateCells = hpDependencyCoverage.declarations.filter(
        (declaration) => declaration.identity.kind === 'ocRateExpression',
      );
      expect(ocRateCells.flatMap((declaration) => declaration.ocRateSelections)).toHaveLength(250);
      expect(
        ocRateCells
          .flatMap((declaration) => declaration.ocRateSelections)
          .filter(
            (selection) =>
              selection.disposition === 'selectedCommitted' &&
              selection.actualRead === 'noLaterGrantInTerminalAction',
          ),
      ).toHaveLength(10);
      expect(
        ocRateCells
          .flatMap((declaration) => declaration.ocRateSelections)
          .filter((selection) => selection.disposition === 'otherCellSelected'),
      ).toHaveLength(240);
      const selectedExpectedIdentities = expectedUserControlIdentities.map((identity) => ({
        ...identity,
        profileKey:
          selectedProfileKeys.get(`${identity.ownerId}:${identity.projectionKey}`) ??
          identity.profileKey,
      }));
      const expectedBattlePointReads = calculations.flatMap(({ servant, calculation }) =>
        calculation.effects.flatMap((projection) => {
          if (projection.controllability !== 'user' || !projection.sourceActive) return [];
          const leaves = canonicalBattlePointLeavesForProjection(servant, projection);
          return leaves.length
            ? [
                {
                  ownerId: servant.id,
                  projectionKey: projection.projectionKey,
                  operationId: projection.operationId,
                  leaves,
                },
              ]
            : [];
        }),
      );
      const scalarGate = auditPublishedScalarQuantityObservations(
        scalarInventory,
        scalarQuantityObservations,
      );
      await writeProductionAuditArtifact(task.meta, 'production-scalar-quantity.json', scalarGate);
      const domainGate = auditPublishedBattlePointPreparationObservations(
        domainInventory,
        domainPrograms,
        domainObservations,
      );
      await writeProductionAuditArtifact(
        task.meta,
        'production-preparation-battle-point.json',
        domainGate,
      );
      const attemptGate = auditPublishedBattlePointPreparationAttempts(
        master,
        attemptPrograms,
        attemptObservations,
      );
      await writeProductionAuditArtifact(
        task.meta,
        'production-preparation-bp-attempt.json',
        attemptGate,
      );
      const capacityGate = auditPublishedBattlePointCapacityPreparation(
        master,
        capacityPrograms,
        capacityObservations,
        capacitySelections,
      );
      await writeProductionAuditArtifact(
        task.meta,
        'production-preparation-bp-capacity.json',
        capacityGate,
      );
      const capacityAttemptGate = auditPublishedBattlePointCapacityPreparationAttempts(
        master,
        capacityAttemptSelections,
        capacityAttemptPrograms,
        capacityAttemptObservations,
      );
      await writeProductionAuditArtifact(
        task.meta,
        'production-preparation-bp-capacity-attempt.json',
        capacityAttemptGate,
      );
      const hpGate = auditPublishedHpPreparation(
        master,
        hpRequests,
        hpSelections,
        hpPrograms,
        hpObservations,
      );
      const hpAttemptGate = auditPublishedHpPreparationAttempts(
        master,
        hpRequests,
        hpAttemptSelections,
        hpAttemptPrograms,
        hpAttemptObservations,
      );
      const hpAttemptDiagnostic = {
        gate: hpAttemptGate,
        proofs: hpAttemptObservations.map(hpPreparationAttemptDiagnostic),
      };
      hpPreparationArtifactPayloads = { preparation: hpGate, attempt: hpAttemptDiagnostic };
      expect(hpAttemptGate.status, JSON.stringify(hpAttemptGate.firstDifference)).toBe('passed');

      const originalNpSpecial =
        npSpecialOriginalRequest === null
          ? null
          : userControlObservations[npSpecialOriginalRequest.observationIndex]!;
      const inertNpSpecialObservation: ProductionUserControlObservation | null =
        originalNpSpecial && originalNpSpecial.enabled.inputBinding.kind === 'bound'
          ? {
              ...originalNpSpecial,
              excluded: {
                ...originalNpSpecial.excluded,
                inputBinding: {
                  kind: 'bound',
                  address: 'npSpecialMultipliers',
                  value: originalNpSpecial.enabled.inputBinding.value as [
                    number,
                    number,
                    number,
                    number,
                    number,
                  ],
                },
              },
            }
          : null;
      const originalOperation =
        operationOriginalRequest === null
          ? null
          : userControlObservations[operationOriginalRequest.observationIndex]!;
      const inertOperationObservation: ProductionUserControlObservation | null = originalOperation
        ? { ...originalOperation, excluded: originalOperation.enabled }
        : null;
      // Fault the live selection owner and consume its real execution result.
      // The original excluded command and saved observations remain intact.
      let inertExecution: {
        request: NonNullable<typeof operationOriginalRequest>;
        prepared: ReturnType<typeof prepareCalculationScenarioWithPolicy>;
        calculation: ReturnType<typeof requireExecutableCalculation>;
        observation: ProductionUserControlObservation;
        selectionCalls: number;
      } | null = null;
      if (operationOriginalRequest && originalOperation) {
        const request = operationOriginalRequest;
        const decisionKey =
          request.projection.decision.state === 'enabled'
            ? request.projection.decision.decisionKey
            : null;
        if (decisionKey === null) throw new TypeError('inert_execution_decision_missing');
        const realEnabled = operationOwner.operationEnabled;
        let selectionCalls = 0;
        const fault = vi.spyOn(operationOwner, 'operationEnabled').mockImplementation((...args) => {
          if (args[1].decisionKey === decisionKey) {
            selectionCalls++;
            return true;
          }
          return realEnabled(...args);
        });
        try {
          const prepared = prepareCalculationScenarioWithPolicy(
            request.excludedScenario,
            master,
            { kind: 'calculator' },
            {},
            true,
          );
          const calculation = requireExecutableCalculation(
            evaluatePreparedCalculationScenario(prepared, versions),
          );
          if (!calculation.executionObservation)
            throw new TypeError('inert_execution_capture_missing');
          inertExecution = {
            request,
            prepared,
            calculation,
            observation: {
              ...originalOperation,
              excluded: userControlSideObservation(
                request.projection,
                calculation,
                calculation.executionObservation,
              ),
            },
            selectionCalls,
          };
        } finally {
          fault.mockRestore();
        }
      }
      const controlGateInput = {
        expectedProjectionCount: expectedUserControlIdentities.length,
        expectedIdentities: selectedExpectedIdentities,
        expectedBattlePointReads,
        expectedCriticalStarsForward,
      };
      const probe = process.env['FGO_TSK08_INERT_FAILURE_PROBE'];
      const executionProbe = process.env['FGO_TSK08_FAILURE_CLASS_PROBE'];
      const probeObservations = userControlObservations.map((observation, index) => {
        if (
          executionProbe === 'inertControl' &&
          inertExecution &&
          index === operationOriginalRequest?.observationIndex
        )
          return inertExecution.observation;
        if (
          probe === 'npSpecial' &&
          inertNpSpecialObservation &&
          index === npSpecialOriginalRequest?.observationIndex
        )
          return inertNpSpecialObservation;
        if (
          probe === 'operation' &&
          inertOperationObservation &&
          index === operationOriginalRequest?.observationIndex
        )
          return inertOperationObservation;
        if (
          probe === 'allEqual' &&
          observation.identity.modifier === 'npSpecial' &&
          observation.enabled.inputBinding.kind === 'bound'
        )
          return {
            ...observation,
            excluded: { ...observation.excluded, inputBinding: observation.enabled.inputBinding },
          };
        return observation;
      });
      const userControlGate = auditProductionUserControlObservations({
        ...controlGateInput,
        observations: probeObservations,
      });
      const inertNpSpecialGate =
        inertNpSpecialObservation === null
          ? null
          : auditProductionUserControlObservations({
              ...controlGateInput,
              observations: userControlObservations.map((observation, index) =>
                index === npSpecialOriginalRequest?.observationIndex
                  ? inertNpSpecialObservation
                  : observation,
              ),
            });
      const inertOperationGate =
        inertOperationObservation === null
          ? null
          : auditProductionUserControlObservations({
              ...controlGateInput,
              observations: userControlObservations.map((observation, index) =>
                index === operationOriginalRequest?.observationIndex
                  ? inertOperationObservation
                  : observation,
              ),
            });
      const inertExecutionGate =
        inertExecution &&
        auditProductionUserControlObservations({
          ...controlGateInput,
          observations: userControlObservations.map((observation, index) =>
            index === operationOriginalRequest?.observationIndex
              ? inertExecution.observation
              : observation,
          ),
        });
      await writeProductionAuditArtifact(task.meta, 'production-inert-control-production.json', {
        schemaVersion: 1,
        boundary: 'calculation-application-production-inert-controls',
        source: 'productionMasterControlAudit.test.ts',
        canonicalIdentity: userControlGate.canonicalIdentity,
        expectedIdentities: selectedExpectedIdentities,
        expectedBattlePointReads,
        expectedCriticalStarsForward,
        preparationInventories: Object.fromEntries(preparationInventories),
        gate: userControlGate,
        observations: probeObservations,
        executionFailure: {
          activeProbe: executionProbe ?? null,
          witness: inertExecution,
          gate: inertExecutionGate,
        },
        intentionalFailure: {
          originalRequest: npSpecialOriginalRequest,
          originalObservation: originalNpSpecial,
          alteredObservation: inertNpSpecialObservation,
          gate: inertNpSpecialGate,
          operation: {
            originalRequest: operationOriginalRequest,
            originalObservation: originalOperation,
            alteredObservation: inertOperationObservation,
            gate: inertOperationGate,
          },
        },
      });
      expect([undefined, 'npSpecial', 'operation', 'allEqual']).toContain(probe);
      expect([undefined, 'inertControl']).toContain(executionProbe);
      expect(inertExecution?.selectionCalls).toBeGreaterThan(0);
      expect(inertExecution?.prepared.scenario).toEqual(operationOriginalRequest?.excludedScenario);
      expect(inertExecutionGate).toMatchObject({
        status: 'failed',
        failures: [
          {
            reason: 'userControlDidNotReachOperationOrDamage',
            firstDifference: { path: 'reached', expected: true, actual: false },
          },
        ],
      });
      expect(npSpecialOriginalRequest).not.toBeNull();
      expect(operationOriginalRequest).not.toBeNull();
      for (const originalRequest of [npSpecialOriginalRequest, operationOriginalRequest]) {
        const decisionKey =
          originalRequest?.projection.decision.state === 'enabled'
            ? originalRequest.projection.decision.decisionKey
            : null;
        expect(decisionKey).not.toBeNull();
        expect(
          originalRequest?.enabledScenario.mode === 'resolved'
            ? originalRequest.enabledScenario.effectDecisions.find(
                (decision) => decision.decisionKey === decisionKey,
              )?.operationEnabled
            : null,
        ).toBe(true);
        expect(
          originalRequest?.excludedScenario.mode === 'resolved'
            ? originalRequest.excludedScenario.effectDecisions.find(
                (decision) => decision.decisionKey === decisionKey,
              )?.operationEnabled
            : null,
        ).toBe(false);
      }
      const npSpecialFailure = inertNpSpecialGate?.failures.find(
        (failure) => failure.reason === 'userControlNpSpecialInputNotChanged',
      );
      expect(npSpecialOriginalRequest?.expectedDamageInput.enabled).toEqual(
        originalNpSpecial?.enabled.inputBinding.kind === 'bound'
          ? originalNpSpecial.enabled.inputBinding.value
          : null,
      );
      expect(npSpecialOriginalRequest?.expectedDamageInput.excluded).toEqual(
        originalNpSpecial?.excluded.inputBinding.kind === 'bound'
          ? originalNpSpecial.excluded.inputBinding.value
          : null,
      );
      expect(npSpecialOriginalRequest?.expectedDamageInput.enabled).not.toEqual(
        npSpecialOriginalRequest?.expectedDamageInput.excluded,
      );
      expect(inertNpSpecialGate).toMatchObject({
        status: 'failed',
        failures: [
          {
            reason: 'userControlNpSpecialInputNotChanged',
            canonicalIdentity: npSpecialFailure?.canonicalIdentity,
            firstDifference: { path: 'changed', expected: true, actual: false },
          },
        ],
      });
      expect(inertOperationGate).toMatchObject({
        failures: [
          {
            reason: 'userControlDidNotReachOperationOrDamage',
            firstDifference: { path: 'reached', expected: true, actual: false },
          },
        ],
      });
      expect(hpGate.status, JSON.stringify(hpGate.firstDifference)).toBe('passed');
      expect(scalarGate.status, JSON.stringify(scalarGate.firstDifference)).toBe('passed');
      expect(attemptGate.status).toBe('passed');
      expect(capacityAttemptGate.status, JSON.stringify(capacityAttemptGate.firstDifference)).toBe(
        'passed',
      );
      expect(capacityGate.status, JSON.stringify(capacityGate.firstDifference)).toBe('passed');
      expect(domainGate.status, JSON.stringify(domainGate.firstDifference)).toBe('passed');
      if (userControlGate.status !== 'passed')
        throw new Error(
          `production_user_control_ratchet_failed:${JSON.stringify({
            canonicalIdentity: userControlGate.canonicalIdentity,
            reason: userControlGate.failures[0]?.reason ?? null,
            firstDifference: userControlGate.firstDifference,
            failureCount: userControlGate.failures.length,
          })}`,
        );
      const battlePointProof = userControlObservations.find(
        (observation) => observation.battlePointWitness,
      );
      const target = battlePointProof?.enabled.executionObservation.targetExecution;
      if (battlePointProof && target?.selection === 'selected' && target.candidateState) {
        const missingRead = {
          ...battlePointProof,
          enabled: {
            ...battlePointProof.enabled,
            executionObservation: {
              ...battlePointProof.enabled.executionObservation,
              targetExecution: {
                ...target,
                candidateState: { ...target.candidateState, battlePointPhaseReads: [] },
              },
            },
          },
        };
        const rejected = auditProductionUserControlObservations({
          expectedProjectionCount: expectedUserControlIdentities.length,
          expectedIdentities: selectedExpectedIdentities,
          expectedBattlePointReads,
          observations: userControlObservations.map((observation) =>
            observation === battlePointProof ? missingRead : observation,
          ),
        });
        expect(rejected.status).toBe('failed');
        if (rejected.status === 'failed')
          expect(
            rejected.failures.some(
              (failure) => failure.reason === 'userControlBattlePointReadProofMissing',
            ),
          ).toBe(true);
      } else throw new Error('production_battle_point_proof_missing');
      // E2E-A032-DANTE-INVENTORY E2E-A032-SUMMER-WU-INVENTORY
      expect(master.servants).toHaveLength(469);
      expect(calculations).toHaveLength(422);
      expect(normalizationErrors).toEqual([]);
      expect(literalUnknownTraits).toEqual([]);
      expect({
        parameters: Object.fromEntries(Object.entries(semanticInventory.parameters).sort()),
        scripts: Object.fromEntries(Object.entries(semanticInventory.scripts).sort()),
      }).toEqual(expectedUnresolvedDamageSemantics);
      expect({
        user: allProjections.filter((effect) => effect.controllability === 'user').length,
        automaticVisible: allProjections.filter(
          (effect) => effect.controllability === 'automatic' && effect.visibility === 'visible',
        ).length,
        hidden: allProjections.filter((effect) => effect.visibility === 'hidden').length,
      }).toEqual({
        automaticVisible: 0,
        hidden: 5960,
        user: 1590,
      });
      expect(
        allProjections.filter(
          (effect) => effect.visibility === 'hidden' && effect.controllability === 'user',
        ),
      ).toEqual([]);
      expect({
        servants: new Set(multiBranchOrEffects.map((effect) => effect.servantId)).size,
        effects: multiBranchOrEffects.length,
      }).toEqual({ servants: 16, effects: 20 });
      expect([...conditionKinds].sort()).toEqual([
        'all',
        'always',
        'any',
        'card',
        'choice',
        'inputQuantity',
        'noblePhantasmVariant',
        'not',
        'operationTrigger',
        'quantity',
        'sourceQuantity',
        'targetPredicate',
        'trait',
        'unsupported',
      ]);
      expect(unsupportedFamilies).toEqual(expectedUnsupportedFamilies);
      expect(missingCandidateValues).toEqual([]);
      expect(invalidAutomaticConditions).toEqual([]);
      expect(userControlGate).toMatchObject({
        status: 'passed',
        summary: {
          projectionCount: expectedUserControlIdentities.length,
          selectedProfileCount: expectedUserControlIdentities.length,
          withoutAreaAlternateCount: 0,
        },
        failures: [],
      });
      expect(selectedUnsupportedProjections).toEqual([]);
      expect(targetContextRequiredProjections).toEqual([]);
      expect(
        Object.fromEntries(
          [...new Set(selectedUnsupportedProjections.map((item) => item.split(':', 1)[0]))]
            .sort()
            .map((servantId) => [
              servantId,
              selectedUnsupportedProjections.filter((item) => item.startsWith(`${servantId}:`))
                .length,
            ]),
        ),
      ).toEqual({});
      expect(declaredExclusivePairCount).toBe(4);
      expect(skippedExclusivePairs).toEqual([]);
      expect(exclusivePairCount).toBe(4);
      expect(conflictPairs).toEqual({ effectEffect: 4, factFact: 0, factEffect: 0 });
      expect({
        combinations: canonicalFactConditionConflicts,
        effects: canonicalConflictEffects.size,
        servants: canonicalConflictServants.size,
      }).toEqual({ combinations: 10, effects: 7, servants: 3 });
      expect(invalidExclusiveCalculations).toEqual([]);
      expect(invalidConflictInputs).toEqual([]);
      expect(archetype?.result.status).toBe('calculated');
      expect(archetype?.input.fieldTraits).toContain('milleniumCastle');
      expect(
        archetype?.effects.find((effect) => effect.label === 'バスターアップ：千年城'),
      ).toMatchObject({ value: 0.3, outcome: 'applied' });
      expect(
        archetype?.effects.find(
          (effect) => effect.label === '防御力ダウン' && effect.visibility === 'visible',
        ),
      ).toMatchObject({
        value: 0.2,
        outcome: 'applied',
        explanation: { code: 'applied' },
      });
      expect(soujuurou?.result.status).toBe('calculated');
      expect(soujuurou?.input.ignoreDamageCut).toBe(true);
      expect(
        soujuurou?.effects.find((effect) => effect.label === 'ダメージカット貫通'),
      ).toMatchObject({
        modifier: 'ignoreDamageCut',
        outcome: 'applied',
      });
      expect(dante?.result.status).toBe('calculated');
      for (const label of ['威力アップ・対 天の力', '威力アップ・対 地の力', '宝具威力アップ'])
        expect(dante?.effects.some((effect) => effect.label === label)).toBe(true);
      expect(summerWu?.result.status).toBe('calculated');
      expect(summerWu?.input.targetStateTraits).toContain('undead');
      expect(summerWu?.effects.find((effect) => effect.label === '死霊特性付与')).toMatchObject({
        visibility: 'hidden',
        outcome: 'applied',
      });
      expect(summerLilith?.result.status).toBe('calculated');
      expect(summerLilith?.input.npSpecialMultipliers).toEqual([1, 1, 1, 1, 1]);
      expect(summerLilith?.effects.find((effect) => effect.modifier === 'npSpecial')).toMatchObject(
        {
          outcome: 'notApplied',
          explanation: { code: 'unresolved' },
        },
      );
    },
  );

  it(
    'persists the original control HP preparation diagnostics with complete receipts',
    {
      timeout: 60_000,
      ...productionAuditTestOptions([
        'production-preparation-hp.json',
        'production-preparation-hp-attempt.json',
      ]),
    },
    async ({ task }) => {
      const payloads = hpPreparationArtifactPayloads;
      if (!payloads) throw new TypeError('production_control_hp_artifact_payloads_missing');
      for (const [path, payload] of [
        ['production-preparation-hp.json', payloads.preparation],
        ['production-preparation-hp-attempt.json', payloads.attempt],
      ] as const) {
        const receipt = await writeProductionAuditArtifact(
          task.meta,
          path,
          encodeProductionAuditDiagnostic(payload),
        );
        const bytes = await readStoredProductionAuditArtifact(path);
        expect(bytes.length).toBe(receipt.expectedBytes);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(receipt.expectedSha256);
        const saved = decodeStoredProductionAuditArtifact(bytes) as ReturnType<
          typeof encodeProductionAuditDiagnostic
        >;
        expect(isDeepStrictEqual(decodeProductionAuditDiagnostic(saved), payload)).toBe(true);
      }
      hpPreparationArtifactPayloads = undefined;
    },
  );

  it(
    'connects original maximumFixed controls through the shared consumer with complete diagnostics',
    {
      timeout: 60_000,
      ...productionAuditTestOptions(['production-preparation-hp-maximum-fixed.json']),
    },
    async ({ task }) => {
      // Reuse the original selected controls, owner captures and one parsed master; never reexecute.
      const master = await loadProductionMaster();
      const maximumFixedGate = auditPublishedMaximumFixed(
        master,
        maximumFixedRequests,
        maximumFixedSelections,
        maximumFixedPrograms,
        maximumFixedObservations,
      );
      const maximumFixedProof = {
        originalControlPopulation: { expected: true, actual: maximumFixedPopulationComplete },
        gate: maximumFixedGate,
        proofs: maximumFixedObservations.map(maximumFixedDiagnostic),
      };
      await writeProductionAuditArtifact(
        task.meta,
        'production-preparation-hp-maximum-fixed.json',
        encodeProductionAuditDiagnostic(maximumFixedProof),
      );
      const savedMaximumFixed = decodeStoredProductionAuditArtifact(
        await readStoredProductionAuditArtifact('production-preparation-hp-maximum-fixed.json'),
      ) as ReturnType<typeof encodeProductionAuditDiagnostic>;
      expect(
        isDeepStrictEqual(decodeProductionAuditDiagnostic(savedMaximumFixed), maximumFixedProof),
      ).toBe(true);

      expect(maximumFixedPopulationComplete).toBe(true);
      expect(maximumFixedGate.status, JSON.stringify(maximumFixedGate.firstDifference)).toBe(
        'passed',
      );
    },
  );

  it(
    'connects original selectedAlly maximumFixed controls through the shared consumer with complete diagnostics',
    {
      timeout: 60_000,
      ...productionAuditTestOptions(['production-preparation-hp-selected-ally-maximum-fixed.json']),
    },
    async ({ task }) => {
      // Reuse the original selected controls, owner captures and one parsed master; never reexecute.
      const master = await loadProductionMaster();
      // Fix expectations from original controls; the gate captures immutable actual proofs in this call.
      // The canonical ledger and immutable prepared/evaluated owners were retained before filtering.
      for (const request of selectedAllyRequests) {
        const selection = selectedAllyMaximumFixedSelection(
          request.prepared,
          request.calculation,
          selectedAllySelections.length,
        );
        if (!selection) continue; // Canonical choice selected no writer; never an execution-success filter.
        const direct = evaluatePreparedCalculationResult(request.prepared, request.versions);
        selectedAllySelections.push(selection);
        selectedAllyPrograms.push(selectedAllyMaximumFixedProgram(selection, direct));
        selectedAllyObservations.push(selectedAllyMaximumFixedSource(selection, direct));
      }
      const maximumFixedGate = auditPublishedSelectedAllyMaximumFixed(
        master,
        selectedAllyRequests,
        selectedAllySelections,
        selectedAllyPrograms,
        selectedAllyObservations,
        selectedAllyCanonicalRequests,
      );
      const maximumFixedProof = {
        originalControlPopulation: { expected: true, actual: maximumFixedPopulationComplete },
        gate: maximumFixedGate,
      };
      await writeProductionAuditArtifact(
        task.meta,
        'production-preparation-hp-selected-ally-maximum-fixed.json',
        encodeProductionAuditDiagnostic(maximumFixedProof),
      );
      const savedMaximumFixed = decodeStoredProductionAuditArtifact(
        await readStoredProductionAuditArtifact(
          'production-preparation-hp-selected-ally-maximum-fixed.json',
        ),
      ) as ReturnType<typeof encodeProductionAuditDiagnostic>;
      expect(
        isDeepStrictEqual(decodeProductionAuditDiagnostic(savedMaximumFixed), maximumFixedProof),
      ).toBe(true);

      expect(maximumFixedPopulationComplete).toBe(true);
      expect(maximumFixedGate.status, JSON.stringify(maximumFixedGate.firstDifference)).toBe(
        'passed',
      );
    },
  );

  it(
    'connects original receive controls to their separate fixed HP consumers',
    {
      timeout: 60_000,
      ...productionAuditTestOptions(['production-preparation-hp-receive.json']),
    },
    async ({ task }) => {
      const master = await loadProductionMaster();
      const gate = auditPublishedReceive(
        master,
        receiveRequests,
        receivePrograms,
        receiveObservations,
      );
      const proof = {
        originalControlPopulation: { expected: true, actual: maximumFixedPopulationComplete },
        gate,
        proofs: receiveObservations.map(receiveDiagnostic),
      };
      await writeProductionAuditArtifact(
        task.meta,
        'production-preparation-hp-receive.json',
        encodeProductionAuditDiagnostic(proof),
      );
      const saved = decodeStoredProductionAuditArtifact(
        await readStoredProductionAuditArtifact('production-preparation-hp-receive.json'),
      ) as ReturnType<typeof encodeProductionAuditDiagnostic>;
      expect(isDeepStrictEqual(decodeProductionAuditDiagnostic(saved), proof)).toBe(true);
      expect(maximumFixedPopulationComplete).toBe(true);
      expect(gate.status, JSON.stringify(gate.firstDifference)).toBe('passed');
    },
  );

  it(
    'retains the original receive control request population in the attempt gate',
    {
      timeout: 60_000,
      ...productionAuditTestOptions(['production-preparation-hp-receive-attempt.json']),
    },
    async ({ task }) => {
      const gate = auditReceiveAttemptIsolation({
        requests: receiveRequests,
        expected: receiveAttemptPrograms,
        observations: receiveObservations,
      });
      const proof = {
        originalControlPopulation: { expected: true, actual: maximumFixedPopulationComplete },
        gate,
        proofs: receiveObservations.map(receiveAttemptDiagnostic),
      };
      const receipt = await writeProductionAuditArtifact(
        task.meta,
        'production-preparation-hp-receive-attempt.json',
        encodeProductionAuditDiagnostic(proof),
      );
      const bytes = await readStoredProductionAuditArtifact(
        'production-preparation-hp-receive-attempt.json',
      );
      expect(bytes.length).toBe(receipt.expectedBytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(receipt.expectedSha256);
      expect(
        isDeepStrictEqual(
          decodeProductionAuditDiagnostic(
            decodeStoredProductionAuditArtifact(bytes) as ReturnType<
              typeof encodeProductionAuditDiagnostic
            >,
          ),
          proof,
        ),
      ).toBe(true);
      expect(maximumFixedPopulationComplete).toBe(true);
      expect(gate.status, JSON.stringify(gate.firstDifference)).toBe('passed');
      expect(gate.isolated).toBe(0);
    },
  );

  it(
    'calculates or rejects every support projection through the shared decision path',
    {
      ...productionAuditTestOptions(['production-hp-support-value-expression.json']),
      timeout: 120_000,
    },
    async ({ task }) => {
      const master = await loadProductionMaster();
      const hpDeclarations = hpProofCoverageInventory(master).filter(
        (declaration) =>
          declaration.identity.kind === 'valueExpression' &&
          declaration.operation?.kind === 'damageModifier' &&
          declaration.operation.route.target === 'partyMember' &&
          declaration.operation.route.contributionScope === 'partyWide' &&
          declaration.operation.route.eligibility.kind === 'requiredRecipient' &&
          declaration.operation.route.eligibility.recipient === 'attacker',
      );
      const supportHpRequests: HpPublishedDependencyRequest[] = [];
      const supportHpInputCommandEdges: HpAuditInputCommandEdge[] = [];
      const attacker = master.servants.find((servant) => servant.id === '100100')!;
      const versions: VersionContext = {
        schemaVersion: SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
        appVersion: '0.1.0',
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
        masterDataVersion: master.version,
      };
      const failures: string[] = [];
      const intrinsicRecipientConflicts: string[] = [];
      const supportDispositions: {
        servantId: string;
        skillId: string;
        key: string;
        status: string;
        outcome: EffectProjection['outcome'] | undefined;
        explanation: EffectProjection['explanation'] | undefined;
      }[] = [];
      const typedUnsupported: string[] = [];
      let projectionCount = 0;
      const preparationRejected: string[] = [];
      for (const source of master.servants) {
        for (const skill of source.skills) {
          let scenario: ResolvedScenario = {
            ...createDefaultResolvedScenario(master, undefined, attacker),
            preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' }],
            support: {
              sourceTemplateId: null,
              composition: {
                sources: [
                  {
                    sourceInstanceId: `audit:${source.id}:${skill.id}`,
                    servantId: source.id,
                    skills: [{ skillId: skill.id, skillLevel: 10, enabled: true }],
                  },
                ],
                effectInclusions: [],
              },
            },
          };
          const hasHpExpression = skill.effects.some((effect) =>
            hpDeclarations.some((declaration) => declaration.effect === effect),
          );
          const evaluateSupport = (
            request: ResolvedScenario,
            requestPhase: NonNullable<HpPublishedDependencyRequest['requestPhase']>,
          ) => {
            if (!hasHpExpression) return calculateScenarioOutcome(request, master, versions);
            const prepared = prepareCalculationScenarioWithPolicy(
              request,
              master,
              { kind: 'calculator' },
              {},
              true,
            );
            const owner: HpPublishedDependencyRequest = {
              prepared,
              ownerScope: 'supportProjection',
              requestPhase,
            };
            supportHpRequests.push(owner);
            const calculation = evaluatePreparedCalculationScenario(prepared, versions);
            owner.calculation = calculation;
            return calculation;
          };
          let baseline = evaluateSupport(scenario, 'original');
          const repaired = new Set<string>();
          while (baseline.result.status === 'inputRequired') {
            const input = baseline.inputDefinitions.find(
              (input) =>
                ['worldTraitPresence', 'sourceMaximumHp', 'sourceChoice'].includes(input.kind) &&
                !repaired.has(input.key),
            );
            if (!input) break;
            repaired.add(input.key);
            const command = {
              kind: 'setCanonicalIntegerInput',
              key: input.key,
              value: input.kind === 'sourceMaximumHp' ? 10000 : 0,
            } as const;
            const fromRequestIndex = supportHpRequests.length - 1;
            scenario = applyCanonicalInputCommand(scenario, command);
            baseline = evaluateSupport(scenario, 'repairAttempt');
            if (hasHpExpression)
              supportHpInputCommandEdges.push({
                fromRequestIndex,
                command,
                toRequestIndex: supportHpRequests.length - 1,
              });
          }
          if (baseline.status === 'rejected') {
            preparationRejected.push(
              `${source.id}:${skill.id}:${baseline.result.issues.map((issue) => issue.code).join(',')}`,
            );
            continue;
          }
          const projections = baseline.effects.filter(
            (effect) => effect.source.origin === 'support' && effect.controllability === 'user',
          );
          projectionCount += projections.length;
          for (const projection of projections) {
            const values = Object.fromEntries(
              projection.requiredInputs.map((input) => [
                input.key,
                input.defaultValue ?? input.minimum,
              ]),
            );
            const scenarioWithInputs = {
              ...scenario,
              canonicalInputValues: Object.fromEntries(
                Object.entries({
                  ...Object.fromEntries(
                    Object.entries(scenario.canonicalInputValues).map(([key, input]) => [
                      key,
                      input.value,
                    ]),
                  ),
                  ...values,
                }).map(([key, value]) => [key, { kind: 'integer' as const, value }]),
              ),
            };
            const withInputs = requireExecutableCalculation(
              evaluateSupport(scenarioWithInputs, 'withInputs'),
            );
            const current = withInputs.effects.find(
              (effect) => effect.projectionKey === projection.projectionKey,
            );
            if (!current) {
              failures.push(`${source.id}:${skill.id}:${projection.projectionKey}:missing`);
              continue;
            }
            const selected = requireExecutableCalculation(
              evaluateSupport(
                applyEffectControlPresentationDecision(
                  scenarioWithInputs,
                  withInputs.effectControls.find(
                    (control) => control.key === current.projectionKey,
                  )!,
                  true,
                  withInputs.activationRequirements,
                  withInputs.effects,
                  withInputs.effectInputs,
                ),
                'selected',
              ),
            );
            const outcome = selected.effects.find(
              (effect) => effect.projectionKey === projection.projectionKey,
            )?.outcome;
            supportDispositions.push({
              servantId: source.id,
              skillId: skill.id,
              key: projection.projectionKey,
              status: selected.result.status,
              outcome,
              explanation: selected.effects.find(
                (effect) => effect.projectionKey === projection.projectionKey,
              )?.explanation,
            });
            const isIntrinsicRecipientConflict =
              selected.result.status === 'unsupported' &&
              selected.result.missingEvidence.length > 0 &&
              selected.result.missingEvidence.every((reason) =>
                reason.startsWith('constraintConflict:'),
              ) &&
              outcome !== 'applied';
            if (isIntrinsicRecipientConflict) {
              intrinsicRecipientConflicts.push(
                `${source.id}:${skill.id}:${projection.projectionKey}`,
              );
              continue;
            }
            if (selected.result.status === 'unsupported' && outcome === 'unsupported') {
              typedUnsupported.push(`${source.id}:${skill.id}:${projection.projectionKey}`);
              continue;
            }
            if (selected.result.status !== 'calculated' || outcome === 'unsupported')
              failures.push(
                `${source.id}:${skill.id}:${projection.projectionKey}:${selected.result.status}:${String(outcome)}:${selected.effectWarnings.join('|')}`,
              );
          }
        }
      }
      if (process.env['FGO_TEST_ARTIFACT_DIR'])
        await writeFile(
          resolve(process.env['FGO_TEST_ARTIFACT_DIR'], 'oc-support-dispositions.json'),
          JSON.stringify({ supportDispositions, preparationRejected }),
        );
      const supportHpBindings = hpPublishedDependencyBindings(hpDeclarations, supportHpRequests);
      const supportHpCoverage = reconcileHpPublishedDependencyCoverage(
        hpDeclarations,
        supportHpRequests,
        supportHpBindings.bindings,
      );
      const supportHpOperationEvidence = reconcileHpOperationEvidence(
        hpProofCoverageInventory(master),
        supportHpRequests,
        supportHpInputCommandEdges,
      );
      const supportHpArtifact = {
        ...supportHpCoverage,
        inputCommandEvidence: {
          inputCommandEdges: supportHpInputCommandEdges,
          gate: supportHpOperationEvidence.gate,
        },
      };
      const supportHpReceipt = await writeProductionAuditArtifact(
        task.meta,
        'production-hp-support-value-expression.json',
        supportHpArtifact,
      );
      const supportHpBytes = await readStoredProductionAuditArtifact(
        'production-hp-support-value-expression.json',
      );
      expect([
        supportHpBytes.length,
        createHash('sha256').update(supportHpBytes).digest('hex'),
      ]).toEqual([supportHpReceipt.expectedBytes, supportHpReceipt.expectedSha256]);
      expect(
        isDeepStrictEqual(decodeStoredProductionAuditArtifact(supportHpBytes), supportHpArtifact),
      ).toBe(true);
      expect(supportHpCoverage.gate.failures).toEqual([]);
      expect(supportHpOperationEvidence.gate.failures).toEqual([]);
      expect(supportHpCoverage.declarations).toHaveLength(10);
      expect(supportHpCoverage.requests.map((request) => request.requestPhase)).toEqual([
        'original',
        'withInputs',
        'selected',
        'withInputs',
        'selected',
      ]);
      expect(
        supportHpCoverage.declarations.every(
          (declaration) =>
            declaration.directScenarioOwnerRequests.length === supportHpRequests.length,
        ),
      ).toBe(true);
      const supportSelections = supportHpCoverage.declarations.flatMap((declaration) =>
        'supportValueSelections' in declaration ? declaration.supportValueSelections : [],
      );
      expect(
        supportSelections.filter(
          (selection) => selection.disposition === 'selectedCellNoNativeStep',
        ),
      ).toHaveLength(supportHpRequests.length);
      expect(
        supportSelections
          .filter((selection) => selection.disposition === 'selectedCellNoNativeStep')
          .every(
            (selection) =>
              'actualRead' in selection &&
              typeof selection.actualRead === 'object' &&
              selection.actualRead.consumed,
          ),
      ).toBe(true);
      expect(
        supportSelections.filter((selection) => selection.disposition === 'otherCellSelected'),
      ).toHaveLength(9 * supportHpRequests.length);
      expect(
        supportHpCoverage.bindings.filter((binding) => binding.stage === 'selectedPreparationCell'),
      ).toHaveLength(supportHpRequests.length);
      const valueReads = supportHpCoverage.bindings.filter(
        (binding) => binding.stage === 'actualValueRead',
      );
      expect(valueReads).toHaveLength(supportHpRequests.length);
      expect(
        valueReads.every(
          (binding) =>
            binding.operation?.kind === 'addModifier' &&
            binding.operation.source.origin === 'support' &&
            binding.operation.source.sourceId === '300900' &&
            binding.operation.source.skillId === '49650' &&
            binding.operation.source.effectOccurrenceId === '23498:0',
        ),
      ).toBe(true);
      expect(
        hpDeclarations.every(
          (declaration) =>
            declaration.operation?.kind === 'damageModifier' &&
            declaration.operation.route.eligibility.kind === 'requiredRecipient' &&
            declaration.operation.route.eligibility.recipient === 'attacker',
        ),
      ).toBe(true);
      expect(
        valueReads.map((binding) => ({
          path: binding.declaration.path,
          actor: binding.actor,
          recipient: binding.recipient,
          detail: binding.detail,
        })),
      ).toEqual(
        Array.from({ length: supportHpRequests.length }, () => ({
          path: 'execution.0.valueExpressions.0.9',
          actor: 'attacker',
          recipient: 'partyMember',
          detail: {
            selectedCellPath: 'execution.0.valueExpressions.0.9',
            permille: 1000,
            resolvedValue: 0,
            operationOutcome: 'applied',
            contributionIncluded: true,
            modifierAppended: true,
            transaction: 'committed',
            consumed: true,
          },
        })),
      );
      expect(
        supportHpCoverage.bindings
          .filter((binding) => binding.stage === 'selectedPreparationCell')
          .every((binding) => {
            const detail = binding.detail as {
              steps: readonly unknown[];
              native: { status: string; outcomes: readonly { outcome: string }[] };
            };
            return (
              detail.steps.length === 0 &&
              detail.native.status === 'committed' &&
              detail.native.outcomes.every((outcome) => outcome.outcome === 'notApplicable')
            );
          }),
      ).toBe(true);
      const selectedBinding = supportHpBindings.bindings.find(
        (binding) => binding.stage === 'selectedPreparationCell',
      )!;
      const reasons = (bindings: typeof supportHpBindings.bindings) =>
        reconcileHpPublishedDependencyCoverage(
          hpDeclarations,
          supportHpRequests,
          bindings,
        ).gate.failures.map((failure) => failure.reason);
      expect(reasons(supportHpBindings.bindings.filter((b) => b !== selectedBinding))).toContain(
        'missingBinding',
      );
      expect(reasons([...supportHpBindings.bindings, selectedBinding])).toContain(
        'duplicateBinding',
      );
      expect(reasons([...supportHpBindings.bindings].reverse())).toContain('orderMismatch');
      for (const changed of [
        { ...selectedBinding, reference: { ...selectedBinding.reference } },
        { ...selectedBinding, family: 'foreign' },
        { ...selectedBinding, actor: 'foreign' },
        { ...selectedBinding, recipient: 'foreign' },
        { ...selectedBinding, sourceInstanceId: 'foreign' },
        {
          ...selectedBinding,
          detail: { ...selectedBinding.detail, native: { status: 'rejected' } },
        },
      ])
        expect(
          reasons(
            supportHpBindings.bindings.map((binding) =>
              binding === selectedBinding ? (changed as typeof selectedBinding) : binding,
            ),
          ),
        ).not.toEqual([]);
      const selectedRead = supportHpBindings.bindings.find(
        (binding) => binding.stage === 'actualValueRead',
      )!;
      expect(reasons(supportHpBindings.bindings.filter((b) => b !== selectedRead))).toContain(
        'missingBinding',
      );
      expect(reasons([...supportHpBindings.bindings, selectedRead])).toContain('duplicateBinding');
      for (const changed of [
        { ...selectedRead, reference: { ...selectedRead.reference } },
        { ...selectedRead, declaration: hpDeclarations[0]! },
        { ...selectedRead, actor: 'support' },
        { ...selectedRead, recipient: 'sourceSelf' },
        { ...selectedRead, detail: { ...selectedRead.detail, transaction: 'rolledBack' } },
        { ...selectedRead, detail: { ...selectedRead.detail, consumed: false } },
      ])
        expect(
          reasons(
            supportHpBindings.bindings.map((binding) =>
              binding === selectedRead ? changed : binding,
            ),
          ),
        ).not.toEqual([]);
      expect(preparationRejected).toEqual([
        '102800:165551:preparation:insufficientNpGauge',
        '304000:671650:preparation:unsupportedOcExecution',
      ]);
      expect(projectionCount).toBe(379);
      expect(intrinsicRecipientConflicts).toEqual([]);
      // Exclusive intrinsic attributes are proven false by the shared condition owner.
      for (const key of [
        'support:audit:200200:2167650:2167650:9963:0',
        'support:audit:2501300:2276451:2276451:21180:0',
      ]) {
        expect(supportDispositions.find((entry) => entry.key === key)).toMatchObject({
          status: 'calculated',
          outcome: 'notApplied',
          explanation: { code: 'conditionNotMet' },
        });
      }
      expect(typedUnsupported).toEqual([]);
      expect(failures).toEqual([]);
    },
  );

  it(
    'joins original noHealing requests to enemy native modifier appends',
    productionAuditTestOptions(['production-hp-no-healing.json']),
    async ({ task }) => {
      const master = await loadProductionMaster();
      const declarations = hpProofCoverageInventory(master);
      const gate = auditNoHealing({
        requests: hpPublishedDependencyRequests,
        declarations,
        expected: noHealingPrograms,
        observations: noHealingObservations,
      });
      const audit = (input: Partial<Parameters<typeof auditNoHealing>[0]>) =>
        auditNoHealing({
          requests: hpPublishedDependencyRequests,
          declarations,
          expected: noHealingPrograms,
          observations: noHealingObservations,
          ...input,
        });
      const first = noHealingObservations[0]!;
      const transition = first.transitions![0]!;
      const action = transition.hpActions![0]!;
      const withAction = (changed: typeof action) => ({
        ...first,
        transitions: [
          { ...transition, hpActions: [changed, ...transition.hpActions!.slice(1)] },
          ...first.transitions!.slice(1),
        ],
      });
      const write = action.noHealingWrites![0]!;
      const withoutNative = { ...action };
      delete withoutNative.native;
      const negativeChecks = [
        [
          'missingRequest',
          audit({
            requests: hpPublishedDependencyRequests.slice(0, noHealingPrograms[0]!.selection.index),
          }),
        ],
        [
          'duplicateRequest',
          audit({
            expected: [noHealingPrograms[0]!, noHealingPrograms[0]!, ...noHealingPrograms.slice(2)],
          }),
        ],
        [
          'unmatchedRequest',
          audit({
            expected: noHealingPrograms.slice(1),
            observations: noHealingObservations.slice(1),
          }),
        ],
        [
          'orderMismatch',
          audit({
            observations: [
              noHealingObservations[1]!,
              noHealingObservations[0]!,
              ...noHealingObservations.slice(2),
            ],
          }),
        ],
        [
          'foreignIdentity',
          audit({
            declarations: declarations.filter(
              (d) =>
                d.operation !== noHealingPrograms[0]!.selection.canonical.writers[0]!.operation,
            ),
          }),
        ],
        [
          'foreignReference',
          audit({
            observations: [
              { ...first, scenario: { ...first.scenario } },
              ...noHealingObservations.slice(1),
            ],
          }),
        ],
        [
          'nativeMissing',
          audit({ observations: [withAction(withoutNative), ...noHealingObservations.slice(1)] }),
        ],
        [
          'recipientMismatch',
          audit({
            observations: [
              withAction({
                ...action,
                noHealingWrites: [
                  {
                    ...write,
                    modifiers: [
                      { ...write.modifiers[0]!, actor: 'attacker' },
                      ...write.modifiers.slice(1),
                    ],
                  },
                ],
              }),
              ...noHealingObservations.slice(1),
            ],
          }),
        ],
        [
          'transactionMismatch',
          audit({
            observations: [
              withAction({
                ...action,
                native: { ...action.native!, status: 'invalid', reason: 'fixtureReject' },
                returned: action.attempted!,
              }),
              ...noHealingObservations.slice(1),
            ],
          }),
        ],
      ] as const;
      const payload = {
        qualification:
          'Original selected enemy noHealing preparation/native appends only; no later physical gain read, committed consumption or recovery is inferred.',
        declarations: declarations.filter(
          (declaration) =>
            declaration.identity.kind === 'writer' &&
            declaration.operation?.kind === 'hpModifier' &&
            declaration.operation.action === 'noHealing',
        ),
        requestIndices: noHealingPrograms.map((program) => program.selection.index),
        proofs: noHealingObservations.map(noHealingDiagnostic),
        gate,
        negativeChecks,
      };
      const receipt = await writeProductionAuditArtifact(
        task.meta,
        'production-hp-no-healing.json',
        encodeProductionAuditDiagnostic(payload),
      );
      const bytes = await readStoredProductionAuditArtifact('production-hp-no-healing.json');
      expect([bytes.length, createHash('sha256').update(bytes).digest('hex')]).toEqual([
        receipt.expectedBytes,
        receipt.expectedSha256,
      ]);
      expect(
        isDeepStrictEqual(
          decodeProductionAuditDiagnostic(
            decodeStoredProductionAuditArtifact(bytes) as ReturnType<
              typeof encodeProductionAuditDiagnostic
            >,
          ),
          payload,
        ),
      ).toBe(true);
      expect(gate.failures).toEqual([]);
      expect([
        gate.requestCount,
        gate.noCanonicalSelection,
        gate.selected,
        gate.reached,
        gate.nativeAttempts,
        gate.nativeCommitted,
        gate.committedModifiers,
      ]).toEqual([3186, 3176, 10, 10, 10, 10, 30]);
      for (const [reason, negative] of negativeChecks) {
        expect(negative.failures.some((failure) => failure.reason === reason)).toBe(true);
        expect(negative.firstDifference).not.toBeNull();
      }
    },
  );

  it(
    'joins original requests to every selected HP operation attempt',
    productionAuditTestOptions(['production-hp-operation-evidence.json']),
    async ({ task }) => {
      const declarations = hpProofCoverageInventory(await loadProductionMaster());
      const evidence = reconcileHpOperationEvidence(declarations, hpPublishedDependencyRequests);
      const receipt = await writeProductionAuditArtifact(
        task.meta,
        'production-hp-operation-evidence.json',
        evidence,
      );
      const bytes = await readStoredProductionAuditArtifact(
        'production-hp-operation-evidence.json',
      );
      expect([bytes.length, createHash('sha256').update(bytes).digest('hex')]).toEqual([
        receipt.expectedBytes,
        receipt.expectedSha256,
      ]);
      expect(isDeepStrictEqual(decodeStoredProductionAuditArtifact(bytes), evidence)).toBe(true);
      expect(evidence.gate.failures).toEqual([]);
      expect(evidence.requestCount).toBe(3186);
      expect(evidence.rows.some((row) => row.attempted && row.transaction === 'committed')).toBe(
        true,
      );
    },
  );

  it('calculates every craft-essence and mystic-code user projection', async () => {
    const master = await loadProductionMaster();
    const attacker = master.servants.find((servant) => servant.id === '100100')!;
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    const base: ResolvedScenario = {
      ...createDefaultResolvedScenario(master, undefined, attacker),
      preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' }],
    };
    const failures: string[] = [];
    let projectionCount = 0;
    const verify = (scenario: typeof base, origin: 'craftEssence' | 'mysticCode') => {
      const baseline = calculateScenario(scenario, master, versions);
      if (baseline.result.status !== 'calculated') {
        failures.push(`${origin}:baseline:${baseline.result.status}`);
        return;
      }
      for (const projection of baseline.effects.filter(
        (effect) => effect.source.origin === origin && effect.controllability === 'user',
      )) {
        projectionCount += 1;
        const selected = calculateScenario(
          applyEffectProjectionDecision(scenario, projection, true),
          master,
          versions,
        );
        const outcome = selected.effects.find(
          (effect) => effect.projectionKey === projection.projectionKey,
        )?.outcome;
        if (selected.result.status !== 'calculated' || outcome === 'unsupported')
          failures.push(
            `${origin}:${projection.projectionKey}:${selected.result.status}:${String(outcome)}`,
          );
      }
    };
    for (const craftEssence of master.craftEssences)
      for (const limitBreak of [0, 4] as const)
        verify(
          {
            ...base,
            craftEssence: {
              craftEssenceId: craftEssence.id,
              level: craftEssence.maxLevelByLimitBreak[limitBreak],
              limitBreak,
            },
          },
          'craftEssence',
        );
    for (const code of master.mysticCodes)
      for (const skill of code.skills)
        verify(
          {
            ...base,
            mysticCode: {
              mysticCodeId: code.id,
              skills: [{ skillId: skill.id, skillLevel: 10, enabled: true }],
            },
          },
          'mysticCode',
        );
    expect(projectionCount).toBe(1_592);
    expect(failures).toEqual([]);
  }, 180_000);
});
