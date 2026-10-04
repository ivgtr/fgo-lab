import { describe, expect, it } from 'vitest';
import {
  masterEffectSchema,
  masterSnapshotSchema,
  type MasterEffect,
  type ServantMaster,
} from '@fgo-lab/master-data';
import fixture from '../../test-fixtures/master/fixture.json';
import { compileStaticRankingPreparationPrograms } from './rankingStaticPreparation';
import { observeResourceProgram } from './resourceProgramAudit';

const master = masterSnapshotSchema.parse(fixture);
const servant = master.servants[0]!;
const route = {
  target: 'sourceSelf' as const,
  contributionScope: 'personal' as const,
  eligibility: { kind: 'anyRecipient' as const, onMissing: 'unsupported' as const },
};
const values = [[100], [], [], [], []] as [number[], number[], number[], number[], number[]];
function effect(
  id: string,
  execution: MasterEffect['execution'],
  requirement: MasterEffect['requirement']['expression'] = { kind: 'always' },
): MasterEffect {
  return masterEffectSchema.parse({
    id,
    occurrenceId: id,
    label: id,
    availability: 'allLimitBreakStates',
    inclusionPolicy: { default: 'include' },
    gameActivation: 'skillUse',
    proc: { kind: 'guaranteed' },
    selection: null,
    interaction: null,
    triggerScope: null,
    operationTrigger: null,
    operationReference: null,
    stateIdentity: null,
    inputDefinitions: [],
    requirement: { recipient: 'sourceSelf', expression: requirement },
    execution,
    atlasEvidence: {
      functionType: 'fixture',
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
  });
}
const loss = (recipient: 'sourceSelf' | 'partyOther' = 'sourceSelf') => ({
  kind: 'resourceMutation' as const,
  resource: 'hp' as const,
  direction: 'loss' as const,
  unit: 'fixed' as const,
  lossFloor: 'zero' as const,
  recipient,
  amount: { kind: 'fixed' as const, values },
  subjectId: null,
});
function observe(effects: MasterEffect[]) {
  const program = compileStaticRankingPreparationPrograms(
    servant,
    rankingBasisFixture(servant).skillLevels,
  )[0]!;
  const skill: ServantMaster['skills'][number] = {
    id: 'skill',
    name: 'skill',
    slot: 1,
    priority: 0,
    detail: '',
    imageKey: null,
    resourceRequirement: null,
    effects,
  };
  return observeResourceProgram(servant, {
    ...program,
    sourceUses: [
      { kind: 'skill', actorFormId: program.initialFormId, skill, effects, skillLevel: 1 },
    ],
  });
}

describe('selected program resource observation', () => {
  it('keeps a missing HP guard separate from a numeric HP reader, and distinguishes another recipient', () => {
    const observed = observe([effect('self', [loss()]), effect('other', [loss('partyOther')])]);
    expect(observed.mutations.filter(({ resource }) => resource === 'hp')).toMatchObject([
      {
        writer: { effect: 'self' },
        actor: { kind: 'attacker' },
        firstPotentialReader: null,
        firstRequiredHpGuard: { phase: 'npUse' },
      },
      {
        writer: { effect: 'other' },
        actor: { kind: 'allies', excluded: { kind: 'attacker' } },
        firstPotentialReader: null,
        firstRequiredHpGuard: null,
      },
    ]);
  });
  it('does not invent an execution clock for an ordinary amount reader', () => {
    const observed = observe([
      effect('mixed', [
        loss(),
        {
          kind: 'damageModifier',
          modifier: 'attackBuff',
          sign: 1,
          card: null,
          route,
          values,
          semanticSupport: 'supported',
          valueExpressions: [
            [{ kind: 'inverseHpLinear', basePermille: 0, bonusAtZeroHpPermille: 1000 }],
            [],
            [],
            [],
            [],
          ],
        },
      ]),
    ]);
    expect(observed.mutations.find(({ resource }) => resource === 'hp')).toMatchObject({
      firstPotentialReader: null,
      deferredReader: { effect: 'mixed', operation: 1, phase: 'ordinaryDependency' },
    });
  });
  it('does not turn unsupported non-damage metadata into a no-reader proof', () => {
    const observed = observe([
      effect('loss', [loss()]),
      effect('opaque', [
        { kind: 'unsupported', reason: 'contextReference', route, damageRelevant: false },
      ]),
    ]);
    expect(observed.mutations[0]?.firstOpaqueOperation).toMatchObject({ effect: 'opaque' });
    expect(observed.opaqueOperations).toContainEqual(
      expect.objectContaining({ reason: 'contextReference' }),
    );
  });
  it('keeps nested source-qualified reads opaque instead of certifying no resource dependency', () => {
    const observed = observe([
      effect('loss', [loss()]),
      effect('foreign-rate', [loss()], {
        kind: 'not',
        requirement: {
          kind: 'any',
          requirements: [
            { kind: 'always' },
            {
              kind: 'sourceQuantity',
              quantity: 'battlePointRate',
              subjectId: 'source',
              comparison: 'atLeast',
              value: 500,
            },
          ],
        },
      }),
    ]);
    expect(observed.readCoverage).toBe('declaredQueriesPartialExecution');
    expect(
      observed.opaqueOperations.find(({ position }) => position.effect === 'foreign-rate'),
    ).toMatchObject({
      reason: 'unresolvedLiveBattlePointRead',
    });
  });
  it('finds a reader confined to a nondefault limit-break cell', () => {
    const fixed = effect('fixed', [
      {
        kind: 'damageModifier',
        modifier: 'attackBuff',
        sign: 1,
        card: null,
        route,
        values,
        semanticSupport: 'supported',
        valueExpressions: [[], [], [], [], []],
      },
    ]);
    const modifier = fixed.execution[0]!;
    if (modifier.kind !== 'damageModifier') throw new Error('fixture');
    const lb = effect('lb', [
      {
        ...modifier,
        limitBreakValueExpressions: [
          [],
          [],
          [],
          [],
          [{ kind: 'inverseHpLinear', basePermille: 0, bonusAtZeroHpPermille: 1000 }],
        ],
      },
    ]);
    expect(observe([effect('loss', [loss()]), fixed]).mutations[0]?.deferredReader).toBeNull();
    expect(observe([effect('loss', [loss()]), lb]).mutations[0]?.deferredReader).toMatchObject({
      effect: 'lb',
    });
  });
  it('excludes command-card-only writes from this bounded program', () => {
    const excluded = { ...effect('outside', [loss()]), triggerScope: 'commandCardAttack' as const };
    expect(observe([excluded]).mutations.some(({ resource }) => resource === 'hp')).toBe(false);
  });
  it('reads proportional NP at its own position rather than treating a later NP use as the first read', () => {
    const np = (kind: 'fixed' | 'currentGaugeRatio') => ({
      kind: 'resourceMutation' as const,
      resource: 'npGauge' as const,
      direction: 'gain' as const,
      unit: 'fixed' as const,
      recipient: 'sourceSelf' as const,
      subjectId: null,
      amount: { kind, values },
    });
    const observed = observe([effect('np', [np('fixed'), np('currentGaugeRatio')])]);
    expect(observed.mutations[0]).toMatchObject({
      firstPotentialReader: { effect: 'np', operation: 1 },
    });
  });
  it('keeps HP-dependent OC rates deferred until a boost attempts to use the rate', () => {
    const application = {
      applicationRatePermille: 1000,
      turns: { kind: 'unlimited' as const },
      uses: { kind: 'unlimited' as const },
    };
    const rate = effect('rate', [
      {
        kind: 'grantOcApplicationRate',
        route,
        lifetime: 'active',
        stacking: 'additive',
        stateTraits: ['grantSuccessUp'],
        role: 'casterGrant',
        sign: 1,
        selector: 'positive',
        cells: [
          [
            {
              ...application,
              amount: { kind: 'inverseHpLinear', basePermille: 0, bonusAtZeroHpPermille: 1000 },
            },
          ],
          [],
          [],
          [],
          [],
        ],
      },
    ]);
    const boost = effect('boost', [
      {
        kind: 'grantOcBoost',
        route,
        lifetime: 'active',
        stacking: 'additive',
        stateTraits: ['positive'],
        cells: [[{ ...application, stages: 1 }], [], [], [], []],
      },
    ]);
    for (const effects of [
      [effect('hp', [loss()]), rate, boost],
      [rate, effect('hp', [loss()]), boost],
    ]) {
      expect(observe(effects).mutations.find(({ resource }) => resource === 'hp')).toMatchObject({
        firstPotentialReader: { effect: 'boost' },
      });
    }
    expect(
      observe([effect('hp', [loss()]), rate]).mutations.find(({ resource }) => resource === 'hp'),
    ).toMatchObject({ firstPotentialReader: null });
  });
});
import { rankingBasisFixture } from './rankingBasisFixture';
