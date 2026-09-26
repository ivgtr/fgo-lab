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
import { describe, expect, it } from 'vitest';
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
  const calculation = requireExecutableCalculation(
    evaluatePreparedCalculationScenario(prepared, versions),
  );
  if (calculation.executionObservation !== prepared.executionObservation)
    throw new TypeError(`production_control_observation_mismatch:${scenario.attacker.servantId}`);
  controlPreparations.set(calculation, prepared);
  const scalar = scalarQuantityProgram(prepared, calculation);
  if (scalar) scalarQuantityObservations.push(scalarQuantitySource(scalar));
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
      ]),
    },
    async ({ task }) => {
      const master = await loadProductionMaster();
      const versions: VersionContext = {
        schemaVersion: SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
        appVersion: '0.1.0',
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
        masterDataVersion: master.version,
      };
      scalarQuantityObservations.length = 0;
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
      const userControlGate = auditProductionUserControlObservations({
        expectedProjectionCount: expectedUserControlIdentities.length,
        expectedIdentities: selectedExpectedIdentities,
        expectedBattlePointReads,
        expectedCriticalStarsForward,
        observations: userControlObservations,
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
        observations: userControlObservations,
      });
      expect(scalarGate.status, JSON.stringify(scalarGate.firstDifference)).toBe('passed');
      if (userControlGate.status !== 'passed')
        throw new Error(
          `production_user_control_ratchet_failed:${JSON.stringify({
            canonicalIdentity: userControlGate.canonicalIdentity,
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

  it('calculates or rejects every support projection through the shared decision path', async () => {
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
        let baseline = calculateScenarioOutcome(scenario, master, versions);
        const repaired = new Set<string>();
        while (baseline.result.status === 'inputRequired') {
          const input = baseline.inputDefinitions.find(
            (input) =>
              ['worldTraitPresence', 'sourceMaximumHp', 'sourceChoice'].includes(input.kind) &&
              !repaired.has(input.key),
          );
          if (!input) break;
          repaired.add(input.key);
          scenario = applyCanonicalInputCommand(scenario, {
            kind: 'setCanonicalIntegerInput',
            key: input.key,
            value: input.kind === 'sourceMaximumHp' ? 10000 : 0,
          });
          baseline = calculateScenarioOutcome(scenario, master, versions);
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
          const withInputs = calculateScenario(scenarioWithInputs, master, versions);
          const current = withInputs.effects.find(
            (effect) => effect.projectionKey === projection.projectionKey,
          );
          if (!current) {
            failures.push(`${source.id}:${skill.id}:${projection.projectionKey}:missing`);
            continue;
          }
          const selected = calculateScenario(
            applyEffectControlPresentationDecision(
              scenarioWithInputs,
              withInputs.effectControls.find((control) => control.key === current.projectionKey)!,
              true,
              withInputs.activationRequirements,
              withInputs.effects,
              withInputs.effectInputs,
            ),
            master,
            versions,
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
  }, 120_000);

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
