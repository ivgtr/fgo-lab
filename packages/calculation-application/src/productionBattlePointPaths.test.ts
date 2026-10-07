import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { calculateRankingPolicyDetail } from './rankingPolicyCalculation';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';
import { createStaticAttackProfiles } from './attackProfile';
import { calculateRankingCandidateSet } from './rankingPolicyCandidates';
import { unresolvedProfileResult } from './rankingProfileOutcome';
import {
  calculateScenario,
  calculateScenarioWithPolicy,
  createDefaultResolvedScenario,
  evaluatePreparedCalculationScenario,
  prepareCalculationScenarioWithPolicy,
} from './scenario';
import {
  createCalculatorPortableRequest,
  createRankingPortableRequest,
  currentCalculationVersionContext,
  executePortableCalculation,
} from './portableCalculation';
import {
  productionAuditTestOptions,
  writeProductionAuditArtifact,
} from './productionAuditArtifacts';

const root = resolve(import.meta.dirname, '../../..');
const loadMaster = async () =>
  masterSnapshotSchema.parse(
    JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
  );
const artifact = (taskMetadata: unknown, name: string, value: unknown) =>
  writeProductionAuditArtifact(taskMetadata, name, value);

const sharedDomainPolicies = [
  { selfBuffs: 'included', conditionalEffects: 'baseline', maximum: 29993 },
  { selfBuffs: 'included', conditionalEffects: 'satisfied', maximum: 35421 },
  { selfBuffs: 'excluded', conditionalEffects: 'baseline', maximum: 20871 },
  { selfBuffs: 'excluded', conditionalEffects: 'satisfied', maximum: 24641 },
] as const;

describe('production battle-point paths', () => {
  it(
    'closes 705300 calculator NP1/2/5 and NP2 under all four ranking policies',
    { timeout: 60_000, ...productionAuditTestOptions(['battle-point-705300.json']) },
    async ({ task }) => {
      const master = await loadMaster();
      const servant = master.servants.find(({ id }) => id === '705300')!;
      const versions = {
        schemaVersion: SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
        appVersion: APP_VERSION,
        gameRegion: 'JP' as const,
        masterDataLocale: 'ja-JP' as const,
        masterDataVersion: master.version,
      };
      const calculator = [1, 2, 5].map((npLevel) => {
        const base = createDefaultResolvedScenario(master, undefined, servant);
        const scenario = {
          ...base,
          attacker: { ...base.attacker, npLevel: npLevel as 1 | 2 | 5 },
        };
        const execution = calculateScenario(scenario, master, versions);
        const portable = executePortableCalculation(
          createCalculatorPortableRequest(scenario, currentCalculationVersionContext(master)),
          master,
        );
        return {
          npLevel,
          status: execution.result.status,
          maximum:
            execution.result.status === 'calculated'
              ? execution.result.rows.find((row) => row.npLevel === npLevel)?.maximum
              : null,
          plan: scenario.preNoblePhantasmPlan,
          persistedIntent:
            portable.request.scenario.mode === 'resolved'
              ? portable.request.scenario.battleState.battlePointPhase
              : null,
          portable,
          execution,
        };
      });

      const ranking = (['included', 'excluded'] as const).flatMap((selfBuffs) =>
        (['baseline', 'satisfied'] as const).map((conditionalEffects) => {
          const result = calculateRankingPolicyDetail(
            servant,
            master,
            { servantBuilds: {} },
            {
              ...DEFAULT_RANKING_POLICY_CONDITIONS,
              npLevelBasis: { kind: 'specified', npLevel: 2 },
              selfBuffs,
              conditionalEffects,
            },
            versions,
          );
          let replay: ReturnType<typeof calculateScenarioWithPolicy> | undefined;
          let portable: ReturnType<typeof executePortableCalculation> | undefined;
          if (result.status === 'calculated') {
            replay = calculateScenarioWithPolicy(
              result.detail.scenario,
              master,
              versions,
              result.detail.contributionPolicy,
              { initialNpGauge: result.detail.candidateEvidence.startNpGauge },
            );
            portable = executePortableCalculation(
              createRankingPortableRequest(result.detail, currentCalculationVersionContext(master)),
              master,
            );
          }
          return {
            policy: `${selfBuffs}:${conditionalEffects}`,
            status: result.status,
            maximum:
              result.status === 'calculated'
                ? result.detail.result.rows.find(({ npLevel }) => npLevel === 2)?.maximum
                : null,
            plan: result.status === 'calculated' ? result.detail.scenario.preNoblePhantasmPlan : [],
            result,
            replay,
            portable,
          };
        }),
      );
      await artifact(task.meta, 'battle-point-705300.json', {
        calculator,
        ranking,
        rejections: [],
      });
      expect(calculator.map(({ status }) => status)).toEqual([
        'calculated',
        'calculated',
        'calculated',
      ]);
      expect(calculator.map(({ maximum }) => maximum)).toEqual([44251, 59002, 73752]);
      expect(calculator.map(({ persistedIntent }) => persistedIntent)).toEqual([0, 0, 0]);
      for (const { portable, execution } of calculator) {
        expect(portable.status).toBe('executed');
        if (portable.status === 'executed')
          expect(portable.execution.result).toEqual(execution.result);
      }
      expect(ranking.map(({ status }) => status)).toEqual(Array(4).fill('calculated'));
      expect(ranking.map(({ maximum }) => maximum)).toEqual([53945, 106204, 21612, 48628]);
      for (const entry of ranking) {
        if (entry.status === 'calculated') {
          expect(entry.portable?.status).toBe('executed');
          if (entry.portable?.status === 'executed')
            expect(entry.portable.execution.result).toEqual(entry.replay?.result);
        }
      }
      expect(
        ranking
          .find(({ policy }) => policy === 'included:satisfied')
          ?.plan.some(
            (command) =>
              command.kind === 'useSkillSlot' &&
              command.slot === 1 &&
              command.choice?.candidateKey === '2',
          ),
      ).toBe(true);
    },
  );

  it(
    'uses the shared absolute 3300200 domain for three calculator conditions without inventing a capacity',
    { timeout: 30_000, ...productionAuditTestOptions(['battle-point-3300200-calculator.json']) },
    async ({ task }) => {
      const master = await loadMaster();
      const domain = master.battlePointDomains.find(({ id }) => id === '3300200')!;
      const servant = master.servants.find(({ id }) => id === '3300200')!;
      const versions = {
        schemaVersion: SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
        appVersion: APP_VERSION,
        gameRegion: 'JP' as const,
        masterDataLocale: 'ja-JP' as const,
        masterDataVersion: master.version,
      };
      const calculator = [1, 2, 5].map((npLevel) => {
        const base = createDefaultResolvedScenario(master, undefined, servant);
        const scenario = {
          ...base,
          attacker: { ...base.attacker, npLevel: npLevel as 1 | 2 | 5 },
        };
        const execution = calculateScenario(scenario, master, versions);
        return {
          npLevel,
          status: execution.result.status,
          maximum:
            execution.result.status === 'calculated'
              ? execution.result.rows.find((row) => row.npLevel === npLevel)?.maximum
              : null,
          terminalPhase:
            execution.status === 'executable' ? execution.input.battlePointPhase : null,
          execution,
        };
      });
      await artifact(task.meta, 'battle-point-3300200-calculator.json', {
        domain: domain.capacity,
        calculator,
        rejections: [],
      });
      expect(domain.capacity).toEqual({ default: null, maximum: null, traitOverrides: [] });
      expect(calculator.map(({ status }) => status)).toEqual(Array(3).fill('calculated'));
      expect(calculator.map(({ maximum }) => maximum)).toEqual([33725, 44920, 56115]);
      expect(calculator.map(({ terminalPhase }) => terminalPhase)).toEqual([1, 1, 1]);
    },
  );

  it(
    'retains the selected BP witness and raw target candidate on the same execution',
    { timeout: 30_000, ...productionAuditTestOptions(['selected-execution-observation.json']) },
    async ({ task }) => {
      const master = await loadMaster();
      const servant = master.servants.find(({ id }) => id === '3300200')!;
      const scenario = {
        ...createDefaultResolvedScenario(master, undefined, servant),
        battleState: { battlePointPhase: 1 },
      };
      const prepared = prepareCalculationScenarioWithPolicy(
        scenario,
        master,
        { kind: 'calculator' },
        {},
        true,
      );
      if (prepared.status !== 'executable' || !prepared.executionObservation) {
        await artifact(task.meta, 'selected-execution-observation.json', {
          canonicalIdentity: 'tsk-08:selected-execution:3300200:phase-1',
          prepared,
        });
        throw new Error('selected BP execution observation required');
      }
      const execution = evaluatePreparedCalculationScenario(prepared, {
        schemaVersion: SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
        appVersion: APP_VERSION,
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
        masterDataVersion: master.version,
      });
      const observation = prepared.executionObservation;
      const targetExecution = observation.targetExecution;
      await artifact(task.meta, 'selected-execution-observation.json', {
        canonicalIdentity: 'tsk-08:selected-execution:3300200:phase-1',
        battlePointWitness: observation.battlePointWitness,
        targetExecution,
        resolvedTarget: prepared.resolved.input.target,
        resolvedBattlePointPhase: prepared.resolved.input.battlePointPhase,
        executionObservation: execution.executionObservation,
        execution,
      });
      if (!targetExecution) throw new Error('target candidate observation required');

      expect(observation.battlePointWitness?.['3300200']).toEqual(expect.any(Number));
      expect(targetExecution.selection).toBe('selected');
      if (targetExecution.selection !== 'selected') return;
      expect(typeof targetExecution.targetCandidate.classId).toBe('string');
      expect(typeof targetExecution.targetCandidate.attribute).toBe('string');
      expect(prepared.resolved.input.target.classId).toBeNull();
      expect(execution.status).toBe('executable');
      expect(execution.executionObservation).toBe(observation);
      if (execution.status === 'executable') {
        expect(execution.input).toBe(prepared.resolved.input);
        expect(execution.input.battlePointPhase).toBe(2);
      }
    },
  );

  for (const policy of sharedDomainPolicies) {
    const { selfBuffs, conditionalEffects, maximum } = policy;
    const artifactPath = `battle-point-3300200-${selfBuffs}-${conditionalEffects}.json`;
    it(
      `calculates 3300200 NP2 under ${selfBuffs}:${conditionalEffects} without cross-policy state`,
      { timeout: 60_000, ...productionAuditTestOptions([artifactPath]) },
      async ({ task }) => {
        const master = await loadMaster();
        const servant = master.servants.find(({ id }) => id === '3300200')!;
        const conditions = {
          ...DEFAULT_RANKING_POLICY_CONDITIONS,
          npLevelBasis: { kind: 'specified' as const, npLevel: 2 as const },
          selfBuffs,
          conditionalEffects,
        };
        const versions = {
          schemaVersion: SCHEMA_VERSION,
          engineVersion: ENGINE_VERSION,
          appVersion: APP_VERSION,
          gameRegion: 'JP' as const,
          masterDataLocale: 'ja-JP' as const,
          masterDataVersion: master.version,
        };
        const candidateSet = calculateRankingCandidateSet(
          servant,
          master,
          { servantBuilds: {} },
          conditions,
          versions,
          false,
        );
        const attackProfile = createStaticAttackProfiles(servant)[0]!;
        const result = unresolvedProfileResult(candidateSet, attackProfile);
        const record = {
          policy: `${selfBuffs}:${conditionalEffects}`,
          result,
          status: result.status,
          maximum:
            result.status === 'calculated'
              ? result.detail.result.rows.find(({ npLevel }) => npLevel === 2)?.maximum
              : null,
          plan: result.status === 'calculated' ? result.detail.scenario.preNoblePhantasmPlan : [],
          candidateUpperBound: candidateSet.plan.candidateUpperBound,
          candidateCount: candidateSet.plan.candidateKeys.length,
        };
        await artifact(task.meta, artifactPath, record);
        expect(result.status).toBe('calculated');
        if (selfBuffs === 'included' && conditionalEffects === 'satisfied') {
          expect(record.candidateUpperBound).toBe(384);
          expect(record.candidateCount).toBe(384);
          expect(result.status).toBe('calculated');
          if (result.status === 'calculated') expect(result.detail.input.battlePointPhase).toBe(3);
        }
        expect(record.maximum).toBe(
          Math.max(
            ...candidateSet.executions.flatMap((execution) =>
              execution.result.status === 'calculated'
                ? execution.result.rows
                    .filter(({ npLevel }) => npLevel === 2)
                    .map(({ maximum }) => maximum)
                : [],
            ),
          ),
        );
        expect(record.maximum).toBe(maximum);
      },
    );
  }
});
