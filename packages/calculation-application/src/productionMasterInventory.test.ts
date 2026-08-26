import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  canNormalizeDamageEffect,
  canonicalExclusiveGroup,
  canonicalExclusiveTraits,
  type ConditionExpression,
  type EffectProjection,
  type TraitScope,
} from '@fgo-lab/battle-execution';
import { ENGINE_VERSION, SCHEMA_VERSION, type VersionContext } from '@fgo-lab/schema';
import { describe, expect, it } from 'vitest';
import { applyEffectProjectionDecision } from './effectDecision';
import { calculateScenario, createDefaultResolvedScenario } from './scenario';

const root = resolve(import.meta.dirname, '../../..');
let productionMaster: Promise<ReturnType<typeof masterSnapshotSchema.parse>> | undefined;

function loadProductionMaster() {
  productionMaster ??= readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8').then(
    (content) => masterSnapshotSchema.parse(JSON.parse(content)),
  );
  return productionMaster;
}

const expectedUnsupportedFamilies = {
  '106600': ['unsupportedOperation'],
  '202500': ['missing_attacker_hp_ratio'],
  '203300': ['missing_attacker_hp_ratio'],
  '305800': ['unsupportedOperation'],
  '400900': ['missing_attacker_hp_ratio'],
  '506000': ['unsupportedOperation'],
  '702500': ['missing_attacker_hp_ratio'],
  '1102000': ['unsupportedOperation'],
  '1102300': ['unsupportedOperation'],
  '2300600': ['unsupportedOperation'],
  '2801300': ['unsupportedOperation'],
  '3300200': ['missing_battle_point_phase'],
} as const;

const expectedUnresolvedDamageSemantics = {
  parameters: {
    BehaveAsFamilyBuff: 2,
    IgnoreIndivUnreleaseable: 1,
    IncludeIgnoreIndividuality: 5,
    IncludePassiveIndividuality: 1,
    ParamAdd: 4,
    ParamAddIndividualityTargetType: 3,
    ParamAddMaxCount: 4,
    ParamAddMaxValue: 3,
    ParamAddOpCheckDead: 3,
    ParamAddOpIndividuality: 2,
    ParamAddOpIndividualityAndCheck: 3,
    ParamAddSelfIndividuality: 2,
    ParamAddSelfIndividualityAndCheck: 2,
    ParamAddValue: 7,
    ParamMax: 4,
    ShowCardOnly: 1,
    SkillID: 1,
    SkillLV: 1,
    StarHigher: 10,
    TriggeredFieldCountRange: 1,
    TriggeredFieldCountTarget: 1,
    TypeIndividualityEachFunc: 1,
    UnSubStateWhileLinkedToOthers: 1,
    Value2: 3,
  },
  scripts: { 'script:funcIndividuality': 4 },
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

function projectionDecisionKind(projection: EffectProjection): 'effect' | 'worldFact' | null {
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
      const semanticKeys = Object.values(effect.parameterSemantics).flat();
      const rawKeys = [
        ...new Set(effect.parameterSets.flatMap((set) => set.flatMap((item) => Object.keys(item)))),
      ];
      if (
        semanticKeys.length !== new Set(semanticKeys).size ||
        [...rawKeys].sort().join('|') !== [...semanticKeys].sort().join('|')
      )
        normalizationErrors.push(`${servantId}:${effect.occurrenceId}`);
      for (const condition of [
        ...effect.conditions.recipient,
        effect.conditions.holder,
        effect.conditions.opponent,
        effect.conditions.field,
      ])
        if (condition.traits.some((trait) => trait.name === 'unknown'))
          literalUnknownTraits.push(`${servantId}:${effect.occurrenceId}`);
      if (!canNormalizeDamageEffect(effect, origin)) return;
      for (const key of effect.parameterSemantics.unresolved)
        semanticInventory.parameters[key] = (semanticInventory.parameters[key] ?? 0) + 1;
      for (const key of effect.unresolvedSemanticKeys)
        semanticInventory.scripts[key] = (semanticInventory.scripts[key] ?? 0) + 1;
    };
    for (const servant of master.servants) {
      for (const skill of servant.skills)
        for (const effect of skill.effects) inspectEffect(servant.id, effect, 'attacker');
      for (const passive of servant.passives)
        for (const effect of passive.effects) inspectEffect(servant.id, effect, 'passive');
      for (const noblePhantasm of servant.noblePhantasms)
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
        effect.modifier !== 'cardTypeChange' &&
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
    const partialConditionProjections = calculations.flatMap(({ servant, calculation }) =>
      calculation.effects.flatMap((effect) =>
        effect.explanation.condition?.kind === 'partialTrait'
          ? [{ servantId: servant.id, projectionKey: effect.projectionKey }]
          : [],
      ),
    );
    const inertUserProjections: string[] = [];
    const selectedUnsupportedProjections: string[] = [];
    const invalidAutomaticConditions: string[] = [];
    const invalidExclusiveCalculations: string[] = [];
    const invalidConflictInputs: string[] = [];
    const conflictPairs = { effectEffect: 0, factFact: 0, factEffect: 0 };
    let canonicalFactConditionConflicts = 0;
    const canonicalConflictEffects = new Set<string>();
    const canonicalConflictServants = new Set<string>();
    let exclusivePairCount = 0;
    for (const { servant, scenario, calculation } of calculations) {
      const userEffects = calculation.effects.filter((effect) => effect.controllability === 'user');
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
        const decisionScenario =
          effect.requiredQuantity === 'attackerHpPermille' &&
          effect.requiredQuantityOwner === 'attacker'
            ? { ...scenario, attackerHpPermille: 500 }
            : scenario;
        const selectedScenario = applyEffectProjectionDecision(decisionScenario, effect, true);
        const active = calculateScenario(selectedScenario, master, versions);
        selectedCalculations.set(effect.projectionKey, active);
        const activeEffect = active.effects.find(
          (candidate) => candidate.projectionKey === effect.projectionKey,
        );
        if (active.result.status === 'unsupported' && activeEffect?.outcome === 'unsupported')
          selectedUnsupportedProjections.push(`${servant.id}:${effect.projectionKey}`);
        if (
          !activeEffect ||
          (activeEffect.outcome === effect.outcome &&
            activeEffect.decision.state === effect.decision.state &&
            JSON.stringify(active.input) === JSON.stringify(calculation.input) &&
            JSON.stringify(active.result) === JSON.stringify(calculation.result))
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
          const leftSelected = applyEffectProjectionDecision(scenario, left, true);
          const leftOnly = selectedCalculations.get(left.projectionKey)!;
          const rightOnly = selectedCalculations.get(right.projectionKey)!;
          if (
            leftOnly.effectWarnings.some((warning) => warning.startsWith('constraintConflict:')) ||
            rightOnly.effectWarnings.some((warning) => warning.startsWith('constraintConflict:'))
          )
            continue;
          const conflict = calculateScenario(
            applyEffectProjectionDecision(leftSelected, right, true),
            master,
            versions,
          );
          const hasConflict = conflict.effectWarnings.some((warning) =>
            warning.startsWith('constraintConflict:'),
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
            const selected = applyEffectProjectionDecision(scenario, effect, true);
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

    expect(master.servants).toHaveLength(469);
    expect(calculations).toHaveLength(420);
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
    }).toEqual({ user: 1_534, automaticVisible: 443, hidden: 687 });
    expect({
      servants: new Set(partialConditionProjections.map((item) => item.servantId)).size,
      effects: partialConditionProjections.length,
    }).toEqual({ servants: 1, effects: 1 });
    expect({
      servants: new Set(multiBranchOrEffects.map((effect) => effect.servantId)).size,
      effects: multiBranchOrEffects.length,
    }).toEqual({ servants: 18, effects: 21 });
    expect([...conditionKinds].sort()).toEqual([
      'all',
      'always',
      'any',
      'card',
      'choice',
      'operationTrigger',
      'partialTrait',
      'quantity',
      'sourceQuantity',
      'trait',
    ]);
    expect(unsupportedFamilies).toEqual(expectedUnsupportedFamilies);
    expect(missingCandidateValues).toEqual([]);
    expect(invalidAutomaticConditions).toEqual([]);
    expect(inertUserProjections).toEqual([]);
    expect({
      servants: new Set(selectedUnsupportedProjections.map((item) => item.split(':', 1)[0])).size,
      effects: selectedUnsupportedProjections.length,
    }).toEqual({ servants: 14, effects: 25 });
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
    ).toEqual({
      '1000900': 1,
      '1100400': 1,
      '1100700': 1,
      '1101100': 1,
      '2500200': 1,
      '2801300': 11,
      '3300200': 1,
      '400100': 1,
      '404900': 1,
      '506000': 2,
      '603200': 1,
      '604700': 1,
      '702600': 1,
      '703300': 1,
    });
    expect(exclusivePairCount).toBe(29);
    expect(conflictPairs).toEqual({ effectEffect: 28, factFact: 1, factEffect: 0 });
    expect({
      combinations: canonicalFactConditionConflicts,
      effects: canonicalConflictEffects.size,
      servants: canonicalConflictServants.size,
    }).toEqual({ combinations: 250, effects: 68, servants: 52 });
    expect(invalidExclusiveCalculations).toEqual([]);
    expect(invalidConflictInputs).toEqual([]);
    expect(archetype?.result.status).toBe('calculated');
    expect(archetype?.input.fieldTraits).toContain('milleniumCastle');
    expect(
      archetype?.effects.find((effect) => effect.label === 'バスターアップ：千年城'),
    ).toMatchObject({ value: 0.3, outcome: 'applied' });
    expect(archetype?.effects.find((effect) => effect.label === '防御力ダウン')).toMatchObject({
      value: 0.2,
      outcome: 'notApplied',
      explanation: { code: 'disabled' },
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
  }, 30_000);
});
