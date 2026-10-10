import { resolveScenarioPreparationOutcome } from './scenarioPreparation';
import { mutableAuditView } from './auditTestMutation';
import { applyCanonicalInputCommand, type CanonicalInputCommand } from './canonicalInputs';
import { hpCoverageSources } from './productionHpCoverage';
import { hpProofCoverageInventory } from './productionHpProofCoverage';
import { reconcileHpOperationEvidence } from './productionHpOperationEvidence';
import { battlePointPreparationRejectionObservationFor } from './battlePointPreparationObservation';
import { preparationHpActionsFor } from '@fgo-lab/battle-execution/preparation-audit';
import {
  productionAuditTestOptions,
  writeProductionAuditArtifact,
  decodeStoredProductionAuditArtifact,
  readStoredProductionAuditArtifact,
} from './productionAuditArtifacts';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  hpTransferObservations,
  reconcileHpTransferEvidence,
} from './productionHpTransferEvidence';
import { describe, expect, it } from 'vitest';
import {
  masterSnapshotSchema,
  masterEffectSchema,
  type MasterEffect,
  type EffectExecutionOperation,
} from '@fgo-lab/master-data';
import fixture from '../../test-fixtures/master/fixture.json';
import {
  createDefaultResolvedScenario,
  calculateScenario,
  prepareCalculationScenarioWithPolicy,
  evaluatePreparedCalculationScenario,
} from './scenario';
import {
  createCalculatorPortableRequest,
  executePortableCalculation,
  currentCalculationVersionContext,
} from './portableCalculation';
import { SCHEMA_VERSION } from '@fgo-lab/schema';
const base = masterSnapshotSchema.parse(fixture);
const values = (n: number) =>
  [Array<number>(10).fill(n), [], [], [], []] as [number[], number[], number[], number[], number[]];
function transferEvidence(
  master: ReturnType<typeof masterSnapshotSchema.parse>,
  scenario: ReturnType<typeof createDefaultResolvedScenario>,
  versions: Parameters<typeof calculateScenario>[2],
) {
  const prepared = prepareCalculationScenarioWithPolicy(
    scenario,
    master,
    { kind: 'calculator' },
    {},
    true,
  );
  const calculation = evaluatePreparedCalculationScenario(prepared, versions);
  const requests = [{ prepared, calculation }];
  const sources = hpCoverageSources(master);
  const observations = hpTransferObservations(requests);
  const evidence = reconcileHpTransferEvidence(sources, requests, observations);
  expect(evidence.gate.failures).toEqual([]);
  expect(calculation.result).toEqual(calculateScenario(scenario, master, versions).result);
  return { sources, requests, observations, evidence };
}
function effect(id: string, execution: EffectExecutionOperation[]): MasterEffect {
  return masterEffectSchema.parse({
    id,
    occurrenceId: id,
    label: id,
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
    proc: { kind: 'guaranteed' },
    requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
    inputDefinitions: [],
    execution,
  });
}
function setup(effects: MasterEffect[], hp = 1000) {
  const master = structuredClone(base);
  master.servants[0]!.skills = [
    {
      id: 'hp-skill',
      name: 'HP skill',
      slot: 1,
      priority: 1,
      detail: '',
      imageKey: null,
      resourceRequirement: null,
      effects,
    },
  ];
  master.servants[0]!.actorFormGraph.forms[0]!.skillIds = ['hp-skill'];
  const scenario: ReturnType<typeof createDefaultResolvedScenario> = {
    ...createDefaultResolvedScenario(master, undefined),
    attackerHpPermille: hp,
    preNoblePhantasmPlan: [
      { kind: 'useSkillSlot' as const, slot: 1 as const, skillLevel: 1, choice: null },
      { kind: 'executeAttackNoblePhantasm' as const },
    ],
  };
  const versions = {
    ...currentCalculationVersionContext(master),
    schemaVersion: SCHEMA_VERSION,
    appVersion: '0.1.0',
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  return { master, scenario, versions };
}
const loss = (
  amount: number,
  lossFloor: 'zero' | 'oneIfAlive' = 'oneIfAlive',
): EffectExecutionOperation => ({
  kind: 'resourceMutation',
  resource: 'hp',
  direction: 'loss',
  unit: 'fixed',
  recipient: 'sourceSelf',
  subjectId: null,
  amount: { kind: 'fixed', values: values(amount) },
  lossFloor,
});
const gain = (
  amount: number,
): Extract<
  EffectExecutionOperation,
  { kind: 'resourceMutation'; resource: 'hp'; direction: 'gain' }
> => ({
  kind: 'resourceMutation',
  resource: 'hp',
  direction: 'gain',
  unit: 'fixed',
  recipient: 'sourceSelf',
  subjectId: null,
  amount: { kind: 'fixed', values: values(amount) },
});
const npGain: EffectExecutionOperation = {
  kind: 'resourceMutation',
  resource: 'npGauge',
  direction: 'gain',
  unit: 'fixed',
  recipient: 'sourceSelf',
  subjectId: null,
  amount: { kind: 'fixed', values: values(1000) },
};
describe('HP initial intent through common preparation and recovery', () => {
  it('keeps ordered HP operation attempts separate from native transaction and later reads', () => {
    const { master, scenario, versions } = setup([effect('ordered-hp', [loss(100), gain(50)])]);
    const prepared = prepareCalculationScenarioWithPolicy(
      scenario,
      master,
      { kind: 'calculator' },
      {},
      true,
    );
    const calculation = evaluatePreparedCalculationScenario(prepared, versions);
    const declarations = hpProofCoverageInventory(master);
    const evidence = reconcileHpOperationEvidence(declarations, [{ prepared, calculation }]);
    expect(evidence.gate.failures).toEqual([]);
    expect(evidence.rows.filter((row) => row.attempted).map((row) => row.operationIndex)).toEqual([
      0, 1,
    ]);
    expect(evidence.rows.filter((row) => row.attempted).map((row) => row.transaction)).toEqual([
      'committed',
      'committed',
    ]);
    expect(evidence.modifierReads.map((read) => read.action)).toEqual([
      'receive',
      'give',
      'noHealing',
    ]);
    expect(evidence.modifierReads.every((read) => read.consumed)).toBe(true);
    const transition = battlePointPreparationRejectionObservationFor(prepared)?.transitions[0];
    const action = transition && preparationHpActionsFor(transition.result)[0];
    if (!action) throw new TypeError('hp_fixture_capture_missing');
    const original = action.operations[0]!;
    mutableAuditView(action.operations)[0] = { ...original, step: original.step + 1 };
    expect(
      reconcileHpOperationEvidence(declarations, [{ prepared, calculation }]).gate.failures.map(
        (failure) => failure.reason,
      ),
    ).toContain('operationOrderMismatch');
    mutableAuditView(action.operations)[0] = original;
    mutableAuditView(action.operations).splice(0, 1);
    expect(
      reconcileHpOperationEvidence(declarations, [{ prepared, calculation }]).gate.failures.map(
        (failure) => failure.reason,
      ),
    ).toContain('stepDecisionMismatch');
    mutableAuditView(action.operations).unshift(original);
    const firstRead = action.modifierReads[0]!;
    const secondRead = action.modifierReads[1]!;
    mutableAuditView(action.modifierReads)[0] = secondRead;
    mutableAuditView(action.modifierReads)[1] = firstRead;
    expect(
      reconcileHpOperationEvidence(declarations, [{ prepared, calculation }]).gate.failures.map(
        (failure) => failure.reason,
      ),
    ).toContain('modifierReadOrderMismatch');
    mutableAuditView(action.modifierReads)[0] = firstRead;
    mutableAuditView(action.modifierReads)[1] = secondRead;
  });

  it('links a retained HP modifier to the later physical gain read by instance', () => {
    const modifier = effect('read-source', [
      {
        kind: 'hpModifier',
        action: 'receive',
        sign: 1,
        bounds: { minimum: 0, maximum: 50000 },
        values: values(300),
        traits: [],
        lifetime: 'active',
        route: {
          target: 'sourceSelf',
          contributionScope: 'personal',
          eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
        },
      },
    ]);
    const { master, scenario, versions } = setup([modifier, effect('reader', [gain(100)])]);
    const prepared = prepareCalculationScenarioWithPolicy(
      scenario,
      master,
      { kind: 'calculator' },
      {},
      true,
    );
    const calculation = evaluatePreparedCalculationScenario(prepared, versions);
    const evidence = reconcileHpOperationEvidence(hpProofCoverageInventory(master), [
      { prepared, calculation },
    ]);
    expect(evidence.gate.failures).toEqual([]);
    expect(evidence.modifierReads.find((read) => read.action === 'receive')).toMatchObject({
      writerOperations: [{ actionIndex: 0, operationIndex: 0 }],
      consumed: true,
    });
  });

  it('captures modifier removal before a later empty physical read', () => {
    const route = {
      target: 'sourceSelf' as const,
      contributionScope: 'personal' as const,
      eligibility: { kind: 'anyRecipient' as const, onMissing: 'unsupported' as const },
    };
    const { master, scenario, versions } = setup([
      effect('add-remove-read', [
        {
          kind: 'hpModifier',
          action: 'receive',
          sign: 1,
          bounds: { minimum: 0, maximum: 50000 },
          values: values(300),
          traits: ['buffTrait:1'],
          lifetime: 'active',
          route,
        },
        { kind: 'removeHpModifiers', selection: 'direct', route, traits: ['buffTrait:1'] },
        gain(100),
      ]),
    ]);
    const prepared = prepareCalculationScenarioWithPolicy(
      scenario,
      master,
      { kind: 'calculator' },
      {},
      true,
    );
    const calculation = evaluatePreparedCalculationScenario(prepared, versions);
    const evidence = reconcileHpOperationEvidence(hpProofCoverageInventory(master), [
      { prepared, calculation },
    ]);
    expect(evidence.gate.failures).toEqual([]);
    expect(evidence.rows.filter((row) => row.attempted).map((row) => row.operationIndex)).toEqual([
      0, 1, 2,
    ]);
    expect(evidence.modifierReads.find((read) => read.action === 'receive')).toMatchObject({
      instanceIds: [],
      writerOperations: [],
      consumed: true,
    });
  });

  it('records a rejected HP attempt without treating it as a committed write', () => {
    const unsupported = effect('conditional-maximum-attempt', [
      loss(100),
      {
        kind: 'hpModifier',
        action: 'maximumFixed',
        sign: 1,
        bounds: { minimum: null, maximum: null },
        values: values(5000),
        traits: ['buffMaxHpUp'],
        lifetime: 'active',
        route: {
          target: 'sourceSelf',
          contributionScope: 'personal',
          eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
        },
        useCondition: {
          kind: 'quantity',
          quantity: 'attackerHpPermille',
          comparison: 'atLeast',
          value: 500,
        },
      },
    ]);
    const { master, scenario, versions } = setup([unsupported], 500);
    const prepared = prepareCalculationScenarioWithPolicy(
      scenario,
      master,
      { kind: 'calculator' },
      {},
      true,
    );
    const calculation = evaluatePreparedCalculationScenario(prepared, versions);
    const evidence = reconcileHpOperationEvidence(hpProofCoverageInventory(master), [
      { prepared, calculation },
    ]);
    expect(evidence.gate.failures).toEqual([]);
    expect(evidence.rows.filter((row) => row.attempted)).toMatchObject([
      { operationIndex: 0, operationStatus: 'applied', transaction: 'rejected' },
      { operationIndex: 1, operationStatus: 'unsupported', transaction: 'rejected' },
    ]);
    const rejected = resolveScenarioPreparationOutcome(scenario, master);
    expect(rejected.status).toBe('rejected');
    if (rejected.status === 'rejected')
      expect(rejected.formExecution.state.quantities.attackerHpPermille).toBe(500);
  });

  it(
    'keeps an unresolved heal modifier explicit until consumed, then repairs from initial input',
    productionAuditTestOptions(['hp-recovery-command-edges.json']),
    async ({ task }) => {
      const modifier = effect('uncertain-heal', [
        {
          kind: 'hpModifier',
          action: 'receive',
          sign: 1,
          bounds: { minimum: 0, maximum: 50000 },
          values: values(300),
          traits: ['buffTrait:1'],
          lifetime: 'active',
          route: {
            target: 'sourceSelf',
            contributionScope: 'personal',
            eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
          },
        },
      ]);
      modifier.requirement.expression = {
        kind: 'trait',
        scope: 'recipient',
        trait: 'holyGrail',
        present: true,
        provenance: {
          stateSources: 'activeOnly',
          ignoredStateTraits: 'exclude',
          unremovableStateTraits: 'include',
        },
      };
      const idle = setup([modifier], 500);
      const deferred = resolveScenarioPreparationOutcome(idle.scenario, idle.master);
      expect(deferred.status).toBe('executable');
      if (deferred.status === 'executable')
        expect(deferred.formExecution.state.hp?.modifiers?.[0]?.unresolvedCondition).toMatchObject({
          kind: 'worldTraitPresence',
        });
      const consumed = setup([modifier, effect('heal', [gain(1000)])], 500);
      const outcome = calculateScenario(consumed.scenario, consumed.master, consumed.versions);
      expect(outcome.result.status).toBe('inputRequired');
      const definition = outcome.inputDefinitions.find(
        (input) => input.kind === 'worldTraitPresence',
      )!;
      expect(definition).toBeDefined();
      for (const present of [0, 1]) {
        const firstCommand: CanonicalInputCommand = {
          kind: 'setCanonicalIntegerInput',
          key: definition.key,
          value: present,
        };
        let repaired = applyCanonicalInputCommand(consumed.scenario, firstCommand);
        const afterFirstCommand = repaired;
        const firstRepair = calculateScenario(repaired, consumed.master, consumed.versions);
        let secondCommand: CanonicalInputCommand | null = null;
        if (firstRepair.result.status === 'inputRequired') {
          const next = firstRepair.inputDefinitions.find(
            (input) => input.kind === 'worldTraitPresence' && input.key !== definition.key,
          )!;
          expect(next).toBeDefined();
          secondCommand = {
            kind: 'setCanonicalIntegerInput',
            key: next.key,
            value: present,
          };
          repaired = applyCanonicalInputCommand(repaired, secondCommand);
        }
        if (present === 0) {
          const originalPrepared = prepareCalculationScenarioWithPolicy(
            consumed.scenario,
            consumed.master,
            { kind: 'calculator' },
            {},
            true,
          );
          const repairedPrepared = prepareCalculationScenarioWithPolicy(
            repaired,
            consumed.master,
            { kind: 'calculator' },
            {},
            true,
          );
          const originalCalculation = evaluatePreparedCalculationScenario(
            originalPrepared,
            consumed.versions,
          );
          const repairedCalculation = evaluatePreparedCalculationScenario(
            repairedPrepared,
            consumed.versions,
          );
          const firstPrepared = prepareCalculationScenarioWithPolicy(
            afterFirstCommand,
            consumed.master,
            { kind: 'calculator' },
            {},
            true,
          );
          const firstCalculation = evaluatePreparedCalculationScenario(
            firstPrepared,
            consumed.versions,
          );
          expect(firstCalculation.result).toEqual(firstRepair.result);
          const requests = [
            { prepared: originalPrepared, calculation: originalCalculation },
            {
              prepared: firstPrepared,
              calculation: firstCalculation,
              requestPhase: 'repairAttempt' as const,
            },
            ...(secondCommand
              ? [
                  {
                    prepared: repairedPrepared,
                    calculation: repairedCalculation,
                    requestPhase: 'repairAttempt' as const,
                  },
                ]
              : []),
          ];
          const edges = [
            { fromRequestIndex: 0, command: firstCommand, toRequestIndex: 1 },
            ...(secondCommand
              ? [{ fromRequestIndex: 1, command: secondCommand, toRequestIndex: 2 }]
              : []),
          ];
          const evidence = reconcileHpOperationEvidence(
            hpProofCoverageInventory(consumed.master),
            requests,
            edges,
          );
          expect(evidence.gate.failures).toEqual([]);
          expect(evidence.inputCommandEdges).toEqual(edges);
          expect(edges).toHaveLength(secondCommand ? 2 : 1);
          const missing = reconcileHpOperationEvidence(
            hpProofCoverageInventory(consumed.master),
            requests,
            edges.slice(0, -1),
          );
          expect(missing.gate.failures).toMatchObject([
            {
              reason: 'inputCommandEdgeMismatch',
              path: `requests.${requests.length - 1}.recovery`,
            },
          ]);
          expect(missing.gate.firstDifference).not.toBeNull();
          const wrong = reconcileHpOperationEvidence(
            hpProofCoverageInventory(consumed.master),
            requests,
            [{ ...edges[0]!, command: { ...firstCommand, value: 1 } }, ...edges.slice(1)],
          );
          expect(
            wrong.gate.failures.some((failure) => failure.reason === 'inputCommandEdgeMismatch'),
          ).toBe(true);
          const payload = {
            requests: requests.map((request) => ({
              scenario: request.prepared.scenario,
              preparationStatus: request.prepared.status,
              resultStatus: request.calculation.result.status,
            })),
            evidence,
            negatives: [missing.gate, wrong.gate],
          };
          const path = 'hp-recovery-command-edges.json';
          const receipt = await writeProductionAuditArtifact(task.meta, path, payload);
          const bytes = await readStoredProductionAuditArtifact(path);
          expect([bytes.length, createHash('sha256').update(bytes).digest('hex')]).toEqual([
            receipt.expectedBytes,
            receipt.expectedSha256,
          ]);
          expect(isDeepStrictEqual(decodeStoredProductionAuditArtifact(bytes), payload)).toBe(true);
          expect(
            evidence.rows.some((row) => row.requestIndex === 0 && row.transaction === 'rejected'),
          ).toBe(true);
          expect(
            evidence.rows.some(
              (row) => row.requestIndex === requests.length - 1 && row.transaction === 'committed',
            ),
          ).toBe(true);
        }
        const execution = resolveScenarioPreparationOutcome(repaired, consumed.master);
        expect(
          execution.status,
          JSON.stringify(execution.status === 'rejected' ? execution.rejection : execution.status),
        ).toBe('executable');
        if (execution.status === 'executable')
          expect(execution.formExecution.state.hp?.actors.attacker).toMatchObject({
            current: present ? 6800 : 6500,
          });
        const request = createCalculatorPortableRequest(
          repaired,
          currentCalculationVersionContext(consumed.master),
        );
        expect(executePortableCalculation(request, consumed.master).status).toBe('executed');
      }
    },
  );
  it('binds a party HP condition to each recipient', () => {
    const conditional = effect('party-heal', [{ ...gain(1000), recipient: 'partyMember' }]);
    conditional.requirement = {
      recipient: 'partyMember',
      expression: {
        kind: 'quantity',
        quantity: 'attackerHpPermille',
        comparison: 'atMost',
        value: 500,
      },
    };
    const { master, scenario } = setup([conditional], 400);
    const support = {
      sourceTemplateId: null,
      composition: {
        effectInclusions: [],
        sources: [
          {
            sourceInstanceId: 'support-fixture',
            servantId: master.servants[0]!.id,
            skills: [{ skillId: 'hp-skill', skillLevel: 1, enabled: true }],
          },
        ],
      },
    };
    const resolved = resolveScenarioPreparationOutcome(
      { ...scenario, preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' }], support },
      master,
    );
    expect(
      resolved.status,
      JSON.stringify(resolved.status === 'rejected' ? resolved.rejection : resolved.status),
    ).toBe('executable');
    if (resolved.status === 'executable') {
      expect(resolved.formExecution.state.hp?.actors.attacker).toMatchObject({ current: 5400 });
      expect(resolved.formExecution.state.hp?.actors['support-fixture']).toEqual({
        kind: 'ratioOnly',
        permille: 1000,
      });
      expect(
        resolved.formExecution.state.hp?.receipts.filter((r) => r.actor === 'support-fixture'),
      ).toHaveLength(0);
    }
  });
  it('repairs a source absolute-HP read after loss by rebuilding from its initial maximum', () => {
    const conditional = effect('conditional-source-heal', [gain(500)]);
    conditional.requirement.expression = {
      kind: 'quantity',
      quantity: 'attackerHpPermille',
      comparison: 'atMost',
      value: 950,
    };
    const { master, scenario, versions } = setup(
      [effect('source-loss', [loss(1000)]), conditional],
      500,
    );
    const supported = {
      ...scenario,
      preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' as const }],
      support: {
        sourceTemplateId: null,
        composition: {
          effectInclusions: [],
          sources: [
            {
              sourceInstanceId: 'support-fixture',
              servantId: master.servants[0]!.id,
              skills: [{ skillId: 'hp-skill', skillLevel: 1, enabled: true }],
            },
          ],
        },
      },
    };
    const rejected = calculateScenario(supported, master, versions);
    expect(rejected.result.status).toBe('inputRequired');
    const input = rejected.inputDefinitions.find((input) => input.kind === 'sourceMaximumHp')!;
    expect(input).toBeDefined();
    const repaired = applyCanonicalInputCommand(supported, {
      kind: 'setCanonicalIntegerInput',
      key: input.key,
      value: 10000,
    });
    const execution = resolveScenarioPreparationOutcome(repaired, master);
    expect(execution.status).toBe('executable');
    if (execution.status === 'executable') {
      expect(execution.formExecution.state.hp?.actors['support-fixture']).toMatchObject({
        maximum: 10000,
        current: 9500,
      });
      expect(execution.formExecution.state.hp?.actors.attacker).toMatchObject({ current: 5500 });
    }
    const request = createCalculatorPortableRequest(
      repaired,
      currentCalculationVersionContext(master),
    );
    const portable = executePortableCalculation(request, master);
    expect(portable.status, JSON.stringify(portable)).toBe('executed');
    expect(resolveScenarioPreparationOutcome(repaired, master)).toEqual(execution);
  });
  it('reads a heal modifier at each use after intervening HP changes', () => {
    const modifier = effect('live-heal-modifier', [
      {
        kind: 'hpModifier',
        action: 'receive',
        sign: 1,
        bounds: { minimum: 0, maximum: 50000 },
        values: values(300),
        traits: [],
        lifetime: 'active',
        route: {
          target: 'sourceSelf',
          contributionScope: 'personal',
          eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
        },
        useCondition: {
          kind: 'quantity',
          quantity: 'attackerHpPermille',
          comparison: 'atLeast',
          value: 500,
        },
      },
    ]);
    const { master, scenario } = setup([
      modifier,
      effect('loss', [loss(6000)]),
      effect('first-heal', [gain(1000)]),
      effect('second-heal', [gain(1000)]),
    ]);
    const execution = resolveScenarioPreparationOutcome(scenario, master);
    expect(execution.status).toBe('executable');
    if (execution.status === 'executable') {
      expect(execution.formExecution.state.hp?.actors.attacker).toMatchObject({
        current: 7300,
        maximum: 11000,
      });
      expect(execution.formExecution.state.quantities.attackerHpPermille).toBe(663);
      expect(
        execution.formExecution.state.hp?.receipts
          .filter((r) => r.occurrenceId.endsWith('heal'))
          .map((r) => r.attempted),
      ).toEqual([1000, 1300]);
    }
    master.servants[0]!.actorFormGraph.forms[0]!.baseHp = {
      kind: 'form',
      hpByLevel: { '90': 6000 },
    };
    const reseeded = resolveScenarioPreparationOutcome(
      {
        ...scenario,
        attackerHpPermille: 500,
        preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' }],
      },
      master,
    );
    expect(reseeded.status).toBe('executable');
    if (reseeded.status === 'executable')
      expect(reseeded.formExecution.state.hp?.actors.attacker).toMatchObject({
        baseMaximum: 7000,
        current: 3500,
      });
  });
  it('reads HP writes before later NP conditions and never overwrites them with the initial assertion', () => {
    const conditional = {
      ...effect('np', [npGain]),
      requirement: {
        recipient: 'sourceSelf' as const,
        expression: {
          kind: 'quantity' as const,
          quantity: 'attackerHpPermille' as const,
          comparison: 'atMost' as const,
          value: 500,
        },
      },
    };
    const { master, scenario } = setup([effect('loss', [loss(6000)]), conditional]);
    scenario.attacker.npLevel = 2;
    const r = resolveScenarioPreparationOutcome(
      {
        ...scenario,
        worldFactAssertions: [
          {
            decisionKey: 'initial-hp',
            fact: { kind: 'quantity', quantity: 'attackerHpPermille', value: 1000 },
          },
        ],
      },
      master,
    );
    expect(r.status).toBe('executable');
    if (r.status !== 'executable') throw new Error(r.status);
    expect(r.formExecution.state.hp?.actors.attacker).toMatchObject({
      current: 5000,
      maximum: 11000,
    });
    expect(r.formExecution.state.quantities.attackerHpPermille).toBe(454);
    expect(r.formExecution.actions[0]?.resourceAfter.gauge).toBe(11000);
    expect(
      r.formExecution.state.hp?.receipts.filter((x) => x.occurrenceId === 'loss'),
    ).toHaveLength(1);
    expect(
      resolveScenarioPreparationOutcome(
        {
          ...scenario,
          worldFactAssertions: [
            {
              decisionKey: 'conflict',
              fact: { kind: 'quantity', quantity: 'attackerHpPermille', value: 500 },
            },
          ],
        },
        master,
      ),
    ).toMatchObject({ status: 'invalid', issue: { reason: 'conflictingInitialIntent' } });
  });
  it('rejects initial and terminal death without consuming the attack, while positive HP displaying zero attacks', () => {
    const { master, scenario, versions } = setup([effect('loss', [loss(10)])], 1);
    const live = resolveScenarioPreparationOutcome(scenario, master);
    expect(live.status).toBe('executable');
    if (live.status !== 'executable') throw new Error(live.status);
    expect(live.formExecution.state.hp?.actors.attacker).toMatchObject({ current: 1 });
    const dead = calculateScenario({ ...scenario, attackerHpPermille: 0 }, master, versions);
    expect(dead.result).toMatchObject({ status: 'unavailable', reason: 'attackerDead', rows: [] });
    const lethal = setup([effect('loss', [loss(12000, 'zero')])]);
    const rejected = resolveScenarioPreparationOutcome(lethal.scenario, lethal.master);
    expect(rejected).toMatchObject({ status: 'rejected', rejection: { code: 'attackerDead' } });
    if (rejected.status === 'rejected') expect(rejected.appliedPreparationActions).toHaveLength(1);
  });
  it('rebuilds HP from initial intent for portable replay, equipment changes and retries', () => {
    const { master, scenario } = setup([effect('hp', [loss(1000), gain(100)])], 500);
    const request = createCalculatorPortableRequest(
      scenario,
      currentCalculationVersionContext(master),
    );
    const first = executePortableCalculation(request, master);
    expect(first.status).toBe('executed');
    expect(executePortableCalculation(request, master)).toEqual(first);
    const original = resolveScenarioPreparationOutcome(scenario, master);
    expect(original.status).toBe('executable');
    const equip = master.craftEssences[0]!;
    equip.hpByLevel['1'] = 2000;
    const changed = resolveScenarioPreparationOutcome(
      { ...scenario, craftEssence: { craftEssenceId: equip.id, level: 1, limitBreak: 0 } },
      master,
    );
    expect(changed.status).toBe('executable');
    if (changed.status === 'executable')
      expect(changed.formExecution.state.hp?.actors.attacker).toMatchObject({
        baseMaximum: 13000,
        current: 5600,
      });
    expect(resolveScenarioPreparationOutcome(scenario, master)).toEqual(original);
  });
  it('repairs enemy maximum HP without reseeding a prior writer from the initial HP input', () => {
    const transfer = effect('after-enemy-heal', [
      {
        kind: 'resourceMutation',
        resource: 'hp',
        direction: 'gain',
        unit: 'fixed',
        recipient: 'sourceSelf',
        subjectId: null,
        amount: {
          kind: 'hpTransfer',
          donors: 'selectedEnemy',
          inputKeys: ['transfer:enemyHp:0', 'transfer:enemyHp:1', 'transfer:enemyHp:2'],
          values: values(3000),
          child: 'unconditionalUnresistedDisjoint',
        },
      },
    ]);
    transfer.inputDefinitions = [0, 1, 2].map((actorIndex) => ({
      kind: 'transferDonor',
      resource: 'enemyHp',
      actorIndex,
      key: `transfer:enemyHp:${actorIndex}`,
      owner: 'field',
      label: 'donor HP',
      description: 'initial current HP',
      minimum: 0,
      maximum: 10000,
      step: 1,
      defaultValue: 0,
      defaultReason: 'none',
    }));
    const enemyHeal = effect('enemy-heal', [{ ...gain(1000), recipient: 'enemy' }]);
    enemyHeal.requirement.recipient = 'enemy';
    const { master, scenario, versions } = setup([enemyHeal, transfer], 500);
    scenario.canonicalInputValues = { 'transfer:enemyHp:0': { kind: 'integer', value: 2000 } };
    const missing = calculateScenario(scenario, master, versions);
    expect(missing.result.status).toBe('inputRequired');
    const input = missing.inputDefinitions.find((input) => input.kind === 'sourceMaximumHp')!;
    expect(input).toBeDefined();
    const repaired = applyCanonicalInputCommand(scenario, {
      kind: 'setCanonicalIntegerInput',
      key: input.key,
      value: 2500,
    });
    const execution = resolveScenarioPreparationOutcome(repaired, master);
    expect(execution.status).toBe('executable');
    if (execution.status === 'executable') {
      expect(execution.formExecution.state.hp?.donorReceipts).toEqual([
        { actor: 'enemy:0', snapshot: 2500, calculatedGain: 2499, actualLoss: 2499, remaining: 1 },
      ]);
      expect(execution.formExecution.state.hp?.actors.attacker).toMatchObject({ current: 7999 });
    }
    const portable = executePortableCalculation(
      createCalculatorPortableRequest(repaired, currentCalculationVersionContext(master)),
      master,
    );
    expect(portable.status, JSON.stringify(portable.status === 'executed' ? null : portable)).toBe(
      'executed',
    );
    const proof = transferEvidence(master, repaired, versions);
    expect(proof.evidence.rows).toHaveLength(1);
    expect(proof.evidence.rows[0]!.donorReceipts[0]!.snapshot).toBe(2500);
  });
  it(
    'distinguishes donor snapshot, attempted gain, receiver clamp and sequential remaining HP',
    productionAuditTestOptions(['hp-transfer-identity.json']),
    async ({ task }) => {
      const transfer = effect('transfer', [
        {
          kind: 'resourceMutation',
          resource: 'hp',
          direction: 'gain',
          unit: 'fixed',
          recipient: 'sourceSelf',
          subjectId: null,
          amount: {
            kind: 'hpTransfer',
            donors: 'allEnemies',
            inputKeys: ['donor:0', 'donor:1', 'donor:2'],
            values: values(3000),
            child: 'unconditionalUnresistedDisjoint',
          },
        },
      ]);
      transfer.inputDefinitions = [0, 1, 2].map((actorIndex) => ({
        kind: 'transferDonor',
        resource: 'enemyHp',
        actorIndex,
        key: `donor:${actorIndex}`,
        owner: 'field',
        label: 'absorbable HP',
        description: 'initial available HP',
        minimum: 0,
        maximum: 10000,
        step: 1,
        defaultValue: 0,
        defaultReason: 'none',
      }));
      const { master, scenario, versions } = setup(
        [transfer, { ...transfer, id: 'next', occurrenceId: 'next' }],
        900,
      );
      scenario.canonicalInputValues = {
        'donor:0': { kind: 'integer', value: 4001, origin: 'witness' },
        'donor:1': { kind: 'integer', value: 1001, origin: 'witness' },
      };
      const r = resolveScenarioPreparationOutcome(scenario, master);
      expect(r.status).toBe('executable');
      if (r.status !== 'executable') throw new Error(r.status);
      const hp = r.formExecution.state.hp!;
      expect(
        hp.receipts.filter((x) => x.actor === 'attacker').map((x) => [x.attempted, x.actual]),
      ).toEqual([
        [4000, 1100],
        [1000, 0],
      ]);
      expect(
        hp.donorReceipts?.map((x) => [x.snapshot, x.calculatedGain, x.actualLoss, x.remaining]),
      ).toEqual([
        [4001, 3000, 3000, 1001],
        [1001, 1000, 1000, 1],
        [0, 0, 0, 0],
        [1001, 1000, 1000, 1],
        [1, 0, 0, 1],
        [0, 0, 0, 0],
      ]);
      const proof = transferEvidence(master, scenario, versions);
      expect(proof.evidence.rows).toHaveLength(2);
      expect(proof.evidence.unobserved).toContain('transferToNpCausality');
      const first = proof.observations[0]!;
      const negatives: {
        expectedReason: string;
        gate: ReturnType<typeof reconcileHpTransferEvidence>['gate'];
      }[] = [];
      const negative = (
        observations: typeof proof.observations,
        reason: string,
        sources = proof.sources,
      ) => {
        const gate = reconcileHpTransferEvidence(sources, proof.requests, observations).gate;
        negatives.push({ expectedReason: reason, gate });
        expect(gate.passed).toBe(false);
        expect(gate.failures.some((failure) => failure.reason === reason)).toBe(true);
      };
      negative(proof.observations.slice(1), 'missingObservation');
      negative([...proof.observations, first], 'duplicateObservation');
      negative([{ ...first, requestIndex: 99 }, proof.observations[1]!], 'unmatchedObservation');
      negative([...proof.observations].reverse(), 'orderMismatch');
      negative(
        [{ ...first, operation: structuredClone(first.operation) }, proof.observations[1]!],
        'canonicalIdentityMismatch',
      );
      negative(
        [{ ...first, source: { ...first.source } }, proof.observations[1]!],
        'foreignReference',
      );
      negative(
        [
          { ...first, source: { ...first.source, origin: 'support', sourceInstanceId: 'foreign' } },
          proof.observations[1]!,
        ],
        'canonicalIdentityMismatch',
      );
      negative(
        [{ ...first, operation: gain(3000) }, proof.observations[1]!],
        'canonicalIdentityMismatch',
      );
      negative(
        [
          { ...first, operation: { ...gain(3000), recipient: 'partyOther' } },
          proof.observations[1]!,
        ],
        'canonicalIdentityMismatch',
      );
      negative(
        [{ ...first, before: structuredClone(first.before) }, proof.observations[1]!],
        'foreignReference',
      );
      negative([{ ...first, step: first.step + 1 }, proof.observations[1]!], 'nativeTraceMismatch');
      const withoutNative = { ...first.action };
      delete withoutNative.native;
      negative(
        [{ ...first, action: withoutNative }, proof.observations[1]!],
        'nativeTraceMismatch',
      );
      negative(
        [
          { ...first, receipts: [{ ...first.receipts[0]!, actor: 'foreign' }] },
          proof.observations[1]!,
        ],
        'receiptAppendMismatch',
      );
      negative(
        [{ ...first, donorReceipts: [...first.donorReceipts].reverse() }, proof.observations[1]!],
        'donorOrderMismatch',
      );
      negative(proof.observations, 'duplicateDeclaration', [...proof.sources, proof.sources[0]!]);
      negative(proof.observations, 'canonicalIdentityMismatch', []);
      const calculation = proof.requests[0]!.calculation;
      const target =
        'executionObservation' in calculation
          ? calculation.executionObservation.targetExecution
          : undefined;
      if (
        !target ||
        target.selection !== 'selected' ||
        !target.candidateState ||
        !('executionObservation' in calculation)
      )
        throw new Error('transfer_fixture_selected_capture_missing');
      const foreignCalculation = {
        ...calculation,
        executionObservation: {
          ...calculation.executionObservation,
          targetExecution: { ...target, candidateState: { ...target.candidateState } },
        },
      };
      const consumerGate = reconcileHpTransferEvidence(
        proof.sources,
        [{ prepared: proof.requests[0]!.prepared, calculation: foreignCalculation }],
        proof.observations,
      ).gate;
      negatives.push({ expectedReason: 'retainedHpMismatch', gate: consumerGate });
      expect(consumerGate.failures.some((failure) => failure.reason === 'retainedHpMismatch')).toBe(
        true,
      );
      const unselectedScenario = {
        ...scenario,
        preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' as const }],
      };
      const unselectedPrepared = prepareCalculationScenarioWithPolicy(
        unselectedScenario,
        master,
        { kind: 'calculator' },
        {},
        true,
      );
      const unselectedRequests = [
        {
          prepared: unselectedPrepared,
          calculation: evaluatePreparedCalculationScenario(unselectedPrepared, versions),
        },
      ];
      const unselected = reconcileHpTransferEvidence(
        proof.sources,
        unselectedRequests,
        hpTransferObservations(unselectedRequests),
      );
      expect(unselected.gate.failures).toEqual([]);
      expect(unselected.expected).toEqual([]);
      expect(unselected.rows).toEqual([]);
      expect(
        unselected.declarations.map((declaration) => declaration.selectedExpectations),
      ).toEqual([0, 0]);
      expect(proof.evidence.rows.every((row) => row.native?.status === 'committed')).toBe(true);
      expect(
        proof.observations.every(
          ({ action }) =>
            !action.giveConsumptions?.length &&
            !action.giveExcludedConsumptions?.length &&
            !action.receiveConsumptions?.length,
        ),
      ).toBe(true);
      const payload = {
        evidence: proof.evidence,
        negatives,
        unselected,
        readQualification:
          'Transfer bypasses receive/give observers; absence is not an observed empty multiplier read or successful recovery.',
      };
      const receipt = await writeProductionAuditArtifact(
        task.meta,
        'hp-transfer-identity.json',
        payload,
      );
      const bytes = await readStoredProductionAuditArtifact('hp-transfer-identity.json');
      expect([bytes.length, createHash('sha256').update(bytes).digest('hex')]).toEqual([
        receipt.expectedBytes,
        receipt.expectedSha256,
      ]);
      expect(isDeepStrictEqual(decodeStoredProductionAuditArtifact(bytes), payload)).toBe(true);
    },
  );
});

it('preserves the exhaustive legal optimum after a heal shifts an HP condition boundary', async () => {
  const { calculateRankingPolicyDetail } = await import('./rankingProfileCalculation');
  const { DEFAULT_RANKING_POLICY_CONDITIONS } = await import('./rankingContracts');
  const conditional = effect('boundary-buff', [
    {
      kind: 'damageModifier',
      route: {
        target: 'sourceSelf',
        contributionScope: 'personal',
        eligibility: {
          kind: 'requiredRecipient',
          recipient: 'attacker',
          onMissing: 'ignore',
          onMismatch: 'unsupported',
        },
      },
      semanticSupport: 'supported',
      modifier: 'attackBuff',
      sign: 1,
      card: null,
      values: values(2000),
      valueExpressions: [[], [], [], [], []],
    },
  ]);
  conditional.requirement.expression = {
    kind: 'quantity',
    quantity: 'attackerHpPermille',
    comparison: 'atLeast',
    value: 500,
  };
  const { master, scenario, versions } = setup([effect('heal', [gain(1000)]), conditional]);
  for (const group of master.servants[0]!.noblePhantasmVariantGroups)
    for (const variant of group.variants)
      if (variant.kind === 'attack')
        for (const damage of variant.damage) {
          Object.assign(damage, { kind: 'hpRatioLow', rawFunctionType: 'damageNpHpratioLow' });
          for (const row of damage.parametersByOvercharge)
            for (const parameter of row) parameter.targetId = 6000;
        }
  const average = (execution: ReturnType<typeof calculateScenario>) =>
    execution.result.status === 'calculated' ? execution.result.rows[0].average : -Infinity;
  scenario.targetContext = {
    class: { kind: 'concrete', classId: 'saber' },
    attribute: { kind: 'concrete', attribute: 'man' },
    families: [],
    absentFamilies: [],
  };
  let maximum = -Infinity,
    best = 0;
  for (let p = 1; p <= 1000; p++) {
    const n = average(calculateScenario({ ...scenario, attackerHpPermille: p }, master, versions));
    if (n > maximum) {
      maximum = n;
      best = p;
    }
  }
  expect(best).toBe(410);
  const ranking = calculateRankingPolicyDetail(
    master.servants[0]!,
    master,
    { servantBuilds: {} },
    {
      ...DEFAULT_RANKING_POLICY_CONDITIONS,
      npLevelBasis: { kind: 'specified', npLevel: 1 },
      conditionalEffects: 'satisfied',
    },
    versions,
  );
  expect(ranking.status, JSON.stringify(ranking)).toBe('calculated');
  if (ranking.status !== 'calculated') throw new Error(JSON.stringify(ranking));
  expect(
    ranking.detail.result.rows[0].average,
    JSON.stringify({ hp: ranking.detail.scenario.attackerHpPermille }),
  ).toBe(maximum);
  expect(ranking.detail.scenario.attackerHpPermille).toBe(best);
});
it('retains HP-conditioned NP updates in structural search and validates OC through execution', async () => {
  const { calculateRankingPolicyDetail } = await import('./rankingProfileCalculation');
  const { DEFAULT_RANKING_POLICY_CONDITIONS } = await import('./rankingContracts');
  const conditional = effect('hp-np', [npGain]);
  conditional.requirement.expression = {
    kind: 'quantity',
    quantity: 'attackerHpPermille',
    comparison: 'atMost',
    value: 500,
  };
  // 100% -> 5000/11000 -> NP 200% -> OC2, so the damage is governed by the second cell.
  const np = conditional.execution[0]!;
  if (np.kind === 'resourceMutation' && np.resource === 'npGauge' && np.amount.kind === 'fixed')
    np.amount.values = values(10000);
  const { master, scenario, versions } = setup([effect('loss', [loss(6000)]), conditional]);
  scenario.attacker.npLevel = 2;
  scenario.targetContext = {
    class: { kind: 'concrete', classId: 'saber' },
    attribute: { kind: 'concrete', attribute: 'man' },
    families: [],
    absentFamilies: [],
  };
  for (const group of master.servants[0]!.noblePhantasmVariantGroups)
    for (const variant of group.variants)
      if (variant.kind === 'attack')
        for (const damage of variant.damage)
          for (const [index, row] of damage.parametersByOvercharge.entries())
            for (const parameter of row) parameter.valuePermille *= index + 1;
  const oracle = calculateScenario(scenario, master, versions);
  expect(oracle.result.status).toBe('calculated');
  expect(oracle.appliedPreparationActions.at(-1)?.ocUse?.effectiveOc).toBe(2);
  const ranking = calculateRankingPolicyDetail(
    master.servants[0]!,
    master,
    { servantBuilds: {} },
    { ...DEFAULT_RANKING_POLICY_CONDITIONS, npLevelBasis: { kind: 'specified', npLevel: 2 } },
    versions,
  );
  expect(
    ranking.status,
    JSON.stringify(ranking.status === 'calculated' ? ranking.detail.scenario : ranking),
  ).toBe('calculated');
  if (ranking.status === 'calculated' && oracle.result.status === 'calculated')
    expect(ranking.detail.result.rows).toEqual(oracle.result.rows);
});
it('keeps an interior maximum when increasing HP power competes with an inverse HP NP ratio', async () => {
  const { calculateRankingPolicyDetail } = await import('./rankingProfileCalculation');
  const { DEFAULT_RANKING_POLICY_CONDITIONS } = await import('./rankingContracts');
  const modifier = effect('hp-power', [
    {
      kind: 'damageModifier',
      route: {
        target: 'sourceSelf',
        contributionScope: 'personal',
        eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
      },
      semanticSupport: 'supported',
      modifier: 'attackBuff',
      sign: 1,
      card: null,
      values: values(0),
      valueExpressions: [
        Array.from({ length: 10 }, () => ({
          kind: 'hpRangeLinear',
          basePermille: 0,
          minimumHpPermille: 0,
          maximumHpPermille: 1000,
          valueAtMinimumHpPermille: 0,
          valueAtMaximumHpPermille: 4000,
        })),
        [],
        [],
        [],
        [],
      ],
    },
  ]);
  const { master, scenario, versions } = setup([modifier]);
  scenario.targetContext = {
    class: { kind: 'concrete', classId: 'saber' },
    attribute: { kind: 'concrete', attribute: 'man' },
    families: [],
    absentFamilies: [],
  };
  for (const group of master.servants[0]!.noblePhantasmVariantGroups)
    for (const variant of group.variants)
      if (variant.kind === 'attack')
        for (const damage of variant.damage) {
          Object.assign(damage, { kind: 'hpRatioLow', rawFunctionType: 'damageNpHpratioLow' });
          for (const row of damage.parametersByOvercharge)
            for (const parameter of row) parameter.targetId = 6000;
        }
  const { compileDamageKernelInput, calculateDamageDistribution } =
    await import('@fgo-lab/calc-core');
  const full = calculateScenario({ ...scenario, attackerHpPermille: 1000 }, master, versions);
  if (!('input' in full)) throw new Error('fixture input unavailable');
  let maximumScore = -Infinity,
    best = 0,
    bestKernel: ReturnType<typeof compileDamageKernelInput> | null = null;
  // Independent finite oracle changes only the two governed canonical factors. Reuse the
  // fixture's other constants, without repeating preparation/master compilation 1000 times.
  for (let initial = 1; initial <= 1000; initial++) {
    const ratio = (11 * initial) / 11000;
    const buffPermille = Math.trunc(4 * Math.trunc(ratio * 1000));
    const kernel = compileDamageKernelInput(
      {
        ...full.input,
        attackBuff: full.input.attackBuff - 4 + buffPermille / 1000,
        npMultipliers: full.input.npMultipliers.map(
          (value) => value + Math.trunc((1 - ratio) * 6000) / 10,
        ) as [number, number, number, number, number],
      },
      1,
      false,
    );
    // Only these two non-negative factors vary in this fixture. Their product orders every
    // random damage point, so enumerate all 1,000 legal HP values and expand only the maximum.
    const attackFactor = Math.max(
      1000 + Math.min(Math.max(kernel.attackModifierPermille, -1000), 5000),
      0,
    );
    const score = attackFactor * kernel.npMultiplierPermille;
    if (score > maximumScore) {
      maximumScore = score;
      best = initial;
      bestKernel = kernel;
    }
  }
  if (!bestKernel) throw new Error('fixture maximum unavailable');
  const distribution = calculateDamageDistribution(bestKernel);
  const maximum = distribution.reduce((sum, n) => sum + n, 0) / distribution.length;
  expect(best).toBeGreaterThan(100);
  expect(best).toBeLessThan(900);
  const ranked = calculateRankingPolicyDetail(
    master.servants[0]!,
    master,
    { servantBuilds: {} },
    {
      ...DEFAULT_RANKING_POLICY_CONDITIONS,
      npLevelBasis: { kind: 'specified', npLevel: 1 },
      conditionalEffects: 'satisfied',
    },
    versions,
  );
  expect(
    ranked.status,
    JSON.stringify(ranked.status === 'calculated' ? ranked.detail.scenario : ranked),
  ).toBe('calculated');
  if (ranked.status === 'calculated') expect(ranked.detail.result.rows[0].average).toBe(maximum);
});

it('keeps validated HP support choices through preparation without rechecking them at damage time', () => {
  const selected = {
    ...effect('choice-self', [gain(1000)]),
    selection: { kind: 'playerChoice' as const, group: { key: 'hp-family', candidate: 'self' } },
  };
  const other = {
    ...effect('choice-party', [gain(2000)]),
    selection: { kind: 'playerChoice' as const, group: { key: 'hp-family', candidate: 'party' } },
    requirement: { recipient: 'partyMember' as const, expression: { kind: 'always' as const } },
  };
  selected.requirement.expression = { kind: 'choice', family: 'hp-family', candidate: 'self' };
  const { master, scenario, versions } = setup(
    [
      selected,
      {
        ...other,
        requirement: {
          ...other.requirement,
          expression: { kind: 'choice', family: 'hp-family', candidate: 'party' },
        },
      },
    ],
    500,
  );
  const support = {
    sourceTemplateId: null,
    composition: {
      effectInclusions: [],
      sources: [
        {
          sourceInstanceId: 'hp-support',
          servantId: master.servants[0]!.id,
          skills: [{ skillId: 'hp-skill', skillLevel: 1, enabled: true }],
        },
      ],
    },
  };
  const source = {
    origin: 'support' as const,
    sourceInstanceId: 'hp-support',
    skillId: 'hp-skill',
  };
  const input = {
    ...scenario,
    support,
    preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' as const }],
    activationFacts: [{ kind: 'choice' as const, source, family: 'hp-family', candidate: 'self' }],
  };
  expect(calculateScenario(input, master, versions).result.status).toBe('calculated');
  expect(
    calculateScenario(
      { ...input, activationFacts: [{ ...input.activationFacts[0]!, candidate: 'unknown' }] },
      master,
      versions,
    ).result.status,
  ).not.toBe('calculated');
});

it('repairs lowest-HP selection from an initial maximum instead of comparing rounded permilles', () => {
  const operation = { ...gain(1000), selection: 'lowestHpRatio' as const };
  const lowest = effect('lowest', [operation]);
  lowest.requirement.expression = {
    kind: 'quantity',
    quantity: 'attackerHpPermille',
    comparison: 'atLeast',
    value: 0,
  };
  const { master, scenario, versions } = setup([lowest], 500);
  const input = {
    ...scenario,
    preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' as const }],
    canonicalInputValues: {
      'source:support:hp-support:hpPermille': { kind: 'integer' as const, value: 500 },
    },
    support: {
      sourceTemplateId: null,
      composition: {
        effectInclusions: [],
        sources: [
          {
            sourceInstanceId: 'hp-support',
            servantId: master.servants[0]!.id,
            skills: [{ skillId: 'hp-skill', skillLevel: 1, enabled: true }],
          },
        ],
      },
    },
  };
  const first = calculateScenario(input, master, versions);
  expect(first.result.status, JSON.stringify(first.result.issues)).toBe('inputRequired');
  const maximum = first.inputDefinitions.find((input) => input.kind === 'sourceMaximumHp')!;
  const repaired = applyCanonicalInputCommand(input, {
    kind: 'setCanonicalIntegerInput',
    key: maximum.key,
    value: 10001,
  });
  const result = calculateScenario(repaired, master, versions);
  expect(result.result.status).toBe('calculated');
  const hp = result.appliedPreparationActions.at(-1)?.hpAfter;
  expect(hp?.actors.attacker).toMatchObject({ current: 5500, maximum: 11000 });
  expect(hp?.actors['hp-support']).toMatchObject({ current: 6000, maximum: 10001 });
  const portable = executePortableCalculation(
    createCalculatorPortableRequest(repaired, currentCalculationVersionContext(master)),
    master,
  );
  expect(portable.status).toBe('executed');
  if (portable.status === 'executed') expect(portable.execution.result).toEqual(result.result);
});

it.each([false, true])(
  'admits HP damage dependency independently of capped NP gain (%s)',
  async (withNpGain) => {
    const { calculateRankingPolicyDetail } = await import('./rankingProfileCalculation');
    const { DEFAULT_RANKING_POLICY_CONDITIONS } = await import('./rankingContracts');
    const { master, scenario, versions } = setup([
      effect('hp-loss-only', [...(withNpGain ? [npGain] : []), loss(1000)]),
    ]);
    scenario.targetContext = {
      class: { kind: 'concrete', classId: 'saber' },
      attribute: { kind: 'concrete', attribute: 'man' },
      families: [],
      absentFamilies: [],
    };
    for (const group of master.servants[0]!.noblePhantasmVariantGroups)
      for (const variant of group.variants)
        if (variant.kind === 'attack')
          for (const damage of variant.damage) {
            Object.assign(damage, { kind: 'hpRatioLow', rawFunctionType: 'damageNpHpratioLow' });
            for (const row of damage.parametersByOvercharge)
              for (const parameter of row) parameter.targetId = 6000;
          }
    const used = calculateScenario(scenario, master, versions);
    const omitted = calculateScenario(
      { ...scenario, preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' }] },
      master,
      versions,
    );
    if (used.result.status !== 'calculated' || omitted.result.status !== 'calculated')
      throw new Error('fixture execution failed');
    expect(used.result.rows[0].average).toBeGreaterThan(omitted.result.rows[0].average);
    for (const selfBuffs of ['included', 'excluded'] as const) {
      const ranked = calculateRankingPolicyDetail(
        master.servants[0]!,
        master,
        { servantBuilds: {} },
        { ...DEFAULT_RANKING_POLICY_CONDITIONS, selfBuffs },
        versions,
      );
      expect(ranked.status).toBe('calculated');
      if (ranked.status !== 'calculated') throw new Error(ranked.status);
      const expected = selfBuffs === 'included' ? used.result : omitted.result;
      expect(ranked.detail.result.rows).toEqual(expected.rows);
      const portable = executePortableCalculation(
        createCalculatorPortableRequest(
          ranked.detail.scenario,
          currentCalculationVersionContext(master),
        ),
        master,
      );
      expect(portable.status).toBe('executed');
      if (portable.status === 'executed') expect(portable.execution.result).toEqual(expected);
    }
  },
);

it('retains a separate HP-conditioned damage skill after an ordered writer under baseline policy', async () => {
  const { calculateRankingPolicyDetail } = await import('./rankingProfileCalculation');
  const { DEFAULT_RANKING_POLICY_CONDITIONS } = await import('./rankingContracts');
  const { master, scenario, versions } = setup([effect('loss', [loss(2000)])]);
  const conditional = effect('hp-condition', [
    {
      kind: 'damageModifier',
      modifier: 'attackBuff',
      sign: 1,
      card: null,
      semanticSupport: 'supported',
      values: values(1000),
      valueExpressions: [[], [], [], [], []],
      route: {
        target: 'sourceSelf',
        contributionScope: 'personal',
        eligibility: {
          kind: 'requiredRecipient',
          recipient: 'attacker',
          onMissing: 'ignore',
          onMismatch: 'unsupported',
        },
      },
    },
  ]);
  conditional.requirement.expression = {
    kind: 'quantity',
    quantity: 'attackerHpPermille',
    comparison: 'atMost',
    value: 900,
  };
  master.servants[0]!.skills.push({
    ...master.servants[0]!.skills[0]!,
    id: 'hp-reader',
    slot: 2,
    effects: [conditional],
  });
  master.servants[0]!.actorFormGraph.forms[0]!.skillIds.push('hp-reader');
  scenario.preNoblePhantasmPlan = [
    { kind: 'useSkillSlot', slot: 1, skillLevel: 1, choice: null },
    { kind: 'useSkillSlot', slot: 2, skillLevel: 1, choice: null },
    { kind: 'executeAttackNoblePhantasm' },
  ];
  scenario.targetContext = {
    class: { kind: 'concrete', classId: 'saber' },
    attribute: { kind: 'concrete', attribute: 'man' },
    families: [],
    absentFamilies: [],
  };
  const oracle = calculateScenario(scenario, master, versions);
  const ranked = calculateRankingPolicyDetail(
    master.servants[0]!,
    master,
    { servantBuilds: {} },
    DEFAULT_RANKING_POLICY_CONDITIONS,
    versions,
  );
  expect(oracle.result.status).toBe('calculated');
  expect(ranked.status).toBe('calculated');
  if (ranked.status === 'calculated' && oracle.result.status === 'calculated')
    expect(ranked.detail.result.rows).toEqual(oracle.result.rows);
});

it('keeps a maximum-HP prerequisite for a terminal normal loss even without an HP damage coefficient', async () => {
  const { calculateRankingPolicyDetail } = await import('./rankingProfileCalculation');
  const { DEFAULT_RANKING_POLICY_CONDITIONS } = await import('./rankingContracts');
  const { master, scenario, versions } = setup([
    effect('maximum', [
      {
        kind: 'hpModifier',
        action: 'maximumFixed',
        sign: 1,
        bounds: { minimum: null, maximum: null },
        values: values(5000),
        traits: ['buffMaxHpUp'],
        lifetime: 'active',
        route: {
          target: 'sourceSelf',
          contributionScope: 'personal',
          eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
        },
      },
    ]),
  ]);
  for (const group of master.servants[0]!.noblePhantasmVariantGroups)
    for (const variant of group.variants)
      if (variant.kind === 'attack')
        variant.effects.unshift({
          ...effect('terminal-loss', [loss(12000, 'zero')]),
          timing: 'beforeDamage',
        });
  scenario.targetContext = {
    class: { kind: 'concrete', classId: 'saber' },
    attribute: { kind: 'concrete', attribute: 'man' },
    families: [],
    absentFamilies: [],
  };
  const oracle = calculateScenario(scenario, master, versions);
  expect(oracle.result.status).toBe('calculated');
  const dead = calculateScenario(
    { ...scenario, preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' }] },
    master,
    versions,
  );
  expect(dead.result).toMatchObject({ status: 'unavailable', reason: 'attackerDead' });
  const ranked = calculateRankingPolicyDetail(
    master.servants[0]!,
    master,
    { servantBuilds: {} },
    DEFAULT_RANKING_POLICY_CONDITIONS,
    versions,
  );
  expect(ranked.status).toBe('calculated');
  if (ranked.status === 'calculated' && oracle.result.status === 'calculated')
    expect(ranked.detail.result.rows).toEqual(oracle.result.rows);
});
