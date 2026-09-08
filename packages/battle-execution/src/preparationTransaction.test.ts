import type {
  CanonicalNpResourceSemantics,
  MasterEffect,
  MasterSkill,
  ServantMaster,
} from '@fgo-lab/master-data';
import { describe, expect, it } from 'vitest';
import {
  createPreNoblePhantasmState,
  reducePreNoblePhantasmAction,
  type PreparationExecutionContext,
} from './preNoblePhantasm';
import { planPreparationResourceTransaction } from './preparationTransaction';

const semantics: CanonicalNpResourceSemantics = {
  unit: 'basisPoints',
  capacityByNpLevel: [10_000, 20_000, 20_000, 20_000, 30_000],
  noblePhantasmUse: {
    requirement: 10_000,
    consumption: 'all',
    baseOvercharge: { gaugePerStage: 10_000, minimumStage: 1, maximumBaseStage: 3 },
  },
};
const context: PreparationExecutionContext = {
  resourceSemantics: semantics,
  npLevel: 2,
  initialGauge: 10_000,
  overcharge: 1,
};
const baseForm = { actorId: 'actor', limitCount: 0 };
const changedForm = { actorId: 'actor', limitCount: 1 };
const route = {
  target: 'sourceSelf' as const,
  contributionScope: 'personal' as const,
  eligibility: { kind: 'anyRecipient' as const, onMissing: 'ignore' as const },
};
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

function effect(
  occurrenceId: string,
  transitionFixture:
    | {
        kind: 'fixed';
        recipient: 'sourceActor';
        direction: 'gain' | 'loss';
        amounts: [number[], number[], number[], number[], number[]];
        overflow: 'clampToCapacity';
        underflow: 'clampToZero';
      }
    | { kind: 'unsupported'; recipient: 'sourceActor'; family: string }
    | null,
  execution: MasterEffect['execution'] = [
    { kind: 'boundedPhaseIrrelevant', proof: 'noBattleStateChange' },
  ],
  requirement: MasterEffect['requirement']['expression'] = { kind: 'always' },
  activation: Partial<
    Pick<MasterEffect, 'proc' | 'selection' | 'interaction' | 'inputDefinitions'>
  > = {},
): MasterEffect {
  return {
    id: occurrenceId,
    occurrenceId,
    label: occurrenceId,
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
    execution: [
      ...(transitionFixture === null
        ? []
        : transitionFixture.kind === 'fixed'
          ? [
              {
                kind: 'resourceMutation' as const,
                resource: 'npGauge' as const,
                direction: transitionFixture.direction,
                unit: 'fixed' as const,
                recipient: 'sourceSelf' as const,
                amount: { kind: 'fixed' as const, values: transitionFixture.amounts },
                subjectId: null,
              },
            ]
          : [
              {
                kind: 'unsupported' as const,
                route,
                reason: 'dependentResourceAmount' as const,
                damageRelevant: true,
              },
            ]),
      ...execution,
    ],
    atlasEvidence,
    ...activation,
  };
}

const baseAttack = {
  kind: 'attack' as const,
  canonicalId: 'base-attack',
  ref: { actorFormId: baseForm, noblePhantasmId: 'base-attack' },
  name: 'base attack',
  priority: 1,
  effects: [],
  card: 'buster' as const,
  targetScope: 'single' as const,
  damage: [],
};
const changedAttack = {
  ...baseAttack,
  canonicalId: 'changed-attack',
  ref: { actorFormId: changedForm, noblePhantasmId: 'changed-attack' },
  name: 'changed attack',
};

function servantWithSkill(effects: readonly MasterEffect[]): ServantMaster {
  const skill: MasterSkill = {
    id: 'skill',
    slot: 1,
    priority: 1,
    name: 'skill',
    detail: 'skill',
    imageKey: null,
    resourceRequirement: null,
    effects: [...effects],
  };
  return {
    id: 'servant',
    name: 'servant',
    classId: 'saber',
    attribute: 'earth',
    rarity: 5,
    atkByLevel: {},
    actorFormGraph: {
      actorId: 'actor',
      forms: [
        {
          id: baseForm,
          name: 'base',
          traits: ['base-trait'],
          skillIds: ['skill'],
          passiveIds: [],
          baseNoblePhantasmVariant: baseAttack.ref,
        },
        {
          id: changedForm,
          name: 'changed',
          traits: ['changed-trait'],
          skillIds: [],
          passiveIds: [],
          baseNoblePhantasmVariant: changedAttack.ref,
        },
      ],
      initialFormIds: [baseForm],
      defaultInitialFormId: baseForm,
      transitions: [
        {
          id: 'transition',
          from: baseForm,
          to: changedForm,
          direction: 'forward',
          activation: {
            sourceKind: 'skill',
            sourceId: 'skill',
            effectOccurrenceIds: ['transition-effect'],
          },
          operations: [
            { kind: 'transformActorForm', route, targetFormId: changedForm },
            {
              kind: 'selectNoblePhantasmVariant',
              route,
              variant: changedAttack.ref,
            },
          ],
        },
      ],
    },
    baseNoblePhantasmGroupId: 'np-group',
    noblePhantasmVariantGroups: [
      { id: 'np-group', baseVariant: baseAttack.ref, variants: [baseAttack, changedAttack] },
    ],
    traits: ['base-trait'],
    predicates: [],
    imageKey: null,
    skills: [skill],
    passives: [],
    growth: [],
  };
}

describe('transactional preparation execution', () => {
  it('does not commit a structural mutation when its canonical condition is false', () => {
    const conditional = effect(
      'transition-effect',
      null,
      [
        { kind: 'transformActorForm', route, targetFormId: changedForm },
        { kind: 'selectNoblePhantasmVariant', route, variant: changedAttack.ref },
      ],
      { kind: 'operationTrigger', position: 7 },
    );
    const servant = servantWithSkill([conditional]);
    const created = createPreNoblePhantasmState(servant, baseForm, context);
    if (created.status !== 'applied') throw new Error(created.code);

    const result = reducePreNoblePhantasmAction(
      servant,
      created.state,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      context,
    );

    expect(result).toMatchObject({
      status: 'applied',
      state: { currentFormId: baseForm, selectedNoblePhantasmVariant: baseAttack.ref },
    });
  });

  it('rejects an ambiguous structural condition without committing its action', () => {
    const conditional = effect(
      'transition-effect',
      null,
      [
        { kind: 'transformActorForm', route, targetFormId: changedForm },
        { kind: 'selectNoblePhantasmVariant', route, variant: changedAttack.ref },
      ],
      {
        kind: 'sourceQuantity',
        quantity: 'battlePointRate',
        subjectId: 'actor',
        comparison: 'atLeast',
        value: 1,
      },
    );
    const servant = servantWithSkill([conditional]);
    const created = createPreNoblePhantasmState(servant, baseForm, context);
    if (created.status !== 'applied') throw new Error(created.code);

    const result = reducePreNoblePhantasmAction(
      servant,
      created.state,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      context,
    );

    expect(result).toEqual({
      status: 'rejected',
      code: 'ambiguousPreparationCondition',
      requiredInput: null,
      requiredInputEffectOccurrenceId: null,
      state: created.state,
    });
  });

  it('separates repairable input from ambiguity and re-applies after correction', () => {
    const conditional = effect(
      'transition-effect',
      null,
      [
        { kind: 'transformActorForm', route, targetFormId: changedForm },
        { kind: 'selectNoblePhantasmVariant', route, variant: changedAttack.ref },
      ],
      {
        kind: 'inputQuantity',
        inputKey: 'battle:value',
        comparison: 'atLeast',
        value: 1,
      },
      {
        inputDefinitions: [
          {
            key: 'battle:value',
            kind: 'procSuccessCount',
            owner: 'attacker',
            label: '準備値',
            description: '準備効果の発動に必要な値',
            minimum: 0,
            maximum: 1,
            step: 1,
            defaultValue: null,
            defaultReason: '明示入力が必要',
          },
        ],
      },
    );
    const servant = servantWithSkill([conditional]);
    const created = createPreNoblePhantasmState(servant, baseForm, context);
    if (created.status !== 'applied') throw new Error(created.code);
    const command = {
      kind: 'useSkillSlot' as const,
      slot: 1 as const,
      skillLevel: 1,
      choice: null,
    };

    const missing = reducePreNoblePhantasmAction(servant, created.state, command, context);
    expect(missing).toMatchObject({
      status: 'rejected',
      code: 'preparationInputRequired',
      requiredInputEffectOccurrenceId: 'transition-effect',
      state: created.state,
    });
    expect(missing.status === 'rejected' ? missing.requiredInput?.key : null).toBe('battle:value');
    const repaired = reducePreNoblePhantasmAction(servant, created.state, command, {
      ...context,
      canonicalInputValues: { 'battle:value': 1 },
    });
    expect(repaired).toMatchObject({
      status: 'applied',
      state: { currentFormId: changedForm, selectedNoblePhantasmVariant: changedAttack.ref },
    });
  });

  it.each([
    ['below minimum', -2, 'rejected'],
    ['valid', 2, 'applied'],
    ['above maximum', 6, 'rejected'],
    ['step violation', 1, 'rejected'],
  ] as const)(
    'validates preparation input %s before structural mutation',
    (_name, value, status) => {
      const conditional = effect(
        'transition-effect',
        null,
        [
          { kind: 'transformActorForm', route, targetFormId: changedForm },
          { kind: 'selectNoblePhantasmVariant', route, variant: changedAttack.ref },
        ],
        {
          kind: 'inputQuantity',
          inputKey: 'battle:value',
          comparison: 'atLeast',
          value: 2,
        },
        {
          inputDefinitions: [
            {
              key: 'battle:value',
              kind: 'procSuccessCount',
              owner: 'attacker',
              label: '準備値',
              description: '準備遷移の入力値',
              minimum: 0,
              maximum: 4,
              step: 2,
              defaultValue: null,
              defaultReason: '明示入力が必要',
            },
          ],
        },
      );
      const servant = servantWithSkill([conditional]);
      const created = createPreNoblePhantasmState(servant, baseForm, context);
      if (created.status !== 'applied') throw new Error(created.code);
      const result = reducePreNoblePhantasmAction(
        servant,
        created.state,
        { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
        { ...context, canonicalInputValues: { 'battle:value': value } },
      );

      expect(result.status).toBe(status);
      if (status === 'rejected') {
        expect(result).toMatchObject({
          code: 'preparationInputRequired',
          state: created.state,
        });
        expect(result.state.appliedActions).toEqual([]);
        expect(result.state.currentFormId).toEqual(baseForm);
      } else expect(result.state.currentFormId).toEqual(changedForm);
    },
  );

  it('keeps proc success distinct when a preparation condition is false', () => {
    const conditional = effect(
      'guaranteed-condition-false',
      {
        kind: 'fixed',
        recipient: 'sourceActor',
        direction: 'gain',
        amounts: [[2_000], [], [], [], []],
        overflow: 'clampToCapacity',
        underflow: 'clampToZero',
      },
      undefined,
      {
        kind: 'quantity',
        quantity: 'attackerHpPermille',
        comparison: 'atLeast',
        value: 500,
      },
    );
    const servant = servantWithSkill([conditional]);
    const created = createPreNoblePhantasmState(servant, baseForm, context);
    if (created.status !== 'applied') throw new Error(created.code);
    const result = reducePreNoblePhantasmAction(
      servant,
      created.state,
      {
        kind: 'useSkillSlot',
        slot: 1,
        skillLevel: 1,
        choice: null,
      },
      { ...context, attackerHpPermille: 100 },
    );

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error(result.code);
    expect(result.state.npResource.gauge).toBe(10_000);
    expect(result.state.appliedActions[0]?.selectedEffects[0]).toMatchObject({
      occurrenceId: 'guaranteed-condition-false',
      stochasticOutcome: 'success',
    });
    expect(result.state.activeEffects[0]).toMatchObject({
      occurrenceId: 'guaranteed-condition-false',
      stochasticOutcome: 'success',
    });
  });

  it('rolls back resource, trait, form, and variant when a later resource member is unsupported', () => {
    const structural = effect(
      'transition-effect',
      {
        kind: 'fixed',
        recipient: 'sourceActor',
        direction: 'gain',
        amounts: [[5_000], [], [], [], []],
        overflow: 'clampToCapacity',
        underflow: 'clampToZero',
      },
      [
        { kind: 'transformActorForm', route, targetFormId: changedForm },
        { kind: 'selectNoblePhantasmVariant', route, variant: changedAttack.ref },
        {
          kind: 'contextMutation',
          mutation: 'addTrait',
          scope: 'recipientState',
          route,
          trait: 'prepared-trait',
          damageRelevant: true,
        },
      ],
    );
    const unsupported = effect('unsupported-effect', {
      kind: 'unsupported',
      recipient: 'sourceActor',
      family: 'dependentTargetResult',
    });
    const servant = servantWithSkill([structural, unsupported]);
    const created = createPreNoblePhantasmState(servant, baseForm, context);
    if (created.status !== 'applied') throw new Error(created.code);

    const result = reducePreNoblePhantasmAction(
      servant,
      created.state,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      context,
    );

    expect(result).toEqual({
      status: 'rejected',
      code: 'unsupportedResourceMutation',
      requiredInput: null,
      requiredInputEffectOccurrenceId: null,
      state: created.state,
    });
    expect(result.state).toMatchObject({
      currentFormId: baseForm,
      selectedNoblePhantasmVariant: baseAttack.ref,
      npResource: { gauge: 10_000 },
      appliedActions: [],
    });
    expect(result.state.stateTraits.attackerState.has('prepared-trait')).toBe(false);
  });

  it('keeps the post-skill state intact when attack NP lacks gauge', () => {
    const loss = effect('loss', {
      kind: 'fixed',
      recipient: 'sourceActor',
      direction: 'loss',
      amounts: [[5_000], [], [], [], []],
      overflow: 'clampToCapacity',
      underflow: 'clampToZero',
    });
    const servant = servantWithSkill([loss]);
    const created = createPreNoblePhantasmState(servant, baseForm, context);
    if (created.status !== 'applied') throw new Error(created.code);
    const skill = reducePreNoblePhantasmAction(
      servant,
      created.state,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      context,
    );
    if (skill.status !== 'applied') throw new Error(skill.code);

    const attack = reducePreNoblePhantasmAction(
      servant,
      skill.state,
      { kind: 'executeAttackNoblePhantasm' },
      context,
    );

    expect(attack).toEqual({
      status: 'rejected',
      code: 'insufficientNpGauge',
      requiredInput: null,
      requiredInputEffectOccurrenceId: null,
      state: skill.state,
    });
    expect(attack.state).toMatchObject({ npResource: { gauge: 5_000 }, terminated: false });
    expect(attack.state.appliedActions).toHaveLength(1);
  });

  it('applies only the selected choice resource branch', () => {
    const servant = servantWithSkill([]);
    const created = createPreNoblePhantasmState(servant, baseForm, context);
    if (created.status !== 'applied') throw new Error(created.code);
    const selected = effect(
      'selected',
      {
        kind: 'fixed',
        recipient: 'sourceActor',
        direction: 'gain',
        amounts: [[2_000], [], [], [], []],
        overflow: 'clampToCapacity',
        underflow: 'clampToZero',
      },
      undefined,
      { kind: 'choice', family: 'mode', candidate: 'selected' },
    );
    const other = effect(
      'other',
      {
        kind: 'fixed',
        recipient: 'sourceActor',
        direction: 'loss',
        amounts: [[9_000], [], [], [], []],
        overflow: 'clampToCapacity',
        underflow: 'clampToZero',
      },
      undefined,
      { kind: 'choice', family: 'mode', candidate: 'other' },
    );
    const result = planPreparationResourceTransaction({
      context,
      servant,
      state: created.state,
      command: {
        kind: 'useSkillSlot',
        slot: 1,
        skillLevel: 1,
        choice: { groupKey: 'mode', candidateKey: 'selected' },
      },
      skill: null,
      effects: [selected, other],
      valueSetIndex: 0,
      valueIndex: 0,
      consumeNoblePhantasm: false,
      inputSource: {
        origin: 'attacker',
        sourceInstanceId: `attacker:${servant.id}`,
        skillId: 'skill',
      },
    });

    expect(result).toMatchObject({ status: 'ready', resource: { state: { gauge: 12_000 } } });
  });

  it.each([
    ['success', 1, 12_000, null],
    ['failure', 0, 10_000, null],
    ['inputRequired', undefined, null, 'preparationInputRequired'],
  ] as const)(
    'uses the shared stochastic activation result for %s',
    (_name, successes, expectedGauge, expectedCode) => {
      const servant = servantWithSkill([]);
      const created = createPreNoblePhantasmState(servant, baseForm, context);
      if (created.status !== 'applied') throw new Error(created.code);
      const stochastic = effect(
        'stochastic-resource',
        {
          kind: 'fixed',
          recipient: 'sourceActor',
          direction: 'gain',
          amounts: [[2_000], [], [], [], []],
          overflow: 'clampToCapacity',
          underflow: 'clampToZero',
        },
        undefined,
        undefined,
        {
          proc: {
            kind: 'chainedRolls',
            ratePermille: [[800], [], [], [], []],
            seriesKey: 'proc:preparation',
            index: 0,
            maximumSuccesses: 1,
          },
          selection: {
            kind: 'stochasticOutcome',
            group: {
              kind: 'successCount',
              key: 'proc:preparation',
              maximumSuccesses: 1,
              defaultOutcome: 'minimum',
            },
          },
          interaction: { kind: 'procSeries', key: 'proc:preparation' },
          inputDefinitions: [
            {
              key: 'proc:preparation',
              kind: 'procSuccessCount',
              owner: 'attacker',
              label: '成功回数',
              description: '準備効果の成功回数',
              minimum: 0,
              maximum: 1,
              step: 1,
              defaultValue: successes === undefined ? null : 0,
              defaultReason:
                successes === undefined ? '明示入力が必要' : 'スキル確率効果の既定成功回数',
            },
          ],
        },
      );
      const result = planPreparationResourceTransaction({
        context: {
          ...context,
          canonicalInputValues: successes === undefined ? {} : { 'proc:preparation': successes },
        },
        servant,
        state: created.state,
        command: { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
        skill: null,
        effects: [stochastic],
        valueSetIndex: 0,
        valueIndex: 0,
        consumeNoblePhantasm: false,
        inputSource: {
          origin: 'attacker',
          sourceInstanceId: `attacker:${servant.id}`,
          skillId: 'skill',
        },
      });

      if (expectedCode) expect(result).toMatchObject({ status: 'rejected', code: expectedCode });
      else
        expect(result).toMatchObject({
          status: 'ready',
          resource: { state: { gauge: expectedGauge } },
        });
    },
  );

  it('pre-resolves only the preparation-changing stochastic effect in a mixed skill', () => {
    const preparation = effect(
      'stochastic-resource',
      {
        kind: 'fixed',
        recipient: 'sourceActor',
        direction: 'gain',
        amounts: [[2_000], [], [], [], []],
        overflow: 'clampToCapacity',
        underflow: 'clampToZero',
      },
      undefined,
      undefined,
      {
        proc: { kind: 'singleRoll', ratePermille: [[800], [], [], [], []] },
        selection: {
          kind: 'stochasticOutcome',
          group: { kind: 'binary', key: 'prep-proc', defaultOutcome: 'success' },
        },
      },
    );
    const ordinary = effect(
      'ordinary-stochastic',
      null,
      [{ kind: 'boundedPhaseIrrelevant', proof: 'noBattleStateChange' }],
      undefined,
      {
        proc: { kind: 'singleRoll', ratePermille: [[500], [], [], [], []] },
        selection: {
          kind: 'stochasticOutcome',
          group: { kind: 'binary', key: 'ordinary-proc', defaultOutcome: 'failure' },
        },
      },
    );
    const servant = servantWithSkill([preparation, ordinary]);
    const created = createPreNoblePhantasmState(servant, baseForm, context);
    if (created.status !== 'applied') throw new Error(created.code);
    const result = reducePreNoblePhantasmAction(
      servant,
      created.state,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      context,
    );

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error(result.code);
    expect(result.state.appliedActions[0]?.selectedEffects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          occurrenceId: 'stochastic-resource',
          stochasticOutcome: 'success',
        }),
        expect.objectContaining({ occurrenceId: 'ordinary-stochastic', stochasticOutcome: null }),
      ]),
    );
  });

  it('rejects an invalid stochastic activation before mutating preparation state', () => {
    const servant = servantWithSkill([]);
    const created = createPreNoblePhantasmState(servant, baseForm, context);
    if (created.status !== 'applied') throw new Error(created.code);
    const invalid = effect('invalid-stochastic', {
      kind: 'fixed',
      recipient: 'sourceActor',
      direction: 'gain',
      amounts: [[2_000], [], [], [], []],
      overflow: 'clampToCapacity',
      underflow: 'clampToZero',
    });
    const result = planPreparationResourceTransaction({
      context,
      servant,
      state: created.state,
      command: { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      skill: null,
      effects: [
        { ...invalid, proc: { kind: 'singleRoll', ratePermille: [[800], [], [], [], []] } },
      ],
      valueSetIndex: 0,
      valueIndex: 0,
      consumeNoblePhantasm: false,
      inputSource: {
        origin: 'attacker',
        sourceInstanceId: `attacker:${servant.id}`,
        skillId: 'skill',
      },
    });

    expect(result).toEqual({
      status: 'rejected',
      code: 'invalidPreparationActivation',
      requiredInput: null,
      requiredInputEffectOccurrenceId: null,
    });
    expect(created.state.npResource.gauge).toBe(10_000);
  });

  it('derives base OC and commits attack consumption exactly once', () => {
    const servant = servantWithSkill([]);
    const highGaugeContext = { ...context, initialGauge: 20_000 };
    const created = createPreNoblePhantasmState(servant, baseForm, highGaugeContext);
    if (created.status !== 'applied') throw new Error(created.code);
    const result = reducePreNoblePhantasmAction(
      servant,
      created.state,
      { kind: 'executeAttackNoblePhantasm' },
      highGaugeContext,
    );

    expect(result).toMatchObject({
      status: 'applied',
      state: { npResource: { gauge: 0 }, baseOvercharge: 2, terminated: true },
    });
    if (result.status !== 'applied') throw new Error(result.code);
    expect(result.state.appliedActions.at(-1)).toMatchObject({
      resourceBefore: { gauge: 20_000 },
      resourceAfter: { gauge: 0 },
      baseOvercharge: 2,
    });
  });

  it('restores commands, then re-applies from a fresh canonical resource state', () => {
    const gain = effect('gain', {
      kind: 'fixed',
      recipient: 'sourceActor',
      direction: 'gain',
      amounts: [[2_000], [], [], [], []],
      overflow: 'clampToCapacity',
      underflow: 'clampToZero',
    });
    const servant = servantWithSkill([gain]);
    const commands = [
      { kind: 'useSkillSlot' as const, slot: 1 as const, skillLevel: 1, choice: null },
      { kind: 'executeAttackNoblePhantasm' as const },
    ];
    const replay = () => {
      const created = createPreNoblePhantasmState(servant, baseForm, context);
      if (created.status !== 'applied') throw new Error(created.code);
      return commands.reduce((state, command) => {
        const result = reducePreNoblePhantasmAction(servant, state, command, context);
        if (result.status !== 'applied') throw new Error(result.code);
        return result.state;
      }, created.state);
    };

    const first = replay();
    const restored = JSON.parse(JSON.stringify(commands)) as typeof commands;
    expect(restored).toEqual(commands);
    const second = replay();
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.npResource).toEqual({ npLevel: 2, capacity: 20_000, gauge: 0 });
  });
});

describe('OC on the preparation command path', () => {
  function ocEffect(id: string, lifetime: 'constant' | 'active' = 'active'): MasterEffect {
    return effect(id, null, [
      {
        kind: 'grantOcBoost',
        route,
        lifetime,
        stacking: 'additive',
        stateTraits: ['positive'],
        cells: [1, 2, 3, 4, 5].map(() =>
          Array.from({ length: 5 }, () => ({
            stages: 2,
            applicationRatePermille: 1000,
            turns: { kind: 'unlimited' },
            uses: { kind: 'finite', remaining: 1 },
          })),
        ) as Extract<MasterEffect['execution'][number], { kind: 'grantOcBoost' }>['cells'],
      },
    ]);
  }
  it.each(['unused', 'read', 'shortCircuit', 'reset'] as const)(
    'tracks an uncertain target write until its OC reader: %s',
    (path) => {
      const writer = effect(
        'uncertain-write',
        null,
        [
          {
            kind: 'contextMutation',
            mutation: 'addTrait',
            scope: 'recipientState',
            route: { ...route, target: 'enemy' },
            trait: 'uncertain',
            damageRelevant: true,
          },
        ],
        {
          kind: 'sourceQuantity',
          quantity: 'battlePointRate',
          subjectId: 'actor',
          comparison: 'atLeast',
          value: 1,
        },
      );
      const reader = ocEffect('reader');
      const dependency = {
        kind: 'trait',
        scope: 'opponentState',
        trait: 'uncertain',
        present: false,
        provenance: {
          stateSources: 'activeOnly',
          ignoredStateTraits: 'exclude',
          unremovableStateTraits: 'include',
        },
      } as const;
      reader.requirement = {
        recipient: 'sourceSelf',
        expression:
          path === 'shortCircuit'
            ? { kind: 'any', requirements: [{ kind: 'always' }, dependency] }
            : dependency,
      };
      const reset = effect('certain-removal', null, [
        {
          kind: 'contextMutation',
          mutation: 'removeTrait',
          scope: 'recipientState',
          route: { ...route, target: 'enemy' },
          trait: 'uncertain',
          damageRelevant: true,
        },
      ]);
      const servant = servantWithSkill(
        path === 'unused'
          ? [writer]
          : path === 'reset'
            ? [writer, reset, reader]
            : [writer, reader],
      );
      const facts = {
        ...context,
        worldFacts: [
          {
            decisionKey: 'initial',
            fact: {
              kind: 'trait' as const,
              scope: 'targetState' as const,
              trait: 'uncertain',
              present: false,
            },
          },
        ],
      };
      const initial = createPreNoblePhantasmState(servant, baseForm, facts);
      if (initial.status !== 'applied') throw new Error(initial.code);
      const result = reducePreNoblePhantasmAction(
        servant,
        initial.state,
        { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
        facts,
      );
      expect(result.status).toBe(path === 'read' ? 'rejected' : 'applied');
      if (path === 'read')
        expect(result).toMatchObject({ code: 'unsupportedOcExecution', state: initial.state });
      if (result.status === 'applied' && (path === 'shortCircuit' || path === 'reset'))
        expect(result.state.ocState.boosts).toHaveLength(1);
      if (result.status === 'applied' && path === 'reset')
        expect(result.state.uncertainContextWrites).toEqual([]);
    },
  );
  it.each(['absent', 'live', 'terminal', 'false'] as const)(
    'defers a possible removal resistance until a live removal reader: %s',
    (path) => {
      const resistance = effect(
        'resistance',
        null,
        [
          {
            kind: 'ocRemovalResistance',
            route,
            cells: [
              [
                {
                  amount: { kind: 'fixed', value: 1000 },
                  applicationRatePermille: 1000,
                  turns: { kind: 'unlimited' },
                  uses: { kind: 'unlimited' },
                },
              ],
              [],
              [],
              [],
              [],
            ],
          },
        ],
        path === 'false'
          ? { kind: 'not', requirement: { kind: 'always' } }
          : {
              kind: 'trait',
              scope: 'field',
              trait: 'unknown',
              present: true,
              provenance: {
                stateSources: 'activeOnly',
                ignoredStateTraits: 'exclude',
                unremovableStateTraits: 'include',
              },
            },
      );
      const removal = effect('remove', null, [
        {
          kind: 'removeOcState',
          route,
          selector: ['positive'],
          applicationRates: [
            [1000, 1000],
            [1000, 1000],
            [1000, 1000],
            [1000, 1000],
            [1000, 1000],
          ],
        },
      ]);
      const servant = servantWithSkill([
        resistance,
        ocEffect('boost'),
        ...(path === 'live' || path === 'false' ? [removal] : []),
      ]);
      if (path === 'terminal')
        servant.noblePhantasmVariantGroups = servant.noblePhantasmVariantGroups.map((group) => ({
          ...group,
          variants: group.variants.map((variant) => ({
            ...variant,
            effects: [{ ...removal, timing: 'beforeDamage' as const }],
          })),
        }));
      const initial = createPreNoblePhantasmState(servant, baseForm, context);
      if (initial.status !== 'applied') throw new Error(initial.code);
      const used = reducePreNoblePhantasmAction(
        servant,
        initial.state,
        { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
        context,
      );
      expect(used.status).toBe(path === 'live' ? 'rejected' : 'applied');
      if (path === 'live') expect(used.state).toBe(initial.state);
      if (used.status !== 'applied') return;
      const terminal = reducePreNoblePhantasmAction(
        servant,
        used.state,
        { kind: 'executeAttackNoblePhantasm' },
        context,
      );
      expect(terminal.status).toBe('applied');
      if (terminal.status === 'applied')
        expect(terminal.state.appliedActions.at(-1)?.ocUse?.effectiveOc).toBe(
          path === 'false' ? 1 : 3,
        );
    },
  );
  it('retains a repaired OC proc input and rolls back the unresolved attempt', () => {
    const probabilistic = ocEffect('probabilistic');
    const grant = probabilistic.execution[0];
    if (grant?.kind !== 'grantOcBoost') throw new Error('boost fixture required');
    grant.cells[0][0]!.applicationRatePermille = 500;
    const servant = servantWithSkill([probabilistic]);
    const initial = createPreNoblePhantasmState(servant, baseForm, context);
    if (initial.status !== 'applied') throw new Error(initial.code);
    const command = { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null } as const;
    const missing = reducePreNoblePhantasmAction(servant, initial.state, command, context);
    expect(missing).toMatchObject({
      status: 'rejected',
      code: 'preparationInputRequired',
      state: initial.state,
    });
    if (missing.status !== 'rejected' || !missing.requiredInput) throw new Error('input required');
    const repairedContext = {
      ...context,
      canonicalInputValues: { [missing.requiredInput.key]: 1 },
    };
    const repaired = reducePreNoblePhantasmAction(servant, initial.state, command, repairedContext);
    expect(repaired.status).toBe('applied');
    if (repaired.status !== 'applied') return;
    expect(repaired.state.ocInputDefinitions).toEqual([missing.requiredInput]);
    expect(repaired.state.ocState.boosts).toHaveLength(1);
    expect(initial.state.ocState.boosts).toHaveLength(0);
    const failedProc = reducePreNoblePhantasmAction(servant, initial.state, command, {
      ...context,
      canonicalInputValues: { [missing.requiredInput.key]: 0 },
    });
    expect(failedProc.status === 'applied' && failedProc.state.ocState.boosts.length).toBe(0);
  });
  it.each(['absent', 'between', 'after', 'removed', 'otherSource'] as const)(
    'reads HP-dependent rate at use through commands: %s',
    (position) => {
      const rate = ocEffect('rate');
      const original = rate.execution[0];
      if (original?.kind !== 'grantOcBoost') throw new Error('boost fixture required');
      const rateBase = {
        route: original.route,
        lifetime: original.lifetime,
        stacking: original.stacking,
        stateTraits: original.stateTraits,
      };
      rate.execution = [
        {
          ...rateBase,
          kind: 'grantOcApplicationRate',
          role: 'casterGrant',
          sign: 1,
          selector: 'positive',
          cells: original.cells.map((row) =>
            row.map(({ stages: _stages, ...cell }) => ({
              ...cell,
              amount: { kind: 'inverseHpLinear', basePermille: 0, bonusAtZeroHpPermille: 400 },
            })),
          ) as Extract<
            MasterEffect['execution'][number],
            { kind: 'grantOcApplicationRate' }
          >['cells'],
        },
      ];
      const hp = effect('hp', null, [
        {
          kind: 'resourceMutation',
          resource: 'hp',
          direction: 'loss',
          unit: 'fixed',
          recipient: position === 'otherSource' ? 'enemy' : 'sourceSelf',
          subjectId: null,
          amount: { kind: 'fixed', values: [[100], [], [], [], []] },
        },
      ]);
      const removal = effect('remove', null, [
        {
          kind: 'removeOcState',
          route,
          selector: ['positive'],
          applicationRates: [[1000], [], [], [], []],
        },
      ]);
      const effects =
        position === 'absent'
          ? [rate, ocEffect('boost')]
          : position === 'after'
            ? [rate, ocEffect('boost'), hp]
            : position === 'removed'
              ? [rate, hp, removal, ocEffect('boost')]
              : [rate, hp, ocEffect('boost')];
      const servant = servantWithSkill(effects);
      const hpContext = { ...context, attackerHpPermille: 500 };
      const initial = createPreNoblePhantasmState(servant, baseForm, hpContext);
      if (initial.status !== 'applied') throw new Error(initial.code);
      const result = reducePreNoblePhantasmAction(
        servant,
        initial.state,
        { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
        hpContext,
      );
      expect(result.status).toBe(position === 'between' ? 'rejected' : 'applied');
      if (result.status === 'rejected')
        expect(result).toMatchObject({ code: 'unsupportedOcExecution', state: initial.state });
      else expect(result.state.ocState.boosts).toHaveLength(1);
    },
  );
  it('freezes NP OC, consumes the skill grant once, and leaves the NP-body grant unused', () => {
    const servant = servantWithSkill([ocEffect('skill-oc')]);
    servant.noblePhantasmVariantGroups[0]!.variants[0] = {
      ...baseAttack,
      effects: [{ ...ocEffect('np-oc'), timing: 'beforeDamage', gameActivation: 'npBeforeDamage' }],
    };
    const initial = createPreNoblePhantasmState(servant, baseForm, context);
    if (initial.status !== 'applied') throw new Error(initial.code);
    const skill = reducePreNoblePhantasmAction(
      servant,
      initial.state,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      context,
    );
    if (skill.status !== 'applied') throw new Error(skill.code);
    const np = reducePreNoblePhantasmAction(
      servant,
      skill.state,
      { kind: 'executeAttackNoblePhantasm' },
      context,
    );
    expect(np.status).toBe('applied');
    if (np.status !== 'applied') return;
    expect(np.state.appliedActions.at(-1)?.ocUse).toMatchObject({
      baseOc: 1,
      effectiveOc: 3,
      boostTotal: 2,
    });
    expect(np.state.ocState.boosts.map((instance) => instance.uses)).toEqual([
      { kind: 'finite', remaining: 0 },
      { kind: 'finite', remaining: 1 },
    ]);
    expect(np.state.npResource.gauge).toBe(0);
    expect(
      reducePreNoblePhantasmAction(
        servant,
        np.state,
        { kind: 'executeAttackNoblePhantasm' },
        context,
      ),
    ).toMatchObject({ status: 'rejected', state: np.state });
  });
  it('rolls back OC state for an unsupported non-resource sibling in the same command', () => {
    const servant = servantWithSkill([
      ocEffect('oc'),
      effect('invalid-sibling', null, [
        { kind: 'unsupported', route, reason: 'operationSemantics', damageRelevant: true },
      ]),
    ]);
    const initial = createPreNoblePhantasmState(servant, baseForm, context);
    if (initial.status !== 'applied') throw new Error(initial.code);
    const result = reducePreNoblePhantasmAction(
      servant,
      initial.state,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      context,
    );
    expect(result).toMatchObject({ status: 'rejected', code: 'unsupportedOcExecution' });
    expect(result.state).toBe(initial.state);
    expect(result.state.ocState.boosts).toEqual([]);
    expect(result.state.appliedActions).toEqual([]);
  });
  it('rolls back an OC grant with a later unsupported gauge mutation and permits retry', () => {
    const servant = servantWithSkill([
      ocEffect('oc'),
      effect('bad', { kind: 'unsupported', recipient: 'sourceActor', family: 'unknown' }),
    ]);
    const initial = createPreNoblePhantasmState(servant, baseForm, context);
    if (initial.status !== 'applied') throw new Error(initial.code);
    const command = {
      kind: 'useSkillSlot' as const,
      slot: 1 as const,
      skillLevel: 1,
      choice: null,
    };
    const rejected = reducePreNoblePhantasmAction(servant, initial.state, command, context);
    expect(rejected).toMatchObject({ status: 'rejected', state: initial.state });
    expect(initial.state.ocState.boosts).toHaveLength(0);
    const repaired = servantWithSkill([ocEffect('oc')]);
    const retried = reducePreNoblePhantasmAction(repaired, initial.state, command, context);
    expect(retried.status === 'applied' && retried.state.ocState.boosts.length).toBe(1);
  });
  it('applies CE at initialization and support only before terminal NP, with atomic failure', async () => {
    const { preparationEffectSource } = await import('./preparationOc');
    const servant = servantWithSkill([]);
    const placeholder = createPreNoblePhantasmState(servant, baseForm, context);
    if (placeholder.status !== 'applied') throw new Error(placeholder.code);
    const ce = preparationEffectSource({
      servant,
      state: placeholder.state,
      effect: ocEffect('ce', 'constant'),
      origin: 'craftEssence',
      sourceInstanceId: 'ce',
      skillId: 'ce',
      skillName: 'Craft essence',
      valueSetIndex: 0,
      valueIndex: 0,
    });
    const support = {
      ...preparationEffectSource({
        servant,
        state: placeholder.state,
        effect: ocEffect('support'),
        origin: 'support',
        sourceInstanceId: 'support',
        skillId: 'support',
        skillName: 'Support skill',
        valueSetIndex: 0,
        valueIndex: 0,
      }),
    };
    support.effect = {
      ...support.effect,
      execution: support.effect.execution.map((operation) =>
        operation.kind === 'grantOcBoost'
          ? { ...operation, route: { ...route, target: 'partyMember' } }
          : operation,
      ),
    };
    const phases = { ...context, initialSources: [ce], terminalSources: [support] };
    const initial = createPreNoblePhantasmState(servant, baseForm, phases);
    if (initial.status !== 'applied') throw new Error(initial.code);
    expect(initial.state.ocState.boosts).toHaveLength(1);
    const failedState = { ...initial.state, npResource: { ...initial.state.npResource, gauge: 0 } };
    expect(
      reducePreNoblePhantasmAction(
        servant,
        failedState,
        { kind: 'executeAttackNoblePhantasm' },
        phases,
      ),
    ).toMatchObject({ status: 'rejected', state: failedState });
    expect(failedState.ocState.boosts).toHaveLength(1);
    const np = reducePreNoblePhantasmAction(
      servant,
      initial.state,
      { kind: 'executeAttackNoblePhantasm' },
      phases,
    );
    expect(np.status === 'applied' && np.state.appliedActions.at(-1)?.ocUse?.effectiveOc).toBe(5);
  });
  it('applies an external NP charge before freezing OC and rolls it back with the NP action', async () => {
    const { preparationEffectSource } = await import('./preparationOc');
    const servant = servantWithSkill([]);
    const initial = createPreNoblePhantasmState(servant, baseForm, context);
    if (initial.status !== 'applied') throw new Error(initial.code);
    const charge = effect('external-charge', null, [
      {
        kind: 'resourceMutation',
        resource: 'npGauge',
        direction: 'gain',
        unit: 'fixed',
        recipient: 'partyOther',
        subjectId: null,
        amount: { kind: 'fixed', values: [[10000], [], [], [], []] },
      },
    ]);
    const source = preparationEffectSource({
      servant,
      state: initial.state,
      effect: charge,
      origin: 'support',
      sourceInstanceId: 'support',
      skillId: 'support-skill',
      skillName: 'Support skill',
      valueSetIndex: 0,
      valueIndex: 0,
    });
    const result = reducePreNoblePhantasmAction(
      servant,
      initial.state,
      { kind: 'executeAttackNoblePhantasm' },
      { ...context, terminalSources: [source] },
    );
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;
    expect(result.state.appliedActions.at(-1)?.ocUse).toMatchObject({
      gaugeBefore: 20000,
      baseOc: 2,
      effectiveOc: 2,
    });
    expect(result.state.npResource.gauge).toBe(0);
    const invalid = { ...initial.state, selectedNoblePhantasmVariant: null };
    const rejected = reducePreNoblePhantasmAction(
      servant,
      invalid,
      { kind: 'executeAttackNoblePhantasm' },
      { ...context, terminalSources: [source] },
    );
    expect(rejected).toMatchObject({ status: 'rejected', state: invalid });
    expect(invalid.npResource.gauge).toBe(10000);
  });
  it('does not apply the terminal form passive retroactively', () => {
    const servant = servantWithSkill([
      effect('transition-effect', null, [
        { kind: 'transformActorForm', route, targetFormId: changedForm },
        { kind: 'selectNoblePhantasmVariant', route, variant: changedAttack.ref },
      ]),
    ]);
    servant.passives = [
      { ...servant.skills[0]!, id: 'passive', effects: [ocEffect('form-oc', 'constant')] },
    ];
    servant.actorFormGraph.forms[1]!.passiveIds = ['passive'];
    const initial = createPreNoblePhantasmState(servant, baseForm, context);
    if (initial.status !== 'applied') throw new Error(initial.code);
    expect(initial.state.ocState.boosts).toHaveLength(0);
    const changed = reducePreNoblePhantasmAction(
      servant,
      initial.state,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      context,
    );
    expect(changed.status === 'applied' && changed.state.ocState.boosts.length).toBe(1);
  });
});

it('keeps an unread uncertain trait write without rejecting the preparation command', () => {
  const writer = effect(
    'uncertain-trait',
    null,
    [
      {
        kind: 'contextMutation',
        mutation: 'addTrait',
        scope: 'recipientState',
        route,
        trait: 'prepared-trait',
        damageRelevant: true,
      },
    ],
    {
      kind: 'sourceQuantity',
      quantity: 'battlePointRate',
      subjectId: 'actor',
      comparison: 'atLeast',
      value: 1,
    },
  );
  const servant = servantWithSkill([writer]);
  const created = createPreNoblePhantasmState(servant, baseForm, context);
  if (created.status !== 'applied') throw new Error(created.code);
  const result = reducePreNoblePhantasmAction(
    servant,
    created.state,
    { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
    context,
  );
  expect(result.status).toBe('applied');
  if (result.status !== 'applied') throw new Error(result.code);
  expect(result.state.uncertainContextWrites).toHaveLength(1);
  expect(result.state.stateTraits).not.toContain('prepared-trait');
  expect(created.state.uncertainContextWrites).toHaveLength(0);
});
