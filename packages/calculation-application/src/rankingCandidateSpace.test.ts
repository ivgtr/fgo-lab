import { rankingBasisFixture } from './rankingBasisFixture';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { beforeAll, describe, expect, it } from 'vitest';
import { attackProfileKey, createStaticAttackProfiles } from './attackProfile';
import {
  compileRankingCandidateSpaces,
  materializeRankingCandidateSpace,
} from './rankingCandidateSpace';
import { DEFAULT_RANKING_POLICY_CONDITIONS, type RankingProfileInput } from './rankingContracts';
import { calculateRankingPolicy, calculateRankingPolicyDetail } from './rankingPolicyCalculation';
import { compileRankingExecutionPlan, executeRankingScenarios } from './rankingPolicyScenario';
import { compileStaticRankingPreparationPrograms } from './rankingStaticPreparation';
import { compileCandidateLocalActionAdmissionDispositions } from './rankingActionAdmission';
import {
  calculateScenario,
  calculateScenarioWithPolicy,
  createDefaultResolvedScenario,
  prepareCalculationScenarioWithPolicy,
  evaluatePreparedCalculationScenario,
} from './scenario';
import { PreparedDamageMatrixCache } from './preparedDamageInputCache';
import type { DamageResolutionValue } from './damageResolution';
import {
  createRankingPortableRequest,
  currentCalculationVersionContext,
  executePortableCalculation,
} from './portableCalculation';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';

type OracleSkill = { slot: 1 | 2 | 3; choice: '1' | '2' | null };

// Independent finite domain: never taken from the planner, its quotient or certificate.
function battlePointOraclePrograms(): OracleSkill[][] {
  const programs: OracleSkill[][] = [];
  const visit = (prefix: OracleSkill[]) => {
    programs.push(prefix);
    for (const slot of [1, 2, 3] as const) {
      if (prefix.some((skill) => skill.slot === slot)) continue;
      for (const choice of slot === 1 ? (['1', '2'] as const) : [null])
        visit([...prefix, { slot, choice }]);
    }
  };
  visit([]);
  return programs;
}

// Small canonical fixture: capacity 4, initially absent (-1) or present (0..4).
// Conditions read BEFORE their source writes; later gain cannot change an earlier read.
function battlePointOracle(program: readonly OracleSkill[], initialPoint: number) {
  let point = initialPoint;
  let gauge = 10_000;
  let attack = 0;
  let card = 0;
  let np = 0;
  const reads: { slot: number; phase: number; rate: number; extraNp: boolean }[] = [];
  for (const skill of program) {
    const rate = point < 0 ? 0 : Math.floor((point * 1_000) / 4);
    const phase = point < 0 ? 0 : point < 2 ? 1 : point === 2 ? 2 : point === 3 ? 3 : 4;
    reads.push({ slot: skill.slot, phase, rate, extraNp: skill.slot === 3 && phase <= 1 });
    if (skill.slot === 1 && rate <= 999) {
      attack += 200;
      if (skill.choice === '1') point = Math.min(4, Math.max(0, point) + 2);
      else {
        np += 200;
        gauge = Math.min(10_000, gauge + 2_000);
        point = Math.min(4, Math.max(0, point) + 12);
      }
    }
    if (skill.slot === 2) {
      card += 300;
      if (rate >= 1) point = Math.max(0, point - 2);
    }
    if (skill.slot === 3) {
      np += 200 + (phase <= 1 ? 200 : 0);
      gauge = Math.min(10_000, gauge + 5_000);
    }
  }
  return { attack, card, np, point, gauge, reads };
}

// Independent arithmetic for this fixture, following the declared f32 governing formula.
// No production execution/fold/damage helper is called to generate these expectations.
function battlePointOracleRows(modifiers: ReturnType<typeof battlePointOracle>, ideal: boolean) {
  const f = Math.fround;
  const multiply = (left: number, right: number) => f(f(left) * f(right));
  return [4_500, 6_000, 6_750, 7_125, 7_500].map((npMultiplier) => {
    const values = Array.from({ length: 200 }, (_, index) => {
      let value = multiply(11_955 + 1_000, f(npMultiplier / 1_000));
      value = multiply(value, f((1_000 + modifiers.card) / 1_000));
      value = multiply(value, f(1_100 / 1_000));
      value = multiply(value, 1); // neutral class and attribute affinity
      value = multiply(value, 1);
      value = multiply(value, f((900 + index) / 1_000));
      value = multiply(value, 0.23);
      value = multiply(value, f((1_000 + modifiers.attack) / 1_000));
      value = multiply(value, f((1_000 + modifiers.np + (ideal ? 500 : 0)) / 1_000));
      value = multiply(value, 1);
      value = multiply(value, ideal ? 1.5 : 1);
      return Math.floor(value);
    });
    return {
      npLevel: npMultiplier === 4_500 ? 1 : [6_000, 6_750, 7_125, 7_500].indexOf(npMultiplier) + 2,
      minimum: values[0],
      average: values.reduce((sum, value) => sum + value, 0) / 200,
      maximum: values.at(-1),
    };
  });
}

function oracleCommands(program: readonly OracleSkill[]): PreNoblePhantasmCommand[] {
  return [
    ...program.map(({ slot, choice }) => ({
      kind: 'useSkillSlot' as const,
      slot,
      skillLevel: 10,
      choice: choice === null ? null : { groupKey: 'player-choice:0', candidateKey: choice },
    })),
    { kind: 'executeAttackNoblePhantasm' },
  ];
}

const root = resolve(import.meta.dirname, '../../..');
const profile: RankingProfileInput = {
  servantBuilds: {},
};

describe('static ranking candidate space', () => {
  let master: ReturnType<typeof masterSnapshotSchema.parse>;
  beforeAll(async () => {
    master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
  });

  const versions = () => ({
    schemaVersion: SCHEMA_VERSION,
    masterDataVersion: master.version,
    engineVersion: ENGINE_VERSION,
    appVersion: APP_VERSION,
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  });

  it('materializes a physical baseline and both family polarities for satisfied target worlds', () => {
    const servant = master.servants.find(({ id }) => id === '102900')!;
    const conditions = {
      ...DEFAULT_RANKING_POLICY_CONDITIONS,
      selfBuffs: 'excluded' as const,
      conditionalEffects: 'satisfied' as const,
    };
    const plan = compileRankingExecutionPlan(servant, master, profile, conditions, versions());
    const executions = executeRankingScenarios(
      plan.preparedRankingScenarios,
      master,
      versions(),
      plan.contributionPolicies,
    );
    expect(executions.length).toBeGreaterThan(1);
    expect(executions.every(({ result }) => result.status === 'calculated')).toBe(true);
    const contexts = plan.preparedRankingScenarios.map(({ scenario }) => {
      if (scenario.mode !== 'resolved') throw new Error('resolved_ranking_scenario_required');
      return scenario.targetContext;
    });
    expect(
      contexts.every(
        ({ class: classContext, attribute }) =>
          classContext.kind === 'concrete' && attribute.kind === 'concrete',
      ),
    ).toBe(true);
    expect(
      contexts.some(({ absentFamilies }) =>
        absentFamilies.some(({ familyId }) => familyId === 'beast'),
      ),
    ).toBe(true);
    expect(
      contexts.some(({ families }) => families.some(({ familyId }) => familyId === 'beast')),
    ).toBe(true);
    expect(
      calculateRankingPolicyDetail(servant, master, profile, conditions, versions()).status,
    ).toBe('calculated');
  });

  it('calculates every reachable published profile under the satisfied NP1 target policy', () => {
    const result = calculateRankingPolicy(
      master,
      profile,
      {
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        selfBuffs: 'excluded',
        conditionalEffects: 'satisfied',
      },
      versions(),
    );
    const statuses = Object.values(result.profileResults).map(({ status }) => status);
    expect(statuses).toHaveLength(433);
    expect(statuses.filter((status) => status === 'calculated')).toHaveLength(432);
    expect(statuses.filter((status) => status === 'unavailableUnderPolicy')).toHaveLength(1);
    expect(
      statuses.filter(
        (status) => status === 'inputRequired' || status === 'unsupported' || status === 'invalid',
      ),
    ).toEqual([]);
  });

  it('selects a reachable battle-point choice after the ordered preparation mutations', () => {
    const servant = master.servants.find(({ id }) => id === '705300')!;
    const result = calculateRankingPolicyDetail(
      servant,
      master,
      profile,
      {
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        selfBuffs: 'included',
        conditionalEffects: 'satisfied',
      },
      versions(),
    );
    expect(result.status, JSON.stringify(result)).toBe('calculated');
    if (result.status !== 'calculated') return;
    // The old first-choice/0.4/65_541.965/alternate upper bound is historical.
    // Current acceptance is an independent complete order/resource/clock oracle.
    const programs = battlePointOraclePrograms();
    expect(programs).toHaveLength(27);
    const domain = servant.battlePointDomains![0]!;
    expect(domain).toMatchObject({
      phaseScale: 'permille',
      capacity: { default: 4, maximum: 12 },
      phases: [
        { phase: 0, threshold: -1 },
        { phase: 1, threshold: 0 },
        { phase: 2, threshold: 500 },
        { phase: 3, threshold: 750 },
        { phase: 4, threshold: 1000 },
      ],
    });
    expect(servant.atkByLevel[90]).toBe(11_955);
    for (const [slot, occurrence, modifier, cell] of [
      [1, '152:1', 'attackBuff', 200],
      [1, '254:0', 'npDamageBuff', 200],
      [2, '110:0', 'cardBuff', 300],
      [3, '248:0', 'npDamageBuff', 200],
      [3, '248:1', 'npDamageBuff', 200],
    ] as const) {
      const operation = servant.skills
        .find((skill) => skill.slot === slot)!
        .effects.find((effect) => effect.occurrenceId === occurrence)!
        .execution.find((operation) => operation.kind === 'damageModifier')!;
      expect(operation).toMatchObject({ modifier });
      expect(operation.values[0][9]).toBe(cell);
    }
    const raw = [-1, 0, 1, 2, 3, 4].flatMap((point) =>
      programs.map((program) => {
        const state = battlePointOracle(program, point);
        return { point, program, state, rows: battlePointOracleRows(state, true) };
      }),
    );
    const maximum = Math.max(...raw.map(({ rows }) => rows[0]!.average));
    expect(result.detail.result.rows[0].average).toBe(maximum);
    const chosen = result.detail.scenario.preNoblePhantasmPlan.flatMap((command) =>
      command.kind === 'useSkillSlot'
        ? [{ slot: command.slot, choice: command.choice?.candidateKey ?? null } as OracleSkill]
        : [],
    );
    const selectedOracle = battlePointOracle(chosen, -1);
    expect(result.detail.input).toMatchObject({
      attackBuff: selectedOracle.attack / 1_000,
      cardBuff: selectedOracle.card / 1_000,
      npDamageBuff: selectedOracle.np / 1_000,
      npMultipliers: [450, 600, 675, 712.5, 750],
      npSpecialMultipliers: [1.5, 1.5, 1.5, 1.5, 1.5],
      powerMod: 0.5,
      overcharge: 1,
    });
    expect(result.detail.result.rows).toEqual(battlePointOracleRows(selectedOracle, true));
    expect(result.detail.candidateEvidence.quantityCandidateKey).toBe('quantity:baseline');
    const calculator = calculateScenarioWithPolicy(result.detail.scenario, master, versions(), {
      kind: 'calculator',
    });
    expect(calculator.status).toBe('executable');
    if (calculator.status !== 'executable') throw new Error(JSON.stringify(calculator));
    expect(calculator.result.rows).toEqual(result.detail.result.rows);
    const portable = executePortableCalculation(
      createRankingPortableRequest(result.detail, currentCalculationVersionContext(master)),
      master,
    );
    expect(portable.status).toBe('executed');
    if (portable.status === 'executed')
      expect(portable.execution.result.rows).toEqual(result.detail.result.rows);
    const scenario = result.detail.scenario;
    for (const point of [-1, 0, 1, 2, 3, 4])
      expect(
        calculateScenarioWithPolicy(
          scenario,
          master,
          versions(),
          result.detail.contributionPolicy,
          { initialBattlePointPoints: { [domain.id]: point } },
        ),
      ).toMatchObject({
        status: 'invalid',
        result: { issue: { kind: 'invalidBattlePointIntent', detail: 'invalidInitialPoint' } },
      });
  });

  it('keeps the default absent battle-point state readable for a party HP writer', () => {
    const servant = master.servants.find(({ id }) => id === '705300')!;
    const result = calculateRankingPolicyDetail(
      servant,
      master,
      profile,
      DEFAULT_RANKING_POLICY_CONDITIONS,
      versions(),
    );
    expect(result.status, JSON.stringify(result)).toBe('calculated');
  });

  it('binds the calculator default population world and still rejects an omitted local trait fact', () => {
    const servant = master.servants.find(({ id }) => id === '106200')!;
    const scenario = createDefaultResolvedScenario(master, undefined, servant);
    const inputKey = servant.skills
      .flatMap((skill) => skill.effects.flatMap((effect) => effect.inputDefinitions))
      .find((definition) => definition.kind === 'populationCount')?.key;
    if (!inputKey) throw new Error('population input missing');
    const withPopulation = {
      ...scenario,
      canonicalInputValues: {
        'population:allies:additional': { kind: 'integer' as const, value: 1 },
        [inputKey]: { kind: 'integer' as const, value: 1 },
      },
    };
    expect(calculateScenario(withPopulation, master, versions()).result.status).toBe('calculated');
    expect(
      calculateScenario({ ...withPopulation, worldFactAssertions: [] }, master, versions()).result,
    ).toMatchObject({ status: 'unsupported', issues: [{ code: 'unknown_trait_quantity' }] });
  });

  it.each([-1, 0, 2, 3, 4])(
    'matches the independent BP order oracle for initial phase witness %s',
    (initialPoint) => {
      const servant = master.servants.find(({ id }) => id === '705300')!;
      const domain = servant.battlePointDomains![0]!;
      const programs = battlePointOraclePrograms();
      const raw = [-1, 0, 1, 2, 3, 4].flatMap((point) =>
        programs.map((program) => {
          const state = battlePointOracle(program, point);
          return { point, program, state, rows: battlePointOracleRows(state, true) };
        }),
      );
      const initial = createDefaultResolvedScenario(master, undefined, servant);
      const damageCache = new PreparedDamageMatrixCache<DamageResolutionValue>();
      // Present points 0 and 1 share phase 1. The public application expands its witnesses.
      // Explicit points intentionally remain rejected before the passive grants eligibility.
      for (const starting of raw.filter(({ point }) => point === initialPoint)) {
        const scenario = {
          ...initial,
          attacker: { ...initial.attacker, level: 90, fouAtk: 1_000 },
          battleState: {
            battlePointPhase:
              starting.point < 0
                ? 0
                : starting.point < 2
                  ? 1
                  : starting.point === 2
                    ? 2
                    : starting.point === 3
                      ? 3
                      : 4,
          },
          targetContext: {
            class: { kind: 'concrete' as const, classId: 'shielder' as const },
            attribute: { kind: 'concrete' as const, attribute: 'earth' as const },
            families: [],
            absentFamilies: [],
          },
          worldFactAssertions: [
            ...['alignmentEvil', 'undead'].map((trait) => ({
              decisionKey: `oracle:${trait}`,
              fact: { kind: 'trait' as const, scope: 'target' as const, trait, present: true },
            })),
            ...['alignmentEvil', 'undead'].map((trait) => ({
              decisionKey: `oracle:state:${trait}`,
              fact: {
                kind: 'trait' as const,
                scope: 'targetState' as const,
                trait,
                present: false,
              },
            })),
          ],
          preNoblePhantasmPlan: oracleCommands(starting.program),
        };
        const prepared = prepareCalculationScenarioWithPolicy(
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
          damageCache,
        );
        const execution = evaluatePreparedCalculationScenario(prepared, versions());
        expect(
          execution.status,
          JSON.stringify({ point: starting.point, program: starting.program }),
        ).toBe('executable');
        if (execution.status !== 'executable') throw new Error(JSON.stringify(execution));
        const initialDomain =
          prepared.preparationExecution!.initializationExecution!.state.battlePoints.actors
            .attacker!.domains[domain.id]!;
        expect(initialDomain).toBeDefined();
        const witnessPoint = initialDomain.kind === 'absent' ? -1 : initialDomain.point;
        const oracle = raw.find(
          (candidate) => candidate.point === witnessPoint && candidate.program === starting.program,
        );
        expect(oracle, JSON.stringify({ witnessPoint, starting })).toBeDefined();
        if (!oracle) throw new Error('oracle_witness_not_in_independent_domain');
        expect(execution.input).toMatchObject({
          attackBuff: oracle.state.attack / 1_000,
          cardBuff: oracle.state.card / 1_000,
          npDamageBuff: oracle.state.np / 1_000,
        });
        expect(execution.result.rows).toEqual(oracle.rows);
        const actions = prepared.preparationExecution!.actionExecutions!;
        expect(actions.map(({ command }) => command)).toEqual(scenario.preNoblePhantasmPlan);
        expect(actions.at(-1)!.state.terminated).toBe(true);
        expect(actions.at(-1)!.state.usedSkillSlots.size).toBe(oracle.program.length);
        expect(execution.appliedPreparationActions.at(-1)!.ocUse).toMatchObject({
          gaugeBefore: oracle.state.gauge,
          baseOc: 1,
          effectiveOc: 1,
        });
        for (const [index, skill] of oracle.program.entries()) {
          if (skill.slot !== 3) continue;
          const action = actions[index]!;
          const source = action.sources.find(
            ({ source }) => source.effect.occurrenceId === '248:1',
          )!;
          expect(source.binding).toMatchObject({ valueSetIndex: 0, valueIndex: 9 });
          expect(source.binding.activation).toMatchObject({
            kind: 'read',
            read: {
              kind: 'known',
              truth: oracle.state.reads[index]!.extraNp,
              certainty: 'guaranteed',
              clock: { phase: 'sourceUse', actionId: source.actionId, occurrenceId: '248:1' },
              evidence: [{ value: oracle.state.reads[index]!.phase }],
            },
          });
          expect(source.binding.activation.kind).toBe('read');
          if (source.binding.activation.kind === 'read') {
            expect(source.binding.activation.read.support.length).toBeGreaterThan(0);
            expect(source.binding.activation.proc).toMatchObject({
              outcome: 'success',
              certainty: 'guaranteed',
            });
          }
          expect(action.committedSources).toContain(source);
        }
      }
    },
  );

  it.each([
    ['1101000', 4],
    ['2501300', 10],
  ] as const)('uses the declared production maximum for %s', async (id, maximum) => {
    const servant = master.servants.find((item) => item.id === id)!;
    const result = calculateRankingPolicyDetail(
      servant,
      master,
      profile,
      { ...DEFAULT_RANKING_POLICY_CONDITIONS, conditionalEffects: 'satisfied' },
      versions(),
    );
    expect(result.status, JSON.stringify(result)).toBe('calculated');
    if (result.status !== 'calculated') throw new Error(JSON.stringify(result));
    const stackInputs = result.detail.effectInputs.filter(
      (input) => input.kind === 'effectStackCount',
    );
    expect(stackInputs.map((input) => input.value)).toContain(maximum);
    expect(result.detail.input.npSpecialMultipliers).toEqual([2, 2, 2, 2, 2]);
    if (process.env.FGO_TEST_ARTIFACT_DIR)
      await writeFile(
        resolve(process.env.FGO_TEST_ARTIFACT_DIR, `stack-maximum-${id}.json`),
        JSON.stringify(
          {
            governingRule: {
              baseline: 0,
              maximum,
              correctionPermille: id === '1101000' ? 250 : 100,
            },
            scenario: result.detail.scenario,
            contributionPolicy: result.detail.contributionPolicy,
            candidateEvidence: result.detail.candidateEvidence,
            input: result.detail.input,
            result: result.detail.result,
          },
          null,
          2,
        ),
      );
  });

  it('retains a baseline world and checks the complete semantic product before materializing', () => {
    const servant = master.servants.find(({ id }) => id === '403700')!;
    const spaces = compileRankingCandidateSpaces(
      servant,
      master,
      rankingBasisFixture(servant),
      { ...DEFAULT_RANKING_POLICY_CONDITIONS, conditionalEffects: 'satisfied' },
      createStaticAttackProfiles(servant),
    );
    expect(spaces.some(({ status }) => status === 'ready')).toBe(true);
    for (const space of spaces) {
      if (space.status !== 'ready') continue;
      const expectedBound = space.programs.reduce(
        (sum, program) =>
          sum +
          [
            ...program.canonicalInputs.map(({ values }) => values.length),
            program.targets.length,
            program.fields.length,
            program.quantities.length,
          ].reduce((product, size) => product * size, 1),
        0,
      );
      expect(space.upperBound).toBe(expectedBound);
      const candidates = materializeRankingCandidateSpace({
        conditions: {
          ...DEFAULT_RANKING_POLICY_CONDITIONS,
          conditionalEffects: 'satisfied',
        },
        space,
      });
      expect(candidates).toHaveLength(space.upperBound);
      expect(
        candidates.some(
          ({ evidence }) =>
            evidence.targetCandidateKey === 'target:baseline' &&
            evidence.fieldCandidateKey === 'field:none' &&
            evidence.quantityCandidateKey === 'quantity:baseline',
        ),
      ).toBe(true);
    }
  });

  it('certifies the complete domain before materialization', () => {
    const servant = master.servants.find(({ id }) => id === '403700')!;
    const spaces = compileRankingCandidateSpaces(
      servant,
      master,
      rankingBasisFixture(servant),
      DEFAULT_RANKING_POLICY_CONDITIONS,
      createStaticAttackProfiles(servant),
    );
    for (const space of spaces) {
      if (space.status !== 'ready') continue;
      expect(space.certificate.completeUpperBound).toBe(space.upperBound);
      expect(space.certificate.supportedMaximum).toBe(4_096);
      expect(space.certificate.programBounds.reduce((sum, item) => sum + item.upperBound, 0)).toBe(
        space.upperBound,
      );
    }
  });

  it.each(['106400', '401300', '500400', '2800600'])(
    'materializes fixed preparation world facts for %s without repair input',
    (id) => {
      const servant = master.servants.find((item) => item.id === id)!;
      const outcome = calculateRankingPolicyDetail(
        servant,
        master,
        profile,
        {
          ...DEFAULT_RANKING_POLICY_CONDITIONS,
          npLevelBasis: { kind: 'specified', npLevel: 2 },
          initialOvercharge: 1,
        },
        versions(),
      );
      expect(outcome.status, JSON.stringify(outcome)).toBe('calculated');
    },
  );

  it('matches an independent exhaustive oracle for a small prepared context', () => {
    const servant = master.servants.find(({ id }) => id === '403700')!;
    const space = compileRankingCandidateSpaces(
      servant,
      master,
      rankingBasisFixture(servant),
      DEFAULT_RANKING_POLICY_CONDITIONS,
      createStaticAttackProfiles(servant),
    ).find((candidate) => candidate.status === 'ready');
    if (!space) throw new Error('ready candidate space required');
    const oracle: string[] = [];
    for (const program of space.programs)
      for (const startNpGauge of [program.initialNpGauge])
        for (const target of program.targets)
          for (const field of program.fields)
            for (const quantity of program.quantities) {
              const visitInputs = (index: number, values: Record<string, number>) => {
                const input = program.canonicalInputs[index];
                if (input)
                  for (const value of input.values)
                    visitInputs(index + 1, { ...values, [input.key]: value });
                else
                  oracle.push(
                    JSON.stringify({
                      program: program.program.key,
                      startNpGauge,
                      values,
                      target: target?.key ?? 'target:baseline',
                      field: field.key,
                      quantity: quantity.key,
                    }),
                  );
              };
              visitInputs(0, {});
            }
    const materialized = materializeRankingCandidateSpace({
      conditions: DEFAULT_RANKING_POLICY_CONDITIONS,
      space,
    }).map(({ evidence }) =>
      JSON.stringify({
        program: evidence.preparationPlanKey,
        startNpGauge: evidence.startNpGauge,
        values: evidence.canonicalInputValues,
        target: evidence.targetCandidateKey,
        field: evidence.fieldCandidateKey,
        quantity: evidence.quantityCandidateKey,
      }),
    );
    expect(materialized.sort()).toEqual(oracle.sort());
    expect(materialized).toHaveLength(space.certificate.completeUpperBound);
  });

  it('preserves distinct ordered skill programs with the same used-slot set', () => {
    const servant = master.servants.find(({ id }) => id === '403700')!;
    const orders = compileStaticRankingPreparationPrograms(
      servant,
      rankingBasisFixture(servant).skillLevels,
    ).map((program) =>
      program.commands.flatMap((command) =>
        command.kind === 'useSkillSlot' ? [command.slot] : [],
      ),
    );
    expect(orders).toContainEqual([1, 2]);
    expect(orders).toContainEqual([2, 1]);
  });

  it('lets the canonical executor derive 200-percent gauge overcharge for 505300 NP2-5', () => {
    const servant = master.servants.find(({ id }) => id === '505300')!;
    const actual: number[] = [];
    const startNpGauges: number[] = [];
    for (const offset of [0, 1, 2, 3]) {
      const npLevel = (offset + 2) as 2 | 3 | 4 | 5;
      const outcome = calculateRankingPolicyDetail(
        servant,
        master,
        profile,
        {
          ...DEFAULT_RANKING_POLICY_CONDITIONS,
          npLevelBasis: { kind: 'specified', npLevel },
          conditionalEffects: 'satisfied',
        },
        versions(),
      );
      expect(outcome.status, `NP${npLevel}`).toBe('calculated');
      if (outcome.status !== 'calculated') continue;
      expect(outcome.detail.scenario.initialOvercharge).toBe(1);
      expect(outcome.detail.appliedPreparationActions.at(-1)?.resourceBefore.gauge).toBe(20_000);
      expect(outcome.detail.input.overcharge).toBe(2);
      startNpGauges.push(outcome.detail.candidateEvidence.startNpGauge);
      actual.push(outcome.detail.result.rows[npLevel - 1]!.average);
    }
    expect(startNpGauges).toEqual([10_000, 10_000, 10_000, 10_000]);
    expect(actual).toEqual([90_290.91, 108_832.9, 118_739.145, 128_987.255]);
  }, 30_000);

  it('replays current-NP proportional gain through calculator and portable ranking paths for all inclusion policies', async () => {
    const { calculateScenarioWithPolicy } = await import('./scenario');
    const {
      createRankingPortableRequest,
      currentCalculationVersionContext,
      executePortableCalculation,
    } = await import('./portableCalculation');
    const servant = master.servants.find(({ id }) => id === '704900')!;
    for (const npLevel of [1, 2] as const)
      for (const selfBuffs of ['included', 'excluded'] as const)
        for (const conditionalEffects of ['baseline', 'satisfied'] as const) {
          const outcome = calculateRankingPolicyDetail(
            servant,
            master,
            profile,
            {
              ...DEFAULT_RANKING_POLICY_CONDITIONS,
              npLevelBasis: { kind: 'specified', npLevel },
              selfBuffs,
              conditionalEffects,
            },
            versions(),
          );
          expect(outcome.status, `${npLevel}:${selfBuffs}:${conditionalEffects}`).toBe(
            'calculated',
          );
          if (outcome.status !== 'calculated') continue;
          const detail = outcome.detail;
          if (selfBuffs === 'included' && conditionalEffects === 'satisfied') {
            const explicit = calculateScenarioWithPolicy(
              {
                ...detail.scenario,
                preNoblePhantasmPlan: [
                  { kind: 'useSkillSlot', slot: 2, skillLevel: 10, choice: null },
                  { kind: 'executeAttackNoblePhantasm' },
                ],
              },
              master,
              versions(),
              detail.contributionPolicy,
            );
            expect(explicit.status).toBe('executable');
            if (explicit.status === 'executable')
              expect(explicit.appliedPreparationActions[0]).toMatchObject({
                resourceBefore: { gauge: 10000 },
                resourceAfter: { gauge: npLevel === 1 ? 10000 : 20000 },
              });
          }
          const calculator = calculateScenarioWithPolicy(
            detail.scenario,
            master,
            versions(),
            detail.contributionPolicy,
          );
          const portable = executePortableCalculation(
            createRankingPortableRequest(detail, currentCalculationVersionContext(master)),
            master,
          );
          expect(calculator.status).toBe('executable');
          expect(portable.status).toBe('executed');
          for (const result of [
            calculator,
            portable.status === 'executed' ? portable.execution : null,
          ]) {
            expect(result?.status).toBe('executable');
            if (result?.status !== 'executable') continue;
            expect(result.input).toEqual(detail.input);
            expect(result.result).toEqual(detail.result);
            expect(result.appliedPreparationActions).toEqual(detail.appliedPreparationActions);
          }
        }
  });

  it('rejects a represented NP cost at the selected start and succeeds only after an explicit initial OC change', () => {
    const source = master.servants.find(({ id }) => id === '100100')!;
    const costEffect = master.servants
      .find(({ id }) => id === '2501400')!
      .skills.find(({ id }) => id === '2357350')!
      .effects.find(({ id }) => id === '21693')!;
    const costlySkill = source.skills[0]!;
    const servant = {
      ...source,
      skills: source.skills.map((skill) =>
        skill.id === costlySkill.id ? { ...skill, effects: [...skill.effects, costEffect] } : skill,
      ),
    };
    const fixtureMaster = {
      ...master,
      servants: master.servants.map((candidate) =>
        candidate.id === servant.id ? servant : candidate,
      ),
    };
    const compile = (
      npLevel: 1 | 2,
      conditionalEffects: 'baseline' | 'satisfied',
      initialOvercharge: 1 | 2 = 1,
    ) =>
      compileRankingExecutionPlan(
        servant,
        fixtureMaster,
        profile,
        {
          ...DEFAULT_RANKING_POLICY_CONDITIONS,
          npLevelBasis: { kind: 'specified', npLevel },
          conditionalEffects,
          initialOvercharge,
        },
        versions(),
      );
    const baseline = compile(1, 'baseline');
    const baselineExecutions = executeRankingScenarios(
      baseline.preparedRankingScenarios,
      fixtureMaster,
      versions(),
      baseline.contributionPolicies,
    );
    const costlyBaseline = baseline.preparationPlanKeys.flatMap((key, index) =>
      key.includes('"slot":1') ? [{ index, key }] : [],
    );
    expect(costlyBaseline).not.toHaveLength(0);
    expect(
      costlyBaseline.every(
        ({ index }) =>
          baseline.preparedRankingScenarios[index]?.resolved.preparationRejection?.code ===
            'insufficientNpGauge' && baselineExecutions[index]?.status === 'rejected',
      ),
    ).toBe(true);
    expect(baselineExecutions.some(({ result }) => result.status === 'calculated')).toBe(true);

    for (const initialOvercharge of [1, 2] as const) {
      const satisfied = compile(2, 'satisfied', initialOvercharge);
      const costly = satisfied.preparationPlanKeys.flatMap((key, index) =>
        key.includes('"slot":1')
          ? [
              {
                startNpGauge: satisfied.startNpGauges[index],
                rejection:
                  satisfied.preparedRankingScenarios[index]?.resolved.preparationRejection?.code ??
                  null,
              },
            ]
          : [],
      );
      expect(costly.length).toBeGreaterThan(0);
      expect(new Set(costly.map((candidate) => JSON.stringify(candidate)))).toEqual(
        new Set([
          JSON.stringify({
            startNpGauge: initialOvercharge * 10000,
            rejection: initialOvercharge === 1 ? 'insufficientNpGauge' : null,
          }),
        ]),
      );
    }
  }, 30_000);

  it('classifies every static production AttackProfile without substituting a sibling', () => {
    const calculation = calculateRankingPolicy(
      master,
      profile,
      DEFAULT_RANKING_POLICY_CONDITIONS,
      versions(),
    );
    expect({
      candidateInventory: calculation.candidateInventory,
      damageCache: calculation.damageCache,
    }).toEqual({
      candidateInventory: {
        damageRequestCount: 7255,
        damageRequestUpperBound: 7164,
        deduplicatedCount: 7164,
        distinctDamageInputCount: 1627,
        generatedCount: 7164,
        semanticUpperBound: 7164,
      },
      damageCache: {
        cacheHitCount: 5628,
        cacheHitRate: 0.7757408683666437,
        distinctDamageInputCount: 1627,
        requestCount: 7255,
      },
    });
    const inventoryKeys = master.servants.flatMap((servant) =>
      createStaticAttackProfiles(servant).map(attackProfileKey),
    );
    expect(Object.keys(calculation.profileResults).sort()).toEqual([...inventoryKeys].sort());
    const unavailable = Object.values(calculation.profileResults).filter(
      (result) => result.status !== 'calculated',
    );
    expect(unavailable.map((result) => result.attackProfile?.id.servantLineageId).sort()).toEqual(
      [],
    );
    expect(
      unavailable.every(
        (result) =>
          result.status === 'unsupported' && result.reason === 'unsupportedActionAdmission',
      ),
    ).toBe(true);
  }, 30_000);

  it('ratchets adverse action admission and concrete execution dispositions', () => {
    const actionRecords: unknown[] = [];
    const adverseOccurrences = new Set<string>();
    const admissions: Record<string, number> = {};
    const preparationRejections: Record<string, number> = {};
    const policies = [
      {
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        selfBuffs: 'included',
        conditionalEffects: 'baseline',
      },
      {
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        selfBuffs: 'included',
        conditionalEffects: 'satisfied',
      },
      {
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        selfBuffs: 'excluded',
        conditionalEffects: 'baseline',
      },
      {
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        selfBuffs: 'excluded',
        conditionalEffects: 'satisfied',
      },
    ] as const;
    for (const servant of master.servants) {
      for (const skill of servant.skills)
        for (const effect of skill.effects)
          for (const operation of effect.execution) {
            const family =
              operation.kind === 'resourceMutation' && operation.direction === 'loss'
                ? `${operation.resource}:${operation.amount.kind}`
                : operation.kind === 'damageModifier' && operation.sign === -1
                  ? 'negativeModifier'
                  : operation.kind === 'stateMutation' && operation.polarity === 'detrimental'
                    ? 'detrimentalState'
                    : operation.kind === 'contextMutation' &&
                        (operation.mutation === 'removeTrait' ||
                          operation.mutation === 'suppressInitialTrait')
                      ? 'traitRemoval'
                      : null;
            if (family)
              adverseOccurrences.add(`${family}|${servant.id}:${skill.id}:${effect.occurrenceId}`);
          }
      const programs = compileStaticRankingPreparationPrograms(
        servant,
        rankingBasisFixture(servant).skillLevels,
      );
      for (const policy of policies) {
        const policyKey = `${policy.selfBuffs}:${policy.conditionalEffects}`;
        const dispositions = compileCandidateLocalActionAdmissionDispositions(programs, policy, {
          semantics: master.npResourceSemantics,
          npLevel: 1,
          automaticEffects: servant.passives.flatMap((passive) => passive.effects),
          initialGauge:
            policy.initialOvercharge *
            master.npResourceSemantics.noblePhantasmUse.baseOvercharge.gaugePerStage,
        });
        for (const disposition of dispositions) {
          actionRecords.push({ servantId: servant.id, policyKey, ...disposition });
          for (const admission of disposition.actionAdmissions) {
            const dispositionKey =
              admission.kind === 'admitted'
                ? `${admission.kind}:${admission.role}`
                : admission.kind === 'unsupported'
                  ? `${admission.kind}:${admission.reason}`
                  : admission.kind;
            const key = `${policyKey}:${dispositionKey}`;
            admissions[key] = (admissions[key] ?? 0) + 1;
          }
        }
        if (policyKey === 'included:baseline') {
          const plan = compileRankingExecutionPlan(servant, master, profile, policy, versions());
          for (const prepared of plan.preparedRankingScenarios) {
            const code = prepared.resolved.preparationRejection?.code;
            if (code) {
              const key = `${policyKey}:unreachable:${code}`;
              preparationRejections[key] = (preparationRejections[key] ?? 0) + 1;
            }
          }
        }
      }
    }
    const adverseFamilies = [...adverseOccurrences].reduce<Record<string, number>>(
      (counts, occurrence) => {
        const family = occurrence.slice(0, occurrence.indexOf('|'));
        counts[family] = (counts[family] ?? 0) + 1;
        return counts;
      },
      {
        'hp:fixed': 0,
        'hp:dependent': 0,
        'npGauge:fixed': 0,
        'npGauge:dependent': 0,
        'criticalStars:fixed': 0,
        'criticalStars:dependent': 0,
        'battlePoint:fixed': 0,
        'battlePoint:dependent': 0,
        negativeModifier: 0,
        detrimentalState: 0,
        traitRemoval: 0,
      },
    );
    expect({
      adverseFamilies,
      admissions,
      preparationRejections,
      actionDigest: createHash('sha256').update(JSON.stringify(actionRecords)).digest('hex'),
    }).toEqual({
      actionDigest: 'd7295b5fa4d684bf99009c955f68fabff606809454dfb4f25671f6c4bcfd1ed8',
      admissions: {
        'excluded:baseline:admitted:structuralRequired': 148,
        'excluded:baseline:policyNoOp': 15024,
        'excluded:satisfied:admitted:structuralRequired': 148,
        'excluded:satisfied:policyNoOp': 15024,
        'included:baseline:admitted:optional': 14925,
        'included:baseline:admitted:structuralRequired': 148,
        'included:baseline:policyNoOp': 99,
        'included:satisfied:admitted:optional': 14925,
        'included:satisfied:admitted:structuralRequired': 148,
        'included:satisfied:policyNoOp': 99,
      },
      adverseFamilies: {
        'battlePoint:dependent': 0,
        'battlePoint:fixed': 1,
        'criticalStars:dependent': 0,
        'criticalStars:fixed': 5,
        detrimentalState: 0,
        'hp:dependent': 0,
        'hp:fixed': 23,
        negativeModifier: 27,
        'npGauge:dependent': 0,
        'npGauge:fixed': 38,
        traitRemoval: 3,
      },
      preparationRejections: {
        'included:baseline:unreachable:insufficientNpGauge': 161,
        'included:baseline:unreachable:attackNoblePhantasmUnavailable': 22,
      },
    });
  }, 30_000);

  it('ratchets the largest static semantic product below the finite planner limit', async () => {
    const inventory = master.servants.flatMap((servant) =>
      compileRankingCandidateSpaces(
        servant,
        master,
        rankingBasisFixture(servant),
        { ...DEFAULT_RANKING_POLICY_CONDITIONS, conditionalEffects: 'satisfied' },
        createStaticAttackProfiles(servant),
      ).map((space) => ({ servantId: servant.id, space })),
    );
    const largest = inventory
      .filter(
        (
          entry,
        ): entry is typeof entry & { space: Extract<typeof entry.space, { status: 'ready' }> } =>
          entry.space.status === 'ready',
      )
      .sort((left, right) => right.space.upperBound - left.space.upperBound)
      .slice(0, 1)
      .map(({ servantId, space }) => ({
        servantId,
        upperBound: space.upperBound,
      }));
    expect(largest).toEqual([{ servantId: '2801300', upperBound: 3_435 }]);
    expect(largest[0]!.upperBound).toBeLessThanOrEqual(4_096);
    if (process.env.FGO_TEST_ARTIFACT_DIR)
      await writeFile(
        resolve(process.env.FGO_TEST_ARTIFACT_DIR, 'stack-candidate-domains.json'),
        JSON.stringify(
          inventory.map(({ servantId, space }) => ({
            servantId,
            status: space.status,
            ...(space.status === 'ready'
              ? {
                  upperBound: space.upperBound,
                  programs: space.programs.map((program) => ({
                    key: program.program.key,
                    stackDomains: program.canonicalInputs.filter(({ key }) =>
                      program.semantics.inputDefinitions.some(
                        (input) => input.key === key && input.kind === 'effectStackCount',
                      ),
                    ),
                  })),
                }
              : { rejection: space }),
          })),
          null,
          2,
        ),
      );
  });
});
