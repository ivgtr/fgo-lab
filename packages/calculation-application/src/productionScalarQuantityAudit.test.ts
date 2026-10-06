import { describe, expect, it } from 'vitest';
import { fixtureMaster, type Spec } from './scalarQuantityAudit.test-support';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import {
  createDefaultResolvedScenario,
  prepareCalculationScenarioWithPolicy,
  evaluatePreparedCalculationScenario,
  requireExecutableCalculation,
} from './scenario';
import {
  scalarQuantitySnapshot,
  scalarQuantityProgram,
  scalarQuantitySource,
  auditScalarQuantityObservations,
  type ScalarQuantitySource,
  type ScalarQuantityFailureReason,
  type ScalarQuantityGate,
  type ScalarQuantityBoundary,
} from './productionScalarQuantityAudit';
import {
  productionAuditTestOptions,
  writeProductionAuditArtifact,
} from './productionAuditArtifacts';

const specs: Spec[] = [
  { name: 'changed', initial: 2, amounts: [3], final: 5, consumed: 5 },
  { name: 'same-group', initial: 2, amounts: [3, -1], final: 4, consumed: 4, sameGroup: true },
  { name: 'separate-groups', initial: 2, amounts: [3, -1], final: 4, consumed: 4 },
  { name: 'upper-clamp', initial: 8, amounts: [30], final: 10, consumed: 10 },
  { name: 'lower-clamp', initial: 2, amounts: [-20], final: 0, consumed: 0 },
  { name: 'np-clamp', initial: 2, amounts: [7], final: 9, consumed: 4, maximum: 4 },
  {
    name: 'represented',
    initial: 2,
    amounts: [3],
    final: 2,
    consumed: 2,
    boundary: 'notRelevant',
    timing: 'representedByCurrentInput',
  },
  {
    name: 'wrong-subject',
    initial: 2,
    amounts: [3],
    final: 2,
    consumed: 2,
    boundary: 'notRelevant',
    wrongSubject: true,
  },
  {
    name: 'wrong-target',
    initial: 2,
    amounts: [3],
    final: 2,
    consumed: 2,
    boundary: 'notRelevant',
    wrongTarget: true,
  },
  {
    name: 'unrelated-damage',
    initial: 2,
    amounts: [3],
    final: 2,
    consumed: 2,
    boundary: 'notRelevant',
    standard: true,
  },
  { name: 'null-scalar', initial: 0, amounts: [3], final: 0, consumed: 0, boundary: 'nullScalar' },
];

describe('committed scalar quantity NP shared audit', () => {
  it(
    'connects canonical writes, ordered actual consumption and use with mechanism-specific fail-closed diagnostics',
    productionAuditTestOptions(['tsk-08-scalar-quantity-np-consumption.json']),
    async ({ task }) => {
      type Mutable<T> = T extends
        ScalarQuantitySource['program'] | ScalarQuantitySource['calculation']
        ? T
        : T extends ReadonlySet<infer U>
          ? Set<U>
          : T extends ReadonlyMap<infer K, infer V>
            ? Map<K, V>
            : T extends object
              ? { -readonly [K in keyof T]: Mutable<T[K]> }
              : T;
      const positives: {
        name: string;
        gate: ScalarQuantityGate;
        program: unknown;
        source: unknown;
        parity: boolean;
        final: number | null;
        consumed: number | null;
        expected: number;
        expectedConsumed: number;
        boundary: ScalarQuantityBoundary;
      }[] = [];
      const negatives: {
        name: string;
        reason: ScalarQuantityFailureReason;
        path: string;
        gate: ScalarQuantityGate;
        transport?: unknown;
      }[] = [];
      for (const spec of specs) {
        const master = fixtureMaster(spec);
        const scenario = {
          ...createDefaultResolvedScenario(master, undefined),
          battleState: { battlePointPhase: null },
          initialBattlePointPoints:
            spec.boundary === 'nullScalar'
              ? {}
              : { [master.battlePointDomains[0]!.id]: spec.initial },
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
        const program = scalarQuantityProgram(prepared, calculation, spec.boundary);
        if (!program) throw new Error('schema-legal scalar program required');
        const source = scalarQuantitySource(program);
        const gateInput = { expected: [program], observations: [source] };
        const gate = auditScalarQuantityObservations(gateInput);
        const ordinaryPrepared = prepareCalculationScenarioWithPolicy(scenario, master, {
          kind: 'calculator',
        });
        const ordinary = requireExecutableCalculation(
          evaluatePreparedCalculationScenario(ordinaryPrepared, versions),
        );
        const target = source.observation?.targetExecution;
        const state = target?.selection === 'selected' ? target.candidateState : undefined;
        const read = state?.scalarNpConsumptions[0];
        positives.push({
          name: spec.name,
          gate,
          program,
          source,
          parity:
            JSON.stringify({
              input: calculation.input,
              result: calculation.result,
              effects: calculation.effects,
              contributions: [...calculation.effectiveContributions.contributions],
            }) ===
            JSON.stringify({
              input: ordinary.input,
              result: ordinary.result,
              effects: ordinary.effects,
              contributions: [...ordinary.effectiveContributions.contributions],
            }),
          final: read?.value ?? null,
          consumed: read?.consumedValue ?? null,
          expected: spec.final,
          expectedConsumed: spec.consumed,
          boundary: program.boundary,
        });
        if (program.boundary !== 'committed') continue;
        const add = (
          name: string,
          reason: ScalarQuantityFailureReason,
          path: string,
          change: (source: Mutable<ScalarQuantitySource>) => void,
        ) => {
          // Corrupt transport stays detached from the immutable original execution/program.
          const altered = structuredClone(source) as Mutable<ScalarQuantitySource>;
          altered.program = program;
          change(altered);
          negatives.push({
            name: `${spec.name}:${name}`,
            reason,
            path,
            gate: auditScalarQuantityObservations({ expected: [program], observations: [altered] }),
            // Canonical program/calculation context is saved once in the representative.
            // Every changed observational value and reference-check result remains lossless.
            transport: {
              canonicalContext: spec.name,
              calculationStatus: altered.calculation.status,
              observation: altered.observation,
              input: altered.input,
              effects: altered.effects,
              effectiveContributions: altered.effectiveContributions,
              result: altered.result,
              readerUses: altered.readerUses,
            },
          });
        };
        const selected = (source: Mutable<ScalarQuantitySource>) => {
          const target = source.observation!.targetExecution;
          if (target?.selection !== 'selected') throw new Error('selected fixture required');
          return target;
        };
        const scalarState = (source: Mutable<ScalarQuantitySource>) =>
          selected(source).candidateState!;
        const firstWriter = program.writers[0]!;
        const firstReader = program.readers[0]!;
        const mutation = (source: Mutable<ScalarQuantitySource>) =>
          scalarState(source).executionGroups[firstWriter.operationGroupIndex]!.mutations[0]!;
        const consumption = (source: Mutable<ScalarQuantitySource>) =>
          scalarState(source).scalarNpConsumptions[0]!;
        add('missing-trace', 'scalarTraceMissing', 'target.selection', (s) => {
          s.observation = undefined;
        });
        add('missing-state', 'scalarTraceMissing', 'state.present', (s) => {
          delete selected(s).candidateState;
        });
        add('missing-groups', 'scalarTraceMissing', 'trace.shape', (s) => {
          delete (scalarState(s) as Partial<Mutable<NonNullable<typeof state>>>).executionGroups;
        });
        add('missing-readers', 'scalarTraceMissing', 'trace.shape', (s) => {
          delete (scalarState(s) as Partial<Mutable<NonNullable<typeof state>>>)
            .scalarNpConsumptions;
        });
        add('wrong-candidate', 'scalarIdentityMismatch', 'candidate.identity', (s) => {
          selected(s).candidateIndex = 100;
        });
        add('missing-group', 'scalarIdentityMismatch', 'groups.identity', (s) => {
          scalarState(s).executionGroups.splice(firstWriter.operationGroupIndex, 1);
        });
        add(
          'missing-mutation',
          'scalarTraceMissing',
          `writer.${firstWriter.operationSequence}.mutation.count`,
          (s) => {
            scalarState(s).executionGroups[firstWriter.operationGroupIndex]!.mutations = [];
          },
        );
        add(
          'duplicate-mutation',
          'scalarTraceMissing',
          `writer.${firstWriter.operationSequence}.mutation.count`,
          (s) => {
            scalarState(s).executionGroups[firstWriter.operationGroupIndex]!.mutations.push(
              mutation(s),
            );
          },
        );
        add(
          'wrong-writer-sequence',
          'scalarIdentityMismatch',
          `writer.${firstWriter.operationSequence}.identity`,
          (s) => {
            mutation(s).operationSequence++;
          },
        );
        add(
          'wrong-writer-address',
          'scalarIdentityMismatch',
          `writer.${firstWriter.operationSequence}.identity`,
          (s) => {
            mutation(s).stateAddress = 'battle:criticalStars';
          },
        );
        add(
          'wrong-writer-kind',
          'scalarIdentityMismatch',
          `writer.${firstWriter.operationSequence}.identity`,
          (s) => {
            mutation(s).operationKind = 'resourceMutation';
          },
        );
        add(
          'stale-before',
          'scalarValueMismatch',
          `writer.${firstWriter.operationSequence}.before`,
          (s) => {
            mutation(s).before = -1;
          },
        );
        add(
          'uncommitted-value',
          'scalarCommitMismatch',
          `writer.${firstWriter.operationSequence}.after`,
          (s) => {
            mutation(s).afterTransaction = mutation(s).before;
          },
        );
        add(
          'forged-rollback',
          'scalarCommitMismatch',
          `writer.${firstWriter.operationSequence}.commit`,
          (s) => {
            scalarState(s).executionGroups[firstWriter.operationGroupIndex]!.outcome = 'rolledBack';
          },
        );
        add(
          'forged-proof',
          'scalarCommitMismatch',
          `writer.${firstWriter.operationSequence}.commit`,
          (s) => {
            scalarState(s).executionGroups[firstWriter.operationGroupIndex]!.rollbackProof = {
              battleStateRestored: true,
              damageInputRestored: true,
            };
          },
        );
        add('wrong-group-source', 'scalarIdentityMismatch', 'groups.identity', (s) => {
          scalarState(s).executionGroups[
            firstWriter.operationGroupIndex
          ]!.transactionIdentity.sourceInstanceId = 'wrong';
        });
        add('event-order', 'scalarOrderMismatch', 'events.order', (s) => {
          selected(s).operationEvents.reverse();
        });
        add('missing-reader', 'scalarIdentityMismatch', 'readers.identity', (s) => {
          scalarState(s).scalarNpConsumptions = [];
        });
        add('duplicate-reader', 'scalarIdentityMismatch', 'readers.identity', (s) => {
          scalarState(s).scalarNpConsumptions.push(consumption(s));
        });
        for (const field of ['operationSequence', 'operationGroupIndex'] as const)
          add(`wrong-reader-${field}`, 'scalarIdentityMismatch', 'readers.identity', (s) => {
            consumption(s)[field]++;
          });
        add('wrong-reader-operation', 'scalarIdentityMismatch', 'readers.identity', (s) => {
          consumption(s).operationId = firstWriter.operationId;
        });
        add('wrong-reader-address', 'scalarIdentityMismatch', 'readers.identity', (s) => {
          Object.assign(consumption(s), { stateAddress: 'battle:criticalStars' });
        });
        add(
          'stale-consumption',
          'scalarValueMismatch',
          `reader.${firstReader.operationSequence}.value`,
          (s) => {
            consumption(s).value = program.initialValue;
          },
        );
        add(
          'forged-exclusion',
          'scalarOutcomeMismatch',
          `reader.${firstReader.operationSequence}.disposition`,
          (s) => {
            consumption(s).disposition = 'excluded';
          },
        );
        add(
          'forged-evaluation',
          'scalarOutcomeMismatch',
          `reader.${firstReader.operationSequence}.evaluation`,
          (s) => {
            consumption(s).evaluation = { status: 'unsupported', missingEvidence: 'forged' };
          },
        );
        add('missing-use', 'scalarUseMismatch', 'use.identity', (s) => {
          s.readerUses = [];
        });
        for (const field of ['events', 'projections', 'contributions'] as const)
          add(`missing-use-${field}`, 'scalarUseMismatch', `use.0.${field}`, (s) => {
            s.readerUses[0]![field] = [];
          });
        add('wrong-use-reader', 'scalarUseMismatch', 'use.identity', (s) => {
          s.readerUses[0]!.operationId = firstWriter.operationId;
        });
        add('wrong-use-reference', 'scalarSourceMismatch', 'use.0.references', (s) => {
          s.readerUses[0]!.consumption = undefined;
        });
        add('missing-contributions', 'scalarUseMismatch', 'use.0.components', (s) => {
          s.effectiveContributions.contributions = [];
        });
        add('ineffective-contribution', 'scalarUseMismatch', 'use.0.effective', (s) => {
          s.effectiveContributions.contributions.find(
            (c) => c.operationId === firstReader.operationId,
          )!.effective = false;
        });
        add('wrong-input', 'scalarUseMismatch', 'owner.input', (s) => {
          s.input.npSpecialMultipliers[0] += 1;
        });
        add('wrong-result', 'scalarOutcomeMismatch', 'result.status', (s) => {
          Object.assign(s.result, { status: 'unsupported' });
        });
        add('wrong-result-rows', 'scalarOutcomeMismatch', 'owner.result', (s) => {
          if ('rows' in s.result) s.result.rows = [];
        });
        add('wrong-source-reference', 'scalarSourceMismatch', 'source.references', (s) => {
          s.calculation = structuredClone(s.calculation);
        });
        add(
          'wrong-consumed-clamp',
          'scalarValueMismatch',
          `reader.${firstReader.operationSequence}.receipt`,
          (s) => {
            consumption(s).consumedValue = -1;
          },
        );
        add(
          'detached-input-value',
          'scalarUseMismatch',
          `reader.${firstReader.operationSequence}.input`,
          (s) => {
            s.input = { ...s.input, npSpecialMultipliers: [99, 99, 99, 99, 99] };
          },
        );
        add('missing-use-input', 'scalarSourceMismatch', 'use.0.references', (s) => {
          s.readerUses[0]!.input = structuredClone(s.readerUses[0]!.input);
        });
        add('missing-use-result', 'scalarSourceMismatch', 'use.0.references', (s) => {
          s.readerUses[0]!.result = structuredClone(s.readerUses[0]!.result);
        });
        add('wrong-source-effects', 'scalarSourceMismatch', 'source.references', (s) => {
          s.effects = structuredClone(s.effects);
        });
        add('wrong-projection-outcome', 'scalarUseMismatch', 'owner.effects', (s) => {
          s.effects.find((effect) => effect.operationId === firstReader.operationId)!.outcome =
            'unsupported';
        });
        if (program.writers.length > 1) {
          add(
            'intermediate-value-consumption',
            'scalarValueMismatch',
            `reader.${firstReader.operationSequence}.value`,
            (s) => {
              consumption(s).value = mutation(s).afterTransaction;
            },
          );
          add('reversed-groups', 'scalarIdentityMismatch', 'groups.identity', (s) => {
            scalarState(s).executionGroups.reverse();
          });
        }
        add(
          'reader-rolled-back',
          'scalarCommitMismatch',
          `reader.${firstReader.operationSequence}.commit`,
          (s) => {
            scalarState(s).executionGroups[firstReader.operationGroupIndex]!.outcome = 'rolledBack';
          },
        );
        add(
          'reader-fake-event-outcome',
          'scalarOutcomeMismatch',
          `reader.${firstReader.operationSequence}.eventOutcome`,
          (s) => {
            selected(s).operationEvents.find(
              (event) => event.operationId === firstReader.operationId,
            )!.operationOutcome = 'notRelevant';
          },
        );
        for (const field of ['writers', 'readers', 'groups'] as const) {
          const alteredProgram = { ...program, [field]: [] };
          negatives.push({
            name: `${spec.name}:wrong-program-${field}`,
            reason: 'scalarPopulationMismatch',
            path: 'program.contract',
            gate: auditScalarQuantityObservations({
              expected: [alteredProgram],
              observations: [{ ...source, program: alteredProgram }],
            }),
          });
        }
        add('missing-projection', 'scalarUseMismatch', 'use.0.projectionCount', (s) => {
          s.effects = s.effects.filter((effect) => effect.operationId !== firstReader.operationId);
        });
        add('wrong-projection-identity', 'scalarUseMismatch', 'use.0.projectionBinding', (s) => {
          s.effects.find(
            (effect) => effect.operationId === firstReader.operationId,
          )!.projectionKey = 'wrong';
        });
        add(
          'wrong-contribution-source',
          'scalarIdentityMismatch',
          'use.0.contributionSource',
          (s) => {
            s.effectiveContributions.contributions.find(
              (item) => item.operationId === firstReader.operationId,
            )!.source = {
              ...s.effectiveContributions.contributions[0]!.source,
              sourceInstanceId: 'wrong',
            };
          },
        );
        add(
          'wrong-contribution-identity',
          'scalarIdentityMismatch',
          'use.0.contributionIdentity',
          (s) => {
            s.effectiveContributions.contributions.find(
              (item) => item.operationId === firstReader.operationId,
            )!.contributionId = 'wrong:npBase';
          },
        );
        add('wrong-calculation-status', 'scalarOutcomeMismatch', 'calculation.status', (s) => {
          Object.assign(s.calculation, { status: 'invalid' });
        });
        const wrongIdentity = { ...program, canonicalIdentity: 'wrong-canonical-source' };
        negatives.push({
          name: `${spec.name}:wrong-program-identity`,
          reason: 'scalarPopulationMismatch',
          path: 'program.contract',
          gate: auditScalarQuantityObservations({
            expected: [wrongIdentity],
            observations: [{ ...source, program: wrongIdentity }],
          }),
        });
        for (const [name, changed] of [
          ['missing-population', { expected: [], observations: [source] }],
          ['missing-source', { expected: [program], observations: [] }],
          [
            'duplicate-population',
            { expected: [program, program], observations: [source, source] },
          ],
        ] as const)
          negatives.push({
            name: `${spec.name}:${name}`,
            reason: 'scalarPopulationMismatch',
            path: name === 'duplicate-population' ? 'population.unique' : 'population',
            gate: auditScalarQuantityObservations(changed),
          });
      }
      await writeProductionAuditArtifact(task.meta, 'tsk-08-scalar-quantity-np-consumption.json', {
        canonicalIdentity: 'tsk-08:scalar-quantity',
        population: 'schema-legal',
        positives,
        negatives,
      });
      for (const witness of positives) {
        expect(
          witness.gate.status,
          `${witness.name}:${JSON.stringify(witness.gate.failures)}`,
        ).toBe('passed');
        expect(witness.parity, witness.name).toBe(true);
        expect(witness.gate.consumptions, witness.name).toBe(
          witness.boundary === 'nullScalar' || witness.name === 'unrelated-damage' ? 0 : 1,
        );
        if (witness.boundary !== 'nullScalar' && witness.name !== 'unrelated-damage') {
          expect(witness.final, witness.name).toBe(witness.expected);
          expect(witness.consumed, witness.name).toBe(witness.expectedConsumed);
        }
      }
      for (const negative of negatives) {
        expect(negative.gate.status, negative.name).toBe('failed');
        expect(
          negative.gate.failures.some(
            (failure) => failure.reason === negative.reason && failure.checkPath === negative.path,
          ),
          `${negative.name}:${JSON.stringify(negative.gate.failures)}`,
        ).toBe(true);
      }
    },
  );
});

describe('native scalar quantity snapshot ownership', () => {
  it('preserves repeated before/after, absent fields, collections, and own special keys', () => {
    const shared = { quantity: 20, absent: undefined };
    const input = {
      before: shared,
      after: shared,
      facts: new Map([['stars', shared]]),
      traits: new Set(['a']),
      special: Object.fromEntries([['__proto__', shared]]),
    };
    const copied = scalarQuantitySnapshot(input);
    expect(copied).toEqual({
      before: { quantity: 20, absent: { kind: 'absent' } },
      after: { quantity: 20, absent: { kind: 'absent' } },
      facts: [['stars', { quantity: 20, absent: { kind: 'absent' } }]],
      traits: ['a'],
      special: Object.fromEntries([['__proto__', { quantity: 20, absent: { kind: 'absent' } }]]),
    });
    shared.quantity = 30;
    expect(copied).toMatchObject({ before: { quantity: 20 }, after: { quantity: 20 } });
    expect(scalarQuantitySnapshot(input)).toMatchObject({
      before: { quantity: 30 },
      after: { quantity: 30 },
    });
  });
  it('rejects a cycle without treating it as a shared completed value', () => {
    const cycle: Record<string, unknown> = {};
    cycle['self'] = cycle;
    expect(() => scalarQuantitySnapshot({ first: { value: 1 }, cycle })).toThrow(
      'cyclic_scalar_quantity_audit_value',
    );
  });
});
