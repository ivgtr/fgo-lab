import { compileRankingExecutionPlan } from './rankingPolicyScenario';
import { evaluateRankingCandidateBatch, type RankingCandidateEvent } from './rankingCandidateBatch';
import {
  DEFAULT_RANKING_POLICY_CONDITIONS,
  type RankingPolicyConditions,
} from './rankingContracts';
import { currentCalculationVersionContext } from './portableCalculation';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { describe, expect, it } from 'vitest';
import {
  PreparationExecutionSession,
  resolveAttackerFormExecution,
  type StochasticSelection,
  type StochasticChoice,
  type PreparationActionExecution,
} from '@fgo-lab/battle-execution';
import { createDefaultResolvedScenario } from './scenario';
import { stackEffectTemplate } from './stackQuantityFixture';
import { APP_VERSION, type PreNoblePhantasmCommand } from '@fgo-lab/schema';

const original = masterSnapshotSchema.parse(fixture);
const actor = original.servants[0]!;
const skills = ([1, 2] as const).map((slot) => ({
  id: `prefix-skill-${slot}`,
  slot,
  priority: 1,
  name: `prefix skill ${slot}`,
  detail: '',
  imageKey: null,
  resourceRequirement: null,
  effects: [
    {
      ...stackEffectTemplate,
      id: `prefix-effect-${slot}`,
      occurrenceId: `prefix-effect-${slot}`,
      gameActivation: 'skillUse',
      proc: { kind: 'guaranteed' },
      selection: null,
      inputDefinitions: [],
      requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
      execution: [
        {
          kind: 'resourceMutation',
          resource: 'npGauge',
          direction: slot === 1 ? 'gain' : 'loss',
          unit: 'fixed',
          recipient: 'sourceSelf',
          subjectId: null,
          amount: { kind: 'fixed', values: [Array(10).fill(1000), [], [], [], []] },
        },
      ],
    },
  ],
}));
const master = masterSnapshotSchema.parse({
  ...original,
  servants: [
    {
      ...actor,
      skills,
      actorFormGraph: {
        ...actor.actorFormGraph,
        forms: actor.actorFormGraph.forms.map((form) => ({
          ...form,
          skillIds: skills.map(({ id }) => id),
        })),
      },
    },
  ],
});
const servant = master.servants[0]!;
const scenario = createDefaultResolvedScenario(master, undefined, servant);
const skill = (slot: 1 | 2, skillLevel = 10): PreNoblePhantasmCommand => ({
  kind: 'useSkillSlot',
  slot,
  skillLevel,
  choice: null,
});
const attack: PreNoblePhantasmCommand = { kind: 'executeAttackNoblePhantasm' };
const policy = {
  kind: 'ranking' as const,
  selfBuffs: 'included' as const,
  conditionalEffects: 'baseline' as const,
  areaView: 'included' as const,
};
const resolve = (
  plan: readonly PreNoblePhantasmCommand[],
  executionSession?: PreparationExecutionSession,
) =>
  resolveAttackerFormExecution(
    { ...scenario, preNoblePhantasmPlan: [...plan] },
    servant,
    master.npResourceSemantics,
    undefined,
    {
      master,
      policy,
      diagnoseRejectedActions: true,
      ...(executionSession ? { executionSession } : {}),
    },
  );

// Guard existing identities, including Map/Set mutation, rather than replacing native receipts.
function freezeReceipt(value: unknown, seen = new WeakSet()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  const rejectWrite = () => {
    throw new TypeError('sealed_preparation_receipt');
  };
  if (value instanceof Map) {
    for (const [key, item] of value) {
      freezeReceipt(key, seen);
      freezeReceipt(item, seen);
    }
    for (const method of ['set', 'delete', 'clear'])
      Object.defineProperty(value, method, { value: rejectWrite });
  } else if (value instanceof Set) {
    for (const item of value) freezeReceipt(item, seen);
    for (const method of ['add', 'delete', 'clear'])
      Object.defineProperty(value, method, { value: rejectWrite });
  } else for (const item of Object.values(value)) freezeReceipt(item, seen);
  Object.freeze(value);
}

describe('request-owned preparation prefixes', () => {
  it('keeps lazy descriptor intent stable and folds from sealed native candidate prefixes', () => {
    const conditions: RankingPolicyConditions = { ...DEFAULT_RANKING_POLICY_CONDITIONS };
    const plan = compileRankingExecutionPlan(servant, master, { servantBuilds: {} }, conditions);
    const before = Array.from(plan.candidateDescriptors);
    conditions.selfBuffs = 'excluded';
    conditions.conditionalEffects = 'satisfied';
    expect(Array.from(plan.candidateDescriptors)).toEqual(before);
    const indices: number[] = [];
    const sealed = new WeakSet();
    const batch = evaluateRankingCandidateBatch(
      plan,
      master,
      {
        ...currentCalculationVersionContext(master),
        appVersion: APP_VERSION,
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
      },
      undefined,
      false,
      (event) => {
        indices.push(event.index);
        if (
          event.prepared.status === 'executable' &&
          event.prepared.orderedScenario?.preparationExecution.kind === 'available'
        )
          freezeReceipt(event.prepared.orderedScenario.preparationExecution.state, sealed);
      },
    );
    expect(indices).toEqual(Array.from({ length: plan.worldCandidateCount }, (_, index) => index));
    expect(batch.candidateInventory.generated).toBe(before.length);
    expect(batch).not.toHaveProperty('executions');
    expect(batch).not.toHaveProperty('preparedCandidates');
  });

  it('owns cached context intent and completed commands independently of caller mutation', () => {
    const session = new PreparationExecutionSession(master);
    const choices = new Map<string, StochasticChoice>([
      ['future', { kind: 'binary', outcome: 'success' }],
    ]);
    const facts = [
      {
        decisionKey: 'intent',
        fact: {
          kind: 'trait' as const,
          scope: 'attackerState' as const,
          trait: 'intent',
          present: false,
        },
      },
    ];
    const root = session.root({
      scenario: { ...scenario, worldFactAssertions: facts },
      attacker: servant,
      resourceSemantics: master.npResourceSemantics,
      initialGauge: 10000,
      options: { master, policy, stochasticSelection: { kind: 'possibility', choices } },
      diagnoseRejectedActions: false,
      observed: false,
    });
    choices.set('future', { kind: 'binary', outcome: 'failure' });
    facts[0]!.fact.present = true;
    expect(root.context.worldFacts?.[0]?.fact).toMatchObject({ present: false });
    expect(root.context.stochasticSelection.kind).toBe('possibility');
    if (root.context.stochasticSelection.kind !== 'possibility') throw new Error('witness');
    expect(root.context.stochasticSelection.choices.get('future')).toEqual({
      kind: 'binary',
      outcome: 'success',
    });
    const command = skill(1);
    const first = resolve([command, attack], session);
    if (command.kind !== 'useSkillSlot') throw new Error('skill');
    command.skillLevel = 1;
    expect(first.actionExecutions?.[0]?.command).toEqual(skill(1));
    const replay = resolve([skill(1), attack], session);
    expect(replay.actionExecutions?.[0]).toBe(first.actionExecutions?.[0]);
    expect(replay).toEqual(resolve([skill(1), attack]));
  });
  it('executes and diagnoses from sealed native prefixes without writing their observations', () => {
    const frozen = new WeakSet();
    const session = new PreparationExecutionSession(master);
    const first = resolve([skill(1), attack], session);
    const receipt = first.actionExecutions![0]!;
    freezeReceipt(first.initializationExecution, frozen);
    freezeReceipt(receipt, frozen);
    const next = resolve([skill(1), skill(2, 9), attack], session);
    expect(next).toEqual(resolve([skill(1), skill(2, 9), attack]));
    expect(next.actionExecutions![0]).toBe(receipt);
    expect(next.actionExecutions![1]!.before).toBe(receipt.state);
    const rejected = resolve([skill(1), skill(1), skill(2), attack], session);
    expect(rejected).toEqual(resolve([skill(1), skill(1), skill(2), attack]));
    expect(rejected.actionExecutions![0]).toBe(receipt);
    expect(rejected.actionExecutions![1]!.before).toBe(receipt.state);
    expect(rejected.actionExecutions![1]!.state).toBe(receipt.state);
    expect(rejected.diagnostic?.transitions.length).toBeGreaterThan(0);
    const seen: PreparationActionExecution[] = [];
    const observed = resolveAttackerFormExecution(
      { ...scenario, preNoblePhantasmPlan: [skill(1), skill(2), attack] },
      servant,
      master.npResourceSemantics,
      undefined,
      {
        master,
        policy,
        executionSession: session,
        observePreparationTransition: (_before, _command, result) => {
          freezeReceipt(result, frozen);
          seen.push(result);
        },
      },
    );
    expect(observed).toEqual(
      resolveAttackerFormExecution(
        { ...scenario, preNoblePhantasmPlan: [skill(1), skill(2), attack] },
        servant,
        master.npResourceSemantics,
        undefined,
        { master, policy },
      ),
    );
    expect(seen).toEqual(observed.actionExecutions);
    const cannotWrite = (native: PreparationActionExecution) => {
      // @ts-expect-error Completed physical state is read-only, including nested resource values.
      native.state.npResource.gauge = 0;
      // @ts-expect-error Completed proof containers have no writer API.
      const writableProofs: Map<unknown, unknown> = native.state.conditionFactProofs.quantities;
      writableProofs.clear();
    };
    expect(() => cannotWrite(receipt)).toThrow(TypeError);
  });

  it('shares completed ordered prefixes and preserves full native receipts and branch isolation', () => {
    const session = new PreparationExecutionSession(master);
    const first = resolve([skill(1), attack], session);
    const second = resolve([skill(1), skill(2), attack], session);
    expect(first).toEqual(resolve([skill(1), attack]));
    expect(second).toEqual(resolve([skill(1), skill(2), attack]));
    expect(session.inventory).toMatchObject({
      initializationCount: 1,
      sharedInitializationCount: 1,
      sharedActionCount: 1,
      branchForkCount: 2,
    });
    expect(first.actionExecutions![0]).toBe(second.actionExecutions![0]);
    expect(first.state).not.toBe(second.state);
    expect(first.state.inputFacts).not.toBe(second.state.inputFacts);
    expect(first.state.conditionFactProofs).not.toBe(second.state.conditionFactProofs);
    expect(first.state.ocState.sourceOutcomes).not.toBe(second.state.ocState.sourceOutcomes);
    (first.state.usedSkillSlots as Set<number>).add(3);
    (first.state.ocState.sourceOutcomes as Map<string, 'success' | 'failure'>).set(
      'caller',
      'failure',
    );
    const replay = resolve([skill(1), attack], session);
    expect(replay).toEqual(resolve([skill(1), attack]));
    expect(replay.state.activeEffects[0]?.effect).toBe(
      servant.skills.find(({ slot }) => slot === 1)?.effects[0],
    );
  });

  it('does not merge levels, command order, equal skill masks or candidate-local diagnostic suffixes', () => {
    const session = new PreparationExecutionSession(master);
    for (const plan of [
      [skill(1, 1), attack],
      [skill(1), attack],
      [skill(1), skill(2), attack],
      [skill(2), skill(1), attack],
      [skill(1), skill(1), attack],
      [skill(1), skill(1), skill(2), attack],
    ])
      expect(resolve(plan, session)).toEqual(resolve(plan));
    const rejected = resolve([skill(1), skill(1), skill(2), attack], session);
    expect(rejected.rejection?.code).toBe('skillSlotReused');
    expect(rejected.diagnostic?.commands).toEqual([skill(2), attack]);
    expect(rejected.actionExecutions!.at(-1)?.committedSources).toEqual([]);
  });

  it('separates complete stochastic choices, BP witnesses and semantically distinct input intent', () => {
    const session = new PreparationExecutionSession(master);
    const selection = (outcome: 'success' | 'failure'): StochasticSelection => ({
      kind: 'possibility',
      choices: new Map([['unread-witness', { kind: 'binary', outcome }]]),
    });
    const contexts = [
      { stochasticSelection: selection('success'), initialBattlePointPoints: {} },
      { stochasticSelection: selection('failure'), initialBattlePointPoints: {} },
      { stochasticSelection: selection('success'), initialBattlePointPoints: { witness: 1 } },
      {
        stochasticSelection: selection('success'),
        initialBattlePointPoints: {},
        initialOvercharge: 2 as const,
      },
    ];
    for (const options of contexts) {
      const input = { ...scenario, preNoblePhantasmPlan: [attack] };
      const baseOptions = { master, policy, ...options };
      const shared = resolveAttackerFormExecution(
        input,
        servant,
        master.npResourceSemantics,
        undefined,
        { ...baseOptions, executionSession: session },
      );
      expect(shared).toEqual(
        resolveAttackerFormExecution(
          input,
          servant,
          master.npResourceSemantics,
          undefined,
          baseOptions,
        ),
      );
    }
    expect(session.inventory.initializationCount).toBe(4);
    const changed = { ...scenario, attackerHpPermille: 500, preNoblePhantasmPlan: [attack] };
    resolveAttackerFormExecution(changed, servant, master.npResourceSemantics, undefined, {
      master,
      policy,
      executionSession: session,
    });
    expect(session.inventory.initializationCount).toBe(5);
  });

  it('rejects an old master session and derives new initialization from the updated snapshot', () => {
    const session = new PreparationExecutionSession(master);
    resolve([attack], session);
    const updated = masterSnapshotSchema.parse({ ...master, version: 'session-update' });
    expect(() =>
      resolveAttackerFormExecution(
        scenario,
        updated.servants[0]!,
        updated.npResourceSemantics,
        undefined,
        { master: updated, executionSession: session },
      ),
    ).toThrow('preparation_session_master_mismatch');
    const next = new PreparationExecutionSession(updated);
    const result = resolveAttackerFormExecution(
      scenario,
      updated.servants[0]!,
      updated.npResourceSemantics,
      undefined,
      { master: updated, executionSession: next },
    );
    expect(result.initializationExecution?.before).not.toBe(
      resolve([attack], session).initializationExecution?.before,
    );
    expect(next.inventory.initializationCount).toBe(1);
  });
});

it('retains a losing Blocking result while a streaming collector releases candidate details', () => {
  const events: RankingCandidateEvent[] = [];
  const plan = compileRankingExecutionPlan(
    servant,
    master,
    { servantBuilds: {} },
    DEFAULT_RANKING_POLICY_CONDITIONS,
  );
  const candidate = Array.from(plan.candidateDescriptors)[0]!;
  const missingLevel = Array.from({ length: 120 }, (_, index) => index + 1).find(
    (level) => servant.atkByLevel[String(level)] === undefined,
  )!;
  const mixed = {
    ...plan,
    candidateDescriptors: [
      candidate,
      {
        ...candidate,
        key: 'losing-invalid',
        scenario: {
          ...candidate.scenario,
          attacker: { ...candidate.scenario.attacker, level: missingLevel },
        },
      },
    ],
  };
  const batch = evaluateRankingCandidateBatch(
    mixed,
    master,
    {
      ...currentCalculationVersionContext(master),
      appVersion: APP_VERSION,
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
    },
    undefined,
    false,
    (event) => events.push(event),
  );
  expect(events.map(({ index }) => index)).toEqual([0, 1]);
  expect(batch.candidateInventory.generated).toBe(2);
  expect(batch).not.toHaveProperty('executions');
  expect(batch).not.toHaveProperty('preparedCandidates');
  expect(batch.selected.size).toBe(1);
  const accumulator = [...batch.accumulators.values()][0]!;
  expect(accumulator.blocking).toBe(true);
  expect(accumulator.result()).toMatchObject({
    status: 'invalid',
    diagnostics: { classes: { invalid: { count: 1 } } },
  });
});

it('keeps the first execution on an exact metric tie while observing both candidates', () => {
  const plan = compileRankingExecutionPlan(
    servant,
    master,
    { servantBuilds: {} },
    DEFAULT_RANKING_POLICY_CONDITIONS,
  );
  const candidate = Array.from(plan.candidateDescriptors)[0]!;
  const events: RankingCandidateEvent[] = [];
  const batch = evaluateRankingCandidateBatch(
    { ...plan, candidateDescriptors: [candidate, candidate] },
    master,
    {
      ...currentCalculationVersionContext(master),
      appVersion: APP_VERSION,
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
    },
    undefined,
    false,
    (event) => events.push(event),
  );
  expect(events.map(({ index }) => index)).toEqual([0, 1]);
  expect(batch.candidateInventory).toEqual({ generated: 2, deduplicated: 1 });
  expect(batch.selected.size).toBe(1);
  expect(batch.selected.values().next().value?.execution).toBe(events[0]!.execution);
  expect(events[0]!.execution).not.toBe(events[1]!.execution);
});
