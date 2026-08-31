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
  resourceTransition: MasterEffect['resourceTransition'],
  execution: MasterEffect['execution'] = [{ kind: 'nonDamage' }],
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
    resourceTransition,
    execution,
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
    const ordinary = effect('ordinary-stochastic', null, [{ kind: 'nonDamage' }], undefined, {
      proc: { kind: 'singleRoll', ratePermille: [[500], [], [], [], []] },
      selection: {
        kind: 'stochasticOutcome',
        group: { kind: 'binary', key: 'ordinary-proc', defaultOutcome: 'failure' },
      },
    });
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
