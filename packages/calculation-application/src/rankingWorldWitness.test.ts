import { rankingBasisFixture } from './rankingBasisFixture';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  evaluateConditionExpression,
  targetConditionWitnessSpace,
  traitConditionEvaluationSource,
  type ConditionExpression,
  type ExecutableBattleState,
} from '@fgo-lab/battle-execution';
import {
  masterSnapshotSchema,
  type MasterDataSnapshot,
  type ServantMaster,
} from '@fgo-lab/master-data';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRankingBaseScenario } from './rankingPolicy';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';
import { compileStaticRankingPreparationPrograms } from './rankingStaticPreparation';
import { compileStaticRankingSemantics } from './rankingStaticSemantics';
import {
  createRankingWorldCandidatesForConditions,
  type RankingTraitFact,
  type RankingWorldCandidate,
} from './rankingWorld';

const root = resolve(import.meta.dirname, '../../..');

function stateFor(
  servant: ServantMaster,
  candidate: RankingWorldCandidate,
  master?: MasterDataSnapshot,
): ExecutableBattleState {
  const traits = {
    attacker: new Map<string, boolean>(),
    attackerState: new Map<string, boolean>(),
    target: new Map<string, boolean>(),
    targetState: new Map<string, boolean>(),
    field: new Map<string, boolean>(),
  };
  for (const fact of candidate.traitFacts) traits[fact.scope].set(fact.trait, fact.present);
  const variant = servant.noblePhantasmVariantGroups[0]!.variants[0]!;
  const predicateFacts = master
    ? [
        ...master.targetSemantics.execution.classIdentities.map((classId) => ({
          key: `class:${classId}`,
          predicate: { kind: 'classIdentity' as const, classId },
          present: classId === candidate.classId,
        })),
        ...master.targetSemantics.execution.attributeIdentities.map((attribute) => ({
          key: `attribute:${attribute}`,
          predicate: { kind: 'attributeIdentity' as const, attribute },
          present: attribute === candidate.attribute,
        })),
        ...master.targetSemantics.execution.families.map(({ familyId }) => ({
          key: `family:${familyId}`,
          predicate: { kind: 'familyMembership' as const, familyId },
          present: candidate.familyIds.includes(familyId),
        })),
      ]
    : [];
  return {
    actorFormId: variant.ref.actorFormId,
    noblePhantasmVariant: variant,
    card: variant.kind === 'attack' ? variant.card : 'buster',
    traits,
    actorPredicates: {
      attacker: new Map(),
      target: new Map(
        predicateFacts.map(({ key, predicate, present }) => [key, { predicate, present }]),
      ),
    },
    stackQuantitySources: {},
    traitCounts: {
      attacker: {},
      attackerState: {},
      target: Object.fromEntries(
        [...traits.target].flatMap(([trait, present]) => (present ? [[trait, 1]] : [])),
      ),
      targetState: Object.fromEntries(
        [...traits.targetState].flatMap(([trait, present]) => (present ? [[trait, 1]] : [])),
      ),
      field: {},
    },
    initialTraitSuppressions: { attacker: new Set(), target: new Set() },
    quantities: { attackerHpPermille: null, targetRarity: null, battlePointPhase: null },
    resolvedInputValues: {},
    modifiers: [],
    modifierRates: {},
    ignoreDefense: false,
    ignoreDamageCut: false,
    evidence: [],
    unresolved: [],
    activationContext: { facts: [], byKey: new Map() },
  } as unknown as ExecutableBattleState;
}

function positiveExclusiveTraits(facts: readonly RankingTraitFact[]): string[] {
  return [
    ...new Set(
      facts.flatMap(({ trait, present }) =>
        present && ['attributeSky', 'attributeEarth'].includes(trait) ? [trait] : [],
      ),
    ),
  ];
}

/** Defines the production audit population; mixed ownership is covered by focused fixtures. */
function isWorldFactOnlyTargetCondition(condition: ConditionExpression): boolean {
  if (condition.kind === 'always') return true;
  if (condition.kind === 'trait' || condition.kind === 'traitCount')
    return (
      (condition.scope === 'target' || condition.scope === 'targetState') &&
      traitConditionEvaluationSource(condition) === 'worldFacts'
    );
  if (condition.kind === 'targetPredicate') return condition.scope === 'target';
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.every(isWorldFactOnlyTargetCondition);
  return condition.kind === 'not' && isWorldFactOnlyTargetCondition(condition.expression);
}

function conditionLeaves(condition: ConditionExpression): readonly ConditionExpression[] {
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.flatMap(conditionLeaves);
  if (condition.kind === 'not') return conditionLeaves(condition.expression);
  return [condition];
}

describe('ranking target witness completeness', () => {
  let master: ReturnType<typeof masterSnapshotSchema.parse>;
  let servant: ServantMaster;

  beforeAll(async () => {
    master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    servant = master.servants.find(({ id }) => id === '1102300')!;
  });

  function candidates(conditions: readonly ConditionExpression[]) {
    return createRankingWorldCandidatesForConditions(
      servant,
      master,
      createRankingBaseScenario(
        servant,
        master,
        rankingBasisFixture(servant),
        DEFAULT_RANKING_POLICY_CONDITIONS,
      ),
      conditions,
    );
  }

  it('shares provenance eligibility across executor, audit, and planner axes', () => {
    const variants: readonly {
      condition: Extract<ConditionExpression, { kind: 'trait' | 'traitCount' }>;
      source: 'worldFacts' | 'effectLocalDecision';
    }[] = [
      {
        condition: { kind: 'trait', scope: 'target', trait: 'dragon', present: true },
        source: 'worldFacts',
      },
      {
        condition: {
          kind: 'trait',
          scope: 'target',
          trait: 'dragon',
          present: true,
          provenance: {
            stateSources: 'activeOnly',
            ignoredStateTraits: 'exclude',
            unremovableStateTraits: 'include',
          },
        },
        source: 'worldFacts',
      },
      {
        condition: {
          kind: 'trait',
          scope: 'target',
          trait: 'dragon',
          present: true,
          provenance: {
            stateSources: 'activeAndPassive',
            ignoredStateTraits: 'exclude',
            unremovableStateTraits: 'include',
          },
        },
        source: 'effectLocalDecision',
      },
      {
        condition: {
          kind: 'traitCount',
          scope: 'target',
          traits: ['dragon'],
          comparison: 'equal',
          count: 1,
        },
        source: 'worldFacts',
      },
    ];
    const worldState = stateFor(
      servant,
      {
        key: 'dragon',
        classId: 'saber',
        attribute: 'man',
        familyIds: [],
        selections: {},
        traitFacts: [
          { scope: 'target', trait: 'dragon', present: true },
          { scope: 'targetState', trait: 'dragon', present: false },
        ],
      },
      master,
    );

    for (const { condition, source } of variants) {
      expect(traitConditionEvaluationSource(condition)).toBe(source);
      expect(isWorldFactOnlyTargetCondition(condition)).toBe(source === 'worldFacts');
      expect(targetConditionWitnessSpace(condition).traitFacts.length > 0).toBe(
        source === 'worldFacts',
      );
      expect(evaluateConditionExpression(condition, worldState)).toBe(
        source === 'worldFacts' ? true : null,
      );
    }
  });

  it('composes mixed ownership without fabricating effect-local truth', () => {
    const effectLocal: Extract<ConditionExpression, { kind: 'trait' }> = {
      kind: 'trait',
      scope: 'target',
      trait: 'divine',
      present: true,
      provenance: {
        stateSources: 'activeAndPassive',
        ignoredStateTraits: 'exclude',
        unremovableStateTraits: 'include',
      },
    };
    const worldFact: Extract<ConditionExpression, { kind: 'trait' }> = {
      kind: 'trait',
      scope: 'target',
      trait: 'dragon',
      present: true,
    };
    const mixedAny: ConditionExpression = {
      kind: 'any',
      expressions: [effectLocal, worldFact],
    };
    const mixedAll: ConditionExpression = {
      kind: 'all',
      expressions: [effectLocal, worldFact],
    };
    const negatedEffectLocal: ConditionExpression = { kind: 'not', expression: effectLocal };

    expect(targetConditionWitnessSpace(mixedAny).traitFacts).toEqual([
      { scope: 'target', trait: 'dragon' },
      { scope: 'targetState', trait: 'dragon' },
    ]);
    expect(
      candidates([mixedAny]).some(
        (candidate) =>
          evaluateConditionExpression(mixedAny, stateFor(servant, candidate, master)) === true,
      ),
    ).toBe(true);

    for (const condition of [mixedAny, mixedAll, negatedEffectLocal])
      expect(isWorldFactOnlyTargetCondition(condition)).toBe(false);
    for (const condition of [mixedAll, negatedEffectLocal]) {
      expect(
        candidates([condition]).some(
          (candidate) =>
            evaluateConditionExpression(condition, stateFor(servant, candidate, master)) === true,
        ),
      ).toBe(false);
    }
    expect(targetConditionWitnessSpace(negatedEffectLocal).traitFacts).toEqual([]);
  });

  it('provides a canonical true witness for leaf polarity, traitCount, and nested boolean forms', () => {
    const conditions: ConditionExpression[] = [
      { kind: 'trait', scope: 'target', trait: 'superGiant', present: true },
      { kind: 'trait', scope: 'target', trait: 'superGiant', present: false },
      {
        kind: 'traitCount',
        scope: 'target',
        traits: ['dragon', 'divine'],
        comparison: 'atLeast',
        count: 2,
      },
      {
        kind: 'traitCount',
        scope: 'target',
        traits: ['dragon', 'divine'],
        comparison: 'atMost',
        count: 0,
      },
      {
        kind: 'traitCount',
        scope: 'targetState',
        traits: ['dragon', 'divine'],
        comparison: 'equal',
        count: 1,
      },
      {
        kind: 'not',
        expression: {
          kind: 'any',
          expressions: [
            { kind: 'trait', scope: 'target', trait: 'superGiant', present: true },
            {
              kind: 'all',
              expressions: [
                { kind: 'trait', scope: 'targetState', trait: 'dragon', present: true },
                { kind: 'trait', scope: 'target', trait: 'divine', present: true },
              ],
            },
          ],
        },
      },
    ];
    const generated = candidates(conditions);
    for (const condition of conditions)
      expect(
        generated.some(
          (candidate) =>
            evaluateConditionExpression(condition, stateFor(servant, candidate, master)) === true,
        ),
        JSON.stringify(condition),
      ).toBe(true);
    expect(
      generated.some((candidate) =>
        ['target', 'targetState'].every((scope) =>
          candidate.traitFacts.some(
            (fact) => fact.scope === scope && fact.trait === 'superGiant' && !fact.present,
          ),
        ),
      ),
    ).toBe(true);
  });

  it('keeps exclusive positive, negative, and mixed facts sound while retaining witnesses', () => {
    const mixed: ConditionExpression = {
      kind: 'all',
      expressions: [
        { kind: 'trait', scope: 'target', trait: 'attributeSky', present: true },
        { kind: 'trait', scope: 'target', trait: 'attributeEarth', present: false },
      ],
    };
    const generated = candidates([mixed]);
    expect(
      generated.every(({ traitFacts }) => positiveExclusiveTraits(traitFacts).length <= 1),
    ).toBe(true);
    expect(
      generated.some(
        (candidate) =>
          evaluateConditionExpression(mixed, stateFor(servant, candidate, master)) === true,
      ),
    ).toBe(true);
    expect(
      generated.some(({ traitFacts }) => positiveExclusiveTraits(traitFacts).length === 0),
    ).toBe(true);
  });

  it('matches a full-state maximum oracle for a small finite condition family', () => {
    const conditions: ConditionExpression[] = [
      { kind: 'trait', scope: 'target', trait: 'dragon', present: false },
      { kind: 'trait', scope: 'targetState', trait: 'divine', present: true },
      {
        kind: 'traitCount',
        scope: 'target',
        traits: ['dragon', 'divine'],
        comparison: 'equal',
        count: 1,
      },
    ];
    const score = (state: ExecutableBattleState) =>
      conditions.reduce(
        (total, condition, index) =>
          total +
          (evaluateConditionExpression(condition, state) === true ? [30, 50, 70][index]! : 0),
        0,
      );
    const generatedMaximum = Math.max(
      ...candidates(conditions).map((candidate) => score(stateFor(servant, candidate, master))),
    );
    const bruteMaximum = Math.max(
      ...Array.from({ length: 16 }, (_, mask) => {
        const facts = (['target', 'targetState'] as const).flatMap((scope, scopeIndex) =>
          ['dragon', 'divine'].map((trait, traitIndex) => ({
            scope,
            trait,
            present: (mask & (1 << (scopeIndex * 2 + traitIndex))) !== 0,
          })),
        );
        return score(
          stateFor(
            servant,
            {
              key: String(mask),
              classId: 'saber',
              attribute: 'man',
              familyIds: [],
              selections: {},
              traitFacts: facts,
            },
            master,
          ),
        );
      }),
    );
    expect(generatedMaximum).toBe(bruteMaximum);
  });

  it('enumerates both target-predicate polarities within canonical identity constraints', () => {
    const familyId = master.targetSemantics.execution.families[0]!.familyId;
    const absent: ConditionExpression = {
      kind: 'targetPredicate',
      scope: 'target',
      predicate: { kind: 'familyMembership', familyId },
      present: false,
    };
    const present: ConditionExpression = { ...absent, present: true };
    const generated = candidates([absent, present]);
    expect(new Set(generated.map(({ familyIds }) => familyIds.includes(familyId)))).toEqual(
      new Set([false, true]),
    );
    for (const condition of [absent, present])
      expect(
        generated.some(
          (candidate) =>
            evaluateConditionExpression(condition, stateFor(servant, candidate, master)) === true,
        ),
      ).toBe(true);
  });

  it('audits every production world-fact-only target condition for a canonical true witness', () => {
    const productionConditions = master.servants.flatMap((candidateServant) =>
      compileStaticRankingPreparationPrograms(candidateServant).flatMap((program) =>
        compileStaticRankingSemantics(candidateServant, program, 1).conditions.map((condition) => ({
          servant: candidateServant,
          program,
          condition,
        })),
      ),
    );
    const mixedOwnership = productionConditions.filter(({ condition }) => {
      const leaves = conditionLeaves(condition);
      return (
        leaves.some(
          (leaf) =>
            leaf.kind === 'trait' && traitConditionEvaluationSource(leaf) === 'effectLocalDecision',
        ) && leaves.some(isWorldFactOnlyTargetCondition)
      );
    });
    expect({
      conditions: mixedOwnership.length,
      servants: new Set(mixedOwnership.map(({ servant: candidateServant }) => candidateServant.id))
        .size,
    }).toEqual({ conditions: 0, servants: 0 });

    const inventory = productionConditions.flatMap(
      ({ servant: candidateServant, program, condition }) =>
        isWorldFactOnlyTargetCondition(condition) &&
        (targetConditionWitnessSpace(condition).traitFacts.length > 0 ||
          targetConditionWitnessSpace(condition).predicates.length > 0)
          ? [{ servant: candidateServant, program, condition }]
          : [],
    );
    const missing = inventory.flatMap(({ servant: candidateServant, program, condition }) => {
      const generated = createRankingWorldCandidatesForConditions(
        candidateServant,
        master,
        createRankingBaseScenario(
          candidateServant,
          master,
          rankingBasisFixture(candidateServant),
          DEFAULT_RANKING_POLICY_CONDITIONS,
          program.initialFormId,
        ),
        [condition],
      );
      return generated.some(
        (candidate) =>
          evaluateConditionExpression(condition, stateFor(candidateServant, candidate, master)) ===
          true,
      )
        ? []
        : [`${candidateServant.id}:${program.key}:${JSON.stringify(condition)}`];
    });
    expect(missing).toEqual([]);
    expect({
      conditions: inventory.length,
      servants: new Set(inventory.map(({ servant: candidateServant }) => candidateServant.id)).size,
    }).toEqual({
      conditions: 13615,
      servants: 212,
    });
    const canonicalDefaultProvenance = inventory.filter(({ condition }) =>
      conditionLeaves(condition).some(
        (leaf) =>
          leaf.kind === 'trait' &&
          leaf.provenance !== undefined &&
          traitConditionEvaluationSource(leaf) === 'worldFacts',
      ),
    );
    expect({
      conditions: canonicalDefaultProvenance.length,
      negativeTraits: canonicalDefaultProvenance.filter(({ condition }) =>
        conditionLeaves(condition).some((leaf) => leaf.kind === 'trait' && !leaf.present),
      ).length,
    }).toEqual({
      conditions: 1932,
      negativeTraits: 60,
    });
    const productionNegative = inventory.filter(({ condition }) =>
      JSON.stringify(condition).includes('superGiant'),
    );
    expect({
      programs: productionNegative.length,
      servants: new Set(
        productionNegative.map(({ servant: candidateServant }) => candidateServant.id),
      ).size,
    }).toEqual({ programs: 444, servants: 9 });
  });
});
