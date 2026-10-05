import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { createPreparationState } from './preparationState';
import { describe, expect, it } from 'vitest';
import type { DamageResolutionInput } from '@fgo-lab/schema';
import type { AttackNoblePhantasmVariant, ServantMaster } from '@fgo-lab/master-data';
import { readTraitQuantity } from './traitFactLayers';
import { evaluateCondition } from './condition';
import { resolveModifierValue } from './projection';
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
import { applyNoblePhantasmDamage } from './npDamageExecution';
import type { ConditionRead } from './conditionRead';

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
const fixtureMaster = masterSnapshotSchema.parse(fixture);
function prepared(operations: readonly BattleOperation[] = [operation]): PreparedOrderedScenario {
  const original = fixtureMaster.servants[0]!;
  const servant: ServantMaster = {
    ...original,
    id: input.attackerId,
    traits: [],
    skills: [],
    passives: [],
    noblePhantasmVariantGroups: [
      { ...original.noblePhantasmVariantGroups[0]!, variants: [variant] },
    ],
    actorFormGraph: {
      actorId: input.attackerId,
      defaultInitialFormId: variant.ref.actorFormId,
      initialFormIds: [variant.ref.actorFormId],
      forms: [
        {
          ...original.actorFormGraph.forms[0]!,
          id: variant.ref.actorFormId,
          traits: [],
          skillIds: [],
          passiveIds: [],
          baseNoblePhantasmVariant: variant.ref,
        },
      ],
      transitions: [],
    },
  };
  const initialized = createPreparationState(servant, variant.ref.actorFormId, {
    stochasticSelection: { kind: 'declared' },
    resourceSemantics: fixtureMaster.npResourceSemantics,
    npLevel: 1,
    initialGauge: 10_000,
    overcharge: 1,
    attackerHpPermille: input.attackerHpPermille!,
  });
  if (initialized.status !== 'applied') throw new Error('preparation_fixture_required');
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
    preparationExecution: { kind: 'available', state: initialized.state },
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
      count: null,
      countSupport: [],
      proof: { kind: 'guaranteedWrite', clock: { operationId: 'create-trait' } },
    });
    expect(
      readTraitQuantity(executed.state.traitFactLayers, 'attackerState', 'created', null),
    ).toEqual({ value: null, support: [] });
    const state = executed.state;
    if (state.activationContext === null) throw new Error('executed_state_required');
    state.stackQuantitySources['created-count'] = { scope: 'attackerState', trait: 'created' };
    expect(
      evaluateCondition(
        { kind: 'inputQuantity', inputKey: 'created-count', comparison: 'atLeast', value: 1 },
        state,
      ),
    ).toMatchObject({ kind: 'inputRequired', truth: null, certainty: null });
    expect(
      evaluateCondition(
        {
          kind: 'traitCount',
          scope: 'attackerState',
          traits: ['created'],
          comparison: 'atLeast',
          count: 1,
        },
        state,
      ),
    ).toMatchObject({ kind: 'known', truth: true, certainty: 'guaranteed' });
    expect(
      resolveModifierValue(
        {
          ...operation,
          valueExpression: {
            kind: 'stackLinear',
            sources: [
              {
                kind: 'effectStackCount',
                key: 'created-count',
                owner: 'attacker',
                label: 'created',
                description: 'initial count',
                minimum: 0,
                maximum: 10,
                step: 1,
                defaultValue: 0,
                defaultReason: 'baseline',
                quantitySource: { scope: 'attackerState', trait: 'created' },
              },
            ],
            basePermille: 0,
            perUnitPermille: 100,
            maximumUnits: 10,
            maximumValuePermille: null,
          },
        },
        state,
      ),
    ).toBeNull();
  });

  it('increments an explicitly known zero and retains its exact quantity dependencies', () => {
    const write: BattleOperation = {
      ...operation,
      operationId: 'create-trait',
      kind: 'addTrait',
      scope: 'attackerState',
      trait: 'created',
    };
    const plan = prepared([write]);
    plan.baseInput = {
      ...input,
      stackStateCounts: { attackerState: { created: 0 }, targetState: {}, field: {} },
    };
    const executed = executeOrderedScenario(plan, inputs);
    const fact = executed.state.traitFactLayers.writes.attackerState.get('created')!;
    expect(fact).toMatchObject({
      present: true,
      count: 1,
      proof: { kind: 'guaranteedWrite', clock: { operationId: 'create-trait' } },
    });
    expect(fact.countSupport).toMatchObject([
      { kind: 'selectedInitialResource', clock: { phase: 'initial' } },
      { kind: 'guaranteedWrite', clock: { operationId: 'create-trait' } },
    ]);
  });

  it('uses exact quantity support rather than guaranteed presence for a stack NP contribution', () => {
    const first: BattleOperation = {
      ...operation,
      operationId: 'possible-grant',
      kind: 'addTrait',
      scope: 'attackerState',
      trait: 'created',
      condition: { kind: 'trait', scope: 'field', trait: 'possible', present: true },
    };
    const second: BattleOperation = {
      ...first,
      operationId: 'guaranteed-grant',
      order: 2,
      condition: { kind: 'always' },
    };
    const plan = prepared([first, second]);
    plan.baseInput = {
      ...input,
      fieldTraits: ['possible'],
      stackStateCounts: { attackerState: { created: 0 }, targetState: {}, field: {} },
    };
    const execution = executeOrderedScenario(plan, inputs);
    const state = execution.state;
    if (state.activationContext === null) throw new Error('executed_state_required');
    expect(
      evaluateCondition(
        { kind: 'trait', scope: 'attackerState', trait: 'created', present: true },
        state,
      ),
    ).toMatchObject({ truth: true, certainty: 'guaranteed' });
    const damage: Extract<BattleOperation, { kind: 'executeNpDamage' }> = {
      ...operation,
      kind: 'executeNpDamage',
      phase: 'npDamage',
      overcharge: 1,
      selectedNpLevel: 1,
      npMultipliers: [300, 300, 300, 300, 300],
      specialAttackDecisionKey: null,
      specialAttackCondition: { kind: 'always' },
      specialAttackDependency: {
        kind: 'trait',
        scope: 'attackerState',
        trait: 'created',
        present: true,
      },
      damage: {
        kind: 'traitCount',
        functionId: 'stack-np',
        rawFunctionType: 'damageNpIndividualSum',
        rawPath: 'fixture',
        target: 'single',
        stateTraitNames: [],
        quantity: {
          kind: 'stacks',
          inputs: [
            {
              kind: 'effectStackCount',
              key: 'count',
              owner: 'attacker',
              label: 'created',
              description: 'initial count',
              minimum: 0,
              maximum: 10,
              step: 1,
              defaultValue: 0,
              defaultReason: 'baseline',
              quantitySource: { scope: 'attackerState', trait: 'created' },
            },
          ],
        },
        parametersByOvercharge: Array.from({ length: 5 }, () =>
          Array.from({ length: 5 }, () => ({
            ratePermille: 1_000,
            valuePermille: 3_000,
            targetId: 0,
            targetTraits: [{ kind: 'trait' as const, name: 'created' }],
            secondaryValuePermille: 1_000,
            correctionPermille: 200,
            maximumTargetCount: 10,
          })),
        ) as Extract<
          BattleOperation,
          { kind: 'executeNpDamage' }
        >['damage']['parametersByOvercharge'],
      },
    };
    const reads: ConditionRead[] = [];
    const baseline = applyNoblePhantasmDamage(
      input,
      damage,
      state,
      new Map(),
      {
        kind: 'ranking',
        selfBuffs: 'included',
        conditionalEffects: 'baseline',
        areaView: 'included',
      },
      undefined,
      undefined,
      (read) => reads.push(read),
    );
    const satisfied = applyNoblePhantasmDamage(input, damage, state, new Map(), {
      kind: 'ranking',
      selfBuffs: 'included',
      conditionalEffects: 'satisfied',
      areaView: 'included',
    });
    expect(reads[0]).toMatchObject({
      kind: 'known',
      truth: true,
      certainty: 'possible',
      clock: { phase: 'damageEvaluation' },
    });
    expect(reads[0]!.support).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'possibleOutcome',
          clock: expect.objectContaining({ operationId: 'possible-grant' }),
        }),
        expect.objectContaining({
          kind: 'guaranteedWrite',
          clock: expect.objectContaining({ operationId: 'guaranteed-grant' }),
        }),
      ]),
    );
    expect(baseline.npSpecialMultipliers).toEqual([1, 1, 1, 1, 1]);
    expect(satisfied.npSpecialMultipliers).toEqual([1.4, 1.4, 1.4, 1.4, 1.4]);
    const unknown = executeOrderedScenario(prepared([second]), inputs).state;
    if (unknown.activationContext === null) throw new Error('executed_state_required');
    const unknownReads: ConditionRead[] = [];
    expect(
      applyNoblePhantasmDamage(
        input,
        damage,
        unknown,
        new Map(),
        {
          kind: 'ranking',
          selfBuffs: 'included',
          conditionalEffects: 'baseline',
          areaView: 'included',
        },
        undefined,
        undefined,
        (read) => unknownReads.push(read),
      ).damageFunction,
    ).toMatchObject({
      status: 'unsupported',
      missingEvidence: 'unknown_trait_quantity',
    });
    expect(unknownReads[0]).toMatchObject({ kind: 'inputRequired', truth: null, certainty: null });
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
