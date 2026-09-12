import { populationGaugeHasOneTerminalOc } from './ocResourceDependencies';
import { DEFAULT_NP_RESOURCE_SEMANTICS } from './npResource';
import { effectReadsOc, ocRelevantSourceIndexes } from './ocDependency';
import { describe, expect, it } from 'vitest';
import { analyzeActivationFactSet } from '@fgo-lab/schema';
import {
  masterEffectSchema,
  type MasterEffect,
  type NoblePhantasmVariant,
  type OcExecutionOperation,
} from '@fgo-lab/master-data';
import { preparationSourceConditionState } from './preparationFacts';
import { compileEffectCached, compileEffectCondition } from './operationCompiler';
import { evaluateCondition } from './condition';
import { createConditionState } from './conditionState';
import { compileOcSourceProgram, evaluateOcSourceCondition } from './ocSourceProgram';
import { bindOcSourceOperation } from './ocSourceBinding';
import { createOcState, executeOcAction } from './ocState';
import type { SourceEffect } from './sourceCollection';

const atlasEvidence = {
  functionType: 'fixture',
  target: 'self',
  parameterSets: [[], [], [], [], []] as [never[], never[], never[], never[], never[]],
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
};

const route = {
  target: 'sourceSelf',
  contributionScope: 'personal',
  eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
} as const;
const boost: Extract<OcExecutionOperation, { kind: 'grantOcBoost' }> = {
  kind: 'grantOcBoost',
  route,
  lifetime: 'active',
  stacking: 'additive',
  stateTraits: ['positive'],
  cells: [1, 2, 3, 4, 5].map((stages) => [
    {
      stages,
      applicationRatePermille: 1000,
      turns: { kind: 'unlimited' },
      uses: { kind: 'finite', remaining: 1 },
    },
  ]) as Extract<OcExecutionOperation, { kind: 'grantOcBoost' }>['cells'],
};
function source(
  requirement: MasterEffect['requirement']['expression'] = { kind: 'always' },
): SourceEffect {
  const effect = masterEffectSchema.parse({
    id: 'oc',
    occurrenceId: 'oc:0',
    label: 'OC',
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
    execution: [boost],
    atlasEvidence,
  });
  return {
    phase: 'attackerSkill',
    origin: 'attacker',
    sourceInstanceId: 'attacker:self',
    sourceId: 'self',
    sourceName: 'self',
    sourceTraits: ['dragon'],
    skillId: 'skill',
    skillName: 'skill',
    effect,
    valueSetIndex: 0,
    valueIndex: 0,
    limitBreak: false,
    sourceEnabled: true,
    enabledByDefault: true,
    noblePhantasmVariant: null,
    preparationStochasticOutcome: null,
  };
}
const variant: NoblePhantasmVariant = {
  kind: 'nonAttack',
  canonicalId: 'np',
  ref: { actorFormId: { actorId: 'self', limitCount: 0 }, noblePhantasmId: 'np' },
  name: 'np',
  priority: 1,
  effects: [],
};
function facts() {
  const activation = analyzeActivationFactSet([]);
  if (activation.status !== 'valid') throw new Error('invalid fixture');
  return createConditionState(
    {
      cardType: 'arts',
      attackerStateTraits: [],
      targetStateTraits: [],
      fieldTraits: ['sunlight'],
      target: { traits: ['dragon'] },
      attackerHpPermille: null,
      targetRarity: null,
      battlePointPhase: 0,
    },
    variant,
    ['dragon'],
    {},
    [],
    [],
    activation.factSet,
  );
}
const provenance = {
  stateSources: 'activeOnly',
  ignoredStateTraits: 'exclude',
  unremovableStateTraits: 'include',
} as const;
const field = {
  kind: 'trait',
  scope: 'field',
  trait: 'sunlight',
  present: true,
  provenance,
} as const;
describe('OC source program and common condition owner', () => {
  it.each(['commandCard', 'commandCardAttack'] as const)(
    'does not compile or depend on %s OC and NP writes in a bounded NP program',
    (triggerScope) => {
      const inactive = source();
      inactive.effect = masterEffectSchema.parse({
        ...inactive.effect,
        triggerScope,
        execution: [
          boost,
          {
            kind: 'resourceMutation',
            resource: 'npGauge',
            direction: 'gain',
            unit: 'fixed',
            recipient: 'sourceSelf',
            subjectId: null,
            amount: { kind: 'fixed', values: [[10000], [], [], [], []] },
          },
        ],
      });
      for (const origin of [
        'attacker',
        'passive',
        'craftEssence',
        'support',
        'mysticCode',
        'np',
      ] as const) {
        const bound = { ...inactive, origin };
        expect(compileEffectCached(bound, 0).operations).toEqual([]);
        expect(compileOcSourceProgram(bound).operations).toEqual([]);
      }
      expect(effectReadsOc(inactive.effect)).toBe(false);
      expect(
        ocRelevantSourceIndexes([{ kind: 'skill', effects: [inactive.effect] }], true, {
          semantics: DEFAULT_NP_RESOURCE_SEMANTICS,
          npLevel: 2,
          initialGauge: 0,
          automaticEffects: [],
        }).size,
      ).toBe(0);
      const active = { ...inactive.effect, triggerScope: null };
      expect(effectReadsOc(active)).toBe(true);
      expect(
        ocRelevantSourceIndexes([{ kind: 'skill', effects: [active] }], true, {
          semantics: DEFAULT_NP_RESOURCE_SEMANTICS,
          npLevel: 2,
          initialGauge: 0,
          automaticEffects: [],
        }).size,
      ).toBe(1);
    },
  );
  it('rejects unknown trigger vocabulary at the canonical boundary', () => {
    expect(
      masterEffectSchema.safeParse({ ...source().effect, triggerScope: 'unknownTrigger' }).success,
    ).toBe(false);
    expect(() =>
      compileEffectCached(
        {
          ...source(),
          effect: {
            ...source().effect,
            triggerScope: 'unknownTrigger' as MasterEffect['triggerScope'],
          },
        },
        0,
      ),
    ).toThrow('unknown_np_program_trigger_scope');
  });

  it.each(['between', 'after', 'disabled'] as const)(
    'retains the canonical HP writer at %s through the live rate query',
    (position) => {
      const rateSource = source();
      rateSource.effect = masterEffectSchema.parse({
        ...rateSource.effect,
        occurrenceId: 'rate:0',
        execution: [
          {
            kind: 'grantOcApplicationRate',
            route,
            lifetime: 'active',
            stacking: 'additive',
            stateTraits: ['positive'],
            role: 'casterGrant',
            sign: 1,
            selector: 'positive',
            cells: [
              [
                {
                  applicationRatePermille: 1000,
                  turns: { kind: 'unlimited' },
                  uses: { kind: 'unlimited' },
                  amount: { kind: 'inverseHpLinear', basePermille: 0, bonusAtZeroHpPermille: 400 },
                },
              ],
              [],
              [],
              [],
              [],
            ],
          },
        ],
      });
      const writer = source();
      writer.sourceEnabled = position !== 'disabled';
      writer.effect = masterEffectSchema.parse({
        ...writer.effect,
        occurrenceId: 'hp:0',
        execution: [
          {
            kind: 'resourceMutation',
            resource: 'hp',
            direction: 'loss',
            lossFloor: 'oneIfAlive' as const,
            unit: 'fixed',
            recipient: 'sourceSelf',
            subjectId: null,
            amount: { kind: 'fixed', values: [[100], [], [], [], []] },
          },
        ],
      });
      const stateFacts = facts();
      stateFacts.quantities.attackerHpPermille = 500;
      const context = {
        facts: stateFacts,
        policy: { kind: 'calculator' } as const,
        npActionId: null,
        procWitnesses: {},
      };
      const sources =
        position === 'after' ? [rateSource, source(), writer] : [rateSource, writer, source()];
      const instructions = sources.flatMap((s) => {
        const program = compileOcSourceProgram(s);
        return program.operations.map(
          (_, index) => (state: ReturnType<typeof createOcState>) =>
            bindOcSourceOperation(program, index, context, state),
        );
      });
      const prior = createOcState();
      const result = executeOcAction(prior, 'action', instructions, { attacker: 500 });
      expect(result.status).toBe(position === 'between' ? 'unsupported' : 'committed');
      if (position === 'between') expect(result.state).toBe(prior);
      else expect(result.state.boosts).toHaveLength(1);
    },
  );
  it.each([
    { kind: 'always' } as const,
    field,
    { kind: 'trait', scope: 'recipient', trait: 'dragon', present: true, provenance } as const,
    {
      kind: 'all',
      requirements: [
        field,
        { kind: 'quantity', quantity: 'attackerHpPermille', comparison: 'atLeast', value: 500 },
      ],
    } as const,
  ])('matches ordinary condition evaluation for $kind', (requirement) => {
    const s = source(structuredClone(requirement) as MasterEffect['requirement']['expression']);
    const program = compileOcSourceProgram(s);
    expect(evaluateOcSourceCondition(program, facts())).toBe(
      evaluateCondition(
        compileEffectCondition(s.effect, s.origin, s.sourceId, s.sourceInstanceId, s.skillId),
        facts(),
      ),
    );
  });
  it.each([false, true])(
    'keeps a support-only OC condition only when a finite rate may be consumed: %s',
    (finite) => {
      const s = source({ ...field, trait: 'unknown-field' });
      s.origin = 'support';
      s.sourceInstanceId = 'support:self';
      const state = createOcState();
      if (finite)
        state.uncertainRates = [
          {
            sourceKey: 'pending-rate',
            owner: 'support:self',
            role: 'casterGrant',
            lifetime: 'active',
            stateTraits: ['positive'],
            turns: { kind: 'unlimited' },
            uses: { kind: 'finite', remaining: 1 },
            requiredInput: null,
            occurrenceId: 'pending',
          },
        ];
      expect(
        bindOcSourceOperation(
          compileOcSourceProgram(s),
          0,
          { facts: facts(), policy: { kind: 'calculator' }, npActionId: null, procWitnesses: {} },
          state,
        ),
      ).toMatchObject(
        finite
          ? { kind: 'reject', status: 'inputRequired' }
          : { kind: 'skip', outcome: 'notApplicable' },
      );
    },
  );
  it('uses an existing exclusive sibling as negative evidence while retaining unrelated unknown facts', () => {
    const state = facts();
    const condition = {
      kind: 'trait',
      scope: 'attacker',
      trait: 'traitId:3121',
      present: true,
    } as const;
    expect(evaluateCondition(condition, state)).toBeNull();
    (state.traits.attackerState as Map<string, boolean>).set('traitId:3122', true);
    expect(evaluateCondition(condition, state)).toBe(false);
    expect(evaluateCondition({ ...condition, trait: 'unrelated' }, state)).toBeNull();
    (state.traits.attackerState as Map<string, boolean>).delete('traitId:3122');
    expect(evaluateCondition(condition, state)).toBeNull();
  });
  it('keeps unknown input distinct from a false condition', () => {
    const program = compileOcSourceProgram(
      source({
        kind: 'all',
        requirements: [
          field,
          { kind: 'quantity', quantity: 'attackerHpPermille', comparison: 'atLeast', value: 500 },
        ],
      }),
    );
    const state = facts();
    const context = {
      facts: state,
      policy: { kind: 'calculator' } as const,
      npActionId: null,
      procWitnesses: {},
    };
    expect(bindOcSourceOperation(program, 0, context, createOcState())).toMatchObject({
      kind: 'reject',
      status: 'inputRequired',
    });
    (state.traits.field as Map<string, boolean>).set('sunlight', false);
    expect(bindOcSourceOperation(program, 0, context, createOcState())).toEqual({
      kind: 'skip',
      outcome: 'conditionFalse',
    });
  });
  it.each([
    'absent',
    'live',
    'constant',
    'expired',
    'otherRecipient',
    'otherSelector',
    'pending',
  ] as const)('requires an unknown removal condition only for its %s intersection', (path) => {
    const context = {
      facts: facts(),
      policy: { kind: 'calculator' } as const,
      npActionId: null,
      procWitnesses: {},
    };
    const granted = executeOcAction(
      createOcState(),
      'grant',
      [(state) => bindOcSourceOperation(compileOcSourceProgram(source()), 0, context, state)],
      {},
    );
    expect(granted.status).toBe('committed');
    const state = structuredClone(granted.state);
    const instance = state.boosts[0]!;
    if (path === 'absent') state.boosts = [];
    if (path === 'constant') state.boosts = [{ ...instance, lifetime: 'constant' }];
    if (path === 'expired')
      state.boosts = [{ ...instance, uses: { kind: 'finite', remaining: 0 } }];
    if (path === 'otherRecipient') state.boosts = [{ ...instance, owner: 'support' }];
    if (path === 'otherSelector') state.boosts = [{ ...instance, stateTraits: ['negative'] }];
    if (path === 'pending') {
      state.boosts = [];
      state.uncertainRates = [
        { ...instance, role: 'casterGrant', requiredInput: null, occurrenceId: 'pending' },
      ];
    }
    const removal = source({ ...field, trait: 'unknown-field' });
    removal.effect = {
      ...removal.effect,
      execution: [
        {
          kind: 'removeOcState',
          route,
          selector: ['positive'],
          applicationRates: [[1000], [], [], [], []],
        },
      ],
    };
    expect(bindOcSourceOperation(compileOcSourceProgram(removal), 0, context, state)).toMatchObject(
      path === 'live' || path === 'pending'
        ? { kind: 'reject', status: 'inputRequired' }
        : { kind: 'skip', outcome: 'notApplicable' },
    );
  });
  it('shares static cells without caching mutable invocation state', () => {
    const first = source();
    const a = compileOcSourceProgram(first);
    const b = compileOcSourceProgram({ ...first, valueIndex: 1 });
    expect(a.operations).toBe(b.operations);
    expect(a.condition).toBe(b.condition);
    expect(a.source.valueIndex).toBe(0);
    expect(b.source.valueIndex).toBe(1);
    expect(a.operations[0]).toMatchObject({
      cells: [[{ stages: 1 }], [{ stages: 2 }], [{ stages: 3 }], [{ stages: 4 }], [{ stages: 5 }]],
    });
  });
  it('binds NP cells after its receipt, without consuming the newly granted instance', () => {
    const program = compileOcSourceProgram({
      ...source(),
      origin: 'np',
      phase: 'preparationNoblePhantasm',
    });
    const result = executeOcAction(
      createOcState(),
      'np-action',
      [
        { kind: 'npUse', actor: 'attacker', gaugeBefore: 30000, baseOc: 3 },
        (state) =>
          bindOcSourceOperation(
            program,
            0,
            {
              facts: facts(),
              policy: { kind: 'calculator' },
              npActionId: 'np-action',
              procWitnesses: {},
            },
            state,
          ),
      ],
      {},
    );
    expect(result).toMatchObject({
      status: 'committed',
      state: {
        receipts: [{ effectiveOc: 3 }],
        boosts: [{ stages: 3, uses: { kind: 'finite', remaining: 1 } }],
      },
    });
  });
  it.each(['included', 'excluded'] as const)(
    'uses the shared %s self policy and retains physical state',
    (selfBuffs) => {
      for (const conditionalEffects of ['baseline', 'satisfied'] as const) {
        const program = compileOcSourceProgram(source(field));
        const step = bindOcSourceOperation(
          program,
          0,
          {
            facts: facts(),
            policy: { kind: 'ranking', selfBuffs, conditionalEffects, areaView: 'included' },
            npActionId: null,
            procWitnesses: {},
          },
          createOcState(),
        );
        expect(step).toMatchObject({
          kind: 'grant',
          included: selfBuffs === 'included' && conditionalEffects === 'satisfied',
        });
      }
    },
  );
});

describe('OC compilation ownership', () => {
  it('requires a receipt only on execution, without compiling OC twice', () => {
    const original = source();
    const dependency = compileEffectCached({ ...original, compilationPurpose: 'dependency' }, 0);
    expect(dependency.operations).toEqual([]);
    expect(dependency.projections).toEqual([]);
    const committed = compileEffectCached({ ...original, ocExecutionCommitted: true }, 0);
    expect(committed.operations).toEqual([]);
    expect(
      committed.projections.every((projection) => projection.executionSupport === 'supported'),
    ).toBe(true);
    const missing = compileEffectCached(original, 0);
    expect(
      missing.projections.some((projection) => projection.executionSupport === 'unsupported'),
    ).toBe(true);
  });
});

describe('OC support condition actor', () => {
  it('reads support intrinsic traits and HP without borrowing the attacker facts', () => {
    const support = source({
      kind: 'all',
      requirements: [
        {
          kind: 'trait',
          scope: 'recipient',
          trait: 'genderFemale',
          present: true,
          provenance: {
            stateSources: 'activeOnly',
            ignoredStateTraits: 'exclude',
            unremovableStateTraits: 'include',
          },
        },
        { kind: 'quantity', quantity: 'attackerHpPermille', comparison: 'atLeast', value: 1000 },
      ],
    });
    support.origin = 'support';
    support.sourceInstanceId = 'support:first';
    support.sourceTraits = ['genderFemale'];
    const program = compileOcSourceProgram(support);
    expect(program.conditionActor).toBe('source');
    const original = facts();
    original.quantities.attackerHpPermille = 100;
    const bound = preparationSourceConditionState(program, original);
    expect(evaluateOcSourceCondition(program, bound)).toBe(true);
    expect(original.traits.attacker.has('genderFemale')).toBe(false);
    expect(original.quantities.attackerHpPermille).toBe(100);
  });
});

describe('OC sensitivity of the execution family', () => {
  it('does not turn OC-dependent irrelevant proc cells into a numeric dependency', () => {
    const effect = source().effect;
    effect.proc = { kind: 'singleRoll', ratePermille: [[100], [200], [300], [400], [500]] };
    effect.execution = [{ kind: 'boundedPhaseIrrelevant', proof: 'postTerminalDamageOnly' }];
    expect(effectReadsOc(effect)).toBe(false);
    effect.execution = [boost];
    expect(effectReadsOc(effect)).toBe(true);
  });
});

describe('fixed-start OC resource dependencies', () => {
  it.each([
    'absent',
    'fixed',
    'hpAmount',
    'hpCondition',
    'inputHpCondition',
    'otherInputCondition',
  ] as const)('retains HP writers only for the %s OC dependency', (path) => {
    const writer = source().effect;
    writer.execution = [
      {
        kind: 'resourceMutation',
        resource: 'hp',
        direction: 'loss',
        lossFloor: 'oneIfAlive' as const,
        unit: 'fixed',
        recipient: 'sourceSelf',
        subjectId: null,
        amount: { kind: 'fixed', values: [[100], [], [], [], []] },
      },
    ];
    const grant = source().effect;
    const rate = source().effect;
    rate.execution = [
      {
        route,
        lifetime: boost.lifetime,
        stacking: boost.stacking,
        stateTraits: boost.stateTraits,
        kind: 'grantOcApplicationRate',
        role: 'casterGrant',
        sign: 1,
        selector: 'positive',
        cells: [
          [
            {
              applicationRatePermille: 1000,
              turns: { kind: 'unlimited' },
              uses: { kind: 'unlimited' },
              amount:
                path === 'hpAmount'
                  ? { kind: 'inverseHpLinear', basePermille: 0, bonusAtZeroHpPermille: 500 }
                  : { kind: 'fixed', value: 500 },
            },
          ],
          [],
          [],
          [],
          [],
        ],
      },
    ];
    if (path === 'hpCondition')
      grant.requirement = {
        recipient: 'sourceSelf',
        expression: {
          kind: 'quantity',
          quantity: 'attackerHpPermille',
          comparison: 'atLeast',
          value: 500,
        },
      };
    if (path === 'inputHpCondition' || path === 'otherInputCondition') {
      grant.inputDefinitions = [
        {
          key: 'fixture:hp',
          kind: path === 'inputHpCondition' ? 'sourceHpPermille' : 'currentTurn',
          owner: path === 'inputHpCondition' ? 'source' : 'field',
          label: 'quantity',
          description: 'quantity',
          minimum: path === 'inputHpCondition' ? 0 : 1,
          maximum: path === 'inputHpCondition' ? 1000 : 99,
          step: 1,
          defaultValue: path === 'inputHpCondition' ? 1000 : 1,
          defaultReason: 'fixture',
        },
      ];
      grant.requirement = {
        recipient: 'sourceSelf',
        expression: {
          kind: 'inputQuantity',
          inputKey: 'fixture:hp',
          comparison: 'atLeast',
          value: path === 'inputHpCondition' ? 500 : 1,
        },
      };
      masterEffectSchema.parse(grant);
    }
    const sources = [
      { kind: 'skill' as const, effects: [writer] },
      { kind: 'skill' as const, effects: [grant] },
    ];
    const context = {
      semantics: DEFAULT_NP_RESOURCE_SEMANTICS,
      initialGauge: 10000,
      npLevel: 1 as const,
      automaticEffects: path === 'absent' ? [] : [rate],
    };
    expect(ocRelevantSourceIndexes(sources, true, context).has(0)).toBe(
      path === 'hpAmount' || path === 'hpCondition' || path === 'inputHpCondition',
    );
    expect(ocRelevantSourceIndexes(sources, true, context).has(1)).toBe(true);
  });
  it('prunes a saturated charge and an OC-insensitive charge but retains reachability after a preparation NP', () => {
    const charge = source().effect;
    charge.execution = [
      {
        kind: 'resourceMutation',
        resource: 'npGauge',
        direction: 'gain',
        unit: 'fixed',
        recipient: 'sourceSelf',
        subjectId: null,
        amount: { kind: 'fixed', values: [[10000], [], [], [], []] },
      },
    ];
    const sources = [{ kind: 'skill' as const, effects: [charge], skillLevel: 1 }];
    const base = { semantics: DEFAULT_NP_RESOURCE_SEMANTICS, initialGauge: 10000 };
    expect([...ocRelevantSourceIndexes(sources, true, { ...base, npLevel: 1 })]).toEqual([]);
    expect([...ocRelevantSourceIndexes(sources, true, { ...base, npLevel: 2 })]).toEqual([0]);
    expect([...ocRelevantSourceIndexes(sources, false, { ...base, npLevel: 2 })]).toEqual([]);
    expect([
      ...ocRelevantSourceIndexes([{ kind: 'noblePhantasm', effects: [] }, ...sources], false, {
        ...base,
        npLevel: 1,
      }),
    ]).toEqual([1]);
  });
});

describe('unresolved rate grant read points', () => {
  it.each([
    'unused',
    'boost',
    'rate',
    'removed',
    'otherRecipient',
    'expired',
    'constantBoost',
  ] as const)('keeps the grant-time uncertainty through %s', (path) => {
    const pendingSource = source({ ...field, trait: 'unknown-field' });
    const rate: Extract<OcExecutionOperation, { kind: 'grantOcApplicationRate' }> = {
      route,
      lifetime: boost.lifetime,
      stacking: boost.stacking,
      stateTraits: boost.stateTraits,
      kind: 'grantOcApplicationRate',
      role: 'casterGrant',
      sign: -1,
      selector: 'positive',
      cells: [
        [
          {
            applicationRatePermille: 1000,
            amount: { kind: 'fixed', value: 200 },
            turns: { kind: 'unlimited' },
            uses: { kind: 'unlimited' },
          },
        ],
        [],
        [],
        [],
        [],
      ],
    };
    pendingSource.effect = masterEffectSchema.parse({ ...pendingSource.effect, execution: [rate] });
    if (path === 'expired') pendingSource.constantFormKey = 'initial';
    const program = compileOcSourceProgram(pendingSource);
    const before = createOcState();
    const initial = executeOcAction(
      before,
      'grant-rate',
      [
        ...(path === 'expired' ? [{ kind: 'activateForm' as const, formKey: 'initial' }] : []),
        (state) =>
          bindOcSourceOperation(
            program,
            0,
            { facts: facts(), policy: { kind: 'calculator' }, npActionId: null, procWitnesses: {} },
            state,
          ),
      ],
      {},
    );
    expect(initial.status).toBe('committed');
    expect(initial.state.uncertainRates).toHaveLength(1);
    const querySource = source();
    querySource.effect = masterEffectSchema.parse({
      ...querySource.effect,
      occurrenceId: 'query',
      execution: [
        path === 'rate'
          ? rate
          : path === 'constantBoost'
            ? { ...boost, lifetime: 'constant' }
            : boost,
      ],
    });
    if (path === 'otherRecipient') {
      querySource.origin = 'support';
      querySource.sourceInstanceId = 'support:other';
    }
    const query = compileOcSourceProgram(querySource);
    const steps = [
      ...(path === 'removed'
        ? [
            {
              kind: 'remove' as const,
              recipient: 'attacker',
              selector: ['positive' as const],
              applicationRate: 1000,
            },
          ]
        : []),
      ...(path === 'expired' ? [{ kind: 'activateForm' as const, formKey: 'next' }] : []),
      ...(path === 'unused'
        ? []
        : [
            (state: ReturnType<typeof createOcState>) =>
              bindOcSourceOperation(
                query,
                0,
                {
                  facts: facts(),
                  policy: { kind: 'calculator' },
                  npActionId: null,
                  procWitnesses: {},
                },
                state,
              ),
          ]),
    ];
    const result = executeOcAction(initial.state, 'query', steps, {});
    if (path === 'boost' || path === 'rate') {
      expect(result).toMatchObject({
        status: 'inputRequired',
        occurrenceId: pendingSource.effect.occurrenceId,
        requiredInput: { kind: 'worldTraitPresence' },
      });
      expect(result.state).toBe(initial.state);
      expect(result.outcomes).toEqual([]);
    } else expect(result.status).toBe('committed');
  });
});

it.each(['hp', 'criticalStars', 'battlePoint'] as const)(
  'preserves %s normal/LB/NP resource cells at ordinary compilation',
  (resource) => {
    const input = source();
    for (const lossFloor of ['zero', 'oneIfAlive'] as const) {
      input.effect = masterEffectSchema.parse({
        ...input.effect,
        execution: [
          {
            kind: 'resourceMutation',
            resource,
            direction: 'loss',
            unit: 'fixed',
            recipient: 'sourceSelf',
            subjectId: null,
            ...(resource === 'hp' ? { lossFloor } : {}),
            amount: {
              kind: 'fixed',
              values: [[11, 12], [21, 22], [], [], []],
              limitBreakValues: [[31, 32], [41, 42], [], [], []],
            },
          },
        ],
      });
      for (const limitBreak of [false, true]) {
        const compiled = compileEffectCached(
          { ...input, limitBreak, valueSetIndex: 1, valueIndex: 1 },
          0,
          [],
        );
        expect(compiled.operations).toHaveLength(1);
        expect(compiled.operations[0]).toMatchObject({
          kind: 'resourceMutation',
          resource,
          direction: 'loss',
          amount: limitBreak ? 42 : 22,
          resolution: 'resourceStateUnavailable',
          ...(resource === 'hp' ? { lossFloor } : {}),
        });
        if (resource === 'hp')
          expect(compileOcSourceProgram({ ...input, limitBreak }).operations).toEqual(
            input.effect.execution,
          );
        const missingLb = masterEffectSchema.parse({
          ...input.effect,
          execution: input.effect.execution.map((operation) =>
            operation.kind === 'resourceMutation' && operation.amount.kind !== 'dependent'
              ? { ...operation, amount: { kind: 'fixed', values: operation.amount.values } }
              : operation,
          ),
        });
        expect(
          compileEffectCached({ ...input, effect: missingLb, limitBreak: true }, 0, [])
            .operations[0],
        ).toMatchObject({
          kind: 'resourceMutation',
          amount: null,
          resolution: 'resourceStateUnavailable',
        });
      }
    }
  },
);

describe('population candidate OC equivalence', () => {
  const context = {
    semantics: DEFAULT_NP_RESOURCE_SEMANTICS,
    npLevel: 2 as const,
    initialGauge: 10000,
  };
  function countSource(coefficient: number): SourceEffect {
    const current = source();
    current.effect.execution = [
      {
        kind: 'resourceMutation',
        resource: 'npGauge',
        direction: 'gain',
        unit: 'fixed',
        recipient: 'sourceSelf',
        subjectId: null,
        amount: {
          kind: 'populationCount',
          selector: {
            scope: 'enemies',
            counting: 'actors',
            basis: 'actorTraits',
            traits: ['counted'],
            includePassive: true,
          },
          inputKey: 'count',
          values: [[coefficient], [], [], [], []],
        },
      },
    ];
    return current;
  }
  it('collapses only a proven terminal OC interval, including capacity saturation', () => {
    expect(populationGaugeHasOneTerminalOc([countSource(1000)], context)).toBe(true);
    expect(populationGaugeHasOneTerminalOc([countSource(5000)], context)).toBe(false);
    expect(populationGaugeHasOneTerminalOc([countSource(5000)], { ...context, npLevel: 1 })).toBe(
      true,
    );
    const fixed = source();
    fixed.effect.execution = [
      {
        kind: 'resourceMutation',
        resource: 'npGauge',
        direction: 'gain',
        unit: 'fixed',
        recipient: 'sourceSelf',
        subjectId: null,
        amount: { kind: 'fixed', values: [[10000], [], [], [], []] },
      },
    ];
    expect(populationGaugeHasOneTerminalOc([countSource(5000), fixed], context)).toBe(true);
    fixed.effect.proc = { kind: 'singleRoll', ratePermille: [[500], [], [], [], []] };
    expect(populationGaugeHasOneTerminalOc([countSource(5000), fixed], context)).toBe(false);
  });
  it('refuses disabled, other-source, loss, and unknown population writers', () => {
    const count = countSource(1000);
    expect(populationGaugeHasOneTerminalOc([{ ...count, sourceEnabled: false }], context)).toBe(
      false,
    );
    expect(populationGaugeHasOneTerminalOc([{ ...count, origin: 'support' }], context)).toBe(false);
    const loss = source();
    loss.effect.execution = [
      {
        kind: 'resourceMutation',
        resource: 'npGauge',
        direction: 'loss',
        unit: 'fixed',
        recipient: 'sourceSelf',
        subjectId: null,
        amount: { kind: 'fixed', values: [[10000], [], [], [], []] },
      },
    ];
    expect(populationGaugeHasOneTerminalOc([count, loss], context)).toBe(false);
    const writer = source();
    writer.effect.execution = [
      {
        kind: 'populationMutation',
        mutation: 'unsupported',
        scope: 'enemies',
        basis: 'actorTraits',
        traits: ['counted'],
        includePassive: false,
      },
    ];
    expect(populationGaugeHasOneTerminalOc([writer, count], context)).toBe(false);
  });
});
