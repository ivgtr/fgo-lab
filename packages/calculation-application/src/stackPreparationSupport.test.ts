import { describe, expect, it } from 'vitest';
import {
  masterSnapshotSchema,
  masterEffectSchema,
  type MasterEffect,
  type StackSource,
  type StackInputDefinition,
} from '@fgo-lab/master-data';
import {
  createPreNoblePhantasmState,
  reducePreNoblePhantasmAction,
  servantStackInputs,
  ocRelevantSourceIndexes,
} from '@fgo-lab/battle-execution';
import {
  APP_VERSION,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  servantBuildRecordSchema,
} from '@fgo-lab/schema';
import { master, servant, source, stackEffectTemplate } from './stackQuantityFixture';
import { calculateScenario, createDefaultResolvedScenario } from './scenario';
import { calculateRankingPolicyDetail } from './rankingPolicyCalculation';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';
import {
  createCalculatorPortableRequest,
  currentCalculationVersionContext,
  executePortableCalculation,
  attemptPortableCalculationScenarioChange,
  attemptPortableCalculationVersionUpgrade,
  upgradePortableCalculationRequestVersion,
} from './portableCalculation';

function fixture(scope: StackSource['scope'], mutation: 'addTrait' | 'removeTrait') {
  const input: StackInputDefinition = {
    ...source,
    key: `stack:${scope}:fixture-stack`,
    owner: scope === 'field' ? 'field' : scope === 'targetState' ? 'target' : 'attacker',
    quantitySource: { scope, trait: 'fixture-stack' },
  };
  const effect = (id: string, execution: MasterEffect['execution']) => ({
    ...stackEffectTemplate,
    id,
    occurrenceId: `${id}:0`,
    gameActivation: 'skillUse',
    proc: { kind: 'guaranteed' },
    selection: null,
    inputDefinitions: [],
    requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
    execution,
  });
  const change = effect('change', [
    {
      kind: 'contextMutation',
      mutation,
      scope: scope === 'field' ? 'field' : 'recipientState',
      trait: 'fixture-stack',
      damageRelevant: true,
      route: {
        target: scope === 'targetState' ? 'enemy' : 'sourceSelf',
        contributionScope: 'personal',
        eligibility: { kind: 'anyRecipient', onMissing: 'ignore' },
      },
    },
  ]);
  const gain = {
    ...effect('gain', [
      {
        kind: 'resourceMutation',
        resource: 'npGauge',
        direction: 'gain',
        unit: 'fixed',
        recipient: 'sourceSelf',
        subjectId: null,
        amount: { kind: 'fixed', values: [Array.from({ length: 10 }, () => 5000), [], [], [], []] },
      },
    ]),
    inputDefinitions: [input],
    requirement: {
      recipient: 'sourceSelf',
      expression: { kind: 'inputQuantity', inputKey: input.key, comparison: 'atLeast', value: 1 },
    },
  };
  const skills = [change, gain].map((item, index) => ({
    id: `s${index}`,
    name: `s${index}`,
    slot: index + 1,
    detail: '',
    imageKey: '',
    effects: [item],
    resourceRequirement: null,
  }));
  const data = masterSnapshotSchema.parse({
    ...master,
    servants: [
      {
        ...servant,
        skills,
        actorFormGraph: {
          ...servant.actorFormGraph,
          forms: servant.actorFormGraph.forms.map((form) => ({
            ...form,
            skillIds: skills.map(({ id }) => id),
          })),
        },
      },
    ],
  });
  const scenario = createDefaultResolvedScenario(data, undefined, data.servants[0]);
  scenario.preNoblePhantasmPlan = [
    { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
    { kind: 'useSkillSlot', slot: 2, skillLevel: 1, choice: null },
    { kind: 'executeAttackNoblePhantasm' },
  ];
  return { data, scenario, input };
}
const versions = {
  schemaVersion: SCHEMA_VERSION,
  engineVersion: ENGINE_VERSION,
  appVersion: APP_VERSION,
  masterDataVersion: master.version,
  gameRegion: 'JP' as const,
  masterDataLocale: 'ja-JP' as const,
};

describe('live preparation stack reads', () => {
  it('counts buff instances separately from actor traits and commits count → NP → OC', () => {
    const { data } = fixture('attackerState', 'addTrait');
    const actor = data.servants[0]!;
    const grant = actor.skills[0]!.effects[0]!;
    const gain = actor.skills[1]!.effects[0]!;
    const definition = {
      kind: 'effectStackCount' as const,
      key: 'stack:attackerState:counted',
      owner: 'attacker' as const,
      quantitySource: { scope: 'attackerState' as const, trait: 'counted' },
      instanceTraits: ['counted', 'positive'],
      label: '状態数',
      description: '初期付与数',
      minimum: 0 as const,
      maximum: 6,
      step: 1 as const,
      defaultValue: 0,
      defaultReason: '外部付与なし',
    };
    grant.execution = [
      {
        kind: 'contextMutation',
        mutation: 'addTrait',
        scope: 'recipientState',
        trait: 'counted',
        damageRelevant: true,
        route: {
          target: 'sourceSelf',
          contributionScope: 'personal',
          eligibility: { kind: 'anyRecipient', onMissing: 'ignore' },
        },
      },
      {
        kind: 'buffInstanceMutation',
        mutation: 'grant',
        recipient: 'sourceSelf',
        lifetime: 'active',
        traits: ['counted', 'positive'],
      },
      {
        kind: 'buffInstanceMutation',
        mutation: 'grant',
        recipient: 'sourceSelf',
        lifetime: 'active',
        traits: ['counted', 'positive'],
      },
    ];
    gain.inputDefinitions = [definition];
    gain.requirement.expression = { kind: 'always' };
    gain.execution = [
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
          inputKey: definition.key,
          values: [Array.from({ length: 10 }, () => 2500), [], [], [], []],
        },
      },
    ];
    expect(masterEffectSchema.safeParse({ ...gain, inputDefinitions: [] }).success).toBe(false);
    expect(
      masterEffectSchema.safeParse({
        ...gain,
        requirement: {
          ...gain.requirement,
          expression: {
            kind: 'inputQuantity',
            inputKey: definition.key,
            comparison: 'equal',
            value: 1,
          },
        },
      }).success,
    ).toBe(true);
    // A generic identity selector can remove a counted instance even when its reader uses a different trait.
    const removal = {
      ...grant,
      execution: [
        {
          kind: 'buffInstanceMutation' as const,
          mutation: 'remove' as const,
          recipient: 'sourceSelf' as const,
          lifetime: 'active' as const,
          traits: ['positive'],
        },
      ],
    };
    expect(
      ocRelevantSourceIndexes(
        [
          { kind: 'skill', effects: [removal] },
          { kind: 'skill', effects: [gain] },
        ],
        true,
        { semantics: data.npResourceSemantics, npLevel: 2, initialGauge: 10_000 },
      ),
    ).toEqual(new Set([0, 1]));
    actor.skills[0]!.effects.push(gain);
    for (const initialCount of [0, 1, 6]) {
      const context = {
        resourceSemantics: data.npResourceSemantics,
        npLevel: 2 as const,
        overcharge: 1 as const,
        initialGauge: 15_000,
        canonicalInputValues: { [definition.key]: initialCount },
      };
      const initial = createPreNoblePhantasmState(
        actor,
        actor.actorFormGraph.defaultInitialFormId,
        context,
      );
      if (initial.status !== 'applied') throw new Error('initial');
      const result = reducePreNoblePhantasmAction(
        actor,
        initial.state,
        { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
        context,
      );
      if (result.status !== 'applied') throw new Error(result.code);
      expect(result.state.buffInstances.reduce((sum, instance) => sum + instance.count, 0)).toBe(
        initialCount + 2,
      );
      expect(result.state.stackCounts.attackerState[definition.quantitySource.trait]).toBe(
        initialCount + 2,
      );
      expect(result.state.npResource.gauge).toBe(20_000);
      expect(initial.state.buffInstances.reduce((sum, instance) => sum + instance.count, 0)).toBe(
        initialCount,
      );
      const attack = reducePreNoblePhantasmAction(
        actor,
        result.state,
        { kind: 'executeAttackNoblePhantasm' },
        context,
      );
      expect(attack).toMatchObject({ status: 'applied', state: { baseOvercharge: 2 } });
      expect(new Set(result.state.buffInstances.map(({ identity }) => identity)).size).toBe(
        result.state.buffInstances.length,
      );
    }
    const retryContext = {
      resourceSemantics: data.npResourceSemantics,
      npLevel: 2 as const,
      overcharge: 1 as const,
      initialGauge: 10_000,
      canonicalInputValues: { [definition.key]: 0 },
    };
    const retryInitial = createPreNoblePhantasmState(
      actor,
      actor.actorFormGraph.defaultInitialFormId,
      retryContext,
    );
    if (retryInitial.status !== 'applied') throw new Error('initial');
    const command = {
      kind: 'useSkillSlot' as const,
      slot: 1 as const,
      skillLevel: 1,
      choice: null,
    };
    const barrier = structuredClone(grant);
    barrier.id = 'barrier';
    barrier.occurrenceId = 'barrier:0';
    barrier.execution = [
      {
        kind: 'buffInstanceMutation',
        mutation: 'move',
        recipient: 'sourceSelf',
        lifetime: 'active',
        traits: ['positive'],
      },
    ];
    actor.skills[0]!.effects.push(barrier);
    const rejected = reducePreNoblePhantasmAction(actor, retryInitial.state, command, retryContext);
    expect(rejected.status).toBe('rejected');
    expect(rejected.state).toBe(retryInitial.state);
    expect(rejected.state.npResource.gauge).toBe(10_000);
    actor.skills[0]!.effects.pop();
    const retry = reducePreNoblePhantasmAction(actor, rejected.state, command, retryContext);
    expect(retry).toMatchObject({ status: 'applied', state: { npResource: { gauge: 15_000 } } });
    // Removing a common buff identity also removes the initial instances, but leaves actor traits intact.
    actor.skills[0]!.effects = [
      {
        ...grant,
        execution: [
          {
            kind: 'buffInstanceMutation',
            mutation: 'remove',
            recipient: 'sourceSelf',
            lifetime: 'active',
            traits: ['positive'],
          },
        ],
      },
      gain,
    ];
    const context = {
      resourceSemantics: data.npResourceSemantics,
      npLevel: 2 as const,
      overcharge: 1 as const,
      initialGauge: 15_000,
      canonicalInputValues: { [definition.key]: 2 },
    };
    const initial = createPreNoblePhantasmState(
      actor,
      actor.actorFormGraph.defaultInitialFormId,
      context,
    );
    if (initial.status !== 'applied') throw new Error('initial');
    const removed = reducePreNoblePhantasmAction(
      actor,
      initial.state,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      context,
    );
    expect(removed).toMatchObject({
      status: 'applied',
      state: { buffInstances: [], npResource: { gauge: 15_000 } },
    });
    const scenario = createDefaultResolvedScenario(data, undefined, actor);
    scenario.canonicalInputValues[definition.key] = { kind: 'integer', value: 2 };
    scenario.preNoblePhantasmPlan = [
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      { kind: 'executeAttackNoblePhantasm' },
    ];
    const calculator = calculateScenario(scenario, data, versions);
    expect(calculator.result.status).toBe('calculated');
    const portable = executePortableCalculation(
      createCalculatorPortableRequest(scenario, currentCalculationVersionContext(data)),
      data,
    );
    expect(portable.status).toBe('executed');
    if (portable.status !== 'executed') throw new Error('portable');
    expect(portable.execution.result).toEqual(calculator.result);
    for (const group of actor.noblePhantasmVariantGroups)
      for (const variant of group.variants)
        if (variant.kind === 'attack')
          for (const damage of variant.damage)
            damage.parametersByOvercharge.forEach((row, oc) =>
              row.forEach((cell) => {
                cell.valuePermille = 3000 + oc * 3000;
              }),
            );
    for (const npLevel of [1, 2, 5] as const)
      for (const selfBuffs of ['included', 'excluded'] as const)
        for (const conditionalEffects of ['baseline', 'satisfied'] as const) {
          const ranking = calculateRankingPolicyDetail(
            actor,
            data,
            { servantBuilds: {} },
            {
              ...DEFAULT_RANKING_POLICY_CONDITIONS,
              npLevelBasis: { kind: 'specified', npLevel },
              selfBuffs,
              conditionalEffects,
            },
            versions,
          );
          expect(ranking.status, JSON.stringify('reason' in ranking ? ranking.reason : null)).toBe(
            'calculated',
          );
          if (ranking.status !== 'calculated') throw new Error('ranking');
          const replay = calculateScenario(ranking.detail.scenario, data, versions);
          if (replay.result.status !== 'calculated') throw new Error('calculated parity');
          expect(replay.result.rows).toEqual(ranking.detail.result.rows);
          if (npLevel === 2) {
            const owned = calculateRankingPolicyDetail(
              actor,
              data,
              {
                servantBuilds: servantBuildRecordSchema.parse({
                  [actor.id]: {
                    servantId: actor.id,
                    level: 90,
                    ascension: 4,
                    npLevel: 2,
                    fouAtk: 1000,
                    skills: { '1': 10, '2': 10, '3': 10 },
                    appends: {},
                    updatedAt: '2026-09-12T00:00:00.000Z',
                  },
                }),
              },
              {
                ...DEFAULT_RANKING_POLICY_CONDITIONS,
                population: 'owned',
                npLevelBasis: { kind: 'owned' },
                selfBuffs,
                conditionalEffects,
              },
              versions,
            );
            if (owned.status !== 'calculated') throw new Error('owned');
            expect(owned.detail.result.rows).toEqual(ranking.detail.result.rows);
            const values = conditionalEffects === 'baseline' ? [0] : [0, 1, 2, 3, 4, 5, 6];
            const plans = selfBuffs === 'excluded' ? [[]] : [[], [1], [2], [1, 2], [2, 1]];
            const averages: number[] = [];
            for (const value of values)
              for (const slots of plans) {
                const candidate = structuredClone(ranking.detail.scenario);
                if (slots.length)
                  candidate.canonicalInputValues[definition.key] = { kind: 'integer', value };
                else
                  candidate.canonicalInputValues = Object.fromEntries(
                    Object.entries(candidate.canonicalInputValues).filter(
                      ([key]) => key !== definition.key,
                    ),
                  );
                candidate.preNoblePhantasmPlan = [
                  ...slots.map((slot) => ({
                    kind: 'useSkillSlot' as const,
                    slot: slot as 1 | 2,
                    skillLevel: 10,
                    choice: null,
                  })),
                  { kind: 'executeAttackNoblePhantasm' },
                ];
                const brute = calculateScenario(candidate, data, versions);
                if (brute.result.status === 'calculated')
                  averages.push(brute.result.rows[npLevel - 1]!.average);
              }
            expect(ranking.detail.result.rows[npLevel - 1]!.average).toBe(Math.max(...averages));
          }
        }
  });
  it('reads the recipient instance count for party support and excludes support sourceSelf', () => {
    const { data, scenario, input } = fixture('attackerState', 'addTrait');
    const actor = data.servants[0]!;
    const gain = actor.skills[1]!.effects[0]!;
    gain.inputDefinitions = [{ ...input, instanceTraits: ['fixture-stack'] }];
    gain.requirement.expression = { kind: 'always' };
    const mutation = gain.execution[0]!;
    if (mutation.kind !== 'resourceMutation' || mutation.resource !== 'npGauge')
      throw new Error('gain');
    mutation.amount = {
      kind: 'buffCount',
      trait: 'fixture-stack',
      inputKey: input.key,
      values: [Array.from({ length: 10 }, () => 5000), [], [], [], []],
    };
    scenario.attacker.npLevel = 2;
    scenario.preNoblePhantasmPlan = [{ kind: 'executeAttackNoblePhantasm' }];
    scenario.canonicalInputValues[input.key] = { kind: 'integer', value: 2 };
    scenario.support = {
      sourceTemplateId: null,
      composition: {
        effectInclusions: [],
        sources: [
          {
            sourceInstanceId: 'support-count',
            servantId: actor.id,
            skills: [{ skillId: actor.skills[1]!.id, skillLevel: 10, enabled: true }],
          },
        ],
      },
    };
    for (const [recipient, overcharge] of [
      ['sourceSelf', 1],
      ['partyMember', 2],
    ] as const) {
      mutation.recipient = recipient;
      const result = calculateScenario(scenario, structuredClone(data), versions);
      expect(result.result.status).toBe('calculated');
      if (result.status !== 'executable') throw new Error('executable support');
      expect(result.input.overcharge).toBe(overcharge);
      expect(result.effects.some((effect) => effect.outcome === 'unsupported')).toBe(false);
    }
  });

  it('uses a prior function write for nested count conditions and an OC grant in one command', () => {
    const { data, input } = fixture('attackerState', 'addTrait');
    const actor = data.servants[0]!;
    const gain = actor.skills[1]!.effects[0]!;
    gain.requirement.expression = {
      kind: 'all',
      requirements: [
        { kind: 'inputQuantity', inputKey: input.key, comparison: 'atLeast', value: 1 },
        {
          kind: 'not',
          requirement: {
            kind: 'inputQuantity',
            inputKey: input.key,
            comparison: 'equal',
            value: 0,
          },
        },
      ],
    };
    const boost = structuredClone(gain);
    boost.id = 'boost';
    boost.occurrenceId = 'boost:0';
    boost.execution = [
      {
        kind: 'grantOcBoost',
        route: {
          target: 'sourceSelf',
          contributionScope: 'personal',
          eligibility: { kind: 'anyRecipient', onMissing: 'ignore' },
        },
        lifetime: 'active',
        stacking: 'additive',
        stateTraits: ['positive'],
        cells: Array.from({ length: 5 }, () =>
          Array.from({ length: 10 }, () => ({
            stages: 1,
            applicationRatePermille: 1000,
            turns: { kind: 'unlimited' },
            uses: { kind: 'finite', remaining: 1 },
          })),
        ) as Extract<MasterEffect['execution'][number], { kind: 'grantOcBoost' }>['cells'],
      },
    ];
    actor.skills[0]!.effects.push(gain, boost);
    const context = {
      resourceSemantics: data.npResourceSemantics,
      npLevel: 2 as const,
      overcharge: 1 as const,
      initialGauge: 15_000,
      stackInputs: servantStackInputs(actor),
      canonicalInputValues: { [input.key]: 0 },
    };
    const initial = createPreNoblePhantasmState(
      actor,
      actor.actorFormGraph.defaultInitialFormId,
      context,
    );
    if (initial.status !== 'applied') throw new Error('initial');
    const used = reducePreNoblePhantasmAction(
      actor,
      initial.state,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      context,
    );
    if (used.status !== 'applied') throw new Error(used.code);
    expect(used.state.stackCounts.attackerState['fixture-stack']).toBe(1);
    expect(used.state.npResource.gauge).toBe(20_000);
    const attack = reducePreNoblePhantasmAction(
      actor,
      used.state,
      { kind: 'executeAttackNoblePhantasm' },
      context,
    );
    if (attack.status !== 'applied') throw new Error(attack.code);
    expect(attack.state.appliedActions.at(-1)?.ocUse).toMatchObject({ baseOc: 2, effectiveOc: 3 });
  });
  it.each(['attackerState', 'targetState', 'field'] as const)(
    'reads %s after grant/removal, with transactional NP and OC',
    (scope) => {
      for (const mutation of ['addTrait', 'removeTrait'] as const) {
        const { data, input } = fixture(scope, mutation);
        const actor = data.servants[0]!;
        for (const count of [0, 1, 4]) {
          const context = {
            resourceSemantics: data.npResourceSemantics,
            npLevel: 2 as const,
            initialGauge: 15_000,
            overcharge: 1 as const,
            stackInputs: servantStackInputs(actor),
            canonicalInputValues: { [input.key]: count },
          };
          const initial = createPreNoblePhantasmState(
            actor,
            actor.actorFormGraph.defaultInitialFormId,
            context,
          );
          if (initial.status !== 'applied') throw new Error('initial');
          const changed = reducePreNoblePhantasmAction(
            actor,
            initial.state,
            { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
            context,
          );
          if (changed.status !== 'applied') throw new Error('change');
          const gained = reducePreNoblePhantasmAction(
            actor,
            changed.state,
            { kind: 'useSkillSlot', slot: 2, skillLevel: 1, choice: null },
            context,
          );
          if (gained.status !== 'applied') throw new Error('gain');
          expect(gained.state.npResource.gauge).toBe(mutation === 'addTrait' ? 20_000 : 15_000);
          const attack = reducePreNoblePhantasmAction(
            actor,
            gained.state,
            { kind: 'executeAttackNoblePhantasm' },
            context,
          );
          if (attack.status !== 'applied') throw new Error('attack');
          expect(attack.state.baseOvercharge).toBe(mutation === 'addTrait' ? 2 : 1);
          expect(initial.state.npResource.gauge).toBe(15_000);
          expect(initial.state.stackCounts[scope]['fixture-stack']).toBe(count);
        }
      }
    },
  );

  it('rolls back a rejected sibling and retries from the previous committed count', () => {
    const { data, input } = fixture('attackerState', 'addTrait');
    const actor = data.servants[0]!;
    const invalid = structuredClone(actor.skills[1]!.effects[0]!);
    invalid.id = 'invalid';
    invalid.occurrenceId = 'invalid:0';
    invalid.requirement.expression = { kind: 'always' };
    invalid.execution = [
      {
        kind: 'resourceMutation',
        resource: 'npGauge',
        direction: 'gain',
        unit: 'fixed',
        recipient: 'sourceSelf',
        subjectId: null,
        amount: { kind: 'fixed', values: [[-1], [], [], [], []] },
      },
    ];
    actor.skills[1]!.effects.push(invalid);
    const context = {
      resourceSemantics: data.npResourceSemantics,
      npLevel: 2 as const,
      overcharge: 1 as const,
      initialGauge: 15_000,
      stackInputs: servantStackInputs(actor),
      canonicalInputValues: { [input.key]: 0 },
    };
    const initial = createPreNoblePhantasmState(
      actor,
      actor.actorFormGraph.defaultInitialFormId,
      context,
    );
    if (initial.status !== 'applied') throw new Error('initial');
    const changed = reducePreNoblePhantasmAction(
      actor,
      initial.state,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      context,
    );
    if (changed.status !== 'applied') throw new Error('change');
    const command = {
      kind: 'useSkillSlot' as const,
      slot: 2 as const,
      skillLevel: 1,
      choice: null,
    };
    const rejected = reducePreNoblePhantasmAction(actor, changed.state, command, context);
    expect(rejected).toMatchObject({ status: 'rejected', code: 'invalidResourceMutation' });
    expect(rejected.state).toBe(changed.state);
    expect(rejected.state.npResource.gauge).toBe(15_000);
    expect(rejected.state.stackCounts.attackerState['fixture-stack']).toBe(1);
    actor.skills[1]!.effects.pop();
    const retried = reducePreNoblePhantasmAction(actor, rejected.state, command, context);
    expect(retried).toMatchObject({ status: 'applied', state: { npResource: { gauge: 20_000 } } });
  });

  it('executes calculator/ranking and portable edits from the same initial stack intent', () => {
    const { data, scenario, input } = fixture('attackerState', 'addTrait');
    scenario.canonicalInputValues[input.key] = { kind: 'integer', value: 0 };
    const result = calculateScenario(scenario, data, versions);
    expect(result.result.status).toBe('calculated');
    const ranking = calculateRankingPolicyDetail(
      data.servants[0]!,
      data,
      { servantBuilds: {} },
      { ...DEFAULT_RANKING_POLICY_CONDITIONS, conditionalEffects: 'satisfied' },
      versions,
    );
    expect(ranking.status, JSON.stringify('reason' in ranking ? ranking.reason : null)).toBe(
      'calculated',
    );
    const request = createCalculatorPortableRequest(
      scenario,
      currentCalculationVersionContext(data),
    );
    const executed = executePortableCalculation(request, data);
    expect(executed.status).toBe('executed');
    if (executed.status !== 'executed') throw new Error('execution');
    const historicalRequest = upgradePortableCalculationRequestVersion(request, {
      ...currentCalculationVersionContext(data),
      engineVersion: '38.0.0',
    });
    const historicalResult = {
      ...executed.execution.result,
      versions: { ...executed.execution.result.versions, engineVersion: '38.0.0' },
    };
    expect(executePortableCalculation(historicalRequest, data)).toMatchObject({
      status: 'invalid',
      reason: 'runtimeVersionMismatch',
    });
    const upgraded = attemptPortableCalculationVersionUpgrade(
      historicalRequest,
      historicalResult,
      currentCalculationVersionContext(data),
      data,
    );
    expect(upgraded.status).toBe('committed');
    if (upgraded.status !== 'committed') throw new Error('upgrade');
    expect(upgraded.result).toEqual(executed.execution.result);
    const changedScenario = structuredClone(scenario);
    changedScenario.canonicalInputValues[input.key] = { kind: 'integer', value: 2 };
    const changed = attemptPortableCalculationScenarioChange(
      request,
      executed.execution.result,
      changedScenario,
      data,
    );
    expect(changed.status).toBe('committed');
    if (changed.status !== 'committed') throw new Error('change');
    expect(changed.result).toEqual(calculateScenario(changedScenario, data, versions).result);
    const invalid = attemptPortableCalculationScenarioChange(
      request,
      executed.execution.result,
      { ...scenario, initialOvercharge: 9 as 1 },
      data,
    );
    expect(invalid.status).toBe('rejected');
    if (invalid.status !== 'rejected') throw new Error('invalid');
    expect(invalid.retainedRequest).toEqual(request);
    expect(invalid.retainedResult).toEqual(executed.execution.result);
  });
  it('reads a transform NP count after consumption without mutating the prior state', () => {
    const { data, input } = fixture('field', 'addTrait');
    const actor = data.servants[0]!;
    const gain = actor.skills[1]!.effects[0]!;
    const transformed = masterSnapshotSchema.parse({
      ...data,
      servants: [
        {
          ...actor,
          noblePhantasmVariantGroups: actor.noblePhantasmVariantGroups.map((group) => ({
            ...group,
            variants: group.variants.map((variant) => ({
              ...variant,
              kind: 'nonAttack',
              effects: [{ ...gain, gameActivation: 'npBeforeDamage', timing: 'beforeDamage' }],
            })),
          })),
        },
      ],
    });
    const selected = transformed.servants[0]!;
    const base = selected.actorFormGraph.forms[0]!;
    const targetForm = { ...base.id, limitCount: 1 };
    const attackTemplate = actor.noblePhantasmVariantGroups[0]!.variants[0]!;
    const attack = {
      ...attackTemplate,
      canonicalId: 'a'.repeat(64),
      ref: { ...attackTemplate.ref, actorFormId: targetForm },
    };
    const transformNp = selected.noblePhantasmVariantGroups[0]!.variants[0]!;
    const route = {
      target: 'sourceSelf' as const,
      contributionScope: 'personal' as const,
      eligibility: { kind: 'anyRecipient' as const, onMissing: 'ignore' as const },
    };
    const operations: MasterEffect['execution'] = [
      { kind: 'transformActorForm', route, targetFormId: targetForm },
      { kind: 'selectNoblePhantasmVariant', route, variant: attack.ref },
    ];
    transformNp.effects.push({
      ...transformNp.effects[0]!,
      id: 'transform',
      occurrenceId: 'transform:0',
      inputDefinitions: [],
      requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
      execution: operations,
    });
    const charge = transformNp.effects[0]!.execution[0]!;
    if (charge.kind !== 'resourceMutation' || charge.amount.kind !== 'fixed')
      throw new Error('charge');
    charge.amount.values[0] = Array.from({ length: 10 }, () => 10_000);
    selected.noblePhantasmVariantGroups[0]!.variants.push(attack);
    selected.actorFormGraph.forms.push({
      ...base,
      id: targetForm,
      baseNoblePhantasmVariant: attack.ref,
    });
    selected.actorFormGraph.transitions.push({
      id: 'count-transform',
      from: base.id,
      to: targetForm,
      direction: 'forward',
      activation: {
        sourceKind: 'noblePhantasm',
        sourceId: transformNp.ref.noblePhantasmId,
        effectOccurrenceIds: ['transform:0'],
      },
      operations,
    });
    expect(masterSnapshotSchema.safeParse(transformed).success).toBe(true);

    for (const count of [0, 1]) {
      const context = {
        resourceSemantics: data.npResourceSemantics,
        npLevel: 1 as const,
        overcharge: 1 as const,
        initialGauge: 10_000,
        stackInputs: servantStackInputs(selected),
        canonicalInputValues: { [input.key]: count },
      };
      const initial = createPreNoblePhantasmState(
        selected,
        selected.actorFormGraph.defaultInitialFormId,
        context,
      );
      if (initial.status !== 'applied') throw new Error('initial');
      const result = reducePreNoblePhantasmAction(
        selected,
        initial.state,
        { kind: 'useTransformNoblePhantasm' },
        context,
      );
      expect(result).toMatchObject({
        status: 'applied',
        state: { transformNoblePhantasmUsed: true, npResource: { gauge: count * 10_000 } },
      });
      expect(initial.state.npResource.gauge).toBe(10_000);
      if (result.status !== 'applied') throw new Error(result.code);
      if (count === 1) {
        expect(
          reducePreNoblePhantasmAction(
            selected,
            result.state,
            { kind: 'executeAttackNoblePhantasm' },
            context,
          ).status,
        ).toBe('applied');
        const scenario = createDefaultResolvedScenario(transformed, undefined, selected);
        scenario.canonicalInputValues[input.key] = { kind: 'integer', value: 1 };
        scenario.preNoblePhantasmPlan = [
          { kind: 'useTransformNoblePhantasm' },
          { kind: 'executeAttackNoblePhantasm' },
        ];
        expect(calculateScenario(scenario, transformed, versions).result.status).toBe('calculated');
      }
    }
  });
});
