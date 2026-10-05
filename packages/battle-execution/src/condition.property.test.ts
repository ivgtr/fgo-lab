import { createTraitFactLayers } from './traitFactLayers';
import { createInputFacts } from './inputFacts';
import {
  emptyConditionFactProofs,
  type ConditionFactProof,
  type ConditionReadClock,
} from './conditionRead';
import { stackInputSchema } from '@fgo-lab/master-data';
import { seedStackQuantities, mergeInputDefinitions } from './stackQuantities';
import { cloneBattleState, applyTraitAddition } from './state';
import { fixedConstraintFactsFromState } from './constraints';
import { describe, expect, it } from 'vitest';
import {
  evaluateConditionExpression,
  targetConditionWitnessSpace,
  traitConditionEvaluationSource,
  type ConditionExpression,
  type EffectProjection,
  type ExecutableBattleState,
  type TraitScope,
} from './index';
import { validateConstraintSet, type FixedConstraintFact } from './constraints';
import { activationFactKey, analyzeActivationFactSet } from '@fgo-lab/schema';

class FixtureTraitFacts extends Map<string, boolean> {
  constructor(
    values: readonly string[],
    private readonly proofMap: Map<string, ConditionFactProof>,
    private readonly proof: ConditionFactProof,
  ) {
    super();
    for (const value of values) this.set(value, true);
  }
  override set(key: string, value: boolean): this {
    this.proofMap.set(key, this.proof);
    return super.set(key, value);
  }
}

function state(
  target: readonly string[] = [],
  targetState: readonly string[] = [],
): ExecutableBattleState {
  const conditionReadClock: ConditionReadClock = {
    phase: 'initial',
    actorFormId: { actorId: 'fixture-form', limitCount: 0 },
    actor: 'attacker',
    actionId: null,
    operationId: null,
    sourceInstanceId: null,
    occurrenceId: null,
    valueSetIndex: null,
    valueIndex: null,
  };
  const conditionFactProofs = emptyConditionFactProofs();
  const external: ConditionFactProof = { kind: 'externalAssumption', clock: conditionReadClock };
  conditionFactProofs.traits.target = new Map(target.map((trait) => [trait, external]));
  conditionFactProofs.traits.targetState = new Map(targetState.map((trait) => [trait, external]));
  conditionFactProofs.quantities = new Map([
    ['attackerHpPermille', { kind: 'selectedInitialResource', clock: conditionReadClock }],
    ['targetRarity', external],
    ['battlePointPhase', external],
  ]);
  return {
    conditionReadClock,
    conditionFactProofs,
    traitFactLayers: createTraitFactLayers([], { target, targetState }, external, external),
    actorFormId: { actorId: 'fixture-form', limitCount: 0 },
    noblePhantasmVariant: {
      kind: 'nonAttack',
      canonicalId: 'fixture-np',
      ref: {
        actorFormId: { actorId: 'fixture-form', limitCount: 0 },
        noblePhantasmId: 'fixture-np',
      },
      name: 'fixture NP',
      priority: 1,
      effects: [],
    },
    card: 'buster',
    traits: {
      attacker: new FixtureTraitFacts(
        [],
        conditionFactProofs.traits.attacker as Map<string, ConditionFactProof>,
        external,
      ),
      attackerState: new FixtureTraitFacts(
        [],
        conditionFactProofs.traits.attackerState as Map<string, ConditionFactProof>,
        external,
      ),
      target: new FixtureTraitFacts(
        target,
        conditionFactProofs.traits.target as Map<string, ConditionFactProof>,
        external,
      ),
      targetState: new FixtureTraitFacts(
        targetState,
        conditionFactProofs.traits.targetState as Map<string, ConditionFactProof>,
        external,
      ),
      field: new FixtureTraitFacts(
        [],
        conditionFactProofs.traits.field as Map<string, ConditionFactProof>,
        external,
      ),
    },
    actorPredicates: { attacker: new Map(), target: new Map() },
    stackQuantitySources: {},
    traitCounts: {
      attacker: {},
      attackerState: {},
      target: Object.fromEntries(target.map((trait) => [trait, 1])),
      targetState: Object.fromEntries(targetState.map((trait) => [trait, 1])),
      field: {},
    },

    initialTraitSuppressions: { attacker: new Set(), target: new Set() },
    quantities: { attackerHpPermille: null, targetRarity: null, battlePointPhase: null },
    activationContext: {
      facts: [],
      factKeys: new Set(),
      choices: new Map(),
      operationTriggers: new Set(),
      sourceQuantityRanges: new Map(),
    },
    inputFacts: new Map(),
    modifiers: [],
    modifierRates: {},
    ignoreDefense: false,
    ignoreDamageCut: false,
    evidence: [],
    unresolved: [],
  };
}

describe('condition expression properties', () => {
  it('shares leaf-level evaluation ownership across executor and witness axes', () => {
    const directlyEvaluable: ConditionExpression[] = [
      { kind: 'trait', scope: 'target', trait: 'dragon', present: true },
      {
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
      {
        kind: 'traitCount',
        scope: 'target',
        traits: ['dragon'],
        comparison: 'equal',
        count: 1,
      },
    ];
    for (const condition of directlyEvaluable) {
      if (condition.kind !== 'trait' && condition.kind !== 'traitCount') throw new Error('leaf');
      expect(traitConditionEvaluationSource(condition)).toBe('worldFacts');
      expect(evaluateConditionExpression(condition, state(['dragon'])).truth).toBe(true);
      expect(targetConditionWitnessSpace(condition).traitFacts).not.toEqual([]);
    }

    const effectLocal = {
      kind: 'trait',
      scope: 'target',
      trait: 'dragon',
      present: true,
      provenance: {
        stateSources: 'activeOnly',
        ignoredStateTraits: 'exclude',
        unremovableStateTraits: 'include',
      },
    } as const satisfies Extract<ConditionExpression, { kind: 'trait' }>;
    const exceptional = {
      ...effectLocal,
      provenance: { ...effectLocal.provenance, stateSources: 'activeAndPassive' as const },
    };
    expect(traitConditionEvaluationSource(exceptional)).toBe('effectLocalDecision');
    expect(evaluateConditionExpression(exceptional, state(['dragon'])).truth).toBe(null);
    expect(targetConditionWitnessSpace(exceptional).traitFacts).toEqual([]);
  });

  it('evaluates activation-local facts without promoting them to world traits', () => {
    const source = { origin: 'attacker' as const, sourceInstanceId: 'self', skillId: 'skill' };
    const facts = [
      { kind: 'choice' as const, source, family: 'mode', candidate: '2' },
      { kind: 'operationTrigger' as const, source, position: 4 },
      {
        kind: 'sourceQuantity' as const,
        source,
        quantity: 'battlePointRate' as const,
        subjectId: '705300',
        comparison: 'atMost' as const,
        value: 999,
      },
    ].sort((left, right) => activationFactKey(left).localeCompare(activationFactKey(right)));
    const activation = analyzeActivationFactSet(facts);
    if (activation.status !== 'valid') throw new Error('expected valid activation context');
    const activated: ExecutableBattleState = {
      ...state(),
      activationContext: activation.factSet,
    };
    expect(
      evaluateConditionExpression(
        { kind: 'choice', source, family: 'mode', candidate: '2' },
        activated,
      ).truth,
    ).toBe(true);
    expect(
      evaluateConditionExpression(
        { kind: 'choice', source, family: 'mode', candidate: '1' },
        activated,
      ).truth,
    ).toBe(false);
    expect(
      evaluateConditionExpression({ kind: 'operationTrigger', source, position: 4 }, activated)
        .truth,
    ).toBe(true);
    expect(
      evaluateConditionExpression(
        {
          kind: 'sourceQuantity',
          source,
          quantity: 'battlePointRate',
          subjectId: '705300',
          comparison: 'atMost',
          value: 999,
        },
        activated,
      ).truth,
    ).toBe(true);
    expect(
      evaluateConditionExpression(
        { kind: 'choice', source, family: 'mode', candidate: '3' },
        activated,
      ).truth,
    ).toBe(false);
    expect(activated.traits.field.size).toBe(0);
  });

  it('does not infer provenance-sensitive traits from an unqualified scenario fact', () => {
    const expression: ConditionExpression = {
      kind: 'trait',
      scope: 'target',
      trait: 'buffPoison',
      present: true,
      provenance: {
        stateSources: 'activeOnly',
        ignoredStateTraits: 'include',
        unremovableStateTraits: 'include',
      },
    };
    expect(evaluateConditionExpression(expression, state([], ['buffPoison'])).truth).toBeNull();
  });

  it('keeps linked initial-trait suppression distinct from an absent state trait', () => {
    const current = state();
    (current.traits.attacker as Map<string, boolean>).set('alignmentChaotic', true);
    const expression: ConditionExpression = {
      kind: 'trait',
      scope: 'attacker',
      trait: 'alignmentChaotic',
      present: true,
    };
    expect(evaluateConditionExpression(expression, current).truth).toBe(true);
    current.initialTraitSuppressions.attacker = new Set(['alignmentChaotic']);
    current.conditionFactProofs.suppressions.attacker = new Map([
      ['alignmentChaotic', { kind: 'guaranteedWrite', clock: current.conditionReadClock }],
    ]);
    expect(evaluateConditionExpression(expression, current).truth).toBe(false);
  });

  it('keeps evaluator and solver aligned across initial, state, and combined actor traits', () => {
    const values = [undefined, false, true] as const;
    for (const actor of ['attacker', 'target'] as const) {
      const stateScope: TraitScope = actor === 'attacker' ? 'attackerState' : 'targetState';
      for (const initial of values)
        for (const stateValue of values)
          for (const conditionScope of [actor, stateScope])
            for (const present of [false, true]) {
              const current = state();
              const initialTraits = current.traits[actor] as Map<string, boolean>;
              const stateTraits = current.traits[stateScope] as Map<string, boolean>;
              if (initial !== undefined) initialTraits.set('timedTrait', initial);
              if (stateValue !== undefined) stateTraits.set('timedTrait', stateValue);
              const expression: ConditionExpression = {
                kind: 'trait',
                scope: conditionScope,
                trait: 'timedTrait',
                present,
              };
              const evaluation = evaluateConditionExpression(expression, current).truth;
              const fixedFacts: FixedConstraintFact[] = [
                ...(initial === undefined
                  ? []
                  : [
                      {
                        sourceKey: `${actor}:initial`,
                        fact: {
                          kind: 'trait' as const,
                          scope: actor,
                          trait: 'timedTrait',
                          present: initial,
                        },
                      },
                    ]),
                ...(stateValue === undefined
                  ? []
                  : [
                      {
                        sourceKey: `${actor}:state`,
                        fact: {
                          kind: 'trait' as const,
                          scope: stateScope,
                          trait: 'timedTrait',
                          present: stateValue,
                        },
                      },
                    ]),
              ];
              const validation = validateConstraintSet({
                fixedFacts,
                expressions: [{ sourceKey: `${conditionScope}:condition`, expression }],
              });
              expect(
                validation.status,
                `${conditionScope}:${String(initial)}:${String(stateValue)}:${present}`,
              ).toBe(evaluation === false ? 'conflict' : 'satisfied');
            }
    }
  });

  it('re-derives the combined actor trait after state grant and removal', () => {
    const combined: ConditionExpression = {
      kind: 'trait',
      scope: 'target',
      trait: 'undead',
      present: true,
    };
    const stateOnly: ConditionExpression = { ...combined, scope: 'targetState' };
    const before = state();
    (before.traits.target as Map<string, boolean>).set('undead', false);
    const granted = state();
    (granted.traits.target as Map<string, boolean>).set('undead', false);
    (granted.traits.targetState as Map<string, boolean>).set('undead', true);
    const removed = state();
    (removed.traits.target as Map<string, boolean>).set('undead', false);
    (removed.traits.targetState as Map<string, boolean>).set('undead', false);

    expect(evaluateConditionExpression(combined, before).truth).toBeNull();
    expect(evaluateConditionExpression(combined, granted).truth).toBe(true);
    expect(evaluateConditionExpression(stateOnly, granted).truth).toBe(true);
    expect(evaluateConditionExpression(combined, removed).truth).toBe(false);
    expect(evaluateConditionExpression(stateOnly, removed).truth).toBe(false);

    const validateSnapshot = (stateValue: boolean | undefined, expression: ConditionExpression) =>
      validateConstraintSet({
        fixedFacts: [
          {
            sourceKey: 'initial:not-undead',
            fact: { kind: 'trait', scope: 'target', trait: 'undead', present: false },
          },
          ...(stateValue === undefined
            ? []
            : [
                {
                  sourceKey: 'state:undead',
                  fact: {
                    kind: 'trait' as const,
                    scope: 'targetState' as const,
                    trait: 'undead',
                    present: stateValue,
                  },
                },
              ]),
        ],
        expressions: [{ sourceKey: 'condition:undead', expression }],
      }).status;
    expect(validateSnapshot(undefined, combined)).toBe('satisfied');
    expect(validateSnapshot(true, combined)).toBe('satisfied');
    expect(validateSnapshot(true, stateOnly)).toBe('satisfied');
    expect(validateSnapshot(false, combined)).toBe('conflict');
    expect(validateSnapshot(false, stateOnly)).toBe('conflict');
  });

  it('is invariant to trait insertion order and unrelated traits', () => {
    const condition: ConditionExpression = {
      kind: 'all',
      expressions: [
        { kind: 'trait', scope: 'target', trait: 'dragon', present: true },
        { kind: 'trait', scope: 'target', trait: 'divine', present: true },
      ],
    };
    const permutations = [
      ['dragon', 'divine'],
      ['divine', 'dragon'],
      ['unrelated', 'dragon', 'divine'],
      ['divine', 'unrelated', 'dragon'],
    ];
    for (const traits of permutations)
      expect(evaluateConditionExpression(condition, state(traits)).truth).toBe(true);
  });

  it('keeps permanent and state traits distinct while combined target checks see both', () => {
    const permanent: ConditionExpression = {
      kind: 'trait',
      scope: 'target',
      trait: 'confusion',
      present: true,
    };
    const stateOnly: ConditionExpression = { ...permanent, scope: 'targetState' };

    expect(evaluateConditionExpression(permanent, state([], ['confusion'])).truth).toBe(true);
    expect(evaluateConditionExpression(stateOnly, state(['confusion'])).truth).toBeNull();
    expect(evaluateConditionExpression(stateOnly, state([], ['confusion'])).truth).toBe(true);
    expect(
      evaluateConditionExpression(
        { kind: 'trait', scope: 'target', trait: 'confusion', present: false },
        state([], ['confusion']),
      ).truth,
    ).toBe(false);
  });

  it('preserves unknown quantity truth through all/any/not expressions', () => {
    const unknown: ConditionExpression = {
      kind: 'quantity',
      quantity: 'targetRarity',
      comparison: 'equal',
      value: 5,
    };
    // E2E-A043-OR
    expect(
      evaluateConditionExpression({ kind: 'not', expression: unknown }, state()).truth,
    ).toBeNull();
    expect(
      evaluateConditionExpression(
        { kind: 'all', expressions: [{ kind: 'always' }, unknown] },
        state(),
      ).truth,
    ).toBeNull();
    expect(
      evaluateConditionExpression(
        {
          kind: 'any',
          expressions: [
            { kind: 'trait', scope: 'target', trait: 'dragon', present: true },
            unknown,
          ],
        },
        state(),
      ).truth,
    ).toBeNull();
  });

  it('keeps an all-condition as an effect-local decision without fabricating world facts', () => {
    const projection = {
      projectionKey: 'projection',
      operationId: 'operation',
      contributionId: 'operation:npSpecial',
      label: 'compound condition',
      sourceName: 'source',
      skillName: 'skill',
      gameActivation: 'npBeforeDamage',
      sourceActive: true,
      proc: { kind: 'guaranteed' },

      procRatePermille: 1_000,
      valuePermille: 1_500,
      value: 1.5,
      requiredQuantity: null,
      requiredQuantityOwner: null,
      requiredInputs: [],
      modifier: 'npSpecial',
      source: {
        origin: 'np',
        sourceInstanceId: 'source',
        sourceId: 'source',
        skillId: 'skill',
        effectId: 'effect',
        effectOccurrenceId: 'effect:0',
      },
      contributionScope: 'personal',
      contributionControl: 'operation',
      activationSources: [],
      executionSupport: 'supported',
      outcome: 'notApplied',
      visibility: 'visible',
      controllability: 'user',
      selectionGroups: [],
      decision: {
        state: 'enabled',
        decisionKey: 'projection',
        kind: 'effect',
        plan: { activation: 'user', condition: 'userMayAssume' },
      },
      conditionDecision: 'evaluate',
      explanation: {
        code: 'conditionNotMet',
        condition: {
          kind: 'all',
          expressions: [
            { kind: 'trait', scope: 'target', trait: 'dragon', present: true },
            { kind: 'trait', scope: 'targetState', trait: 'burning', present: true },
          ],
        },
      },
    } satisfies EffectProjection;

    expect(projection.explanation.condition).toMatchObject({ kind: 'all' });
    expect(projection.decision).toMatchObject({
      kind: 'effect',
      plan: { condition: 'userMayAssume' },
    });
  });

  it('does not read the attacker quantity for another source owner', () => {
    const input = state();
    input.quantities.battlePointPhase = 10;
    expect(
      evaluateConditionExpression(
        {
          kind: 'quantity',
          quantity: 'battlePointPhase',
          subjectId: 'support-source',
          comparison: 'atMost',
          value: 1,
        },
        input,
      ).truth,
    ).toBeNull();
  });
});

describe('stack quantity state and constraint closure', () => {
  const definition = (trait: string, maximum = 4) =>
    stackInputSchema.parse({
      kind: 'effectStackCount',
      key: `stack:attackerState:${trait}`,
      owner: 'attacker',
      label: trait,
      description: 'initial count',
      minimum: 0,
      maximum,
      step: 1,
      defaultValue: 0,
      defaultReason: 'baseline',
      quantitySource: { scope: 'attackerState', trait },
    });
  it.each([0, 1, 4])(
    'shares exact quantity %i between comparisons and global validation',
    (count) => {
      const inputs = [definition('alpha'), definition('beta')];
      const initial = state();
      initial.inputFacts = createInputFacts(
        { [inputs[0]!.key]: count, [inputs[1]!.key]: 1 },
        { kind: 'externalAssumption', clock: initial.conditionReadClock },
      );
      seedStackQuantities(initial, inputs);
      for (const comparison of ['atLeast', 'atMost', 'equal'] as const) {
        for (let boundary = 0; boundary <= 4; boundary++) {
          const leaf: ConditionExpression = {
            kind: 'inputQuantity',
            inputKey: inputs[0]!.key,
            comparison,
            value: boundary,
          };
          const expression: ConditionExpression = {
            kind: 'all',
            expressions: [
              leaf,
              {
                kind: 'not',
                expression: {
                  kind: 'inputQuantity',
                  inputKey: inputs[1]!.key,
                  comparison: 'equal',
                  value: 0,
                },
              },
            ],
          };
          const expected =
            comparison === 'atLeast'
              ? count >= boundary
              : comparison === 'atMost'
                ? count <= boundary
                : count === boundary;
          expect(evaluateConditionExpression(expression, initial).truth).toBe(expected);
          expect(
            validateConstraintSet({
              fixedFacts: fixedConstraintFactsFromState(initial),
              expressions: [{ sourceKey: 'fixture', expression }],
            }).status,
          ).toBe(expected ? 'satisfied' : 'conflict');
        }
      }
      const changed = applyTraitAddition(cloneBattleState(initial), 'attackerState', 'alpha', {
        kind: 'guaranteedWrite',
        clock: initial.conditionReadClock,
      });
      expect(changed.traitCounts.attackerState['alpha']).toBe(count + 1);
      expect(initial.traitCounts.attackerState['alpha'] ?? 0).toBe(count);
    },
  );
  it('shares a source across different reader caps and rejects conflicting baselines', () => {
    expect(mergeInputDefinitions([definition('alpha', 4), definition('alpha', 10)])).toHaveLength(
      1,
    );
    expect(
      mergeInputDefinitions([definition('alpha', 4), definition('alpha', 10)])[0]?.maximum,
    ).toBe(10);
    expect(() =>
      mergeInputDefinitions([definition('alpha'), { ...definition('alpha'), defaultValue: 1 }]),
    ).toThrow('definition_conflict');
  });
});
