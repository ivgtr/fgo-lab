import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { equalProductionAuditDiagnosticValues } from './productionAuditDiagnosticEquality';
import { materializeBattlePointCapacityValue } from './productionBattlePointCapacityProof';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema, type MasterDataSnapshot } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import {
  createDefaultResolvedScenario,
  prepareCalculationScenarioWithPolicy,
  evaluatePreparedCalculationScenario,
  evaluatePreparedCalculationResult,
  requireExecutableCalculation,
} from './scenario';
import {
  battlePointCapacityPreparationProgram,
  battlePointCapacityDiagnosticProof,
  battlePointCapacitySelection,
  battlePointCapacityPreparationSource,
  auditBattlePointCapacityPreparation,
  auditPublishedBattlePointCapacityPreparation,
  type BattlePointCapacityFailureReason,
} from './productionBattlePointCapacityPreparationAudit';
import {
  productionAuditTestOptions,
  writeProductionAuditArtifact,
  encodeProductionAuditDiagnostic,
  decodeProductionAuditDiagnostic,
  serializeProductionAuditArtifact,
  decodeProductionAuditArtifact,
} from './productionAuditArtifacts';

async function saveCapacityContract(
  meta: Parameters<typeof writeProductionAuditArtifact>[0],
  name: string,
  payload: unknown,
) {
  const encoded = encodeProductionAuditDiagnostic(payload);
  const memory = decodeProductionAuditDiagnostic(encoded);
  const serialized = decodeProductionAuditDiagnostic(
    decodeProductionAuditArtifact(serializeProductionAuditArtifact(encoded)) as typeof encoded,
  );
  await writeProductionAuditArtifact(meta, name, { encoded });
  const bytes = await readFile(resolve(process.env['FGO_TEST_ARTIFACT_DIR']!, name));
  const disk = decodeProductionAuditDiagnostic(
    (decodeProductionAuditArtifact(bytes) as { encoded: typeof encoded }).encoded,
  );
  expect(equalProductionAuditDiagnosticValues(memory, payload)).toBe(true);
  expect(equalProductionAuditDiagnosticValues(serialized, payload)).toBe(true);
  expect(equalProductionAuditDiagnosticValues(disk, payload)).toBe(true);
}

type Entry =
  | { kind: 'capacity'; amount: number; lifetime?: 'active' | 'constant' }
  | { kind: 'fixed'; amount: number };
type Spec = {
  name: string;
  initial: number;
  capacity: number | null;
  maximum: number | null;
  groups: Entry[][];
  point: number;
  retainedCapacity: number | null;
  phase: number;
  changed: number;
  permille?: boolean;
  ineligible?: boolean;
  indexed?: boolean;
  choice?: boolean;
};
const c = (amount: number, lifetime: 'active' | 'constant' = 'active'): Entry => ({
  kind: 'capacity',
  amount,
  lifetime,
});
const f = (amount: number): Entry => ({ kind: 'fixed', amount });
const specs: Spec[] = [
  {
    name: 'increase-gain-loss',
    initial: 80,
    capacity: 100,
    maximum: 200,
    groups: [[c(50), f(100), f(-20)]],
    point: 130,
    retainedCapacity: 150,
    phase: 8,
    changed: 1,
    choice: true,
  },
  {
    name: 'decrease-point-clamp',
    initial: 80,
    capacity: 100,
    maximum: 200,
    groups: [[c(-50), f(30), f(-20)]],
    point: 30,
    retainedCapacity: 50,
    phase: 2,
    changed: 1,
  },
  {
    name: 'unchanged-point-permille',
    initial: 60,
    capacity: 100,
    maximum: 200,
    groups: [[c(100, 'constant'), f(0)]],
    point: 60,
    retainedCapacity: 200,
    phase: 2,
    changed: 1,
    permille: true,
  },
  {
    name: 'intermediate-reconciled',
    initial: 80,
    capacity: 100,
    maximum: 100,
    groups: [
      [c(50), c(-60), f(80)],
      [f(100), f(-10)],
    ],
    point: 80,
    retainedCapacity: 90,
    phase: 8,
    changed: 1,
  },
  {
    name: 'prior-commit-action-start',
    initial: 10,
    capacity: 100,
    maximum: 200,
    groups: [[f(30)], [c(50), f(200), f(-10)]],
    point: 140,
    retainedCapacity: 150,
    phase: 8,
    changed: 1,
    indexed: true,
  },
  {
    name: 'null-capacity-boundary',
    initial: 20,
    capacity: null,
    maximum: null,
    groups: [[c(30), f(10)]],
    point: 30,
    retainedCapacity: null,
    phase: 2,
    changed: 0,
  },
  {
    name: 'zero-amount-capacity-boundary',
    initial: 0,
    capacity: 0,
    maximum: 100,
    groups: [[c(0), f(10)]],
    point: 0,
    retainedCapacity: 0,
    phase: 0,
    changed: 0,
  },
  {
    name: 'eligible-absent-boundary',
    initial: -1,
    capacity: 100,
    maximum: 200,
    groups: [[c(50), f(10)]],
    point: 10,
    retainedCapacity: 100,
    phase: 0,
    changed: 0,
  },
  {
    name: 'ineligible-boundary',
    initial: 0,
    capacity: 100,
    maximum: 200,
    groups: [[c(50), f(10)]],
    point: 0,
    retainedCapacity: null,
    phase: 0,
    changed: 0,
    ineligible: true,
  },
];
function fixtureMaster(spec: Spec) {
  const base = masterSnapshotSchema.parse(fixture);
  const servant = base.servants[0]!;
  const template = {
    label: 'domain preparation fixture',
    availability: 'allLimitBreakStates',
    inclusionPolicy: { default: 'include' },
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
  const domainId = '810000';
  const capacity = spec.capacity;
  const domain = {
    id: domainId,
    phaseScale: spec.permille ? ('permille' as const) : ('point' as const),
    phases: [
      { phase: 0, threshold: 0 },
      { phase: 2, threshold: spec.permille ? 250 : 20 },
      { phase: 5, threshold: spec.permille ? 500 : 50 },
      { phase: 8, threshold: spec.permille ? 800 : 80 },
    ],
    eligibility: [
      { kind: 'actor' as const, actorId: spec.ineligible ? 'other-actor' : servant.id },
    ],
    capacity: { default: capacity, maximum: spec.maximum, traitOverrides: [] },
  };
  const modifier = {
    kind: 'damageModifier' as const,
    modifier: 'attackBuff' as const,
    sign: 1 as const,
    card: null,
    route: {
      target: 'sourceSelf' as const,
      contributionScope: 'personal' as const,
      eligibility: {
        kind: 'requiredRecipient' as const,
        recipient: 'attacker' as const,
        onMissing: 'ignore' as const,
        onMismatch: 'ignore' as const,
      },
    },
    values: [[100, 100, 100, 100, 100, 100, 100, 100, 100, 100], [], [], [], []],
    valueExpressions: [
      [null, null, null, null, null, null, null, null, null, null],
      [],
      [],
      [],
      [],
    ],
    semanticSupport: 'supported' as const,
  };
  const effect = {
    ...template,
    gameActivation: 'skillUse' as const,
    triggerScope: null,
    interaction: null,
    operationTrigger: null,
    operationReference: null,
    stateIdentity: null,
    proc: { kind: 'guaranteed' as const },
    selection: null,
    inputDefinitions: [],
    requirement: { recipient: 'sourceSelf' as const, expression: { kind: 'always' as const } },
  };
  const skills = spec.groups.map((amounts, index) => ({
    priority: 1,
    name: 'domain preparation fixture',
    detail: '',
    imageKey: null,
    id: `domain-skill-${index}`,
    slot: index + 1,
    resourceRequirement: null,
    effects: [
      {
        ...effect,
        id: `domain-writer-${index}`,
        occurrenceId: `domain-writer-${index}:0`,
        ...(spec.choice && amounts.some((a) => a.kind === 'capacity')
          ? {
              selection: {
                kind: 'playerChoice',
                group: { key: 'capacity-choice', candidate: 'selected' },
              },
            }
          : {}),
        execution: amounts.length
          ? amounts.map((entry) =>
              entry.kind === 'capacity'
                ? {
                    kind: 'battlePointCapacityModifier',
                    recipient: 'sourceSelf',
                    subjectId: domainId,
                    values: [
                      Array.from(
                        { length: 10 },
                        (_, i) => entry.amount + (spec.indexed ? i - 3 : 0),
                      ),
                      [],
                      [],
                      [],
                      [],
                    ],
                    lifetime: entry.lifetime ?? 'active',
                    traits: ['capacity-fixture-trait'],
                  }
                : {
                    kind: 'resourceMutation',
                    resource: 'battlePoint',
                    direction: entry.amount >= 0 ? 'gain' : 'loss',
                    unit: 'fixed',
                    recipient: 'sourceSelf',
                    amount: {
                      kind: 'fixed',
                      values: [
                        Array.from({ length: 10 }, () => Math.abs(entry.amount)),
                        [],
                        [],
                        [],
                        [],
                      ],
                    },
                    subjectId: domainId,
                  },
            )
          : [modifier],
      },
    ],
  }));
  if (spec.choice)
    for (const skill of skills) {
      const writer = skill.effects[0]!;
      if ('selection' in writer)
        skill.effects.push({
          ...writer,
          id: 'unselected-capacity',
          occurrenceId: 'unselected-capacity:0',
          selection: {
            kind: 'playerChoice',
            group: { key: 'capacity-choice', candidate: 'other' },
          },
          execution: [
            {
              kind: 'battlePointCapacityModifier',
              recipient: 'sourceSelf',
              subjectId: '810001',
              values: [[900, 900, 900, 900, 900, 900, 900, 900, 900, 900], [], [], [], []],
              lifetime: 'active',
              traits: [],
            },
          ],
        });
    }
  const groups = servant.noblePhantasmVariantGroups.map((group) => ({
    ...group,
    variants: group.variants.map((variant) =>
      variant.kind !== 'attack'
        ? variant
        : {
            ...variant,
            effects: [
              {
                ...effect,
                id: 'domain-terminal-reader',
                occurrenceId: 'domain-terminal-reader:0',
                gameActivation: 'npBeforeDamage',
                timing: 'beforeDamage',
                requirement: {
                  recipient: 'sourceSelf',
                  expression: {
                    kind: 'quantity',
                    quantity: 'battlePointPhase',
                    subjectId: domainId,
                    comparison: 'atLeast',
                    value: 0,
                  },
                },
                execution: [modifier],
              },
            ],
            damage: variant.damage.map((damage) => ({
              ...damage,
              kind: 'battlePointPhase',
              rawFunctionType: 'damageNpBattlePointPhase',
              maximumBattlePointPhase: 3,
              parametersByOvercharge: damage.parametersByOvercharge.map((row) =>
                row.map((cell) => ({
                  ...cell,
                  targetId: Number(domainId),
                  secondaryValuePermille: 1000,
                  correctionPermille: 100,
                })),
              ),
            })),
          },
    ),
  }));
  return masterSnapshotSchema.parse({
    ...base,
    battlePointDomains: [domain, { ...domain, id: '810001' }],
    servants: [
      {
        ...servant,
        actorFormGraph: {
          ...servant.actorFormGraph,
          forms: servant.actorFormGraph.forms.map((form) => ({
            ...form,
            skillIds: skills.map(({ id }) => id),
            passiveIds: [],
          })),
        },
        skills,
        passives: [],
        battlePointDomains: [domain, { ...domain, id: '810001' }],
        noblePhantasmVariantGroups: groups,
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
    battleState: { battlePointPhase: null },
    initialBattlePointPoints: spec.ineligible
      ? {}
      : {
          '810000': spec.initial,
          '810001':
            spec.initial === -1 ? -1 : Math.min(spec.initial, spec.capacity ?? spec.initial),
        },
    preNoblePhantasmPlan: [
      ...master.servants[0]!.skills.map((skill) => ({
        kind: 'useSkillSlot' as const,
        slot: skill.slot,
        skillLevel: spec.indexed ? 4 : 10,
        choice:
          spec.choice && skill.effects.some((e) => e.selection?.kind === 'playerChoice')
            ? { groupKey: 'capacity-choice', candidateKey: 'selected' }
            : null,
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
  const calculation = requireExecutableCalculation(
    evaluatePreparedCalculationScenario(prepared, {
      ...versions,
      masterDataVersion: master.version,
    }),
  );
  const result = evaluatePreparedCalculationResult(prepared, {
    ...versions,
    masterDataVersion: master.version,
  });
  const program = battlePointCapacityPreparationProgram(prepared, calculation);
  if (!program) throw new Error('capacity canonical program missing');
  const source = battlePointCapacityPreparationSource(program);
  const { gate } = auditBattlePointCapacityPreparation({
    expected: [program],
    observations: [source],
    evidence: 'diagnostics',
  });
  return { program, source, gate, result };
}
const preparations = new Map<
  Spec,
  {
    master: MasterDataSnapshot;
    positive: ReturnType<typeof run>;
    normal: ReturnType<typeof run>;
    ranking: ReturnType<typeof run>;
  }
>();
const testGroups = [
  'positive',
  'missing',
  'identity-source-action',
  'identity-receipt-state',
  'stale-state',
  'fake-commit',
  'downstream',
] as const;
function groupFor(group: string, path: string) {
  if (group !== 'identity-order') return group;
  return (path.startsWith('action.') &&
    !path.endsWith('.identity') &&
    !path.endsWith('.modifiers') &&
    !path.endsWith('.receiptState') &&
    !path.endsWith('.references')) ||
    path.startsWith('canonical.')
    ? 'identity-source-action'
    : 'identity-receipt-state';
}
for (const spec of specs)
  for (const testGroup of testGroups)
    it(
      `connects committed capacity ${spec.name} ${testGroup}`,
      productionAuditTestOptions([`tsk-08-bp-capacity-${spec.name}-${testGroup}.json`]),
      async ({ task }) => {
        let shared = preparations.get(spec);
        if (!shared) {
          const master = fixtureMaster(spec);
          shared = {
            master,
            positive: run(master, spec),
            normal: run(master, spec, false),
            ranking: run(master, spec, true, true),
          };
          preparations.set(spec, shared);
        }
        const { master, positive, normal, ranking } = shared;
        const negatives: unknown[] = [];
        const published = auditPublishedBattlePointCapacityPreparation(
          master,
          [positive.program],
          [positive.source],
          [battlePointCapacitySelection(positive.program.downstream.prepared)!],
        );
        const checks: {
          name: string;
          group: string;
          reason: BattlePointCapacityFailureReason;
          path: string;
          gate: ReturnType<typeof auditBattlePointCapacityPreparation>['gate'];
          transport: unknown;
        }[] = [];
        const source = positive.source,
          program = positive.program;
        const inspect = (
          group: string,
          name: string,
          reason: BattlePointCapacityFailureReason,
          path: string,
          mutate: () => () => void,
        ) => {
          if (groupFor(group, path) !== testGroup) return;
          const restore = mutate();
          try {
            const { gate, valueProof } = auditBattlePointCapacityPreparation({
              expected: [program],
              observations: [source],
              evidence: 'diagnostics',
            });
            checks.push({
              name,
              group,
              reason,
              path,
              gate,
              transport: (materializeBattlePointCapacityValue(valueProof) as unknown[])[0],
            });
          } finally {
            restore();
          }
        };
        const change = (
          group: string,
          name: string,
          reason: BattlePointCapacityFailureReason,
          path: string,
          object: unknown,
          key: string | number,
          value: unknown,
          remove = false,
        ) => {
          if (!object || typeof object !== 'object')
            throw new Error(`negative target missing:${name}`);
          inspect(group, name, reason, path, () => {
            const descriptor = Object.getOwnPropertyDescriptor(object, key);
            if (remove) Reflect.deleteProperty(object, key);
            else Reflect.set(object, key, value);
            return () => {
              if (descriptor) Object.defineProperty(object, key, descriptor);
              else Reflect.deleteProperty(object, key);
            };
          });
        };
        change(
          'missing',
          'capture',
          'capacityTransportMissing',
          'transport.capture',
          source,
          'capture',
          undefined,
        );
        change(
          'missing',
          'steps',
          'capacityPopulationMismatch',
          'transport.stepPopulation',
          source,
          'steps',
          [],
        );
        change(
          'missing',
          'observation',
          'capacityTransportMissing',
          'transport.observation',
          source.downstream,
          'observation',
          undefined,
        );
        change(
          'missing',
          'conversion',
          'capacityUseMismatch',
          'conversion.present',
          source.downstream.preparation!,
          'conversion',
          undefined,
        );
        for (const key of ['input', 'result', 'effects', 'contributions'])
          change(
            'missing',
            key,
            'capacityTransportMissing',
            'transport.use',
            source.downstream,
            key,
            undefined,
          );
        const target = source.downstream.observation!.targetExecution;
        if (target?.selection !== 'selected') throw new Error('selected fixture required');
        change(
          'missing',
          'candidate-state',
          'capacityTransportMissing',
          'execution.state',
          target,
          'candidateState',
          undefined,
        );
        change(
          'identity-order',
          'candidate-index',
          'capacityStateMismatch',
          'owner.downstream',
          target,
          'candidateIndex',
          target.candidateIndex + 1,
        );
        change(
          'identity-order',
          'selection',
          'capacityUseMismatch',
          'execution.selection',
          target,
          'selection',
          'unresolved',
        );
        const state = target.candidateState!;
        change(
          'missing',
          'live-read',
          'capacityUseMismatch',
          'terminal.readPopulation',
          state,
          'battlePointPhaseReads',
          [],
        );
        change(
          'missing',
          'np-receipt',
          'capacityUseMismatch',
          'np.population',
          state,
          'scalarNpConsumptions',
          [],
        );
        change(
          'missing',
          'event',
          'capacityUseMismatch',
          'use.0.binding',
          target,
          'operationEvents',
          [],
        );
        change(
          'missing',
          'projection',
          'capacityUseMismatch',
          'use.0.projectionCount',
          source.downstream,
          'effects',
          [],
        );
        change(
          'missing',
          'contribution',
          'capacityUseMismatch',
          'use.0.components',
          source.downstream.contributions,
          'contributions',
          [],
        );
        const conversion = source.downstream.preparation!.conversion!;
        change(
          'missing',
          'conversion-domain',
          'capacityUseMismatch',
          'conversion.domain',
          conversion,
          'domain',
          undefined,
        );
        change(
          'identity-order',
          'conversion-value-reference',
          'capacityIdentityMismatch',
          'conversion.original',
          conversion,
          'value',
          structuredClone(conversion.value),
        );
        change(
          'identity-order',
          'conversion-domain-reference',
          'capacityIdentityMismatch',
          'conversion.original',
          conversion,
          'domain',
          structuredClone(conversion.domain),
        );
        change(
          'identity-order',
          'conversion-parameter-reference',
          'capacityIdentityMismatch',
          'conversion.original',
          conversion,
          'parameter',
          structuredClone(conversion.parameter),
        );
        change(
          'stale-state',
          'conversion-point-domain',
          'capacityUseMismatch',
          'conversion.value',
          conversion,
          'value',
          { kind: 'present', point: 909, capacity: 909, capacityModifiers: [] },
        );
        change(
          'downstream',
          'conversion-phase',
          'capacityUseMismatch',
          'conversion.scalar',
          conversion,
          'phase',
          99,
        );
        for (const [i, read] of state.battlePointPhaseReads.entries()) {
          change(
            'identity-order',
            `read-${i}-reference`,
            'capacityIdentityMismatch',
            `read.${i}.original`,
            state.battlePointPhaseReads,
            i,
            structuredClone(read),
          );
          for (const [key, value, path] of [
            ['actor', 'other', `read.${i}.actor`],
            ['point', 999, `read.${i}.pointPhase`],
            ['phase', 999, `read.${i}.pointPhase`],
            ['evaluated', false, `read.${i}.evaluation`],
            ['operationGroupIndex', 999, `read.${i}.group`],
          ] as const)
            change('downstream', `read-${i}-${key}`, 'capacityUseMismatch', path, read, key, value);
          for (const key of [
            'operationSequence',
            'subjectId',
            'operationId',
            'comparison',
            'expectedValue',
          ])
            change(
              'identity-order',
              `read-${i}-${key}`,
              'capacityUseMismatch',
              'terminal.readPopulation',
              read,
              key,
              typeof Reflect.get(read, key) === 'number' ? 999 : 'wrong',
            );
        }
        for (const [i, np] of state.scalarNpConsumptions.entries()) {
          change(
            'identity-order',
            `np-${i}-reference`,
            'capacityIdentityMismatch',
            `np.${i}.original`,
            state.scalarNpConsumptions,
            i,
            structuredClone(np),
          );
          for (const key of ['input', 'evaluation'])
            change(
              'identity-order',
              `np-${i}-${key}-reference`,
              'capacityIdentityMismatch',
              `np.${i}.original`,
              np,
              key,
              structuredClone(Reflect.get(np, key)),
            );
          for (const [key, value, path] of [
            ['value', 999, `np.${i}.raw`],
            ['consumedValue', 999, `np.${i}.consumed`],
            ['disposition', 'excluded', `np.${i}.disposition`],
            ['operationGroupIndex', 999, `np.${i}.group`],
          ] as const)
            change('downstream', `np-${i}-${key}`, 'capacityUseMismatch', path, np, key, value);
          change(
            'downstream',
            `np-${i}-input-phase`,
            'capacityUseMismatch',
            `np.${i}.inputScalar`,
            np.input,
            'battlePointPhase',
            999,
          );
          change(
            'downstream',
            `np-${i}-evaluation`,
            'capacityUseMismatch',
            `np.${i}.evaluation`,
            np.evaluation,
            'status',
            'unsupported',
          );
        }
        for (const [i, np] of state.scalarNpConsumptions.entries())
          for (const key of ['input', 'evaluation'])
            change(
              'missing',
              `np-${i}-${key}`,
              'capacityTransportMissing',
              'execution.evidence',
              np,
              key,
              undefined,
            );
        for (const [i, t] of source.capture!.transitions.entries())
          change(
            'fake-commit',
            `action-${i}-executedEffects`,
            'capacityStateMismatch',
            'owner.capture',
            t.result.state.battlePoints,
            'executedEffects',
            [],
          );
        change(
          'identity-order',
          'input-reference',
          'capacityIdentityMismatch',
          'use.original',
          source.downstream,
          'input',
          structuredClone(source.downstream.input),
        );
        change(
          'identity-order',
          'result-reference',
          'capacityIdentityMismatch',
          'use.original',
          source.downstream,
          'result',
          structuredClone(source.downstream.result),
        );
        change(
          'downstream',
          'result-status',
          'capacityUseMismatch',
          'result.status',
          source.downstream.result,
          'status',
          'unsupported',
        );
        change(
          'downstream',
          'input-phase',
          'capacityUseMismatch',
          'owner.input',
          source.downstream.input,
          'battlePointPhase',
          999,
        );
        change(
          'identity-order',
          'canonical-program-forgery',
          'capacityIdentityMismatch',
          'canonical.program',
          source,
          'program',
          { ...program },
        );
        for (const [index, t] of source.capture!.transitions.entries()) {
          const ap = `action.${index}`;
          change(
            'missing',
            `${ap}-transition`,
            'capacityTransportMissing',
            `${ap}.transition`,
            source.capture!.transitions,
            index,
            undefined,
          );
          change(
            'missing',
            `${ap}-before`,
            'capacityTransportMissing',
            `${ap}.state`,
            t,
            'before',
            undefined,
          );
          change(
            'missing',
            `${ap}-command`,
            'capacityCanonicalMismatch',
            'preparation.commands',
            t,
            'command',
            undefined,
          );
          change(
            'fake-commit',
            `${ap}-status`,
            'capacityCommitMismatch',
            `${ap}.status`,
            t.result,
            'status',
            'rejected',
          );
          change(
            'identity-order',
            `${ap}-result-reference`,
            'capacityIdentityMismatch',
            `${ap}.references`,
            t,
            'result',
            structuredClone(t.result),
          );
          change(
            'stale-state',
            `${ap}-initial-start`,
            'capacityIdentityMismatch',
            `${ap}.references`,
            t.before,
            'battlePoints',
            source.capture!.transitions[0]!.before.battlePoints === t.before.battlePoints
              ? structuredClone(t.before.battlePoints)
              : source.capture!.transitions[0]!.before.battlePoints,
          );
          if (t.attempts?.[0]) {
            const a = t.attempts[0];
            if (program.downstream.expected.actions[index]?.skillId) {
              change(
                'missing',
                `${ap}-attempt`,
                'capacityTransportMissing',
                `${ap}.attempt`,
                t,
                'attempts',
                [],
              );
              change(
                'missing',
                `${ap}-source`,
                'capacityCanonicalMismatch',
                `${ap}.sources`,
                a,
                'sources',
                [],
              );
              change(
                'fake-commit',
                `${ap}-native`,
                'capacityCommitMismatch',
                `${ap}.native`,
                a.native!,
                'status',
                'unsupported',
              );
              change(
                'identity-order',
                `${ap}-action-id`,
                'capacityTransportMissing',
                `${ap}.attempt`,
                a,
                'actionId',
                'wrong-action',
              );
              change(
                'stale-state',
                `${ap}-attempt-start`,
                'capacityIdentityMismatch',
                `${ap}.actionStart`,
                a,
                'start',
                { ...a.start, battlePoints: structuredClone(a.start.battlePoints) },
              );
              change(
                'missing',
                `${ap}-writes`,
                'capacityPopulationMismatch',
                `${ap}.writes`,
                a,
                'writes',
                [],
              );
              change(
                'identity-order',
                `${ap}-write-duplicate`,
                'capacityPopulationMismatch',
                `${ap}.writes`,
                a,
                'writes',
                [...a.writes, ...a.writes],
              );
              if (a.writes.length > 1)
                change(
                  'identity-order',
                  `${ap}-write-reverse`,
                  'capacityPopulationMismatch',
                  `${ap}.writes`,
                  a,
                  'writes',
                  [...a.writes].reverse(),
                );
              for (const [i, w] of a.writes.entries()) {
                const wp = `${ap}.write.${i}`;
                change(
                  'missing',
                  `${wp}-state`,
                  'capacityTransportMissing',
                  `${wp}.states`,
                  w,
                  'after',
                  undefined,
                );
                change(
                  'identity-order',
                  `${wp}-valueSetIndex`,
                  'capacityCanonicalMismatch',
                  `${wp}.indexes`,
                  w.source,
                  'valueSetIndex',
                  4,
                );
                change(
                  'identity-order',
                  `${wp}-valueIndex`,
                  'capacityCanonicalMismatch',
                  `${wp}.indexes`,
                  w.source,
                  'valueIndex',
                  8,
                );
                for (const key of ['origin', 'sourceInstanceId', 'sourceId', 'skillId'])
                  change(
                    'identity-order',
                    `${wp}-${key}`,
                    'capacityCanonicalMismatch',
                    `${wp}.source`,
                    w.source,
                    key,
                    'wrong',
                  );
                change(
                  'identity-order',
                  `${wp}-occurrence`,
                  'capacityCanonicalMismatch',
                  `${wp}.source`,
                  w.source,
                  'effect',
                  { ...w.source.effect, occurrenceId: 'wrong' },
                );
                change(
                  'identity-order',
                  `${wp}-operationIndex`,
                  'capacityCanonicalMismatch',
                  `${wp}.operation`,
                  w,
                  'operationIndex',
                  999,
                );
                change(
                  'identity-order',
                  `${wp}-step`,
                  'capacityOrderMismatch',
                  `${wp}.step`,
                  w,
                  'step',
                  999,
                );
                change(
                  'fake-commit',
                  `${wp}-status`,
                  'capacityCommitMismatch',
                  `${wp}.originalStatus`,
                  w,
                  'status',
                  'notApplicable',
                );
                change(
                  'identity-order',
                  `${wp}-before-reference`,
                  'capacityIdentityMismatch',
                  `${wp}.references`,
                  w,
                  'before',
                  structuredClone(w.before),
                );
                change(
                  'identity-order',
                  `${wp}-after-reference`,
                  'capacityIdentityMismatch',
                  `${wp}.references`,
                  w,
                  'after',
                  structuredClone(w.after),
                );
                if (w.receipts[0]) {
                  const r = w.receipts[0];
                  change(
                    'missing',
                    `${wp}-receipt`,
                    'capacityPopulationMismatch',
                    `${wp}.receiptCount`,
                    w,
                    'receipts',
                    [],
                  );
                  change(
                    'identity-order',
                    `${wp}-receipt-reference`,
                    'capacityIdentityMismatch',
                    `${wp}.references`,
                    w,
                    'receipts',
                    structuredClone(w.receipts),
                  );
                  for (const key of ['identity', 'actor', 'domainId'])
                    change(
                      'identity-order',
                      `${wp}-receipt-${key}`,
                      'capacityCanonicalMismatch',
                      `${wp}.identity`,
                      r,
                      key,
                      'wrong',
                    );
                  change(
                    'stale-state',
                    `${wp}-receipt-before`,
                    'capacityIdentityMismatch',
                    `${wp}.receiptState`,
                    r,
                    'before',
                    structuredClone(r.before),
                  );
                  if (r.after.kind === 'present') {
                    for (const key of ['point', 'capacity'])
                      change(
                        'stale-state',
                        `${wp}-after-${key}`,
                        'capacityStateMismatch',
                        'owner.capture',
                        r.after,
                        key,
                        999,
                      );
                    if (
                      w.source.effect.execution[w.operationIndex]?.kind ===
                      'battlePointCapacityModifier'
                    ) {
                      change(
                        'missing',
                        `${wp}-modifier`,
                        'capacityStateMismatch',
                        `${wp}.modifiers`,
                        r.after,
                        'capacityModifiers',
                        [],
                      );
                      const m = r.after.capacityModifiers.at(-1)!;
                      for (const key of ['identity', 'amount', 'lifetime', 'traits'])
                        change(
                          'identity-order',
                          `${wp}-modifier-${key}`,
                          'capacityStateMismatch',
                          `${wp}.modifiers`,
                          m,
                          key,
                          key === 'amount' ? 999 : key === 'traits' ? ['wrong'] : 'wrong',
                        );
                    }
                  }
                }
              }
            }
          }
          for (const [i, step] of (source.steps[index] ?? []).entries()) {
            const sp = `${ap}.step.${i}`;
            change(
              'missing',
              `${sp}-boundary`,
              'capacityIdentityMismatch',
              `${sp}.reference`,
              source.steps[index]!,
              i,
              { ...step },
            );
            if (step.kind === 'reconcile') {
              change(
                'identity-order',
                `${sp}-domains`,
                'capacityCanonicalMismatch',
                `${sp}.domains`,
                step,
                'domains',
                [],
              );
              change(
                'stale-state',
                `${sp}-intermediate`,
                'capacityIdentityMismatch',
                `${sp}.original`,
                step,
                'after',
                { ...step.after, battlePoints: step.before.battlePoints },
              );
              change(
                'identity-order',
                `${sp}-before-reference`,
                'capacityIdentityMismatch',
                `${sp}.original`,
                step,
                'before',
                structuredClone(step.before),
              );
              change(
                'identity-order',
                `${sp}-owner`,
                'capacityStateMismatch',
                'owner.steps',
                step,
                'owner',
                'source',
              );
            } else if (step.kind === 'commit') {
              change(
                'fake-commit',
                `${sp}-commit-state`,
                'capacityCommitMismatch',
                `${sp}.native`,
                step,
                'after',
                structuredClone(step.after),
              );
            } else if (step.kind === 'sourceEnd') {
              change(
                'stale-state',
                `${sp}-source-state`,
                'capacityOrderMismatch',
                `${sp}.sourceEnd`,
                step,
                'state',
                structuredClone(step.state),
              );
            }
          }
        }
        if (testGroup === 'missing')
          for (const [name, expected, observations] of [
            ['missing-population', [program], []],
            ['extra-population', [], [source]],
            ['duplicate-population', [program], [source, source]],
          ] as const) {
            const { gate, valueProof } = auditBattlePointCapacityPreparation({
              expected,
              observations,
              evidence: 'population',
            });
            checks.push({
              name,
              group: 'missing',
              reason: 'capacityPopulationMismatch',
              path: 'population',
              gate,
              transport: materializeBattlePointCapacityValue(valueProof),
            });
          }
        change(
          'missing',
          'master-owner',
          'capacityCanonicalMismatch',
          'canonical.owner',
          program.downstream.prepared,
          'master',
          { ...master, servants: [] },
        );
        change(
          'missing',
          'canonical-command',
          'capacityCanonicalMismatch',
          'canonical.owner',
          program.downstream.prepared.scenario,
          'preNoblePhantasmPlan',
          [],
        );
        change(
          'missing',
          'canonical-writer-population',
          'capacityTransportMissing',
          'canonical.fields',
          program.downstream.expected,
          'writers',
          undefined,
        );
        change(
          'identity-order',
          'master-reference',
          'capacityIdentityMismatch',
          'canonical.original',
          program.downstream.prepared,
          'master',
          structuredClone(master),
        );
        change(
          'identity-order',
          'scenario-reference',
          'capacityIdentityMismatch',
          'canonical.original',
          program.downstream.prepared,
          'scenario',
          structuredClone(program.downstream.prepared.scenario),
        );
        change(
          'fake-commit',
          'invented-read',
          'capacityUseMismatch',
          'terminal.readPopulation',
          state,
          'battlePointPhaseReads',
          [...state.battlePointPhaseReads, ...state.battlePointPhaseReads],
        );
        change(
          'fake-commit',
          'invented-np',
          'capacityUseMismatch',
          'np.population',
          state,
          'scalarNpConsumptions',
          [...state.scalarNpConsumptions, ...state.scalarNpConsumptions],
        );
        change(
          'fake-commit',
          'invented-event',
          'capacityIdentityMismatch',
          'events.original',
          target,
          'operationEvents',
          [
            ...target.operationEvents,
            { ...target.operationEvents[0], operationId: 'invented-capacity-writer' },
          ],
        );
        const writer = program.downstream.expected.writers[0]!;
        const forgedSource = {
          ...program.downstream.expected.operations[0]!.source,
          origin: 'attacker',
          sourceInstanceId: writer.sourceInstanceId,
          skillId: writer.skillId,
          effectOccurrenceId: writer.effect.occurrenceId,
        };
        change(
          'fake-commit',
          'ordered-double-application',
          'capacityUseMismatch',
          `writer.${writer.identity}.orderedWrites`,
          program.downstream.prepared.orderedScenario!,
          'operations',
          [
            ...program.downstream.prepared.orderedScenario!.operations,
            {
              ...program.downstream.expected.operations[0],
              kind: 'addQuantity',
              source: forgedSource,
            },
          ],
        );
        change(
          'fake-commit',
          'invented-writer-projection',
          'capacityUseMismatch',
          `writer.${writer.identity}.projections`,
          source.downstream,
          'effects',
          [
            ...source.downstream.effects,
            {
              ...source.downstream.effects[0],
              source: forgedSource,
              operationId: 'invented-capacity-writer',
              explanation: { code: 'applied' },
            },
          ],
        );
        change(
          'fake-commit',
          'invented-writer-contribution',
          'capacityUseMismatch',
          `writer.${writer.identity}.contributions`,
          source.downstream.contributions,
          'contributions',
          [
            ...source.downstream.contributions.contributions,
            {
              ...source.downstream.contributions.contributions[0],
              source: forgedSource,
              operationId: 'invented-capacity-writer',
            },
          ],
        );
        if (testGroup === 'fake-commit') {
          const another = run(master, spec);
          change(
            'fake-commit',
            'mixed-selected-execution',
            'capacityIdentityMismatch',
            'transport.references',
            source,
            'capture',
            another.source.capture,
          );
        }
        if (spec.changed > 0)
          inspect(
            'missing',
            'fixed-consumer-chain',
            'capacityPopulationMismatch',
            'consumer.fixed',
            () => {
              const modified: { object: object; key: string; prior: unknown }[] = [];
              for (const t of source.capture!.transitions)
                for (const a of t.attempts ?? [])
                  for (const w of a.writes) {
                    const operation = w.source.effect.execution[w.operationIndex];
                    if (operation?.kind === 'resourceMutation') {
                      const actor = w.before.actors.attacker!;
                      const domain = actor.domains[operation.subjectId!]!;
                      if (domain.kind === 'present') {
                        modified.push({
                          object: domain,
                          key: 'capacityModifiers',
                          prior: domain.capacityModifiers,
                        });
                        Reflect.set(domain, 'capacityModifiers', []);
                      }
                    }
                  }
              return () => {
                for (const item of modified.reverse())
                  Reflect.set(item.object, item.key, item.prior);
              };
            },
          );
        const missingPublished = auditPublishedBattlePointCapacityPreparation(
          master,
          [],
          [],
          [battlePointCapacitySelection(program.downstream.prepared)!],
        );
        negatives.push(...checks);
        const payload = {
          spec,
          testGroup,
          positive: {
            gate: positive.gate,
            result: positive.result,
            proof: materializeBattlePointCapacityValue(
              battlePointCapacityDiagnosticProof(positive.source),
            ),
          },
          normal: normal.source.downstream.calculation,
          ranking: {
            gate: ranking.gate,
            result: ranking.result,
            proof: materializeBattlePointCapacityValue(
              battlePointCapacityDiagnosticProof(ranking.source),
            ),
          },
          published,
          negatives,
          missingPublished,
        };
        const diagnostic = encodeProductionAuditDiagnostic(payload);
        const roundTrip = equalProductionAuditDiagnosticValues(
          decodeProductionAuditDiagnostic(diagnostic),
          payload,
        );
        const encoded = serializeProductionAuditArtifact(diagnostic);
        const savedRoundTrip = equalProductionAuditDiagnosticValues(
          decodeProductionAuditDiagnostic(
            decodeProductionAuditArtifact(encoded) as typeof diagnostic,
          ),
          payload,
        );
        await writeProductionAuditArtifact(
          task.meta,
          `tsk-08-bp-capacity-${spec.name}-${testGroup}.json`,
          {
            diagnosticVersion: 1,
            encoding: 'lossless-interned-values',
            negativeCount: checks.length,
            roundTrip,
            savedRoundTrip,
            encoded: diagnostic,
          },
        );
        const savedBytes = await readFile(
          resolve(
            process.env['FGO_TEST_ARTIFACT_DIR']!,
            `tsk-08-bp-capacity-${spec.name}-${testGroup}.json`,
          ),
        );
        const diskRoundTrip = equalProductionAuditDiagnosticValues(
          decodeProductionAuditDiagnostic(
            (decodeProductionAuditArtifact(savedBytes) as { encoded: typeof diagnostic }).encoded,
          ),
          payload,
        );
        expect(diskRoundTrip).toBe(true);
        expect(roundTrip).toBe(true);
        expect(savedRoundTrip).toBe(true);
        for (const negative of checks) {
          expect(negative.gate.status, negative.name).toBe('failed');
          const failure = negative.gate.failures.find(
            (f) => f.reason === negative.reason && f.checkPath === negative.path,
          );
          expect(
            failure,
            `${negative.name}:${JSON.stringify(negative.gate.failures.map((f) => [f.reason, f.checkPath]))}`,
          ).toBeDefined();
          expect(failure?.firstDifference.identity).toBe(failure?.canonicalIdentity);
          expect(failure?.firstDifference.path.startsWith(negative.path)).toBe(true);
        }
        expect(missingPublished.status).toBe('failed');
        expect(
          missingPublished.failures.some(
            (f) =>
              f.reason === 'capacityPopulationMismatch' &&
              f.checkPath === 'published.selected' &&
              f.firstDifference.path.startsWith('published.selected'),
          ),
        ).toBe(true);
        expect(
          positive.gate.status,
          JSON.stringify(positive.gate.failures.map((f) => [f.reason, f.checkPath])),
        ).toBe('passed');
        expect(
          ranking.gate.status,
          JSON.stringify(ranking.gate.failures.map((f) => [f.reason, f.checkPath])),
        ).toBe('passed');
        expect(published.status).toBe('passed');
        expect(positive.gate.changedCapacityWrites).toBe(spec.changed);
        const expectedWrites: Record<string, (number | null)[][]> = {
          'increase-gain-loss': [
            [150, 80],
            [150, 150],
            [150, 130],
          ],
          'decrease-point-clamp': [
            [50, 50],
            [50, 50],
            [50, 30],
          ],
          'unchanged-point-permille': [
            [200, 60],
            [200, 60],
          ],
          'intermediate-reconciled': [
            [100, 80],
            [40, 40],
            [40, 40],
            [90, 90],
            [90, 80],
          ],
          'prior-commit-action-start': [
            [100, 40],
            [150, 40],
            [150, 150],
            [150, 140],
          ],
          'null-capacity-boundary': [
            [null, 20],
            [null, 30],
          ],
          'zero-amount-capacity-boundary': [
            [0, 0],
            [0, 0],
          ],
          'eligible-absent-boundary': [[100, 10]],
          'ineligible-boundary': [],
        };
        const intermediate = source.capture!.transitions.flatMap(
          (t) =>
            t.attempts?.flatMap((a) =>
              a.writes.flatMap((w) =>
                w.receipts.map((r) =>
                  r.after.kind === 'present' ? [r.after.capacity, r.after.point] : [],
                ),
              ),
            ) ?? [],
        );
        expect(intermediate).toEqual(expectedWrites[spec.name]);
        if (spec.name === 'intermediate-reconciled') {
          const reconciled =
            source.capture!.transitions[0]!.result.state.battlePoints.actors.attacker!.domains[
              '810000'
            ];
          expect(
            reconciled?.kind === 'present' ? [reconciled.capacity, reconciled.point] : null,
          ).toEqual([90, 40]);
        }
        if (spec.name === 'prior-commit-action-start') {
          const start =
            source.capture!.transitions[1]!.before.battlePoints.actors.attacker!.domains['810000'];
          expect(start?.kind === 'present' ? start.point : null).toBe(40);
        }

        const value =
          positive.program.downstream.prepared.orderedScenario!.battlePoints!.actors.attacker!
            .domains['810000'];
        expect(value?.kind === 'present' ? [value.point, value.capacity] : [0, null]).toEqual([
          spec.point,
          spec.retainedCapacity,
        ]);
        expect(positive.source.downstream.preparation?.conversion?.phase).toBe(spec.phase);
        const resultTarget = positive.source.downstream.observation!.targetExecution;
        expect(
          resultTarget?.selection === 'selected'
            ? resultTarget.candidateState?.scalarNpConsumptions[0]?.consumedValue
            : undefined,
        ).toBe(Math.min(3, spec.phase));
        expect([
          normal.source.downstream.input,
          normal.source.downstream.result,
          normal.source.downstream.effects,
          normal.source.downstream.contributions,
        ]).toEqual([
          positive.source.downstream.input,
          positive.source.downstream.result,
          positive.source.downstream.effects,
          positive.source.downstream.contributions,
        ]);
        expect(ranking.result).toEqual(positive.result);
        expect(positive.result).toEqual(positive.source.downstream.result);
      },
    );

it(
  'fixes observed capacity canonical mutations before restore without changing authority',
  productionAuditTestOptions(['tsk-08-capacity-proof-lifetime.json']),
  async ({ task }) => {
    const master = fixtureMaster(specs[0]!);
    const { program, source } = run(master, specs[0]!);
    const before = battlePointCapacityDiagnosticProof(source);
    const writers = program.downstream.expected.writers;
    let mutated: ReturnType<typeof auditBattlePointCapacityPreparation>;
    let published: ReturnType<typeof auditPublishedBattlePointCapacityPreparation>;
    try {
      program.downstream.expected.writers = [];
      mutated = auditBattlePointCapacityPreparation({
        expected: [program],
        observations: [source],
        evidence: 'diagnostics',
      });
      published = auditPublishedBattlePointCapacityPreparation(
        master,
        [program],
        [source],
        [battlePointCapacitySelection(program.downstream.prepared)!],
      );
    } finally {
      program.downstream.expected.writers = writers;
    }
    const after = battlePointCapacityDiagnosticProof(source);
    const raw = materializeBattlePointCapacityValue(mutated.valueProof) as {
      canonical: { writers: unknown[] };
    }[];
    const input = source.downstream.input;
    let copy: ReturnType<typeof auditBattlePointCapacityPreparation>;
    let copyTransport: unknown;
    try {
      source.downstream.input = structuredClone(input);
      copy = auditBattlePointCapacityPreparation({
        expected: [program],
        observations: [source],
        evidence: 'diagnostics',
      });
      copyTransport = materializeBattlePointCapacityValue(copy.valueProof);
    } finally {
      source.downstream.input = input;
    }
    await saveCapacityContract(task.meta, 'tsk-08-capacity-proof-lifetime.json', {
      before: materializeBattlePointCapacityValue(before),
      mutated: { gate: mutated.gate, proof: raw },
      copy: { gate: copy.gate, proof: copyTransport },
      after: materializeBattlePointCapacityValue(after),
      published,
    });
    expect(
      copy.gate.failures.some(
        (f) => f.reason === 'capacityIdentityMismatch' && f.checkPath === 'use.original',
      ),
    ).toBe(true);
    expect(raw[0]!.canonical.writers).toEqual([]);
    expect(mutated.gate.failures.some((f) => f.checkPath === 'canonical.contract')).toBe(true);
    expect(published.gate.failures).toEqual(mutated.gate.failures);
    expect(
      equalProductionAuditDiagnosticValues(
        materializeBattlePointCapacityValue(before),
        materializeBattlePointCapacityValue(after),
      ),
    ).toBe(true);
    expect(
      auditBattlePointCapacityPreparation({
        expected: [program],
        observations: [source],
        evidence: 'diagnostics',
      }).gate.status,
    ).toBe('passed');
  },
);

it(
  'fixes the complete capacity population envelope including unmatched and duplicate observations',
  productionAuditTestOptions(['tsk-08-capacity-proof-population.json']),
  async ({ task }) => {
    const { program, source } = run(fixtureMaster(specs[0]!), specs[0]!);
    const unmatched = {
      ...source,
      program: { ...program, canonicalIdentity: 'unmatched-capacity-observation' },
    };
    const inspected = auditBattlePointCapacityPreparation({
      expected: [program],
      observations: [source, unmatched, source],
      evidence: 'population',
    });
    const established = materializeBattlePointCapacityValue(inspected.valueProof);
    let whileMutated: unknown;
    const steps = source.steps;
    const identity = program.canonicalIdentity;
    try {
      source.steps = [];
      program.canonicalIdentity = 'later-capacity-mutation';
      whileMutated = materializeBattlePointCapacityValue(inspected.valueProof);
    } finally {
      source.steps = steps;
      program.canonicalIdentity = identity;
    }
    const restored = materializeBattlePointCapacityValue(inspected.valueProof) as {
      expected: (typeof program)[];
      observations: (typeof source)[];
    };
    const diagnostics = auditBattlePointCapacityPreparation({
      expected: [],
      observations: [unmatched, source, source],
      evidence: 'diagnostics',
    });
    const observed = materializeBattlePointCapacityValue(diagnostics.valueProof) as {
      canonicalIdentity: string;
    }[];
    await saveCapacityContract(task.meta, 'tsk-08-capacity-proof-population.json', {
      gate: inspected.gate,
      proof: restored,
      whileMutated,
      diagnostics: { gate: diagnostics.gate, proof: observed },
    });
    expect(equalProductionAuditDiagnosticValues(restored, established)).toBe(true);
    expect(equalProductionAuditDiagnosticValues(whileMutated, established)).toBe(true);
    expect(
      equalProductionAuditDiagnosticValues(restored, {
        expected: [program],
        observations: [source, unmatched, source],
      }),
    ).toBe(true);
    expect(restored.expected).toHaveLength(1);
    expect(restored.observations).toHaveLength(3);
    expect(restored.observations[0]).toBe(restored.observations[2]);
    expect(restored.observations[1]!.program.canonicalIdentity).toBe(
      'unmatched-capacity-observation',
    );
    expect(observed.map((o) => o.canonicalIdentity)).toEqual([
      'unmatched-capacity-observation',
      identity,
      identity,
    ]);
    expect(inspected.gate.status).toBe('failed');
    expect(diagnostics.gate.status).toBe('failed');
  },
);
