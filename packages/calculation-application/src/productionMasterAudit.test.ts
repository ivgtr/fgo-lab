import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
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

const expectedUnsupportedFamilies = {
  '106600': ['unsupportedOperation'],
  '202500': ['missing_attacker_hp_ratio'],
  '203300': ['missing_attacker_hp_ratio'],
  '305800': ['unsupportedOperation'],
  '400900': ['missing_attacker_hp_ratio'],
  '702500': ['missing_attacker_hp_ratio'],
  '800100': ['unsupportedOperation'],
  '1000300': ['unsupportedOperation'],
  '1102000': ['unsupportedOperation'],
  '1102300': ['unsupportedOperation'],
  '2300600': ['unsupportedOperation'],
  '2300900': ['unsupportedOperation'],
  '2301200': ['unsupportedOperation'],
  '2801300': ['unsupportedOperation'],
  '3300200': ['missing_battle_point_phase', 'unsupportedOperation'],
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

describe('production master damage quality ratchet', () => {
  it('fails closed on out-of-domain HP facts for the production HP-ratio NP', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const servant = master.servants.find((candidate) => candidate.id === '202500')!;
    const scenario = createDefaultResolvedScenario(master, undefined, servant);
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    for (const value of [-100, 2_000]) {
      const calculation = calculateScenario(
        {
          ...scenario,
          worldFactAssertions: [
            {
              decisionKey: 'world:attacker-hp',
              fact: { kind: 'quantity', quantity: 'attackerHpPermille', value },
            },
          ],
        },
        master,
        versions,
      );
      expect(calculation.result.status, String(value)).toBe('unsupported');
      expect(calculation.result.rows, String(value)).toEqual([]);
      expect(calculation.input.attackerHpPermille, String(value)).toBeNull();
      expect(calculation.effectWarnings, String(value)).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            'constraintValidationUnsupported:world:attacker-hp:quantityFactOutOfDomain',
          ),
        ]),
      );
    }
  });

  it('keeps representative OR conditions user-controllable and effect-local', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    const cases = [
      ['305900', 'インドラ', '威力アップ〔蛇・竜〕'],
      ['306300', 'グレイ・リリィ', '威力アップ・対霊体'],
      ['704000', 'モルガン', '威力アップ・対円卓の騎士と妖精'],
      ['900400', 'マルタ', '威力アップ・対神性、死霊、悪魔'],
      ['2801200', 'ソロモン', '威力アップ・七騎士クラス'],
      ['4000100', 'Ｕ－オルガマリー', '威力アップ・対エクストラクラス'],
    ] as const;
    for (const [servantId, servantName, label] of cases) {
      const servant = master.servants.find((candidate) => candidate.id === servantId)!;
      const scenario = createDefaultResolvedScenario(master, undefined, servant);
      const initial = calculateScenario(scenario, master, versions);
      const projection = initial.effects.find((effect) => effect.label === label)!;
      expect(projection, `${servantName}:${label}`).toMatchObject({
        visibility: 'visible',
        controllability: 'user',
        outcome: 'notApplied',
        decision: { kind: 'effect', plan: { condition: 'userMayAssume' } },
      });
      const selected = calculateScenario(
        applyEffectProjectionDecision(scenario, projection, true),
        master,
        versions,
      );
      expect(selected.result.status, `${servantName}:${label}`).toBe('calculated');
      if (initial.result.status !== 'calculated' || selected.result.status !== 'calculated')
        throw new Error(`${servantName}:${label}:calculated result expected`);
      expect(selected.result.rows[0].average).toBeGreaterThan(initial.result.rows[0].average);
      expect(
        selected.effects.find((effect) => effect.projectionKey === projection.projectionKey),
      ).toMatchObject({ outcome: 'applied', decision: { state: 'enabled' } });
      expect(selected.input.target.traits).toEqual([]);
      expect(selected.input.fieldTraits).toEqual([]);

      const atoms = positiveTraitAtoms(projection.explanation.condition).filter(
        (atom, index, all) =>
          all.findIndex(
            (candidate) => candidate.scope === atom.scope && candidate.trait === atom.trait,
          ) === index,
      );
      expect(atoms.length, `${servantName}:${label}:trait atoms`).toBeGreaterThan(0);
      const compatible = calculateScenario(
        {
          ...applyEffectProjectionDecision(scenario, projection, true),
          worldFactAssertions: [
            {
              decisionKey: `audit:compatible:${projection.projectionKey}`,
              fact: { kind: 'trait', ...atoms[0]!, present: true },
            },
          ],
        },
        master,
        versions,
      );
      expect(compatible.result.status, `${servantName}:${label}:compatible`).toBe('calculated');

      const incompatible = calculateScenario(
        {
          ...applyEffectProjectionDecision(scenario, projection, true),
          worldFactAssertions: atoms.map((atom) => ({
            decisionKey: `audit:negative:${projection.projectionKey}:${atom.scope}:${atom.trait}`,
            fact: { kind: 'trait' as const, ...atom, present: false },
          })),
        },
        master,
        versions,
      );
      expect(incompatible.result.status, `${servantName}:${label}:incompatible`).toBe(
        'unsupported',
      );
      expect(incompatible.effectWarnings).toEqual(
        expect.arrayContaining([expect.stringContaining('constraintConflict:')]),
      );
      expect(
        incompatible.effects.find((effect) => effect.projectionKey === projection.projectionKey)
          ?.outcome,
      ).not.toBe('applied');
    }

    const nemo = master.servants.find((candidate) => candidate.name === 'ネモ')!;
    const scenario = createDefaultResolvedScenario(master, undefined, nemo);
    const initial = calculateScenario(scenario, master, versions);
    const projections = [
      '攻撃力アップ：水辺または虚数空間',
      'アーツアップ：水辺または虚数空間',
      '宝具威力アップ：水辺または虚数空間',
    ].map((label) => initial.effects.find((effect) => effect.label === label)!);
    const selectedScenario = projections.reduce(
      (current, projection) => applyEffectProjectionDecision(current, projection, true),
      scenario,
    );
    const selected = calculateScenario(selectedScenario, master, versions);
    expect(selected.result.status).toBe('calculated');
    expect(projections.every((projection) => projection.controllability === 'user')).toBe(true);
    expect(selected.input).toMatchObject({ attackBuff: 0.2, cardBuff: 0.2, npDamageBuff: 0.3 });
    expect(selected.input.fieldTraits).toEqual([]);
  });

  it('executes Dante realm choices through typed assumptions and rejects the conflict', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const servant = master.servants.find((candidate) => candidate.name === 'ダンテ・アリギエーリ');
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    expect(servant).toBeDefined();
    const scenario = createDefaultResolvedScenario(master, undefined, servant);
    const initial = calculateScenario(scenario, master, versions);
    const sky = initial.effects.find((effect) => effect.label === '威力アップ・対 天の力')!;
    const earth = initial.effects.find((effect) => effect.label === '威力アップ・対 地の力')!;
    const fieldChanges = initial.effects.filter((effect) =>
      effect.label.startsWith('フィールド変化'),
    );
    const passive = initial.effects.find((effect) => effect.source.origin === 'passive')!;
    const automaticNpEffect = initial.effects.find(
      (effect) => effect.label === '宝具威力アップ' && effect.source.origin === 'np',
    )!;
    const mismatchedCardEffects = initial.effects.filter(
      (effect) => effect.explanation.code === 'cardMismatch',
    );
    expect(initial.result.status).toBe('calculated');
    if (initial.result.status !== 'calculated') throw new Error('Dante base must calculate');
    expect(initial.result.rows[0].average).toBeCloseTo(32_208.975);

    expect(fieldChanges).not.toHaveLength(0);
    expect(fieldChanges.every((effect) => effect.visibility === 'hidden')).toBe(true);
    expect(passive).toMatchObject({ controllability: 'automatic', decision: { state: 'none' } });
    expect(automaticNpEffect).toMatchObject({
      outcome: 'applied',
      controllability: 'automatic',
      decision: { state: 'none' },
    });
    expect(mismatchedCardEffects).not.toHaveLength(0);
    expect(mismatchedCardEffects.every((effect) => effect.visibility === 'hidden')).toBe(true);

    const skyScenario = applyEffectProjectionDecision(scenario, sky, true);
    const earthScenario = applyEffectProjectionDecision(scenario, earth, true);
    for (const [selected, selectedScenario] of [
      [sky, skyScenario],
      [earth, earthScenario],
    ] as const) {
      const calculation = calculateScenario(selectedScenario, master, versions);
      expect(calculation.result.status).toBe('calculated');
      if (calculation.result.status !== 'calculated')
        throw new Error('Dante selected realm must calculate');
      expect(calculation.result.rows[0].average).toBeCloseTo(45_629.59);
      expect(calculation.input.powerMod).toBe(0.5);
      expect(calculation.input.target.traits).toEqual([]);
      expect(calculation.input.fieldTraits).toEqual([]);
      expect(
        calculation.result.trace.some(
          (entry) =>
            entry.step === 'user-decision' && entry.detail.includes(selected.projectionKey),
        ),
      ).toBe(true);
      expect(
        calculation.result.trace.some(
          (entry) =>
            entry.step === 'beforeNpDamage:addModifier' &&
            entry.detail.includes(`${selected.projectionKey}:modifier:powerMod:applied`),
        ),
      ).toBe(true);
      expect(
        calculation.effects.filter(
          (effect) => effect.label.startsWith('威力アップ・対') && effect.outcome === 'applied',
        ),
      ).toEqual([expect.objectContaining({ projectionKey: selected.projectionKey })]);
    }

    const conflict = calculateScenario(
      {
        ...scenario,
        ...applyEffectProjectionDecision(skyScenario, earth, true),
      },
      master,
      versions,
    );
    expect(conflict.result.status).toBe('unsupported');
    expect(conflict.input.powerMod).toBe(0);
    expect(conflict.effectWarnings).toEqual(
      expect.arrayContaining([expect.stringContaining('constraintConflict:')]),
    );

    const earthAfterConflict = calculateScenario(
      applyEffectProjectionDecision(
        applyEffectProjectionDecision(skyScenario, earth, true),
        sky,
        false,
      ),
      master,
      versions,
    );
    expect(earthAfterConflict.result.status).toBe('calculated');
    expect(earthAfterConflict.input.powerMod).toBe(0.5);
    expect(earthAfterConflict.effects.find((effect) => effect.label === sky.label)).toMatchObject({
      outcome: 'notApplied',
      explanation: { code: 'unresolved' },
    });
    expect(earthAfterConflict.effects.find((effect) => effect.label === earth.label)).toMatchObject(
      {
        outcome: 'applied',
      },
    );

    for (const [facts, selected, rejectedLabel] of [
      [
        [
          {
            decisionKey: 'world:sky',
            fact: {
              kind: 'trait' as const,
              scope: 'target' as const,
              trait: 'attributeSky',
              present: true,
            },
          },
          {
            decisionKey: 'world:heaven',
            fact: {
              kind: 'trait' as const,
              scope: 'field' as const,
              trait: 'fieldHeaven',
              present: true,
            },
          },
        ],
        earthScenario,
        '威力アップ・対 地の力',
      ],
      [
        [
          {
            decisionKey: 'world:earth',
            fact: {
              kind: 'trait' as const,
              scope: 'target' as const,
              trait: 'attributeEarth',
              present: true,
            },
          },
          {
            decisionKey: 'world:hell',
            fact: {
              kind: 'trait' as const,
              scope: 'field' as const,
              trait: 'fieldHell',
              present: true,
            },
          },
        ],
        skyScenario,
        '威力アップ・対 天の力',
      ],
    ] as const) {
      const crossDomainConflict = calculateScenario(
        { ...selected, worldFactAssertions: [...facts] },
        master,
        versions,
      );
      expect(crossDomainConflict.result.status).toBe('unsupported');
      expect(crossDomainConflict.effectWarnings).toEqual(
        expect.arrayContaining([expect.stringContaining('constraintConflict:')]),
      );
      expect(
        crossDomainConflict.effects.find((effect) => effect.label === rejectedLabel)?.outcome,
      ).not.toBe('applied');
      expect(
        crossDomainConflict.effects.filter(
          (effect) => effect.label.startsWith('威力アップ・対') && effect.outcome === 'applied',
        ),
      ).toHaveLength(0);
      expect(crossDomainConflict.input.powerMod).toBe(0);
    }

    for (const [facts, selected, acceptedLabel] of [
      [
        [
          {
            decisionKey: 'world:sky',
            fact: {
              kind: 'trait' as const,
              scope: 'target' as const,
              trait: 'attributeSky',
              present: true,
            },
          },
          {
            decisionKey: 'world:heaven',
            fact: {
              kind: 'trait' as const,
              scope: 'field' as const,
              trait: 'fieldHeaven',
              present: true,
            },
          },
        ],
        skyScenario,
        '威力アップ・対 天の力',
      ],
      [
        [
          {
            decisionKey: 'world:earth',
            fact: {
              kind: 'trait' as const,
              scope: 'target' as const,
              trait: 'attributeEarth',
              present: true,
            },
          },
          {
            decisionKey: 'world:hell',
            fact: {
              kind: 'trait' as const,
              scope: 'field' as const,
              trait: 'fieldHell',
              present: true,
            },
          },
        ],
        earthScenario,
        '威力アップ・対 地の力',
      ],
    ] as const) {
      const compatible = calculateScenario(
        { ...selected, worldFactAssertions: [...facts] },
        master,
        versions,
      );
      expect(compatible.result.status).toBe('calculated');
      expect(compatible.input.powerMod).toBe(0.5);
      expect(compatible.effects.find((effect) => effect.label === acceptedLabel)?.outcome).toBe(
        'applied',
      );
    }
  });

  it('keeps known candidate values and bounds fail-closed servants', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
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
    const unsupported = calculations.filter(
      ({ calculation }) => calculation.result.status === 'unsupported',
    );
    const missingCandidateValues = calculations.flatMap(({ servant, calculation }) =>
      calculation.effects.flatMap((effect) =>
        effect.explanation.code === 'disabled' &&
        effect.modifier !== null &&
        effect.modifier !== 'ignoreDefense' &&
        effect.modifier !== 'ignoreDamageCut' &&
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
        const selectedScenario = applyEffectProjectionDecision(scenario, effect, true);
        const active = calculateScenario(selectedScenario, master, versions);
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
    expect({
      user: allProjections.filter((effect) => effect.controllability === 'user').length,
      automaticVisible: allProjections.filter(
        (effect) => effect.controllability === 'automatic' && effect.visibility === 'visible',
      ).length,
      hidden: allProjections.filter((effect) => effect.visibility === 'hidden').length,
    }).toEqual({ user: 1_545, automaticVisible: 439, hidden: 671 });
    expect({
      servants: new Set(partialConditionProjections.map((item) => item.servantId)).size,
      effects: partialConditionProjections.length,
    }).toEqual({ servants: 1, effects: 1 });
    expect({
      servants: new Set(multiBranchOrEffects.map((effect) => effect.servantId)).size,
      effects: multiBranchOrEffects.length,
    }).toEqual({ servants: 16, effects: 19 });
    expect([...conditionKinds].sort()).toEqual([
      'all',
      'always',
      'any',
      'partialTrait',
      'quantity',
      'trait',
    ]);
    expect(unsupportedFamilies).toEqual(expectedUnsupportedFamilies);
    expect(missingCandidateValues).toEqual([]);
    expect(invalidAutomaticConditions).toEqual([]);
    expect(inertUserProjections).toEqual([]);
    expect({
      servants: new Set(selectedUnsupportedProjections.map((item) => item.split(':', 1)[0])).size,
      effects: selectedUnsupportedProjections.length,
    }).toEqual({ servants: 58, effects: 90 });
    expect(exclusivePairCount).toBe(8);
    expect(conflictPairs).toEqual({ effectEffect: 7, factFact: 1, factEffect: 0 });
    expect({
      combinations: canonicalFactConditionConflicts,
      effects: canonicalConflictEffects.size,
      servants: canonicalConflictServants.size,
    }).toEqual({ combinations: 221, effects: 57, servants: 50 });
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
