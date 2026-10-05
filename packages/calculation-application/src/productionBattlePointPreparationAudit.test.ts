import { preparationExecutionStateFor } from '@fgo-lab/battle-execution';
import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import {
  createDefaultResolvedScenario,
  prepareCalculationScenarioWithPolicy,
  evaluatePreparedCalculationScenario,
  requireExecutableCalculation,
} from './scenario';
import {
  battlePointPreparationProgram,
  battlePointPreparationSource,
  auditBattlePointPreparationObservations,
  battlePointPreparationCanonicalInventory,
  auditPublishedBattlePointPreparationObservations,
  type BattlePointPreparationSource,
  type BattlePointPreparationFailureReason,
} from './productionBattlePointPreparationAudit';
import {
  productionAuditTestOptions,
  writeProductionAuditArtifact,
} from './productionAuditArtifacts';

type Spec = {
  name: string;
  initial: number;
  groups: number[][];
  final: number;
  phase: number;
  consumed: number;
  permille?: boolean;
  maximum?: number;
};
const specs: Spec[] = [
  { name: 'gain', initial: 10, groups: [[45]], final: 55, phase: 5, consumed: 5 },
  { name: 'loss', initial: 80, groups: [[-30]], final: 50, phase: 5, consumed: 5 },
  {
    name: 'same-skill-lower-clamp',
    initial: 10,
    groups: [[70, -150, 55]],
    final: 55,
    phase: 5,
    consumed: 5,
  },
  {
    name: 'intervening-skill',
    initial: 10,
    groups: [[30], [], [15]],
    final: 55,
    phase: 5,
    consumed: 5,
  },
  {
    name: 'permille-capacity-np-clamp',
    initial: 180,
    groups: [[50, -80]],
    final: 120,
    phase: 5,
    consumed: 3,
    permille: true,
    maximum: 3,
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
  const capacity = spec.permille ? 200 : 100;
  const domain = {
    id: domainId,
    phaseScale: spec.permille ? ('permille' as const) : ('point' as const),
    phases: [
      { phase: 0, threshold: 0 },
      { phase: 2, threshold: spec.permille ? 250 : 20 },
      { phase: 5, threshold: spec.permille ? 500 : 50 },
      { phase: 8, threshold: spec.permille ? 800 : 80 },
    ],
    eligibility: [{ kind: 'actor' as const, actorId: servant.id }],
    capacity: { default: capacity, maximum: capacity, traitOverrides: [] },
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
        execution: amounts.length
          ? amounts.map((amount) => ({
              kind: 'resourceMutation',
              resource: 'battlePoint',
              direction: amount > 0 ? 'gain' : 'loss',
              unit: 'fixed',
              recipient: 'sourceSelf',
              amount: {
                kind: 'fixed',
                values: [Array.from({ length: 10 }, () => Math.abs(amount)), [], [], [], []],
              },
              subjectId: domainId,
            }))
          : [modifier],
      },
    ],
  }));
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
                    value: 5,
                  },
                },
                execution: [modifier],
              },
            ],
            damage: variant.damage.map((damage) => ({
              ...damage,
              kind: 'battlePointPhase',
              rawFunctionType: 'damageNpBattlePointPhase',
              maximumBattlePointPhase: spec.maximum ?? 10,
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

type Mutable<T> = T extends
  BattlePointPreparationSource['program'] | BattlePointPreparationSource['calculation']
  ? T
  : T extends ReadonlySet<infer U>
    ? Set<U>
    : T extends ReadonlyMap<infer K, infer V>
      ? Map<K, V>
      : T extends object
        ? { -readonly [K in keyof T]: Mutable<T[K]> }
        : T;
type Source = Mutable<BattlePointPreparationSource>;
type Negative = {
  name: string;
  group: string;
  reason: BattlePointPreparationFailureReason;
  path: string;
  mutate: (source: Source) => void;
};

describe('committed preparation domain battle point shared audit', () => {
  for (const spec of specs)
    it(
      `connects ${spec.name} with grouped fail-closed diagnostics`,
      productionAuditTestOptions([`tsk-08-preparation-battle-point-${spec.name}.json`]),
      async ({ task }) => {
        const positives: unknown[] = [];
        const negatives: {
          name: string;
          group: string;
          reason: BattlePointPreparationFailureReason;
          path: string;
          gate: ReturnType<typeof auditBattlePointPreparationObservations>;
          transport: unknown;
        }[] = [];
        const inventoryStatuses: string[] = [];
        const results: {
          gate: ReturnType<typeof auditBattlePointPreparationObservations>;
          parity: boolean;
          rankingParity: boolean;
          rankingGate: ReturnType<typeof auditBattlePointPreparationObservations>;
          point: number | undefined;
          phase: number | null | undefined;
          consumed: number | null | undefined;
          spec: Spec;
        }[] = [];
        const master = fixtureMaster(spec);
        const scenario = {
          ...createDefaultResolvedScenario(master, undefined),
          battleState: { battlePointPhase: null },
          initialBattlePointPoints: { '810000': spec.initial, '810001': 10 },
          preNoblePhantasmPlan: [
            ...master.servants[0]!.skills.map((skill) => ({
              kind: 'useSkillSlot' as const,
              slot: skill.slot,
              skillLevel: 10,
              choice: null,
            })),
            { kind: 'executeAttackNoblePhantasm' as const },
          ],
        };
        const versions = {
          schemaVersion: SCHEMA_VERSION,
          engineVersion: ENGINE_VERSION,
          masterDataVersion: master.version,
          appVersion: '0.1.0',
          gameRegion: 'JP',
          masterDataLocale: 'ja-JP',
        } as const;
        const prepared = prepareCalculationScenarioWithPolicy(
          scenario,
          master,
          { kind: 'calculator' },
          {},
          true,
        );
        const calculation = requireExecutableCalculation(
          evaluatePreparedCalculationScenario(prepared, versions),
        );
        const program = battlePointPreparationProgram(prepared, calculation);
        if (!program) throw new Error('canonical domain preparation program required');
        const source = battlePointPreparationSource(program);
        const gate = auditBattlePointPreparationObservations({
          expected: [program],
          observations: [source],
        });
        const ordinary = requireExecutableCalculation(
          evaluatePreparedCalculationScenario(
            prepareCalculationScenarioWithPolicy(scenario, master, { kind: 'calculator' }),
            versions,
          ),
        );
        const parity =
          JSON.stringify([
            ordinary.input,
            ordinary.result,
            ordinary.effects,
            ordinary.effectiveContributions,
          ]) ===
          JSON.stringify([
            calculation.input,
            calculation.result,
            calculation.effects,
            calculation.effectiveContributions,
          ]);
        const rankingPrepared = prepareCalculationScenarioWithPolicy(
          scenario,
          master,
          {
            kind: 'ranking',
            selfBuffs: 'included',
            conditionalEffects: 'satisfied',
            areaView: 'included',
          },
          {},
          true,
        );
        const ranking = requireExecutableCalculation(
          evaluatePreparedCalculationScenario(rankingPrepared, versions),
        );
        const rankingProgram = battlePointPreparationProgram(rankingPrepared, ranking);
        if (!rankingProgram)
          throw new Error('canonical ranking domain preparation program required');
        const rankingSource = battlePointPreparationSource(rankingProgram);
        const rankingGate = auditBattlePointPreparationObservations({
          expected: [rankingProgram],
          observations: [rankingSource],
        });
        const rankingParity =
          JSON.stringify([ranking.input, ranking.result]) ===
          JSON.stringify([calculation.input, calculation.result]);
        positives.push({
          name: `${spec.name}:ranking`,
          program: rankingProgram,
          source: rankingSource,
          gate: rankingGate,
          rankingParity,
        });
        const value =
          preparationExecutionStateFor(program.prepared.orderedScenario!)!.battlePoints!.actors.attacker!.domains['810000'];
        const target = source.observation!.targetExecution!;
        const consumed =
          target.selection === 'selected'
            ? target.candidateState?.scalarNpConsumptions[0]?.consumedValue
            : undefined;
        positives.push({ name: spec.name, program, source, gate, parity });
        results.push({
          gate,
          parity,
          rankingParity,
          rankingGate,
          point: value?.kind === 'present' ? value.point : undefined,
          phase: source.preparation?.conversion?.phase,
          consumed,
          spec,
        });
        const writer = program.expected.writers[0]!;
        const writerPath = `writer.${writer.actionIndex}.${writer.operationIndex}.0`;
        const cases: Negative[] = [];
        const add = (
          group: string,
          name: string,
          reason: BattlePointPreparationFailureReason,
          path: string,
          mutate: Negative['mutate'],
        ) => cases.push({ group, name, reason, path, mutate });
        const capture = (s: Source) => s.preparation!;
        const selected = (s: Source) => {
          const t = s.observation!.targetExecution!;
          if (t.selection !== 'selected') throw new Error('selected fixture');
          return t;
        };
        const receipt = (s: Source) =>
          capture(s).transitions[0]!.result.state.battlePoints.receipts[0]!;
        const np = (s: Source) => selected(s).candidateState!.scalarNpConsumptions[0]!;
        add('missing', 'preparation', 'domainTraceMissing', 'preparation.capture', (s) => {
          s.preparation = undefined;
        });
        add('missing', 'observation', 'domainTraceMissing', 'observation.present', (s) => {
          s.observation = undefined;
        });
        add('missing', 'state', 'domainTraceMissing', 'candidate.state', (s) => {
          delete selected(s).candidateState;
        });
        add('missing', 'command', 'domainSourceMismatch', 'preparation.commands', (s) => {
          capture(s).transitions.pop();
        });
        add('missing', 'action', 'domainCommitMismatch', 'preparation.actions', (s) => {
          s.program.prepared.orderedScenario!.appliedPreparationActions = [];
        });
        add('missing', 'receipt', 'domainPopulationMismatch', 'action.0.receipts', (s) => {
          capture(s).transitions[0]!.result.state.battlePoints.receipts = [];
        });
        add('missing', 'conversion', 'domainTraceMissing', 'conversion.present', (s) => {
          delete capture(s).conversion;
        });
        add('missing', 'domain', 'domainSourceMismatch', 'conversion.domain', (s) => {
          capture(s).conversion!.domain = undefined;
        });
        add('missing', 'reader', 'domainPopulationMismatch', 'terminal.readPopulation', (s) => {
          selected(s).candidateState!.battlePointPhaseReads = [];
        });
        add('missing', 'np', 'domainPopulationMismatch', 'np.population', (s) => {
          selected(s).candidateState!.scalarNpConsumptions = [];
        });
        add('missing', 'use', 'domainPopulationMismatch', 'use.population', (s) => {
          s.readerUses = [];
        });
        add('missing', 'expected-writer', 'domainSourceMismatch', 'canonical.contract', (s) => {
          s.program.expected.writers = [];
        });
        add('missing', 'expected-reader', 'domainSourceMismatch', 'canonical.contract', (s) => {
          s.program.expected.readers = [];
        });
        add('missing', 'expected-np', 'domainSourceMismatch', 'canonical.contract', (s) => {
          s.program.expected.nps = [];
        });
        for (const key of ['identity', 'actor', 'domainId'] as const)
          add(
            'identity-order',
            `receipt-${key}`,
            'domainIdentityMismatch',
            `${writerPath}.identity`,
            (s) => {
              receipt(s)[key] = 'wrong';
            },
          );
        add(
          'identity-order',
          'duplicate-receipt',
          'domainPopulationMismatch',
          'action.0.receipts',
          (s) => {
            capture(s).transitions[0]!.result.state.battlePoints.receipts.push(receipt(s));
          },
        );
        add('identity-order', 'action-index', 'domainOrderMismatch', 'action.0.index', (s) => {
          capture(s).transitions[0]!.before.appliedActionCount++;
        });
        add('identity-order', 'candidate-index', 'domainUseMismatch', 'owner.observation', (s) => {
          selected(s).candidateIndex++;
        });
        add('identity-order', 'reader-actor', 'domainIdentityMismatch', 'read.0.actor', (s) => {
          selected(s).candidateState!.battlePointPhaseReads[0]!.actor = 'target';
        });
        for (const key of ['operationId', 'operationSequence'] as const)
          add('identity-order', `np-${key}`, 'domainPopulationMismatch', 'np.population', (s) => {
            if (key === 'operationId') np(s).operationId = 'wrong';
            else np(s).operationSequence++;
          });
        for (const key of ['operationId', 'operationSequence', 'subjectId'] as const)
          add(
            'identity-order',
            `read-${key}`,
            'domainPopulationMismatch',
            'terminal.readPopulation',
            (s) => {
              const r = selected(s).candidateState!.battlePointPhaseReads[0]!;
              if (key === 'operationSequence') r.operationSequence++;
              else r[key] = 'wrong';
            },
          );
        add(
          'identity-order',
          'conversion-reference',
          'domainIdentityMismatch',
          'conversion.references',
          (s) => {
            capture(s).conversion!.input = { ...capture(s).conversion!.input };
          },
        );
        add(
          'value-continuity',
          'unchanged-receipt',
          'domainValueMismatch',
          `${writerPath}.changed`,
          (s) => {
            receipt(s).after = receipt(s).before;
          },
        );
        add(
          'value-continuity',
          'stale-before',
          'domainOrderMismatch',
          `${writerPath}.before`,
          (s) => {
            const r = receipt(s);
            r.before = { kind: 'present', point: 99, capacity: 100, capacityModifiers: [] };
          },
        );
        for (const key of ['point', 'phase'] as const)
          add(
            'value-continuity',
            `read-${key}`,
            'domainValueMismatch',
            'read.0.pointPhase',
            (s) => {
              selected(s).candidateState!.battlePointPhaseReads[0]![key] = 0;
            },
          );
        add('value-continuity', 'np-initial', 'domainValueMismatch', 'np.0.raw', (s) => {
          np(s).value = 0;
        });
        add('value-continuity', 'np-consumed', 'domainValueMismatch', 'np.0.consumed', (s) => {
          np(s).consumedValue = 0;
        });
        add('value-continuity', 'coherent-np-input', 'domainValueMismatch', 'np.0.raw', (s) => {
          np(s).value = 0;
          np(s).input.battlePointPhase = 0;
          s.input.battlePointPhase = 0;
        });
        add(
          'value-continuity',
          'coherent-read-conversion',
          'domainUseMismatch',
          'owner.preparation',
          (s) => {
            capture(s).conversion!.phase = 0;
            capture(s).conversion!.input.battlePointPhase = 0;
            selected(s).candidateState!.battlePointPhaseReads[0]!.phase = 0;
            np(s).value = 0;
          },
        );
        for (const key of ['events', 'projections', 'contributions'] as const)
          add('use-contradiction', `use-${key}`, 'domainUseMismatch', 'use.0.evidence', (s) => {
            s.readerUses[0]![key] = [];
          });
        add('use-contradiction', 'input', 'domainUseMismatch', 'owner.input', (s) => {
          s.input.attackBuff++;
        });
        add('use-contradiction', 'projection', 'domainUseMismatch', 'owner.effects', (s) => {
          s.effects = [];
        });
        add(
          'use-contradiction',
          'contribution',
          'domainUseMismatch',
          'owner.contributions',
          (s) => {
            s.contributions.contributions = [];
          },
        );
        add(
          'forged-commit-outcome',
          'executed-effects',
          'domainCommitMismatch',
          `${writerPath}.executed`,
          (s) => {
            capture(s).transitions[0]!.result.state.battlePoints.executedEffects = [];
          },
        );
        add(
          'forged-commit-outcome',
          'read-evaluation',
          'domainUseMismatch',
          'read.0.evaluation',
          (s) => {
            selected(s).candidateState!.battlePointPhaseReads[0]!.evaluated = false;
          },
        );
        add(
          'forged-commit-outcome',
          'np-disposition',
          'domainUseMismatch',
          'np.0.disposition',
          (s) => {
            np(s).disposition = 'excluded';
          },
        );
        add('forged-commit-outcome', 'result', 'domainOutcomeMismatch', 'result.status', (s) => {
          s.result = { status: 'unsupported', missingEvidence: ['fixture'] } as Source['result'];
        });
        add('missing', 'expected-command', 'domainSourceMismatch', 'canonical.contract', (s) => {
          s.program.expected.actions = [];
        });
        add(
          'missing',
          'expected-natural-reader',
          'domainSourceMismatch',
          'canonical.contract',
          (s) => {
            s.program.expected.naturalReaders = [];
          },
        );
        add(
          'missing',
          'source-retained-proof',
          'domainCommitMismatch',
          `${writerPath}.retained`,
          (s) => {
            s.program.prepared.orderedScenario!.retainedProjections = [];
          },
        );
        add('missing', 'canonical-state', 'domainTraceMissing', 'preparation.state', (s) => {
          Reflect.deleteProperty(preparationExecutionStateFor(s.program.prepared.orderedScenario!)!, 'battlePoints');
        });
        add('identity-order', 'source-action', 'domainSourceMismatch', 'action.0.source', (s) => {
          capture(s).transitions[0]!.result.state.appliedActions[0]!.sourceId = 'wrong';
        });
        add('identity-order', 'source-effect', 'domainSourceMismatch', 'action.0.effects', (s) => {
          capture(s).transitions[0]!.result.state.appliedActions[0]!.selectedEffects = [];
        });
        for (const [name, position] of [
          ['action', 0],
          ['source-instance', 1],
          ['occurrence', 2],
          ['operation-index', 3],
        ] as const)
          add(
            'identity-order',
            `receipt-${name}`,
            'domainIdentityMismatch',
            `${writerPath}.identity`,
            (s) => {
              const parts = JSON.parse(receipt(s).identity) as unknown[];
              parts[position] = 'wrong';
              receipt(s).identity = JSON.stringify(parts);
            },
          );
        add('identity-order', 'transaction', 'domainIdentityMismatch', 'execution.groups', (s) => {
          selected(s).candidateState!.executionGroups[0]!.transactionIdentity.sourceInstanceId =
            'wrong';
        });
        add('identity-order', 'reader-group', 'domainIdentityMismatch', 'read.0.group', (s) => {
          selected(s).candidateState!.battlePointPhaseReads[0]!.operationGroupIndex++;
        });
        add('identity-order', 'np-group', 'domainIdentityMismatch', 'np.0.group', (s) => {
          np(s).operationGroupIndex++;
        });
        add('identity-order', 'np-source', 'domainSourceMismatch', 'canonical.contract', (s) => {
          s.program.expected.nps[0]!.operation.source.sourceInstanceId = 'wrong';
        });
        add(
          'identity-order',
          'conversion-actor',
          'domainValueMismatch',
          'conversion.value',
          (s) => {
            capture(s).conversion!.value = {
              kind: 'present',
              point: 99,
              capacity: 100,
              capacityModifiers: [],
            };
          },
        );
        add(
          'identity-order',
          'double-application',
          'domainCommitMismatch',
          `${writerPath}.doubleApplication`,
          (s) => {
            const w = s.program.expected.writers[0]!;
            const operation = {
              ...s.program.expected.operations[0]!,
              kind: 'resourceMutation',
              resource: 'battlePoint',
              direction: 'gain',
              resolution: 'noDamageReader',
              unit: 'fixed',
              amount: 1,
              subjectId: w.domainId,
              source: {
                ...s.program.expected.operations[0]!.source,
                origin: 'attacker',
                sourceInstanceId: w.sourceInstanceId,
                skillId: w.skillId,
                effectOccurrenceId: w.effect.occurrenceId,
              },
            };
            s.program.expected.operations = [
              ...s.program.expected.operations,
              operation,
            ] as unknown as Source['program']['expected']['operations'];
          },
        );
        add(
          'value-continuity',
          'live-state-stale',
          'domainValueMismatch',
          'action.0.live.["attacker","810000"]',
          (s) => {
            capture(s).transitions[0]!.result.state.battlePoints.actors.attacker!.domains[
              '810000'
            ] = { kind: 'present', point: 0, capacity: 100, capacityModifiers: [] };
          },
        );
        add(
          'value-continuity',
          'wrong-domain-phase',
          'domainValueMismatch',
          'conversion.scalar',
          (s) => {
            capture(s).conversion!.phase = 2;
          },
        );
        add(
          'value-continuity',
          'wrong-domain-consumption',
          'domainValueMismatch',
          'np.0.raw',
          (s) => {
            np(s).value = 2;
          },
        );
        add(
          'value-continuity',
          'coherent-receipt-state',
          'domainUseMismatch',
          'owner.preparation',
          (s) => {
            const t = capture(s).transitions[0]!;
            const last = t.result.state.battlePoints.receipts.at(-1)!;
            const forged = {
              kind: 'present' as const,
              point: 99,
              capacity: 100,
              capacityModifiers: [],
            };
            last.after = forged;
            t.result.state.battlePoints.actors.attacker!.domains['810000'] = forged;
            capture(s).conversion!.value = forged;
          },
        );
        add('use-contradiction', 'event-binding', 'domainUseMismatch', 'use.0.binding', (s) => {
          selected(s).operationEvents.find(
            (event) => event.operationId === s.readerUses[0]!.operationId,
          )!.projectionKey = 'wrong';
        });
        add(
          'use-contradiction',
          'projection-binding',
          'domainUseMismatch',
          'use.0.binding',
          (s) => {
            s.effects.find(
              (projection) => projection.operationId === s.readerUses[0]!.operationId,
            )!.outcome = 'notRelevant';
          },
        );
        add(
          'use-contradiction',
          'effective-contribution',
          'domainUseMismatch',
          'use.0.contributionEffective',
          (s) => {
            s.contributions.contributions.find(
              (item) => item.operationId === s.readerUses[0]!.operationId,
            )!.effective = false;
          },
        );
        add(
          'use-contradiction',
          'contribution-source',
          'domainIdentityMismatch',
          'use.0.contributionSources',
          (s) => {
            s.contributions.contributions.find(
              (item) => item.operationId === s.readerUses[0]!.operationId,
            )!.source.sourceInstanceId = 'wrong';
          },
        );
        add(
          'use-contradiction',
          'writer-as-contribution',
          'domainUseMismatch',
          `${writerPath}.damageContribution`,
          (s) => {
            s.contributions.contributions.push({
              ...s.contributions.contributions[0]!,
              operationId: s.program.prepared.orderedScenario!.retainedProjections[0]!.operationId,
            });
          },
        );
        add(
          'forged-commit-outcome',
          'execution-rollback',
          'domainCommitMismatch',
          'execution.commits',
          (s) => {
            selected(s).candidateState!.executionGroups[0]!.outcome = 'rolledBack';
          },
        );
        add(
          'forged-commit-outcome',
          'rejected-preparation',
          'domainCommitMismatch',
          'action.0.status',
          (s) => {
            capture(s).transitions[0]!.result.status = 'rejected';
          },
        );
        add(
          'forged-commit-outcome',
          'np-unsupported',
          'domainUseMismatch',
          'np.0.evaluation',
          (s) => {
            np(s).evaluation = { status: 'unsupported', missingEvidence: 'fixture' };
          },
        );
        if (spec.groups[0]!.length > 1) {
          add(
            'identity-order',
            'receipt-reversal',
            'domainPopulationMismatch',
            'action.0.receipts',
            (s) => {
              capture(s).transitions[0]!.result.state.battlePoints.receipts.reverse();
            },
          );
          add(
            'value-continuity',
            'intermediate-read',
            'domainValueMismatch',
            'read.0.pointPhase',
            (s) => {
              const after = receipt(s).after;
              selected(s).candidateState!.battlePointPhaseReads[0]!.point =
                after.kind === 'present' ? after.point : null;
            },
          );
        }
        if (spec.groups.length > 1) {
          add(
            'identity-order',
            'skill-order',
            'domainSourceMismatch',
            'preparation.commands',
            (s) => {
              capture(s).transitions.reverse();
            },
          );
          add(
            'value-continuity',
            'intermediate-before',
            'domainOrderMismatch',
            'writer.2.0.0.before',
            (s) => {
              capture(s).transitions[2]!.result.state.battlePoints.receipts.at(-1)!.before =
                capture(s).transitions[0]!.before.battlePoints.actors.attacker!.domains['810000']!;
            },
          );
        }
        add(
          'value-continuity',
          'unwritten-domain',
          'domainValueMismatch',
          'action.0.unwritten.["attacker","810001"]',
          (s) => {
            capture(s).transitions[0]!.result.state.battlePoints.actors.attacker!.domains[
              '810001'
            ] = { kind: 'present', point: 0, capacity: 100, capacityModifiers: [] };
          },
        );
        add('missing', 'canonical-inputs', 'domainSourceMismatch', 'canonical.owner', (s) => {
          s.program.prepared.canonicalInputs = null;
        });
        add(
          'identity-order',
          'wrong-preparation-actor',
          'domainIdentityMismatch',
          'preparation.actor',
          (s) => {
            preparationExecutionStateFor(s.program.prepared.orderedScenario!)!.battlePoints = {
              ...preparationExecutionStateFor(s.program.prepared.orderedScenario!)!.battlePoints!,
              actors: {
                ...preparationExecutionStateFor(s.program.prepared.orderedScenario!)!.battlePoints!.actors,
                attacker: {
                  ...preparationExecutionStateFor(s.program.prepared.orderedScenario!)!.battlePoints!.actors.attacker!,
                  actorId: 'wrong',
                },
              },
            };
          },
        );
        add(
          'identity-order',
          'fabricated-np-reader',
          'domainPopulationMismatch',
          'canonical.npPopulation',
          (s) => {
            s.program.expected.nps.push({
              ...s.program.expected.nps[0]!,
              operation: { ...s.program.expected.nps[0]!.operation, operationId: 'fabricated' },
            });
          },
        );
        add(
          'value-continuity',
          'other-legal-domain-transport',
          'domainIdentityMismatch',
          'conversion.parameterDomain',
          (s) => {
            const conversion = capture(s).conversion!;
            conversion.domain = s.program.prepared.master.battlePointDomains[1];
            conversion.value = conversion.state.actors.attacker!.domains['810001'];
            conversion.phase = 0;
            conversion.input.battlePointPhase = 0;
            const read = selected(s).candidateState!.battlePointPhaseReads[0]!;
            read.subjectId = '810001';
            read.point = 10;
            read.phase = 0;
            np(s).value = 0;
            np(s).input.battlePointPhase = 0;
          },
        );
        add(
          'value-continuity',
          'unchanged-reordered-receipt',
          'domainValueMismatch',
          `${writerPath}.changed`,
          (s) => {
            const r = receipt(s);
            r.after = Object.fromEntries(Object.entries(r.before).reverse()) as typeof r.before;
          },
        );
        for (const negative of cases) {
          // Clone transport and mutable owner inputs, while retaining canonical snapshots and
          // original reference baselines. Each mutation is independent of all other cases.
          const changed = {
            ...structuredClone({ ...source, program: undefined, calculation: undefined }),
            calculation: source.calculation,
            program: {
              ...program,
              expected: structuredClone(program.expected),
              prepared: {
                ...program.prepared,
                orderedScenario: { ...program.prepared.orderedScenario! },
              },
            },
          } as unknown as Source;
          negative.mutate(changed);
          const changedProof: unknown = { expected: [changed.program], observations: [changed] };
          const failed: ReturnType<typeof auditBattlePointPreparationObservations> =
            auditBattlePointPreparationObservations(
              changedProof as Parameters<typeof auditBattlePointPreparationObservations>[0],
            );
          negatives.push({
            name: `${spec.name}:${negative.name}`,
            group: negative.group,
            reason: negative.reason,
            path: negative.path,
            gate: failed,
            transport: changed,
          });
        }
        for (const population of [
          {
            name: 'missing-source',
            expected: [program],
            observations: [],
            path: 'source.present',
            reason: 'domainSourceMismatch' as const,
          },
          {
            name: 'missing-expectation',
            expected: [],
            observations: [source],
            path: 'population',
            reason: 'domainPopulationMismatch' as const,
          },
          {
            name: 'duplicate-source',
            expected: [program],
            observations: [source, source],
            path: 'population',
            reason: 'domainPopulationMismatch' as const,
          },
          {
            name: 'duplicate-expectation',
            expected: [program, program],
            observations: [source, source],
            path: 'population.unique',
            reason: 'domainPopulationMismatch' as const,
          },
        ]) {
          negatives.push({
            name: `${spec.name}:${population.name}`,
            group: 'missing',
            path: population.path,
            reason: population.reason,
            gate: auditBattlePointPreparationObservations(population),
            transport: population,
          });
        }
        const inputKeys = Object.keys(source.input) as (keyof typeof source.input)[];
        const inputEntries = inputKeys.map((key) => [key, source.input[key]] as const).reverse();
        for (const key of inputKeys) Reflect.deleteProperty(source.input, key);
        for (const [key, value] of inputEntries) Reflect.set(source.input, key, value);
        const reorderedGate = auditBattlePointPreparationObservations({
          expected: [program],
          observations: [source],
        });
        positives.push({ name: `${spec.name}:canonical-key-order`, gate: reorderedGate, source });
        inventoryStatuses.push(reorderedGate.status);
        const inventory = battlePointPreparationCanonicalInventory(master);
        const published = auditPublishedBattlePointPreparationObservations(
          inventory,
          [program],
          [source],
        );
        positives.push({ name: `${spec.name}:independent-inventory`, published });
        inventoryStatuses.push(published.status);
        const missingPublished = auditPublishedBattlePointPreparationObservations(
          inventory,
          [],
          [],
        );
        negatives.push({
          name: `${spec.name}:published-missing-program`,
          group: 'missing',
          reason: 'domainPopulationMismatch',
          path: 'published.population',
          gate: {
            ...missingPublished.gate,
            failures: [...missingPublished.failures],
            status: missingPublished.status,
            firstDifference: missingPublished.firstDifference,
          },
          transport: missingPublished,
        });
        await writeProductionAuditArtifact(
          task.meta,
          `tsk-08-preparation-battle-point-${spec.name}.json`,
          {
            canonicalIdentity: 'tsk-08:preparation-battle-point',
            positives,
            negatives,
          },
        );
        for (const status of inventoryStatuses) expect(status).toBe('passed');
        for (const result of results) {
          expect(
            result.gate.status,
            JSON.stringify(
              result.gate.failures.slice(0, 8).map(({ reason, checkPath }) => [reason, checkPath]),
            ),
          ).toBe('passed');
          expect(result.parity).toBe(true);
          expect(result.rankingParity).toBe(true);
          expect(
            result.rankingGate.status,
            JSON.stringify(
              result.rankingGate.failures.map(({ reason, checkPath }) => [reason, checkPath]),
            ),
          ).toBe('passed');
          expect([result.point, result.phase, result.consumed]).toEqual([
            result.spec.final,
            result.spec.phase,
            result.spec.consumed,
          ]);
        }
        for (const negative of negatives) {
          expect(negative.gate.status, negative.name).toBe('failed');
          const failure = negative.gate.failures.find(
            ({ reason, checkPath }) => reason === negative.reason && checkPath === negative.path,
          );
          expect(
            failure,
            `${negative.name}:${JSON.stringify(negative.gate.failures.map(({ reason, checkPath }) => [reason, checkPath]))}`,
          ).toBeDefined();
          expect(failure?.firstDifference.identity).toBe(failure?.canonicalIdentity);
          expect(failure?.firstDifference.path.startsWith(negative.path)).toBe(true);
        }
      },
    );
});
