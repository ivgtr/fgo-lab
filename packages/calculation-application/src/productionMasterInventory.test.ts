import { applyCanonicalInputCommand } from './canonicalInputs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  canonicalRequirementLeaves,
  getNoblePhantasmVariants,
  masterSnapshotSchema,
  type MasterEffect,
} from '@fgo-lab/master-data';
import {
  canNormalizeDamageEffect,
  canonicalExclusiveGroup,
  canonicalExclusiveTraits,
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
  calculateScenario as calculateScenarioOutcome,
  createDefaultResolvedScenario,
  requireExecutableCalculation,
} from './scenario';
const calculateScenario = (...args: Parameters<typeof calculateScenarioOutcome>) =>
  requireExecutableCalculation(calculateScenarioOutcome(...args));
import { setEffectSourceEnabled } from './scenarioCommands';

const root = resolve(import.meta.dirname, '../../..');
let productionMaster: Promise<ReturnType<typeof masterSnapshotSchema.parse>> | undefined;
type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

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

const expectedUnsupportedFamilies = {
  '705300': ['unsupportedOperation'],
} as const;

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
  it('preserves every damage-reachable target-state grant and removal', async () => {
    const master = await loadProductionMaster();
    const targetStateTraits = [
      'buffBound',
      'buffBurn',
      'buffCharm',
      'buffConfusion',
      'buffCurse',
      'buffDeathResistDown',
      'buffEvade',
      'buffImmobilize',
      'buffMentalEffect',
      'buffNegativeEffect',
      'buffPoison',
      'buffTerrorStunChanceAfterTurn',
      'marking',
      'skillSeal',
      'traitId:10047',
      'traitId:10052',
    ] as const;
    const targetStateTraitSet = new Set<string>(targetStateTraits);
    const effects: {
      ownerId: string;
      source: string;
      effect: MasterEffect;
      timing: 'beforeDamage' | 'afterDamage' | null;
    }[] = [
      ...master.servants.flatMap((servant) => [
        ...[...servant.skills, ...servant.passives].flatMap((skill) =>
          skill.effects.map((effect) => ({
            ownerId: servant.id,
            source: 'skill',
            effect,
            timing: null,
          })),
        ),
        ...getNoblePhantasmVariants(servant).flatMap((variant) =>
          variant.effects.map((effect) => ({
            ownerId: servant.id,
            source: 'np',
            effect,
            timing: effect.timing,
          })),
        ),
      ]),
      ...master.craftEssences.flatMap((craftEssence) =>
        craftEssence.effects.map((effect) => ({
          ownerId: craftEssence.id,
          source: 'equip',
          effect,
          timing: null,
        })),
      ),
      ...master.mysticCodes.flatMap((mysticCode) =>
        mysticCode.skills.flatMap((skill) =>
          skill.effects.map((effect) => ({
            ownerId: mysticCode.id,
            source: 'mysticCode',
            effect,
            timing: null,
          })),
        ),
      ),
    ];
    const mutations = effects.flatMap((item) =>
      item.effect.execution.flatMap((operation) =>
        operation.kind === 'contextMutation' &&
        'scope' in operation &&
        operation.scope === 'recipientState' &&
        (operation.mutation === 'addTrait' || operation.mutation === 'removeTrait') &&
        targetStateTraitSet.has(operation.trait)
          ? [{ ...item, operation }]
          : [],
      ),
    );
    const additions = mutations.filter(({ operation }) => operation.mutation === 'addTrait');
    const removals = mutations.filter(({ operation }) => operation.mutation === 'removeTrait');
    expect([...new Set(additions.map(({ operation }) => operation.trait))].sort()).toEqual(
      targetStateTraits.filter((trait) => trait !== 'traitId:10052'),
    );
    const consumerTraits = new Set<string>();
    for (const { effect } of effects)
      for (const requirement of canonicalRequirementLeaves(effect.requirement.expression))
        if (
          requirement.kind === 'trait' &&
          (requirement.scope === 'recipientState' || requirement.scope === 'opponentState')
        )
          consumerTraits.add(requirement.trait);
    for (const servant of master.servants)
      for (const variant of getNoblePhantasmVariants(servant))
        if (variant.kind === 'attack')
          for (const damage of variant.damage)
            for (const trait of damage.stateTraitNames) consumerTraits.add(trait);
    expect([...consumerTraits].sort()).toEqual(targetStateTraits);
    expect({
      operations: additions.length,
      effectOccurrences: new Set(
        additions.map(
          ({ ownerId, source, effect }) => `${source}:${ownerId}:${effect.occurrenceId}`,
        ),
      ).size,
      owners: new Set(additions.map(({ ownerId }) => ownerId)).size,
      guaranteed: additions.filter(({ effect }) => effect.proc.kind === 'guaranteed').length,
      probabilistic: additions.filter(({ effect }) => effect.proc.kind !== 'guaranteed').length,
      beforeDamage: additions.filter(({ timing }) => timing === 'beforeDamage').length,
      afterDamage: additions.filter(({ timing }) => timing === 'afterDamage').length,
      removals: removals.length,
    }).toEqual({
      operations: 1_403,
      effectOccurrences: 807,
      owners: 320,
      guaranteed: 1_394,
      probabilistic: 9,
      beforeDamage: 88,
      afterDamage: 815,
      removals: 9,
    });
    expect(
      additions.filter(
        ({ effect }) => !['addState', 'addStateShort'].includes(effect.atlasEvidence.functionType),
      ),
    ).toEqual([]);
    expect(additions.every(({ operation }) => operation.damageRelevant)).toBe(true);
  });

  it('keeps known candidate values and bounds fail-closed servants', async () => {
    const master = await loadProductionMaster();
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
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
    const inertUserProjections: string[] = [];
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
        const decisionScenario =
          effect.requiredQuantity === 'attackerHpPermille' &&
          effect.requiredQuantityOwner === 'attacker'
            ? { ...scenario, attackerHpPermille: 500 }
            : scenario;
        const selectedScenario = applyEffectControlPresentationDecision(
          decisionScenario,
          control,
          true,
          calculation.activationRequirements,
          userEffects,
          calculation.effectInputs,
        );
        const active = calculateScenario(selectedScenario, master, versions);
        selectedCalculations.set(effect.projectionKey, active);
        const activeEffect = active.effects.find(
          (candidate) => candidate.projectionKey === effect.projectionKey,
        );
        const constraintOnlyFailure =
          active.result.status === 'unsupported' &&
          active.result.missingEvidence.length > 0 &&
          active.result.missingEvidence.every((reason) => reason.startsWith('constraintConflict:'));
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
        const excluded = calculateScenario(excludedScenario, master, versions);
        if (
          !activeEffect ||
          (JSON.stringify(active.input) === JSON.stringify(excluded.input) &&
            JSON.stringify(active.result) === JSON.stringify(excluded.result))
        )
          inertUserProjections.push(`${servant.id}:${effect.projectionKey}`);
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
            applyEffectProjectionDecision(setEffectSourceEnabled(scenario, left, true), left, true),
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
            leftOnly.effectWarnings.some((warning) => warning.startsWith('constraintConflict:')) ||
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
        const canonicalAtoms = positiveTraitAtoms(effect.explanation.condition).flatMap((atom) => {
          const group = canonicalExclusiveGroup(atom.scope, atom.trait);
          return group ? [{ ...atom, group }] : [];
        });
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
              !conflict.effectWarnings.some((warning) => warning.startsWith('constraintConflict:'))
            )
              continue;
            canonicalFactConditionConflicts += 1;
            canonicalConflictEffects.add(`${servant.id}:${effect.projectionKey}`);
            canonicalConflictServants.add(servant.id);
            const outcome = conflict.effects.find(
              (candidate) => candidate.projectionKey === effect.projectionKey,
            )?.outcome;
            if (conflict.result.status !== 'unsupported' || outcome === 'applied')
              invalidExclusiveCalculations.push(`${servant.id}:${effect.projectionKey}:${factKey}`);
            if (hasCanonicalInputConflict(conflict.input))
              invalidConflictInputs.push(`${servant.id}:${effect.projectionKey}:${factKey}`);
          }
      }
    }

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
      hidden: 5959,
      user: 1591,
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
    expect(inertUserProjections).toEqual([]);
    expect(selectedUnsupportedProjections).toEqual([
      '705300:attacker:attacker:705300:2655650:110:0',
      '705300:attacker:attacker:705300:2655650:23460:0',
      '705300:attacker:attacker:705300:2657650:248:0',
      '705300:attacker:attacker:705300:2657650:248:1',
      '705300:np:np:["705300",0,"705301"]:np:["705300",0,"705301"]:523:0',
      '705300:np:["705300",0,"705301"]:17:damage',
    ]);
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
    ).toEqual({ '705300': 6 });
    expect(declaredExclusivePairCount).toBe(4);
    expect(skippedExclusivePairs).toEqual([
      '2301100:attacker:attacker:2301100:2536550:22883:0|attacker:attacker:2301100:2536550:22887:0',
      '2301100:attacker:attacker:2301100:2536550:22888:0|attacker:attacker:2301100:2536550:22887:0',
      '2301100:attacker:attacker:2301100:2536550:22887:0|passive:passive:2301100:2534650:22874:0',
    ]);
    expect(exclusivePairCount).toBe(1);
    expect(conflictPairs).toEqual({ effectEffect: 1, factFact: 0, factEffect: 0 });
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
    expect(summerLilith?.effects.find((effect) => effect.modifier === 'npSpecial')).toMatchObject({
      outcome: 'notApplied',
      explanation: { code: 'unresolved' },
    });
  }, 60_000);

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
