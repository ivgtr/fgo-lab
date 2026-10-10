import { liveTraitQuantityRead } from '@fgo-lab/battle-execution';
import {
  projectBattleTraitPresence,
  readTraitPresence,
  readTraitQuantity,
} from '@fgo-lab/battle-execution';
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
import { calculateRankingPolicyDetail } from './rankingProfileCalculation';
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
  return { data, input };
}

function scenarioFor(data: ReturnType<typeof fixture>['data']) {
  const scenario = createDefaultResolvedScenario(data, undefined, data.servants[0]);
  scenario.preNoblePhantasmPlan = [
    { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
    { kind: 'useSkillSlot', slot: 2, skillLevel: 1, choice: null },
    { kind: 'executeAttackNoblePhantasm' },
  ];
  return scenario;
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
  it('uses the native modifier value before a later stack write in calculator execution', () => {
    const { data, input } = fixture('attackerState', 'addTrait');
    const actor = data.servants[0]!;
    const change = actor.skills[0]!.effects[0]!;
    change.inputDefinitions = [input];
    const modifier: MasterEffect['execution'][number] = {
      kind: 'damageModifier',
      route: {
        target: 'sourceSelf',
        contributionScope: 'personal',
        eligibility: { kind: 'anyRecipient', onMissing: 'ignore' },
      },
      semanticSupport: 'supported',
      modifier: 'attackBuff',
      sign: 1,
      card: null,
      values: [Array.from({ length: 10 }, () => 100), [], [], [], []],
      valueExpressions: [
        Array.from({ length: 10 }, () => ({
          kind: 'stackLinear' as const,
          sources: [input],
          basePermille: 100,
          perUnitPermille: 100,
          maximumUnits: 4,
          maximumValuePermille: null,
        })),
        [],
        [],
        [],
        [],
      ],
    };
    const mutation = change.execution[0]!;
    const value = () => {
      const current = masterSnapshotSchema.parse(data);
      const execution = calculateScenario(scenarioFor(current), current, versions);
      expect(execution.result.status).toBe('calculated');
      return execution.effectiveContributions.contributions.find(
        (contribution) =>
          contribution.modifier === 'attackBuff' &&
          contribution.source.effectOccurrenceId === change.occurrenceId,
      )?.resolvedValue;
    };
    change.execution = [modifier, mutation];
    expect(value()).toBe(100);
    change.execution = [mutation, modifier];
    expect(value()).toBe(200);
  });
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
        stochasticSelection: { kind: 'declared' as const },
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
      expect(
        liveTraitQuantityRead(result.state, {
          scope: 'attackerState',
          trait: definition.quantitySource.trait,
        }).value,
      ).toBe(initialCount + 2);
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
      stochasticSelection: { kind: 'declared' as const },
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
      stochasticSelection: { kind: 'declared' as const },
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
    expect(removed).toMatchObject({ status: 'applied', state: { npResource: { gauge: 15_000 } } });
    if (removed.status !== 'applied') throw new Error(removed.code);
    expect(removed.state.buffInstances.filter((instance) => instance.count > 0)).toEqual([]);
    expect(
      liveTraitQuantityRead(removed.state, { scope: 'attackerState', trait: 'counted' }).value,
    ).toBe(0);
    expect(readTraitQuantity(removed.state.traitFactLayers, 'attackerState', 'counted').value).toBe(
      2,
    );
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
    const { data, input } = fixture('attackerState', 'addTrait');
    const scenario = scenarioFor(data);
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
      stochasticSelection: { kind: 'declared' as const },
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
    expect(
      liveTraitQuantityRead(used.state, { scope: 'attackerState', trait: 'fixture-stack' }).value,
    ).toBe(1);
    const operationClock = readTraitPresence(
      used.state.traitFactLayers,
      'attackerState',
      'fixture-stack',
    ).support[0]?.clock;
    expect(operationClock?.phase).toBe('operation');
    expect(typeof operationClock?.operationId).toBe('string');
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
            stochasticSelection: { kind: 'declared' as const },
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
          expect(
            liveTraitQuantityRead(initial.state, { scope, trait: 'fixture-stack' }).value,
          ).toBe(count);
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
      stochasticSelection: { kind: 'declared' as const },
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
    expect(
      liveTraitQuantityRead(rejected.state, { scope: 'attackerState', trait: 'fixture-stack' })
        .value,
    ).toBe(1);
    actor.skills[1]!.effects.pop();
    const retried = reducePreNoblePhantasmAction(actor, rejected.state, command, context);
    expect(retried).toMatchObject({ status: 'applied', state: { npResource: { gauge: 20_000 } } });
  });

  it('executes calculator/ranking and portable edits from the same initial stack intent', () => {
    const { data, input } = fixture('attackerState', 'addTrait');
    const scenario = scenarioFor(data);
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
        stochasticSelection: { kind: 'declared' as const },
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

describe('population count through shared preparation transaction', () => {
  function populationFixture() {
    const data = structuredClone(fixture('targetState', 'addTrait').data);
    const actor = data.servants[0]!;
    const selector = {
      scope: 'allActors' as const,
      counting: 'actors' as const,
      basis: 'actorTraits' as const,
      traits: ['fixture-stack'],
      includePassive: true,
    };
    const inputKey = 'population:fixture';
    const definitions = [
      ...(['allies', 'enemies'] as const).map((side) => ({
        kind: 'populationSize' as const,
        side,
        key: `population:${side}:additional`,
        owner: 'field' as const,
        label: side,
        description: side,
        minimum: 0,
        maximum: 2,
        step: 1,
        defaultValue: 0,
        defaultReason: 'none',
      })),
      {
        kind: 'populationCount' as const,
        selector,
        key: inputKey,
        owner: 'field' as const,
        label: 'matches',
        description: 'initial external matches',
        minimum: 0,
        maximum: 4,
        step: 1,
        defaultValue: 0,
        defaultReason: 'none',
      },
    ];
    actor.skills[0]!.effects[0]!.execution = [
      {
        kind: 'populationMutation',
        mutation: 'grant',
        basis: 'actorTraits',
        scope: 'otherActors',
        traits: ['fixture-stack'],
        includePassive: false,
      },
    ];
    actor.skills[1]!.effects[0]!.requirement = {
      recipient: 'sourceSelf',
      expression: { kind: 'always' },
    };
    actor.skills[1]!.effects[0]!.inputDefinitions = definitions;
    actor.skills[1]!.effects[0]!.execution = [
      {
        kind: 'resourceMutation',
        resource: 'npGauge',
        direction: 'gain',
        recipient: 'sourceSelf',
        unit: 'fixed',
        subjectId: null,
        amount: { kind: 'populationCount', selector, inputKey, values: [[5000], [], [], [], []] },
      },
    ];
    masterSnapshotSchema.parse(data);
    const context = {
      stochasticSelection: { kind: 'declared' as const },
      resourceSemantics: data.npResourceSemantics,
      npLevel: 5 as const,
      overcharge: 1 as const,
      initialGauge: 10000,
      canonicalInputValues: {
        'population:allies:additional': 1,
        'population:enemies:additional': 1,
        [inputKey]: 0,
      },
      worldFacts: [
        {
          decisionKey: 'attacker-state-absence',
          fact: {
            kind: 'trait' as const,
            scope: 'attackerState' as const,
            trait: 'fixture-stack',
            present: false,
          },
        },
      ],
    };
    const initial = createPreNoblePhantasmState(
      actor,
      actor.actorFormGraph.defaultInitialFormId,
      context,
    );
    if (initial.status !== 'applied') throw new Error(initial.code);
    return { data, actor, context, initial: initial.state, inputKey };
  }
  it('commits a field-wide grant, reads live matching actors, and consumes the resulting NP/OC', () => {
    const { actor, context, initial } = populationFixture();
    const grant = reducePreNoblePhantasmAction(
      actor,
      initial,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      context,
    );
    if (grant.status !== 'applied') throw new Error(grant.code);
    expect(grant.state.populationEvents).toHaveLength(1);
    const presence = readTraitPresence(grant.state.traitFactLayers, 'targetState', 'fixture-stack');
    expect(presence.value).toBe(true);
    expect(presence.support).toHaveLength(1);
    expect(presence.support[0]?.kind).toBe('guaranteedWrite');
    expect(presence.support[0]?.clock.phase).toBe('operation');
    expect(typeof presence.support[0]?.clock.operationId).toBe('string');
    expect(presence.support[0]?.clock.occurrenceId).toBe(actor.skills[0]!.effects[0]!.occurrenceId);
    expect(
      readTraitQuantity(grant.state.traitFactLayers, 'targetState', 'fixture-stack').value,
    ).toBeNull();
    expect(grant.committedSources).toHaveLength(1);
    const gain = reducePreNoblePhantasmAction(
      actor,
      grant.state,
      { kind: 'useSkillSlot', slot: 2, skillLevel: 1, choice: null },
      context,
    );
    if (gain.status !== 'applied') throw new Error(gain.code);
    expect(gain.state.npResource.gauge).toBe(25000);
    const attack = reducePreNoblePhantasmAction(
      actor,
      gain.state,
      { kind: 'executeAttackNoblePhantasm' },
      context,
    );
    if (attack.status !== 'applied') throw new Error(attack.code);
    expect(attack.state.baseOvercharge).toBe(2);
    expect(attack.state.npResource.gauge).toBe(0);
    expect(initial.populationEvents).toHaveLength(0);
  });
  it('establishes exact one only when the initial target absence is declared', () => {
    const fixture = populationFixture();
    const context = {
      ...fixture.context,
      worldFacts: [
        {
          decisionKey: 'absence-control',
          fact: {
            kind: 'trait' as const,
            scope: 'targetState' as const,
            trait: 'fixture-stack',
            present: false,
          },
        },
      ],
    };
    const initial = createPreNoblePhantasmState(
      fixture.actor,
      fixture.actor.actorFormGraph.defaultInitialFormId,
      context,
    );
    if (initial.status !== 'applied') throw new Error(initial.code);
    const grant = reducePreNoblePhantasmAction(
      fixture.actor,
      initial.state,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      context,
    );
    if (grant.status !== 'applied') throw new Error(grant.code);
    const quantity = readTraitQuantity(grant.state.traitFactLayers, 'targetState', 'fixture-stack');
    expect(quantity.value).toBe(1);
    expect(quantity.support.map((proof) => proof.kind)).toEqual([
      'externalAssumption',
      'guaranteedWrite',
    ]);
    expect(quantity.support.at(-1)?.clock.phase).toBe('operation');
    expect(
      readTraitQuantity(initial.state.traitFactLayers, 'targetState', 'fixture-stack').value,
    ).toBe(0);
  });
  it('returns a repairable inconsistent population and preserves the prior command on retry', () => {
    const { actor, context, initial, inputKey } = populationFixture();
    const readable = {
      ...context,
      worldFacts: [
        ...context.worldFacts,
        {
          decisionKey: 'target-absence',
          fact: {
            kind: 'trait' as const,
            scope: 'target' as const,
            trait: 'fixture-stack',
            present: false,
          },
        },
        {
          decisionKey: 'target-state-absence',
          fact: {
            kind: 'trait' as const,
            scope: 'targetState' as const,
            trait: 'fixture-stack',
            present: false,
          },
        },
      ],
    };
    const command = {
      kind: 'useSkillSlot' as const,
      slot: 2 as const,
      skillLevel: 1,
      choice: null,
    };
    const bad = {
      ...readable,
      canonicalInputValues: { ...readable.canonicalInputValues, [inputKey]: 3 },
    };
    const failed = reducePreNoblePhantasmAction(actor, initial, command, bad);
    expect(failed).toMatchObject({
      status: 'rejected',
      code: 'preparationInputRequired',
      requiredInput: { key: inputKey },
    });
    if (failed.status !== 'rejected') throw new Error('rejection');
    expect(failed.state).toBe(initial);
    const retry = reducePreNoblePhantasmAction(actor, failed.state, command, readable);
    expect(retry.status).toBe('applied');
  });
  it('retains an opaque cohort writer when a local condition is false', () => {
    const { actor, context, initial } = populationFixture();
    const writer = actor.skills[0]!.effects[0]!;
    writer.inputDefinitions = actor.skills[1]!.effects[0]!.inputDefinitions;
    writer.requirement.expression = {
      kind: 'inputQuantity',
      inputKey: 'population:allies:additional',
      comparison: 'equal',
      value: 2,
    };
    writer.execution = [
      {
        kind: 'populationMutation',
        mutation: 'unsupported',
        scope: 'otherActors',
        basis: 'actorTraits',
        traits: ['fixture-stack'],
        includePassive: false,
      },
    ];
    const grant = reducePreNoblePhantasmAction(
      actor,
      initial,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      context,
    );
    if (grant.status !== 'applied') throw new Error(grant.code);
    expect(grant.state.populationEvents).toHaveLength(1);
    const gain = reducePreNoblePhantasmAction(
      actor,
      grant.state,
      { kind: 'useSkillSlot', slot: 2, skillLevel: 1, choice: null },
      context,
    );
    expect(gain).toMatchObject({ status: 'rejected', code: 'unsupportedResourceMutation' });
    if (gain.status !== 'rejected') throw new Error('opaque count');
    expect(gain.state).toBe(grant.state);
  });
  it('rolls back a later resource failure including the count receipt and retries the same skill', () => {
    const { actor, context, initial } = populationFixture();
    const readable = {
      ...context,
      worldFacts: [
        ...context.worldFacts,
        {
          decisionKey: 'target-absence',
          fact: {
            kind: 'trait' as const,
            scope: 'target' as const,
            trait: 'fixture-stack',
            present: false,
          },
        },
        {
          decisionKey: 'target-state-absence',
          fact: {
            kind: 'trait' as const,
            scope: 'targetState' as const,
            trait: 'fixture-stack',
            present: false,
          },
        },
      ],
    };
    const effect = actor.skills[1]!.effects[0]!;
    effect.execution.push({
      kind: 'resourceMutation',
      resource: 'npGauge',
      direction: 'gain',
      recipient: 'sourceSelf',
      unit: 'fixed',
      subjectId: null,
      amount: { kind: 'dependent', reason: 'dependentTargetResult' },
    });
    const command = {
      kind: 'useSkillSlot' as const,
      slot: 2 as const,
      skillLevel: 1,
      choice: null,
    };
    const failed = reducePreNoblePhantasmAction(actor, initial, command, readable);
    expect(failed).toMatchObject({ status: 'rejected', code: 'unsupportedResourceMutation' });
    if (failed.status !== 'rejected') throw new Error('rejection');
    expect(failed.state).toBe(initial);
    effect.execution.pop();
    expect(reducePreNoblePhantasmAction(actor, failed.state, command, readable).status).toBe(
      'applied',
    );
  });
  it('executes per-enemy function outcomes inside NP transaction, repairs inputs and rolls back a later failure', () => {
    const { actor, context } = populationFixture();
    const template = structuredClone(actor.skills[1]!.effects[0]!);
    const keys = ['target:0', 'target:1', 'target:2'] as [string, string, string];
    const definitions = [
      {
        kind: 'populationSize' as const,
        side: 'enemies' as const,
        key: 'population:enemies:additional',
        owner: 'field' as const,
        label: 'enemies',
        description: 'enemies',
        minimum: 0,
        maximum: 2,
        step: 1,
        defaultValue: 0,
        defaultReason: 'none',
      },
      {
        kind: 'populationCount' as const,
        selector: {
          scope: 'enemies' as const,
          counting: 'individualities' as const,
          basis: 'buffInstances' as const,
          traits: ['counter'],
          includePassive: false,
        },
        key: 'counter',
        owner: 'field' as const,
        label: 'initial counter buffs',
        description: 'initial counter buffs',
        minimum: 0,
        maximum: 3,
        step: 1,
        defaultValue: 0,
        defaultReason: 'none',
      },
      ...keys.map((key, actorIndex) => ({
        kind: 'populationActorValue' as const,
        actorIndex,
        quantity: 'removableBuffs' as const,
        trait: 'beneficial',
        key,
        owner: 'target' as const,
        label: key,
        description: key,
        minimum: 0,
        maximum: 2,
        step: 1,
        defaultValue: 0,
        defaultReason: 'none',
      })),
    ];
    const operations: MasterEffect['execution'][number][] = [
      {
        kind: 'populationFunction',
        scope: 'enemies',
        position: 0,
        action: { kind: 'removeOne', trait: 'beneficial', inputKeys: keys },
      },
      {
        kind: 'populationFunction',
        scope: 'enemies',
        position: 1,
        action: { kind: 'grant', traits: ['counter'], previousSuccess: true, condition: null },
      },
      {
        kind: 'resourceMutation',
        resource: 'npGauge',
        direction: 'gain',
        recipient: 'sourceSelf',
        unit: 'fixed',
        subjectId: null,
        amount: {
          kind: 'populationCount',
          selector: {
            scope: 'enemies',
            counting: 'individualities',
            basis: 'buffInstances',
            traits: ['counter'],
            includePassive: false,
          },
          inputKey: 'counter',
          values: [[5000], [], [], [], []],
        },
      },
    ];
    actor.skills[1]!.effects = operations.map((operation, index) => ({
      ...template,
      id: `function-${index}`,
      occurrenceId: `function-${index}:0`,
      inputDefinitions: definitions,
      execution: [operation],
    }));
    const command = {
      kind: 'useSkillSlot' as const,
      slot: 2 as const,
      skillLevel: 1,
      choice: null,
    };
    const good = {
      ...context,
      canonicalInputValues: {
        'population:enemies:additional': 2,
        counter: 0,
        'target:0': 0,
        'target:1': 1,
        'target:2': 2,
      },
    };
    const current = createPreNoblePhantasmState(
      actor,
      actor.actorFormGraph.defaultInitialFormId,
      good,
    );
    if (current.status !== 'applied') throw new Error(current.code);
    const initial = current.state;
    const applied = reducePreNoblePhantasmAction(actor, initial, command, good);
    if (applied.status !== 'applied') throw new Error(applied.code);
    expect(applied.state.npResource.gauge).toBe(20000);
    expect(projectBattleTraitPresence(applied.state, 'targetState').get('counter') === true).toBe(
      false,
    );
    expect(applied.state.populationEvents[1]!.targetState?.succeeded).toEqual([false, true, true]);
    const bad = {
      ...good,
      canonicalInputValues: { ...good.canonicalInputValues, 'population:enemies:additional': 0 },
    };
    const failed = reducePreNoblePhantasmAction(actor, initial, command, bad);
    expect(failed).toMatchObject({ status: 'rejected', code: 'preparationInputRequired' });
    expect(failed.state).toBe(initial);
    expect(reducePreNoblePhantasmAction(actor, failed.state, command, good).status).toBe('applied');
    const opaque = {
      ...initial,
      populationEvents: [
        {
          operation: {
            kind: 'populationMutation' as const,
            mutation: 'unsupported' as const,
            basis: 'buffInstances' as const,
            scope: 'enemies' as const,
            traits: ['beneficial'],
            includePassive: false,
          },
          source: { origin: 'attacker' as const, sourceInstanceId: 'prior' },
        },
      ],
    };
    const refused = reducePreNoblePhantasmAction(actor, opaque, command, good);
    expect(refused.status).toBe('rejected');
    expect(refused.state).toBe(opaque);
    actor.skills[1]!.effects.push({
      ...template,
      execution: [
        {
          kind: 'resourceMutation',
          resource: 'npGauge',
          direction: 'gain',
          recipient: 'sourceSelf',
          unit: 'fixed',
          subjectId: null,
          amount: { kind: 'dependent', reason: 'dependentTargetResult' },
        },
      ],
    });
    const rollback = reducePreNoblePhantasmAction(actor, initial, command, good);
    expect(rollback).toMatchObject({ status: 'rejected', code: 'unsupportedResourceMutation' });
    expect(rollback.state).toBe(initial);
    expect(initial.populationEvents).toEqual([]);
  });
});
