import { mutableAuditView } from './auditTestMutation';
import { expect, it, vi } from 'vitest';
import * as hpOwner from '../../battle-execution/src/preparationHp';
import * as modifierOwner from '../../battle-execution/src/hpResource';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema, type MasterDataSnapshot } from '@fgo-lab/master-data';
import { firstCanonicalAuditDifference } from '@fgo-lab/master-data/production-audit';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import {
  createDefaultResolvedScenario,
  prepareCalculationScenarioWithPolicy,
  evaluatePreparedCalculationScenario,
} from './scenario';
import {
  maximumFixedSelection,
  maximumFixedProgram,
  maximumFixedSource,
  maximumFixedDiagnostic,
  auditMaximumFixed,
  auditPublishedMaximumFixed,
  type MaximumFixedReason,
} from './productionHpMaximumFixedPreparationAudit';
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
};
const specs: Spec[] = [
  {
    name: 'increase',
    always: true,
    initial: 333,
    writes: [[731]],
    final: 4064,
    expectedMaximum: 10741,
    choice: true,
  },
  { name: 'decrease', initial: 800, writes: [[-2345]], final: 5663, expectedMaximum: 7665 },
  { name: 'maximum-floor', initial: 800, writes: [[-20000]], final: 1, expectedMaximum: 1 },
  {
    name: 'positive-current-floor',
    initial: 200,
    writes: [[-3000]],
    final: 1,
    expectedMaximum: 7010,
    omitted: true,
  },
  {
    name: 'same-occurrence-multiple',
    initial: 333,
    writes: [[731, -1234, 111]],
    final: 2941,
    expectedMaximum: 9618,
    choice: true,
  },
  {
    name: 'prior-commit-prefix',
    initial: 500,
    writes: [[1200], [-700, 91]],
    final: 5596,
    expectedMaximum: 10601,
  },
  {
    name: 'fixed-gain-clamp',
    initial: 900,
    writes: [[-2345]],
    fixedAfter: 5000,
    final: 7665,
    expectedMaximum: 7665,
  },
  {
    name: 'fixed-loss-floor',
    initial: 800,
    writes: [[731]],
    fixedAfter: -20000,
    final: 1,
    expectedMaximum: 10741,
    floor: 'oneIfAlive',
  },
  { name: 'no-op-value', initial: 600, writes: [[0]], final: 6006, expectedMaximum: 10010 },
  {
    name: 'maximum-unchanged-list',
    initial: 800,
    writes: [[-20000, -100]],
    final: 1,
    expectedMaximum: 1,
  },
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
    name: 'non-applied',
    initial: 333,
    writes: [[731]],
    final: 3333,
    expectedMaximum: 10010,
    disabled: true,
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
            }
          : {}),
        execution: writes.flatMap((amount) => [
          {
            kind: 'hpModifier',
            ...(spec.always ? { useCondition: { kind: 'always' } } : {}),
            action: 'maximumFixed',
            sign: amount < 0 ? -1 : 1,
            route: modifier.route,
            ...(spec.omitted ? {} : { selection: 'direct' }),
            bounds: { minimum: null, maximum: null },
            lifetime: 'active',
            traits: ['maximum-hp-fixture'],
            values: [
              Array.from({ length: 10 }, (_, level) => Math.abs(amount) + (level === 3 ? 0 : 17)),
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
  const selection = maximumFixedSelection(prepared, calculation);
  if (!selection) throw new Error('missing HP canonical selection');
  const program = maximumFixedProgram(selection);
  const source = maximumFixedSource(selection);
  return {
    prepared,
    calculation,
    selection,
    program,
    source,
    gate: auditMaximumFixed({ expected: [program], observations: [source] }),
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
    `maximumFixed committed ${spec.name}`,
    productionAuditTestOptions([`audit-maximum-fixed-${spec.name}.json`]),
    async ({ task }) => {
      const { master, positive: p, normal, ranking } = entry(spec);
      const published = auditPublishedMaximumFixed(
        master,
        [p],
        [p.selection],
        [p.program],
        [p.source],
      );
      await save(task, `audit-maximum-fixed-${spec.name}.json`, {
        spec,
        gate: p.gate,
        proof: maximumFixedDiagnostic(p.source),
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
          if (spec.name === 'increase')
            expect(np.ratio).not.toBe(p.source.candidate!.seed.permille! / 1000);
        }
      }
      if (
        !spec.disabled &&
        !spec.noReader &&
        !spec.noNp &&
        spec.initial > 0 &&
        spec.writes.flat().some((v) => v !== 0)
      )
        expect(p.gate.connected).toBe(1);
      else expect(p.gate.connected).toBe(0);
    },
  );
const shardCounts = {
  missing: 12,
  identity: 8,
  modifier: 8,
  commit: 4,
  order: 4,
  downstream: 4,
  coherent: 1,
  published: 1,
};
const groups = [
  'missing',
  'identity',
  'modifier',
  'commit',
  'order',
  'downstream',
  'coherent',
  'published',
] as const;
for (const group of groups)
  for (let shard = 0; shard < shardCounts[group]; shard++)
    it(
      `maximumFixed negatives ${group} ${shard}`,
      productionAuditTestOptions([`audit-maximum-fixed-negative-${group}-${shard}.json`]),
      async ({ task }) => {
        const {
          master,
          positive: p,
          ranking,
        } = entry(specs.find((s) => s.name === 'same-occurrence-multiple')!);
        const { source } = p;
        const negatives: {
          name: string;
          expectedPath: string;
          reason: MaximumFixedReason;
          gate: ReturnType<typeof auditMaximumFixed>;
          proof: unknown;
        }[] = [];
        let mutationIndex = 0;
        function inspect(
          name: string,
          expectedPath: string,
          reason: MaximumFixedReason,
          apply: () => () => void,
        ) {
          if (mutationIndex++ % shardCounts[group] !== shard) return;
          const undo = apply();
          try {
            negatives.push({
              name,
              expectedPath,
              reason,
              gate: auditMaximumFixed({ expected: [p.program], observations: [source] }),
              proof: structuredClone(maximumFixedDiagnostic(source)),
            });
          } finally {
            undo();
          }
        }
        function change(
          name: string,
          object: unknown,
          key: string | number,
          value: unknown,
          path: string,
          reason: MaximumFixedReason,
          remove = false,
        ) {
          if (
            !object ||
            typeof object !== 'object' ||
            (!remove && Object.is(Reflect.get(object, key), value))
          )
            return;
          inspect(name, path, reason, () => {
            const descriptor = Object.getOwnPropertyDescriptor(object, key);
            if (remove) Reflect.deleteProperty(object, key);
            else Reflect.set(object, key, value);
            return () => {
              if (descriptor) Object.defineProperty(object, key, descriptor);
              else Reflect.deleteProperty(object, key);
            };
          });
        }
        const missing = (object: unknown, key: string, path: string, reason: MaximumFixedReason) =>
          change(`missing:${path}`, object, key, undefined, path, reason);
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
            'calculation',
            'selection',
          ] as const) {
            const path =
              key === 'identity'
                ? 'source'
                : key === 'canonical'
                  ? 'canonical.source'
                  : key === 'calculation' || key === 'selection'
                    ? `reference.${key}`
                    : key;
            const reason =
              path === 'source'
                ? 'maximumFixedTraceMissing'
                : path.startsWith('canonical') || ['master', 'scenario'].includes(key)
                  ? 'maximumFixedCanonicalMismatch'
                  : path.startsWith('reference')
                    ? 'maximumFixedIdentityMismatch'
                    : ['transitions', 'ordered', 'candidate'].includes(key)
                      ? 'maximumFixedRetainedMismatch'
                      : ['input', 'effects', 'contributions', 'result', 'observation'].includes(key)
                        ? 'maximumFixedUseMismatch'
                        : 'maximumFixedIdentityMismatch';
            missing(source, key, path, reason);
          }
          for (const key of Object.keys(source.canonical))
            missing(source.canonical, key, `canonical.${key}`, 'maximumFixedCanonicalMismatch');
          for (const [i, t] of source.transitions!.entries())
            for (const [j, a] of t.hpActions.entries()) {
              const path = `transitions.${i}.hpActions.${j}`;
              for (const key of [
                'start',
                'sources',
                'native',
                'attempted',
                'returned',
                'sourceEnds',
                'modifierWrites',
              ]) {
                const reason =
                  key === 'modifierWrites'
                    ? 'maximumFixedWriteMismatch'
                    : 'maximumFixedRetainedMismatch';
                if (Reflect.get(a, key) !== undefined) missing(a, key, `${path}.${key}`, reason);
              }
              for (const [k, w] of (a.modifierWrites ?? []).entries()) {
                const q = `${path}.modifierWrites.${k}`;
                for (const key of Object.keys(w))
                  missing(w, key, `${q}.${key}`, 'maximumFixedWriteMismatch');
                for (const key of Object.keys(w.modifiers[0]!))
                  missing(
                    w.modifiers[0],
                    key,
                    `${q}.modifiers.0.${key}`,
                    'maximumFixedWriteMismatch',
                  );
                for (const key of Object.keys(w.receipts[0]!))
                  missing(
                    w.receipts[0],
                    key,
                    `${q}.receipts.0.${key}`,
                    'maximumFixedWriteMismatch',
                  );
              }
            }
          if (source.candidate)
            for (const key of ['seed', 'reads', 'nps'])
              missing(
                source.candidate,
                key,
                `candidate.${key}`,
                key === 'reads'
                  ? 'maximumFixedReaderMismatch'
                  : key === 'nps'
                    ? 'maximumFixedNpMismatch'
                    : 'maximumFixedRetainedMismatch',
              );
          for (const writer of source.canonical.writers)
            for (const key of Object.keys(writer.operation))
              missing(writer.operation, key, 'canonical.source', 'maximumFixedCanonicalMismatch');
        }
        if (group === 'identity' || group === 'modifier') {
          for (const [i, t] of source.transitions!.entries())
            for (const [j, a] of t.hpActions.entries())
              for (const [k, w] of (a.modifierWrites ?? []).entries()) {
                const q = `transitions.${i}.hpActions.${j}.modifierWrites.${k}`;
                if (group === 'identity') {
                  for (const key of [
                    'origin',
                    'sourceId',
                    'sourceInstanceId',
                    'skillId',
                    'valueIndex',
                    'valueSetIndex',
                    'sourceTraits',
                    'sourceEnabled',
                    'constantFormKey',
                  ])
                    change(
                      `identity:${key}`,
                      w.source,
                      key,
                      typeof Reflect.get(w.source, key) === 'number' ? 99 : 'foreign',
                      `${q}.source.${key}`,
                      'maximumFixedWriteMismatch',
                    );
                  for (const key of ['operationIndex', 'valueSetIndex', 'valueIndex'])
                    change(
                      `identity:${key}`,
                      w,
                      key,
                      99,
                      `${q}.${key}`,
                      'maximumFixedWriteMismatch',
                    );
                  for (const key of ['actor', 'id', 'formKey'])
                    change(
                      `modifier:${key}`,
                      w.modifiers[0],
                      key,
                      'foreign',
                      `${q}.modifiers.0.${key}`,
                      'maximumFixedWriteMismatch',
                    );
                  for (const key of ['actor', 'occurrenceId', 'actionId'])
                    change(
                      `receipt:${key}`,
                      w.receipts[0],
                      key,
                      'foreign',
                      `${q}.receipts.0.${key}`,
                      'maximumFixedWriteMismatch',
                    );
                  change(
                    'operation:clone',
                    w,
                    'operation',
                    structuredClone(w.operation),
                    `reference.action.${i}.native.${j}.modifierWrites.${k}.operation`,
                    'maximumFixedIdentityMismatch',
                  );
                  change(
                    'receipt:clone',
                    w,
                    'receipts',
                    structuredClone(w.receipts),
                    `reference.action.${i}.native.${j}.modifierWrites.${k}.receipts`,
                    'maximumFixedIdentityMismatch',
                  );
                  change(
                    'instance:clone',
                    w,
                    'modifiers',
                    structuredClone(w.modifiers),
                    `reference.action.${i}.native.${j}.modifierWrites.${k}.modifiers`,
                    'maximumFixedIdentityMismatch',
                  );
                } else {
                  for (const key of [
                    'sign',
                    'action',
                    'lifetime',
                    'traits',
                    'selection',
                    'useCondition',
                    'bounds',
                    'route',
                    'values',
                  ])
                    change(
                      `operation:${key}`,
                      w.operation,
                      key,
                      key === 'sign' ? -w.operation.sign : 'foreign',
                      'canonical.source',
                      'maximumFixedCanonicalMismatch',
                    );
                  change(
                    'selected:value',
                    w.modifiers[0],
                    'value',
                    99999,
                    `${q}.modifiers.0.value`,
                    'maximumFixedWriteMismatch',
                  );
                  for (const position of ['before', 'after'] as const) {
                    const actor = w[position].actors.attacker;
                    for (const key of ['maximum', 'baseMaximum', 'current'])
                      change(
                        `actor:${position}:${key}`,
                        actor,
                        key,
                        99,
                        `${q}.${position}.actors.attacker.${key}`,
                        'maximumFixedWriteMismatch',
                      );
                  }
                  for (const key of ['actual', 'attempted'])
                    change(
                      `receipt:${key}`,
                      w.receipts[0],
                      key,
                      999,
                      `${q}.receipts.0.${key}`,
                      'maximumFixedWriteMismatch',
                    );
                  change(
                    'modifiers:missing-prefix',
                    w.after,
                    'modifiers',
                    [],
                    `${q}.after.modifiers.length`,
                    'maximumFixedWriteMismatch',
                  );
                }
              }
          for (const [i, a] of source.canonical.actions.entries())
            if (a.command.kind === 'useSkillSlot') {
              for (const key of ['slot', 'skillLevel', 'choice'])
                change(
                  `command:${key}`,
                  a.command,
                  key,
                  key === 'choice' ? { groupKey: 'foreign', candidateKey: 'foreign' } : 99,
                  'canonical.source',
                  'maximumFixedCanonicalMismatch',
                );
              change(
                'canonical:form',
                a,
                'form',
                { ...a.form, actorId: 'foreign' },
                `canonical.actions.${i}.form.actorId`,
                'maximumFixedCanonicalMismatch',
              );
            }
        }
        if (group === 'commit')
          for (const [i, t] of source.transitions!.entries()) {
            const q = `transitions.${i}`;
            change(
              'reducer:rejected',
              t.result,
              'status',
              'rejected',
              `${q}.result.status`,
              'maximumFixedRetainedMismatch',
            );
            change(
              'prefix:loss',
              t.result.state,
              'appliedActions',
              [],
              `${q}.result.state.appliedActions.length`,
              'maximumFixedRetainedMismatch',
            );
            for (const [j, a] of t.hpActions.entries()) {
              change(
                'native:fake',
                a.native,
                'status',
                'unsupported',
                `${q}.hpActions.${j}.native.status`,
                'maximumFixedCommitMismatch',
              );
              change(
                'retained:initial',
                t.result.state,
                'hp',
                source.transitions![0]!.before.hp,
                `${q}.result.state.hp`,
                'maximumFixedRetainedMismatch',
              );
              change(
                'retained:intermediate',
                t.result.state,
                'hp',
                a.modifierWrites?.[0]?.before,
                `${q}.result.state.hp`,
                'maximumFixedRetainedMismatch',
              );
              change(
                'retained:foreign',
                t.result.state,
                'hp',
                ranking.source.transitions?.[i]?.result.state.hp,
                `reference.action.${i}.result.hp`,
                'maximumFixedIdentityMismatch',
              );
              change(
                'action:fake',
                t.result.state,
                'appliedActions',
                [...t.result.state.appliedActions, t.result.state.appliedActions[0]],
                `${q}.result.state.appliedActions.length`,
                'maximumFixedRetainedMismatch',
              );
              change(
                'receipt:fake',
                t.result.state.hp,
                'receipts',
                [...(t.result.state.hp?.receipts ?? []), a.modifierWrites?.[0]?.receipts[0]],
                `${q}.result.state.hp.receipts.length`,
                'maximumFixedRetainedMismatch',
              );
              change(
                'executed:fake',
                t.result.state.hp,
                'executedEffects',
                ['fabricated'],
                `${q}.result.state.hp.executedEffects`,
                'maximumFixedRetainedMismatch',
              );
            }
          }
        if (group === 'order') {
          change(
            'transitions:duplicate',
            source,
            'transitions',
            [...source.transitions!, source.transitions![0]!],
            'transitions.length',
            'maximumFixedRetainedMismatch',
          );
          change(
            'transitions:reverse',
            source,
            'transitions',
            [...source.transitions!].reverse(),
            'reference.action.0.before',
            'maximumFixedIdentityMismatch',
          );
          for (const [i, t] of source.transitions!.entries())
            for (const [j, a] of t.hpActions.entries())
              if (a.modifierWrites?.length) {
                const q = `transitions.${i}.hpActions.${j}.modifierWrites`;
                change(
                  'writes:reverse',
                  a,
                  'modifierWrites',
                  [...a.modifierWrites].reverse(),
                  `reference.action.${i}.native.${j}.modifierWrites`,
                  'maximumFixedIdentityMismatch',
                );
                change(
                  'writes:duplicate',
                  a,
                  'modifierWrites',
                  [...a.modifierWrites, a.modifierWrites[0]],
                  `${q}.length`,
                  'maximumFixedWriteMismatch',
                );
                for (const [k, w] of a.modifierWrites.entries()) {
                  change(
                    'modifier:duplicate',
                    w,
                    'modifiers',
                    [...w.modifiers, w.modifiers[0]],
                    `${q}.${k}.modifiers.length`,
                    'maximumFixedWriteMismatch',
                  );
                  change(
                    'receipt:duplicate',
                    w,
                    'receipts',
                    [...w.receipts, w.receipts[0]],
                    `${q}.${k}.receipts.length`,
                    'maximumFixedWriteMismatch',
                  );
                }
              }
          if (source.candidate)
            for (const key of ['reads', 'nps'] as const)
              change(
                `candidate:${key}:duplicate`,
                source.candidate,
                key,
                [...source.candidate[key], source.candidate[key][0]],
                `candidate.${key}.length`,
                key === 'reads' ? 'maximumFixedReaderMismatch' : 'maximumFixedNpMismatch',
              );
        }
        if (group === 'downstream' && source.candidate) {
          for (const [i, r] of source.candidate.reads.entries())
            for (const key of Object.keys(r))
              change(
                `reader:${key}`,
                r,
                key,
                key === 'state'
                  ? structuredClone(r.state)
                  : key === 'evaluated'
                    ? !r.evaluated
                    : 'foreign',
                key === 'state' ? `reference.reader.${i}.state` : `candidate.reads.${i}.${key}`,
                key === 'state' ? 'maximumFixedIdentityMismatch' : 'maximumFixedReaderMismatch',
              );
          for (const [i, n] of source.candidate.nps.entries()) {
            for (const key of [
              'operationId',
              'operationSequence',
              'operationGroupIndex',
              'disposition',
              'ratio',
              'context',
              'evaluation',
              'input',
              'state',
            ])
              change(
                `np:${key}`,
                n,
                key,
                ['context', 'evaluation', 'input', 'state'].includes(key)
                  ? structuredClone(Reflect.get(n, key))
                  : 'foreign',
                ['context', 'evaluation', 'input', 'state'].includes(key)
                  ? `reference.np.${i}.${key}`
                  : `candidate.nps.${i}.${key}`,
                ['context', 'evaluation', 'input', 'state'].includes(key)
                  ? 'maximumFixedIdentityMismatch'
                  : 'maximumFixedNpMismatch',
              );
            for (const value of [
              source.candidate.seed.permille,
              source.candidate.seed.permille! / 1000,
              specs[4]!.final / 10010,
            ])
              change(
                'np:wrong-ratio',
                n.context,
                'attackerHpRatio',
                value,
                `candidate.nps.${i}.context.attackerHpRatio`,
                'maximumFixedNpMismatch',
              );
            change(
              'np:fake-evaluation',
              n.evaluation,
              'npMultipliers',
              [1, 1, 1, 1, 1],
              `candidate.nps.${i}.evaluation.npMultipliers`,
              'maximumFixedNpMismatch',
            );
          }
          for (const key of ['seed', 'input', 'effects', 'contributions', 'result', 'uses']) {
            const object = key === 'seed' ? source.candidate : source;
            change(
              `downstream:${key}:clone`,
              object,
              key,
              structuredClone(Reflect.get(object, key)),
              key === 'seed'
                ? 'reference.seed.hp'
                : key === 'uses'
                  ? 'reference.use'
                  : `reference.${key}`,
              'maximumFixedIdentityMismatch',
            );
          }
          for (const [i, use] of source.uses.entries())
            for (const key of ['events', 'projections', 'contributions'])
              change(
                `use:${key}`,
                use,
                key,
                [],
                `uses.${i}.${key}.length`,
                'maximumFixedUseMismatch',
              );
          change(
            'execution:foreign',
            source,
            'calculation',
            ranking.calculation,
            'reference.calculation',
            'maximumFixedIdentityMismatch',
          );
          change(
            'execution:foreign-candidate',
            source,
            'candidate',
            ranking.source.candidate,
            'reference.candidate',
            'maximumFixedIdentityMismatch',
          );
        }
        if (group === 'coherent') {
          const updates: { object: unknown; key: string; value: unknown }[] = [];
          const hp = source.candidate?.seed.hp?.actors.attacker;
          if (hp?.kind === 'absolute') updates.push({ object: hp, key: 'current', value: 1234 });
          for (const r of source.candidate?.reads ?? []) {
            updates.push({ object: r, key: 'permille', value: 123 });
            updates.push({ object: r.state.quantities, key: 'attackerHpPermille', value: 123 });
          }
          for (const n of source.candidate?.nps ?? []) {
            updates.push({ object: n, key: 'ratio', value: 1234 / 9618 });
            updates.push({ object: n.context, key: 'attackerHpRatio', value: 1234 / 9618 });
          }
          inspect(
            'coherent:hp-reader-np',
            'candidate.seed.hp.actors.attacker.current',
            'maximumFixedRetainedMismatch',
            () => {
              const restores = updates.flatMap((u) => {
                if (!u.object || typeof u.object !== 'object') return [];
                const object = u.object;
                const d = Object.getOwnPropertyDescriptor(object, u.key);
                Reflect.set(object, u.key, u.value);
                return [
                  () => {
                    if (d) Object.defineProperty(object, u.key, d);
                    else Reflect.deleteProperty(object, u.key);
                  },
                ];
              });
              return () => restores.reverse().forEach((restore) => restore());
            },
          );
          for (const key of ['input', 'candidate', 'observation'])
            change(
              `absent:spoof:${key}`,
              source,
              key,
              { kind: 'absent' },
              key,
              key === 'candidate' ? 'maximumFixedRetainedMismatch' : 'maximumFixedUseMismatch',
            );
          const t = source.transitions![0]!,
            a = t.hpActions[0]!,
            w = a.modifierWrites![0]!;
          inspect(
            'coherent:modifier-receipt-value',
            'canonical.source',
            'maximumFixedCanonicalMismatch',
            () => {
              const oldCell = w.operation.values[0][3],
                oldValue = w.modifiers[0]!.value;
              if (oldCell === undefined) throw new Error('missing actual selected cell');
              w.operation.values[0][3] = 999;
              mutableAuditView(w.modifiers[0]!).value = 999;
              return () => {
                w.operation.values[0][3] = oldCell;
                mutableAuditView(w.modifiers[0]!).value = oldValue;
              };
            },
          );
        }
        const publishedNegatives =
          group === 'published'
            ? [
                auditPublishedMaximumFixed(master, [p], [], [], []),
                auditPublishedMaximumFixed(master, [p], [p.selection], [], []),
                auditPublishedMaximumFixed(master, [p], [p.selection], [p.program], []),
                auditPublishedMaximumFixed(
                  { ...master, servants: [] },
                  [p],
                  [p.selection],
                  [p.program],
                  [source],
                ),
                auditPublishedMaximumFixed(master, [], [p.selection], [p.program], [source]),
                auditPublishedMaximumFixed(master, [p], [], [p.program], [source]),
                auditPublishedMaximumFixed(
                  master,
                  [p],
                  [p.selection, p.selection],
                  [p.program],
                  [source],
                ),
              ]
            : [];
        const payload = {
          canonicalIdentity: p.selection.identity,
          group,
          positive: { proof: structuredClone(maximumFixedDiagnostic(source)), gate: p.gate },
          negatives,
          publishedNegatives,
        };
        await save(task, `audit-maximum-fixed-negative-${group}-${shard}.json`, payload);
        for (const negative of negatives) {
          expect(negative.gate.status, negative.name).toBe('failed');
          const f = negative.gate.failures.find(
            (f) =>
              (f.checkPath === negative.expectedPath ||
                f.checkPath.startsWith(`${negative.expectedPath}.`)) &&
              f.reason === negative.reason,
          );
          expect(f, `${negative.name}: ${negative.expectedPath}/${negative.reason}`).toBeDefined();
          for (const failure of negative.gate.failures) {
            const diff = firstCanonicalAuditDifference(
              [{ identity: failure.identity, value: failure.expected }],
              [{ identity: failure.identity, value: failure.actual }],
            );
            expect(failure.firstDifference).toEqual({
              ...diff,
              path: diff?.path ? `${failure.checkPath}.${diff.path}` : failure.checkPath,
            });
          }
        }
        for (const gate of publishedNegatives)
          expect(gate.status, JSON.stringify(gate.firstDifference)).toBe('failed');
      },
    );
for (let shard = 0; shard < 16; shard++)
  it(
    `maximumFixed canonical nested negatives ${shard}`,
    productionAuditTestOptions([`audit-maximum-fixed-nested-${shard}.json`]),
    async ({ task }) => {
      const p = entry(specs.find((s) => s.name === 'same-occurrence-multiple')!).positive;
      const negatives: {
        path: string;
        gate: ReturnType<typeof auditMaximumFixed>;
        proof: unknown;
      }[] = [];
      let index = 0;
      function visit(object: unknown, path: string) {
        if (!object || typeof object !== 'object') return;
        for (const key of Object.keys(object)) {
          const value: unknown = Reflect.get(object, key);
          if (value && typeof value === 'object') visit(value, `${path}.${key}`);
          else
            for (const replacement of [undefined, typeof value === 'number' ? 99999 : 'foreign']) {
              if (index++ % 16 !== shard) continue;
              const descriptor = Object.getOwnPropertyDescriptor(object, key)!;
              Reflect.set(object, key, replacement);
              try {
                negatives.push({
                  path: `${path}.${key}`,
                  gate: auditMaximumFixed({ expected: [p.program], observations: [p.source] }),
                  proof: structuredClone(maximumFixedDiagnostic(p.source)),
                });
              } finally {
                Object.defineProperty(object, key, descriptor);
              }
            }
        }
      }
      p.source.canonical.writers.forEach((w, i) => visit(w.operation, `writer.${i}.operation`));
      await save(task, `audit-maximum-fixed-nested-${shard}.json`, {
        canonicalIdentity: p.selection.identity,
        negatives,
      });
      for (const n of negatives) {
        expect(n.gate.status, n.path).toBe('failed');
        const f = n.gate.failures.find(
          (f) => f.reason === 'maximumFixedCanonicalMismatch' && f.checkPath === 'canonical.source',
        );
        expect(f, n.path).toBeDefined();
        const diff = firstCanonicalAuditDifference(
          [{ identity: f!.identity, value: f!.expected }],
          [{ identity: f!.identity, value: f!.actual }],
        );
        expect(f!.firstDifference).toEqual({ ...diff, path: `canonical.source.${diff!.path}` });
      }
    },
  );
for (const name of ['prior-commit-prefix', 'fixed-gain-clamp', 'fixed-loss-floor'])
  it(
    `maximumFixed actual consumer negatives ${name}`,
    productionAuditTestOptions([`audit-maximum-fixed-consumer-${name}.json`]),
    async ({ task }) => {
      const p = entry(specs.find((s) => s.name === name)!).positive;
      const negatives: {
        path: string;
        reason: MaximumFixedReason;
        gate: ReturnType<typeof auditMaximumFixed>;
        proof: unknown;
      }[] = [];
      function change(
        object: object,
        key: string,
        value: unknown,
        path: string,
        reason: MaximumFixedReason,
      ) {
        const descriptor = Object.getOwnPropertyDescriptor(object, key)!;
        Reflect.set(object, key, value);
        try {
          negatives.push({
            path,
            reason,
            gate: auditMaximumFixed({ expected: [p.program], observations: [p.source] }),
            proof: structuredClone(maximumFixedDiagnostic(p.source)),
          });
        } finally {
          Object.defineProperty(object, key, descriptor);
        }
      }
      if (name === 'prior-commit-prefix') {
        const t = p.source.transitions![1]!,
          n = t.hpActions[0]!;
        change(
          t.before,
          'hp',
          p.source.transitions![0]!.before.hp,
          'transitions.1.before.hp',
          'maximumFixedRetainedMismatch',
        );
        change(
          t.before,
          'appliedActions',
          [],
          'transitions.1.before.appliedActions.length',
          'maximumFixedRetainedMismatch',
        );
        change(
          n,
          'attempted',
          n.start,
          'transitions.1.hpActions.0.attempted',
          'maximumFixedRetainedMismatch',
        );
        change(
          n,
          'returned',
          n.start,
          'transitions.1.hpActions.0.returned',
          'maximumFixedRetainedMismatch',
        );
        change(
          t.result.state,
          'hp',
          n.modifierWrites![0]!.after,
          'reference.action.1.result.hp',
          'maximumFixedIdentityMismatch',
        );
      } else {
        const w = p.source.transitions![0]!.hpActions[0]!.writes[0]!;
        const actor = w.before.actors.attacker!;
        change(
          actor,
          'maximum',
          10010,
          'transitions.0.hpActions.0.writes.0.before.actors.attacker.maximum',
          'maximumFixedWriteMismatch',
        );
        change(
          w.receipts[0]!,
          'actual',
          0,
          'transitions.0.hpActions.0.writes.0.receipts.0.actual',
          'maximumFixedWriteMismatch',
        );
        change(
          w,
          'before',
          p.source.transitions![0]!.before.hp,
          'reference.action.0.native.0.writes.0.before',
          'maximumFixedIdentityMismatch',
        );
      }
      const counterfeit = auditMaximumFixed({
        expected: [{ ...p.program }],
        observations: [p.source],
      });
      await save(task, `audit-maximum-fixed-consumer-${name}.json`, {
        canonicalIdentity: p.selection.identity,
        negatives,
        counterfeit,
      });
      for (const n of negatives) {
        expect(n.gate.status).toBe('failed');
        expect(
          n.gate.failures.some(
            (f) =>
              f.reason === n.reason &&
              (f.checkPath === n.path || f.checkPath.startsWith(`${n.path}.`)),
          ),
          n.path,
        ).toBe(true);
      }
      expect(
        counterfeit.failures.some(
          (f) => f.reason === 'maximumFixedTraceMissing' && f.checkPath === 'authority',
        ),
      ).toBe(true);
    },
  );
for (const outside of ['maximumRate', 'constant', 'bounded', 'partyOther', 'npWriter'])
  it(
    `maximumFixed explicit outside boundary ${outside}`,
    productionAuditTestOptions([`audit-maximum-fixed-outside-${outside}.json`]),
    async ({ task }) => {
      const original = entry(specs[0]!).master;
      const servant = original.servants[0]!,
        skill = servant.skills[0]!,
        effect = skill.effects[0]!;
      const op = effect.execution.find((o) => o.kind === 'hpModifier')!;
      const extra = {
        ...op,
        ...(outside === 'maximumRate' ? { action: 'maximumRate' } : {}),
        ...(outside === 'constant' ? { lifetime: 'constant' } : {}),
        ...(outside === 'bounded' ? { bounds: { minimum: null, maximum: 99999 } } : {}),
        ...(outside === 'partyOther' ? { route: { ...op.route, target: 'partyOther' } } : {}),
      };
      const raw = {
        ...original,
        servants: [
          {
            ...servant,
            skills: servant.skills.map((s) =>
              s === skill && outside !== 'npWriter'
                ? {
                    ...s,
                    effects: s.effects.map((e) =>
                      e === effect ? { ...e, execution: [...e.execution, extra] } : e,
                    ),
                  }
                : s,
            ),
            noblePhantasmVariantGroups: servant.noblePhantasmVariantGroups.map((g) => ({
              ...g,
              variants: g.variants.map((v) =>
                outside === 'npWriter'
                  ? {
                      ...v,
                      effects: [
                        ...v.effects,
                        {
                          ...effect,
                          id: 'np-hp-boundary',
                          occurrenceId: 'np-hp-boundary:0',
                          gameActivation: 'npBeforeDamage',
                          timing: 'beforeDamage',
                          selection: null,
                          execution: [op],
                        },
                      ],
                    }
                  : v,
              ),
            })),
          },
        ],
      };
      const master = masterSnapshotSchema.parse(raw),
        p = run(master, specs[0]!);
      await save(task, `audit-maximum-fixed-outside-${outside}.json`, {
        boundary: outside,
        gate: p.gate,
        proof: maximumFixedDiagnostic(p.source),
      });
      expect(p.gate.status, JSON.stringify(p.gate.firstDifference)).toBe('passed');
      expect(p.gate.changed).toBe(0);
      expect(p.gate.connected).toBe(0);
      expect(p.gate.boundaries.some((b) => b.reason.startsWith('outsideScope:'))).toBe(true);
    },
  );
it(
  'maximumFixed complete artifact and observation-only contract',
  productionAuditTestOptions(['audit-maximum-fixed-artifact-contract.json']),
  async ({ task }) => {
    const p = entry(specs[0]!).positive,
      proof = maximumFixedDiagnostic(p.source);
    const encoded = encodeProductionAuditDiagnostic(proof);
    const broken = { ...encoded, nodes: encoded.nodes.slice(0, -1) };
    let decodeError: string | undefined;
    try {
      decodeProductionAuditDiagnostic(broken);
    } catch (error) {
      decodeError = String(error);
    }
    const writeErrors: string[] = [];
    for (const [metadata, path] of [
      [undefined, 'audit-maximum-fixed-artifact-contract.json'],
      [task.meta, 'undeclared-maximum-fixed.json'],
    ] as const) {
      try {
        await writeProductionAuditArtifact(metadata, path, encoded);
      } catch (error) {
        writeErrors.push(String(error));
      }
    }
    const incomplete = { ...proof, result: undefined },
      restoredEqual = isDeepStrictEqual(incomplete, proof);
    const auditCode = await readFile(
      new URL('./productionHpMaximumFixedPreparationAudit.ts', import.meta.url),
      'utf8',
    );
    const forbidden =
      /\b(?:executeHpOperation|changeHpModifiers|transitionHp|hpPermille|hpRatio|calculateDamageResolution|evaluatePreparedCalculationScenario)\s*\(/;
    const writerPolicy = {
      actual: forbidden.test(auditCode),
      injectedWriter: forbidden.test(`${auditCode}\nexecuteHpOperation(state)`),
      injectedArithmetic: forbidden.test(`${auditCode}\nchangeHpModifiers(state)`),
    };
    await save(task, 'audit-maximum-fixed-artifact-contract.json', {
      canonicalIdentity: p.selection.identity,
      proof,
      decodeError,
      writeErrors,
      incomplete,
      restoredEqual,
      writerPolicy,
    });
    expect(decodeError).toBeDefined();
    expect(writeErrors).toHaveLength(2);
    expect(restoredEqual).toBe(false);
    expect(writerPolicy).toEqual({ actual: false, injectedWriter: true, injectedArithmetic: true });
    await expect(
      writeProductionAuditArtifact(
        task.meta,
        'audit-maximum-fixed-artifact-contract.json',
        encoded,
      ),
    ).rejects.toThrow('duplicate_production_audit_artifact_receipt');
  },
);

it(
  'maximumFixed audit observes original owners without replay',
  productionAuditTestOptions(['audit-maximum-fixed-no-replay.json']),
  async ({ task }) => {
    const writer = vi.spyOn(hpOwner, 'executeHpOperation'),
      modifiers = vi.spyOn(modifierOwner, 'changeHpModifiers');
    try {
      const spec = specs.find((s) => s.name === 'same-occurrence-multiple')!,
        p = run(entry(spec).master, spec);
      const before = { writer: writer.mock.calls.length, modifiers: modifiers.mock.calls.length };
      const gate = auditMaximumFixed({ expected: [p.program], observations: [p.source] });
      const after = { writer: writer.mock.calls.length, modifiers: modifiers.mock.calls.length };
      await save(task, 'audit-maximum-fixed-no-replay.json', {
        canonicalIdentity: p.selection.identity,
        proof: maximumFixedDiagnostic(p.source),
        gate,
        before,
        after,
      });
      expect(before.writer).toBeGreaterThan(0);
      expect(before.modifiers).toBeGreaterThan(0);
      expect(after).toEqual(before);
      expect(gate.status).toBe('passed');
    } finally {
      writer.mockRestore();
      modifiers.mockRestore();
    }
  },
);

it(
  'maximumFixed denies replaced application and capture facades',
  productionAuditTestOptions(['audit-maximum-fixed-transport.json']),
  async ({ task }) => {
    const p = entry(specs[0]!).positive;
    const negatives: {
      path: string;
      gate: ReturnType<typeof auditMaximumFixed>;
      proof: unknown;
    }[] = [];
    const cases: [object, string, string][] = [];
    for (const key of [
      'input',
      'result',
      'effects',
      'effectiveContributions',
      'executionObservation',
    ])
      if (Reflect.get(p.calculation, key) !== undefined)
        cases.push([p.calculation, key, `reference.facade.calculation.${key}`]);
    for (const key of [
      'master',
      'scenario',
      'resolved',
      'orderedScenario',
      'executionObservation',
      'canonicalInputs',
    ])
      if (Reflect.get(p.prepared, key) !== undefined)
        cases.push([p.prepared, key, `reference.facade.prepared.${key}`]);
    for (const key of [
      'input',
      'effects',
      'effectiveContributions',
      'requiredInputs',
      'noblePhantasmVariant',
    ])
      if (Reflect.get(p.prepared.resolved, key) !== undefined)
        cases.push([p.prepared.resolved, key, `reference.facade.resolved.${key}`]);
    if (p.prepared.status === 'executable')
      cases.push([p.prepared, 'scenarioInput', 'reference.facade.prepared.scenarioInput']);
    cases.push([p.source.transport!, 'transitions', 'reference.transport.transitions']);
    cases.push([p.source.observation!, 'targetExecution', 'reference.selected.target']);
    for (const [object, key, path] of cases) {
      const descriptor = Object.getOwnPropertyDescriptor(object, key)!;
      Reflect.set(object, key, structuredClone(Reflect.get(object, key)));
      try {
        negatives.push({
          path,
          gate: auditMaximumFixed({ expected: [p.program], observations: [p.source] }),
          proof: structuredClone(maximumFixedDiagnostic(p.source)),
        });
      } finally {
        Object.defineProperty(object, key, descriptor);
      }
    }
    await save(task, 'audit-maximum-fixed-transport.json', {
      canonicalIdentity: p.selection.identity,
      negatives,
    });
    for (const n of negatives) {
      expect(n.gate.status).toBe('failed');
      expect(
        n.gate.failures.some(
          (f) => f.checkPath === n.path && f.reason === 'maximumFixedIdentityMismatch',
        ),
        n.path,
      ).toBe(true);
    }
  },
);

it(
  'maximumFixed declaration-only and original native refusal boundaries',
  productionAuditTestOptions(['audit-maximum-fixed-declaration-refusal.json']),
  async ({ task }) => {
    const spec = specs[0]!,
      original = entry(spec).master;
    const scenario = {
      ...createDefaultResolvedScenario(original, undefined),
      preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' as const }],
    };
    const prepared = prepareCalculationScenarioWithPolicy(
      scenario,
      original,
      { kind: 'calculator' },
      {},
      true,
    );
    const calculation = evaluatePreparedCalculationScenario(prepared, {
      ...versions,
      masterDataVersion: original.version,
    });
    const declaration = auditPublishedMaximumFixed(
      original,
      [{ prepared, calculation }],
      [],
      [],
      [],
    );
    const raw = structuredClone(original),
      operation = raw.servants[0]!.skills[0]!.effects[0]!.execution.find(
        (o) => o.kind === 'hpModifier',
      )!;
    operation.values[0][3] = null;
    const master = masterSnapshotSchema.parse(raw),
      refused = run(master, spec);
    const n = refused.source.transitions![0]!.hpActions[0]!;
    const oldStatus = n.native!.status;
    Reflect.set(n.native!, 'status', 'committed');
    const forged = auditMaximumFixed({
      expected: [refused.program],
      observations: [refused.source],
    });
    Reflect.set(n.native!, 'status', oldStatus);
    await save(task, 'audit-maximum-fixed-declaration-refusal.json', {
      declaration,
      refusal: { gate: refused.gate, proof: maximumFixedDiagnostic(refused.source) },
      forged,
    });
    expect(declaration.status).toBe('passed');
    expect(declaration.inventory.length).toBeGreaterThan(0);
    expect(declaration.selected).toBe(0);
    expect(refused.gate.status, JSON.stringify(refused.gate.firstDifference)).toBe('passed');
    expect(refused.gate.connected).toBe(0);
    expect(refused.calculation.result.status).not.toBe('calculated');
    expect(refused.source.candidate).toBeUndefined();
    expect(refused.source.input).toBeUndefined();
    expect(
      forged.failures.some(
        (f) => f.reason === 'maximumFixedCommitMismatch' && f.checkPath.endsWith('.native.status'),
      ),
    ).toBe(true);
  },
);
