import type {
  EffectExecutionOperation,
  MasterEffect,
  ModifierValueExpression,
} from '@fgo-lab/master-data';
import { describe, expect, it } from 'vitest';
import { compileEffect } from './operationCompiler';
import { resolveStochasticOutcomes } from './stochasticOutcomes';
import type { SourceEffect } from './sourceCollection';

const values = (
  value: number | null,
): [(number | null)[], number[], number[], number[], number[]] => [[value], [], [], [], []];
const expressions: [
  (ModifierValueExpression | null)[],
  (ModifierValueExpression | null)[],
  (ModifierValueExpression | null)[],
  (ModifierValueExpression | null)[],
  (ModifierValueExpression | null)[],
] = [[null], [], [], [], []];

function effect(execution: EffectExecutionOperation[]): MasterEffect {
  return {
    id: '1',
    occurrenceId: '1:0',
    label: '複合効果',
    availability: 'allLimitBreakStates',
    inclusionPolicy: { default: 'exclude' },
    gameActivation: 'skillUse',
    proc: { kind: 'guaranteed' },
    selection: null,
    interaction: null,
    triggerScope: null,
    operationTrigger: null,
    operationReference: null,
    stateIdentity: null,
    inputDefinitions: [],
    requirement: {
      recipient: 'sourceSelf',
      expression: { kind: 'always' },
    },
    execution,
    atlasEvidence: {
      functionType: 'test',
      target: 'self',
      parameterSets: [[], [], [], [], []],
      parameterSemantics: {
        value: [],
        lifecycle: [],
        presentation: [],
        condition: [],
        contextMutation: [],
        choice: [],
        valueExpression: [],
        buffIdentity: [],
        unresolved: [],
      },
      unresolvedSemanticKeys: [],
      buffTypes: [],
      buffRateTargets: [],
      buffConditionKeys: [],
    },
  };
}

function source(execution: EffectExecutionOperation[], limitBreak = false): SourceEffect {
  return {
    phase: 'craftEssence',
    origin: 'craftEssence',
    sourceInstanceId: 'craftEssence:1',
    sourceId: '1',
    sourceName: '礼装',
    sourceTraits: [],
    noblePhantasmVariant: null,
    preparationStochasticOutcome: null,
    skillId: 'ce:1',
    skillName: '礼装',
    effect: effect(execution),
    valueSetIndex: 0,
    valueIndex: 0,
    limitBreak,
    sourceEnabled: true,
    enabledByDefault: true,
  };
}

function supportSource(execution: EffectExecutionOperation[]): SourceEffect {
  return {
    ...source(execution),
    phase: 'support',
    origin: 'support',
    sourceInstanceId: 'support:leonidas',
    sourceId: '300900',
    sourceName: 'レオニダス一世',
    skillId: '49650',
    skillName: '殿の矜持',
    limitBreak: false,
    enabledByDefault: false,
  };
}

function modifier(
  kind: 'attackBuff' | 'npDamageBuff',
  value: number | null,
): Extract<EffectExecutionOperation, { kind: 'damageModifier' }> {
  return {
    kind: 'damageModifier',
    route: {
      target: 'sourceSelf',
      contributionScope: 'personal',
      eligibility: {
        kind: 'requiredRecipient',
        recipient: 'attacker',
        onMissing: 'ignore',
        onMismatch: 'unsupported',
      },
    },
    semanticSupport: 'supported',
    modifier: kind,
    sign: 1,
    card: null,
    values: values(value),
    valueExpressions: expressions,
  };
}

describe('canonical operation compilation', () => {
  it.each(['hp', 'criticalStars', 'battlePoint'] as const)(
    'compiles unrepresentable %s mutations as typed unsupported operations',
    (resource) => {
      const compiled = compileEffect(
        source([
          modifier('attackBuff', 100),
          {
            kind: 'resourceMutation',
            resource,
            direction: 'loss',
            unit: 'fixed',
            recipient: 'sourceSelf',
            amount: { kind: 'fixed', values: values(100) },
            subjectId: null,
          },
        ]),
        0,
      );

      expect(compiled.operations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'resourceMutation',
            resource,
            resolution: 'resourceStateUnavailable',
            direction: 'loss',
            unit: 'fixed',
            amount: 100,
            subjectId: null,
          }),
        ]),
      );
      expect(compiled.projections).toEqual([]);
    },
  );

  it('passes the preparation stochastic result into ordinary execution', () => {
    const preparedSource = source([modifier('attackBuff', 100)]);
    preparedSource.preparationStochasticOutcome = 'failure';
    preparedSource.effect = {
      ...preparedSource.effect,
      proc: { kind: 'singleRoll', ratePermille: [[800], [], [], [], []] },
      selection: {
        kind: 'stochasticOutcome',
        group: { kind: 'binary', key: 'proc:test', defaultOutcome: 'success' },
      },
    };
    const operation = compileEffect(preparedSource, 0).operations[0]!;
    const outcomes = resolveStochasticOutcomes([operation], {
      values: {},
      missingDefinitions: [],
      invalidInputKeys: [],
    });

    expect(operation.preResolvedStochasticOutcome).toBe('failure');
    expect(outcomes.outcomes.get(operation.operationId)).toEqual({ status: 'failure' });
  });

  it('derives matching-count defaults from canonical source and target guarantees', () => {
    const sourceCount = source([modifier('npDamageBuff', 0)]);
    sourceCount.sourceTraits = ['king'];
    sourceCount.effect = {
      ...sourceCount.effect,
      inputDefinitions: [
        {
          key: 'effect:count',
          kind: 'matchingActorCount',
          owner: 'field',
          label: '〔王〕一致数',
          description: 'final count',
          minimum: 0,
          maximum: 6,
          step: 1,
          defaultValue: null,
          defaultReason: 'derived',
          countSemantics: {
            population: 'allActors',
            aliveOnly: true,
            sourcePredicate: {
              counting: 'matchingClauses',
              clauses: [
                [
                  {
                    kind: 'trait',
                    trait: { name: 'king', negative: false },
                  },
                ],
              ],
            },
            otherPredicate: null,
          },
        },
      ],
    };
    const sourceCompiled = compileEffect(sourceCount, 0);
    expect(sourceCompiled.operations[0]?.inputDefinitions[0]).toMatchObject({
      minimum: 1,
      defaultValue: 1,
    });

    const enemyCount = source([modifier('npDamageBuff', 0)]);
    enemyCount.effect = {
      ...enemyCount.effect,
      inputDefinitions: [
        {
          key: 'effect:enemies',
          kind: 'matchingActorCount',
          owner: 'field',
          label: '敵の合計数',
          description: 'final count',
          minimum: 0,
          maximum: 3,
          step: 1,
          defaultValue: null,
          defaultReason: 'derived',
          countSemantics: {
            population: 'enemies',
            aliveOnly: true,
            sourcePredicate: null,
            otherPredicate: {
              counting: 'matchingClauses',
              clauses: [[{ kind: 'actorProperty', property: 'inBattle' }]],
            },
          },
        },
      ],
    };
    const enemyCompiled = compileEffect(enemyCount, 0);
    expect(enemyCompiled.operations[0]?.inputDefinitions[0]).toMatchObject({
      minimum: 1,
      defaultValue: 1,
    });
  });

  it('compiles every operation in canonical order', () => {
    const compiled = compileEffect(
      source([
        modifier('attackBuff', 100),
        {
          kind: 'contextMutation',
          mutation: 'addTrait',
          scope: 'field',
          route: {
            target: 'sourceSelf',
            contributionScope: 'personal',
            eligibility: { kind: 'anyRecipient', onMissing: 'ignore' },
          },
          trait: 'fieldSunlight',
          damageRelevant: true,
        },
        modifier('npDamageBuff', 200),
      ]),
      7,
    );
    expect(compiled.projections).toEqual([]);
    expect(compiled.operations).toMatchObject([
      { order: 7, kind: 'addModifier', modifier: 'attackBuff', valuePermille: 100 },
      { order: 8, kind: 'addTrait', scope: 'field', trait: 'fieldSunlight' },
      { order: 9, kind: 'addModifier', modifier: 'npDamageBuff', valuePermille: 200 },
    ]);
  });

  it('does not partially compile when any valued operation is missing', () => {
    const compiled = compileEffect(
      source([modifier('attackBuff', 100), modifier('npDamageBuff', null)]),
      0,
    );
    expect(compiled.operations).toEqual([]);
    expect(compiled.projections).toHaveLength(1);
  });

  it('does not fall back to normal values when an MLB value series is missing', () => {
    const compiled = compileEffect(source([modifier('attackBuff', 100)], true), 0);
    expect(compiled.operations).toEqual([]);
    expect(compiled.projections).toHaveLength(1);
  });

  it('does not partially compile when any operation semantics is unresolved', () => {
    const compiled = compileEffect(
      source([
        modifier('attackBuff', 100),
        {
          kind: 'unsupported',
          route: {
            target: 'sourceSelf',
            contributionScope: 'personal',
            eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
          },
          reason: 'operationSemantics',
          damageRelevant: true,
        },
      ]),
      0,
    );
    expect(compiled.operations).toEqual([]);
    expect(compiled.projections).toHaveLength(1);
  });

  it('keeps an absent route non-applicable when the canonical policy says to ignore it', () => {
    const operation = modifier('attackBuff', 100);
    operation.route = {
      target: 'sourceSelf',
      contributionScope: 'personal',
      eligibility: {
        kind: 'requiredRecipient',
        recipient: 'attacker',
        onMissing: 'ignore',
        onMismatch: 'unsupported',
      },
    };
    const compiled = compileEffect(supportSource([operation]), 0);
    expect(compiled).toEqual({ operations: [], projections: [] });
  });

  it('fails closed when a requirement needs an unresolved recipient', () => {
    const unresolved = source([modifier('attackBuff', 100)]);
    unresolved.effect = {
      ...unresolved.effect,
      requirement: {
        recipient: 'unresolved',
        expression: {
          kind: 'trait',
          scope: 'recipient',
          trait: 'testTrait',
          present: true,
          provenance: {
            stateSources: 'activeOnly',
            ignoredStateTraits: 'exclude',
            unremovableStateTraits: 'include',
          },
        },
      },
    };
    const compiled = compileEffect(unresolved, 0);
    expect(compiled.operations).toEqual([]);
    expect(compiled.projections).toMatchObject([
      {
        executionSupport: 'unsupported',
        explanation: {
          condition: { kind: 'unsupported', reason: 'unresolvedRecipient' },
        },
      },
    ]);
  });

  it('binds the current attacker quantity subject to the executable state', () => {
    const attacker = source([modifier('npDamageBuff', 200)]);
    attacker.origin = 'attacker';
    attacker.phase = 'attackerSkill';
    attacker.sourceInstanceId = 'attacker:705300';
    attacker.sourceId = '705300';
    attacker.skillId = '2657650';
    attacker.effect = {
      ...attacker.effect,
      requirement: {
        recipient: 'sourceSelf',
        expression: {
          kind: 'quantity',
          quantity: 'battlePointPhase',
          subjectId: '705300',
          comparison: 'atMost',
          value: 1,
        },
      },
    };

    const compiled = compileEffect(attacker, 0);

    expect(compiled.projections).toEqual([]);
    expect(compiled.operations).toMatchObject([
      {
        condition: {
          kind: 'quantity',
          quantity: 'battlePointPhase',
          comparison: 'atMost',
          value: 1,
        },
      },
    ]);
    expect(compiled.operations[0]?.condition).not.toHaveProperty('subjectId');
  });

  it('assigns unique trace IDs to repeated operations without changing singleton IDs', () => {
    const compiled = compileEffect(
      source([modifier('attackBuff', 100), modifier('attackBuff', 200)]),
      0,
    );
    expect(compiled.operations.map((operation) => operation.operationId)).toEqual([
      'craftEssence:craftEssence:1:ce:1:1:0:modifier:attackBuff',
      'craftEssence:craftEssence:1:ce:1:1:0:modifier:attackBuff:1',
    ]);
  });

  it('binds a support-owned HP expression to a typed source context input', () => {
    const hpModifier: EffectExecutionOperation = {
      kind: 'damageModifier',
      route: {
        target: 'partyMember',
        contributionScope: 'partyWide',
        eligibility: {
          kind: 'requiredRecipient',
          recipient: 'attacker',
          onMissing: 'ignore',
          onMismatch: 'unsupported',
        },
      },
      semanticSupport: 'supported',
      modifier: 'attackBuff',
      sign: 1,
      card: null,
      values: values(100),
      valueExpressions: [
        [{ kind: 'inverseHpLinear', basePermille: 100, bonusAtZeroHpPermille: 300 }],
        [],
        [],
        [],
        [],
      ],
    };
    const compiled = compileEffect(supportSource([hpModifier]), 0);
    expect(compiled.projections).toEqual([]);
    expect(compiled.operations).toMatchObject([
      {
        kind: 'addModifier',
        valueExpression: {
          kind: 'inverseHpLinear',
          quantitySource: {
            kind: 'canonicalInput',
            inputKey: 'source:support:support:leonidas:hpPermille',
          },
        },
        inputDefinitions: [
          {
            kind: 'sourceHpPermille',
            owner: 'source',
            minimum: 0,
            maximum: 1_000,
            defaultValue: 1_000,
          },
        ],
      },
    ]);
  });
});
