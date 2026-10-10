import { liveTraitQuantityRead } from '@fgo-lab/battle-execution';
import { projectBattleTraitPresence } from '@fgo-lab/battle-execution';
import { createDefaultCalculatorScenario, createDefaultResolvedScenario } from './scenario';
import { stackEffectTemplate } from './stackQuantityFixture';
import { servantBuildSchema } from '@fgo-lab/schema';
import { calculatorPreparationSkillLevels, commonPreparationSkillLevels } from './rankingBasis';
import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import {
  activeServantSkillSchema,
  masterSnapshotSchema,
  type CanonicalNpResourceSemantics,
} from '@fgo-lab/master-data';
import {
  defaultCalculatorPreNoblePhantasmCandidateForInitialForm,
  preNoblePhantasmSemanticStateKey,
  planPreNoblePhantasmCandidates,
} from './preNoblePhantasmPlanner';
import { getAttackReachableActorFormStates } from './actorFormGraph';

describe('pre-NP planner cache identity', () => {
  it('does not reuse a plan across canonical resource semantics', () => {
    const master = masterSnapshotSchema.parse(fixture);
    const servant = master.servants[0]!;
    const expanded = {
      ...master.npResourceSemantics,
      capacityByNpLevel: [20_000, 20_000, 20_000, 20_000, 30_000],
    } as unknown as CanonicalNpResourceSemantics;

    const canonical = planPreNoblePhantasmCandidates(
      servant,
      master.npResourceSemantics,
      commonPreparationSkillLevels(servant),
      1,
      1,
      10_000,
    );
    const changed = planPreNoblePhantasmCandidates(
      servant,
      expanded,
      commonPreparationSkillLevels(servant),
      1,
      1,
      10_000,
    );

    expect(changed).not.toBe(canonical);
    expect(canonical.candidates[0]?.terminalState.npResource.capacity).toBe(10_000);
    expect(changed.candidates[0]?.terminalState.npResource.capacity).toBe(20_000);
  });

  it('does not reuse a plan across selected NP levels', () => {
    const master = masterSnapshotSchema.parse(fixture);
    const servant = master.servants[0]!;
    const np1 = planPreNoblePhantasmCandidates(
      servant,
      master.npResourceSemantics,
      commonPreparationSkillLevels(servant),
      1,
      1,
    );
    const np2 = planPreNoblePhantasmCandidates(
      servant,
      master.npResourceSemantics,
      commonPreparationSkillLevels(servant),
      2,
      1,
    );

    expect(np2).not.toBe(np1);
    expect(np1.candidates[0]?.terminalState.npResource.npLevel).toBe(1);
    expect(np2.candidates[0]?.terminalState.npResource.npLevel).toBe(2);
  });
});

// Counts are state, even when their boolean presence and action history agree.
it('keeps initial stack counts in preparation and semantic plan identity', async () => {
  const { master, servant, source } = await import('./stackQuantityFixture');
  const one = planPreNoblePhantasmCandidates(
    servant,
    master.npResourceSemantics,
    commonPreparationSkillLevels(servant),
    1,
    1,
    10_000,
    {
      [source.key]: 1,
    },
  );
  const maximum = planPreNoblePhantasmCandidates(
    servant,
    master.npResourceSemantics,
    commonPreparationSkillLevels(servant),
    1,
    1,
    10_000,
    { [source.key]: 4 },
  );
  const a = one.candidates[0]!.terminalState;
  const b = maximum.candidates[0]!.terminalState;
  expect(projectBattleTraitPresence(a, 'attackerState')).toEqual(
    projectBattleTraitPresence(b, 'attackerState'),
  );
  expect(
    liveTraitQuantityRead(b, { scope: 'attackerState', trait: source.quantitySource.trait }).value,
  ).toBe(4);
  expect(preNoblePhantasmSemanticStateKey(a)).not.toBe(preNoblePhantasmSemanticStateKey(b));
});

it('binds saved skill cells before exploring NP legality and separates cached plans', () => {
  const original = masterSnapshotSchema.parse(fixture);
  const source = original.servants[0]!;
  const skill = activeServantSkillSchema.parse({
    id: 'level-dependent-np-loss',
    priority: 0,
    name: 'level-dependent-np-loss',
    detail: '',
    imageKey: null,
    resourceRequirement: null,
    slot: 1,
    effects: [
      {
        ...stackEffectTemplate,
        id: 'level-dependent-loss',
        occurrenceId: 'level-dependent-loss',
        gameActivation: 'skillUse',
        proc: { kind: 'guaranteed' },
        selection: null,
        inputDefinitions: [],
        requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
        execution: [
          {
            kind: 'resourceMutation',
            resource: 'npGauge',
            direction: 'loss',
            unit: 'fixed',
            recipient: 'sourceSelf',
            subjectId: null,
            amount: {
              kind: 'fixed',
              values: [[5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 0], [], [], [], []],
            },
          },
        ],
      },
    ],
  });
  const current = masterSnapshotSchema.parse({
    ...original,
    servants: [
      {
        ...source,
        passives: [],
        skills: [skill],
        actorFormGraph: {
          ...source.actorFormGraph,
          forms: source.actorFormGraph.forms.map((form) => ({ ...form, skillIds: [skill.id] })),
        },
      },
    ],
  });
  const servant = current.servants[0]!;
  const saved = servantBuildSchema.parse({
    servantId: servant.id,
    level: 90,
    ascension: 4,
    npLevel: 1,
    fouAtk: 1234,
    skills: { '1': 1 },
    appends: {},
    updatedAt: '2026-10-04T12:46:59.000Z',
  });
  const high = planPreNoblePhantasmCandidates(
    servant,
    current.npResourceSemantics,
    { '1': 10 },
    1,
    1,
  );
  const low = planPreNoblePhantasmCandidates(
    servant,
    current.npResourceSemantics,
    { '1': 1 },
    1,
    1,
  );
  expect(high).not.toBe(low);
  expect(
    high.candidates.some(({ commands }) => commands.some(({ kind }) => kind === 'useSkillSlot')),
  ).toBe(true);
  expect(
    low.candidates.every(({ commands }) => commands.every(({ kind }) => kind !== 'useSkillSlot')),
  ).toBe(true);
  const initialFormId = servant.actorFormGraph.forms[0]!.id;
  const oc1 = defaultCalculatorPreNoblePhantasmCandidateForInitialForm(
    servant,
    initialFormId,
    current.npResourceSemantics,
    { '1': 1 },
    2,
    1,
    10_000,
  );
  const oc2 = defaultCalculatorPreNoblePhantasmCandidateForInitialForm(
    servant,
    initialFormId,
    current.npResourceSemantics,
    { '1': 1 },
    2,
    2,
    20_000,
  );
  expect(oc1.commands).toEqual([{ kind: 'executeAttackNoblePhantasm' }]);
  expect(oc2.commands).toEqual([
    { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
    { kind: 'executeAttackNoblePhantasm' },
  ]);
  expect(oc2.terminalState.appliedActions.at(-1)?.resourceBefore.gauge).toBe(15_000);
  for (const overcharge of [1, 2] as const) {
    const states = getAttackReachableActorFormStates(
      servant,
      initialFormId,
      current.npResourceSemantics,
      { '1': 1 },
      2,
      overcharge,
    );
    expect(states.some((state) => state.usedSkillSlots.has(1))).toBe(overcharge === 2);
  }
  for (const factory of [createDefaultResolvedScenario, createDefaultCalculatorScenario]) {
    expect(factory(current, saved, servant).preNoblePhantasmPlan).toEqual([
      { kind: 'executeAttackNoblePhantasm' },
    ]);
    expect(
      factory(current, { ...saved, skills: { '1': 10 } }, servant).preNoblePhantasmPlan,
    ).toContainEqual({
      kind: 'useSkillSlot',
      slot: 1,
      skillLevel: 10,
      choice: null,
    });
  }
  expect(() =>
    planPreNoblePhantasmCandidates(servant, current.npResourceSemantics, {}, 1, 1),
  ).toThrow('preparation_skill_levels_incomplete');
  expect(() => calculatorPreparationSkillLevels(servant, { ...saved, skills: {} })).toThrow(
    'rankingBuildIncomplete',
  );
  expect(() => calculatorPreparationSkillLevels(servant, { ...saved, servantId: 'wrong' })).toThrow(
    'rankingBuildIdentityMismatch',
  );
});
