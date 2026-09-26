import { expect, it } from 'vitest';
import { isDeepStrictEqual } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema, type MasterDataSnapshot } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import {
  createDefaultResolvedScenario,
  prepareCalculationScenarioWithPolicy,
  evaluatePreparedCalculationScenario,
  evaluatePreparedCalculationResult,
} from './scenario';
import { attachBattlePointPreparationRejectionObservation } from './battlePointPreparationObservation';
import {
  battlePointCapacityAttemptProgram,
  battlePointCapacityAttemptSelection,
  battlePointCapacityAttemptSource,
  battlePointCapacityAttemptDiagnostic,
  auditBattlePointCapacityPreparationAttempts,
  auditPublishedBattlePointCapacityPreparationAttempts,
  type BattlePointCapacityAttemptSource,
} from './productionBattlePointCapacityPreparationAttemptAudit';
import { type BattlePointPreparationAttemptFailureReason } from './productionBattlePointPreparationAttemptAudit';
import {
  productionAuditTestOptions,
  writeProductionAuditArtifact,
  encodeProductionAuditDiagnostic,
  decodeProductionAuditDiagnostic,
  serializeProductionAuditArtifact,
  decodeProductionAuditArtifact,
} from './productionAuditArtifacts';

type Entry =
  | { kind: 'capacity'; amount: number; lifetime?: 'active' | 'constant' }
  | { kind: 'fixed'; amount: number };
type Spec = {
  name: string;
  initial: number;
  capacity: number | null;
  maximum: number | null;
  groups: Entry[][];
  failure: 'unsupported' | 'invalid' | 'inputRequired';
  kind: 'changedCapacity' | 'modifierOnly' | 'notApplicable' | 'beforeAttempt';
  attempted: [number | null, number][];
  retained: [number | null, number];
  permille?: boolean;
  ineligible?: boolean;
  indexed?: boolean;
  choice?: boolean;
  multipleSources?: boolean;
  phase?: number;
  early?: boolean;
  skip?: boolean;
};
const c = (amount: number, lifetime: 'active' | 'constant' = 'active'): Entry => ({
  kind: 'capacity',
  amount,
  lifetime,
});
const f = (amount: number): Entry => ({ kind: 'fixed', amount });
const specs: Spec[] = [
  {
    name: 'increase-fixed-prefix',
    phase: 2,
    initial: 20,
    capacity: 100,
    maximum: 200,
    groups: [[c(50), f(100), f(-20)]],
    failure: 'unsupported',
    kind: 'changedCapacity',
    attempted: [
      [150, 20],
      [150, 120],
      [150, 100],
    ],
    retained: [100, 20],
    choice: true,
  },
  {
    name: 'decrease-clamp-invalid',
    initial: 80,
    capacity: 100,
    maximum: 200,
    groups: [[c(-50), f(30), f(-20)]],
    failure: 'invalid',
    kind: 'changedCapacity',
    attempted: [
      [50, 50],
      [50, 50],
      [50, 30],
      [50, 30],
    ],
    retained: [100, 80],
  },
  {
    name: 'increase-input-required',
    initial: 60,
    capacity: 100,
    maximum: 200,
    groups: [[c(100, 'constant'), f(-10)]],
    failure: 'inputRequired',
    kind: 'changedCapacity',
    attempted: [
      [200, 60],
      [200, 50],
    ],
    retained: [100, 60],
    permille: true,
    indexed: true,
  },
  {
    name: 'multiple-source-prefix',
    initial: 80,
    capacity: 100,
    maximum: 100,
    groups: [[c(50), c(-60), f(80), f(-10)]],
    failure: 'unsupported',
    kind: 'changedCapacity',
    attempted: [
      [100, 80],
      [40, 40],
      [40, 40],
      [40, 30],
    ],
    retained: [100, 80],
    multipleSources: true,
  },
  {
    name: 'prior-capacity-fixed-commit',
    initial: 10,
    capacity: 100,
    maximum: 100,
    groups: [
      [c(50), c(-60), f(30)],
      [c(-50), f(200), c(30), f(-10)],
    ],
    failure: 'inputRequired',
    kind: 'changedCapacity',
    attempted: [
      [40, 40],
      [40, 40],
      [70, 40],
      [70, 30],
    ],
    retained: [90, 40],
    indexed: true,
  },
  {
    name: 'null-modifier-only',
    initial: 20,
    capacity: null,
    maximum: null,
    groups: [[c(30)]],
    failure: 'unsupported',
    kind: 'modifierOnly',
    attempted: [[null, 20]],
    retained: [null, 20],
  },
  {
    name: 'zero-modifier-only',
    initial: 0,
    capacity: 0,
    maximum: 100,
    groups: [[c(0)]],
    failure: 'unsupported',
    kind: 'modifierOnly',
    attempted: [[0, 0]],
    retained: [0, 0],
  },
  {
    name: 'eligible-absent',
    initial: -1,
    capacity: 100,
    maximum: 200,
    groups: [[c(50)]],
    failure: 'unsupported',
    kind: 'notApplicable',
    attempted: [],
    retained: [null, -1],
  },
  {
    name: 'ineligible',
    initial: 0,
    capacity: 100,
    maximum: 200,
    groups: [[c(50)]],
    failure: 'unsupported',
    kind: 'notApplicable',
    attempted: [],
    retained: [null, -1],
    ineligible: true,
  },
  {
    name: 'non-applied',
    initial: 10,
    capacity: 100,
    maximum: 200,
    groups: [[c(50)]],
    failure: 'unsupported',
    kind: 'notApplicable',
    attempted: [],
    retained: [100, 10],
    skip: true,
  },
  {
    name: 'before-capacity',
    initial: 10,
    capacity: 100,
    maximum: 200,
    groups: [[c(50)]],
    failure: 'unsupported',
    kind: 'beforeAttempt',
    attempted: [],
    retained: [100, 10],
    early: true,
  },
];
const parsedFixture = masterSnapshotSchema.parse(fixture);
function fixtureMaster(spec: Spec) {
  const base = parsedFixture;
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
        ...(spec.choice && index === spec.groups.length - 1
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
              subjectId: domainId,
              values: [[900, 900, 900, 900, 900, 900, 900, 900, 900, 900], [], [], [], []],
              lifetime: 'active',
              traits: [],
            },
          ],
        });
    }
  const failSkill = skills.at(-1)!;
  const failEffect = {
    ...effect,
    id: 'capacity-attempt-failure',
    occurrenceId: 'capacity-attempt-failure:0',
    execution:
      spec.failure === 'invalid'
        ? [
            {
              kind: 'battlePointCapacityModifier',
              recipient: 'sourceSelf',
              subjectId: domainId,
              values: [[], [], [], [], []],
              lifetime: 'active',
              traits: [],
            },
          ]
        : spec.failure === 'unsupported'
          ? [
              {
                kind: 'unsupported',
                route: modifier.route,
                reason: 'ocExecutionSemantics',
                damageRelevant: true,
              },
            ]
          : [
              {
                kind: 'grantOcBoost',
                route: modifier.route,
                lifetime: 'active',
                stacking: 'additive',
                stateTraits: ['positive'],
                cells: Array.from({ length: 5 }, () =>
                  Array.from({ length: 10 }, () => ({
                    stages: 1,
                    applicationRatePermille: 500,
                    turns: { kind: 'unlimited' },
                    uses: { kind: 'finite', remaining: 1 },
                  })),
                ),
              },
            ],
  };
  const writers = failSkill.effects.flatMap((e) =>
    spec.multipleSources && e.selection?.group.candidate !== 'other'
      ? e.execution.map((operation, i) => ({
          ...e,
          id: `${e.id}-${i}`,
          occurrenceId: `${e.occurrenceId}-${i}`,
          execution: [operation],
        }))
      : [e],
  );
  const selectedWriters = writers.map((writer) =>
    spec.skip
      ? {
          ...writer,
          requirement: {
            recipient: 'sourceSelf',
            expression: {
              kind: 'quantity',
              quantity: 'battlePointPhase',
              subjectId: domainId,
              comparison: 'atLeast',
              value: 999,
            },
          },
        }
      : writer,
  );
  const failedSkills = skills.map((skill) =>
    skill === failSkill
      ? {
          ...skill,
          effects: spec.early ? [failEffect, ...selectedWriters] : [...selectedWriters, failEffect],
        }
      : skill,
  );
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
        skills: failedSkills,
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
    battleState: { battlePointPhase: spec.phase ?? null },
    ...(spec.phase === undefined
      ? {
          initialBattlePointPoints: spec.ineligible
            ? {}
            : { '810000': spec.initial, '810001': spec.initial },
        }
      : {}),
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
          conditionalEffects: 'baseline',
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
  const result = evaluatePreparedCalculationResult(prepared, {
    ...versions,
    masterDataVersion: master.version,
  });
  const program = battlePointCapacityAttemptProgram(prepared, calculation);
  if (!program) throw new TypeError('capacity_attempt_fixture_program_missing');
  const source = battlePointCapacityAttemptSource(program);
  const selection = battlePointCapacityAttemptSelection(prepared)!;
  return {
    master,
    prepared,
    calculation,
    result,
    program,
    source,
    selection,
    gate: auditBattlePointCapacityPreparationAttempts({
      selections: [selection],
      expected: [program],
      observations: [source],
    }),
  };
}
const preparations = new Map<
  Spec,
  {
    positive: ReturnType<typeof run>;
    normal: ReturnType<typeof run>;
    ranking: ReturnType<typeof run>;
  }
>();
function prepared(spec: Spec) {
  let saved = preparations.get(spec);
  if (!saved) {
    const master = fixtureMaster(spec);
    saved = {
      positive: run(master, spec),
      normal: run(master, spec, false),
      ranking: run(master, spec, true, true),
    };
    preparations.set(spec, saved);
  }
  return saved;
}
type Mutable<T> = T extends
  | BattlePointCapacityAttemptSource['program']
  | BattlePointCapacityAttemptSource['rejection']['program']
  | BattlePointCapacityAttemptSource['rejection']['prepared']
  | BattlePointCapacityAttemptSource['rejection']['calculation']
  ? T
  : T extends ReadonlySet<infer U>
    ? Set<U>
    : T extends ReadonlyMap<infer K, infer V>
      ? Map<K, V>
      : T extends object
        ? { -readonly [K in keyof T]: Mutable<T[K]> }
        : T;
type Source = Mutable<BattlePointCapacityAttemptSource>;
function cloneSource(source: BattlePointCapacityAttemptSource): Source {
  const proof = structuredClone({ capture: source.rejection.capture, steps: source.steps });
  const result = structuredClone(source.rejection.calculation.result);
  const cloned = {
    ...source,
    rejection: {
      ...source.rejection,
      prepared: {
        ...source.rejection.prepared,
        resolved: structuredClone(source.rejection.prepared.resolved),
      },
      calculation: { ...source.rejection.calculation, result },
      capture: proof.capture,
    },
    steps: proof.steps,
  } as Source;
  if (proof.capture)
    for (const target of [cloned.rejection.prepared, cloned.rejection.calculation, result])
      attachBattlePointPreparationRejectionObservation(target, proof.capture);
  return cloned;
}
function failed(source: Source) {
  return source.rejection.capture!.transitions.at(-1)!;
}
function attempt(source: Source) {
  return failed(source).attempts![0]!;
}
const groups = [
  'positive',
  'missing-transport',
  'missing-write',
  'missing-receipt',
  'identity-source',
  'identity-native-source',
  'identity-native-index',
  'identity-operation',
  'identity-receipt',
  'state-before',
  'state-after',
  'state-modifier-identity',
  'state-modifier-values',
  'state-retained',
  'commit-downstream',
  'result',
] as const;
for (const spec of specs)
  for (const group of groups.flatMap((group) =>
    spec.name === 'prior-capacity-fixed-commit' && group === 'commit-downstream'
      ? ([group, 'commit-downstream-fabricated'] as const)
      : [group],
  ))
    it(
      `isolates capacity attempt ${spec.name} ${group}`,
      productionAuditTestOptions([`tsk-08-bp-capacity-attempt-${spec.name}-${group}.json`]),
      async ({ task }) => {
        const { positive, normal, ranking } = prepared(spec);
        const family = group.startsWith('missing-')
          ? 'missing'
          : group.startsWith('identity-')
            ? 'identity-order'
            : group.startsWith('state-')
              ? 'state'
              : group;
        const accepts = (name: string) => {
          if (spec.name === 'prior-capacity-fixed-commit' && group.startsWith('commit-downstream'))
            return group === 'commit-downstream-fabricated'
              ? name.startsWith('fabricated-')
              : !name.startsWith('fabricated-');
          if (family === 'missing') {
            if (group === 'missing-write') return name.startsWith('missing-write-');
            if (group === 'missing-receipt') return name.startsWith('missing-receipt-');
            return !name.startsWith('missing-write-') && !name.startsWith('missing-receipt-');
          }
          if (family === 'identity-order') {
            if (group === 'identity-native-source') return /^wrong-(source|occurrence)-/.test(name);
            if (group === 'identity-native-index') return /^wrong-(step|index)-/.test(name);
            if (group === 'identity-operation') return /^wrong-operation-/.test(name);
            if (group === 'identity-receipt') return /^wrong-receipt-/.test(name);
            return !/^wrong-(source|occurrence|operation|step|index|receipt)-/.test(name);
          }
          if (family === 'state') {
            if (group === 'state-before')
              return /^stale-[0-9]+-before-/.test(name) || /^(amount-only-|equal-write)/.test(name);
            if (group === 'state-after') return /^stale-[0-9]+-after-/.test(name);
            if (group === 'state-modifier-identity')
              return /^modifier-.*-(identity|lifetime)$/.test(name);
            if (group === 'state-modifier-values')
              return /^modifier-.*-(amount|traits)$/.test(name);
            return !/^(stale-[0-9]|modifier-|amount-only-|equal-write)/.test(name);
          }
          return true;
        };
        const negatives: {
          name: string;
          reason: BattlePointPreparationAttemptFailureReason;
          path: string;
          gate: ReturnType<typeof auditBattlePointCapacityPreparationAttempts>;
          proof: unknown;
        }[] = [];
        const add = (
          name: string,
          reason: BattlePointPreparationAttemptFailureReason,
          path: string,
          mutate: (s: Source) => void,
        ) => {
          if (!accepts(name)) return;
          const s = cloneSource(positive.source);
          mutate(s);
          negatives.push({
            name,
            reason,
            path,
            gate: auditBattlePointCapacityPreparationAttempts({
              selections: [positive.selection],
              expected: [positive.program],
              observations: [s as unknown as BattlePointCapacityAttemptSource],
            }),
            proof: battlePointCapacityAttemptDiagnostic(
              s as unknown as BattlePointCapacityAttemptSource,
            ),
          });
        };
        // Grouped counterexamples follow the original capture; no writer is replayed.
        const actionIndex = positive.source.rejection.capture!.transitions.length - 1;
        const actionPath = `capacity.action.${actionIndex}`;
        const a = positive.source.rejection.capture!.transitions.at(-1)!.attempts![0]!;
        const remove = (object: object, key: string) => {
          Reflect.deleteProperty(object, key);
        };
        const population = (
          name: string,
          path: string,
          selections: (typeof positive.selection)[],
          expected: (typeof positive.program)[],
          observations: BattlePointCapacityAttemptSource[],
        ) => {
          if (!accepts(name)) return;
          negatives.push({
            name,
            reason: 'attemptPopulationMismatch',
            path,
            gate: auditBattlePointCapacityPreparationAttempts({
              selections,
              expected,
              observations,
            }),
            proof: {
              selections,
              expected: expected.map((p) => p.selection),
              observations: observations.map(battlePointCapacityAttemptDiagnostic),
            },
          });
        };
        if (family === 'missing') {
          population(
            'missing-program',
            'capacity.population.selections',
            [positive.selection],
            [],
            [],
          );
          population(
            'missing-selection',
            'capacity.population.selections',
            [],
            [positive.program],
            [positive.source],
          );
          population(
            'missing-observation',
            'capacity.population.observations',
            [positive.selection],
            [positive.program],
            [],
          );
          add('missing-steps', 'attemptTransportMissing', 'capacity.steps', (s) =>
            remove(s, 'steps'),
          );
          add('missing-timeline', 'attemptTransportMissing', `${actionPath}.timeline`, (s) => {
            s.steps[actionIndex] = undefined;
          });
          for (const [key, path] of [
            ['master', 'canonical.observed'],
            ['scenario', 'canonical.observed'],
          ] as const)
            add(`missing-${key}`, 'attemptCanonicalMismatch', path, (s) =>
              remove(s.rejection.prepared, key),
            );
          for (const [key, path] of [
            ['capture', 'transport.capture'],
            ['prepared', 'transport.preparedObject'],
            ['calculation', 'transport.calculationObject'],
          ] as const)
            add(`missing-${key}`, 'attemptTransportMissing', path, (s) => remove(s.rejection, key));
          for (const [key, path] of [
            ['before', 'rejection.actionStart'],
            ['command', 'rejection.commandObject'],
            ['result', 'rejection.transition'],
          ] as const)
            add(
              `missing-${key}`,
              key === 'result' ? 'attemptRejectionMismatch' : 'attemptTransportMissing',
              path,
              (s) => remove(failed(s), key),
            );
          for (const [key, path] of [
            ['start', 'native.startState'],
            ['sources', 'native.sourceList'],
            ['stepOrigins', 'native.originList'],
            ['reached', 'native.reachedList'],
            ['writes', 'native.writeList'],
          ] as const)
            add(`missing-${key}`, 'attemptTransportMissing', path, (s) => remove(attempt(s), key));
          add('missing-native', 'attemptNativeMismatch', 'native.nonCommit', (s) =>
            remove(attempt(s), 'native'),
          );
          add('missing-returned', 'attemptStateMismatch', 'native.returnedReference', (s) =>
            remove(attempt(s), 'returned'),
          );
          add('missing-attempted', 'attemptStateMismatch', `${actionPath}.attempted`, (s) =>
            remove(attempt(s), 'attempted'),
          );
          add('missing-original-attempt', 'attemptTransportMissing', 'native.attempt', (s) => {
            failed(s).attempts = [];
          });
          add('missing-result', 'attemptTransportMissing', 'transport.result', (s) =>
            remove(s.rejection.calculation, 'result'),
          );
          add('missing-rejection', 'attemptTransportMissing', 'rejection.outcome', (s) =>
            remove(s.rejection.capture!, 'rejection'),
          );
          add('missing-native-state', 'attemptTransportMissing', 'native.ocStateObject', (s) =>
            remove(attempt(s).native!, 'state'),
          );
          add('missing-native-actions', 'attemptTransportMissing', 'native.ocActions', (s) =>
            remove(attempt(s).native!.state, 'committedActions'),
          );
          add('missing-native-receipts', 'attemptCommitLeak', 'native.ocReceipts', (s) =>
            remove(attempt(s).native!.state, 'receipts'),
          );
          add('missing-source-entry', 'attemptCanonicalMismatch', 'native.sources', (s) => {
            attempt(s).sources.splice(0, 1);
          });
          add(
            'missing-command-prefix',
            actionIndex ? 'attemptOrderMismatch' : 'attemptRejectionMismatch',
            actionIndex ? 'transition.commandPrefix' : 'rejection.transition',
            (s) => {
              s.rejection.capture!.transitions.splice(0, 1);
            },
          );
          for (const [wi, w] of a.writes.entries()) {
            for (const key of ['before', 'after', 'receipts', 'source'] as const)
              add(
                `missing-write-${wi}-${key}`,
                'attemptTransportMissing',
                key === 'source'
                  ? `writer.${wi}.source`
                  : key === 'receipts'
                    ? `writer.${wi}.receipts`
                    : `writer.${wi}.states`,
                (s) => remove(attempt(s).writes[wi]!, key),
              );
            add(
              `missing-write-${wi}-operation`,
              'attemptIdentityMismatch',
              `writer.${wi}.canonical`,
              (s) => {
                attempt(s).writes[wi]!.source.effect.execution.splice(w.operationIndex, 1);
              },
            );
            add(
              `missing-write-${wi}-actor`,
              'attemptStateMismatch',
              `writer.${wi}.after.owner`,
              (s) => remove(attempt(s).writes[wi]!.after.actors, 'attacker'),
            );
            const presentAfter = w.after.actors.attacker?.domains['810000'];
            if (presentAfter?.kind === 'present')
              add(
                `missing-write-${wi}-modifier-list`,
                'attemptStateMismatch',
                `writer.${wi}.after.owner`,
                (s) =>
                  remove(
                    attempt(s).writes[wi]!.after.actors.attacker!.domains['810000']!,
                    'capacityModifiers',
                  ),
              );
            for (const [ri] of w.receipts.entries())
              for (const key of ['identity', 'actor', 'domainId', 'before', 'after'] as const)
                add(
                  `missing-receipt-${wi}-${ri}-${key}`,
                  key === 'identity' || key === 'actor' || key === 'domainId'
                    ? 'attemptIdentityMismatch'
                    : 'attemptStateMismatch',
                  `writer.${wi}.${key === 'before' ? 'receiptBefore' : key === 'after' ? 'receiptAfter' : 'receiptIdentity'}`,
                  (s) => remove(attempt(s).writes[wi]!.receipts[ri]!, key),
                );
          }
        }
        if (family === 'identity-order') {
          population(
            'duplicate-selection',
            'capacity.population.unique',
            [positive.selection, positive.selection],
            [positive.program, positive.program],
            [positive.source, positive.source],
          );
          population(
            'duplicate-observation',
            'capacity.population.observations',
            [positive.selection],
            [positive.program],
            [positive.source, positive.source],
          );
          add('wrong-scenario', 'attemptCanonicalMismatch', 'canonical.observed', (s) => {
            s.rejection.prepared.scenario = structuredClone(s.rejection.prepared.scenario);
            if (s.rejection.prepared.scenario.mode === 'resolved')
              s.rejection.prepared.scenario.attacker.level += 1;
          });
          add('wrong-action', 'attemptIdentityMismatch', 'native.actionId', (s) => {
            attempt(s).actionId = 'other-action';
          });
          add('wrong-reached-order', 'attemptOrderMismatch', 'native.prefix', (s) => {
            attempt(s).reached[0]!.index += 1;
          });
          add('duplicate-reached', 'attemptOrderMismatch', 'native.prefix', (s) => {
            attempt(s).reached.push(attempt(s).reached[0]!);
          });
          add('reverse-origins', 'attemptIdentityMismatch', 'native.stepOrigins', (s) => {
            attempt(s).stepOrigins.reverse();
          });
          for (const [wi, w] of a.writes.entries()) {
            for (const key of ['sourceId', 'sourceInstanceId', 'skillId', 'origin'] as const)
              add(
                `wrong-source-${wi}-${key}`,
                'attemptIdentityMismatch',
                'native.sourceIdentity',
                (s) => {
                  Reflect.set(
                    attempt(s).writes[wi]!.source,
                    key,
                    key === 'origin' ? 'support' : 'other-source',
                  );
                },
              );
            add(
              `wrong-occurrence-${wi}`,
              'attemptIdentityMismatch',
              `writer.${wi}.canonical`,
              (s) => {
                attempt(s).writes[wi]!.source.effect.occurrenceId += ':other';
              },
            );
            add(
              `wrong-operation-${wi}`,
              'attemptIdentityMismatch',
              `writer.${wi}.canonical`,
              (s) => {
                attempt(s).writes[wi]!.operationIndex += 1;
              },
            );
            add(`wrong-step-${wi}`, 'attemptOrderMismatch', `writer.${wi}.step`, (s) => {
              attempt(s).writes[wi]!.step = -1;
            });
            for (const key of ['valueSetIndex', 'valueIndex'] as const)
              add(
                `wrong-index-${wi}-${key}`,
                'attemptIdentityMismatch',
                'native.sourceIdentity',
                (s) => {
                  attempt(s).writes[wi]!.source[key] += 1;
                },
              );
            for (const [ri] of w.receipts.entries())
              for (const key of ['identity', 'actor', 'domainId'] as const)
                add(
                  `wrong-receipt-${wi}-${ri}-${key}`,
                  'attemptIdentityMismatch',
                  `writer.${wi}.receiptIdentity`,
                  (s) => {
                    attempt(s).writes[wi]!.receipts[ri]![key] = 'other';
                  },
                );
            const op = w.source.effect.execution[w.operationIndex];
            if (op?.kind === 'battlePointCapacityModifier')
              for (const key of ['lifetime', 'traits', 'subjectId', 'recipient', 'values'] as const)
                add(
                  `wrong-operation-field-${wi}-${key}`,
                  'attemptIdentityMismatch',
                  `writer.${wi}.canonical`,
                  (s) => {
                    Reflect.set(
                      attempt(s).writes[wi]!.source.effect.execution[w.operationIndex]!,
                      key,
                      key === 'traits'
                        ? ['other']
                        : key === 'values'
                          ? [[999], [], [], [], []]
                          : key === 'recipient'
                            ? 'target'
                            : key === 'lifetime'
                              ? op.lifetime === 'active'
                                ? 'constant'
                                : 'active'
                              : '810001',
                    );
                  },
                );
          }
          if (a.writes.length > 1) {
            add('reverse-writes', 'attemptPopulationMismatch', 'writer.reachedPopulation', (s) => {
              attempt(s).writes.reverse();
            });
            add('duplicate-write', 'attemptPopulationMismatch', 'writer.reachedPopulation', (s) => {
              attempt(s).writes.push(attempt(s).writes[0]!);
            });
          }
          add(
            'mixed-selected-execution',
            'attemptIdentityMismatch',
            'transport.calculation',
            (s) => {
              s.rejection.calculation = ranking.source.rejection.calculation;
            },
          );
          add(
            'equal-new-result-reference',
            'attemptIdentityMismatch',
            'result.originalReference',
            () => {},
          );
        }
        if (family === 'state') {
          for (const [wi, w] of a.writes.entries()) {
            for (const key of ['point', 'capacity', 'capacityModifiers'] as const)
              for (const when of ['before', 'after'] as const)
                add(
                  `stale-${wi}-${when}-${key}`,
                  'attemptStateMismatch',
                  `writer.${wi}.${when}.owner`,
                  (s) => {
                    const v = attempt(s).writes[wi]![when].actors.attacker!.domains['810000']!;
                    if (v.kind === 'present')
                      Reflect.set(
                        v,
                        key,
                        key === 'capacityModifiers'
                          ? [
                              {
                                identity: 'fabricated',
                                amount: 999,
                                lifetime: 'active',
                                traits: [],
                              },
                            ]
                          : key === 'capacity'
                            ? 777
                            : 888,
                      );
                    else Reflect.set(v, 'eligible', !v.eligible);
                  },
                );
            for (const [ri, r] of w.receipts.entries())
              if (r.after.kind === 'present')
                for (const [mi] of r.after.capacityModifiers.entries())
                  for (const key of ['identity', 'amount', 'lifetime', 'traits'] as const)
                    add(
                      `modifier-${wi}-${ri}-${mi}-${key}`,
                      'attemptStateMismatch',
                      `writer.${wi}.after.owner`,
                      (s) => {
                        const after = attempt(s).writes[wi]!.receipts[ri]!.after;
                        if (after.kind === 'present')
                          Reflect.set(
                            after.capacityModifiers[mi]!,
                            key,
                            key === 'amount'
                              ? 999
                              : key === 'traits'
                                ? ['other']
                                : key === 'lifetime'
                                  ? 'expired'
                                  : 'other-modifier',
                          );
                      },
                    );
            add(
              `amount-only-${wi}`,
              w.after === w.before ? 'attemptIdentityMismatch' : 'attemptStateMismatch',
              `writer.${wi}.${w.after === w.before ? 'afterReference' : 'after.owner'}`,
              (s) => {
                attempt(s).writes[wi]!.after = structuredClone(attempt(s).writes[wi]!.before);
              },
            );
          }
          add(
            'attempted-to-retained',
            'attemptIdentityMismatch',
            'native.originalAttempted',
            (s) => {
              attempt(s).attempted = attempt(s).start.battlePoints;
            },
          );
          add('attempted-leak', 'attemptStateMismatch', 'native.retainedState', (s) => {
            attempt(s).returned!.battlePoints = attempt(s).attempted!;
            if (spec.kind !== 'changedCapacity' && spec.kind !== 'modifierOnly') {
              const v = attempt(s).returned!.battlePoints.actors.attacker!.domains['810000']!;
              if (v.kind === 'present') v.point = 999;
              else v.eligible = !v.eligible;
            }
          });
          add('different-domain-retained', 'attemptStateMismatch', 'native.retainedState', (s) => {
            const actor = attempt(s).returned!.battlePoints.actors.attacker!;
            actor.domains['810000'] = actor.domains['810001']!;
            Reflect.set(actor.domains['810000'], 'point', 777);
          });
          if (actionIndex > 0) {
            add('action-start-to-seed', 'attemptStateMismatch', 'native.start', (s) => {
              attempt(s).start.battlePoints =
                s.rejection.capture!.transitions[0]!.before.battlePoints;
            });
            add('prior-commit-lost', 'attemptCommitLeak', 'rejection.committedPrefix', (s) => {
              s.rejection.capture!.rejection!.appliedPreparationActions = [];
            });
          }
          for (const [ti, steps] of positive.source.steps.entries())
            for (const [si, step] of (steps ?? []).entries())
              if (step.kind === 'reconcile') {
                add(
                  `stale-reconcile-${ti}-${si}`,
                  'attemptIdentityMismatch',
                  `capacity.action.${ti}.step.${si}.reconcileReference`,
                  (s) => {
                    const st = s.steps[ti]![si]!;
                    if (st.kind === 'reconcile') st.after = st.before;
                  },
                );
              }
        }
        if (group.startsWith('commit-downstream')) {
          add('fake-native-commit', 'attemptNativeMismatch', 'native.nonCommit', (s) =>
            Reflect.set(attempt(s).native!, 'status', 'committed'),
          );
          add('fake-reducer-commit', 'attemptOrderMismatch', 'transition.stop', (s) =>
            Reflect.set(failed(s).result, 'status', 'applied'),
          );
          add('fake-oc-outcome', 'attemptCommitLeak', 'native.outcomes', (s) =>
            attempt(s).native!.outcomes.push({ step: 0, outcome: 'applied' }),
          );
          add('fake-executed-effect', 'attemptCommitLeak', 'native.executedEffects', (s) =>
            attempt(s).returned!.battlePoints.executedEffects.push('failed-effect'),
          );
          add('fake-applied-action', 'attemptCommitLeak', 'rejection.committedPrefix', (s) =>
            s.rejection.capture!.rejection!.appliedPreparationActions.push({
              kind: 'skill',
              slot: 99,
              skillId: 'failed',
              skillLevel: 10,
            } as never),
          );
          add('stop-after-command', 'attemptOrderMismatch', 'transition.stop', (s) =>
            s.rejection.capture!.transitions.push(s.rejection.capture!.transitions[0]!),
          );
          for (const [wi, w] of a.writes.entries())
            for (const [ri] of w.receipts.entries()) {
              add(`leak-receipt-${wi}-${ri}`, 'attemptCommitLeak', 'native.retainedReceipts', (s) =>
                attempt(s).returned!.battlePoints.receipts.push(
                  attempt(s).writes[wi]!.receipts[ri]!,
                ),
              );
              add(
                `leak-modifier-${wi}-${ri}`,
                'attemptStateMismatch',
                'native.retainedState',
                (s) => {
                  const r = attempt(s).writes[wi]!.receipts[ri]!,
                    v = attempt(s).returned!.battlePoints.actors.attacker!.domains['810000']!;
                  if (v.kind === 'present' && r.after.kind === 'present')
                    v.capacityModifiers = r.after.capacityModifiers;
                },
              );
            }
          for (const key of [
            'damageInputGenerated',
            'orderedScenario',
            'orderedExecution',
          ] as const)
            add(
              `fabricated-${key}`,
              'attemptDownstreamLeak',
              key === 'damageInputGenerated'
                ? 'downstream.phaseConversion'
                : key === 'orderedScenario'
                  ? 'downstream.orderedPreparation'
                  : 'downstream.orderedExecution',
              (s) => Reflect.set(s.rejection.capture!, key, { fabricated: true }),
            );
          for (const key of ['orderedScenario', 'canonicalInputs'] as const)
            add(`fabricated-prepared-${key}`, 'attemptDownstreamLeak', `downstream.${key}`, (s) =>
              Reflect.set(s.rejection.prepared, key, { fabricated: true }),
            );
          for (const key of [
            'scenarioInput',
            'executionObservation',
            'phaseConversion',
            'liveRead',
            'scalar',
            'npConsumption',
            'projection',
            'effectiveContribution',
          ] as const)
            add(`fabricated-prepared-${key}`, 'attemptStateMismatch', 'capacity.owner', (s) =>
              Reflect.set(s.rejection.prepared, key, { fabricated: true }),
            );
          for (const key of ['executionObservation', 'input', 'scenarioInput'] as const)
            add(
              `fabricated-calculation-${key}`,
              'attemptDownstreamLeak',
              key === 'executionObservation'
                ? 'downstream.executionObservation'
                : 'downstream.input',
              (s) => Reflect.set(s.rejection.calculation, key, { fabricated: true }),
            );
          for (const key of [
            'liveRead',
            'phase',
            'scalar',
            'npConsumption',
            'event',
            'projection',
            'effectiveContribution',
            'damageInput',
            'calculatedResult',
          ] as const)
            add(`fabricated-${key}`, 'attemptStateMismatch', 'capacity.owner', (s) =>
              Reflect.set(s.rejection.capture!, key, { fabricated: true }),
            );
          add('fabricated-effects', 'attemptDownstreamLeak', 'downstream.effects', (s) =>
            Reflect.set(s.rejection.calculation, 'effects', [{ fabricated: true }]),
          );
          add('fabricated-contribution', 'attemptDownstreamLeak', 'downstream.contributions', (s) =>
            Reflect.set(s.rejection.calculation, 'effectiveContributions', {
              contributions: [{ fabricated: true }],
            }),
          );
          add(
            'fake-timeline-commit',
            'attemptCommitLeak',
            `${actionPath}.step.${positive.source.steps[actionIndex]!.length}.commit`,
            (s) =>
              s.steps[actionIndex]!.push({
                kind: 'commit',
                actionId: attempt(s).actionId,
                before: attempt(s).attempted!,
                after: attempt(s).attempted!,
              }),
          );
        }
        if (group === 'result') {
          add('wrong-native-status', 'attemptNativeMismatch', 'native.result', (s) =>
            Reflect.set(
              attempt(s).native!,
              'status',
              spec.failure === 'invalid' ? 'unsupported' : 'invalid',
            ),
          );
          add('wrong-native-reason', 'attemptNativeMismatch', 'native.result', (s) =>
            Reflect.set(attempt(s).native!, 'reason', 'other-native-reason'),
          );
          add('wrong-required-input', 'attemptRejectionMismatch', 'rejection.requiredInputs', (s) =>
            Reflect.set(s.rejection.capture!.rejection!, 'requiredInputs', [
              { key: 'other-input' },
            ]),
          );
          add('wrong-rejection-code', 'attemptRejectionMismatch', 'rejection.code', (s) =>
            Reflect.set(s.rejection.capture!.rejection!.rejection, 'code', 'other-code'),
          );
          add(
            'wrong-operation-id',
            'attemptRejectionMismatch',
            'rejection.operationId',
            (s) => (s.rejection.capture!.rejection!.rejection.operationId = 'other-operation'),
          );
          add('wrong-trace', 'attemptResultMismatch', 'result.trace', (s) =>
            Reflect.set(s.rejection.calculation.result, 'trace', []),
          );
          add('wrong-result-status', 'attemptResultMismatch', 'result.notCalculated', (s) =>
            Reflect.set(s.rejection.calculation.result, 'status', 'calculated'),
          );
          add('wrong-calculation-status', 'attemptResultMismatch', 'result.status', (s) =>
            Reflect.set(s.rejection.calculation, 'status', 'executable'),
          );
          add('wrong-result-reason', 'attemptResultMismatch', 'result.owner', (s) =>
            Reflect.set(s.rejection.calculation.result, 'reason', 'other-result-reason'),
          );
          add('wrong-prepared-reason', 'attemptResultMismatch', 'resolved.owner', (s) =>
            Reflect.set(s.rejection.prepared.resolved, 'reason', 'other-prepared-reason'),
          );
          add(
            'contradictory-reducer-input',
            'attemptRejectionMismatch',
            'rejection.requiredInputs',
            (s) => {
              Reflect.set(failed(s).result, 'requiredInput', { key: 'other-input' });
              Reflect.set(failed(s).result, 'requiredInputEffectOccurrenceId', 'other-occurrence');
            },
          );
          add('wrong-result-scenario', 'attemptResultMismatch', 'result.scenario', (s) =>
            Reflect.set(s.rejection.calculation, 'scenario', { mode: 'manual' }),
          );
        }
        const published = auditPublishedBattlePointCapacityPreparationAttempts(
          positive.master,
          [positive.selection],
          [positive.program],
          [positive.source],
        );
        const missingPublished = auditPublishedBattlePointCapacityPreparationAttempts(
          positive.master,
          [positive.selection],
          [],
          [],
        );
        if (group === 'missing-transport') {
          const missingDeclarations = auditPublishedBattlePointCapacityPreparationAttempts(
            { ...positive.master, servants: [] },
            [positive.selection],
            [positive.program],
            [positive.source],
          );
          negatives.push({
            name: 'missing-published-declaration',
            reason: 'attemptPopulationMismatch',
            path: 'capacity.published.population',
            gate: {
              ...missingDeclarations.gate,
              status: missingDeclarations.status,
              failures: missingDeclarations.failures,
              firstDifference: missingDeclarations.firstDifference,
            },
            proof: missingDeclarations,
          });
        }
        const payload = {
          spec,
          group,
          published,
          missingPublished,
          positive: {
            gate: positive.gate,
            proof: battlePointCapacityAttemptDiagnostic(positive.source),
            result: positive.result,
          },
          normal: { result: normal.result, calculation: normal.calculation },
          ranking: { gate: ranking.gate, result: ranking.result },
          negatives,
        };
        const diagnostic = encodeProductionAuditDiagnostic(payload);
        const roundTrip = isDeepStrictEqual(decodeProductionAuditDiagnostic(diagnostic), payload);
        const encoded = serializeProductionAuditArtifact(diagnostic);
        const savedRoundTrip = isDeepStrictEqual(
          decodeProductionAuditDiagnostic(
            decodeProductionAuditArtifact(encoded) as typeof diagnostic,
          ),
          payload,
        );
        const file = `tsk-08-bp-capacity-attempt-${spec.name}-${group}.json`;
        await writeProductionAuditArtifact(task.meta, file, {
          diagnosticVersion: 1,
          encoding: 'lossless-interned-values',
          negativeCount: negatives.length,
          roundTrip,
          savedRoundTrip,
          encoded: diagnostic,
        });
        const savedBytes = await readFile(resolve(process.env['FGO_TEST_ARTIFACT_DIR']!, file));
        const diskRoundTrip = isDeepStrictEqual(
          decodeProductionAuditDiagnostic(
            (decodeProductionAuditArtifact(savedBytes) as { encoded: typeof diagnostic }).encoded,
          ),
          payload,
        );
        expect(roundTrip).toBe(true);
        expect(savedRoundTrip).toBe(true);
        expect(diskRoundTrip).toBe(true);
        for (const n of negatives) {
          expect(n.gate.status, n.name).toBe('failed');
          const failure = n.gate.failures.find(
            (f) => f.reason === n.reason && f.checkPath === n.path,
          );
          expect(
            failure,
            `${n.name}:${JSON.stringify(n.gate.failures.map((f) => [f.reason, f.checkPath]))}`,
          ).toBeDefined();
          expect(failure?.firstDifference.identity).toBe(failure?.canonicalIdentity);
          expect(failure?.firstDifference.path.startsWith(n.path)).toBe(true);
        }
        expect(published.status).toBe('passed');
        expect(
          missingPublished.failures.some(
            (f) =>
              f.reason === 'attemptPopulationMismatch' &&
              f.checkPath === 'capacity.population.selections',
          ),
        ).toBe(true);
        expect(positive.gate.failures).toEqual([]);
        expect(ranking.gate.failures).toEqual([]);
        expect(positive.gate.boundaries[0]?.kind).toBe(spec.kind);
        expect(positive.result).toEqual(normal.result);
        expect(positive.result).toEqual(ranking.result);
        expect(positive.result).toEqual(positive.calculation.result);
        const observed = a.writes.flatMap((w) =>
          w.receipts.map((r) =>
            r.after.kind === 'present' ? [r.after.capacity, r.after.point] : [null, -1],
          ),
        );
        // Invalid trailing capacity writer has no receipt but retains its before/after.
        expect(observed).toEqual(
          spec.attempted.slice(0, spec.failure === 'invalid' ? -1 : undefined),
        );
        const retained = a.returned!.battlePoints.actors.attacker!.domains['810000']!;
        expect(
          retained.kind === 'present' ? [retained.capacity, retained.point] : [null, -1],
        ).toEqual(spec.retained);
        expect(a.returned!.battlePoints).toBe(
          failed(positive.source as Source).before.battlePoints,
        );
        expect(a.native?.status).toBe(spec.failure);
        expect(positive.result.status).toBe(
          spec.failure === 'inputRequired' ? 'inputRequired' : 'unsupported',
        );
      },
    );
