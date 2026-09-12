import { describe, expect, it } from 'vitest';
import type { ConditionExpression, OperationModifierValueExpression } from './contracts';
import {
  ATTACKER_RESOURCE_ACTOR,
  conditionQuantityReads,
  expressionQuantityReads,
  readsResource,
  resourceQueriesMayIntersect,
  resourceRecipientActor,
  resourceSourceActor,
  mutationResourceAccess,
  type ResourceActor,
  type ResourceQuery,
} from './resourceQueries';
import {
  conditionReadsResource,
  operationReadsResource,
  closeResourceMutationSemantics,
} from './resourceSemantics';
import type { BattleOperation } from './contracts';

const support = { origin: 'support' as const, sourceInstanceId: 'support:a', skillId: 'skill' };
const attacker = { origin: 'attacker' as const, sourceInstanceId: 'self', skillId: 'skill' };
const hp = (actor: ResourceActor): ResourceQuery => ({ resource: 'hp', measure: 'ratio', actor });
const rate: ConditionExpression = {
  kind: 'sourceQuantity',
  source: support,
  quantity: 'battlePointRate',
  subjectId: 'domain',
  comparison: 'atLeast',
  value: 500,
};

const operationBase: Omit<
  Extract<BattleOperation, { kind: 'preserveSemanticEffect' }>,
  'kind' | 'semanticKind'
> = {
  operationId: 'fixture',
  order: 0,
  phase: 'support',
  source: { ...support, sourceId: 'support', effectId: 'effect', effectOccurrenceId: 'effect:0' },
  contributionScope: 'personal',
  condition: { kind: 'always' },
  decisionKey: null,
  decisionPlan: { activation: 'automatic', condition: 'evaluate' },
  sourceEnabled: true,
  enabledByDefault: true,
  gameActivation: 'skillUse',
  proc: { kind: 'guaranteed' },
  procRatePermille: 1000,
  activation: { kind: 'sourceDefault' },
  evidence: { rawPath: 'fixture', functionId: 'fixture' },
  presentation: { label: 'fixture', sourceName: 'fixture', skillName: 'fixture' },
  inputDefinitions: [],
};

describe('canonical physical resource reads', () => {
  it('describes a live buff instance read at the recipient, independently of its initial input', () => {
    expect(
      mutationResourceAccess(
        {
          kind: 'resourceMutation',
          resource: 'npGauge',
          direction: 'gain',
          unit: 'fixed',
          recipient: 'sourceSelf',
          subjectId: null,
          amount: {
            kind: 'buffCount',
            trait: 'counted',
            inputKey: 'initial',
            values: [[5000], [], [], [], []],
          },
        },
        support,
      ),
    ).toEqual({
      write: {
        resource: 'npGauge',
        measure: 'current',
        actor: { kind: 'source', origin: 'support', sourceInstanceId: 'support:a' },
      },
      amountReads: [
        {
          kind: 'buffInstances',
          actor: { kind: 'source', origin: 'support', sourceInstanceId: 'support:a' },
          trait: 'counted',
          lifetime: 'active',
        },
      ],
    });
  });
  it('keeps the BP domain independent of source actor and skill identity through nested boolean composition', () => {
    const condition: ConditionExpression = {
      kind: 'not',
      expression: {
        kind: 'any',
        expressions: [
          { kind: 'always' },
          {
            kind: 'all',
            expressions: [rate, { kind: 'unsupported', reason: 'unresolvedPreparationWrite' }],
          },
        ],
      },
    };
    expect(conditionQuantityReads(condition)).toEqual([
      {
        kind: 'resource',
        query: {
          resource: 'battlePoint',
          measure: 'rate',
          domain: 'domain',
          actor: { kind: 'source', origin: 'support', sourceInstanceId: 'support:a' },
        },
      },
      {
        kind: 'unresolved',
        reason: 'unresolvedPreparationWrite',
        resources: ['hp', 'npGauge', 'battlePoint', 'criticalStars'],
      },
    ]);
    expect(conditionReadsResource(rate, 'battlePoint')).toBe(true);
    expect(conditionReadsResource(rate, 'hp')).toBe(false);
    expect(conditionReadsResource(condition, 'hp')).toBe(true);
    expect(conditionQuantityReads({ ...rate, source: { ...support, skillId: 'another' } })).toEqual(
      conditionQuantityReads(rate),
    );
  });

  it('keeps unknown non-quantity conditions opaque without fabricating a resource read', () => {
    const unresolved: ConditionExpression = { kind: 'unsupported', reason: 'unresolvedRecipient' };
    expect(conditionQuantityReads(unresolved)).toEqual([
      { kind: 'unresolved', reason: 'unresolvedRecipient', resources: [] },
    ]);
    expect(conditionReadsResource(unresolved, 'hp')).toBe(false);
    const original: ConditionExpression = {
      kind: 'quantity',
      quantity: 'attackerHpPermille',
      comparison: 'equal',
      value: 0,
    };
    const invalidated: ConditionExpression = {
      kind: 'unsupported',
      reason: 'unresolvedPreparationWrite',
      readDependency: original,
    };
    expect(conditionQuantityReads(invalidated)).toEqual([
      { kind: 'unresolved', reason: 'unresolvedPreparationWrite', resources: [] },
      ...conditionQuantityReads(original),
    ]);
    expect(conditionReadsResource(invalidated, 'hp')).toBe(true);
    expect(
      conditionReadsResource(
        {
          ...invalidated,
          readDependency: { kind: 'trait', scope: 'attacker', trait: 'x', present: true },
        },
        'hp',
      ),
    ).toBe(false);
  });

  it('does not misclassify a star input as NP, HP, or BP', () => {
    const condition: ConditionExpression = {
      kind: 'inputQuantity',
      inputKey: 'battle:criticalStars',
      comparison: 'atLeast',
      value: 10,
    };
    const reads = conditionQuantityReads(condition);
    expect(
      ['hp', 'npGauge', 'battlePoint', 'criticalStars'].map((resource) =>
        readsResource(reads, resource as ResourceQuery['resource']),
      ),
    ).toEqual([false, false, false, true]);
    expect(
      conditionQuantityReads({ ...condition, inputKey: 'source:external:battle:criticalStars' }),
    ).toEqual([{ kind: 'input', inputKey: 'source:external:battle:criticalStars' }]);
  });

  it('keeps subject-qualified HP invalid instead of using the attacker as a fallback', () => {
    expect(
      conditionQuantityReads({
        kind: 'quantity',
        quantity: 'attackerHpPermille',
        subjectId: 'foreign',
        comparison: 'equal',
        value: 0,
      }),
    ).toContainEqual({ kind: 'unresolved', reason: 'unexpectedHpSubject', resources: ['hp'] });
  });

  it('separates the condition facts actor from the source HP input owner', () => {
    const context = {
      actor: ATTACKER_RESOURCE_ACTOR,
      sourceActor: resourceSourceActor(support),
      inputDefinitions: [
        {
          key: 'support-hp',
          kind: 'sourceHpPermille' as const,
          owner: 'source' as const,
          label: 'HP',
          description: 'source HP',
          minimum: 0,
          maximum: 1000,
          step: 10,
          defaultValue: 1000,
          defaultReason: 'initial HP',
        },
      ],
    };
    expect(
      conditionQuantityReads(
        {
          kind: 'all',
          expressions: [
            { kind: 'quantity', quantity: 'attackerHpPermille', comparison: 'atLeast', value: 500 },
            { kind: 'inputQuantity', inputKey: 'support-hp', comparison: 'atLeast', value: 500 },
          ],
        },
        context,
      ),
    ).toEqual([
      { kind: 'resource', query: hp(ATTACKER_RESOURCE_ACTOR) },
      { kind: 'resource', query: hp(resourceSourceActor(support)) },
    ]);
  });

  it('binds HP values to their value owner independently of a recipient condition', () => {
    const expression: OperationModifierValueExpression = {
      kind: 'inverseHpLinear',
      basePermille: 0,
      bonusAtZeroHpPermille: 1000,
      quantitySource: { kind: 'canonicalInput', inputKey: 'source:support:support:a:hpPermille' },
    };
    expect(
      expressionQuantityReads(expression, {
        actor: resourceSourceActor(support),
        sourceActor: resourceSourceActor(support),
      }),
    ).toEqual([{ kind: 'resource', query: hp(resourceSourceActor(support)) }]);
    expect(expressionQuantityReads(expression)).toEqual([
      { kind: 'resource', query: hp({ kind: 'unresolved' }) },
    ]);
    expect(
      expressionQuantityReads(
        { ...expression, quantitySource: { kind: 'attackerHpPermille' } },
        { actor: resourceSourceActor(support), sourceActor: resourceSourceActor(support) },
      ),
    ).toEqual([{ kind: 'resource', query: hp(ATTACKER_RESOURCE_ACTOR) }]);
  });

  it.each(['sourceSelf', 'partyOther', 'partyMember', 'enemy', 'unresolved'] as const)(
    'intersects %s writes with physical actors without collapsing all others',
    (recipient) => {
      const query = hp(resourceRecipientActor(attacker, recipient));
      const actual = [
        ATTACKER_RESOURCE_ACTOR,
        resourceSourceActor(support),
        { kind: 'target' as const },
      ].map((actor) => resourceQueriesMayIntersect(query, hp(actor)));
      const expected = {
        sourceSelf: [true, false, false],
        partyOther: [false, true, false],
        partyMember: [true, true, false],
        enemy: [false, false, true],
        unresolved: [true, true, true],
      };
      expect(actual).toEqual(expected[recipient]);
      for (const actor of [ATTACKER_RESOURCE_ACTOR, resourceSourceActor(support)])
        expect(resourceQueriesMayIntersect(hp(actor), query)).toBe(
          resourceQueriesMayIntersect(query, hp(actor)),
        );
    },
  );

  it('excludes only the actual source from partyOther and distinguishes BP domains', () => {
    const actor = resourceRecipientActor(support, 'partyOther');
    expect(resourceQueriesMayIntersect(hp(actor), hp(ATTACKER_RESOURCE_ACTOR))).toBe(true);
    expect(resourceQueriesMayIntersect(hp(actor), hp(resourceSourceActor(support)))).toBe(false);
    const phase: ResourceQuery = {
      resource: 'battlePoint',
      measure: 'phase',
      domain: 'a',
      actor: ATTACKER_RESOURCE_ACTOR,
    };
    expect(resourceQueriesMayIntersect(phase, { ...phase, measure: 'rate', domain: 'b' })).toBe(
      false,
    );
    expect(resourceQueriesMayIntersect(phase, { ...phase, domain: null })).toBe(true);
  });

  it('retains the physical binding of compiled source HP input conditions', () => {
    const operation: BattleOperation = {
      ...operationBase,
      kind: 'preserveSemanticEffect',
      semanticKind: 'boundedPhaseIrrelevant',
      inputDefinitions: [
        {
          key: 'fixture:quantity',
          kind: 'sourceHpPermille',
          owner: 'source',
          label: 'HP',
          description: 'source HP',
          minimum: 0,
          maximum: 1000,
          step: 10,
          defaultValue: 1000,
          defaultReason: 'initial HP',
        },
      ],
      condition: {
        kind: 'not',
        expression: {
          kind: 'inputQuantity',
          inputKey: 'fixture:quantity',
          comparison: 'atLeast',
          value: 500,
        },
      },
    };
    expect(operationReadsResource(operation, 'hp')).toBe(true);
    expect(operationReadsResource(operation, 'npGauge')).toBe(false);
    expect(operationReadsResource({ ...operation, inputDefinitions: [] }, 'hp')).toBe(false);
  });

  it('retains source HP expressions in the runtime suffix instead of erasing a potential dependency', () => {
    const modifier: BattleOperation = {
      ...operationBase,
      modifier: 'attackBuff',
      valuePermille: 0,
      card: null,
      kind: 'addModifier',
      condition: { kind: 'always' },
      valueExpression: {
        kind: 'inverseHpLinear',
        basePermille: 0,
        bonusAtZeroHpPermille: 1000,
        quantitySource: { kind: 'canonicalInput', inputKey: 'sourceHp' },
      },
    };
    expect(operationReadsResource(modifier, 'hp')).toBe(true);
    const mutation: BattleOperation = {
      ...operationBase,
      direction: 'loss',
      lossFloor: 'zero',
      unit: 'fixed',
      amount: 1,
      subjectId: null,
      kind: 'resourceMutation',
      resource: 'hp',
      resolution: 'resourceStateUnavailable',
      source: { ...operationBase.source, ...attacker },
      condition: { kind: 'always' },
    };
    expect(closeResourceMutationSemantics([mutation, modifier])[0]).toMatchObject({
      resolution: 'resourceStateUnavailable',
    });
    expect(closeResourceMutationSemantics([modifier, mutation])[1]).toMatchObject({
      resolution: 'noDamageReader',
    });
  });
});

it('describes stack conditions and modifier amounts as live instance reads with their own actor and lifetime', () => {
  const input = {
    kind: 'effectStackCount' as const,
    key: 'stack:targetState:counted',
    owner: 'target' as const,
    label: 'count',
    description: 'count',
    minimum: 0 as const,
    maximum: 10,
    step: 1 as const,
    defaultValue: 0,
    defaultReason: 'none',
    quantitySource: { scope: 'targetState' as const, trait: 'counted' },
    instanceTraits: ['counted'],
  };
  const expected = [
    { kind: 'buffInstances', actor: { kind: 'target' }, trait: 'counted', lifetime: 'all' },
  ];
  expect(
    conditionQuantityReads(
      { kind: 'inputQuantity', inputKey: input.key, comparison: 'atLeast', value: 1 },
      {
        actor: { kind: 'attacker' },
        sourceActor: { kind: 'source', origin: 'support', sourceInstanceId: 'giver' },
        inputDefinitions: [input],
      },
    ),
  ).toEqual(expected);
  expect(
    expressionQuantityReads({
      kind: 'stackLinear',
      sources: [input],
      basePermille: 0,
      perUnitPermille: 50,
      maximumUnits: 10,
      maximumValuePermille: null,
    }),
  ).toEqual(expected);
});
