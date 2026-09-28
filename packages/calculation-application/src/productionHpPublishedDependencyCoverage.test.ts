import { expect, it } from 'vitest';
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
  actor.skills = [
    {
      id: 'reader-skill',
      name: 'reader',
      slot: 1,
      priority: 1,
      detail: '',
      imageKey: null,
      resourceRequirement: null,
      effects: [effect],
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
        requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
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
    expect(ledger.unobserved).toContain('valueExpressionActualRead');
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

it('fails closed on ambiguous equal condition leaves and a foreign NP declaration value', () => {
  const repeated = setup(false, true);
  expect(repeated.reconcile().gate.failures.map((x) => x.reason)).toContain('ambiguousCanonical');
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
