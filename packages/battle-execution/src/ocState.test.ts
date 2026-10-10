import { describe, expect, it } from 'vitest';
import type { OcExecutionOperation } from '@fgo-lab/master-data';
import { createOcState, executeOcAction, type OcActionStep, type OcState } from './ocState';
const route = {
  target: 'sourceSelf',
  contributionScope: 'personal',
  eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
} as const;
const common = {
  route,
  lifetime: 'active',
  stacking: 'additive',
  stateTraits: ['positive'],
} as const;
const cell = {
  applicationRatePermille: 1000,
  turns: { kind: 'finite', remaining: 3 },
  uses: { kind: 'finite', remaining: 1 },
} as const;
function boost(
  stages = 2,
  count = 1,
  applicationRate = 1000,
): Extract<OcExecutionOperation, { kind: 'grantOcBoost' }> {
  return {
    ...common,
    stateTraits: ['positive'],
    kind: 'grantOcBoost',
    cells: [
      [
        {
          ...cell,
          stages,
          applicationRatePermille: applicationRate,
          uses: { kind: 'finite', remaining: count },
        },
      ],
      [],
      [],
      [],
      [],
    ],
  };
}
function rate(
  hpDependent = true,
): Extract<OcExecutionOperation, { kind: 'grantOcApplicationRate' }> {
  return {
    ...common,
    stateTraits: ['positive'],
    kind: 'grantOcApplicationRate',
    role: 'casterGrant',
    sign: 1,
    selector: 'positive',
    cells: [
      [
        {
          ...cell,
          amount: hpDependent
            ? { kind: 'inverseHpLinear', basePermille: 0, bonusAtZeroHpPermille: 400 }
            : { kind: 'fixed', value: 200 },
        },
      ],
      [],
      [],
      [],
      [],
    ],
  };
}
function grant(
  op: Extract<OcExecutionOperation, { kind: 'grantOcBoost' | 'grantOcApplicationRate' }>,
  sourceKey = 'source',
  actor = 'attacker',
): Extract<OcActionStep, { kind: 'grant' }> {
  return {
    kind: 'grant',
    grant: op,
    sourceKey,
    sourceEvidence: {
      source: {
        origin: 'attacker',
        sourceInstanceId: actor,
        sourceId: actor,
        skillId: sourceKey,
        effectId: sourceKey,
        effectOccurrenceId: sourceKey,
      },
      sourceName: actor,
      skillName: sourceKey,
      label: 'OC',
    },
    caster: actor,
    recipient: actor,
    valueSetIndex: 0,
    valueIndex: 0,
    limitBreak: false,
    binding: {
      activation: {
        kind: 'read',
        read: {
          kind: 'known',
          truth: true,
          certainty: 'guaranteed',
          evidence: [],
          support: [],
          clock: {
            phase: 'sourceUse',
            actorFormId: { actorId: actor, limitCount: 0 },
            actor,
            actionId: sourceKey,
            operationId: null,
            sourceInstanceId: actor,
            occurrenceId: sourceKey,
            valueSetIndex: 0,
            valueIndex: 0,
          },
        },
        proc: {
          kind: 'resolved',
          outcome: 'success',
          certainty: 'guaranteed',
          ratePermille: 1000,
          selection: 'declared',
        },
      },
      policy: { kind: 'calculator' },
      executionIntent: 'declared',
      gameActivation: 'skillUse',
      contributionScope: 'personal',
    },
    condition: true,
  };
}
const np: OcActionStep = { kind: 'npUse', actor: 'attacker', gaugeBefore: 30000, baseOc: 3 };

it('rejects a gauge/OC mismatch without consuming a boost', () => {
  const prior = createOcState();
  const result = executeOcAction(
    prior,
    'bad-use',
    [grant(boost()), { kind: 'npUse', actor: 'attacker', gaugeBefore: 10000, baseOc: 3 }],
    {},
  );
  expect(result).toMatchObject({
    status: 'invalid',
    reason: 'invalidNpOcUse',
    state: prior,
    outcomes: [],
  });
  expect(result.state).toBe(prior);
});
function committed(
  steps: OcActionStep[],
  prior = createOcState(),
  hp: Record<string, number | null> = { attacker: 500 },
): OcState {
  const result = executeOcAction(prior, `action:${prior.committedActions.size}`, steps, hp);
  expect(result.status).toBe('committed');
  return result.state;
}
const remove: OcActionStep = {
  kind: 'remove',
  recipient: 'attacker',
  selector: ['positive'],
  applicationRate: 1000,
};
describe('OC action transactions', () => {
  it('rolls back source OC writes, receipts, identity and finite rate uses together', () => {
    const prior = committed([grant(rate(false), 'rate')]);
    const result = executeOcAction(
      prior,
      'source-rollback',
      [
        { kind: 'beginSource', sourceKey: 'mixed', outcome: 'notApplicable' },
        grant(boost(2, 1, 800), 'first'),
        np,
        { ...grant(boost(1, 1, 500), 'failure'), procWitness: 0 },
        { kind: 'recordSource', sourceKey: 'mixed' },
        { kind: 'finishSource', sourceKey: 'mixed', commit: false, outcome: 'notApplicable' },
      ],
      { attacker: 500 },
    );
    expect(result.status).toBe('committed');
    expect(result.outcomes).toContainEqual({
      step: 3,
      outcome: 'stochasticFailure',
      effectiveRate: 700,
    });
    expect(result.state.boosts).toEqual([]);
    expect(result.state.receipts).toEqual([]);
    expect(result.state.rates).toEqual(prior.rates);
    expect(result.state.nextInstanceId).toBe(prior.nextInstanceId);
    expect(result.state.constantSources).toEqual(prior.constantSources);
    expect(result.state.executedSources.has('mixed')).toBe(true);
    expect(prior.rates[0]?.uses).toEqual({ kind: 'finite', remaining: 1 });
  });

  it('rejects an unclosed source transaction without committing any state', () => {
    const prior = createOcState();
    const result = executeOcAction(
      prior,
      'unclosed',
      [{ kind: 'beginSource', sourceKey: 'mixed', outcome: 'notApplicable' }, grant(boost())],
      {},
    );
    expect(result).toMatchObject({
      status: 'invalid',
      reason: 'unclosedOcSourceTransaction',
      outcomes: [],
    });
    expect(result.state).toBe(prior);
  });
  it('rejects replay of a committed action without granting or consuming twice', () => {
    const first = executeOcAction(createOcState(), 'command', [grant(boost()), np], {});
    expect(first.status).toBe('committed');
    const replay = executeOcAction(first.state, 'command', [grant(boost()), np], {});
    expect(replay).toMatchObject({ status: 'invalid', reason: 'ocActionAlreadyCommitted' });
    expect(replay.state).toBe(first.state);
    expect(first.state.boosts).toHaveLength(1);
    expect(first.state.receipts).toHaveLength(1);
  });
  it('consumes all participating instances even at cap5', () => {
    const state = committed([grant(boost(), 'a'), grant(boost(), 'b'), np]);
    expect(state.receipts[0]).toMatchObject({
      baseOc: 3,
      boostTotal: 4,
      effectiveOc: 5,
      participatingInstances: [1, 2],
    });
    expect(state.boosts.map((x) => x.uses)).toEqual([
      { kind: 'finite', remaining: 0 },
      { kind: 'finite', remaining: 0 },
    ]);
  });
  it('freezes NP OC before functions and leaves new grants unused', () => {
    const state = committed([np, grant(boost())]);
    expect(state.receipts[0]!.effectiveOc).toBe(3);
    expect(state.boosts[0]!.uses).toEqual({ kind: 'finite', remaining: 1 });
  });
  it('does not change a frozen receipt on NP-before removal', () => {
    const state = committed([grant(boost()), np, remove]);
    expect(state.receipts[0]!.effectiveOc).toBe(5);
    expect(state.boosts).toHaveLength(0);
  });
  it('rejects live unrepresented removal resistance but preserves a frozen terminal receipt', () => {
    const prior = committed([grant(boost()), { kind: 'removalResistance', actor: 'attacker' }]);
    const live = executeOcAction(prior, 'live', [remove, np], {});
    expect(live).toMatchObject({
      status: 'unsupported',
      reason: 'liveOcRemovalResistance',
      state: prior,
      outcomes: [],
    });
    const terminal = executeOcAction(
      prior,
      'terminal',
      [np, remove],
      {},
      { hasFutureNpUse: false },
    );
    expect(terminal.status).toBe('committed');
    expect(terminal.state.receipts.at(-1)?.effectiveOc).toBe(5);
    expect(prior.receipts).toHaveLength(0);
    const noIntersection = executeOcAction(
      prior,
      'nonintersection',
      [{ ...remove, selector: ['negative'] }, np],
      {},
    );
    expect(noIntersection.status).toBe('committed');
  });
  it('does not permit two NP receipts in one action', () => {
    const prior = committed([grant(boost())]);
    expect(executeOcAction(prior, 'twice', [np, np], {})).toMatchObject({
      status: 'invalid',
      state: prior,
      outcomes: [],
    });
  });
  it('does not replenish a constant source or remove it', () => {
    const operation = { ...boost(2, 3), lifetime: 'constant' as const };
    const first = committed([grant(operation), np, remove]);
    const second = committed([grant(operation), np], first);
    expect(second.boosts).toHaveLength(1);
    expect(second.boosts[0]!.uses).toEqual({ kind: 'finite', remaining: 1 });
  });
  it.each(['invalid', 'inputRequired', 'unsupported'] as const)(
    'rolls back instance/count/receipt on %s sibling',
    (status) => {
      const prior = committed([grant(boost())]);
      const result = executeOcAction(
        prior,
        'failed',
        [np, { kind: 'reject', status, reason: 'sibling' }],
        {},
      );
      expect(result.status).toBe(status);
      expect(result.state).toBe(prior);
      expect(result.outcomes).toEqual([]);
      expect(committed([np], prior).receipts[0]!.effectiveOc).toBe(5);
    },
  );
  it('keeps raw rates1000 and5000 distinct under resistance1000', () => {
    const resistance = {
      ...rate(false),
      role: 'recipientResistance' as const,
      cells: [
        [
          {
            ...cell,
            amount: { kind: 'fixed' as const, value: 1000 },
            uses: { kind: 'unlimited' as const },
          },
        ],
        [],
        [],
        [],
        [],
      ] as ReturnType<typeof rate>['cells'],
    };
    const initial = committed([grant(resistance, 'resistance')]);
    expect(committed([grant(boost(), 'failed')], initial).boosts).toHaveLength(0);
    expect(committed([grant(boost(2, 1, 5000), 'success')], initial).boosts).toHaveLength(1);
  });
  it('keeps stochastic failure committed and consumes a queried rate state', () => {
    const resistance = { ...rate(false), role: 'recipientResistance' as const };
    const prior = committed([grant(resistance)]);
    const step = { ...grant(boost(), 'oc'), procWitness: 0 as const };
    const result = executeOcAction(prior, 'grant', [step], { attacker: 500 });
    expect(result).toMatchObject({
      status: 'committed',
      outcomes: [{ outcome: 'stochasticFailure', effectiveRate: 800 }],
    });
    expect(result.state.rates[0]!.uses).toEqual({ kind: 'finite', remaining: 0 });
  });
  it('consumes policy-excluded physical rate instances without reading excluded HP values', () => {
    const excluded = grant(rate());
    excluded.binding = {
      ...excluded.binding,
      policy: {
        kind: 'ranking',
        selfBuffs: 'excluded',
        conditionalEffects: 'baseline',
        areaView: 'included',
      },
    };
    const prior = committed([excluded]);
    const result = executeOcAction(prior, 'query', [grant(boost(), 'oc')], {});
    expect(result).toMatchObject({
      status: 'committed',
      state: { rates: [{ uses: { kind: 'finite', remaining: 0 } }] },
    });
    expect(result.state.boosts).toHaveLength(1);
  });
});
describe('HP → live rate query → OC grant dependency', () => {
  it('evaluates unchanged HP at use, not at rate grant', () => {
    const resistance = {
      ...rate(false),
      role: 'recipientResistance' as const,
      lifetime: 'constant' as const,
    };
    resistance.cells[0][0]!.uses = { kind: 'unlimited' };
    const hpRate = rate();
    hpRate.cells[0][0]!.applicationRatePermille = 5000;
    const prior = committed([grant(resistance, 'resistance'), grant(hpRate, 'hp-rate')]);
    const atHalfHp = executeOcAction(prior, 'grant', [grant(boost(), 'oc')], { attacker: 500 });
    expect(atHalfHp).toMatchObject({ status: 'committed', outcomes: [{ effectiveRate: 1000 }] });
    const atFullHp = executeOcAction(prior, 'grant', [grant(boost(), 'oc')], { attacker: 1000 });
    expect(atFullHp.status).toBe('inputRequired');
    const witnessed = executeOcAction(
      prior,
      'grant',
      [{ ...grant(boost(), 'oc'), procWitness: 0 }],
      { attacker: 1000 },
    );
    expect(witnessed).toMatchObject({
      status: 'committed',
      outcomes: [{ outcome: 'stochasticFailure', effectiveRate: 800 }],
    });
  });
  it('reads the current HP query at each grant and keeps missing owners unresolved', () => {
    let hp = 500;
    const result = executeOcAction(
      createOcState(),
      'live',
      [
        grant(rate()),
        () => {
          hp = 1000;
          return { kind: 'skip', outcome: 'notApplicable' };
        },
        grant(boost(), 'oc'),
      ],
      {
        get attacker() {
          return hp;
        },
      },
    );
    expect(result.status).toBe('committed');
  });
  it('separates source HP and requests missing HP rather than defaulting', () => {
    const prior = committed([grant(rate(), 'other-rate', 'other')]);
    const read = grant(boost(), 'other-oc', 'other');
    expect(executeOcAction(prior, 'read', [read], { attacker: 500 }).status).toBe('inputRequired');
    const changed = prior;
    expect(executeOcAction(changed, 'read', [read], { other: 500 }).status).toBe('committed');
  });
});
