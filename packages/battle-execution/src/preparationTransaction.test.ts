import { liveTraitQuantityRead } from './stackQuantities';
import { projectBattleTraitPresence, readTraitQuantity } from './traitFactLayers';
import type { SourceActivationReceipt } from './conditionRead';
import type { ConditionRead } from './conditionRead';
import type { SourceEffect } from './sourceCollection';
import type { PreparationActionExecution } from './preparationExecution';
import type { PreNoblePhantasmState } from './preparationContracts';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';
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
import { formCanReachAttackWithoutPreparationNp } from './preparationState';
import { planPreparationResourceTransaction } from './preparationTransaction';
import { diagnoseRejectedPreparation } from './preparationDiagnostic';
import { readInputFact, writeInputFact, exactInputFactValue } from './inputFacts';
import { CRITICAL_STARS_INITIAL_INPUT } from './resourceSemantics';
import { preparationOcAttemptsFor, preparationSourcesFor } from './preparationAttemptObservation';
import { compileEffectCached } from './operationCompiler';
import { resolveModifierValue } from './projection';

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
  stochasticSelection: { kind: 'declared' as const },
  resourceSemantics: semantics,
  npLevel: 2,
  initialGauge: 10_000,
  overcharge: 1,
};
const baseForm = { actorId: 'actor', limitCount: 0 };
const changedForm = { actorId: 'actor', limitCount: 1 };

function fixtureResourceRead(
  truth: boolean | null,
  source: SourceEffect,
  valueSetIndex: number,
  procOutcome: 'success' | 'failure' = 'success',
): Extract<SourceActivationReceipt, { kind: 'read' }> {
  const clock: ConditionRead['clock'] = {
    phase: 'sourceUse',
    actorFormId: baseForm,
    actor: 'attacker',
    actionId: 'resource-fixture',
    operationId: null,
    sourceInstanceId: source.sourceInstanceId,
    occurrenceId: source.effect.occurrenceId,
    valueSetIndex,
    valueIndex: source.valueIndex,
  };
  const proof = { kind: 'guaranteedWrite' as const, clock };
  const evidence = [
    {
      expression: {
        kind: 'trait' as const,
        scope: 'attackerState' as const,
        trait: 'fixtureResourceCondition',
        present: true,
      },
      value: truth,
      proof: truth === null ? null : proof,
    },
  ];
  return {
    kind: 'read',
    proc: {
      kind: 'resolved',
      outcome: procOutcome,
      certainty: procOutcome === 'success' ? 'guaranteed' : 'possible',
      ratePermille: procOutcome === 'success' ? 1000 : 500,
      selection: 'declared',
    },
    read:
      truth === null
        ? { kind: 'inputRequired', truth, certainty: null, clock, evidence, support: [] }
        : { kind: 'known', truth, certainty: 'guaranteed', clock, evidence, support: [proof] },
  };
}
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
    hpByLevel: {},
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
          baseHp: { kind: 'lineage' as const },
          baseNoblePhantasmVariant: baseAttack.ref,
        },
        {
          id: changedForm,
          name: 'changed',
          traits: ['changed-trait'],
          skillIds: [],
          passiveIds: [],
          baseHp: { kind: 'lineage' as const },
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

function rejectedOutcome(
  result: PreparationActionExecution,
  expectedBefore: PreNoblePhantasmState,
  expectedCommand: PreNoblePhantasmCommand,
) {
  const { before, command, sources, committedSources, observations, ...outcome } = result;
  expect(before).toBe(expectedBefore);
  expect(result.state).toBe(expectedBefore);
  expect(command).toEqual(expectedCommand);
  expect(committedSources).toEqual([]);
  expect(Object.keys(observations).sort()).toEqual(['battlePointSteps', 'hpActions', 'ocAttempts']);
  for (const attempt of observations.ocAttempts)
    for (const source of attempt.sourceExecutions) expect(sources).toContain(source);
  for (const source of sources) {
    expect(source.operations.map(({ operation }) => operation)).toEqual(
      source.source.effect.execution,
    );
    for (const operation of source.operations)
      expect(operation.operation).toBe(source.source.effect.execution[operation.operationIndex]);
  }
  expect(structuredClone(result)).toEqual(result);
  return outcome;
}

describe('transactional preparation execution', () => {
  it('returns one complete native result and retains its receipt through spread and clone', () => {
    const servant = servantWithSkill([]);
    const initialized = createPreNoblePhantasmState(servant, baseForm, context);
    expect(initialized.command).toBeNull();
    expect(Object.hasOwn(initialized, 'execution')).toBe(false);
    const command = {
      kind: 'useSkillSlot' as const,
      slot: 1 as const,
      skillLevel: 5,
      choice: null,
    };
    const applied = reducePreNoblePhantasmAction(servant, initialized.state, command, context);
    expect(applied.status).toBe('applied');
    expect(applied.before).toBe(initialized.state);
    expect(applied.command).toBe(command);
    expect(Object.hasOwn(applied, 'after')).toBe(false);
    expect({ ...applied }.observations).toBe(applied.observations);
    expect(structuredClone(applied)).toEqual(applied);
    const rejected = reducePreNoblePhantasmAction(servant, applied.state, command, context);
    expect(rejected).toMatchObject({
      status: 'rejected',
      code: 'skillSlotReused',
      committedSources: [],
    });
    expect(rejected.state).toBe(applied.state);
    expect(rejected.before).toBe(applied.state);
    expect({ ...rejected }.observations).toBe(rejected.observations);
    expect(structuredClone(rejected)).toEqual(rejected);
  });
  it('records the actual attempted structural state when the native source finishes', () => {
    const transition = effect('transition-effect', null, [
      { kind: 'transformActorForm', route, targetFormId: changedForm },
      { kind: 'selectNoblePhantasmVariant', route, variant: changedAttack.ref },
    ]);
    const servant = servantWithSkill([transition]);
    const initialized = createPreNoblePhantasmState(servant, baseForm, context);
    if (initialized.status !== 'applied') throw new Error(initialized.code);
    const result = reducePreNoblePhantasmAction(
      servant,
      initialized.state,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      context,
    );
    expect(result.status).toBe('applied');
    const source = result.sources.find(({ source }) => source.effect === transition);
    expect(source?.status).toBe('completed');
    if (source?.status !== 'completed') throw new Error('completed source required');
    expect(source.transaction.kind).toBe('committed');
    expect(source.binding.actorFormId).toEqual(baseForm);
    expect(source.transaction.before.currentFormId).toEqual(baseForm);
    expect(source.transaction.attempted.currentFormId).toEqual(changedForm);
    expect(source.transaction.attempted.selectedNoblePhantasmVariant).toEqual(changedAttack.ref);
    expect(source.transaction.after.currentFormId).toEqual(changedForm);
    expect(source.transaction.after.selectedNoblePhantasmVariant).toEqual(changedAttack.ref);
    expect(source.operations.map(({ status }) => status)).toEqual(['reached', 'reached']);
    expect(source.operations[0]?.steps.at(-1)?.after.currentFormId).toEqual(changedForm);
    expect(source.operations[1]?.steps[0]?.before.currentFormId).toEqual(changedForm);
    expect(result.committedSources).toContain(source);
    expect(result.state.usedSkillSlots).toEqual(new Set([1]));
    expect(initialized.state.currentFormId).toEqual(baseForm);
    expect(structuredClone(result)).toEqual(result);
  });
  it('binds a dynamic modifier to the source operation before a later quantity write', () => {
    const key = 'stack:attackerState:sequenced';
    const definition = {
      kind: 'effectStackCount' as const,
      key,
      owner: 'attacker' as const,
      label: 'sequenced',
      description: 'initial quantity',
      minimum: 0 as const,
      maximum: 4,
      step: 1 as const,
      defaultValue: 0,
      defaultReason: 'initially absent',
      quantitySource: { scope: 'attackerState' as const, trait: 'sequenced' },
    };
    const source = effect(
      'sequenced-effect',
      null,
      [
        {
          kind: 'damageModifier',
          route,
          semanticSupport: 'supported',
          modifier: 'attackBuff',
          sign: 1,
          card: null,
          values: [[100], [], [], [], []],
          valueExpressions: [
            [
              {
                kind: 'inputLinear',
                inputKey: key,
                basePermille: 100,
                perUnitPermille: 100,
                maximumUnits: 4,
                maximumValuePermille: null,
              },
            ],
            [],
            [],
            [],
            [],
          ],
        },
        {
          kind: 'contextMutation',
          mutation: 'addTrait',
          scope: 'recipientState',
          trait: 'sequenced',
          damageRelevant: true,
          route,
        },
      ],
      { kind: 'always' },
      { inputDefinitions: [definition] },
    );
    const servant = servantWithSkill([source]);
    const setup = { ...context, stackInputs: [definition] };
    const initialized = createPreNoblePhantasmState(servant, baseForm, setup);
    if (initialized.status !== 'applied') throw new Error(initialized.code);
    const result = reducePreNoblePhantasmAction(
      servant,
      initialized.state,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      setup,
    );
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error(result.code);
    expect(result.state.sourceBindings.at(-1)?.modifierValueReads).toMatchObject([
      { operationIndex: 0, result: { value: 100, dependency: { kind: 'known' } } },
    ]);
    expect(
      readTraitQuantity(result.state.traitFactLayers, 'attackerState', 'sequenced').value,
    ).toBe(1);
    const executedSource = result.sources.find(({ source: item }) => item.effect === source);
    if (!executedSource || executedSource.status !== 'completed')
      throw new Error('committed modifier source required');
    const ordinaryState = { ...result.state, actorFormId: result.state.currentFormId };
    const unbound = compileEffectCached(executedSource.source, 0).operations.find(
      (operation) => operation.kind === 'addModifier',
    );
    const bound = compileEffectCached(
      { ...executedSource.source, runtimeBinding: executedSource.binding },
      0,
    ).operations.find((operation) => operation.kind === 'addModifier');
    if (unbound?.kind !== 'addModifier' || bound?.kind !== 'addModifier')
      throw new Error('compiled modifier required');
    expect(resolveModifierValue(unbound, ordinaryState).value).toBe(200);
    expect(resolveModifierValue(bound, ordinaryState)).toMatchObject({
      value: 100,
      dependency: {
        clock: {
          phase: 'operation',
          actionId: executedSource.binding.actionId,
          operationId: bound.operationId,
          sourceInstanceId: executedSource.source.sourceInstanceId,
          occurrenceId: source.occurrenceId,
          valueSetIndex: 0,
          valueIndex: 0,
        },
      },
    });
  });
  it('retains staged NP and OC attempts while a failed native source restores its physical state', () => {
    type Boost = Extract<MasterEffect['execution'][number], { kind: 'grantOcBoost' }>;
    const boost = (rate: number): Boost => ({
      kind: 'grantOcBoost',
      route,
      lifetime: 'active',
      stacking: 'additive',
      stateTraits: ['positive'],
      cells: Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => ({
          stages: 1,
          applicationRatePermille: rate,
          turns: { kind: 'unlimited' },
          uses: { kind: 'finite', remaining: 1 },
        })),
      ) as Boost['cells'],
    });
    const staged = effect(
      'staged-source',
      {
        kind: 'fixed',
        recipient: 'sourceActor',
        direction: 'gain',
        amounts: [[1000], [], [], [], []],
        overflow: 'clampToCapacity',
        underflow: 'clampToZero',
      },
      [boost(1000), boost(0)],
    );
    const servant = servantWithSkill([staged]);
    const initialized = createPreNoblePhantasmState(servant, baseForm, context);
    if (initialized.status !== 'applied') throw new Error(initialized.code);
    const result = reducePreNoblePhantasmAction(
      servant,
      initialized.state,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      context,
    );
    expect(result.status).toBe('applied');
    const source = result.sources.find(({ source }) => source.effect === staged);
    if (source?.status !== 'completed') throw new Error('completed source required');
    expect(source.transaction.kind).toBe('stochasticFailure');
    expect(source.transaction.before.npResource.gauge).toBe(10000);
    expect(source.transaction.attempted.npResource.gauge).toBe(11000);
    expect(source.transaction.attempted.ocState.boosts).toHaveLength(1);
    expect(source.transaction.after.npResource.gauge).toBe(10000);
    expect(source.transaction.after.ocState.boosts).toEqual([]);
    expect(source.binding.activation).toMatchObject({
      kind: 'read',
      proc: { kind: 'resolved', outcome: 'failure', certainty: 'guaranteed', ratePermille: 0 },
    });
    expect(result.committedSources).not.toContain(source);
    expect(result.state.npResource.gauge).toBe(10000);
    expect(result.state.npQuantityWrites).toEqual(initialized.state.npQuantityWrites);
    expect(result.state.ocState.boosts).toEqual([]);
    expect(result.state.usedSkillSlots).toEqual(new Set([1]));
    expect(initialized.state.usedSkillSlots).toEqual(new Set());
    expect(initialized.state.ocState.boosts).toEqual([]);
  });
  it('commits an unknown conditional star value and rolls the action back if a later writer needs it', () => {
    const starOperation: Extract<MasterEffect['execution'][number], { kind: 'resourceMutation' }> =
      {
        kind: 'resourceMutation' as const,
        resource: 'criticalStars' as const,
        direction: 'gain' as const,
        unit: 'fixed' as const,
        recipient: 'sourceSelf' as const,
        subjectId: null,
        amount: {
          kind: 'fixed' as const,
          values: [Array(10).fill(10) as number[], [], [], [], []],
        },
      };
    const writer = effect('conditional-stars', null, [starOperation], {
      kind: 'trait',
      scope: 'field',
      trait: 'fieldCity',
      present: true,
      provenance: {
        stateSources: 'activeOnly',
        ignoredStateTraits: 'exclude',
        unremovableStateTraits: 'include',
      },
    });
    const servant = servantWithSkill([writer]);
    const created = createPreNoblePhantasmState(servant, baseForm, context);
    expect(created.status).toBe('applied');
    const command = {
      kind: 'useSkillSlot' as const,
      slot: 1 as const,
      skillLevel: 10,
      choice: null,
    };
    const used = reducePreNoblePhantasmAction(servant, created.state, command, context);
    expect(used.status).toBe('applied');
    expect(readInputFact(used.state.inputFacts, 'battle:criticalStars').value).toBeUndefined();
    expect(used.state.inputFacts.get('battle:criticalStars')).toMatchObject({
      kind: 'conditional',
      whenTrue: { kind: 'known', value: 10 },
      whenFalse: { kind: 'known', value: 0 },
      recoveryInputs: [{ kind: 'worldTraitPresence', defaultValue: null }],
    });
    const action = used;
    expect(action.committedSources).toHaveLength(1);
    expect(action.sources[0]!.binding).toBe(used.state.sourceBindings.at(-1));
    expect(action.sources[0]!.binding.activation).toMatchObject({
      kind: 'read',
      read: { kind: 'inputRequired', truth: null },
    });
    const commit = action.sources[0]!.binding.physicalInputs[0]!;
    expect(commit.operationIndex).toBe(0);
    expect(commit.inputKey).toBe('battle:criticalStars');
    expect(exactInputFactValue(commit.before)).toBe(0);
    expect(exactInputFactValue(commit.after)).toBeUndefined();
    expect(commit.after).toEqual(used.state.inputFacts.get('battle:criticalStars'));
    expect(readInputFact(created.state.inputFacts, 'battle:criticalStars').value).toBe(0);

    const later = effect(
      'transition-effect',
      null,
      [
        { kind: 'transformActorForm', route, targetFormId: changedForm },
        {
          kind: 'selectNoblePhantasmVariant',
          route,
          variant: servant.actorFormGraph.forms[1]!.baseNoblePhantasmVariant!,
        },
      ],
      { kind: 'inputQuantity', inputKey: 'battle:criticalStars', comparison: 'atLeast', value: 5 },
      {
        inputDefinitions: [CRITICAL_STARS_INITIAL_INPUT],
      },
    );
    const compound = servantWithSkill([writer, later]);
    const original = createPreNoblePhantasmState(compound, baseForm, context);
    const rejected = reducePreNoblePhantasmAction(compound, original.state, command, context);
    expect(rejected).toMatchObject({
      status: 'rejected',
      code: 'preparationInputRequired',
      requiredInput: { kind: 'worldTraitPresence', defaultValue: null },
      requiredInputEffectOccurrenceId: later.occurrenceId,
    });
    expect(rejected.state).toBe(original.state);
    expect(readInputFact(rejected.state.inputFacts, 'battle:criticalStars').value).toBe(0);
    const failed = rejected;
    expect(failed.committedSources).toEqual([]);
    const rolledBack = failed.sources[0]!;
    expect(rolledBack.status).toBe('rolledBack');
    if (rolledBack.status !== 'rolledBack') throw new Error('source rollback required');
    expect(rolledBack.restored).toBe(original.state);
    expect(rolledBack.transaction.kind).toBe('committed');
    expect(
      exactInputFactValue(rolledBack.transaction.after.inputFacts.get('battle:criticalStars')!),
    ).toBeUndefined();
    expect(rolledBack.transaction.after.inputFacts.get('battle:criticalStars')).toEqual(
      commit.after,
    );
  });
  it.each([1, 5, 9])(
    'binds the omitted initial stars and the actual writer cell at skill Lv%s',
    (skillLevel) => {
      const writer = effect('writer-only-stars', null, [
        {
          kind: 'resourceMutation',
          resource: 'criticalStars',
          direction: 'gain',
          unit: 'fixed',
          recipient: 'sourceSelf',
          subjectId: null,
          amount: {
            kind: 'fixed',
            values: [Array.from({ length: 10 }, (_, index) => 10 + index), [], [], [], []],
          },
        },
      ]);
      expect(writer.inputDefinitions).toEqual([]);
      const servant = servantWithSkill([writer]);
      const created = createPreNoblePhantasmState(servant, baseForm, context);
      expect(created.status).toBe('applied');
      const initial = readInputFact(created.state.inputFacts, 'battle:criticalStars');
      expect(initial.value).toBe(0);
      expect(initial.support).toHaveLength(1);
      expect(initial.support[0]).toMatchObject({
        kind: 'selectedInitialResource',
        clock: { phase: 'initial' },
      });
      const used = reducePreNoblePhantasmAction(
        servant,
        created.state,
        { kind: 'useSkillSlot', slot: 1, skillLevel, choice: null },
        context,
      );
      expect(used.status).toBe('applied');
      const action = used;
      const source = action.sources[0]!;
      expect(action.committedSources).toEqual([source]);
      expect(source.binding).toMatchObject({ valueSetIndex: 0, valueIndex: skillLevel - 1 });
      expect(
        source.binding.physicalInputs.map(({ operationIndex, inputKey, before, after }) => ({
          operationIndex,
          inputKey,
          before: exactInputFactValue(before),
          after: exactInputFactValue(after),
        })),
      ).toEqual([
        { operationIndex: 0, inputKey: 'battle:criticalStars', before: 0, after: 9 + skillLevel },
      ]);
      const current = readInputFact(used.state.inputFacts, 'battle:criticalStars');
      expect(current.value).toBe(9 + skillLevel);
      expect(current.support).toHaveLength(2);
      expect(current.support[0]).toEqual(initial.support[0]);
      expect(current.support[1]).toMatchObject({
        kind: 'guaranteedWrite',
        clock: { phase: 'sourceUse', valueIndex: skillLevel - 1 },
      });
      expect(readInputFact(created.state.inputFacts, 'battle:criticalStars').value).toBe(0);

      const unknown = {
        ...created.state,
        inputFacts: writeInputFact(created.state.inputFacts, 'battle:criticalStars', null, []),
      };
      const rejected = reducePreNoblePhantasmAction(
        servant,
        unknown,
        { kind: 'useSkillSlot', slot: 1, skillLevel, choice: null },
        context,
      );
      expect(rejected).toMatchObject({
        status: 'rejected',
        code: 'preparationInputRequired',
        requiredInput: { key: 'battle:criticalStars' },
        requiredInputEffectOccurrenceId: writer.occurrenceId,
      });
      expect(rejected.state).toBe(unknown);
      expect(rejected.state.inputFacts.get('battle:criticalStars')).toEqual({
        kind: 'unknown',
        value: null,
        support: [],
      });
      expect(rejected.committedSources).toEqual([]);
    },
  );

  it.each(['initialization', 'formChange'] as const)(
    'rolls back local commits when automatic activation rejects during %s',
    (phase) => {
      const structural = effect('transition-effect', null, [
        { kind: 'transformActorForm', route, targetFormId: changedForm },
        { kind: 'selectNoblePhantasmVariant', route, variant: changedAttack.ref },
      ]);
      const gain = effect('automatic-gain', {
        kind: 'fixed',
        recipient: 'sourceActor',
        direction: 'gain',
        amounts: [[1000], [], [], [], []],
        overflow: 'clampToCapacity',
        underflow: 'clampToZero',
      });
      const failed = effect('automatic-failure', null, [
        {
          kind: 'resourceMutation',
          resource: 'npGauge',
          direction: 'gain',
          unit: 'fixed',
          recipient: 'sourceSelf',
          subjectId: null,
          amount: { kind: 'fixed', values: [[null], [], [], [], []] },
        },
      ]);
      const servant = servantWithSkill([structural]);
      servant.passives = [{ ...servant.skills[0]!, id: 'automatic', effects: [gain, failed] }];
      servant.actorFormGraph.forms[phase === 'initialization' ? 0 : 1]!.passiveIds = ['automatic'];
      const created = createPreNoblePhantasmState(servant, baseForm, context);
      const result =
        phase === 'initialization'
          ? created
          : reducePreNoblePhantasmAction(
              servant,
              created.state,
              { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
              context,
            );
      expect(created.status).toBe(phase === 'initialization' ? 'rejected' : 'applied');
      expect(result.status).toBe('rejected');
      const execution = phase === 'initialization' ? result : result;
      expect(result.state).toBe(execution.before);
      expect(execution.state).toBe(execution.before);
      expect(execution.state).toEqual(structuredClone(execution.before));
      expect(execution.committedSources).toEqual([]);
      expect(result.state.currentFormId).toEqual(baseForm);
      expect(result.state.selectedNoblePhantasmVariant).toEqual(baseAttack.ref);
      expect(result.state.usedSkillSlots.size).toBe(0);
      expect(result.state.appliedActions).toEqual([]);
      expect(result.state.npResource.gauge).toBe(10000);
      const automatic = execution.sources.filter(({ source }) => source.origin === 'passive');
      expect(automatic).toHaveLength(2);
      expect(automatic[0]).toMatchObject({
        status: 'rolledBack',
        transaction: {
          kind: 'committed',
          before: { npResource: { gauge: 10000 } },
          after: { npResource: { gauge: 11000 } },
        },
        restored: execution.before,
      });
      expect(automatic[1]).toMatchObject({
        status: 'rejected',
        transaction: { kind: 'rejected', before: { npResource: { gauge: 11000 } } },
        restored: execution.before,
      });
      expect(automatic[1]!.operations[0]!.steps.at(-1)?.native.rejection).not.toBeNull();
      if (phase === 'formChange') {
        const first = execution.sources[0]!;
        if (first.status !== 'rolledBack') throw new Error('source rollback required');
        expect(first.transaction.after.currentFormId).toEqual(changedForm);
        expect(automatic[0]!.binding.actorFormId).toEqual(changedForm);
        expect(result.state).toBe(created.state);
      }
    },
  );

  it.each([
    { prior: false, multiple: false, intervening: false, restored: 20, final: 20 },
    { prior: true, multiple: false, intervening: false, restored: 30, final: 30 },
    { prior: true, multiple: true, intervening: true, restored: 30, final: 35 },
  ])('keeps failed actual writes separate from diagnostic continuation: %j', (spec) => {
    const star = (amount: number | null, direction: 'gain' | 'loss' = 'gain') => ({
      kind: 'resourceMutation' as const,
      resource: 'criticalStars' as const,
      direction,
      unit: 'fixed' as const,
      recipient: 'sourceSelf' as const,
      subjectId: null,
      amount: {
        kind: 'fixed' as const,
        values: [[amount], [], [], [], []] as [
          (number | null)[],
          (number | null)[],
          (number | null)[],
          (number | null)[],
          (number | null)[],
        ],
      },
    });
    const reader = (id: string, threshold: number) =>
      effect(id, null, undefined, {
        kind: 'inputQuantity',
        inputKey: 'battle:criticalStars',
        comparison: 'atLeast',
        value: threshold,
      });
    const base = servantWithSkill([]);
    const skills = [
      {
        ...base.skills[0]!,
        id: 'prior',
        slot: 1 as const,
        effects: [effect('prior', null, [star(10)])],
      },
      {
        ...base.skills[0]!,
        id: 'failed',
        slot: 2 as const,
        effects: [
          effect('failed', null, [
            star(40),
            ...(spec.multiple ? [star(15, 'loss')] : []),
            star(null),
            star(1),
          ]),
        ],
      },
      {
        ...base.skills[0]!,
        id: 'later',
        slot: 3 as const,
        effects: [
          reader('immediate', spec.restored),
          ...(spec.intervening ? [effect('intervening', null, [star(5)])] : []),
          reader('final', spec.final),
        ],
      },
    ];
    const servant = {
      ...base,
      skills,
      actorFormGraph: {
        ...base.actorFormGraph,
        forms: base.actorFormGraph.forms.map((form) => ({
          ...form,
          skillIds: skills.map(({ id }) => id),
        })),
      },
    };
    const settings = { ...context, canonicalInputValues: { 'battle:criticalStars': 20 } };
    const initial = createPreNoblePhantasmState(servant, baseForm, settings);
    if (initial.status !== 'applied') throw new Error('initial state required');
    let before = initial.state;
    if (spec.prior) {
      const prior = reducePreNoblePhantasmAction(
        servant,
        before,
        {
          kind: 'useSkillSlot',
          slot: 1,
          skillLevel: 1,
          choice: null,
        },
        settings,
      );
      if (prior.status !== 'applied') throw new Error('prior commit required');
      before = prior.state;
      expect(prior.committedSources).toHaveLength(1);
    }
    const original = structuredClone(before);
    const rejected = reducePreNoblePhantasmAction(
      servant,
      before,
      {
        kind: 'useSkillSlot',
        slot: 2,
        skillLevel: 1,
        choice: null,
      },
      settings,
    );
    if (rejected.status !== 'rejected') throw new Error('normal rejection required');
    expect(rejected.state).toBe(before);
    expect(rejected.state).toEqual(original);
    const rejectedExecution = rejected;
    const attempts = preparationOcAttemptsFor(rejected);
    expect(attempts).toHaveLength(1);
    const observedSources = preparationSourcesFor(attempts[0]!);
    expect(observedSources).toHaveLength(rejectedExecution.sources.length);
    for (const [index, source] of rejectedExecution.sources.entries())
      expect(observedSources[index]).toBe(source);
    expect(rejectedExecution.committedSources).toEqual([]);
    const failed = rejectedExecution.sources[0]!;
    expect(failed.status).toBe('rejected');
    expect(failed.operations.at(-1)?.status).toBe('unreached');
    if (failed.status !== 'rejected') throw new Error('source rejection required');
    expect(failed.transaction.kind).toBe('rejected');
    expect(failed.restored).toBe(before);
    expect('after' in failed.transaction).toBe(false);
    expect(failed.binding).toMatchObject({
      actorFormId: baseForm,
      valueSetIndex: 0,
      valueIndex: 0,
    });
    const writes = failed.operations.filter(({ status }) => status === 'reached');
    expect(
      writes.map(({ steps }) => ({
        before: readInputFact(steps[0]!.before.inputFacts, 'battle:criticalStars').value,
        after: readInputFact(steps.at(-1)!.after.inputFacts, 'battle:criticalStars').value,
      })),
    ).toEqual([
      { before: spec.restored, after: spec.restored + 40 },
      ...(spec.multiple ? [{ before: spec.restored + 40, after: spec.restored + 25 }] : []),
      {
        before: spec.multiple ? spec.restored + 25 : spec.restored + 40,
        after: spec.multiple ? spec.restored + 25 : spec.restored + 40,
      },
    ]);
    expect(writes.at(-1)!.steps.at(-1)!.step).toMatchObject({
      kind: 'reject',
      status: 'unsupported',
    });
    const diagnostic = diagnoseRejectedPreparation(
      servant,
      rejected,
      [
        { kind: 'useSkillSlot', slot: 3, skillLevel: 1, choice: null },
        { kind: 'executeAttackNoblePhantasm' },
      ],
      settings,
    );
    expect(diagnostic.kind).toBe('rejectedPreparationDiagnostic');
    expect(diagnostic.restored).not.toBe(before);
    expect(diagnostic.restored.inputFacts).not.toBe(before.inputFacts);
    expect(diagnostic.restored.usedSkillSlots).not.toBe(before.usedSkillSlots);
    expect(diagnostic.state.terminated).toBe(true);
    expect(diagnostic.state.usedSkillSlots.has(2)).toBe(false);
    expect(diagnostic.state.usedSkillSlots.has(3)).toBe(true);
    expect(readInputFact(diagnostic.state.inputFacts, 'battle:criticalStars').value).toBe(
      spec.final,
    );
    const reads = diagnostic.transitions
      .flatMap(({ sources }) => sources)
      .filter(({ source }) => ['immediate', 'final'].includes(source.effect.occurrenceId))
      .map(({ binding }) => ({
        clock: binding.activation.kind === 'read' ? binding.activation.read.clock.phase : null,
        value: binding.conditionReads.find((read) => read.kind === 'inputQuantity')?.value,
      }));
    expect(reads).toEqual([
      { clock: 'sourceUse', value: spec.restored },
      { clock: 'sourceUse', value: spec.final },
    ]);
    expect(before).toEqual(original);
    expect(rejectedExecution.committedSources).toEqual([]);
  });

  it.each(['commandCard', 'commandCardAttack'] as const)(
    'does not apply %s resource or structural writes, including automatic sources',
    async (triggerScope) => {
      const { preparationEffectSource } = await import('./preparationOc');
      const { executePreparationPhase } = await import('./preparationPhases');
      const inactive: MasterEffect = {
        ...effect('transition-effect', null, [
          {
            kind: 'resourceMutation',
            resource: 'npGauge',
            direction: 'loss',
            unit: 'fixed',
            recipient: 'sourceSelf',
            subjectId: null,
            amount: { kind: 'fixed', values: [[10000], [], [], [], []] },
          },
          {
            kind: 'resourceMutation',
            resource: 'hp',
            direction: 'loss',
            lossFloor: 'oneIfAlive' as const,
            unit: 'fixed',
            recipient: 'sourceSelf',
            subjectId: null,
            amount: { kind: 'fixed', values: [[1000], [], [], [], []] },
          },
          { kind: 'transformActorForm', route, targetFormId: changedForm },
          { kind: 'selectNoblePhantasmVariant', route, variant: changedAttack.ref },
        ]),
        triggerScope,
      };
      const servant = servantWithSkill([inactive]);
      const transitionOnly: ServantMaster = {
        ...servant,
        actorFormGraph: {
          ...servant.actorFormGraph,
          forms: servant.actorFormGraph.forms.map((form) =>
            form.id.limitCount === 0 ? { ...form, baseNoblePhantasmVariant: null } : form,
          ),
        },
      };
      expect(formCanReachAttackWithoutPreparationNp(transitionOnly, baseForm)).toBe(false);
      expect(
        formCanReachAttackWithoutPreparationNp(
          {
            ...transitionOnly,
            skills: transitionOnly.skills.map((skill) => ({
              ...skill,
              effects: [{ ...inactive, triggerScope: null }],
            })),
          },
          baseForm,
        ),
      ).toBe(true);
      const created = createPreNoblePhantasmState(servant, baseForm, context);
      if (created.status !== 'applied') throw new Error(created.code);
      const command = { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null } as const;
      const result = reducePreNoblePhantasmAction(servant, created.state, command, context);
      expect(result.status).toBe('applied');
      if (result.status !== 'applied') return;
      expect(result.state.npResource).toEqual(created.state.npResource);
      expect(result.state.hp?.receipts.length).toBe(0);
      expect(result.state.currentFormId).toEqual(baseForm);
      expect(result.state.activeEffects).toEqual([]);
      for (const origin of ['passive', 'craftEssence', 'support', 'mysticCode', 'np'] as const) {
        const source = preparationEffectSource({
          servant,
          state: created.state,
          effect: inactive,
          origin,
          sourceInstanceId: origin,
          skillId: 'source',
          skillName: 'source',
          valueSetIndex: 0,
          valueIndex: 0,
        });
        const phase = executePreparationPhase(servant, created.state, context, origin, [source]);
        expect(phase.status).toBe('applied');
        expect(phase.state.npResource).toEqual(created.state.npResource);
        expect(phase.state.hp?.receipts.length).toBe(0);
        expect(phase.state.currentFormId).toEqual(baseForm);
      }
      const attack = reducePreNoblePhantasmAction(
        servant,
        result.state,
        { kind: 'executeAttackNoblePhantasm' },
        context,
      );
      expect(attack.status).toBe('applied');
    },
  );

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

    expect(
      rejectedOutcome(result, created.state, {
        kind: 'useSkillSlot',
        slot: 1,
        skillLevel: 1,
        choice: null,
      }),
    ).toEqual({
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
    const correctedContext = { ...context, canonicalInputValues: { 'battle:value': 1 } };
    const corrected = createPreNoblePhantasmState(servant, baseForm, correctedContext);
    if (corrected.status !== 'applied') throw new Error(corrected.code);
    const repaired = reducePreNoblePhantasmAction(
      servant,
      corrected.state,
      command,
      correctedContext,
    );
    expect(missing.state).toBe(created.state);
    expect(created.state.currentFormId).toEqual(baseForm);
    expect(created.state.inputFacts.has('battle:value')).toBe(false);
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
      const inputContext = { ...context, canonicalInputValues: { 'battle:value': value } };
      const created = createPreNoblePhantasmState(servant, baseForm, inputContext);
      if (created.status !== 'applied') throw new Error(created.code);
      const result = reducePreNoblePhantasmAction(
        servant,
        created.state,
        { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
        inputContext,
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
    const created = createPreNoblePhantasmState(servant, baseForm, {
      ...context,
      attackerHpPermille: 100,
    });
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
      sourceActivation: {
        kind: 'read',
        proc: { kind: 'resolved', outcome: 'success' },
      },
    });
    expect(result.state.activeEffects[0]).toMatchObject({
      occurrenceId: 'guaranteed-condition-false',
      sourceActivation: {
        kind: 'read',
        proc: { kind: 'resolved', outcome: 'success' },
      },
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
    const hp = effect('hp-before-failure', null, [
      {
        kind: 'resourceMutation',
        resource: 'hp',
        direction: 'loss',
        lossFloor: 'oneIfAlive',
        recipient: 'sourceSelf',
        subjectId: null,
        unit: 'fixed',
        amount: { kind: 'fixed', values: [[3000], [], [], [], []] },
      },
    ]);
    const servant = servantWithSkill([hp, structural, unsupported]);
    const hpContext = { ...context, initialMaximumHp: 10000, attackerHpPermille: 1000 };
    const created = createPreNoblePhantasmState(servant, baseForm, hpContext);
    if (created.status !== 'applied') throw new Error(created.code);

    const result = reducePreNoblePhantasmAction(
      servant,
      created.state,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      hpContext,
    );

    expect(
      rejectedOutcome(result, created.state, {
        kind: 'useSkillSlot',
        slot: 1,
        skillLevel: 1,
        choice: null,
      }),
    ).toEqual({
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
    expect(result.state.hp).toEqual(created.state.hp);
    expect(result.state.ocState).toEqual(created.state.ocState);
    expect(result.state.hp?.actors.attacker).toMatchObject({ current: 10000 });
    expect(
      projectBattleTraitPresence(result.state, 'attackerState').get('prepared-trait') === true,
    ).toBe(false);
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

    expect(rejectedOutcome(attack, skill.state, { kind: 'executeAttackNoblePhantasm' })).toEqual({
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

    expect(result).toMatchObject({ status: 'ready', state: { npResource: { gauge: 12_000 } } });
  });

  it.each([
    ['success', 1, 12_000, null],
    ['failure', 0, 10_000, null],
    ['inputRequired', undefined, null, 'preparationInputRequired'],
  ] as const)(
    'uses the shared stochastic activation result for %s',
    (_name, successes, expectedGauge, expectedCode) => {
      const servant = servantWithSkill([]);
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
      const inputContext = {
        ...context,
        canonicalInputValues: successes === undefined ? {} : { 'proc:preparation': successes },
      };
      const created = createPreNoblePhantasmState(servant, baseForm, inputContext);
      if (created.status !== 'applied') throw new Error(created.code);
      const result = planPreparationResourceTransaction({
        context: inputContext,
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
          state: { npResource: { gauge: expectedGauge } },
        });
    },
  );

  it('binds condition, cell, clock, and proc receipts for every source in a mixed skill', () => {
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
    const selected = result.state.appliedActions[0]?.selectedEffects;
    for (const [occurrenceId, outcome, ratePermille] of [
      ['stochastic-resource', 'success', 800],
      ['ordinary-stochastic', 'failure', 500],
    ] as const) {
      expect(selected?.find((item) => item.occurrenceId === occurrenceId)).toMatchObject({
        occurrenceId,
        sourceActivation: {
          kind: 'read',
          proc: {
            kind: 'resolved',
            outcome,
            ratePermille,
            certainty: 'possible',
            selection: 'declared',
          },
          read: {
            truth: true,
            clock: {
              phase: 'sourceUse',
              actionId: 'preparation:0:useSkillSlot',
              occurrenceId,
              valueSetIndex: 0,
              valueIndex: 0,
            },
          },
        },
      });
    }
    expect(result.state.npResource).toEqual({ npLevel: 2, capacity: 20000, gauge: 12000 });
    expect(created.state.npResource).toEqual({ npLevel: 2, capacity: 20000, gauge: 10000 });
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
  it.each([
    [true, 'fixed'],
    [false, 'fixed'],
    [true, 'currentGaugeRatio'],
    [false, 'currentGaugeRatio'],
  ] as const)(
    'commits a mixed NP/OC occurrence only on success, NP first: %s, amount: %s',
    (npFirst, amountKind) => {
      const mixed = ocEffect('mixed-resource-proc');
      const grant = mixed.execution[0];
      if (grant?.kind !== 'grantOcBoost') throw new Error('boost fixture required');
      grant.cells[0][0]!.applicationRatePermille = 500;
      const charge = effect('charge-operation', {
        kind: 'fixed',
        recipient: 'sourceActor',
        direction: 'gain',
        amounts: [[3000], [], [], [], []],
        overflow: 'clampToCapacity',
        underflow: 'clampToZero',
      }).execution[0]!;
      if (charge.kind !== 'resourceMutation') throw new Error('charge fixture required');
      if (amountKind === 'currentGaugeRatio')
        charge.amount = { kind: 'currentGaugeRatio', values: [[300], [], [], [], []] };
      mixed.execution = npFirst ? [charge, grant] : [grant, charge];
      const servant = servantWithSkill([mixed]);
      const initial = createPreNoblePhantasmState(servant, baseForm, context);
      if (initial.status !== 'applied') throw new Error(initial.code);
      const command = { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null } as const;
      const missing = reducePreNoblePhantasmAction(servant, initial.state, command, context);
      expect(missing.status).toBe('rejected');
      expect(missing.state).toBe(initial.state);
      if (missing.status !== 'rejected' || !missing.requiredInput)
        throw new Error('input required');
      for (const witness of [0, 1]) {
        const result = reducePreNoblePhantasmAction(servant, initial.state, command, {
          ...context,
          canonicalInputValues: { [missing.requiredInput.key]: witness },
        });
        expect(result.status).toBe('applied');
        expect(result.state.npResource.gauge).toBe(witness === 1 ? 13000 : 10000);
        expect(result.state.ocState.boosts).toHaveLength(witness);
        const initialProof = initial.state.conditionFactProofs.quantities.get('npGauge:attacker');
        expect(initialProof).toMatchObject({
          kind: 'selectedInitialResource',
          clock: { phase: 'initial' },
        });
        const committedProof = result.state.conditionFactProofs.quantities.get('npGauge:attacker');
        if (witness === 1) expect(committedProof?.kind).toBe('possibleOutcome');
        else expect(committedProof).toEqual(initialProof);
        expect(result.state.appliedActions[0]?.selectedEffects[0]?.sourceActivation).toMatchObject({
          kind: 'read',
          proc: {
            kind: 'resolved',
            outcome: witness === 1 ? 'success' : 'failure',
            ratePermille: 500,
            certainty: 'possible',
            selection: 'declared',
          },
        });
        expect(result.state.npQuantityWrites).toHaveLength(witness);
        if (witness === 1)
          expect(result.state.npQuantityWrites[0]?.sourceActivation).toMatchObject({
            kind: 'read',
            proc: {
              kind: 'resolved',
              outcome: 'success',
              ratePermille: 500,
              certainty: 'possible',
            },
          });
        expect(initial.state.npQuantityWrites).toEqual([]);
        expect(initial.state.npResource.gauge).toBe(10000);
      }
    },
  );
  it.each([true, false])(
    'reports the first rejected step in source order, NP first: %s',
    (npFirst) => {
      const invalidNp = effect('invalid-np', {
        kind: 'fixed',
        recipient: 'sourceActor',
        direction: 'gain',
        amounts: [[-1], [], [], [], []],
        overflow: 'clampToCapacity',
        underflow: 'clampToZero',
      });
      const probabilistic = ocEffect('probabilistic-after-charge');
      const grant = probabilistic.execution[0];
      if (grant?.kind !== 'grantOcBoost') throw new Error('boost fixture required');
      grant.cells[0][0]!.applicationRatePermille = 500;
      const servant = servantWithSkill(
        npFirst ? [invalidNp, probabilistic] : [probabilistic, invalidNp],
      );
      const initial = createPreNoblePhantasmState(servant, baseForm, context);
      if (initial.status !== 'applied') throw new Error(initial.code);
      const result = reducePreNoblePhantasmAction(
        servant,
        initial.state,
        { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
        context,
      );
      expect(result).toMatchObject({
        status: 'rejected',
        code: npFirst ? 'invalidResourceMutation' : 'preparationInputRequired',
      });
      expect(result.state).toBe(initial.state);
      expect(initial.state.npResource.gauge).toBe(10000);
      expect(initial.state.ocState.boosts).toEqual([]);
    },
  );
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
          lossFloor: 'oneIfAlive' as const,
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
      const hpContext = { ...context, attackerHpPermille: 500, initialMaximumHp: 10000 };
      const initial = createPreNoblePhantasmState(servant, baseForm, hpContext);
      if (initial.status !== 'applied') throw new Error(initial.code);
      const result = reducePreNoblePhantasmAction(
        servant,
        initial.state,
        { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
        hpContext,
      );
      expect(result.status).toBe('applied');
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
    const appliedAction = np.state.appliedActions.at(-1)!;
    const receipt = np.state.ocState.receipts.find(
      ({ actionId }) => actionId === appliedAction.ocUse?.actionId,
    );
    expect(appliedAction.command).toEqual({ kind: 'executeAttackNoblePhantasm' });
    expect(appliedAction.ocUse).toMatchObject({
      actionId: 'preparation:1:executeAttackNoblePhantasm',
      baseOc: 1,
      effectiveOc: 3,
      boostTotal: 2,
    });
    expect(appliedAction.ocUse).toEqual(receipt);
    expect(appliedAction.ocUse?.gaugeBefore).toBe(appliedAction.resourceBefore.gauge);
    expect(appliedAction.baseOvercharge).toBe(appliedAction.ocUse?.baseOc);
    expect(appliedAction.resourceAfter.gauge).toBe(0);
    expect(appliedAction.resourceTransaction).toEqual({
      afterConsumption: appliedAction.resourceAfter,
      mutations: [],
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
  it('records an NP-body resource gain after consumption in the ordered transaction', () => {
    const servant = servantWithSkill([]);
    const gain = {
      ...effect('np-body-gain', null, [
        {
          kind: 'resourceMutation',
          resource: 'npGauge',
          direction: 'gain',
          unit: 'fixed',
          recipient: 'partyMember',
          subjectId: null,
          amount: {
            kind: 'fixed',
            values: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 2000)) as [
              number[],
              number[],
              number[],
              number[],
              number[],
            ],
          },
        },
      ]),
      gameActivation: 'npBeforeDamage' as const,
      timing: 'afterDamage' as const,
    };
    servant.noblePhantasmVariantGroups[0]!.variants[0] = {
      ...baseAttack,
      effects: [
        gain,
        { ...ocEffect('np-oc'), timing: 'beforeDamage', gameActivation: 'npBeforeDamage' },
      ],
    };
    const initial = createPreNoblePhantasmState(servant, baseForm, context);
    if (initial.status !== 'applied') throw new Error(initial.code);
    const result = reducePreNoblePhantasmAction(
      servant,
      initial.state,
      { kind: 'executeAttackNoblePhantasm' },
      context,
    );
    expect(result.status, JSON.stringify(result)).toBe('applied');
    if (result.status !== 'applied') return;
    const action = result.state.appliedActions.at(-1)!;
    expect(action.resourceBefore.gauge).toBe(10_000);
    expect(action.resourceTransaction.afterConsumption.gauge).toBe(0);
    expect(action.resourceTransaction.mutations).toMatchObject([
      { occurrenceId: 'np-body-gain', before: { gauge: 0 }, after: { gauge: 2_000 } },
    ]);
    expect(action.resourceAfter.gauge).toBe(2_000);
  });
  it.each([false, true])(
    'selects ordered NP amount cells from the frozen receipt after an NP-body OC grant (proportional: %s)',
    (proportional) => {
      const servant = servantWithSkill([]);
      const initial = createPreNoblePhantasmState(servant, baseForm, {
        ...context,
        initialGauge: 20000,
        overcharge: 2,
      });
      if (initial.status !== 'applied') throw new Error(initial.code);
      const refund = effect('oc-dependent-refund', {
        kind: 'fixed',
        recipient: 'sourceActor',
        direction: 'gain',
        amounts: [[1000], [2000], [3000], [4000], [5000]],
        overflow: 'clampToCapacity',
        underflow: 'clampToZero',
      });
      const result = planPreparationResourceTransaction({
        servant,
        state: initial.state,
        context,
        command: { kind: 'useTransformNoblePhantasm' },
        skill: null,
        effects: [
          ocEffect('np-body-boost'),
          refund,
          ...(proportional
            ? [
                effect('np-body-ratio', null, [
                  {
                    kind: 'resourceMutation',
                    resource: 'npGauge',
                    direction: 'gain',
                    unit: 'fixed',
                    recipient: 'sourceSelf',
                    subjectId: null,
                    amount: {
                      kind: 'currentGaugeRatio',
                      values: [[500], [1000], [1500], [2000], [2500]],
                    },
                  },
                ]),
              ]
            : []),
        ],
        valueSetIndex: 0,
        valueIndex: 0,
        consumeNoblePhantasm: true,
        inputSource: { origin: 'np', sourceInstanceId: 'attacker', skillId: 'base-attack' },
      });
      expect(result).toMatchObject({
        status: 'ready',
        state: { npResource: { gauge: proportional ? 4000 : 2000 } },
        ocUse: { baseOc: 2, effectiveOc: 2 },
      });
      expect(initial.state.npResource.gauge).toBe(20000);
    },
  );
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
  expect(projectBattleTraitPresence(result.state, 'attackerState').get('prepared-trait')).not.toBe(
    true,
  );
  expect(created.state.uncertainContextWrites).toHaveLength(0);
});

describe('current gauge ratio in the common preparation transaction', () => {
  const mutation = (
    kind: 'fixed' | 'currentGaugeRatio',
    value: number,
  ): MasterEffect['execution'][number] => ({
    kind: 'resourceMutation',
    resource: 'npGauge',
    direction: 'gain',
    unit: 'fixed',
    recipient: 'sourceSelf',
    subjectId: null,
    amount: { kind, values: [[value], [], [], [], []] },
  });
  it.each([false, true])('respects charge/proportional order (charge first: %s)', (chargeFirst) => {
    const steps = [mutation('fixed', 5000), mutation('currentGaugeRatio', 1000)];
    const servant = servantWithSkill([
      effect('proportional', null, chargeFirst ? steps : steps.reverse()),
    ]);
    const settings = { ...context, initialGauge: 5000 };
    const initial = createPreNoblePhantasmState(servant, baseForm, settings);
    if (initial.status !== 'applied') throw new Error(initial.code);
    const result = reducePreNoblePhantasmAction(
      servant,
      initial.state,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      settings,
    );
    expect(result).toMatchObject({
      status: 'applied',
      state: { npResource: { gauge: chargeFirst ? 20000 : 15000 } },
    });
    expect(initial.state.npResource.gauge).toBe(5000);
  });
  it('rolls back preceding writes when a coefficient cell is missing, then permits repair and retry', () => {
    const proportional = mutation('currentGaugeRatio', 1000);
    if (proportional.kind !== 'resourceMutation' || proportional.amount.kind === 'dependent')
      throw new Error('fixture');
    proportional.amount.values[0] = [];
    const servant = servantWithSkill([
      effect('proportional', null, [mutation('fixed', 5000), proportional]),
    ]);
    const initial = createPreNoblePhantasmState(servant, baseForm, context);
    if (initial.status !== 'applied') throw new Error(initial.code);
    const command = { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null } as const;
    expect(reducePreNoblePhantasmAction(servant, initial.state, command, context)).toMatchObject({
      status: 'rejected',
      state: initial.state,
    });
    proportional.amount.values[0] = [1000];
    expect(reducePreNoblePhantasmAction(servant, initial.state, command, context)).toMatchObject({
      status: 'applied',
      state: { npResource: { gauge: 20000 } },
    });
  });
});

it('selects live buff count coefficients from normal/LB and OC cells without a missing-cell fallback', async () => {
  const { preparationEffectSource } = await import('./preparationOc');
  const { applyPreparationNpOperation } = await import('./preparationResourcePlan');
  const { masterEffectSchema } = await import('@fgo-lab/master-data');
  const canonical = masterEffectSchema.parse({
    ...effect('buff-count-cells', null, [
      {
        kind: 'resourceMutation',
        resource: 'npGauge',
        direction: 'gain',
        unit: 'fixed',
        recipient: 'sourceSelf',
        subjectId: null,
        amount: {
          kind: 'buffCount',
          inputKey: 'stack:attackerState:counted',
          trait: 'counted',
          values: [[1000], [2000], [], [], []],
          limitBreakValues: [[3000], [4000], [], [], []],
        },
      },
    ]),
    inputDefinitions: [
      {
        kind: 'effectStackCount',
        key: 'stack:attackerState:counted',
        owner: 'attacker',
        quantitySource: { scope: 'attackerState', trait: 'counted' },
        instanceTraits: ['counted'],
        label: '状態数',
        description: '初期状態数',
        minimum: 0,
        maximum: 30,
        step: 1,
        defaultValue: 0,
        defaultReason: '外部付与なし',
      },
    ],
  });
  const servant = servantWithSkill([]);
  const initial = createPreNoblePhantasmState(servant, baseForm, context);
  if (initial.status !== 'applied') throw new Error(initial.code);
  const source = preparationEffectSource({
    servant,
    state: initial.state,
    effect: canonical,
    origin: 'craftEssence',
    sourceInstanceId: 'ce',
    skillId: 'ce',
    skillName: 'CE',
    valueSetIndex: 0,
    valueIndex: 0,
  });
  const run = (limitBreak: boolean, valueSetIndex: number, count: number, bound = true) =>
    applyPreparationNpOperation({
      semantics,
      initial: initial.state.npResource,
      source: {
        ...source,
        limitBreak,
        effect: bound ? canonical : { ...canonical, inputDefinitions: [] },
      },
      operation: canonical.execution[0]!,
      valueSetIndex,
      sourceActivation: fixtureResourceRead(true, source, valueSetIndex),
      phase: 'resolvedSource',
      buffInstances: [
        { identity: 'live', actor: 'attacker', traits: ['counted'], lifetime: 'active', count },
      ],
    });
  expect(run(false, 0, 2)).toMatchObject({ status: 'applied', state: { gauge: 12_000 } });
  expect(run(false, 1, 2)).toMatchObject({ status: 'applied', state: { gauge: 14_000 } });
  expect(run(true, 0, 2)).toMatchObject({ status: 'applied', state: { gauge: 16_000 } });
  expect(run(true, 1, 2)).toMatchObject({ status: 'applied', state: { gauge: 18_000 } });
  expect(run(true, 1, 0)).toMatchObject({ status: 'applied', state: { gauge: 10_000 } });
  expect(run(true, 2, 2).status).toBe('rejected');
  expect(run(true, 1, 2, false).status).toBe('rejected');
});

it('selects proportional normal/LB and OC cells, routes recipients, and classifies uncertain writes', async () => {
  const { preparationEffectSource } = await import('./preparationOc');
  const { applyPreparationNpOperation } = await import('./preparationResourcePlan');
  const { effectReadsOc } = await import('./ocDependency');
  const { masterEffectSchema } = await import('@fgo-lab/master-data');
  const operation = {
    kind: 'resourceMutation',
    resource: 'npGauge',
    direction: 'gain',
    unit: 'fixed',
    recipient: 'sourceSelf',
    subjectId: null,
    amount: {
      kind: 'currentGaugeRatio',
      values: [[100], [200], [300], [400], [500]],
      limitBreakValues: [[500], [600], [700], [800], [1000]],
    },
  } satisfies Extract<MasterEffect['execution'][number], { kind: 'resourceMutation' }>;
  const canonical = masterEffectSchema.parse(
    effect('ratio-cells', null, [structuredClone(operation)]),
  );
  expect(effectReadsOc(canonical)).toBe(true);
  expect(
    masterEffectSchema.safeParse({ ...canonical, execution: [{ ...operation, resource: 'hp' }] })
      .success,
  ).toBe(false);
  const servant = servantWithSkill([]);
  const initial = createPreNoblePhantasmState(servant, baseForm, context);
  if (initial.status !== 'applied') throw new Error(initial.code);
  const source = preparationEffectSource({
    servant,
    state: initial.state,
    effect: canonical,
    origin: 'craftEssence',
    sourceInstanceId: 'ce',
    skillId: 'ce',
    skillName: 'CE',
    valueSetIndex: 0,
    valueIndex: 0,
  });
  const run = (
    limitBreak: boolean,
    valueSetIndex: number,
    activation: { conditionOutcome: boolean | null; procOutcome: 'success' | 'failure' } = {
      conditionOutcome: true,
      procOutcome: 'success',
    },
  ) =>
    applyPreparationNpOperation({
      buffInstances: [],
      semantics,
      initial: initial.state.npResource,
      source: { ...source, limitBreak },
      operation: canonical.execution[0]!,
      valueSetIndex,
      sourceActivation: fixtureResourceRead(
        activation.conditionOutcome,
        source,
        valueSetIndex,
        activation.procOutcome,
      ),
      phase: 'resolvedSource',
    });
  expect(run(false, 1)).toMatchObject({ status: 'applied', state: { gauge: 12000 } });
  expect(run(true, 4)).toMatchObject({ status: 'applied', state: { gauge: 20000 } });
  expect(run(false, 0, { conditionOutcome: null, procOutcome: 'success' })).toMatchObject({
    status: 'rejected',
    code: 'ambiguousCondition',
  });
  expect(run(false, 0, { conditionOutcome: true, procOutcome: 'failure' })).toMatchObject({
    status: 'applied',
    state: initial.state.npResource,
  });
  expect(run(false, 0, { conditionOutcome: false, procOutcome: 'success' })).toMatchObject({
    status: 'applied',
    state: initial.state.npResource,
  });
  const saturated = { ...initial.state.npResource, gauge: 20000 };
  expect(
    applyPreparationNpOperation({
      buffInstances: [],
      semantics,
      initial: saturated,
      source,
      operation: canonical.execution[0]!,
      valueSetIndex: 0,
      sourceActivation: fixtureResourceRead(null, source, 0),
      phase: 'resolvedSource',
    }),
  ).toMatchObject({ status: 'applied', state: saturated });
  expect(
    applyPreparationNpOperation({
      buffInstances: [],
      semantics,
      initial: initial.state.npResource,
      source,
      operation: {
        ...canonical.execution[0]!,
        recipient: 'enemy',
      } as MasterEffect['execution'][number],
      valueSetIndex: 0,
      sourceActivation: fixtureResourceRead(true, source, 0),
      phase: 'resolvedSource',
    }),
  ).toMatchObject({ status: 'applied', state: initial.state.npResource });
});

it('uses the same proportional reducer for bounded OC dependencies across consumption and saturation', async () => {
  const { ocGaugeDependencies } = await import('./ocResourceDependencies');
  const proportional = effect('ratio', null, [
    {
      kind: 'resourceMutation',
      resource: 'npGauge',
      direction: 'gain',
      unit: 'fixed',
      recipient: 'sourceSelf',
      subjectId: null,
      amount: { kind: 'currentGaugeRatio', values: [[1000], [], [], [], []] },
    },
  ]);
  const settings = { semantics, npLevel: 2 as const, initialGauge: 10000 };
  expect(
    ocGaugeDependencies([{ kind: 'skill', effects: [proportional], skillLevel: 1 }], settings)
      .changed,
  ).toEqual(new Set([0]));
  expect(
    ocGaugeDependencies([{ kind: 'skill', effects: [proportional], skillLevel: 1 }], {
      ...settings,
      npLevel: 1,
    }).changed,
  ).toEqual(new Set());
  // Empty OC cells cannot prove that a post-consumption write is a no-op.
  expect(
    ocGaugeDependencies([{ kind: 'noblePhantasm', effects: [proportional] }], {
      ...settings,
      npLevel: 1,
    }).changed,
  ).toEqual(new Set([0]));
  const complete = structuredClone(proportional);
  for (const operation of complete.execution)
    if (operation.kind === 'resourceMutation' && operation.amount.kind !== 'dependent')
      operation.amount.values = [[1000], [1000], [1000], [1000], [1000]];
  expect(
    ocGaugeDependencies([{ kind: 'noblePhantasm', effects: [complete] }], {
      ...settings,
      npLevel: 1,
    }).changed,
  ).toEqual(new Set());
  const lost = effect('loss', {
    kind: 'fixed',
    recipient: 'sourceActor',
    direction: 'loss',
    amounts: [[5000], [], [], [], []],
    overflow: 'clampToCapacity',
    underflow: 'clampToZero',
  });
  expect(
    ocGaugeDependencies(
      [
        { kind: 'skill', effects: [lost] },
        { kind: 'skill', effects: [proportional] },
      ],
      { ...settings, npLevel: 1 },
    ).changed,
  ).toEqual(new Set([0, 1]));
});

it.each(['fixed', 'currentGaugeRatio'] as const)(
  'rejects an unresolved NP recipient for %s rather than proving a no-op',
  async (kind) => {
    const { masterEffectSchema } = await import('@fgo-lab/master-data');
    const { applyPreparationNpOperation } = await import('./preparationResourcePlan');
    const { preparationEffectSource } = await import('./preparationOc');
    const { ocGaugeDependencies } = await import('./ocResourceDependencies');
    const unknown = effect('unknown-recipient', null, [
      {
        kind: 'resourceMutation',
        resource: 'npGauge',
        direction: 'gain',
        unit: 'fixed',
        recipient: 'unresolved',
        subjectId: null,
        amount: { kind, values: [[1000], [], [], [], []] },
      },
    ]);
    expect(masterEffectSchema.safeParse(unknown).success).toBe(false);
    const servant = servantWithSkill([]);
    const initial = createPreNoblePhantasmState(servant, baseForm, context);
    if (initial.status !== 'applied') throw new Error(initial.code);
    const source = preparationEffectSource({
      servant,
      state: initial.state,
      effect: unknown,
      origin: 'attacker',
      sourceInstanceId: 'attacker',
      skillId: 'unknown',
      skillName: 'Unknown',
      valueSetIndex: 0,
      valueIndex: 0,
    });
    expect(
      applyPreparationNpOperation({
        buffInstances: [],
        semantics,
        initial: initial.state.npResource,
        source,
        operation: unknown.execution[0]!,
        valueSetIndex: 0,
        sourceActivation: fixtureResourceRead(true, source, 0),
        phase: 'resolvedSource',
      }),
    ).toMatchObject({
      status: 'rejected',
      code: 'unsupportedMutation',
      state: initial.state.npResource,
    });
    expect(
      ocGaugeDependencies([{ kind: 'skill', effects: [unknown] }], {
        semantics,
        npLevel: 1,
        initialGauge: 10000,
      }).changed,
    ).toEqual(new Set([0]));
  },
);

it.each(['fixed', 'currentGaugeRatio'] as const)(
  'rejects contradictory NP units and domains for %s',
  async (kind) => {
    const { masterEffectSchema } = await import('@fgo-lab/master-data');
    const { npMutationFromCanonicalAmount, applyNpResourceTransaction } =
      await import('./npResource');
    for (const invalid of [
      { unit: 'percent' as const, subjectId: null },
      { unit: 'fixed' as const, subjectId: 'unrelated-domain' },
    ]) {
      const operation = {
        kind: 'resourceMutation' as const,
        resource: 'npGauge' as const,
        direction: 'gain' as const,
        recipient: 'sourceSelf' as const,
        ...invalid,
        amount: {
          kind,
          values: [[1000], [], [], [], []] as [number[], number[], number[], number[], number[]],
        },
      };
      expect(
        masterEffectSchema.safeParse(effect('invalid-np-domain', null, [operation])).success,
      ).toBe(false);
      const state = { npLevel: 1 as const, capacity: 10000, gauge: 10000 };
      expect(
        applyNpResourceTransaction(semantics, state, {
          requirement: null,
          mutations: [npMutationFromCanonicalAmount(operation, 1000)],
        }),
      ).toMatchObject({ status: 'rejected', code: 'unsupportedMutation', state });
    }
  },
);

it('executes marker grant, duplicate, read, remove and negative read in one transaction and rolls every state back on failure', () => {
  const marker = {
    kind: 'buffInstanceMutation' as const,
    mutation: 'grant' as const,
    recipient: 'sourceSelf' as const,
    traits: ['marker-buff'],
    lifetime: 'active' as const,
    marker: {
      actorTrait: 'marker-actor',
      buffIdentity: 'marker-identity',
      removable: true,
      onField: false,
      recipientSide: 'both' as const,
    },
  };
  const condition = (present: boolean): MasterEffect['requirement']['expression'] => ({
    kind: 'trait',
    scope: 'recipientState',
    trait: 'marker-actor',
    present,
    provenance: {
      stateSources: 'activeOnly',
      ignoredStateTraits: 'exclude',
      unremovableStateTraits: 'include',
    },
  });
  const gain = (id: string, present: boolean) =>
    effect(
      id,
      {
        kind: 'fixed',
        recipient: 'sourceActor',
        direction: 'gain',
        amounts: [[1000], [], [], [], []],
        overflow: 'clampToCapacity',
        underflow: 'clampToZero',
      },
      [],
      condition(present),
    );
  const effects = [
    effect('grant1', null, [marker]),
    effect('grant2', null, [marker]),
    gain('positive-reader', true),
    effect('remove', null, [
      {
        kind: 'buffInstanceMutation',
        mutation: 'remove',
        recipient: 'sourceSelf',
        traits: ['marker-buff'],
        lifetime: 'active',
      },
    ]),
    gain('negative-reader', false),
    effect('hp', null, [
      {
        kind: 'resourceMutation',
        resource: 'hp',
        direction: 'loss',
        unit: 'fixed',
        lossFloor: 'oneIfAlive',
        recipient: 'sourceSelf',
        subjectId: null,
        amount: { kind: 'fixed', values: [[1000], [], [], [], []] },
      },
    ]),
  ];
  const actor = servantWithSkill(effects);
  const ctx = { ...context, initialMaximumHp: 10000, attackerHpPermille: 1000 };
  const initial = createPreNoblePhantasmState(actor, baseForm, ctx);
  if (initial.status !== 'applied') throw new Error(initial.code);
  const command = { kind: 'useSkillSlot' as const, slot: 1 as const, skillLevel: 1, choice: null };
  const result = reducePreNoblePhantasmAction(actor, initial.state, command, ctx);
  expect(result.status).toBe('applied');
  expect(result.state.npResource.gauge).toBe(12000);
  expect(
    liveTraitQuantityRead(result.state, { scope: 'attackerState', trait: 'marker-actor' }).value,
  ).toBe(0);
  expect(result.state.hp?.actors.attacker).toMatchObject({ current: 9000 });
  expect(initial.state.buffInstances).toEqual([]);
  const invalidActor = servantWithSkill([
    ...effects,
    effect('invalid-child', { kind: 'unsupported', recipient: 'sourceActor', family: 'unknown' }),
  ]);
  const rejected = reducePreNoblePhantasmAction(invalidActor, initial.state, command, ctx);
  expect(rejected.status).toBe('rejected');
  expect(rejected.state).toEqual(initial.state);
  expect(reducePreNoblePhantasmAction(actor, rejected.state, command, ctx).state).toEqual(
    result.state,
  );
});

it('repairs the originating condition of an unknown marker reader and rolls back the whole attempt', () => {
  const trait = (
    scope: 'field' | 'recipientState',
    name: string,
  ): MasterEffect['requirement']['expression'] => ({
    kind: 'trait',
    scope,
    trait: name,
    present: true,
    provenance: {
      stateSources: 'activeOnly',
      ignoredStateTraits: 'exclude',
      unremovableStateTraits: 'include',
    },
  });
  const marker = effect(
    'unknown-marker',
    null,
    [
      {
        kind: 'buffInstanceMutation',
        mutation: 'grant',
        recipient: 'sourceSelf',
        traits: ['marker-buff'],
        lifetime: 'active',
        marker: {
          actorTrait: 'marker-actor',
          buffIdentity: 'marker',
          removable: true,
          onField: false,
          recipientSide: 'both',
        },
      },
    ],
    trait('field', 'unknown-field'),
  );
  const gain = effect(
    'marker-reader',
    {
      kind: 'fixed',
      recipient: 'sourceActor',
      direction: 'gain',
      amounts: [[1000], [], [], [], []],
      overflow: 'clampToCapacity',
      underflow: 'clampToZero',
    },
    [],
    trait('recipientState', 'marker-actor'),
  );
  const servant = servantWithSkill([marker, gain]);
  const initial = createPreNoblePhantasmState(servant, baseForm, context);
  if (initial.status !== 'applied') throw new Error(initial.code);
  const command = { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null } as const;
  const missing = reducePreNoblePhantasmAction(servant, initial.state, command, context);
  expect(missing).toMatchObject({
    status: 'rejected',
    code: 'preparationInputRequired',
    state: initial.state,
  });
  if (missing.status !== 'rejected' || !missing.requiredInput)
    throw new Error('missing repair input');
  expect(missing.requiredInput.key).toContain('unknown-field');
  for (const value of [0, 1]) {
    const repaired = reducePreNoblePhantasmAction(servant, initial.state, command, {
      ...context,
      canonicalInputValues: { [missing.requiredInput.key]: value },
      worldFacts: [
        {
          decisionKey: 'fixture',
          fact: { kind: 'trait', scope: 'field', trait: 'unknown-field', present: value === 1 },
        },
      ],
    });
    expect(repaired.status, JSON.stringify({ value, repaired })).toBe('applied');
    expect(repaired.state.npResource.gauge).toBe(10000 + 1000 * value);
  }
});

it('rolls BP, HP, NP, context and receipts back together when a later effect fails', () => {
  const domain = {
    id: 'bp',
    phaseScale: 'point' as const,
    phases: [
      { phase: 0, threshold: -1 },
      { phase: 1, threshold: 0 },
      { phase: 2, threshold: 1 },
    ],
    eligibility: [{ kind: 'actor' as const, actorId: 'servant' }],
    capacity: { default: 4, maximum: 8, traitOverrides: [] },
  };
  const applied = effect(
    'bp-and-hp',
    {
      kind: 'fixed',
      recipient: 'sourceActor',
      direction: 'gain',
      amounts: [[1000], [], [], [], []],
      overflow: 'clampToCapacity',
      underflow: 'clampToZero',
    },
    [
      {
        kind: 'resourceMutation',
        resource: 'battlePoint',
        direction: 'gain',
        unit: 'fixed',
        recipient: 'sourceSelf',
        amount: { kind: 'fixed', values: [[2], [], [], [], []] },
        subjectId: 'bp',
      },
      {
        kind: 'resourceMutation',
        resource: 'hp',
        direction: 'loss',
        unit: 'fixed',
        recipient: 'sourceSelf',
        selection: 'direct',
        lossFloor: 'oneIfAlive',
        amount: { kind: 'fixed', values: [[1000], [], [], [], []] },
        subjectId: null,
      },
      {
        kind: 'contextMutation',
        mutation: 'addTrait',
        scope: 'recipientState',
        route,
        trait: 'temporary',
        damageRelevant: true,
      },
    ],
  );
  const invalid = effect('invalid-after-bp', {
    kind: 'unsupported',
    recipient: 'sourceActor',
    family: 'unknown',
  });
  const recoveryRead = effect(
    'recovery-read',
    null,
    [
      {
        kind: 'resourceMutation',
        resource: 'npGauge',
        direction: 'gain',
        unit: 'fixed',
        recipient: 'sourceSelf',
        subjectId: null,
        amount: { kind: 'currentGaugeRatio', values: [[500], [], [], [], []] },
      },
    ],
    { kind: 'always' },
  );
  const baseActor = servantWithSkill([applied, invalid]);
  const recoverySkill: MasterSkill = {
    ...baseActor.skills[0]!,
    id: 'recovery-skill',
    slot: 2,
    effects: [recoveryRead],
  };
  const actor = {
    ...baseActor,
    skills: [...baseActor.skills, recoverySkill],
    actorFormGraph: {
      ...baseActor.actorFormGraph,
      forms: baseActor.actorFormGraph.forms.map((form) =>
        form.id.limitCount === 0
          ? { ...form, skillIds: [...form.skillIds, recoverySkill.id] }
          : form,
      ),
    },
    battlePointDomains: [domain],
  };
  const ctx = {
    ...context,
    initialMaximumHp: 10_000,
    attackerHpPermille: 1000,
    battlePointDomains: [domain],
    initialBattlePointPoints: { bp: 0 },
  };
  const initial = createPreNoblePhantasmState(actor, baseForm, ctx);
  if (initial.status !== 'applied') throw new Error(initial.code);
  const command = { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null } as const;
  const rejected = reducePreNoblePhantasmAction(actor, initial.state, command, ctx);
  expect(rejected.status).toBe('rejected');
  expect(rejected.state).toEqual(initial.state);
  expect(rejected.state).toBe(initial.state);
  expect(initial.state.battlePoints.receipts).toEqual([]);

  const recoveredRead = reducePreNoblePhantasmAction(
    actor,
    rejected.state,
    { kind: 'useSkillSlot', slot: 2, skillLevel: 1, choice: null },
    ctx,
  );
  expect(recoveredRead.status).toBe('applied');
  if (recoveredRead.status !== 'applied') return;
  expect(recoveredRead.state.npResource.gauge).toBe(15_000);
  expect(recoveredRead.state.appliedActions.at(-1)).toMatchObject({
    command: { kind: 'useSkillSlot', slot: 2, skillLevel: 1, choice: null },
    resourceBefore: { gauge: 10_000 },
    resourceAfter: { gauge: 15_000 },
  });
  expect(
    projectBattleTraitPresence(recoveredRead.state, 'attackerState').get('temporary') === true,
  ).toBe(false);

  const validActor = { ...servantWithSkill([applied]), battlePointDomains: [domain] };
  const committed = reducePreNoblePhantasmAction(validActor, initial.state, command, ctx);
  expect(committed.status).toBe('applied');
  expect(committed.state.battlePoints.actors.attacker?.domains.bp).toMatchObject({ point: 2 });
  expect(committed.state.hp?.actors.attacker).toMatchObject({ current: 9000 });
  expect(committed.state.npResource.gauge).toBe(11_000);
  expect(
    projectBattleTraitPresence(committed.state, 'attackerState').get('temporary') === true,
  ).toBe(true);
});

describe('NP write ownership and quantity dependencies', () => {
  it.each([
    ['fixed', 0, 10000, 'possibleOutcome'],
    ['fixed', 1000, 11000, 'possibleOutcome'],
    ['currentGaugeRatio', 100, 11000, 'possibleOutcome'],
    ['fixed', 20000, 20000, 'guaranteedWrite'],
  ] as const)(
    'records an actual %s write (%s) without losing the previous quantity proof',
    (kind, amount, gauge, expectedProof) => {
      const servant = servantWithSkill([
        effect('owned-np-write', null, [
          {
            kind: 'resourceMutation',
            resource: 'npGauge',
            direction: 'gain',
            unit: 'fixed',
            recipient: 'sourceSelf',
            subjectId: null,
            amount: { kind, values: [[amount], [], [], [], []] },
          },
        ]),
      ]);
      const created = createPreNoblePhantasmState(servant, baseForm, context);
      if (created.status !== 'applied') throw new Error(created.code);
      const prior = created.state.conditionFactProofs.quantities.get('npGauge:attacker');
      if (!prior) throw new Error('initial NP proof required');
      (created.state.conditionFactProofs.quantities as Map<string, typeof prior>).set(
        'npGauge:attacker',
        { ...prior, kind: 'possibleOutcome' },
      );
      const result = reducePreNoblePhantasmAction(
        servant,
        created.state,
        {
          kind: 'useSkillSlot',
          slot: 1,
          skillLevel: 1,
          choice: null,
        },
        context,
      );
      expect(result.status).toBe('applied');
      expect(result.state.npResource.gauge).toBe(gauge);
      expect(result.state.conditionFactProofs.quantities.get('npGauge:attacker')).toMatchObject({
        kind: expectedProof,
        clock: { phase: 'operation', valueSetIndex: 0, valueIndex: 0 },
      });
      expect(result.state.npQuantityWrites).toHaveLength(1);
      expect(result.state.npQuantityWrites[0]).toMatchObject({
        quantity: 'npGauge:attacker',
        mutation: { kind, direction: 'gain', cell: amount },
        before: 10000,
        after: gauge,
        sourceActivation: { kind: 'read', proc: { kind: 'resolved', outcome: 'success' } },
        reads: [
          {
            kind: 'previousQuantity',
            value: 10000,
            proof: { kind: 'possibleOutcome' },
            influencesResult:
              amount < context.resourceSemantics.capacityByNpLevel[context.npLevel - 1]!,
          },
          { kind: 'capacity', value: 20000 },
          { kind: 'canonicalCell', value: amount },
        ],
      });
      expect(created.state.npQuantityWrites).toEqual([]);
      expect(created.state.npResource.gauge).toBe(10000);
      expect(created.state.conditionFactProofs.quantities.get('npGauge:attacker')?.kind).toBe(
        'possibleOutcome',
      );
    },
  );
});

it('does not invent an attacker NP write for a different canonical recipient', () => {
  const servant = servantWithSkill([
    effect('other-np-write', null, [
      {
        kind: 'resourceMutation',
        resource: 'npGauge',
        direction: 'gain',
        unit: 'fixed',
        recipient: 'enemy',
        subjectId: null,
        amount: { kind: 'fixed', values: [[1000], [], [], [], []] },
      },
    ]),
  ]);
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
    state: { npQuantityWrites: [], npResource: { gauge: 10000 } },
  });
  expect(result.state.conditionFactProofs.quantities.get('npGauge:attacker')).toEqual(
    created.state.conditionFactProofs.quantities.get('npGauge:attacker'),
  );
});

it('requires the NP writer receipt and keeps pending proc inside the source stage', async () => {
  const { applyPreparationNpOperation } = await import('./preparationResourcePlan');
  const { preparationEffectSource } = await import('./preparationOc');
  const mutation = {
    kind: 'resourceMutation',
    resource: 'npGauge',
    recipient: 'sourceSelf',
    direction: 'gain',
    unit: 'fixed',
    subjectId: null,
    amount: { kind: 'fixed', values: [[1000], [1000], [1000], [1000], [1000]] },
  } satisfies Extract<MasterEffect['execution'][number], { kind: 'resourceMutation' }>;
  const canonical = effect('receipt-owned-np', null, [mutation]);
  const servant = servantWithSkill([]);
  const initial = createPreNoblePhantasmState(servant, baseForm, context);
  if (initial.status !== 'applied') throw new Error(initial.code);
  const source = preparationEffectSource({
    servant,
    state: initial.state,
    effect: canonical,
    origin: 'attacker',
    sourceInstanceId: 'attacker',
    skillId: 'receipt-owned-skill',
    skillName: '',
    valueSetIndex: 0,
    valueIndex: 0,
  });
  const read = fixtureResourceRead(true, source, 0);
  const run = (
    sourceActivation: SourceActivationReceipt,
    phase: 'sourceStage' | 'resolvedSource',
    gauge = 10000,
  ) =>
    applyPreparationNpOperation({
      semantics,
      initial: { ...initial.state.npResource, gauge },
      source,
      operation: mutation,
      valueSetIndex: 0,
      buffInstances: [],
      sourceActivation,
      phase,
    });
  expect(run(read, 'resolvedSource')).toMatchObject({ status: 'applied', state: { gauge: 11000 } });
  expect(run({ kind: 'unread' }, 'resolvedSource', 20000)).toMatchObject({
    status: 'rejected',
    code: 'ambiguousCondition',
    state: { gauge: 20000 },
  });
  const pending = { ...read, proc: { kind: 'unread' as const } };
  expect(run(pending, 'resolvedSource', 20000)).toMatchObject({
    status: 'rejected',
    code: 'ambiguousCondition',
    state: { gauge: 20000 },
  });
  expect(run(pending, 'sourceStage')).toMatchObject({ status: 'applied', state: { gauge: 11000 } });
  expect(
    run(
      {
        ...read,
        proc: {
          kind: 'resolved',
          outcome: 'failure',
          certainty: 'possible',
          ratePermille: 500,
          selection: 'declared',
        },
      },
      'resolvedSource',
    ),
  ).toMatchObject({ status: 'applied', state: { gauge: 10000 } });
});
