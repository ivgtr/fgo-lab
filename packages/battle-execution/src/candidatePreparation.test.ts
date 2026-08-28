import { describe, expect, it } from 'vitest';
import type { DamageResolutionInput } from '@fgo-lab/schema';
import type { BattleOperation } from './contracts';
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
  procSelection: { kind: 'effectInclusion' },
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

describe('candidate activation preparation boundary', () => {
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
