import { rankingBasisFixture } from './rankingBasisFixture';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  evaluateConditionExpression,
  createPreNoblePhantasmState,
  targetConditionWitnessSpace,
  traitConditionEvaluationSource,
  type ConditionExpression,
} from '@fgo-lab/battle-execution';
import {
  masterSnapshotSchema,
  getDefaultInitialActorForm,
  type MasterDataSnapshot,
  type ServantMaster,
} from '@fgo-lab/master-data';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRankingBaseScenario } from './rankingPolicy';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';
import { compileStaticRankingPreparationPrograms } from './rankingStaticPreparation';
import { compileStaticRankingSemantics } from './rankingStaticSemantics';
import type { RankingTraitFact, RankingWorldCandidate } from './rankingWorld';
import { enumerateRankingWorldDomain } from './rankingWorldDomain';
import { compileRankingWorldObservationPlan } from './rankingWorldObservation';
import { quotientRankingWorldDomain } from './rankingWorldQuotient';

const root = resolve(import.meta.dirname, '../../..');

function stateFor(
  servant: ServantMaster,
  candidate: RankingWorldCandidate,
  master: MasterDataSnapshot,
) {
  const variant = servant.noblePhantasmVariantGroups[0]!.variants[0]!;
  const predicateFacts = [
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
  ];
  const created = createPreNoblePhantasmState(servant, variant.ref.actorFormId, {
    stochasticSelection: { kind: 'declared' },
    resourceSemantics: master.npResourceSemantics,
    npLevel: 1,
    initialGauge: 10_000,
    overcharge: 1,
    targetPredicates: predicateFacts.map(({ predicate, present }) => ({
      sourceKey: 'witness:target',
      predicate,
      present,
    })),
    worldFacts: candidate.traitFacts.map((fact) => ({
      decisionKey: `witness:${fact.scope}:${fact.trait}`,
      fact: { kind: 'trait', ...fact },
    })),
  });
  if (created.status !== 'applied') throw new Error(`witness_state:${created.code}`);
  return created.state;
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
      JSON.parse(
        await readFile(
          resolve(root, 'packages/test-fixtures/production-master/master.json'),
          'utf8',
        ),
      ),
    );
    servant = master.servants.find(({ id }) => id === '1102300')!;
  });

  function candidates(conditions: readonly ConditionExpression[], quotient = false) {
    const domain = enumerateRankingWorldDomain({
      servant,
      master,
      scenario: createRankingBaseScenario(
        servant,
        master,
        rankingBasisFixture(servant),
        DEFAULT_RANKING_POLICY_CONDITIONS,
        getDefaultInitialActorForm(servant)!.id,
      ),
      conditions,
      ...(quotient ? { canonicalCombinedState: { transitionTraits: new Set<string>() } } : {}),
    });
    return quotient
      ? quotientRankingWorldDomain(domain, compileRankingWorldObservationPlan([], conditions)).map(
          ({ representative }) => representative,
        )
      : domain;
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
      expect(evaluateConditionExpression(condition, worldState).truth).toBe(
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
          evaluateConditionExpression(mixedAny, stateFor(servant, candidate, master)).truth ===
          true,
      ),
    ).toBe(true);

    for (const condition of [mixedAny, mixedAll, negatedEffectLocal])
      expect(isWorldFactOnlyTargetCondition(condition)).toBe(false);
    for (const condition of [mixedAll, negatedEffectLocal]) {
      expect(
        candidates([condition]).some(
          (candidate) =>
            evaluateConditionExpression(condition, stateFor(servant, candidate, master)).truth ===
            true,
        ),
      ).toBe(false);
    }
    expect(targetConditionWitnessSpace(negatedEffectLocal).traitFacts).toEqual([]);
    const outcomes = (quotient: boolean) =>
      new Set(
        candidates([mixedAll], quotient).map(
          (candidate) =>
            evaluateConditionExpression(mixedAll, stateFor(servant, candidate, master)).truth,
        ),
      );
    expect(outcomes(true)).toEqual(outcomes(false));
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
            evaluateConditionExpression(condition, stateFor(servant, candidate, master)).truth ===
            true,
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

  it('enumerates initial and state facts independently for a combined target read', () => {
    const generated = candidates([
      { kind: 'trait', scope: 'target', trait: 'orderedTrait', present: true },
    ]);
    expect(
      new Set(
        generated.map((candidate) =>
          candidate.traitFacts
            .filter(({ trait }) => trait === 'orderedTrait')
            .map(({ scope, present }) => `${scope}:${present}`)
            .join('|'),
        ),
      ),
    ).toEqual(
      new Set([
        'target:false|targetState:false',
        'target:false|targetState:true',
        'target:true|targetState:false',
        'target:true|targetState:true',
      ]),
    );
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
          evaluateConditionExpression(mixed, stateFor(servant, candidate, master)).truth === true,
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
    const score = (state: ReturnType<typeof stateFor>) =>
      conditions.reduce(
        (total, condition, index) =>
          total +
          (evaluateConditionExpression(condition, state).truth === true ? [30, 50, 70][index]! : 0),
        0,
      );
    const generatedMaximum = Math.max(
      ...candidates(conditions).map((candidate) => score(stateFor(servant, candidate, master))),
    );
    const quotient = candidates(conditions, true);
    const quotientMaximum = Math.max(
      ...quotient.map((candidate) => score(stateFor(servant, candidate, master))),
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
              traitFacts: facts,
            },
            master,
          ),
        );
      }),
    );
    expect(generatedMaximum).toBe(bruteMaximum);
    expect(quotientMaximum).toBe(bruteMaximum);
    expect(quotient.length).toBeLessThan(candidates(conditions).length);
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
            evaluateConditionExpression(condition, stateFor(servant, candidate, master)).truth ===
            true,
        ),
      ).toBe(true);
  });

  it('audits every production world-fact-only target condition for a canonical true witness', () => {
    const productionConditions = master.servants.flatMap((candidateServant) =>
      compileStaticRankingPreparationPrograms(
        candidateServant,
        rankingBasisFixture(candidateServant).skillLevels,
      ).flatMap((program) =>
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
      ({ servant: candidateServant, program, condition }) => {
        if (!isWorldFactOnlyTargetCondition(condition)) return [];
        const witnessSpace = targetConditionWitnessSpace(condition);
        return witnessSpace.traitFacts.length > 0 || witnessSpace.predicates.length > 0
          ? [{ servant: candidateServant, program, condition }]
          : [];
      },
    );
    const witnessed = new Map<string, boolean>();
    const missing = inventory.flatMap(({ servant: candidateServant, program, condition }) => {
      const witnessKey = JSON.stringify([candidateServant.id, program.initialFormId, condition]);
      let hasWitness = witnessed.get(witnessKey);
      if (hasWitness === undefined) {
        const generated = enumerateRankingWorldDomain({
          servant: candidateServant,
          master,
          scenario: createRankingBaseScenario(
            candidateServant,
            master,
            rankingBasisFixture(candidateServant),
            DEFAULT_RANKING_POLICY_CONDITIONS,
            program.initialFormId,
          ),
          conditions: [condition],
        });
        hasWitness = generated.some(
          (candidate) =>
            evaluateConditionExpression(condition, stateFor(candidateServant, candidate, master))
              .truth === true,
        );
        witnessed.set(witnessKey, hasWitness);
      }
      return hasWitness
        ? []
        : [`${candidateServant.id}:${program.key}:${JSON.stringify(condition)}`];
    });
    expect(missing).toEqual([]);
    expect({
      conditions: inventory.length,
      servants: new Set(inventory.map(({ servant: candidateServant }) => candidateServant.id)).size,
    }).toEqual({
      conditions: 13681,
      servants: 213,
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
