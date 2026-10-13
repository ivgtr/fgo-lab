import { expect, it, vi } from 'vitest';
import * as hpOwner from '../../battle-execution/src/preparationHp';
import * as modifierOwner from '../../battle-execution/src/hpResource';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema, type MasterDataSnapshot } from '@fgo-lab/master-data';
import { firstCanonicalAuditDifference } from '@fgo-lab/master-data/production-audit';
import { ENGINE_VERSION, SCHEMA_VERSION, resolvedScenarioSchema } from '@fgo-lab/schema';
import { hpProofCoverageInventory } from './productionHpProofCoverage';
import { reconcileHpOperationEvidence } from './productionHpOperationEvidence';
import {
  createDefaultResolvedScenario,
  prepareCalculationScenarioWithPolicy,
  evaluatePreparedCalculationScenario,
  evaluatePreparedCalculationResult,
} from './scenario';
import {
  selectedAllyMaximumFixedMaySelect,
  selectedAllyMaximumFixedCanonical,
  selectedAllyMaximumFixedSelection,
  selectedAllyMaximumFixedProgram,
  selectedAllyMaximumFixedSource,
  selectedAllyMaximumFixedDiagnostic,
  auditSelectedAllyMaximumFixed,
  auditPublishedSelectedAllyMaximumFixed,
  type SelectedAllyMaximumFixedSource,
  type SelectedAllyMaximumFixedReason,
} from './productionHpSelectedAllyMaximumFixedPreparationAudit';
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
  fixedAfter?: number;
  expectedMaximum?: number;
  always?: boolean;
  choice?: boolean;
  omitted?: boolean;
  noReader?: boolean;
  noNp?: boolean;
  disabled?: boolean;
  recipientClass?: boolean;
  rejectFirst?: boolean;
};
const specs: Spec[] = [
  {
    name: 'increase-choice',
    always: true,
    initial: 333,
    writes: [[731]],
    final: 4064,
    expectedMaximum: 10741,
    choice: true,
  },
  { name: 'decrease', initial: 800, writes: [[-2345]], final: 5663, expectedMaximum: 7665 },
  { name: 'floor', initial: 200, writes: [[-3000]], final: 1, expectedMaximum: 7010 },
  {
    name: 'multiple-order',
    initial: 333,
    writes: [[731, -1234, 111]],
    final: 2941,
    expectedMaximum: 9618,
    choice: true,
  },
  {
    name: 'committed-prefix',
    initial: 500,
    writes: [[1200], [-700, 91]],
    final: 5596,
    expectedMaximum: 10601,
  },
  { name: 'zero-value', initial: 600, writes: [[0]], final: 6006, expectedMaximum: 10010 },
  { name: 'dead', initial: 0, writes: [[731]], final: 0, expectedMaximum: 10741 },
  {
    name: 'no-reader',
    initial: 333,
    writes: [[731]],
    final: 4064,
    expectedMaximum: 10741,
    noReader: true,
  },
  { name: 'no-np', initial: 333, writes: [[731]], final: 4064, expectedMaximum: 10741, noNp: true },
  {
    name: 'recipient-applied',
    initial: 333,
    writes: [[731]],
    final: 4064,
    expectedMaximum: 10741,
    recipientClass: true,
  },
  {
    name: 'recipient-not-applied',
    initial: 333,
    writes: [[731]],
    final: 3333,
    expectedMaximum: 10010,
    recipientClass: false,
  },
  {
    name: 'native-unreached',
    initial: 500,
    writes: [[1200], [-700]],
    final: 5005,
    expectedMaximum: 10010,
    rejectFirst: true,
  },
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
        requirement: {
          recipient: 'partyMember',
          expression:
            spec.recipientClass === undefined
              ? { kind: 'always' }
              : {
                  kind: 'targetPredicate',
                  scope: 'recipient',
                  predicate: {
                    kind: 'classIdentity',
                    classId: spec.recipientClass
                      ? servant.classId
                      : servant.classId === 'berserker'
                        ? 'caster'
                        : 'berserker',
                  },
                  present: true,
                },
        },
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
        execution: writes.flatMap((amount) => [
          {
            kind: 'hpModifier',
            ...(spec.always ? { useCondition: { kind: 'always' } } : {}),
            action: 'maximumFixed',
            sign: amount < 0 ? -1 : 1,
            route: {
              target: 'partyMember',
              contributionScope: 'personal',
              eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
            },
            selection: 'selectedAlly',
            bounds: { minimum: null, maximum: null },
            lifetime: 'active',
            traits: ['maximum-hp-fixture'],
            values: [
              Array.from({ length: 10 }, (_, level) =>
                spec.rejectFirst && index === 0 && level === 3
                  ? null
                  : Math.abs(amount) + (level === 3 ? 0 : 17),
              ),
              [],
              [],
              [],
              [],
            ],
          },
          ...(spec.fixedAfter === undefined
            ? []
            : [
                {
                  kind: 'resourceMutation',
                  resource: 'hp',
                  direction: spec.fixedAfter < 0 ? 'loss' : 'gain',
                  unit: 'fixed',
                  recipient: 'sourceSelf',
                  selection: 'direct',
                  subjectId: null,
                  ...(spec.fixedAfter < 0 ? { lossFloor: spec.floor ?? 'zero' } : {}),
                  amount: {
                    kind: 'fixed',
                    values: [
                      Array.from({ length: 10 }, () => Math.abs(spec.fixedAfter!)),
                      [],
                      [],
                      [],
                      [],
                    ],
                  },
                },
              ]),
        ]),
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
        predicates: [{ kind: 'classIdentity', classId: servant.classId }],
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
  const scenario = resolvedScenarioSchema.parse({
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
  });
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
  const selection = selectedAllyMaximumFixedSelection(prepared, calculation);
  if (!selection) throw new Error('missing HP canonical selection');
  const direct = evaluatePreparedCalculationResult(prepared, {
    ...versions,
    masterDataVersion: master.version,
  });
  const program = selectedAllyMaximumFixedProgram(selection, direct);
  const source = selectedAllyMaximumFixedSource(selection, direct);
  return {
    prepared,
    calculation,
    selection,
    program,
    source,
    gate: auditSelectedAllyMaximumFixed({ expected: [program], observations: [source] }),
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
function entry(spec: Spec) {
  let e = shared.get(spec);
  if (!e) {
    const master = fixtureMaster(spec);
    e = {
      master,
      positive: run(master, spec),
      normal: run(master, spec, false),
      ranking: run(master, spec, true, true),
    };
    shared.set(spec, e);
  }
  return e;
}
async function save(task: { meta: unknown }, path: string, payload: unknown) {
  const encoded = encodeProductionAuditDiagnostic(payload);
  const receipt = await writeProductionAuditArtifact(task.meta, path, encoded);
  const bytes = await readStoredProductionAuditArtifact(path);
  const decoded = decodeStoredProductionAuditArtifact(bytes) as ReturnType<
    typeof encodeProductionAuditDiagnostic
  >;
  expect(receipt.expectedBytes).toBe(bytes.length);
  expect(receipt.expectedSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  expect(isDeepStrictEqual(decodeProductionAuditDiagnostic(decoded), payload)).toBe(true);
}
for (const spec of specs)
  it(
    `selectedAllyMaximumFixed forward or boundary ${spec.name}`,
    productionAuditTestOptions([`audit-selected-ally-maximum-fixed-${spec.name}.json`]),
    async ({ task }) => {
      const { master, positive: p, normal, ranking } = entry(spec);
      const published = auditPublishedSelectedAllyMaximumFixed(
        master,
        [p],
        [p.selection],
        [p.program],
        [p.source],
        [p.prepared],
      );
      await save(task, `audit-selected-ally-maximum-fixed-${spec.name}.json`, {
        spec,
        gate: p.gate,
        proof: selectedAllyMaximumFixedDiagnostic(p.source),
        published,
        parity: {
          normal: normal.calculation.result,
          capture: p.calculation.result,
          ranking: ranking.calculation.result,
        },
      });
      expect(p.gate.status, JSON.stringify(p.gate.firstDifference)).toBe('passed');
      expect(published.status, JSON.stringify(published.firstDifference)).toBe('passed');
      expect(normal.calculation.result).toEqual(p.calculation.result);
      expect(ranking.calculation.result).toEqual(p.calculation.result);
      const final = p.source.transitions?.at(-1)?.result.state.hp?.actors.attacker;
      expect(final).toMatchObject({
        kind: 'absolute',
        baseMaximum: 10010,
        maximum: spec.expectedMaximum,
        current: spec.final,
      });
      if (p.prepared.status === 'executable') {
        expect(p.calculation.result.status).toBe('calculated');
        for (const np of p.source.candidate?.nps ?? []) {
          expect(np.disposition).toBe('consumed');
          expect(np.ratio).toBe(spec.final / spec.expectedMaximum!);
          if (spec.name === 'increase-choice')
            expect(np.ratio).not.toBe(p.source.candidate!.seed.permille! / 1000);
        }
      }
      if (
        !spec.disabled &&
        !spec.rejectFirst &&
        spec.recipientClass !== false &&
        !spec.noReader &&
        !spec.noNp &&
        spec.initial > 0 &&
        spec.writes.flat().some((v) => v !== 0)
      )
        expect(p.gate.connected).toBe(1);
      else expect(p.gate.connected).toBe(0);
    },
  );

it(
  'keeps a schema-parsed selected HP writer unreached after native rejection',
  productionAuditTestOptions(['hp-native-selected-unreached.json']),
  async ({ task }) => {
    const spec = {
      ...specs.find((item) => item.name === 'native-unreached')!,
      writes: [[1200, -700]],
    };
    const master = fixtureMaster(spec);
    const result = run(master, spec);
    const evidence = reconcileHpOperationEvidence(hpProofCoverageInventory(master), [
      {
        prepared: result.prepared,
        calculation: result.calculation,
      },
    ]);
    expect(result.prepared.status).toBe('rejected');
    expect(result.prepared.orderedScenario).toBeNull();
    expect(evidence.gate.failures).toEqual([]);
    expect(
      evidence.rows.some(
        (row) =>
          row.step !== null && !row.reached && !row.attempted && row.transaction === 'rejected',
      ),
    ).toBe(true);
    expect(evidence.candidateReads).toEqual([]);
    await save(task, 'hp-native-selected-unreached.json', {
      status: result.prepared.status,
      orderedScenario: result.prepared.orderedScenario,
      result: result.calculation.result,
      evidence,
    });
  },
);

type Path = (string | number)[];
function at(value: unknown, path: Path): unknown {
  return path.reduce<unknown>(
    (v, key) => (v !== null && typeof v === 'object' ? Reflect.get(v, key) : undefined),
    value,
  );
}
/** Copy just the replaced path: other original owner references remain intact. */
function replace(value: unknown, path: Path, changed: unknown): unknown {
  if (!path.length) return changed;
  if (!value || typeof value !== 'object') throw new Error('invalid mutation path');
  const [key, ...rest] = path;
  const copy: object = Array.isArray(value) ? [...(value as unknown[])] : { ...value };
  Reflect.set(copy, key!, replace(Reflect.get(value, key!), rest, changed));
  return copy;
}
function leaves(value: unknown, path: Path = []): Path[] {
  if (value instanceof Map || value instanceof Set) return [path];
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length
      ? entries.flatMap(([key, v]) =>
          leaves(v, [...path, Array.isArray(value) ? Number(key) : key]),
        )
      : [path];
  }
  return [path];
}
function different(value: unknown): unknown {
  if (typeof value === 'number') return value + 1;
  if (typeof value === 'string') return `${value}:altered`;
  if (typeof value === 'boolean') return !value;
  if (Array.isArray(value)) return ['altered'];
  if (value && typeof value === 'object') return { altered: true };
  return 'altered';
}
const nativePath: Path = ['transitions', 0, 'hpActions', 0];
const writePath: Path = [...nativePath, 'selectedAllyMaximumFixedWrites', 0];
const reasonPrefix = 'selectedAllyMaximumFixed';
const negativeGroups: {
  name: string;
  source: Path;
  diagnostic: Path;
  reason: SelectedAllyMaximumFixedReason;
}[] = [
  {
    name: 'canonical',
    source: ['canonical'],
    diagnostic: ['canonical'],
    reason: `${reasonPrefix}CanonicalMismatch`,
  },
  {
    name: 'actor-environment',
    source: ['master', 'servants', 0],
    diagnostic: ['masterActorEnvironment'],
    reason: `${reasonPrefix}CanonicalMismatch`,
  },
  {
    name: 'source',
    source: [...writePath, 'source'],
    diagnostic: ['selectedAllyActions', 0, 0, 'writes', 0, 'source'],
    reason: `${reasonPrefix}WriteMismatch`,
  },
  {
    name: 'operation',
    source: [...writePath, 'operation'],
    diagnostic: ['selectedAllyActions', 0, 0, 'writes', 0, 'operation'],
    reason: `${reasonPrefix}WriteMismatch`,
  },
  {
    name: 'modifier',
    source: [...writePath, 'modifiers'],
    diagnostic: ['selectedAllyActions', 0, 0, 'writes', 0, 'modifiers'],
    reason: `${reasonPrefix}WriteMismatch`,
  },
  {
    name: 'receipt',
    source: [...writePath, 'receipts'],
    diagnostic: ['selectedAllyActions', 0, 0, 'writes', 0, 'receipts'],
    reason: `${reasonPrefix}WriteMismatch`,
  },
  {
    name: 'before-hp',
    source: [...writePath, 'before'],
    diagnostic: ['selectedAllyActions', 0, 0, 'writes', 0, 'before'],
    reason: `${reasonPrefix}WriteMismatch`,
  },
  {
    name: 'after-hp',
    source: [...writePath, 'after'],
    diagnostic: ['selectedAllyActions', 0, 0, 'writes', 0, 'after'],
    reason: `${reasonPrefix}WriteMismatch`,
  },
  {
    name: 'reader',
    source: ['candidate', 'reads'],
    diagnostic: ['candidate', 'reads'],
    reason: `${reasonPrefix}ReaderMismatch`,
  },
  {
    name: 'np',
    source: ['candidate', 'nps'],
    diagnostic: ['candidate', 'nps'],
    reason: `${reasonPrefix}NpMismatch`,
  },
  { name: 'input', source: ['input'], diagnostic: ['input'], reason: `${reasonPrefix}UseMismatch` },
  {
    name: 'result',
    source: ['result'],
    diagnostic: ['result'],
    reason: `${reasonPrefix}UseMismatch`,
  },
];
function verifyDifferences(gate: ReturnType<typeof auditSelectedAllyMaximumFixed>) {
  expect(gate.status).toBe('failed');
  expect(gate.changed).toBe(0);
  expect(gate.connected).toBe(0);
  for (const failure of gate.failures) {
    const diff = firstCanonicalAuditDifference(
      [{ identity: failure.identity, value: failure.expected }],
      [{ identity: failure.identity, value: failure.actual }],
    )!;
    expect(failure.firstDifference).toEqual({
      ...diff,
      path: diff.path ? `${failure.checkPath}.${diff.path}` : failure.checkPath,
    });
  }
}
// Batched complete evidence bounds storage without removing any negative cell.
for (const group of negativeGroups)
  for (let shard = 0; shard < 3; shard++) {
    const artifact = `audit-selected-ally-negative-${group.name}-${shard}.json`;
    it(
      `selectedAlly responsibility ${group.name} ${shard}`,
      productionAuditTestOptions([artifact]),
      async ({ task }) => {
        const p = entry(specs[0]!).positive;
        const proof = selectedAllyMaximumFixedDiagnostic(p.source);
        const mutations = leaves(at(proof, group.diagnostic))
          .filter((_, i) => i % 3 === shard)
          .map((path) => {
            const sourcePath = [...path];
            const variant = sourcePath.indexOf('noblePhantasmVariant');
            if (variant >= 0 && sourcePath[variant - 1] === 'state')
              sourcePath.splice(variant + 1, 0, 'ref');
            const value = at(p.source, [...group.source, ...sourcePath]);
            const altered = replace(
              p.source,
              [...group.source, ...sourcePath],
              different(value),
            ) as SelectedAllyMaximumFixedSource;
            return {
              path,
              wanted: [
                ...group.diagnostic,
                ...(group.name === 'actor-environment' && path[0] === 'id' ? [] : path),
              ].join('.'),
              gate: auditSelectedAllyMaximumFixed({
                expected: [p.program],
                observations: [altered],
              }),
            };
          });
        await save(task, artifact, {
          identity: p.selection.identity,
          reason: group.reason,
          mutations,
        });
        expect(mutations.length).toBeGreaterThan(0);
        for (const mutation of mutations) {
          verifyDifferences(mutation.gate);
          expect(
            mutation.gate.failures.some(
              (f) =>
                f.reason === group.reason &&
                (f.checkPath === mutation.wanted || f.checkPath.startsWith(`${mutation.wanted}.`)),
            ),
            mutation.wanted,
          ).toBe(true);
        }
      },
    );
  }

it(
  'selectedAlly denies missing duplicate reversed writes and same-valued replaced owner references',
  productionAuditTestOptions(['audit-selected-ally-order-reference.json']),
  async ({ task }) => {
    const p = entry(specs[3]!).positive;
    const writes = at(p.source, [...nativePath, 'selectedAllyMaximumFixedWrites']) as unknown[];
    const cases = [
      {
        name: 'missing-write',
        path: [...nativePath, 'selectedAllyMaximumFixedWrites'],
        value: writes.slice(1),
        reason: `${reasonPrefix}WriteMismatch`,
        check: 'selectedAllyActions.0.0.writes.length',
      },
      {
        name: 'duplicate-write',
        path: [...nativePath, 'selectedAllyMaximumFixedWrites'],
        value: [...writes, writes[0]],
        reason: `${reasonPrefix}WriteMismatch`,
        check: 'selectedAllyActions.0.0.writes.length',
      },
      {
        name: 'reversed-writes',
        path: [...nativePath, 'selectedAllyMaximumFixedWrites'],
        value: [...writes].reverse(),
        reason: `${reasonPrefix}WriteMismatch`,
        check: 'selectedAllyActions.0.0.writes.0',
      },
      ...[
        { path: ['master'], anchor: 'master' },
        { path: ['selection'], anchor: 'selection' },
        { path: ['candidate'], anchor: 'candidate' },
        { path: ['ordered'], anchor: 'ordered' },
        { path: ['observation'], anchor: 'observation' },
        { path: ['directResult'], anchor: 'directResult' },
        { path: [...nativePath, 'commitStartHp'], anchor: 'action.0.native.0.commitStartHp' },
        {
          path: [...writePath, 'operation'],
          anchor: 'action.0.native.0.selectedAllyMaximumFixedWrites.0.operation',
        },
        {
          path: [...writePath, 'source'],
          anchor: 'action.0.native.0.selectedAllyMaximumFixedWrites.0.source',
        },
        {
          path: [...writePath, 'receipts', 0],
          anchor: 'action.0.native.0.selectedAllyMaximumFixedWrites.0.receipts.0',
        },
        {
          path: [...writePath, 'modifiers', 0],
          anchor: 'action.0.native.0.selectedAllyMaximumFixedWrites.0.modifiers.0',
        },
      ].map(({ path, anchor }) => ({
        name: `replace-${anchor}`,
        path,
        value: { ...(at(p.source, path) as object) },
        reason: `${reasonPrefix}IdentityMismatch`,
        check: `reference.${anchor}`,
      })),
    ];
    const results = cases.map((c) => ({
      ...c,
      gate: auditSelectedAllyMaximumFixed({
        expected: [p.program],
        observations: [replace(p.source, c.path, c.value) as SelectedAllyMaximumFixedSource],
      }),
    }));
    await save(task, 'audit-selected-ally-order-reference.json', results);
    for (const r of results) {
      verifyDifferences(r.gate);
      expect(
        r.gate.failures.some((f) => f.reason === r.reason && f.checkPath.startsWith(r.check)),
        r.name,
      ).toBe(true);
    }
  },
);

it(
  'selectedAlly population retains no-change no-reader no-NP nonapplication and native refusal',
  productionAuditTestOptions(['audit-selected-ally-population.json']),
  async ({ task }) => {
    const entries = specs.map(entry);
    const all = entries.map((e) => e.positive);
    // All schema-legal commands, not the observed successes, define the gate's input ledger.
    const p = all[0]!;
    const filtered = auditPublishedSelectedAllyMaximumFixed(
      entries[0]!.master,
      all,
      [],
      [],
      [],
      all.map((p) => p.prepared),
    );
    const filteredRequests = auditPublishedSelectedAllyMaximumFixed(
      entries[0]!.master,
      [],
      [],
      [],
      [],
      all.map((p) => p.prepared),
    );
    const missing = auditSelectedAllyMaximumFixed({ expected: [p.program], observations: [] });
    const duplicate = auditSelectedAllyMaximumFixed({
      expected: [p.program, p.program],
      observations: [p.source, p.source],
    });
    const raw = structuredClone(entries[0]!.master);
    const operation = raw.servants[0]!.skills[0]!.effects[0]!.execution.find(
      (o) => o.kind === 'hpModifier',
    )!;
    operation.values[0][3] = null;
    const refusal = run(masterSnapshotSchema.parse(raw), specs[0]!);
    const forgedCandidate = auditSelectedAllyMaximumFixed({
      expected: [refusal.program],
      observations: [{ ...refusal.source, candidate: p.source.candidate }],
    });
    const forgedRefusalDownstream = [
      { name: 'reader', path: ['candidate'], value: p.source.candidate },
      {
        name: 'np',
        path: ['candidate'],
        value: { ...p.source.candidate, nps: p.source.candidate!.nps },
      },
      { name: 'input', path: ['input'], value: p.source.input },
      { name: 'result', path: ['result'], value: p.source.result },
    ].map((c) => ({
      name: c.name,
      gate: auditSelectedAllyMaximumFixed({
        expected: [refusal.program],
        observations: [replace(refusal.source, c.path, c.value) as SelectedAllyMaximumFixedSource],
      }),
    }));
    const forgedCommit = auditSelectedAllyMaximumFixed({
      expected: [refusal.program],
      observations: [
        replace(
          refusal.source,
          [...nativePath, 'native', 'status'],
          'committed',
        ) as SelectedAllyMaximumFixedSource,
      ],
    });
    await save(task, 'audit-selected-ally-population.json', {
      boundaries: all.map((v) => ({ canonical: v.selection.canonical, gate: v.gate })),
      filtered,
      filteredRequests,
      missing,
      duplicate,
      refusal: { gate: refusal.gate, proof: selectedAllyMaximumFixedDiagnostic(refusal.source) },
      forgedCandidate,
      forgedRefusalDownstream,
      forgedCommit,
    });
    expect(
      filtered.failures.some(
        (f) =>
          f.reason === `${reasonPrefix}PopulationMismatch` &&
          f.checkPath === 'published.selections',
      ),
    ).toBe(true);
    expect(
      missing.failures.some(
        (f) => f.reason === `${reasonPrefix}PopulationMismatch` && f.checkPath === 'population',
      ),
    ).toBe(true);
    expect(
      duplicate.failures.some(
        (f) =>
          f.reason === `${reasonPrefix}PopulationMismatch` && f.checkPath === 'population.unique',
      ),
    ).toBe(true);
    expect(refusal.gate.status, JSON.stringify(refusal.gate.firstDifference)).toBe('passed');
    expect(refusal.source.candidate).toBeUndefined();
    expect(refusal.source.input).toBeUndefined();
    expect(refusal.calculation.result.status).not.toBe('calculated');
    verifyDifferences(forgedCandidate);
    for (const r of forgedRefusalDownstream) verifyDifferences(r.gate);
    verifyDifferences(forgedCommit);
    expect(
      forgedCommit.failures.some(
        (f) =>
          f.reason === `${reasonPrefix}CommitMismatch` && f.checkPath.endsWith('.native.status'),
      ),
    ).toBe(true);
    expect(
      filteredRequests.failures.some(
        (f) =>
          f.reason === `${reasonPrefix}PopulationMismatch` && f.checkPath === 'published.requests',
      ),
    ).toBe(true);
    for (const gate of [filtered, filteredRequests, missing, duplicate]) {
      expect(gate.status).toBe('failed');
      expect(gate.firstDifference).not.toBeNull();
    }
  },
);

it(
  'selectedAlly captures original owners without replay and generates equal ordinary canonical contracts',
  productionAuditTestOptions(['audit-selected-ally-owner.json']),
  async ({ task }) => {
    const e = entry(specs[0]!);
    const execute = vi.spyOn(hpOwner, 'executeHpOperation');
    const change = vi.spyOn(modifierOwner, 'changeHpModifiers');
    const gate = auditSelectedAllyMaximumFixed({
      expected: [e.positive.program],
      observations: [e.positive.source],
    });
    const normalCanonical = selectedAllyMaximumFixedCanonical(e.normal.prepared);
    await save(task, 'audit-selected-ally-owner.json', {
      normalCanonical,
      capturedCanonical: e.positive.selection.canonical,
      gate,
      executeCount: execute.mock.calls.length,
      modifierCount: change.mock.calls.length,
    });
    expect(normalCanonical).toEqual(e.positive.selection.canonical);
    expect(gate.status).toBe('passed');
    expect(execute).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    const write =
      e.positive.source.transitions![0]!.hpActions[0]!.selectedAllyMaximumFixedWrites![0]!;
    expect(write.receipts[0]!.actual).toBe(0);
    expect(gate.changed).toBe(1);
    expect(e.normal.source.transitions).toBeUndefined();
    execute.mockRestore();
    change.mockRestore();
  },
);

it(
  'selectedAlly denies coherent HP forgeries stale execution intermediate state and missing downstream owners',
  productionAuditTestOptions(['audit-selected-ally-coherent-stale.json']),
  async ({ task }) => {
    const p = entry(specs[4]!).positive;
    const alien = run(fixtureMaster(specs[4]!), specs[4]!);
    const write = p.source.transitions![1]!.hpActions[0]!.selectedAllyMaximumFixedWrites![0]!;
    const after = write.after.actors.attacker!;
    if (after.kind !== 'absolute') throw new Error('fixture needs absolute HP');
    // All related HP/receipt cells agree with one another; they still differ from the original owner.
    let forged: unknown = p.source;
    const basePath: Path = ['transitions', 1, 'hpActions', 0, 'selectedAllyMaximumFixedWrites', 0];
    const forgedActor = { ...after, maximum: after.maximum + 101, current: after.current + 101 };
    for (const path of [
      [...basePath, 'after', 'actors', 'attacker'],
      [...basePath, 'receipts', 0, 'after'],
      [...basePath, 'after', 'receipts', write.after.receipts.length - 1, 'after'],
      ['transitions', 1, 'result', 'state', 'hp', 'actors', 'attacker'],
      ['candidate', 'seed', 'hp', 'actors', 'attacker'],
    ])
      forged = replace(forged, path, forgedActor);
    const cases = [
      {
        name: 'coherent-hp-receipt',
        source: forged,
        reason: `${reasonPrefix}WriteMismatch`,
        path: 'selectedAllyActions.1.0.writes.0.after.actors.attacker',
      },
      {
        name: 'different-execution',
        source: alien.source,
        reason: `${reasonPrefix}IdentityMismatch`,
        path: 'reference.selection',
      },
      {
        name: 'stale-candidate',
        source: { ...p.source, candidate: alien.source.candidate },
        reason: `${reasonPrefix}IdentityMismatch`,
        path: 'reference.candidate',
      },
      {
        name: 'intermediate-hp',
        source: replace(
          p.source,
          ['candidate', 'seed', 'hp'],
          p.source.transitions![0]!.result.state.hp,
        ),
        reason: `${reasonPrefix}RetainedMismatch`,
        path: 'candidate.seed.hp',
      },
      {
        name: 'missing-reader',
        source: replace(p.source, ['candidate', 'reads'], []),
        reason: `${reasonPrefix}ReaderMismatch`,
        path: 'candidate.reads.length',
      },
      {
        name: 'duplicate-reader',
        source: replace(
          p.source,
          ['candidate', 'reads'],
          [...p.source.candidate!.reads, p.source.candidate!.reads[0]],
        ),
        reason: `${reasonPrefix}ReaderMismatch`,
        path: 'candidate.reads.length',
      },
      {
        name: 'missing-np',
        source: replace(p.source, ['candidate', 'nps'], []),
        reason: `${reasonPrefix}NpMismatch`,
        path: 'candidate.nps.length',
      },
      {
        name: 'missing-input',
        source: { ...p.source, input: undefined },
        reason: `${reasonPrefix}UseMismatch`,
        path: 'input',
      },
      {
        name: 'missing-result',
        source: { ...p.source, result: undefined },
        reason: `${reasonPrefix}UseMismatch`,
        path: 'result',
      },
      {
        name: 'missing-writer-owner',
        source: replace(p.source, [...basePath.slice(0, -1)], []),
        reason: `${reasonPrefix}WriteMismatch`,
        path: 'selectedAllyActions.1.0.writes.length',
      },
      {
        name: 'wrong-effective-cell',
        source: replace(p.source, [...basePath, 'valueSetIndex'], 1),
        reason: `${reasonPrefix}WriteMismatch`,
        path: 'selectedAllyActions.1.0.writes.0.valueSetIndex',
      },
      {
        name: 'false-zero-actual-hp',
        source: replace(
          p.source,
          [...basePath, 'after', 'actors', 'attacker'],
          write.before.actors.attacker,
        ),
        reason: `${reasonPrefix}WriteMismatch`,
        path: 'selectedAllyActions.1.0.writes.0.after.actors.attacker',
      },
    ];
    const results = cases.map((c) => ({
      name: c.name,
      reason: c.reason,
      path: c.path,
      gate: auditSelectedAllyMaximumFixed({
        expected: [p.program],
        observations: [c.source as SelectedAllyMaximumFixedSource],
      }),
    }));
    await save(task, 'audit-selected-ally-coherent-stale.json', results);
    for (const r of results) {
      verifyDifferences(r.gate);
      expect(
        r.gate.failures.some((f) => f.reason === r.reason && f.checkPath.startsWith(r.path)),
        r.name,
      ).toBe(true);
    }
  },
);

it(
  'selectedAlly missing owner containers keep typed diagnostic paths',
  productionAuditTestOptions(['audit-selected-ally-missing-owners.json']),
  async ({ task }) => {
    const p = entry(specs[0]!).positive;
    const cases = [
      {
        path: ['canonical'],
        reason: `${reasonPrefix}CanonicalMismatch`,
        check: 'canonical.source',
      },
      { path: ['master'], reason: `${reasonPrefix}CanonicalMismatch`, check: 'master' },
      { path: ['transitions'], reason: `${reasonPrefix}RetainedMismatch`, check: 'transitions' },
      {
        path: ['transitions', 0, 'hpActions', 0],
        reason: `${reasonPrefix}RetainedMismatch`,
        check: 'transitions.0.hpActions.0',
      },
      {
        path: [...nativePath, 'native'],
        reason: `${reasonPrefix}RetainedMismatch`,
        check: 'transitions.0.hpActions.0.native',
      },
      ...['source', 'operation', 'before', 'after', 'modifiers', 'receipts'].map((field) => ({
        path: [...writePath, field],
        reason: `${reasonPrefix}WriteMismatch`,
        check: `selectedAllyActions.0.0.writes.0.${field}`,
      })),
    ];
    const results = cases.map((c) => ({
      ...c,
      gate: auditSelectedAllyMaximumFixed({
        expected: [p.program],
        observations: [replace(p.source, c.path, undefined) as SelectedAllyMaximumFixedSource],
      }),
    }));
    await save(task, 'audit-selected-ally-missing-owners.json', results);
    for (const r of results) {
      verifyDifferences(r.gate);
      expect(
        r.gate.failures.some((f) => f.reason === r.reason && f.checkPath === r.check),
        r.check,
      ).toBe(true);
    }
  },
);

it(
  'selectedAlly declaration preflight retains every legal representative before activation and native outcome',
  productionAuditTestOptions(['audit-selected-ally-preflight.json']),
  async ({ task }) => {
    const rows = specs.map((spec) => {
      const e = entry(spec);
      return {
        name: spec.name,
        possible: selectedAllyMaximumFixedMaySelect(
          e.master,
          e.positive.selection.canonical.scenario,
        ),
        canonical: !!selectedAllyMaximumFixedCanonical(e.positive.prepared),
        status: e.positive.prepared.status,
      };
    });
    const p = entry(specs[0]!);
    const unselected = {
      ...p.positive.selection.canonical.scenario,
      preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' as const }],
    };
    const none = selectedAllyMaximumFixedMaySelect(p.master, unselected);
    await save(task, 'audit-selected-ally-preflight.json', { rows, none });
    expect(rows.every((r) => r.possible && r.canonical)).toBe(true);
    expect(none).toBe(false);
  },
);

it(
  'rejects same-valued copies of the original reader and NP context HP owner',
  productionAuditTestOptions(['audit-selected-ally-context-hp-owner.json']),
  async ({ task }) => {
    const p = entry(specs[0]!).positive;
    const results = ['reader', 'np'].map((kind) => {
      const state =
        kind === 'reader' ? p.source.candidate!.reads[0]!.state : p.source.candidate!.nps[0]!.state;
      const original = state.hp;
      try {
        Reflect.set(state, 'hp', structuredClone(original));
        const gate = auditSelectedAllyMaximumFixed({
          expected: [p.program],
          observations: [p.source],
        });
        return {
          kind,
          identity: p.selection.identity,
          expectedHp: structuredClone(original),
          actualHp: structuredClone(state.hp),
          originalReference: state.hp === original,
          proof: structuredClone(selectedAllyMaximumFixedDiagnostic(p.source)),
          gate,
        };
      } finally {
        Reflect.set(state, 'hp', original);
      }
    });
    await save(task, 'audit-selected-ally-context-hp-owner.json', results);
    for (const r of results) {
      expect(r.actualHp).toEqual(r.expectedHp);
      expect(r.originalReference).toBe(false);
      verifyDifferences(r.gate);
      expect(
        r.gate.failures.some(
          (f) =>
            f.reason === `${reasonPrefix}IdentityMismatch` &&
            f.checkPath === `reference.${r.kind}.0.hp`,
        ),
      ).toBe(true);
    }
  },
);

it(
  'captures immutable complete values before restore without sharing snapshots across gate calls',
  productionAuditTestOptions(['audit-selected-ally-proof-lifetime.json']),
  async ({ task }) => {
    const p = entry(specs[0]!).positive;
    const state = p.source.candidate!.reads[0]!.state;
    const original = state.hp;
    const gateDuring = (() => {
      try {
        Reflect.set(state, 'hp', {
          ...original,
          actors: {
            ...original!.actors,
            attacker: {
              ...original!.actors.attacker,
              current: 123,
            },
          },
        });
        return auditSelectedAllyMaximumFixed({ expected: [p.program], observations: [p.source] });
      } finally {
        Reflect.set(state, 'hp', original);
      }
    })();
    const savedDuring = structuredClone(gateDuring.proofs);
    const gateAfter = auditSelectedAllyMaximumFixed({
      expected: [p.program],
      observations: [p.source],
    });
    const absent = auditSelectedAllyMaximumFixed({ expected: [p.program], observations: [] });
    const unmatched = auditSelectedAllyMaximumFixed({ expected: [], observations: [p.source] });
    const duringValues = gateDuring.proofs.actual[0]!.values;
    const afterValues = gateAfter.proofs.actual[0]!.values;
    const hpPath = ['fields', 'reads', 'values', 0, 'fields', 'state', 'fields', 'hp'];
    const currentPath = [...hpPath, 'fields', 'actors', 'fields', 'attacker', 'fields', 'current'];
    const frozenNodes: boolean[] = [];
    const visited = new Set<object>();
    const inspectFrozen = (value: unknown) => {
      if (value === null || typeof value !== 'object' || visited.has(value)) return;
      visited.add(value);
      frozenNodes.push(Object.isFrozen(value));
      for (const child of Object.values(value)) inspectFrozen(child);
    };
    inspectFrozen(duringValues);
    await save(task, 'audit-selected-ally-proof-lifetime.json', {
      gateDuring,
      gateAfter,
      absent,
      unmatched,
      frozenNodes,
    });
    verifyDifferences(gateDuring);
    expect(gateAfter.status).toBe('passed');
    expect(isDeepStrictEqual(gateDuring.proofs, savedDuring)).toBe(true);
    expect(at(duringValues.candidate, currentPath)).toEqual({ type: 'number', value: 123 });
    expect(at(afterValues.candidate, hpPath)).toEqual(at(p.program.valueProof.candidate, hpPath));
    expect(duringValues).not.toBe(afterValues);
    expect(duringValues.input).not.toBe(afterValues.input);
    expect(frozenNodes.every(Boolean)).toBe(true);
    expect(absent.proofs.expected[0]!.values).toBe(p.program.valueProof);
    expect(absent.proofs.actual).toEqual([]);
    expect(unmatched.proofs.actual[0]!.values).toEqual(p.program.valueProof);
    expect(absent.status).toBe('failed');
    expect(unmatched.status).toBe('failed');
  },
);

it(
  'keeps shared values separate from different semantic views and restores tagged values losslessly',
  productionAuditTestOptions(['audit-selected-ally-proof-views.json']),
  async ({ task }) => {
    const p = entry(specs[0]!).positive;
    const values = p.program.valueProof;
    const rawSourcePath = [
      'values',
      0,
      'values',
      0,
      'fields',
      'writes',
      'values',
      0,
      'fields',
      'source',
    ];
    const viewedSourcePath = [
      'values',
      0,
      'fields',
      'hpActions',
      'values',
      0,
      'fields',
      'sources',
      'values',
      0,
    ];
    const native = p.source.transitions![0]!.hpActions[0]!;
    const rawEffect = at(values.selectedAllyActions, [...rawSourcePath, 'fields', 'effect']);
    const viewedEffect = at(values.transitions, [...viewedSourcePath, 'fields', 'effect']);
    const sharing = at(values.facade, ['fields', 'calculationInput']) === values.input;
    const special = {
      missing: undefined,
      nullValue: null,
      finite: 1.25,
      nullObject: Object.assign(Object.create(null) as Record<string, unknown>, { key: undefined }),
      set: new Set(['a', 'b']),
      map: new Map([['key', undefined]]),
      userTag: { type: 'undefined' },
    };
    const specialGate = auditSelectedAllyMaximumFixed({
      expected: [p.program],
      observations: [replace(p.source, ['input'], special) as SelectedAllyMaximumFixedSource],
    });
    await save(task, 'audit-selected-ally-proof-views.json', {
      values,
      sharing,
      rawEffect,
      viewedEffect,
      specialGate,
    });
    expect(native.sources[0]).toBe(native.selectedAllyMaximumFixedWrites![0]!.source);
    expect(sharing).toBe(true);
    expect(rawEffect).not.toBe(viewedEffect);
    expect(at(rawEffect, ['fields', 'label'])).not.toBeUndefined();
    expect(at(viewedEffect, ['fields', 'label'])).toBeUndefined();
    expect(specialGate.proofs.actual[0]!.values.input).toEqual({
      type: 'object',
      fields: {
        missing: { type: 'undefined' },
        nullValue: { type: 'object', value: null },
        finite: { type: 'number', value: 1.25 },
        nullObject: { type: 'nullObject', fields: { key: { type: 'undefined' } } },
        set: {
          type: 'set',
          values: [
            { type: 'string', value: 'a' },
            { type: 'string', value: 'b' },
          ],
        },
        map: { type: 'map', values: [[{ type: 'string', value: 'key' }, { type: 'undefined' }]] },
        userTag: { type: 'object', fields: { type: { type: 'string', value: 'undefined' } } },
      },
    });
    verifyDifferences(specialGate);
  },
);

it(
  'rejects in-place selection identity index and canonical replacement before boundary accounting',
  productionAuditTestOptions(['audit-selected-ally-selection-authority.json']),
  async ({ task }) => {
    const p = entry(specs[0]!).positive;
    const cases = [
      {
        field: 'identity',
        value: `${p.selection.identity}:altered`,
        reason: `${reasonPrefix}IdentityMismatch`,
      },
      { field: 'index', value: p.selection.index + 1, reason: `${reasonPrefix}IdentityMismatch` },
      {
        field: 'canonical',
        value: { ...p.selection.canonical, scopeBoundaries: ['forged'] },
        reason: `${reasonPrefix}CanonicalMismatch`,
      },
    ];
    const results = cases.map((c) => {
      const original: unknown = Reflect.get(p.selection, c.field);
      try {
        Reflect.set(p.selection, c.field, c.value);
        return {
          field: c.field,
          reason: c.reason,
          gate: auditSelectedAllyMaximumFixed({ expected: [p.program], observations: [p.source] }),
        };
      } finally {
        Reflect.set(p.selection, c.field, original);
      }
    });
    const restored = auditSelectedAllyMaximumFixed({
      expected: [p.program],
      observations: [p.source],
    });
    const published = auditPublishedSelectedAllyMaximumFixed(
      p.source.master,
      [p],
      [p.selection],
      [p.program],
      [p.source],
      [p.prepared],
    );
    const publishedBefore = structuredClone(published);
    const operation = p.selection.canonical.writers[0]!.operation;
    const sign = operation.sign;
    let publishedUnchanged: boolean;
    try {
      Reflect.set(operation, 'sign', -sign);
      publishedUnchanged = isDeepStrictEqual(published, publishedBefore);
    } finally {
      Reflect.set(operation, 'sign', sign);
    }
    await save(task, 'audit-selected-ally-selection-authority.json', {
      results,
      restored,
      publishedBefore,
      published,
      publishedUnchanged,
    });
    for (const result of results) {
      verifyDifferences(result.gate);
      expect(
        result.gate.failures.some(
          (f) => f.reason === result.reason && f.checkPath.startsWith(`selection.${result.field}`),
        ),
      ).toBe(true);
      expect(result.gate.boundaries).toEqual([]);
    }
    expect(restored.status).toBe('passed');
    expect(p.program.canonicalExpectation.identity).toBe(p.selection.identity);
    expect(p.program.canonicalExpectation.index).toBe(p.selection.index);
    expect(published.status).toBe('passed');
    expect(publishedUnchanged).toBe(true);
  },
);
