import { expect, it } from 'vitest';
import { resolvedScenarioSchema } from '@fgo-lab/schema';
import fixture from '../../test-fixtures/master/fixture.json';
import {
  masterSnapshotSchema,
  masterEffectSchema,
  noblePhantasmEffectSchema,
} from '@fgo-lab/master-data';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { hpProofCoverageInventory } from './productionHpProofCoverage';
import {
  hpCandidateObservationFor,
  preparationHpActionsFor,
} from '@fgo-lab/battle-execution/preparation-audit';
import { battlePointPreparationRejectionObservationFor } from './battlePointPreparationObservation';
import { reconcileHpOperationEvidence } from './productionHpOperationEvidence';
import {
  hpPublishedDependencyBindings,
  reconcileHpPublishedDependencyCoverage,
  type HpPublishedDependencyBinding,
} from './productionHpPublishedDependencyCoverage';
import {
  createDefaultResolvedScenario,
  prepareCalculationScenarioWithPolicy,
  evaluatePreparedCalculationScenario,
  calculateScenario,
} from './scenario';
import { currentCalculationVersionContext } from './portableCalculation';
import { hpPreparationCanonical } from './productionHpPreparationAudit';
import {
  productionAuditTestOptions,
  writeProductionAuditArtifact,
  decodeProductionAuditArtifact,
} from './productionAuditArtifacts';

function setup(
  excluded = false,
  repeated = false,
  alternateNp = false,
  selectedStandard = false,
  ocRate = false,
  nativePreparation = false,
  nestedCondition = false,
  npCondition = false,
) {
  const master = masterSnapshotSchema.parse(fixture);
  const actor = master.servants[0]!;
  const effect = masterEffectSchema.parse({
    id: 'hp-reader',
    occurrenceId: 'hp-reader:0',
    label: 'reader fixture',
    availability: 'allLimitBreakStates',
    inclusionPolicy: { default: 'include' },
    gameActivation: 'skillUse',
    selection: null,
    interaction: null,
    triggerScope: null,
    operationTrigger: null,
    operationReference: null,
    stateIdentity: null,
    proc: { kind: 'guaranteed' },
    inputDefinitions: [],
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
    requirement: {
      recipient: 'sourceSelf',
      expression: {
        kind: 'quantity',
        quantity: 'attackerHpPermille',
        comparison: 'atMost',
        value: 500,
      },
    },
    execution: [
      {
        kind: 'damageModifier',
        modifier: 'attackBuff',
        sign: 1,
        card: null,
        route: {
          target: 'sourceSelf',
          contributionScope: 'personal',
          eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
        },
        values: [Array<number>(10).fill(100), [], [], [], []],
        valueExpressions: [
          Array.from({ length: 10 }, () => ({
            kind: 'inverseHpLinear',
            basePermille: 100,
            bonusAtZeroHpPermille: 200,
          })),
          [],
          [],
          [],
          [],
        ],
        semanticSupport: 'supported',
      },
    ],
  });
  if (repeated)
    effect.requirement.expression = {
      kind: 'all',
      requirements: [effect.requirement.expression, structuredClone(effect.requirement.expression)],
    };
  if (nestedCondition) {
    const leaf = effect.requirement.expression;
    effect.requirement.expression = {
      kind: 'all',
      requirements: [
        { kind: 'any', requirements: [leaf, structuredClone(leaf)] },
        {
          kind: 'not',
          requirement: {
            kind: 'quantity',
            quantity: 'attackerHpPermille',
            comparison: 'atLeast',
            value: 501,
          },
        },
      ],
    };
  }
  const selectedEffect = nativePreparation
    ? masterEffectSchema.parse({
        ...effect,
        execution: [
          {
            kind: 'hpModifier',
            action: 'receive',
            sign: 1,
            route: {
              target: 'sourceSelf',
              contributionScope: 'personal',
              eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
            },
            bounds: { minimum: null, maximum: null },
            traits: [],
            values: [[100], [], [], [], []],
            lifetime: 'active',
            useCondition: {
              kind: 'quantity',
              quantity: 'attackerHpPermille',
              comparison: 'atMost',
              value: 400,
            },
          },
          {
            kind: 'resourceMutation',
            resource: 'hp',
            direction: 'gain',
            unit: 'fixed',
            recipient: 'sourceSelf',
            subjectId: null,
            amount: { kind: 'fixed', values: [[100], [], [], [], []] },
          },
          {
            kind: 'resourceMutation',
            resource: 'npGauge',
            direction: 'gain',
            unit: 'fixed',
            recipient: 'sourceSelf',
            subjectId: null,
            amount: { kind: 'fixed', values: [[100], [], [], [], []] },
          },
        ],
      })
    : effect;
  actor.skills = [
    {
      id: 'reader-skill',
      name: 'reader',
      slot: 1,
      priority: 1,
      detail: '',
      imageKey: null,
      resourceRequirement: null,
      effects: [selectedEffect],
    },
  ];
  actor.passives = [];
  actor.actorFormGraph.forms[0]!.skillIds = ['reader-skill'];
  for (const group of actor.noblePhantasmVariantGroups)
    for (const variant of group.variants)
      if (variant.kind === 'attack') {
        variant.effects = [];
        variant.damage = variant.damage.map((damage) => ({
          ...damage,
          kind: 'hpRatioLow',
          rawFunctionType: 'damageNpHpratioLow',
        }));
        for (const damage of variant.damage)
          for (const row of damage.parametersByOvercharge)
            for (const parameter of row) parameter.targetId = 1000;
      }
  if (alternateNp) {
    const group = actor.noblePhantasmVariantGroups[0]!;
    const base = group.variants[0]!;
    group.variants.push({
      ...structuredClone(base),
      canonicalId: 'fixture-alternate-np',
      ref: { ...base.ref, noblePhantasmId: 'fixture-alternate-np' },
    });
    if (selectedStandard && base.kind === 'attack')
      base.damage = base.damage.map((damage) => ({
        ...damage,
        kind: 'standard' as const,
        rawFunctionType: 'damageNp',
      }));
  }
  if (ocRate) {
    const variant = actor.noblePhantasmVariantGroups[0]!.variants[0]!;
    const cell = {
      applicationRatePermille: 1000,
      turns: { kind: 'finite' as const, remaining: 1 },
      uses: { kind: 'unlimited' as const },
      amount: { kind: 'inverseHpLinear' as const, basePermille: 0, bonusAtZeroHpPermille: 400 },
    };
    variant.effects = [
      noblePhantasmEffectSchema.parse({
        ...effect,
        id: 'fixture-oc-rate',
        occurrenceId: 'fixture-oc-rate:0',
        gameActivation: 'npBeforeDamage',
        timing: 'beforeDamage',
        requirement: {
          recipient: 'sourceSelf',
          expression: npCondition
            ? {
                kind: 'all',
                requirements: [
                  effect.requirement.expression,
                  structuredClone(effect.requirement.expression),
                ],
              }
            : { kind: 'always' },
        },
        execution: [
          {
            kind: 'grantOcApplicationRate',
            route: {
              target: 'sourceSelf',
              contributionScope: 'personal',
              eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
            },
            lifetime: 'active',
            stacking: 'additive',
            stateTraits: ['positive', 'grantSuccessUp'],
            role: 'casterGrant',
            sign: 1,
            selector: 'positive',
            cells: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => cell)),
          },
        ],
      }),
    ];
  }
  master.servants = [actor];
  master.craftEssences = [];
  master.mysticCodes = [];
  const scenario = {
    ...createDefaultResolvedScenario(master, undefined, actor),
    attackerHpPermille: excluded ? null : 500,
    preNoblePhantasmPlan: [
      { kind: 'useSkillSlot' as const, slot: 1 as const, skillLevel: 1, choice: null },
      { kind: 'executeAttackNoblePhantasm' as const },
    ],
  };
  const policy = excluded
    ? {
        kind: 'ranking' as const,
        selfBuffs: 'excluded' as const,
        conditionalEffects: 'baseline' as const,
        areaView: 'included' as const,
      }
    : { kind: 'calculator' as const };
  const prepared = prepareCalculationScenarioWithPolicy(scenario, master, policy, {}, true);
  const versions = {
    ...currentCalculationVersionContext(master),
    appVersion: '0.1.0',
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const calculation = evaluatePreparedCalculationScenario(prepared, versions);
  const requests = [{ prepared, calculation }];
  const declarations = hpProofCoverageInventory(master);
  const borrowed = hpPublishedDependencyBindings(declarations, requests);
  const reconcile = (bindings: readonly HpPublishedDependencyBinding[] = borrowed.bindings) =>
    reconcileHpPublishedDependencyCoverage(declarations, requests, bindings);
  return {
    master,
    scenario,
    versions,
    prepared,
    calculation,
    requests,
    declarations,
    borrowed,
    reconcile,
  };
}

it(
  'links native preparation HP reads to distinct original leaves and the filtered modifier',
  productionAuditTestOptions(['hp-native-condition-reads.json']),
  async ({ task }) => {
    const f = setup(false, true, false, false, false, true);
    const evidence = reconcileHpOperationEvidence(f.declarations, f.requests);
    expect(evidence.gate.failures).toEqual([]);
    expect(f.calculation.result.status).toBe('calculated');
    expect(
      evidence.preparationConditionReads.map((row) => [
        row.declaration.kind,
        row.declaration.path,
        row.readIndex,
        row.conditionOutcome,
        row.transaction,
      ]),
    ).toEqual([
      ['condition', 'requirement.expression.requirements.0', 0, true, 'committed'],
      [
        'hpConditionedNpGauge',
        'execution.2:requirement.expression.requirements.0',
        0,
        true,
        'committed',
      ],
      ['condition', 'requirement.expression.requirements.1', 1, true, 'committed'],
      [
        'hpConditionedNpGauge',
        'execution.2:requirement.expression.requirements.1',
        1,
        true,
        'committed',
      ],
      ['modifierUseCondition', 'execution.0.useCondition', 0, false, 'committed'],
    ]);
    expect(
      evidence.preparationConditionReads
        .filter((row) => row.declaration.kind === 'hpConditionedNpGauge')
        .map((row) => [row.declaredOperationIndex, row.declaredOperationReached]),
    ).toEqual([
      [2, true],
      [2, true],
    ]);
    const modifier = evidence.preparationConditionReads.find(
      (row) => row.declaration.kind === 'modifierUseCondition',
    )!;
    expect(modifier.writerSourceInstanceId).toBe(modifier.sourceInstanceId);
    expect(modifier.writerOperationIndex).toBe(0);
    expect(modifier.modifierInstanceId).not.toBeNull();
    const transport = battlePointPreparationRejectionObservationFor(f.prepared)!;
    const action = transport.transitions
      .flatMap((transition) => preparationHpActionsFor(transition.result) ?? [])
      .find((item) => item.conditionReads.length > 0)!;
    const source = action.conditionReads.find((item) => item.kind === 'source')!;
    source.reads[1]!.expectedValue = 499;
    const negative = reconcileHpOperationEvidence(f.declarations, f.requests).gate;
    expect(
      negative.failures.some((item) => item.reason === 'preparationConditionReadMismatch'),
    ).toBe(true);
    expect(negative.firstDifference).not.toBeNull();
    source.reads[1]!.expectedValue = 500;
    const removed = source.reads.pop()!;
    const missing = reconcileHpOperationEvidence(f.declarations, f.requests).gate;
    expect(missing.failures.some((item) => item.path.endsWith('.count'))).toBe(true);
    source.reads.push(removed);
    const omitted = action.conditionReads.shift()!;
    const missingEvaluation = reconcileHpOperationEvidence(f.declarations, f.requests).gate;
    expect(missingEvaluation.failures.some((item) => item.path.endsWith('.conditionCount'))).toBe(
      true,
    );
    expect(missingEvaluation.firstDifference).not.toBeNull();
    action.conditionReads.unshift(omitted);
    const complete = {
      originalRequest: f.prepared.scenario,
      orderedPlan: f.prepared.orderedScenario,
      evidence,
      negative,
      missing,
      missingEvaluation,
    };
    await writeProductionAuditArtifact(task.meta, 'hp-native-condition-reads.json', complete);
    const disk = await readFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR']!, 'hp-native-condition-reads.json'),
    );
    expect(decodeProductionAuditArtifact(disk)).toEqual(complete);
  },
);

it(
  'connects original reader-only capture without widening the fixedSelf selector',
  productionAuditTestOptions(['hp-published-dependency-fixture.json']),
  async ({ task }) => {
    const f = setup();
    expect(hpPreparationCanonical(f.prepared)).toBe(null);
    expect(f.borrowed.failures).toEqual([]);
    const ledger = f.reconcile();
    expect(ledger.gate.failures).toEqual([]);
    expect(ledger.productClosure).toBe(false);
    expect(ledger.consumerPlans[0]?.disposition).toBe('orderedConsumerPlan');
    expect(
      ledger.consumerPlans[0]?.consumers.filter(
        (consumer) => consumer.disposition === 'physicalRead',
      ),
    ).toHaveLength(3);
    expect(
      ledger.consumerPlans[0]?.consumers.filter(
        (consumer) => consumer.disposition === 'cellNotSelected',
      ),
    ).toHaveLength(9);
    expect(f.calculation.result).toEqual(
      calculateScenario(f.scenario, f.master, f.versions).result,
    );
    expect(ledger.bindings.some((b) => b.stage === 'actualConditionRead')).toBe(true);
    expect(ledger.bindings.some((b) => b.stage === 'actualValueRead')).toBe(true);
    expect(
      ledger.bindings.some(
        (b) =>
          b.stage === 'npEvaluation' &&
          'disposition' in b.detail &&
          b.detail.disposition === 'consumed',
      ),
    ).toBe(true);
    const expressionRows = ledger.declarations.filter((d) => d.identity.kind === 'valueExpression');
    expect(expressionRows).toHaveLength(10);
    expect(expressionRows.every((d) => isDeepStrictEqual(d.directScenarioOwnerRequests, [0]))).toBe(
      true,
    );
    expect(
      ledger.declarations
        .filter((d) => d.identity.kind === 'hpRatioLow')
        .every((d) => isDeepStrictEqual(d.directScenarioOwnerRequests, [0])),
    ).toBe(true);
    expect(
      expressionRows.filter((d) =>
        d.stages.some(
          (s) => s.stage === 'selectedPreparationCell' && s.observation === 'connected',
        ),
      ),
    ).toHaveLength(1);
    expect(
      expressionRows.every(
        (d) =>
          d.stages.find((s) => s.stage === 'actualConditionRead')?.observation === 'unobserved',
      ),
    ).toBe(true);
    expect(ledger.bindings.some((binding) => binding.stage === 'actualValueRead')).toBe(true);
    await writeProductionAuditArtifact(task.meta, 'hp-published-dependency-fixture.json', ledger);
    const disk = await readFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR']!, 'hp-published-dependency-fixture.json'),
    );
    expect(isDeepStrictEqual(decodeProductionAuditArtifact(disk), ledger)).toBe(true);
  },
);

it('records an executable request with no ordered HP consumer without inferring a read', () => {
  const f = setup(false, false, true, true);
  const actor = f.master.servants[0]!;
  actor.skills = [];
  actor.actorFormGraph.forms[0]!.skillIds = [];
  for (const group of actor.noblePhantasmVariantGroups)
    for (const variant of group.variants)
      if (variant.kind === 'attack')
        variant.damage = variant.damage.map((damage) => ({
          ...damage,
          kind: 'standard' as const,
          rawFunctionType: 'damageNp',
        }));
  const declarations = hpProofCoverageInventory(f.master);
  const scenario = {
    ...f.scenario,
    preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' as const }],
  };
  const prepared = prepareCalculationScenarioWithPolicy(
    scenario,
    f.master,
    { kind: 'calculator' },
    {},
    true,
  );
  const calculation = evaluatePreparedCalculationScenario(prepared, f.versions);
  const requests = [{ prepared, calculation }];
  const bindings = hpPublishedDependencyBindings(declarations, requests);
  const ledger = reconcileHpPublishedDependencyCoverage(declarations, requests, bindings.bindings);
  expect(prepared.status).toBe('executable');
  expect(ledger.gate.failures).toEqual([]);
  expect(ledger.consumerPlans).toEqual([
    { requestIndex: 0, disposition: 'noDownstreamConsumer', consumers: [] },
  ]);
  const rejected = prepareCalculationScenarioWithPolicy(
    { ...scenario, preNoblePhantasmPlan: [] },
    f.master,
    { kind: 'calculator' },
    {},
    true,
  );
  const rejectedRequests = [
    { prepared: rejected, calculation: evaluatePreparedCalculationScenario(rejected, f.versions) },
  ];
  const rejectedBindings = hpPublishedDependencyBindings(declarations, rejectedRequests);
  const rejectedLedger = reconcileHpPublishedDependencyCoverage(
    declarations,
    rejectedRequests,
    rejectedBindings.bindings,
  );
  expect(rejected.status).toBe('rejected');
  expect(rejectedLedger.consumerPlans).toEqual([
    { requestIndex: 0, disposition: 'noOrderedPlan', consumers: [] },
  ]);
});

it('rejects a missing ordered event from a ready selected candidate', () => {
  const f = setup();
  const target = f.calculation.executionObservation?.targetExecution;
  expect(target?.selection).toBe('selected');
  if (target?.selection !== 'selected') throw new Error('selected candidate missing');
  expect(target.candidateState?.preflight).toEqual({ status: 'ready' });
  target.operationEvents = [];
  const gate = reconcileHpPublishedDependencyCoverage(
    f.declarations,
    f.requests,
    f.borrowed.bindings,
  ).gate;
  expect(gate.failures.some((failure) => failure.reason === 'candidateEventMismatch')).toBe(true);
});

it(
  'keeps a schema-parsed preflight abort distinct from missing HP capture',
  productionAuditTestOptions(['hp-preflight-abort.json']),
  async ({ task }) => {
    const f = setup();
    const scenario = resolvedScenarioSchema.parse({
      ...f.scenario,
      targetContext: {
        ...f.scenario.targetContext,
        class: { kind: 'concrete', classId: 'saber' },
        attribute: { kind: 'concrete', attribute: 'man' },
      },
      activationFacts: [
        {
          kind: 'sourceQuantity',
          source: { origin: 'support', sourceInstanceId: 'orphan:hp', skillId: null },
          quantity: 'battlePointRate',
          subjectId: 'orphan',
          comparison: 'atLeast',
          value: 1,
        },
      ],
    });
    const prepared = prepareCalculationScenarioWithPolicy(
      scenario,
      f.master,
      { kind: 'calculator' },
      {},
      true,
    );
    const calculation = evaluatePreparedCalculationScenario(prepared, f.versions);
    const requests = [{ prepared, calculation }];
    const bindings = hpPublishedDependencyBindings(f.declarations, requests);
    const published = reconcileHpPublishedDependencyCoverage(
      f.declarations,
      requests,
      bindings.bindings,
    );
    const operation = reconcileHpOperationEvidence(f.declarations, requests);
    expect(prepared.status).toBe('executable');
    expect(prepared.orderedScenario?.operations.length).toBeGreaterThan(0);
    expect(calculation.executionObservation?.targetExecution?.selection).toBe('selected');
    expect(calculation.result.status).toBe('unsupported');
    expect(published.consumerPlans[0]?.disposition).toBe('orderedConsumerPlan');
    expect(
      published.consumerPlans[0]?.consumers.some(
        (item) => item.disposition === 'consumerNotReached',
      ),
    ).toBe(true);
    expect(published.gate.failures).toEqual([]);
    expect(operation.gate.failures).toEqual([]);
    const preflight = calculation.executionObservation?.targetExecution;
    expect(preflight?.selection).toBe('selected');
    if (preflight?.selection !== 'selected') throw new Error('selected candidate missing');
    expect(preflight.candidateState?.preflight).toMatchObject({
      status: 'aborted',
      issues: [{ kind: 'invalidActivationContext', detail: 'unknownFact' }],
    });
    const originalPreflight = preflight.candidateState?.preflight;
    preflight.candidateState!.preflight = { status: 'ready' };
    const negativePublished = reconcileHpPublishedDependencyCoverage(
      f.declarations,
      requests,
      bindings.bindings,
    ).gate;
    const negativeOperation = reconcileHpOperationEvidence(f.declarations, requests).gate;
    expect(negativePublished.failures).toContainEqual({
      reason: 'missingCapture',
      path: 'requests.0.candidates.0',
    });
    expect(negativeOperation.failures.some((failure) => failure.reason === 'missingCapture')).toBe(
      true,
    );
    expect(negativeOperation.firstDifference).not.toBeNull();
    preflight.candidateState!.preflight = originalPreflight!;
    await writeProductionAuditArtifact(task.meta, 'hp-preflight-abort.json', {
      scenario,
      result: calculation.result,
      plan: published.consumerPlans,
      publishedGate: published.gate,
      operationGate: operation.gate,
      preflight: preflight.candidateState?.preflight,
      negativePublished,
      negativeOperation,
    });
    const bytes = await readFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR']!, 'hp-preflight-abort.json'),
    );
    expect(decodeProductionAuditArtifact(bytes)).toMatchObject({
      scenario,
      plan: published.consumerPlans,
      publishedGate: published.gate,
      operationGate: operation.gate,
      negativePublished,
      negativeOperation,
    });
  },
);

it(
  'rejects missing, duplicate, unmatched, equal foreign bindings and altered identity/detail',
  productionAuditTestOptions(['hp-published-dependency-negatives.json']),
  async ({ task }) => {
    const f = setup();
    const bindings = f.borrowed.bindings;
    const index = bindings.findIndex((b) => b.stage === 'actualConditionRead');
    const original = bindings[index]!;
    const negatives: ReturnType<typeof f.reconcile>[] = [];
    const reasons = (changed: readonly HpPublishedDependencyBinding[]) => {
      const result = f.reconcile(changed);
      negatives.push(result);
      return result.gate.failures.map((x) => x.reason);
    };
    expect(reasons(bindings.filter((_, i) => i !== index))).toContain('missingBinding');
    expect(reasons([...bindings, original])).toContain('duplicateBinding');
    for (const [changed, reason] of [
      [{ ...original, requestIndex: 99 }, 'unmatchedBinding'],
      [{ ...original, declaration: structuredClone(original.declaration) }, 'foreignDeclaration'],
      [{ ...original, reference: { ...original.reference } }, 'foreignReference'],
      [
        { ...original, operation: original.operation && { ...original.operation } },
        'foreignReference',
      ],
      [{ ...original, family: 'fixedSelf' }, 'bindingMismatch'],
      [{ ...original, actor: 'support' }, 'bindingMismatch'],
      [{ ...original, recipient: 'partyMember' }, 'bindingMismatch'],
      [{ ...original, sourceInstanceId: 'foreign' }, 'bindingMismatch'],
      [{ ...original, group: 99 }, 'bindingMismatch'],
      [{ ...original, detail: { ...original.detail, evaluated: 'excluded' } }, 'bindingMismatch'],
      [
        {
          ...original,
          detail: { ...original.detail, transaction: 'rolledBack', modifierConsumed: true },
        },
        'bindingMismatch',
      ],
    ] as const) {
      const values = [...bindings];
      // Wrong family is injected at the test boundary, not added to the accepted union.
      values[index] = changed as HpPublishedDependencyBinding;
      expect(reasons(values)).toContain(reason);
    }
    expect(reasons([...bindings].reverse())).toContain('orderMismatch');
    expect(
      reconcileHpPublishedDependencyCoverage(
        [...f.declarations, f.declarations[0]!],
        f.requests,
        bindings,
      ).gate.failures.map((x) => x.reason),
    ).toContain('duplicateDeclaration');
    expect(
      reconcileHpPublishedDependencyCoverage(
        f.declarations.filter((d) => d !== original.declaration),
        f.requests,
        bindings,
      ).gate.failures.map((x) => x.reason),
    ).toContain('unmatchedCanonical');
    expect(negatives.every((n) => !n.gate.passed && n.gate.firstDifference !== null)).toBe(true);
    await writeProductionAuditArtifact(
      task.meta,
      'hp-published-dependency-negatives.json',
      negatives,
    );
    const disk = await readFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR']!, 'hp-published-dependency-negatives.json'),
    );
    expect(isDeepStrictEqual(decodeProductionAuditArtifact(disk), negatives)).toBe(true);
  },
);

it('keeps normal NP exclusion and absent request stages distinct from consumption and declaration counts', () => {
  const f = setup(true);
  const ledger = f.reconcile();
  expect(ledger.gate.failures).toEqual([]);
  const nps = ledger.bindings.filter((b) => b.stage === 'npEvaluation');
  expect(nps).not.toHaveLength(0);
  expect(nps.every((b) => 'disposition' in b.detail && b.detail.disposition === 'excluded')).toBe(
    true,
  );
  const absent = reconcileHpPublishedDependencyCoverage(f.declarations, [], []);
  expect(absent.gate.passed).toBe(true);
  expect(absent.requestCount).toBe(0);
  expect(absent.declarations.every((d) => d.directScenarioOwnerRequests.length === 0)).toBe(true);
  expect(
    absent.declarations.every((d) => d.stages.every((s) => s.observation === 'unobserved')),
  ).toBe(true);
  expect(absent.productClosure).toBe(false);
});

it('proves an unselected NP variant through the original selected sibling and its NP capture', () => {
  const f = setup(false, false, true);
  const ledger = f.reconcile();
  expect(ledger.gate.failures).toEqual([]);
  const variants = ledger.declarations.filter((d) => d.identity.kind === 'hpRatioLow');
  expect(variants).toHaveLength(2);
  const selected = variants.find((d) => d.npVariantSelections[0]?.disposition === 'selected');
  const other = variants.find(
    (d) => d.npVariantSelections[0]?.disposition === 'otherVariantSelected',
  );
  expect(selected).toBeDefined();
  expect(other?.npVariantSelections).toMatchObject([
    {
      requestIndex: 0,
      disposition: 'otherVariantSelected',
      selectedVariant: selected?.identity.variant,
    },
  ]);
  const proof = other?.npVariantSelections[0];
  expect(proof && 'canonicalBinding' in proof && 'evaluationBinding' in proof).toBe(true);
  expect(other?.stages.find((stage) => stage.stage === 'canonicalNp')?.observation).toBe(
    'connected',
  );
  expect(other?.stages.find((stage) => stage.stage === 'npEvaluation')?.observation).toBe(
    'unobserved',
  );

  const withoutEvaluation = f.borrowed.bindings.filter(
    (binding) => binding.stage !== 'npEvaluation',
  );
  const incomplete = f.reconcile(withoutEvaluation);
  expect(incomplete.gate.failures.map((failure) => failure.reason)).toContain('missingBinding');
  expect(
    incomplete.declarations.find(
      (d) =>
        d.identity.kind === 'hpRatioLow' &&
        d.identity.variant?.canonicalId === selected?.identity.variant?.canonicalId,
    )?.npVariantSelections[0]?.disposition,
  ).toBe('unobserved');

  if (f.prepared.status !== 'executable' || !f.prepared.resolved.noblePhantasmVariant)
    throw new Error('fixture_selected_variant_missing');
  const forged = {
    ...f.prepared,
    resolved: {
      ...f.prepared.resolved,
      noblePhantasmVariant: {
        ...f.prepared.resolved.noblePhantasmVariant,
        canonicalId: 'foreign-variant',
      },
    },
  };
  expect(
    reconcileHpPublishedDependencyCoverage(
      f.declarations,
      [{ prepared: forged, calculation: f.calculation }],
      [],
    ).gate.failures.map((failure) => failure.reason),
  ).toContain('npVariantSelectionMismatch');
});

it('keeps a selected standard NP outside HP evaluation proof without rejecting a valid variant', () => {
  const f = setup(false, false, true, true);
  const ledger = f.reconcile();
  expect(ledger.gate.failures).toEqual([]);
  const hpVariant = ledger.declarations.find((d) => d.identity.kind === 'hpRatioLow');
  expect(hpVariant?.npVariantSelections).toMatchObject([
    {
      requestIndex: 0,
      disposition: 'unobserved',
      reason: 'selectedVariantHasNoHpDeclaration',
    },
  ]);
});

it('connects the selected NP OC-rate cell and proves terminal nonconsumption separately from other cells', () => {
  const f = setup(false, false, false, false, true);
  const ledger = f.reconcile();
  expect(ledger.gate.failures).toEqual([]);
  const cells = ledger.declarations.filter((d) => d.identity.kind === 'ocRateExpression');
  expect(cells).toHaveLength(25);
  expect(
    cells.flatMap((d) => d.ocRateSelections).filter((s) => s.disposition === 'selectedCommitted'),
  ).toMatchObject([
    {
      requestIndex: 0,
      reached: true,
      nativeStatus: 'committed',
      appended: 1,
      actualRead: 'noLaterGrantInTerminalAction',
    },
  ]);
  expect(
    cells.flatMap((d) => d.ocRateSelections).filter((s) => s.disposition === 'otherCellSelected'),
  ).toHaveLength(24);
  expect(ledger.bindings.filter((b) => b.declaration.kind === 'ocRateExpression')).toHaveLength(1);
});

it('fails closed on missing, duplicate and foreign selected OC-rate capture', () => {
  const f = setup(false, false, false, false, true);
  const selected = f.borrowed.bindings.find(
    (binding) => binding.declaration.identity.kind === 'ocRateExpression',
  )!;
  const without = f.borrowed.bindings.filter((binding) => binding !== selected);
  const reasons = (bindings: readonly HpPublishedDependencyBinding[]) =>
    f.reconcile(bindings).gate.failures.map((failure) => failure.reason);
  expect(reasons(without)).toContain('missingBinding');
  expect(reasons([...f.borrowed.bindings, selected])).toContain('duplicateBinding');
  expect(
    reasons(
      f.borrowed.bindings.map((binding) =>
        binding === selected ? { ...binding, requestIndex: 99 } : binding,
      ),
    ),
  ).toContain('unmatchedBinding');
  for (const changed of [
    { ...selected, reference: { ...selected.reference } },
    { ...selected, family: 'other' },
    { ...selected, actor: 'foreign' },
    { ...selected, recipient: 'foreign' },
    { ...selected, sourceInstanceId: 'foreign' },
    { ...selected, detail: { ...selected.detail, steps: [] } },
    { ...selected, detail: { ...selected.detail, native: { status: 'rejected' } } },
  ]) {
    const bindings = f.borrowed.bindings.map((binding) =>
      binding === selected ? (changed as HpPublishedDependencyBinding) : binding,
    );
    expect(f.reconcile(bindings).gate.passed).toBe(false);
  }
  expect(reasons([...f.borrowed.bindings].reverse())).toContain('orderMismatch');
  if (f.prepared.status !== 'executable' || !f.prepared.resolved.noblePhantasmVariant)
    throw new Error('fixture_oc_selected_variant_missing');
  const foreign = {
    ...f.prepared,
    resolved: {
      ...f.prepared.resolved,
      noblePhantasmVariant: {
        ...f.prepared.resolved.noblePhantasmVariant,
        canonicalId: 'foreign-variant',
      },
    },
  };
  expect(
    reconcileHpPublishedDependencyCoverage(
      f.declarations,
      [{ prepared: foreign, calculation: f.calculation }],
      f.borrowed.bindings,
    ).gate.failures.map((failure) => failure.reason),
  ).toContain('npVariantSelectionMismatch');
});

it('rejects incomplete requests and equal foreign request/candidate capture owners', () => {
  const f = setup();
  const incomplete = reconcileHpPublishedDependencyCoverage(
    f.declarations,
    [{ prepared: f.prepared }],
    [],
  );
  expect(incomplete.gate.failures.map((x) => x.reason)).toContain('requestOwnerMismatch');
  if (f.prepared.status !== 'executable' || !f.prepared.executionObservation)
    throw new Error('fixture_missing_observation');
  const foreign = { ...f.prepared, executionObservation: { ...f.prepared.executionObservation } };
  expect(
    reconcileHpPublishedDependencyCoverage(
      f.declarations,
      [{ prepared: foreign, calculation: f.calculation }],
      [],
    ).gate.failures.map((x) => x.reason),
  ).toContain('requestOwnerMismatch');
  expect(
    hpPublishedDependencyBindings(f.declarations, [
      { prepared: { ...f.prepared }, calculation: f.calculation },
    ]).failures.map((x) => x.reason),
  ).toContain('missingCapture');
  expect(
    hpPublishedDependencyBindings(f.declarations, [
      { prepared: f.prepared, calculation: { ...f.calculation } },
    ]).failures.map((x) => x.reason),
  ).toContain('requestOwnerMismatch');
  const target = f.prepared.executionObservation.targetExecution;
  if (target?.selection !== 'selected' || !target.candidateState)
    throw new Error('fixture_missing_candidate');
  const copied = {
    ...f.prepared,
    executionObservation: {
      ...f.prepared.executionObservation,
      targetExecution: { ...target, candidateState: { ...target.candidateState } },
    },
  };
  expect(
    hpPublishedDependencyBindings(f.declarations, [
      { prepared: copied, calculation: f.calculation },
    ]).failures.map((x) => x.reason),
  ).toContain('missingCapture');
});

it('distinguishes equal condition leaves and rejects a foreign NP declaration value', () => {
  const repeated = setup(false, true);
  expect(repeated.reconcile().gate.failures).toEqual([]);
  expect(
    repeated
      .reconcile()
      .bindings.filter((binding) => binding.stage === 'actualConditionRead')
      .map((binding) => binding.declaration.path),
  ).toEqual(['requirement.expression.requirements.0', 'requirement.expression.requirements.1']);
  const f = setup();
  const declarations = f.declarations.map((d) =>
    d.identity.kind === 'hpRatioLow' ? { ...d, value: structuredClone(d.value) } : d,
  );
  expect(
    reconcileHpPublishedDependencyCoverage(declarations, f.requests, []).gate.failures.map(
      (x) => x.reason,
    ),
  ).toContain('unmatchedCanonical');
  const foreignInventory = structuredClone(f.declarations);
  const foreignBindings = hpPublishedDependencyBindings(foreignInventory, f.requests);
  expect(
    reconcileHpPublishedDependencyCoverage(
      foreignInventory,
      f.requests,
      foreignBindings.bindings,
    ).gate.failures.map((x) => x.reason),
  ).toContain('foreignDeclaration');
});

it(
  'proves candidate HP leaf identity and read order from an original nested request',
  productionAuditTestOptions(['hp-candidate-condition-leaf-identity.json']),
  async ({ task }) => {
    const f = setup(false, false, false, false, false, false, true);
    expect(masterEffectSchema.safeParse(f.master.servants[0]!.skills[0]!.effects[0]).success).toBe(
      true,
    );
    const target = f.calculation.executionObservation?.targetExecution;
    if (target?.selection !== 'selected' || !target.candidateState)
      throw new Error('selected_candidate_missing');
    const capture = hpCandidateObservationFor(target.candidateState);
    if (!capture) throw new Error('candidate_hp_capture_missing');
    const positive = f.reconcile();
    expect(positive.gate.failures).toEqual([]);
    const conditionPaths = positive.bindings
      .filter((binding) => binding.stage === 'actualConditionRead')
      .map((binding) => binding.declaration.path);
    expect(conditionPaths).toEqual([
      'requirement.expression.requirements.0.requirements.0',
      'requirement.expression.requirements.0.requirements.1',
      'requirement.expression.requirements.1.requirement',
    ]);
    const removed = capture.reads.splice(1, 1)[0]!;
    const missing = f.reconcile().gate;
    capture.reads.splice(1, 0, removed);
    const first = capture.reads[0]!,
      second = capture.reads[1]!;
    capture.reads[0] = second;
    capture.reads[1] = first;
    const swapped = f.reconcile().gate;
    capture.reads[0] = first;
    capture.reads[1] = second;
    const originalLeaf = first.leaf;
    first.leaf = structuredClone(originalLeaf);
    const foreignEqualLeaf = f.reconcile().gate;
    first.leaf = originalLeaf;
    const operation = f.prepared.orderedScenario!.operations.find(
      (item) => item.source.effectId === 'hp-reader',
    )!;
    const originalCondition = operation.condition;
    operation.condition = { kind: 'always' };
    const changedTree = f.reconcile().gate;
    operation.condition = originalCondition;
    for (const gate of [missing, swapped, foreignEqualLeaf, changedTree]) {
      expect(gate.passed).toBe(false);
      expect(gate.failures.some((failure) => failure.reason === 'conditionReadMismatch')).toBe(
        true,
      );
      expect(gate.failures.some((failure) => failure.firstDifference?.identity)).toBe(true);
    }
    const complete = {
      originalRequest: f.prepared.scenario,
      orderedPlan: f.prepared.orderedScenario,
      operationEvents: target.operationEvents,
      executionGroups: target.candidateState.executionGroups,
      conditionPaths,
      positive,
      missing,
      swapped,
      foreignEqualLeaf,
      changedTree,
    };
    await writeProductionAuditArtifact(
      task.meta,
      'hp-candidate-condition-leaf-identity.json',
      complete,
    );
    const disk = await readFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR']!, 'hp-candidate-condition-leaf-identity.json'),
    );
    expect(decodeProductionAuditArtifact(disk)).toEqual(complete);
  },
);

it('keeps selected native NP conditions outside the candidate read obligation', () => {
  const f = setup(false, false, false, false, true, false, false, true);
  const coverage = f.reconcile();
  expect(coverage.gate.failures).toEqual([]);
  const npConditionBindings = coverage.bindings.filter(
    (binding) => binding.declaration.origin === 'np' && binding.declaration.kind === 'condition',
  );
  expect(npConditionBindings.map((binding) => [binding.stage, binding.declaration.path])).toEqual([
    ['selectedPreparationCell', 'requirement.expression.requirements.0'],
    ['selectedPreparationCell', 'requirement.expression.requirements.1'],
  ]);
  expect(
    f.prepared.orderedScenario?.operations.some(
      (operation) => operation.source.effectId === 'fixture-oc-rate',
    ),
  ).toBe(false);
});
