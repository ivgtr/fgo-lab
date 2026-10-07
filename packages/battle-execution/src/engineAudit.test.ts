import { projectBattleTraitPresence } from './traitFactLayers';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { createPreparationState } from './preparationState';
import { captureInitialPreparationFacts } from './preparationInitialFacts';
import { bindExecutionOperation, type SourceExecutionBinding } from './executionBinding';
import { describe, expect, it } from 'vitest';
import type { DamageResolutionInput } from '@fgo-lab/schema';
import type {
  AttackNoblePhantasmVariant,
  ServantMaster,
  StackInputDefinition,
} from '@fgo-lab/master-data';
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
    preparationExecution: {
      kind: 'available',
      state: initialized.state,
      initialFacts: captureInitialPreparationFacts(initialized.state),
    },
  } as unknown as PreparedOrderedScenario;
}

describe('public ordered execution audit parity', () => {
  it('does not replay a physical no-op from a committed preparation source', () => {
    const write: BattleOperation = {
      ...operation,
      operationId: 'native-no-op',
      kind: 'addTrait',
      scope: 'attackerState',
      trait: 'created',
    };
    const binding: SourceExecutionBinding = {
      modifierReadOwner: 'nativePreparation',
      actionId: 'native-action',
      actorFormId: variant.ref.actorFormId,
      sourceInstanceId: write.source.sourceInstanceId,
      skillId: write.source.skillId,
      occurrenceId: write.source.effectOccurrenceId,
      valueSetIndex: 0,
      valueIndex: 0,
      activation: { kind: 'unread' },
      conditionReads: [],
      physicalInputs: [],
      modifierValueReads: [],
      committedPhysicalOperationIndexes: [],
      sourcePhysicalCommitted: true,
      physicalTransitions: [],
    };
    const executed = executeOrderedScenario(
      prepared([bindExecutionOperation(write, binding, 0)]),
      inputs,
    );
    expect(executed.issues).toEqual([]);
    expect(
      projectBattleTraitPresence(executed.state, 'attackerState').get('created'),
    ).toBeUndefined();
    expect(executed.state.traitFactLayers.writes.attackerState.has('created')).toBe(false);
  });

  it('commits a trait write and its fact layer through the public candidate executor', () => {
    const write: BattleOperation = {
      ...operation,
      operationId: 'create-trait',
      kind: 'addTrait',
      scope: 'attackerState',
      trait: 'created',
    };
    const executed = executeOrderedScenario(prepared([write]), inputs);
    expect(projectBattleTraitPresence(executed.state, 'attackerState').get('created')).toBe(true);
    expect(executed.state.traitFactLayers.writes.attackerState.get('created')).toMatchObject({
      kind: 'present',
      quantity: { kind: 'unknown' },
      proof: { kind: 'guaranteedWrite', clock: { operationId: 'create-trait' } },
    });
    expect(readTraitQuantity(executed.state.traitFactLayers, 'attackerState', 'created')).toEqual({
      value: null,
      support: [],
    });
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
    ).toMatchObject({
      value: null,
      dependency: { kind: 'unsupported', truth: null, clock: { phase: 'operation' } },
    });
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
      kind: 'present',
      quantity: { kind: 'known', value: 1 },
      proof: { kind: 'guaranteedWrite', clock: { operationId: 'create-trait' } },
    });
    expect(
      fact.kind === 'present' && fact.quantity.kind === 'known' ? fact.quantity.support : null,
    ).toMatchObject([
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
    expect(reads[0]!.support.map(({ kind, clock }) => [kind, clock.operationId])).toEqual(
      expect.arrayContaining([
        ['possibleOutcome', 'possible-grant'],
        ['guaranteedWrite', 'guaranteed-grant'],
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

  it.each(['stackLinear', 'inputLinear'] as const)(
    'adopts %s from its actual quantity support instead of guaranteed presence',
    (kind) => {
      const definition: StackInputDefinition = {
        kind: 'effectStackCount' as const,
        key: 'created-count',
        owner: 'attacker' as const,
        label: 'count',
        description: 'count',
        minimum: 0,
        maximum: 10,
        step: 1,
        defaultValue: 0,
        defaultReason: 'baseline' as const,
        quantitySource: { scope: 'attackerState' as const, trait: 'created' },
      };
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
      const valueExpression = {
        kind,
        basePermille: 0,
        perUnitPermille: 100,
        maximumUnits: 10,
        maximumValuePermille: null,
        ...(kind === 'stackLinear' ? { sources: [definition] } : { inputKey: definition.key }),
      };
      const modifier: BattleOperation = {
        ...operation,
        operationId: 'quantity-modifier',
        order: 3,
        inputDefinitions: [definition],
        valueExpression:
          kind === 'stackLinear'
            ? { ...valueExpression, kind, sources: [definition] }
            : { ...valueExpression, kind, inputKey: definition.key },
      };
      const plan = prepared([first, second, modifier]);
      plan.baseInput = {
        ...input,
        fieldTraits: ['possible'],
        stackStateCounts: { attackerState: { created: 0 }, targetState: {}, field: {} },
      };
      plan.inputDefinitions = [definition];
      const declared = { ...inputs, values: { [definition.key]: 0 } };
      const calculator = executeOrderedScenario(plan, declared);
      const ranking = (conditionalEffects: 'baseline' | 'satisfied') =>
        executeOrderedScenario(plan, declared, {
          kind: 'ranking',
          selfBuffs: 'included',
          conditionalEffects,
          areaView: 'included',
        });
      const baseline = ranking('baseline'),
        satisfied = ranking('satisfied');
      expect(calculator.precision).toBe('exact');
      expect(calculator.input.attackBuff).toBe(0.2);
      expect(baseline.input.attackBuff).toBe(0);
      expect(satisfied.input.attackBuff).toBe(0.2);
      for (const executed of [calculator, baseline, satisfied]) {
        const result = executed.operations.find(
          ({ operation }) => operation.operationId === modifier.operationId,
        )!;
        expect(result.conditionRead).toMatchObject({
          kind: 'known',
          truth: true,
          certainty: 'guaranteed',
        });
        expect(result.valueDependencyRead).toMatchObject({
          kind: 'known',
          truth: true,
          certainty: 'possible',
          clock: { phase: 'operation', operationId: 'quantity-modifier' },
          evidence: [{ value: 2 }],
        });
        expect(
          result.valueDependencyRead!.support.map(({ kind, clock }) => [kind, clock.operationId]),
        ).toEqual(
          expect.arrayContaining([
            ['possibleOutcome', 'possible-grant'],
            ['guaranteedWrite', 'guaranteed-grant'],
          ]),
        );
      }
      expect(
        baseline.effectiveContributions.contributions.find(
          (item) => item.operationId === modifier.operationId,
        )?.effective,
      ).toBe(false);
      expect(
        satisfied.effectiveContributions.contributions.find(
          (item) => item.operationId === modifier.operationId,
        )?.effective,
      ).toBe(true);
      const guaranteedPlan = { ...plan, operations: [second, modifier] };
      const guaranteed = executeOrderedScenario(guaranteedPlan, declared, {
        kind: 'ranking',
        selfBuffs: 'included',
        conditionalEffects: 'baseline',
        areaView: 'included',
      });
      expect(guaranteed.input.attackBuff).toBe(0.1);
      expect(
        guaranteed.operations.find(
          ({ operation }) => operation.operationId === modifier.operationId,
        )?.valueDependencyRead,
      ).toMatchObject({ certainty: 'guaranteed', evidence: [{ value: 1 }] });
    },
  );

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
