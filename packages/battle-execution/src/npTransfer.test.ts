import { populationInputsHaveEquivalentTerminalDamage } from './populationGaugeEquivalence';
import { describe, expect, it } from 'vitest';
import { applyNpTransfer, npTransferInputSaturation, type NpTransferAmount } from './npTransfer';
import { DEFAULT_NP_RESOURCE_SEMANTICS } from './npResource';
import type { SourceEffect } from './sourceCollection';
import { masterSnapshotSchema, type MasterEffect } from '@fgo-lab/master-data';
import fixture from '../../test-fixtures/master/fixture.json';
import { createPreNoblePhantasmState, reducePreNoblePhantasmAction } from './preNoblePhantasm';
const master = masterSnapshotSchema.parse(fixture);
function setup(donor: NpTransferAmount['donor'] = 'playerNp', cost = 2800, gain = cost) {
  const actor = structuredClone(master.servants[0]!);
  const skill = {
    id: 'transfer-skill',
    name: 'transfer',
    slot: 1 as const,
    resourceRequirement: null,
    detail: '',
    priority: 0,
    imageKey: null,
    effects: [] as MasterEffect[],
  };
  const inputKeys = Array.from({ length: donor === 'playerNp' ? 2 : 3 }, (_, i) => `donor:${i}`);
  const amount: NpTransferAmount = {
    kind: 'npTransfer',
    donor,
    inputKeys,
    costs: [[cost], [], [], [], []],
    values: [[gain], [], [], [], []],
    child: 'unconditionalUnresistedDisjoint',
  };
  const effect: MasterEffect = {
    id: 'transfer',
    occurrenceId: 'transfer',
    label: 'transfer',
    availability: 'allLimitBreakStates',
    inclusionPolicy: { default: 'include' },
    gameActivation: 'skillUse',
    selection: null,
    interaction: null,
    triggerScope: null,
    operationTrigger: null,
    operationReference: null,
    stateIdentity: null,
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
    requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
    proc: { kind: 'guaranteed' },
    execution: [
      {
        kind: 'resourceMutation',
        resource: 'npGauge',
        direction: 'gain',
        unit: 'fixed',
        recipient: 'sourceSelf',
        subjectId: null,
        amount,
      },
    ],
    inputDefinitions: inputKeys.map((key, actorIndex) => ({
      kind: 'transferDonor',
      resource: donor,
      actorIndex,
      key,
      owner: 'field',
      label: 'donor',
      description: 'donor initial amount',
      minimum: 0,
      maximum: 30000,
      step: 1,
      defaultValue: 0,
      defaultReason: 'zero',
    })),
  };
  const source: SourceEffect = {
    effect,
    origin: 'attacker',
    sourceInstanceId: 'self',
    sourceId: actor.id,
    sourceName: actor.name,
    sourceTraits: [],
    skillId: skill.id,
    skillName: skill.name,
    phase: 'attackerSkill',
    valueIndex: 0,
    valueSetIndex: 0,
    limitBreak: false,
    sourceEnabled: true,
    enabledByDefault: true,
    noblePhantasmVariant: null,
    preparationStochasticOutcome: null,
  };
  const args = {
    amount,
    source,
    values: { 'donor:0': 2000, 'donor:1': 10000 },
    prior: [],
    state: { npLevel: 2 as const, gauge: 19000, capacity: 20000 },
    semantics: DEFAULT_NP_RESOURCE_SEMANTICS,
    actionId: 'first',
    valueSetIndex: 0,
  };
  actor.skills = [{ ...skill, effects: [effect] }];
  actor.actorFormGraph.forms[0]!.skillIds = [skill.id];
  return { args, actor, effect };
}
describe('NP transfer snapshot and transactional resource ownership', () => {
  it('separates computed gain, receiver clamp, and actual donor loss; later reads use remaining resource', () => {
    const { args } = setup();
    const result = applyNpTransfer(args);
    expect(result).toMatchObject({
      status: 'applied',
      state: { gauge: 20000 },
      receipt: {
        calculatedGain: 4800,
        receiverGain: 1000,
        donors: [
          { snapshot: 2000, actualLoss: 2000, remaining: 0 },
          { snapshot: 10000, actualLoss: 2800, remaining: 7200 },
        ],
      },
    });
    if (result.status !== 'applied') throw new Error('transfer');
    const next = applyNpTransfer({
      ...args,
      state: result.state,
      prior: [result.receipt],
      actionId: 'second',
    });
    expect(next).toMatchObject({
      receipt: {
        calculatedGain: 2800,
        receiverGain: 0,
        donors: [
          { snapshot: 0, actualLoss: 0 },
          { snapshot: 7200, remaining: 4400 },
        ],
      },
    });
    // Input labels/keys are bindings, not donor actor identities across sources.
    const reboundKeys = ['other-source:0', 'other-source:1'];
    const rebound = applyNpTransfer({
      ...args,
      amount: { ...args.amount, inputKeys: reboundKeys },
      source: {
        ...args.source,
        effect: {
          ...args.source.effect,
          inputDefinitions: args.source.effect.inputDefinitions.map((input, index) => ({
            ...input,
            key: reboundKeys[index]!,
          })),
        },
      },
      values: { 'other-source:0': 2000, 'other-source:1': 10000 },
      state: result.state,
      prior: [result.receipt],
    });
    expect(rebound).toMatchObject({
      status: 'applied',
      receipt: {
        calculatedGain: 2800,
        donors: [
          { actorIndex: 0, snapshot: 0 },
          { actorIndex: 1, snapshot: 7200 },
        ],
      },
    });
    const otherSource = structuredClone(args.source);
    const otherOperation = otherSource.effect.execution[0]!;
    if (otherOperation.kind !== 'resourceMutation') throw new Error('transfer operation');
    otherOperation.amount = { ...args.amount, inputKeys: reboundKeys };
    const saturation = npTransferInputSaturation([args.source, otherSource]);
    expect(saturation.get('donor:0')).toBe(5600);
    expect(saturation.get('other-source:0')).toBe(5600);
    expect(args.values).toEqual({ 'donor:0': 2000, 'donor:1': 10000 });
  });
  it('enemy shortage gives zero NP while the child loses remaining charge', () => {
    const { args } = setup('enemyCharge', 2, 1500);
    expect(
      applyNpTransfer({ ...args, values: { 'donor:0': 1, 'donor:1': 2, 'donor:2': 5 } }),
    ).toMatchObject({
      status: 'applied',
      receipt: {
        calculatedGain: 3000,
        receiverGain: 1000,
        donors: [
          { actualLoss: 1, calculatedGain: 0 },
          { actualLoss: 2, calculatedGain: 1500 },
          { actualLoss: 2, remaining: 3, calculatedGain: 1500 },
        ],
      },
    });
  });
  it('distinguishes malformed identity, unsupported binding and repairable initial quantity', () => {
    const { args } = setup();
    expect(
      applyNpTransfer({ ...args, amount: { ...args.amount, inputKeys: ['donor:0', 'donor:0'] } })
        .status,
    ).toBe('invalid');
    expect(applyNpTransfer({ ...args, source: { ...args.source, origin: 'support' } }).status).toBe(
      'unsupported',
    );
    expect(
      applyNpTransfer({
        ...args,
        source: { ...args.source, effect: { ...args.source.effect, inputDefinitions: [] } },
      }).status,
    ).toBe('unsupported');
    expect(applyNpTransfer({ ...args, values: { 'donor:0': -1 } }).status).toBe('inputRequired');
  });
  it('rolls back the entire skill after a late failure, allows quantity repair, and then consumes terminal NP', () => {
    const { actor, effect } = setup();
    const context = {
      resourceSemantics: DEFAULT_NP_RESOURCE_SEMANTICS,
      npLevel: 2 as const,
      initialGauge: 19000,
      overcharge: 1 as const,
      canonicalInputValues: { 'donor:0': 2000, 'donor:1': 10000 },
    };
    const initial = createPreNoblePhantasmState(
      actor,
      actor.actorFormGraph.initialFormIds[0]!,
      context,
    );
    if (initial.status !== 'applied') throw new Error('initial');
    const command = {
      kind: 'useSkillSlot' as const,
      slot: actor.skills[0]!.slot,
      skillLevel: 1 as const,
      choice: null,
    };
    actor.skills[0]!.effects = [
      effect,
      {
        ...effect,
        occurrenceId: 'bad',
        execution: [
          {
            kind: 'unsupported',
            reason: 'dependentResourceAmount',
            route: {
              target: 'sourceSelf',
              contributionScope: 'personal',
              eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
            },
            damageRelevant: true,
          },
        ],
      },
    ];
    const failed = reducePreNoblePhantasmAction(actor, initial.state, command, context);
    expect(failed.status).toBe('rejected');
    expect(failed.state).toEqual(initial.state);
    actor.skills[0]!.effects = [effect];
    const missing = reducePreNoblePhantasmAction(actor, initial.state, command, {
      ...context,
      canonicalInputValues: { 'donor:0': -1 },
    });
    expect(missing).toMatchObject({ status: 'rejected', code: 'preparationInputRequired' });
    expect(missing.state).toEqual(initial.state);
    const repaired = reducePreNoblePhantasmAction(actor, missing.state, command, context);
    expect(repaired).toMatchObject({
      status: 'applied',
      state: { npResource: { gauge: 20000 }, npTransfers: [{ calculatedGain: 4800 }] },
    });
    if (repaired.status !== 'applied') throw new Error('repair');
    const attack = reducePreNoblePhantasmAction(
      actor,
      repaired.state,
      { kind: 'executeAttackNoblePhantasm' },
      context,
    );
    expect(attack).toMatchObject({
      status: 'applied',
      state: { npResource: { gauge: 0 }, baseOvercharge: 2 },
    });
  });
  it('preserves the full reachable gain vectors and nonmonotone maxima under donor saturation', () => {
    for (const kind of ['playerNp', 'enemyCharge'] as const) {
      const first = setup(kind, 2, kind === 'playerNp' ? 2 : 7).args;
      const second = setup(kind, 3, kind === 'playerNp' ? 3 : 11).args;
      const bounds = npTransferInputSaturation([first.source, second.source]);
      expect([...bounds.values()]).toEqual(Array(kind === 'playerNp' ? 2 : 3).fill(5));
      const full = new Set<string>(),
        reduced = new Set<string>();
      for (let a = 0; a <= 8; a++)
        for (let b = 0; b <= 8; b++) {
          const run = (x: number, y: number) => {
            const values = { 'donor:0': x, 'donor:1': y, 'donor:2': 0 };
            const one = applyNpTransfer({ ...first, values, state: { ...first.state, gauge: 0 } });
            if (one.status !== 'applied') throw new Error('first');
            const two = applyNpTransfer({
              ...second,
              values,
              prior: [one.receipt],
              state: one.state,
            });
            if (two.status !== 'applied') throw new Error('second');
            const oracle = (cost: number, gain: number, value: number) =>
              kind === 'playerNp' ? Math.min(value, cost) : value >= cost ? gain : 0;
            expect(one.receipt.calculatedGain).toBe(oracle(2, 7, x) + oracle(2, 7, y));
            expect(two.receipt.calculatedGain).toBe(
              oracle(3, 11, Math.max(0, x - 2)) + oracle(3, 11, Math.max(0, y - 2)),
            );
            return JSON.stringify([one.receipt.calculatedGain, two.receipt.calculatedGain]);
          };
          full.add(run(a, b));
          reduced.add(run(Math.min(a, 5), Math.min(b, 5)));
        }
      expect(reduced).toEqual(full);
      const score = (key: string) => {
        const [a, b] = JSON.parse(key) as number[];
        return 100 - Math.abs(a! - 3) * 4 - Math.abs(b! - 7) * 2;
      };
      expect(Math.max(...[...reduced].map(score))).toBe(Math.max(...[...full].map(score)));
    }
  });
  it('does not erase donor quantities when OC can differ or an explicit input reader observes them', () => {
    const { args } = setup();
    const context = { semantics: args.semantics, npLevel: 2 as const, initialGauge: 10000 };
    expect(populationInputsHaveEquivalentTerminalDamage([args.source], context)).toBe(true);
    expect(
      populationInputsHaveEquivalentTerminalDamage([args.source], {
        ...context,
        initialGauge: 19000,
      }),
    ).toBe(false);
    const reader = {
      ...args.source,
      effect: {
        ...args.source.effect,
        requirement: {
          recipient: 'sourceSelf' as const,
          expression: {
            kind: 'inputQuantity' as const,
            inputKey: 'donor:0',
            comparison: 'atLeast' as const,
            value: 9000,
          },
        },
      },
    };
    expect(npTransferInputSaturation([reader]).has('donor:0')).toBe(false);
    expect(populationInputsHaveEquivalentTerminalDamage([reader], context)).toBe(false);
  });
  it('keeps known parent failure as a no-op even with unavailable donor input', () => {
    const { actor, effect } = setup();
    actor.skills[0]!.effects = [
      {
        ...effect,
        proc: { kind: 'singleRoll', ratePermille: [[0], [], [], [], []] },
        selection: {
          kind: 'stochasticOutcome',
          group: { kind: 'binary', key: 'parent', defaultOutcome: 'failure' },
        },
      },
    ];
    const context = {
      resourceSemantics: DEFAULT_NP_RESOURCE_SEMANTICS,
      npLevel: 2 as const,
      initialGauge: 19000,
      overcharge: 1 as const,
      canonicalInputValues: { 'donor:0': -1 },
    };
    const initial = createPreNoblePhantasmState(
      actor,
      actor.actorFormGraph.initialFormIds[0]!,
      context,
    );
    if (initial.status !== 'applied') throw new Error('initial');
    const result = reducePreNoblePhantasmAction(
      actor,
      initial.state,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      context,
    );
    expect(result).toMatchObject({ status: 'applied', state: { npResource: { gauge: 19000 } } });
    expect(result.state.npTransfers ?? []).toEqual([]);
  });

  it('allows a proven zero gain for an external receiver, but closes positive gain and earlier opaque charge writes', () => {
    const { args, actor, effect } = setup('enemyCharge', 1, 1500);
    const external = { ...args, source: { ...args.source, origin: 'support' as const } };
    expect(applyNpTransfer({ ...external, values: {} })).toMatchObject({
      status: 'applied',
      receipt: { calculatedGain: 0, receiverGain: 0 },
    });
    expect(applyNpTransfer({ ...external, values: { 'donor:0': 1 } }).status).toBe('unsupported');
    actor.skills[0]!.effects = [
      {
        ...effect,
        occurrenceId: 'opaque-charge',
        inputDefinitions: [],
        execution: [{ kind: 'boundedPhaseIrrelevant', proof: 'enemyChargeOutsideDamage' }],
      },
      effect,
    ];
    const context = {
      resourceSemantics: args.semantics,
      npLevel: 2 as const,
      initialGauge: 19000,
      overcharge: 1 as const,
    };
    const initial = createPreNoblePhantasmState(
      actor,
      actor.actorFormGraph.initialFormIds[0]!,
      context,
    );
    if (initial.status !== 'applied') throw new Error('initial');
    const rejected = reducePreNoblePhantasmAction(
      actor,
      initial.state,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      context,
    );
    expect(rejected.status).toBe('rejected');
    expect(rejected.state).toEqual(initial.state);
  });
  it('rejects stale player donor input after a party NP write and rolls back the action', () => {
    const { args, actor, effect } = setup();
    actor.skills[0]!.effects = [
      {
        ...effect,
        occurrenceId: 'party-gain',
        inputDefinitions: [],
        execution: [
          {
            kind: 'resourceMutation',
            resource: 'npGauge',
            direction: 'gain',
            unit: 'fixed',
            recipient: 'partyMember',
            subjectId: null,
            amount: { kind: 'fixed', values: [[2000], [], [], [], []] },
          },
        ],
      },
      effect,
    ];
    const context = {
      resourceSemantics: args.semantics,
      npLevel: 2 as const,
      initialGauge: 19000,
      overcharge: 1 as const,
      canonicalInputValues: { 'donor:0': 1000 },
    };
    const initial = createPreNoblePhantasmState(
      actor,
      actor.actorFormGraph.initialFormIds[0]!,
      context,
    );
    if (initial.status !== 'applied') throw new Error('initial');
    const rejected = reducePreNoblePhantasmAction(
      actor,
      initial.state,
      { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
      context,
    );
    expect(rejected.status).toBe('rejected');
    expect(rejected.state).toEqual(initial.state);
  });
});
