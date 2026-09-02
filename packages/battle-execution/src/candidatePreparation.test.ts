import { describe, expect, it } from 'vitest';
import type { DamageResolutionInput } from '@fgo-lab/schema';
import type { BattleOperation } from './contracts';
import { resolveOperationActivation } from './activation';
import { resolveStochasticOutcomes } from './stochasticOutcomes';
import { executeOrderedScenarioCandidate } from './candidateExecution';
import type { PreparedOrderedScenario } from './executionTypes';

const source = {
  origin: 'attacker' as const,
  sourceInstanceId: 'attacker:self',
  sourceId: 'servant:1',
  skillId: 'skill:1',
  effectId: 'effect:1',
  effectOccurrenceId: 'effect:1:0',
};
const choice = {
  kind: 'choice' as const,
  source: {
    origin: source.origin,
    sourceInstanceId: source.sourceInstanceId,
    skillId: source.skillId,
  },
  family: 'mode',
  candidate: 'attack',
};
const operation: BattleOperation = {
  operationId: 'operation:attack',
  order: 1,
  phase: 'attackerSkill',
  source,
  contributionScope: 'personal',
  condition: choice,
  decisionKey: 'effect:attack',
  decisionPlan: { activation: 'user', condition: 'userMayAssume' },
  sourceEnabled: true,
  enabledByDefault: false,
  gameActivation: 'skillUse',
  proc: { kind: 'guaranteed' },
  stochasticOutcome: null,
  procRatePermille: 1_000,
  activation: { kind: 'sourceDefault' },
  evidence: { rawPath: 'test', functionId: 'test' },
  presentation: { label: 'attack', sourceName: 'source', skillName: 'skill' },
  inputDefinitions: [],
  kind: 'addModifier',
  modifier: 'attackBuff',
  valuePermille: 500,
  valueExpression: null,
  card: null,
};
const input = {
  attackerId: 'servant:1',
  cardType: 'buster',
  attackBuff: 0,
  cardBuff: 0,
  npDamageBuff: 0,
  powerMod: 0,
  fieldTraits: [],
  attackerStateTraits: [],
  targetStateTraits: [],
  target: { classId: null, attribute: 'unknown', traits: [] },
  damageFunction: { status: 'resolved', kind: 'standard', ignoreDefense: false },
  ignoreDamageCut: false,
} as unknown as DamageResolutionInput;
const noblePhantasmVariant = {
  kind: 'nonAttack' as const,
  canonicalId: 'np:1',
  ref: { actorFormId: 'servant:1', noblePhantasmId: 'np:1' },
  name: 'NP',
  priority: 1,
  effects: [],
};

describe('candidate activation preparation boundary', () => {
  it('fails closed for missing, contradictory, and partially applicable stochastic semantics', () => {
    const probabilistic = {
      ...operation,
      proc: {
        kind: 'singleRoll' as const,
        ratePermille: [[700], [], [], [], []] as [number[], number[], number[], number[], number[]],
      },
    };
    const cases: BattleOperation[] = [
      { ...probabilistic, operationId: 'missing', stochasticOutcome: null },
      {
        ...operation,
        operationId: 'contradictory',
        stochasticOutcome: {
          kind: 'binary',
          key: 'outcome:test',
          defaultOutcome: 'success',
        },
      },
      {
        ...probabilistic,
        operationId: 'partial',
        stochasticOutcome: {
          kind: 'successCount',
          key: 'outcome:test',
          maximumSuccesses: 1,
          defaultOutcome: 'maximum',
        },
      },
    ];
    const resolved = resolveStochasticOutcomes(cases, {
      values: {},
      missingDefinitions: [],
      invalidInputKeys: [],
    });
    expect(
      resolved.issues.map((issue) =>
        issue.kind === 'invalidStochasticOutcome' ? issue.detail : issue.kind,
      ),
    ).toEqual([
      'missingStochasticOutcome',
      'contradictoryStochasticOutcome',
      'partialStochasticOutcome',
    ]);
    expect([...resolved.outcomes.values()].map(({ status }) => status)).toEqual([
      'invalid',
      'invalid',
      'invalid',
    ]);
  });

  it('composes stochastic outcome independently from inclusion and decision identity', () => {
    const probabilistic = {
      ...operation,
      condition: { kind: 'always' as const },
      proc: {
        kind: 'singleRoll' as const,
        ratePermille: [[700], [], [], [], []] as [number[], number[], number[], number[], number[]],
      },
      enabledByDefault: true,
      stochasticOutcome: {
        kind: 'binary' as const,
        key: 'outcome:test',
        defaultOutcome: 'success' as const,
      },
    };
    const operations: BattleOperation[] = [
      { ...probabilistic, operationId: 'success:key', decisionKey: 'effect:success' },
      { ...probabilistic, operationId: 'success:none', decisionKey: null },
      {
        ...probabilistic,
        operationId: 'failure:key',
        decisionKey: 'effect:failure',
        stochasticOutcome: { ...probabilistic.stochasticOutcome, defaultOutcome: 'failure' },
      },
      {
        ...probabilistic,
        operationId: 'failure:none',
        decisionKey: null,
        stochasticOutcome: { ...probabilistic.stochasticOutcome, defaultOutcome: 'failure' },
      },
      { ...probabilistic, operationId: 'disabled:key', decisionKey: 'effect:disabled' },
      {
        ...probabilistic,
        operationId: 'invalid:none',
        decisionKey: null,
        stochasticOutcome: null,
      },
    ];
    const decisions = new Map([
      [
        'effect:disabled',
        {
          decisionKey: 'effect:disabled',
          operationEnabled: false,
          conditionSatisfaction: 'evaluate' as const,
        },
      ],
    ]);
    const stochastic = resolveStochasticOutcomes(operations, {
      values: {},
      missingDefinitions: [],
      invalidInputKeys: [],
    });
    expect(
      operations.map((candidate) => ({
        operationId: candidate.operationId,
        stochastic: stochastic.outcomes.get(candidate.operationId)?.status,
        enabled: resolveOperationActivation(candidate, decisions, stochastic.outcomes).enabled,
      })),
    ).toEqual([
      { operationId: 'success:key', stochastic: 'success', enabled: true },
      { operationId: 'success:none', stochastic: 'success', enabled: true },
      { operationId: 'failure:key', stochastic: 'failure', enabled: false },
      { operationId: 'failure:none', stochastic: 'failure', enabled: false },
      { operationId: 'disabled:key', stochastic: 'success', enabled: false },
      { operationId: 'invalid:none', stochastic: 'invalid', enabled: false },
    ]);
  });

  it('applies exactly the resolved number of success-count members with or without decisions', () => {
    const definition = {
      kind: 'procSuccessCount' as const,
      key: 'outcome:count',
      owner: 'source' as const,
      label: 'successes',
      description: 'successes',
      minimum: 0,
      maximum: 3,
      step: 1,
      defaultValue: 3,
      defaultReason: 'test',
    };
    const operations: BattleOperation[] = Array.from({ length: 3 }, (_, index) => ({
      ...operation,
      operationId: `count:${String(index)}`,
      condition: { kind: 'always' as const },
      decisionKey: index === 1 ? 'effect:count' : null,
      enabledByDefault: true,
      proc: {
        kind: 'chainedRolls' as const,
        ratePermille: [[700], [], [], [], []] as [number[], number[], number[], number[], number[]],
        seriesKey: 'outcome:count',
        index,
        maximumSuccesses: 3,
      },
      stochasticOutcome: {
        kind: 'successCount' as const,
        key: 'outcome:count',
        maximumSuccesses: 3,
        defaultOutcome: 'maximum' as const,
      },
      inputDefinitions: [definition],
    }));
    const decisions = new Map([
      [
        'effect:count',
        {
          decisionKey: 'effect:count',
          operationEnabled: true,
          conditionSatisfaction: 'evaluate' as const,
        },
      ],
    ]);
    const enabledMembers = (successes: number) => {
      const stochastic = resolveStochasticOutcomes(operations, {
        values: { 'outcome:count': successes },
        missingDefinitions: [],
        invalidInputKeys: [],
      });
      return operations.map(
        (candidate) =>
          resolveOperationActivation(candidate, decisions, stochastic.outcomes).enabled,
      );
    };
    expect(enabledMembers(0)).toEqual([false, false, false]);
    expect(enabledMembers(2)).toEqual([true, true, false]);
    const missing = resolveStochasticOutcomes(operations, {
      values: {},
      missingDefinitions: [{ ...definition, defaultValue: null, defaultReason: null }],
      invalidInputKeys: [],
    });
    expect([...missing.outcomes.values()].map(({ status }) => status)).toEqual([
      'inputRequired',
      'inputRequired',
      'inputRequired',
    ]);
    expect(missing.issues).toEqual([]);
    expect(resolveOperationActivation(operations[0]!, decisions, missing.outcomes)).toMatchObject({
      enabled: false,
      enabledBeforeStochasticOutcome: true,
    });
  });

  it('does not apply an invalid stochastic operation without a decision key', () => {
    const invalidOperation: BattleOperation = {
      ...operation,
      condition: { kind: 'always' },
      decisionKey: null,
      decisionPlan: { activation: 'automatic', condition: 'evaluate' },
      enabledByDefault: true,
      proc: {
        kind: 'singleRoll',
        ratePermille: [[700], [], [], [], []],
      },
      stochasticOutcome: null,
    };
    const prepared = {
      baseInput: input,
      scenario: { effectDecisions: [], activationFacts: [], worldFactAssertions: [] },
      attackerTraits: [],
      baseNoblePhantasmVariant: noblePhantasmVariant,
      noblePhantasmVariants: [noblePhantasmVariant],
      attackerPredicates: [],
      operations: [invalidOperation],
      compileProjections: [],
      sourceIssues: [],
      targetResolution: { kind: 'candidates', candidates: [] },
      targetDomain: { classIdentities: [], attributeIdentities: [], families: [] },
      attackerClass: 'saber',
      attackerAttribute: 'earth',
      inputDefinitions: [],
    } as unknown as PreparedOrderedScenario;
    const result = executeOrderedScenarioCandidate(
      prepared,
      { values: {}, missingDefinitions: [], invalidInputKeys: [] },
      null,
      {
        kind: 'ranking',
        selfBuffs: 'excluded',
        conditionalEffects: 'baseline',
        areaView: 'included',
      },
    );
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]?.operation.operationId).toBe('operation:attack');
    expect(result.operations[0]?.outcome).toBe('notApplied');
    expect(result.state.modifiers).toEqual([]);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          kind: 'invalidStochasticOutcome',
          operationId: 'operation:attack',
          detail: 'missingStochasticOutcome',
        },
      ]),
    );
  });

  it('returns a fail-closed result without running operations or mutating base state', () => {
    const effectDecisions = [
      {
        decisionKey: 'effect:attack',
        operationEnabled: true,
        conditionSatisfaction: 'evaluate' as const,
      },
    ];
    const prepared = {
      baseInput: input,
      scenario: {
        effectDecisions,
        activationFacts: [],
      },
      attackerTraits: [],
      baseNoblePhantasmVariant: noblePhantasmVariant,
      noblePhantasmVariants: [noblePhantasmVariant],
      attackerPredicates: [],
      operations: [operation],
      compileProjections: [],
      sourceIssues: [],
      targetResolution: { kind: 'candidates', candidates: [] },
      targetDomain: { classIdentities: [], attributeIdentities: [], families: [] },
      attackerClass: 'saber',
      attackerAttribute: 'earth',
      inputDefinitions: [],
    } as unknown as PreparedOrderedScenario;

    const result = executeOrderedScenarioCandidate(
      prepared,
      { values: {}, missingDefinitions: [], invalidInputKeys: [] },
      null,
    );

    expect(result.input).toBe(input);
    expect(result.operations).toEqual([]);
    expect(result.state.activationContext).toBeNull();
    expect(result.state.modifiers).toEqual([]);
    expect(result.state.evidence).toEqual([]);
    expect(result.state.card).toBe('buster');
    expect(result.issues).toEqual([
      {
        kind: 'invalidActivationContext',
        detail: 'missingRequiredFact',
        operationId: 'operation:attack',
      },
    ]);
    expect(effectDecisions).toEqual([
      {
        decisionKey: 'effect:attack',
        operationEnabled: true,
        conditionSatisfaction: 'evaluate',
      },
    ]);
  });
});
