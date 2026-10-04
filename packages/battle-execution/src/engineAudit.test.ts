import { emptyConditionFactProofs } from './conditionRead';
import { describe, expect, it } from 'vitest';
import type { DamageResolutionInput } from '@fgo-lab/schema';
import type { AttackNoblePhantasmVariant } from '@fgo-lab/master-data';
import type { BattleOperation } from './contracts';
import type { PreparedOrderedScenario, ResolvedCanonicalInputSet } from './executionTypes';
import type { TargetCandidate } from './targetContext';
import { executeOrderedScenario, executeOrderedScenarioWithAuditObservation } from './index';
import { executeOrderedScenarioCandidatesWithAudit } from './candidateExecution';
import { assembleComparedAuditObservation } from './executionAuditObservation';
import { compareCandidateResults } from './candidateComparison';
import { prepareCandidateExecution } from './candidatePreparation';
import { validateCandidateSelections } from './candidateSelectionValidation';
import { resolveCandidateSelections } from './candidateSelection';
import { hpCandidateObservationFor } from './hpExecutionObservation';

const operation: BattleOperation = {
  operationId: 'operation:attack',
  order: 1,
  phase: 'attackerSkill',
  source: {
    origin: 'attacker',
    sourceInstanceId: 'attacker:self',
    sourceId: 'attacker',
    skillId: 'skill',
    effectId: 'effect',
    effectOccurrenceId: 'effect:0',
    transactionGroupId: 'group',
  },
  contributionScope: 'personal',
  condition: { kind: 'always' },
  decisionKey: null,
  decisionPlan: { activation: 'automatic', condition: 'evaluate' },
  sourceEnabled: true,
  enabledByDefault: true,
  gameActivation: 'skillUse',
  proc: { kind: 'guaranteed' },
  stochasticOutcome: null,
  sourceActivation: { kind: 'unread' as const },
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
const input: DamageResolutionInput = {
  attackerId: 'attacker',
  attackerLevel: 90,
  attackerAtk: 10_000,
  fouAtk: 1_000,
  craftEssenceId: null,
  craftEssenceAtk: 0,
  npLevel: 1,
  overcharge: 1,
  cardType: 'buster',
  classAttackRate: 1,
  classAffinity: 1,
  attributeAffinity: 1,
  attackBuff: 0,
  cardBuff: 0,
  npDamageBuff: 0,
  powerMod: 0,
  npSpecialMultipliers: [1, 1, 1, 1, 1],
  npMultipliers: [1, 1, 1, 1, 1],
  damageFunction: { status: 'resolved', kind: 'standard', ignoreDefense: false },
  defenseBuff: 0,
  cardResistance: 0,
  npResistance: 0,
  eventDamageBuff: 0,
  specialDamageBuff: 0,
  specialResistance: 0,
  flatDamage: 0,
  damageCut: 0,
  ignoreDamageCut: false,
  attackerHpPermille: 1_000,
  targetRarity: null,
  targetStateTraits: [],
  battlePointPhase: null,
  fieldTraits: [],
  attackerStateTraits: [],
  target: { classId: 'saber', attribute: 'earth', traits: [] },
};

const variant: AttackNoblePhantasmVariant = {
  kind: 'attack',
  canonicalId: 'np',
  ref: { actorFormId: { actorId: 'attacker', limitCount: 0 }, noblePhantasmId: 'np' },
  name: 'NP',
  priority: 1,
  effects: [],
  card: 'buster',
  targetScope: 'all',
  damage: [],
};
const target: TargetCandidate = { classId: 'saber', attribute: 'earth', families: [], facts: [] };
const inputs: ResolvedCanonicalInputSet = {
  values: {},
  missingDefinitions: [],
  invalidInputKeys: [],
};
function prepared(operations: readonly BattleOperation[] = [operation]): PreparedOrderedScenario {
  return {
    baseInput: input,
    scenario: {
      effectDecisions: [],
      activationFacts: [],
      worldFactAssertions: [],
      targetContext: {
        class: { kind: 'concrete', classId: 'saber' },
        attribute: { kind: 'concrete', attribute: 'earth' },
        families: [],
      },
    },
    attackerTraits: [],
    attackerPredicates: [],
    baseNoblePhantasmVariant: variant,
    noblePhantasmVariants: [variant],
    operations,
    compileProjections: [],
    sourceIssues: [],
    targetResolution: { kind: 'candidates', candidates: [target] },
    targetDomain: { classIdentities: [], attributeIdentities: [], families: [] },
    battlePointDomains: [],
    attackerClass: 'saber',
    attackerAttribute: 'earth',
    inputDefinitions: [],
    preparationConditionProofs: { kind: 'available', writeProofs: emptyConditionFactProofs() },
  } as unknown as PreparedOrderedScenario;
}

describe('public ordered execution audit parity', () => {
  it('commits a trait write and its fact layer through the public candidate executor', () => {
    const write: BattleOperation = {
      ...operation,
      operationId: 'create-trait',
      kind: 'addTrait',
      scope: 'attackerState',
      trait: 'created',
    };
    const executed = executeOrderedScenario(prepared([write]), inputs);
    expect(executed.state.traits.attackerState.get('created')).toBe(true);
    expect(executed.state.traitFactLayers.writes.attackerState.get('created')).toMatchObject({
      present: true,
      count: 1,
      proof: { kind: 'guaranteedWrite', clock: { operationId: 'create-trait' } },
    });
  });

  it('observes the actual selected candidate and operation sequence without changing result', () => {
    const plan = prepared();
    const audited = executeOrderedScenarioWithAuditObservation(plan, inputs);
    expect(audited.execution).toEqual(executeOrderedScenario(plan, inputs));
    expect(audited.observation.selection).toBe('selected');
    if (audited.observation.selection !== 'selected') throw new Error('selected required');
    expect(audited.observation.targetCandidate).toBe(target);
    expect(audited.observation.candidateIndex).toBe(0);
    expect(audited.observation.operationEvents).toMatchObject([
      { sequence: 0, operationId: operation.operationId, operationOutcome: 'applied' },
    ]);
    expect(audited.observation.candidateState?.executionGroups[0]?.operationIds).toEqual([
      operation.operationId,
    ]);
  });

  it.each(['impossible', 'unsupported'] as const)(
    'retains %s target resolution and result',
    (kind) => {
      const plan = prepared();
      plan.targetResolution =
        kind === 'impossible'
          ? { kind, sourceKeys: ['target'] }
          : { kind, reason: 'targetSearchLimit', sourceKeys: ['target'] };
      const audited = executeOrderedScenarioWithAuditObservation(plan, inputs);
      expect(audited.execution).toEqual(executeOrderedScenario(plan, inputs));
      expect(audited.observation).toMatchObject({
        selection: 'unresolved',
        targetResolution: plan.targetResolution,
      });
    },
  );

  it('keeps ambiguous executions, identities and state traces in candidate order', () => {
    const plan = prepared();
    const other: TargetCandidate = { ...target, classId: 'lancer' };
    plan.targetResolution = { kind: 'candidates', candidates: [target, other] };
    const audited = executeOrderedScenarioWithAuditObservation(plan, inputs);
    expect(audited.execution).toEqual(executeOrderedScenario(plan, inputs));
    expect(audited.execution.precision).toBe('inputRequired');
    if (audited.observation.selection !== 'ambiguous') throw new Error('ambiguous required');
    expect(audited.observation.candidates.map(({ candidateIndex }) => candidateIndex)).toEqual([
      0, 1,
    ]);
    expect(audited.observation.candidates[0]?.targetCandidate).toBe(target);
    expect(audited.observation.candidates[1]?.targetCandidate).toBe(other);
    for (const candidate of audited.observation.candidates) {
      expect(candidate.operationEvents[0]?.operationId).toBe(operation.operationId);
      expect(candidate.candidateState?.executionGroups[0]?.operationIds).toEqual([
        operation.operationId,
      ]);
    }
  });

  it('fails closed for an empty candidate set and missing selected or ambiguous identities', () => {
    const plan = prepared();
    const audited = executeOrderedScenarioCandidatesWithAudit(plan, inputs);
    const executions = audited.map(({ execution }) => execution);
    plan.targetResolution = { kind: 'candidates', candidates: [] };
    expect(() => executeOrderedScenarioWithAuditObservation(plan, inputs)).toThrow(
      'target_candidate_execution_missing',
    );
    expect(() =>
      assembleComparedAuditObservation(
        plan,
        audited,
        executions,
        compareCandidateResults(executions),
      ),
    ).toThrow('selected_target_candidate_identity_missing');
    expect(() =>
      assembleComparedAuditObservation(plan, audited, executions, {
        kind: 'ambiguous',
        executions,
      }),
    ).toThrow('ambiguous_target_candidate_identity_missing');
    plan.targetResolution = { kind: 'candidates', candidates: [target] };
    expect(() =>
      assembleComparedAuditObservation(plan, audited, executions, {
        kind: 'equivalent',
        execution: { ...executions[0]! },
      }),
    ).toThrow('selected_target_candidate_identity_missing');
    expect(() =>
      assembleComparedAuditObservation(plan, audited, executions, {
        kind: 'ambiguous',
        executions: [{ ...executions[0]! }],
      }),
    ).toThrow('ambiguous_target_candidate_identity_missing');
  });

  it('rolls back a partially attempted transaction and keeps recovery order with audit parity', () => {
    const hpOperation: BattleOperation = {
      ...operation,
      valueExpression: {
        kind: 'inverseHpLinear',
        basePermille: 100,
        bonusAtZeroHpPermille: 300,
        quantitySource: { kind: 'attackerHpPermille' },
      },
    };
    const missing: BattleOperation = {
      ...operation,
      operationId: 'missing',
      order: 2,
      condition: { kind: 'inputQuantity', inputKey: 'missing', comparison: 'atLeast', value: 1 },
    };
    const recovery: BattleOperation = {
      ...operation,
      operationId: 'recovery',
      order: 3,
      source: { ...operation.source, transactionGroupId: 'recovery' },
    };
    const plan = prepared([hpOperation, missing, recovery]);
    const audited = executeOrderedScenarioWithAuditObservation(plan, inputs);
    expect(audited.execution).toEqual(executeOrderedScenario(plan, inputs));
    expect(audited.execution.operations.map(({ outcome }) => outcome)).toEqual([
      'unsupported',
      'unsupported',
      'applied',
    ]);
    expect(audited.execution.state.modifiers).toHaveLength(1);
    if (audited.observation.selection !== 'selected') throw new Error('selected required');
    expect(audited.observation.candidateState?.executionGroups).toMatchObject([
      {
        outcome: 'rolledBack',
        operationIds: [operation.operationId, 'missing'],
        rollbackProof: { battleStateRestored: true, damageInputRestored: true },
      },
      { outcome: 'committed', operationIds: ['recovery'] },
    ]);
    const read = hpCandidateObservationFor(audited.observation.candidateState)?.valueReads[0];
    expect(read).toMatchObject({
      operation: hpOperation,
      operationSequence: 0,
      operationGroupIndex: 0,
      permille: 1000,
      value: 100,
      contributionIncluded: true,
      modifierAppended: true,
    });
    expect(read?.result.outcome).toBe('applied');
    expect(audited.observation.candidateState?.executionGroups[0]?.outcome).toBe('rolledBack');
    expect(audited.observation.operationEvents.map(({ operationId }) => operationId)).toEqual([
      operation.operationId,
      'missing',
      'recovery',
    ]);
  });

  it('preapplies form and variant once and observes their ordered transaction', () => {
    const changed: AttackNoblePhantasmVariant = {
      ...variant,
      canonicalId: 'changed',
      ref: { actorFormId: { actorId: 'changed', limitCount: 1 }, noblePhantasmId: 'changed' },
      card: 'arts',
    };
    const transform: BattleOperation = {
      ...operation,
      operationId: 'transform',
      kind: 'transformActorForm',
      targetFormId: changed.ref.actorFormId,
      targetTraits: ['intrinsic'],
    };
    const select: BattleOperation = {
      ...operation,
      operationId: 'select',
      order: 2,
      kind: 'selectNoblePhantasmVariant',
      variant: changed.ref,
    };
    const plan = prepared([transform, select]);
    plan.noblePhantasmVariants = [variant, changed];
    const audited = executeOrderedScenarioWithAuditObservation(plan, inputs);
    expect(audited.execution).toEqual(executeOrderedScenario(plan, inputs));
    expect(audited.execution.issues).toEqual([]);
    expect(audited.execution.state.actorFormId).toEqual(changed.ref.actorFormId);
    expect(audited.execution.input.cardType).toBe('arts');
    if (audited.observation.selection !== 'selected') throw new Error('selected required');
    expect(audited.observation.candidateState?.preGroupContextResolution).toMatchObject({
      appliedOperationIds: ['transform', 'select'],
      before: { actorFormId: variant.ref.actorFormId, card: 'buster' },
      resolved: { actorFormId: changed.ref.actorFormId, card: 'arts' },
    });
    expect(audited.observation.operationEvents.map(({ operationId }) => operationId)).toEqual([
      'transform',
      'select',
    ]);
  });

  it('retains the exact initial state reference on variant and constraint rejection', () => {
    const plan = prepared();
    const candidate = prepareCandidateExecution(plan, inputs, target);
    if (candidate.status !== 'ready') throw new Error('ready required');
    const initial = candidate.selectionBaseState;
    const selections = resolveCandidateSelections(
      plan,
      candidate.decisions,
      candidate.stochasticOutcomes,
      initial,
    );
    const snapshot = structuredClone(initial);
    const unknown = {
      ...operation,
      kind: 'selectNoblePhantasmVariant' as const,
      variant: { ...variant.ref, noblePhantasmId: 'missing' },
    };
    expect(
      validateCandidateSelections(plan, [], initial, {
        ...selections,
        finalSelectedNoblePhantasmVariant: unknown,
      }).state,
    ).toBe(initial);
    expect(
      validateCandidateSelections(plan, [], initial, {
        ...selections,
        activeConditionConstraints: [
          { sourceKey: 'conflict', expression: { kind: 'card', card: 'arts' } },
        ],
      }).state,
    ).toBe(initial);
    expect(initial).toEqual(snapshot);
  });
});
