import { preparationExecutionStateFor } from '@fgo-lab/battle-execution';
import { expect, it } from 'vitest';
import { isDeepStrictEqual } from 'node:util';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema, type MasterDataSnapshot } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import {
  createDefaultResolvedScenario,
  prepareCalculationScenarioWithPolicy,
  evaluatePreparedCalculationScenario,
} from './scenario';
import {
  hpPreparationSelection,
  hpPreparationProgram,
  hpPreparationSource,
  hpDiagnosticSource,
  auditHpPreparation,
  auditPublishedHpPreparation,
} from './productionHpPreparationAudit';
import { hpProofCoverageInventory, fixedSelfHpProofCoverage } from './productionHpProofCoverage';
import {
  productionAuditTestOptions,
  writeProductionAuditArtifact,
  encodeProductionAuditDiagnostic,
  decodeProductionAuditDiagnostic,
  decodeStoredProductionAuditArtifact,
  readStoredProductionAuditArtifact,
} from './productionAuditArtifacts';

const base = masterSnapshotSchema.parse(fixture);
type Spec = {
  name: string;
  initial: number;
  writes: number[][];
  final: number;
  floor?: 'zero' | 'oneIfAlive';
  choice?: boolean;
  omitted?: boolean;
  noReader?: boolean;
  noNp?: boolean;
  disabled?: boolean;
};
const specs: Spec[] = [
  { name: 'gain-continuous-ratio', initial: 333, writes: [[731]], final: 4064, choice: true },
  { name: 'loss', initial: 800, writes: [[-2345]], final: 5663 },
  { name: 'maximum-clamp', initial: 900, writes: [[5000]], final: 10010 },
  {
    name: 'alive-floor',
    initial: 200,
    writes: [[-9000]],
    final: 1,
    floor: 'oneIfAlive',
    omitted: true,
  },
  { name: 'same-occurrence-multiple', initial: 500, writes: [[800, -1234, 111]], final: 4682 },
  { name: 'prior-commit-start', initial: 500, writes: [[1200], [-700, 91]], final: 5596 },
  { name: 'no-op-amount', initial: 600, writes: [[0]], final: 6006 },
  { name: 'full-gain-no-op', initial: 1000, writes: [[1000]], final: 10010 },
  { name: 'no-reader', initial: 500, writes: [[800]], final: 5805, noReader: true },
  { name: 'standard-np-boundary', initial: 500, writes: [[800]], final: 5805, noNp: true },
  { name: 'initial-dead-no-op', initial: 0, writes: [[800]], final: 0 },
  { name: 'dead-np-boundary', initial: 500, writes: [[-9000]], final: 0, floor: 'zero' },
  { name: 'disabled-writer', initial: 500, writes: [[1000]], final: 5005, disabled: true },
];
const effect = {
  label: 'HP preparation fixture',
  availability: 'allLimitBreakStates',
  inclusionPolicy: { default: 'include' },
  gameActivation: 'skillUse',
  triggerScope: null,
  interaction: null,
  operationTrigger: null,
  operationReference: null,
  stateIdentity: null,
  proc: { kind: 'guaranteed' },
  selection: null,
  inputDefinitions: [],
  requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
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
};
const modifier = {
  kind: 'damageModifier',
  modifier: 'attackBuff',
  sign: 1,
  card: null,
  route: {
    target: 'sourceSelf',
    contributionScope: 'personal',
    eligibility: {
      kind: 'requiredRecipient',
      recipient: 'attacker',
      onMissing: 'ignore',
      onMismatch: 'ignore',
    },
  },
  values: [Array.from({ length: 10 }, () => 100), [], [], [], []],
  valueExpressions: [Array.from({ length: 10 }, () => null), [], [], [], []],
  semanticSupport: 'supported',
};
function fixtureMaster(spec: Spec): MasterDataSnapshot {
  const servant = base.servants[0]!;
  const skills = spec.writes.map((writes, index) => ({
    id: `hp-skill-${index}`,
    slot: index + 1,
    priority: 1,
    name: 'HP fixture',
    detail: '',
    imageKey: null,
    resourceRequirement: null,
    effects: [
      {
        ...effect,
        ...(spec.disabled
          ? {
              requirement: {
                recipient: 'sourceSelf',
                expression: {
                  kind: 'quantity',
                  quantity: 'attackerHpPermille',
                  comparison: 'atMost',
                  value: 0,
                },
              },
            }
          : {}),
        id: `hp-write-${index}`,
        occurrenceId: `hp-write-${index}:0`,
        ...(spec.choice
          ? {
              selection: {
                kind: 'playerChoice',
                group: { key: 'hp-choice', candidate: 'selected' },
              },
              requirement: {
                recipient: 'sourceSelf',
                expression: { kind: 'choice', family: 'hp-choice', candidate: 'selected' },
              },
            }
          : {}),
        execution: writes.flatMap((amount) => {
          const operations = [
            {
              kind: 'resourceMutation',
              resource: 'hp',
              direction: amount >= 0 ? 'gain' : 'loss',
              unit: 'fixed',
              recipient: 'sourceSelf',
              selection: 'direct',
              subjectId: null,
              ...(amount < 0 ? { lossFloor: spec.floor ?? 'zero' } : {}),
              amount: {
                kind: 'fixed',
                values: [
                  Array.from({ length: 10 }, (_, i) => Math.max(0, Math.abs(amount) + i - 3)),
                  [],
                  [],
                  [],
                  [],
                ],
              },
            },
          ];
          return operations.map((operation) =>
            spec.omitted && operation.kind === 'resourceMutation'
              ? Object.fromEntries(Object.entries(operation).filter(([key]) => key !== 'selection'))
              : operation,
          );
        }),
      },
    ],
  }));
  if (spec.choice)
    for (const skill of skills)
      skill.effects.push({
        ...skill.effects[0]!,
        id: 'hp-unselected',
        occurrenceId: 'hp-unselected:0',
        selection: { kind: 'playerChoice', group: { key: 'hp-choice', candidate: 'other' } },
        requirement: {
          recipient: 'sourceSelf',
          expression: { kind: 'choice', family: 'hp-choice', candidate: 'other' },
        },
        execution: [
          {
            kind: 'resourceMutation',
            resource: 'hp',
            direction: 'gain',
            unit: 'fixed',
            recipient: 'sourceSelf',
            selection: 'direct',
            subjectId: null,
            amount: {
              kind: 'fixed',
              values: [Array.from({ length: 10 }, () => 9999), [], [], [], []],
            },
          },
        ],
      });
  return masterSnapshotSchema.parse({
    ...base,
    servants: [
      {
        ...servant,
        hpByLevel: { ...servant.hpByLevel, 90: 9010 },
        skills,
        passives: [],
        actorFormGraph: {
          ...servant.actorFormGraph,
          forms: servant.actorFormGraph.forms.map((form) => ({
            ...form,
            skillIds: skills.map(({ id }) => id),
            passiveIds: [],
          })),
        },
        noblePhantasmVariantGroups: servant.noblePhantasmVariantGroups.map((group) => ({
          ...group,
          variants: group.variants.map((variant) =>
            variant.kind !== 'attack'
              ? variant
              : {
                  ...variant,
                  effects: spec.noReader
                    ? []
                    : [
                        {
                          ...effect,
                          id: 'hp-reader',
                          occurrenceId: 'hp-reader:0',
                          gameActivation: 'npBeforeDamage',
                          timing: 'beforeDamage',
                          requirement: {
                            recipient: 'sourceSelf',
                            expression: {
                              kind: 'quantity',
                              quantity: 'attackerHpPermille',
                              comparison: 'atMost',
                              value: 500,
                            },
                          },
                          execution: [modifier],
                        },
                      ],
                  damage: variant.damage.map((damage) => ({
                    ...damage,
                    kind: spec.noNp ? 'standard' : 'hpRatioLow',
                    rawFunctionType: spec.noNp ? 'damageNp' : 'damageNpHpratioLow',
                    parametersByOvercharge: damage.parametersByOvercharge.map((row) =>
                      row.map((cell) => ({ ...cell, targetId: 9000 })),
                    ),
                  })),
                },
          ),
        })),
      },
    ],
  });
}
const versions = {
  schemaVersion: SCHEMA_VERSION,
  engineVersion: ENGINE_VERSION,
  masterDataVersion: 'fixture',
  appVersion: '0.1.0',
  gameRegion: 'JP',
  masterDataLocale: 'ja-JP',
} as const;
function run(master: MasterDataSnapshot, spec: Spec, capture = true, ranking = false) {
  const scenario = {
    ...createDefaultResolvedScenario(master, undefined),
    attackerHpPermille: spec.initial,
    explicitOverrides: {},
    preNoblePhantasmPlan: [
      ...master.servants[0]!.skills.map((skill) => ({
        kind: 'useSkillSlot' as const,
        slot: skill.slot,
        skillLevel: 4,
        choice: spec.choice ? { groupKey: 'hp-choice', candidateKey: 'selected' } : null,
      })),
      { kind: 'executeAttackNoblePhantasm' as const },
    ],
  };
  const prepared = prepareCalculationScenarioWithPolicy(
    scenario,
    master,
    ranking
      ? {
          kind: 'ranking',
          selfBuffs: 'included',
          conditionalEffects: 'satisfied',
          areaView: 'included',
        }
      : { kind: 'calculator' },
    {},
    capture,
  );
  const calculation = evaluatePreparedCalculationScenario(prepared, {
    ...versions,
    masterDataVersion: master.version,
  });
  const selection = hpPreparationSelection(prepared, calculation);
  if (!selection) throw new Error('missing HP canonical selection');
  const program = hpPreparationProgram(selection);
  const source = hpPreparationSource(selection);
  return {
    prepared,
    calculation,
    selection,
    program,
    source,
    gate: auditHpPreparation({ expected: [program], observations: [source] }),
  };
}
const shared = new Map<
  Spec,
  {
    master: MasterDataSnapshot;
    positive: ReturnType<typeof run>;
    normal: ReturnType<typeof run>;
    ranking: ReturnType<typeof run>;
  }
>();

it('retains native preflight rejection without inventing an HP seed and rejects foreign receipts', () => {
  const spec: Spec = { name: 'preflight-rejection', initial: 500, writes: [[800]], final: 5805 };
  const master = fixtureMaster(spec);
  const scenario = {
    ...createDefaultResolvedScenario(master, undefined),
    attackerHpPermille: spec.initial,
    explicitOverrides: {},
    preNoblePhantasmPlan: [
      { kind: 'useSkillSlot' as const, slot: 1 as const, skillLevel: 4, choice: null },
      { kind: 'executeAttackNoblePhantasm' as const },
    ],
    worldFactAssertions: ['fieldHeaven', 'fieldHell'].map((trait) => ({
      decisionKey: `hp-audit:world:${trait}`,
      fact: { kind: 'trait' as const, scope: 'field' as const, trait, present: true },
    })),
  };
  const prepared = prepareCalculationScenarioWithPolicy(
    scenario,
    master,
    { kind: 'calculator' },
    {},
    true,
  );
  const calculation = evaluatePreparedCalculationScenario(prepared, {
    ...versions,
    masterDataVersion: master.version,
  });
  const selection = hpPreparationSelection(prepared, calculation);
  if (!selection) throw new Error('missing_preflight_hp_selection');
  const program = hpPreparationProgram(selection);
  const source = hpPreparationSource(selection);
  const target = source.observation?.targetExecution;
  if (target?.selection !== 'selected' || target.candidateState?.preflight?.status !== 'aborted')
    throw new Error('missing_native_preflight_rejection');
  const state = target.candidateState;
  const receipt = state.preflight;
  if (receipt?.status !== 'aborted') throw new Error('missing_abort_receipt');
  expect(state.preflight).toMatchObject({ status: 'aborted', failure: 'constraintConflict' });
  expect(calculation.result.status).toBe('unsupported');
  expect(source.candidate).toBeUndefined();
  expect(auditHpPreparation({ expected: [program], observations: [source] })).toMatchObject({
    status: 'passed',
    failures: [],
    boundaries: [{ reason: 'beforeOrderedExecution:constraintConflict' }],
  });
  const altered = (
    candidate: typeof state,
    events = target.operationEvents,
    result = source.result,
  ) =>
    auditHpPreparation({
      expected: [program],
      observations: [
        {
          ...source,
          result,
          observation: {
            ...source.observation!,
            targetExecution: {
              ...target,
              candidateState: candidate,
              operationEvents: events,
            },
          },
        },
      ],
    });
  const rejectedAt = (result: ReturnType<typeof altered>, checkPath: string) => {
    expect(result.status).toBe('failed');
    expect(result.failures.some((failure) => failure.checkPath === checkPath)).toBe(true);
  };
  rejectedAt(altered({ ...state, preflight: { ...receipt } }), 'reference.preflight.receipt');
  rejectedAt(altered(state, [...target.operationEvents]), 'reference.preflight.events');
  rejectedAt(altered({ ...state, preflight: { status: 'ready' } }), 'seed.candidate');
  for (const invalid of [
    { ...receipt, issues: [] },
    { ...receipt, failure: 'activationContext' as const },
  ])
    rejectedAt(altered({ ...state, preflight: invalid }), 'preflight.nativeAbort');
  const misclassified = {
    ...source.result,
    status: 'unavailable',
  } as unknown as typeof source.result;
  rejectedAt(altered(state, target.operationEvents, misclassified), 'preflight.noExecution');
  const normal = evaluatePreparedCalculationScenario(
    prepareCalculationScenarioWithPolicy(scenario, master, { kind: 'calculator' }, {}, false),
    { ...versions, masterDataVersion: master.version },
  );
  expect(normal.result).toEqual(calculation.result);
  const recovered = run(master, spec);
  expect(recovered.calculation.result.status).toBe('calculated');
  expect(recovered.gate).toMatchObject({ status: 'passed', failures: [] });
});

it(
  'maps equal NP reader leaves in the fixedSelf proof by compiled identity',
  productionAuditTestOptions(['hp-fixed-equal-leaf-identity.json']),
  async ({ task }) => {
    const spec = specs[0]!;
    const master = fixtureMaster(spec);
    for (const group of master.servants[0]!.noblePhantasmVariantGroups)
      for (const variant of group.variants) {
        const reader = variant.effects.find((item) => item.id === 'hp-reader');
        if (!reader) continue;
        const original = reader.requirement.expression;
        reader.requirement.expression = {
          kind: 'all',
          requirements: [original, structuredClone(original)],
        };
      }
    const parsed = masterSnapshotSchema.parse(master);
    const result = run(parsed, spec);
    const declarations = hpProofCoverageInventory(parsed);
    const positive = fixedSelfHpProofCoverage(declarations, result.program, result.gate);
    expect(positive.failures).toEqual([]);
    expect(
      positive.correspondence.bindings
        .filter((binding) => binding.stage === 'actualConditionRead')
        .map((binding) => binding.declaration.path),
    ).toEqual(['requirement.expression.requirements.0', 'requirement.expression.requirements.1']);
    const read = result.program.references.candidate!.reads[0]!;
    const originalLeaf = read.leaf;
    read.leaf = structuredClone(originalLeaf);
    const foreignEqualLeaf = fixedSelfHpProofCoverage(declarations, result.program, result.gate);
    read.leaf = originalLeaf;
    expect(
      foreignEqualLeaf.failures.some((failure) => failure.reason === 'unmatchedDeclaration'),
    ).toBe(true);
    const complete = {
      originalRequest: result.prepared.scenario,
      orderedPlan: result.prepared.orderedScenario,
      operationEvents: result.calculation.executionObservation?.targetExecution,
      positive,
      foreignEqualLeaf,
    };
    await writeProductionAuditArtifact(task.meta, 'hp-fixed-equal-leaf-identity.json', complete);
    const disk = await readStoredProductionAuditArtifact('hp-fixed-equal-leaf-identity.json');
    expect(decodeStoredProductionAuditArtifact(disk)).toEqual(complete);
  },
);
const groups = [
  'positive',
  'missing',
  'identity',
  'values',
  'order',
  'coherent',
  'downstream',
  'published',
] as const;
for (const spec of specs)
  for (const group of groups)
    it(
      `committed fixed HP ${spec.name} ${group}`,
      productionAuditTestOptions([
        `audit-hp-${spec.name}-${group}.json`,
        ...(spec === specs[0] && group === 'positive'
          ? ['hp-fixed-proof-correspondence.json']
          : []),
      ]),
      async ({ task }) => {
        let entry = shared.get(spec);
        if (!entry) {
          const master = fixtureMaster(spec);
          entry = {
            master,
            positive: run(master, spec),
            normal: run(master, spec, false),
            ranking: run(master, spec, true, true),
          };
          shared.set(spec, entry);
        }
        const { master, positive, normal, ranking } = entry;
        if (spec === specs[0] && group === 'positive') {
          const declarations = hpProofCoverageInventory(master);
          const correspondence = fixedSelfHpProofCoverage(
            declarations,
            positive.program,
            positive.gate,
          );
          expect(correspondence.failures).toEqual([]);
          expect(correspondence.passed).toBe(true);
          expect(
            correspondence.correspondence.bindings.some((b) => b.stage === 'actualConditionRead'),
          ).toBe(true);
          expect(
            correspondence.correspondence.bindings.some(
              (b) => b.stage === 'npEvaluation' && b.disposition === 'consumed',
            ),
          ).toBe(true);
          const missing = fixedSelfHpProofCoverage([], positive.program, positive.gate);
          const foreign = fixedSelfHpProofCoverage(
            declarations.map((declaration) => ({
              ...declaration,
              effect: declaration.effect ? structuredClone(declaration.effect) : null,
              operation: declaration.operation ? structuredClone(declaration.operation) : null,
              value: structuredClone(declaration.value),
            })),
            positive.program,
            positive.gate,
          );
          const failedOwner = fixedSelfHpProofCoverage(declarations, positive.program, {
            ...positive.gate,
            status: 'failed',
          });
          const outside = fixedSelfHpProofCoverage(
            declarations,
            {
              ...positive.program,
              selection: {
                ...positive.selection,
                canonical: {
                  ...positive.selection.canonical,
                  scopeBoundaries: ['otherHpWriter'],
                },
              },
            },
            positive.gate,
          );
          for (const negative of [missing, foreign, failedOwner, outside])
            expect(negative.passed).toBe(false);
          expect(missing.failures.some((f) => f.reason === 'unmatchedDeclaration')).toBe(true);
          expect(foreign.failures.some((f) => f.reason === 'unmatchedDeclaration')).toBe(true);
          expect(failedOwner.failures.some((f) => f.reason === 'ownerGateFailed')).toBe(true);
          expect(outside.failures.some((f) => f.reason === 'outsideProofScope')).toBe(true);
          const proofPayload = {
            ownerArtifact: `audit-hp-${spec.name}-${group}.json`,
            input: {
              masterVersion: master.version,
              population: 'schemaLegalFixedSelfRepresentative',
            },
            correspondence,
            negatives: { missing, foreign, failedOwner, outside },
          };
          const receipt = await writeProductionAuditArtifact(
            task.meta,
            'hp-fixed-proof-correspondence.json',
            proofPayload,
          );
          const bytes = await readStoredProductionAuditArtifact(
            'hp-fixed-proof-correspondence.json',
          );
          expect(bytes.length).toBe(receipt.expectedBytes);
          expect(isDeepStrictEqual(decodeStoredProductionAuditArtifact(bytes), proofPayload)).toBe(
            true,
          );
        }
        const negatives: {
          name: string;
          path: string;
          reason: string;
          diagnostic: unknown;
          gate: ReturnType<typeof auditHpPreparation>;
        }[] = [];
        const inspect = (name: string, path: string, reason: string, mutate: () => () => void) => {
          const restore = mutate();
          try {
            const gate = auditHpPreparation({
              expected: [positive.program],
              observations: [positive.source],
            });
            negatives.push({
              name,
              path,
              reason,
              diagnostic: structuredClone(hpDiagnosticSource(positive.source)),
              gate,
            });
          } finally {
            restore();
          }
        };
        const change = (
          name: string,
          object: unknown,
          key: string | number,
          value: unknown,
          remove = false,
        ) => {
          if (!object || typeof object !== 'object') return;
          const current: unknown = Reflect.get(object, key);
          if (!remove && Object.is(current, value)) return;
          if (
            Array.isArray(current) &&
            Array.isArray(value) &&
            current.length === value.length &&
            current.every((item, index) => item === value[index])
          )
            return;
          const isSource = object === source;
          const readIndex = source.candidate?.reads.findIndex((read) => read === object);
          const npIndex = source.candidate?.nps.findIndex((np) => np === object);
          let receiptReferencePath = '';
          for (const [i, transition] of (source.transitions ?? []).entries())
            for (const [j, action] of transition.hpActions.entries())
              for (const [k, write] of action.writes.entries())
                if (write === object)
                  receiptReferencePath = `reference.action.${i}.native.${j}.write.${k}.receipt.0`;

          const path = name.startsWith('canonical-missing:')
            ? 'canonical.source'
            : [
                  'missing:writes',
                  'missing:sources',
                  'missing:reads',
                  'missing:nps',
                  'missing:hp-actions',
                  'missing:action-start',
                  'missing:before',
                  'missing:after',
                ].includes(name)
              ? 'transport.structure'
              : isSource && key === 'identity'
                ? 'transport.source'
                : isSource &&
                    [
                      'master',
                      'scenario',
                      'transport',
                      'ordered',
                      'observation',
                      'candidate',
                      'calculation',
                    ].includes(String(key))
                  ? 'transport.references'
                  : isSource &&
                      ['input', 'effects', 'contributions', 'result'].includes(String(key))
                    ? 'use.ownerReferences'
                    : isSource && key === 'transitions' && value === undefined
                      ? 'transport.transitions'
                      : name === 'receipt:clone'
                        ? receiptReferencePath
                        : name === 'np:context'
                          ? `reference.np.${npIndex}.context`
                          : name === 'reader:state'
                            ? `reference.reader.${readIndex}.state`
                            : name.startsWith('values:operation:')
                              ? 'canonical.owner'
                              : 'owner.observations';
          const reason =
            path === 'transport.source' ||
            path === 'transport.transitions' ||
            path === 'transport.structure'
              ? 'hpTraceMissing'
              : path === 'transport.references' || path.startsWith('reference.')
                ? 'hpIdentityMismatch'
                : path === 'use.ownerReferences'
                  ? 'hpUseMismatch'
                  : path === 'canonical.owner' || path === 'canonical.source'
                    ? 'hpCanonicalMismatch'
                    : 'hpRetainedMismatch';
          inspect(name, path, reason, () => {
            const descriptor = Object.getOwnPropertyDescriptor(object, key);
            if (remove) Reflect.deleteProperty(object, key);
            else Reflect.set(object, key, value);
            return () => {
              if (descriptor) Object.defineProperty(object, key, descriptor);
              else Reflect.deleteProperty(object, key);
            };
          });
        };
        const source = positive.source;
        if (group === 'missing') {
          for (const key of [
            'identity',
            'canonical',
            'transport',
            'transitions',
            'ordered',
            'candidate',
            'input',
            'effects',
            'contributions',
            'result',
            'observation',
            'master',
            'scenario',
          ])
            change(`missing:${key}`, source, key, undefined);
          for (const transition of source.transitions ?? []) {
            change('missing:hp-actions', transition, 'hpActions', undefined);
            for (const action of transition.hpActions) {
              change('missing:native', action, 'native', undefined);
              change('missing:action-start', action, 'start', undefined);
              for (const write of action.writes) {
                change('missing:before', write, 'before', undefined);
                change('missing:after', write, 'after', undefined);
              }
              for (const write of action.writes) change('missing:receipt', write, 'receipts', []);
            }
          }
        }
        if (group === 'missing') {
          for (const key of [
            'actions',
            'writers',
            'naturalReaders',
            'naturalNps',
            'operations',
            'readers',
            'nps',
            'scopeBoundaries',
          ])
            change(`canonical-missing:${key}`, source.canonical, key, undefined);
          for (const transition of source.transitions ?? [])
            for (const action of transition.hpActions) {
              change('missing:writes', action, 'writes', undefined);
              change('missing:sources', action, 'sources', undefined);
            }
          if (source.candidate) {
            change('missing:reads', source.candidate, 'reads', undefined);
            change('missing:nps', source.candidate, 'nps', undefined);
          }
        }
        if (group === 'identity') {
          for (const action of source.canonical.actions) {
            if (action.command.kind === 'useSkillSlot') {
              change('identity:command:slot', action.command, 'slot', 99);
              change('identity:command:level', action.command, 'skillLevel', 99);
              change('identity:command:choice', action.command, 'choice', {
                groupKey: 'foreign',
                candidateKey: 'foreign',
              });
            }
            change('identity:canonical-form', action, 'form', {
              ...action.form,
              actorId: 'foreign',
            });
          }
          for (const transition of source.transitions ?? []) {
            change('identity:command', transition, 'command', { kind: 'foreign' });
            for (const action of transition.hpActions) {
              change('identity:action', action, 'actionId', 'foreign');
              change('identity:action-form', action.start, 'currentFormId', {
                ...action.start.currentFormId,
                actorId: 'foreign',
              });
              for (const write of action.writes)
                change('identity:occurrence', write.source.effect, 'occurrenceId', 'foreign');
            }
          }
        }
        if (group === 'identity' || group === 'values') {
          for (const transition of source.transitions ?? [])
            for (const action of transition.hpActions)
              for (const write of action.writes) {
                if (group === 'identity') {
                  for (const key of ['operationIndex']) change(`identity:${key}`, write, key, 99);
                  for (const key of [
                    'origin',
                    'sourceInstanceId',
                    'sourceId',
                    'skillId',
                    'valueSetIndex',
                    'valueIndex',
                  ])
                    change(
                      `identity:source:${key}`,
                      write.source,
                      key,
                      typeof Reflect.get(write.source, key) === 'number' ? 4 : 'foreign',
                    );
                  for (const receipt of write.receipts)
                    for (const key of ['actionId', 'occurrenceId', 'actor'])
                      change(`identity:receipt:${key}`, receipt, key, 'foreign');
                } else {
                  for (const receipt of write.receipts)
                    for (const key of ['attempted', 'actual'])
                      change(`values:${key}`, receipt, key, 999999);
                  for (const receipt of write.receipts)
                    if (receipt.after.kind === 'absolute')
                      for (const key of ['current', 'maximum', 'baseMaximum'])
                        change(`values:after:${key}`, receipt.after, key, 99);
                  const operation = write.source.effect.execution[write.operationIndex];
                  if (operation?.kind === 'resourceMutation')
                    for (const key of [
                      'direction',
                      'unit',
                      'recipient',
                      'selection',
                      'lossFloor',
                      'subjectId',
                      'amount',
                    ])
                      change(
                        `values:operation:${key}`,
                        operation,
                        key,
                        key === 'amount'
                          ? { kind: 'fixed', values: [[0], [], [], [], []] }
                          : 'foreign',
                      );
                }
              }
        }
        if (group === 'order') {
          change(
            'reverse:transitions',
            source,
            'transitions',
            [...(source.transitions ?? [])].reverse(),
          );
          change('duplicate:transitions', source, 'transitions', [
            ...(source.transitions ?? []),
            ...(source.transitions ?? []).slice(0, 1),
          ]);
          for (const transition of source.transitions ?? [])
            for (const action of transition.hpActions) {
              if (action.writes.length > 1)
                change('reverse:writes', action, 'writes', [...action.writes].reverse());
              change('duplicate:writes', action, 'writes', [
                ...action.writes,
                ...action.writes.slice(0, 1),
              ]);
            }
          if (source.candidate) {
            change('duplicate:reads', source.candidate, 'reads', [
              ...source.candidate.reads,
              ...source.candidate.reads.slice(0, 1),
            ]);
            change('duplicate:nps', source.candidate, 'nps', [
              ...source.candidate.nps,
              ...source.candidate.nps.slice(0, 1),
            ]);
          }
        }
        if (group === 'coherent') {
          for (const transition of source.transitions ?? []) {
            change('start:initial', transition.before, 'hp', source.transitions?.[0]?.before.hp);
            change('commit:result', transition.result, 'status', 'rejected');
            change('prefix:missing', transition.result.state, 'appliedActions', []);
            for (const action of transition.hpActions) {
              change('commit:native', action.native, 'status', 'unsupported');
              change(
                'retained:intermediate',
                transition.result.state,
                'hp',
                action.writes[0]?.before,
              );
              for (const write of action.writes)
                change('receipt:clone', write, 'receipts', structuredClone(write.receipts));
            }
          }
          for (const transition of source.transitions ?? []) {
            change('receipt:leak', transition.result.state.hp, 'receipts', [
              ...(transition.result.state.hp?.receipts ?? []),
              ...(transition.result.state.hp?.receipts.slice(0, 1) ?? []),
            ]);
            change('effect:leak', transition.result.state.hp, 'executedEffects', [
              ...(transition.result.state.hp?.executedEffects ?? []),
              'fabricated-effect',
            ]);
            change('action:leak', transition.result.state, 'appliedActions', [
              ...transition.result.state.appliedActions,
              ...transition.result.state.appliedActions.slice(0, 1),
            ]);
          }
          change('execution:foreign', source, 'calculation', ranking.calculation);
          change('actor:foreign', source.candidate?.seed, 'hp', {
            actors: {
              attacker: { kind: 'absolute', baseMaximum: 10010, maximum: 10010, current: 1234 },
            },
            receipts: [],
          });
        }
        if (group === 'coherent' && source.candidate) {
          const updates: { owner: object; key: string; value: unknown }[] = [];
          const retained = source.candidate.seed.hp?.actors.attacker;
          if (retained?.kind === 'absolute') {
            updates.push({ owner: retained, key: 'current', value: 1111 });
            updates.push({ owner: source.candidate.seed, key: 'permille', value: 111 });
            for (const read of source.candidate.reads) {
              const actor = read.state.hp?.actors.attacker;
              if (actor?.kind === 'absolute')
                updates.push({ owner: actor, key: 'current', value: 1111 });
              updates.push({ owner: read.state.quantities, key: 'attackerHpPermille', value: 111 });
              updates.push({ owner: read, key: 'permille', value: 111 });
            }
            for (const np of source.candidate.nps) {
              const actor = np.state.hp?.actors.attacker;
              if (actor?.kind === 'absolute')
                updates.push({ owner: actor, key: 'current', value: 1111 });
              updates.push({ owner: np.context, key: 'attackerHpRatio', value: 1111 / 10010 });
              updates.push({ owner: np, key: 'ratio', value: 1111 / 10010 });
            }
            inspect(
              'coherent:retained-reader-np',
              'owner.observations',
              'hpRetainedMismatch',
              () => {
                const restores = updates.map(({ owner, key, value }) => {
                  const descriptor = Object.getOwnPropertyDescriptor(owner, key);
                  Reflect.set(owner, key, value);
                  return () => {
                    if (descriptor) Object.defineProperty(owner, key, descriptor);
                    else Reflect.deleteProperty(owner, key);
                  };
                });
                return () => restores.reverse().forEach((restore) => restore());
              },
            );
          }
        }
        if (group === 'downstream') {
          if (source.candidate)
            for (const read of source.candidate.reads)
              for (const key of [
                'permille',
                'evaluated',
                'conditionOutcome',
                'operationId',
                'operationSequence',
                'operationGroupIndex',
                'comparison',
                'expectedValue',
                'state',
              ])
                change(
                  `reader:${key}`,
                  read,
                  key,
                  key === 'evaluated'
                    ? !read.evaluated
                    : key === 'state'
                      ? structuredClone(read.state)
                      : 'foreign',
                );
          if (source.candidate)
            for (const np of source.candidate.nps) {
              change(
                'ratio:permille',
                np.context,
                'attackerHpRatio',
                source.candidate.seed.permille,
              );
              change(
                'ratio:rounded-permille',
                np.context,
                'attackerHpRatio',
                source.candidate.seed.permille === null
                  ? null
                  : source.candidate.seed.permille / 1000,
              );
              change('np:context', np, 'context', { ...np.context, attackerHpRatio: 1 });
              change('np:evaluation', np, 'evaluation', {
                status: 'resolved',
                npMultipliers: [1, 1, 1, 1, 1],
                npSpecialMultipliers: [1, 1, 1, 1, 1],
                ignoreDefense: false,
              });
              change('np:input', np, 'input', { ...np.input, npMultipliers: [1, 1, 1, 1, 1] });
              for (const key of ['operationId', 'operationSequence', 'operationGroupIndex'])
                change(`np:${key}`, np, key, 'foreign');
            }
          for (const key of ['input', 'effects', 'contributions', 'result', 'uses'])
            change(
              `use:${key}`,
              source,
              key,
              key === 'uses' ? [] : structuredClone(Reflect.get(source, key)),
            );
        }
        // A mutation that leaves the canonical value and original references unchanged is not a negative.
        const changedNegatives = negatives;
        const published = auditPublishedHpPreparation(
          master,
          [positive],
          [positive.selection],
          [positive.program],
          [source],
        );
        const publishedNegatives =
          group === 'published'
            ? [
                auditPublishedHpPreparation(master, [positive], [positive.selection], [], []),
                auditPublishedHpPreparation(master, [positive], [], [], []),
                auditPublishedHpPreparation(master, [positive], [], [positive.program], [source]),
                auditPublishedHpPreparation(
                  master,
                  [positive],
                  [positive.selection],
                  [positive.program],
                  [],
                ),
                auditPublishedHpPreparation(
                  { ...master, servants: [] },
                  [positive],
                  [positive.selection],
                  [positive.program],
                  [source],
                ),
              ]
            : [];
        if (group === 'published')
          publishedNegatives.push(
            auditPublishedHpPreparation(
              master,
              [],
              [positive.selection],
              [positive.program],
              [source],
            ),
          );
        const payload = {
          canonicalIdentity: positive.selection.identity,
          group,
          spec,
          positive: { gate: positive.gate, source: hpDiagnosticSource(source) },
          negatives: changedNegatives,
          published,
          publishedNegatives,
          parity: {
            normal: normal.calculation.result,
            captured: positive.calculation.result,
            ranking: ranking.calculation.result,
          },
        };
        const encoded = encodeProductionAuditDiagnostic(payload);
        const path = `audit-hp-${spec.name}-${group}.json`;
        await writeProductionAuditArtifact(task.meta, path, encoded);
        const saved = decodeStoredProductionAuditArtifact(
          await readStoredProductionAuditArtifact(path),
        ) as ReturnType<typeof encodeProductionAuditDiagnostic>;
        expect(isDeepStrictEqual(decodeProductionAuditDiagnostic(saved), payload)).toBe(true);
        expect(positive.gate.status, JSON.stringify(positive.gate.firstDifference)).toBe('passed');
        expect(published.status).toBe('passed');
        for (const negative of changedNegatives) {
          expect(negative.gate.status, negative.name).toBe('failed');
          const failure = negative.gate.failures.find(
            ({ checkPath }) => checkPath === negative.path,
          );
          expect(failure?.reason, negative.name).toBe(negative.reason);
          expect(failure?.firstDifference.path.startsWith(negative.path)).toBe(true);
        }
        const publishedPaths = [
          'published.selectionPrograms',
          'published.requests',
          'published.requests',
          'population',
          'published.declarations',
          'published.requests',
        ];
        for (const [index, gate] of publishedNegatives.entries()) {
          expect(gate.status).toBe('failed');
          const failure = gate.failures.find(
            ({ checkPath }) => checkPath === publishedPaths[index],
          );
          expect(failure?.reason).toBe('hpPopulationMismatch');
          expect(failure?.firstDifference.path.startsWith(publishedPaths[index]!)).toBe(true);
        }
        expect(normal.calculation.result).toEqual(positive.calculation.result);
        expect(ranking.calculation.result).toEqual(positive.calculation.result);
        if (positive.prepared.status === 'executable') {
          expect(positive.calculation.result.status).toBe('calculated');
          for (const np of source.candidate?.nps ?? []) {
            expect(np.disposition).toBe('consumed');
            expect(np.ratio).toBe(spec.final / 10010);
            if (spec.final !== 10010) expect(np.ratio).not.toBe(source.candidate!.seed.permille);
          }
        }

        const retainedHp = preparationExecutionStateFor(positive.prepared.orderedScenario)?.hp
          ?.actors.attacker;
        if (positive.prepared.status === 'executable' && retainedHp?.kind === 'absolute')
          expect(retainedHp.current).toBe(spec.final);
      },
    );
