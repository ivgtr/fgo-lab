import { readFile, writeFile } from 'node:fs/promises';
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
  compileRankingCandidateSpaces,
  materializeRankingCandidateSpace,
} from './rankingCandidateSpace';
import { compileRankingSelection, resolveRankingBasis } from './rankingBasis';
import {
  calculateScenario,
  calculateScenarioWithPolicy,
  createDefaultResolvedScenario,
} from './scenario';
import {
  createCalculatorPortableRequest,
  createRankingPortableRequest,
  currentCalculationVersionContext,
  executePortableCalculation,
} from './portableCalculation';

const root = resolve(import.meta.dirname, '../../..');
const loadMaster = async () =>
  masterSnapshotSchema.parse(
    JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
  );
const artifact = async (name: string, value: unknown) => {
  if (process.env['FGO_TEST_ARTIFACT_DIR'])
    await writeFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR'], name),
      `${JSON.stringify(value, null, 2)}\n`,
    );
};

const sharedDomainPolicies = [
  { selfBuffs: 'included', conditionalEffects: 'baseline', maximum: 27279 },
  { selfBuffs: 'included', conditionalEffects: 'satisfied', maximum: 54419 },
  { selfBuffs: 'excluded', conditionalEffects: 'baseline', maximum: 18987 },
  { selfBuffs: 'excluded', conditionalEffects: 'satisfied', maximum: 37834 },
] as const;

describe('production battle-point paths', () => {
  it('closes 705300 calculator NP1/2/5 and NP2 under all four ranking policies', async () => {
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
      expect(portable.status).toBe('executed');
      if (portable.status === 'executed')
        expect(portable.execution.result).toEqual(execution.result);
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
      };
    });
    expect(calculator.map(({ status }) => status)).toEqual([
      'calculated',
      'calculated',
      'calculated',
    ]);
    expect(calculator.map(({ maximum }) => maximum)).toEqual([44251, 59002, 73752]);
    expect(calculator.map(({ persistedIntent }) => persistedIntent)).toEqual([0, 0, 0]);

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
        if (result.status === 'calculated') {
          const replay = calculateScenarioWithPolicy(
            result.detail.scenario,
            master,
            versions,
            result.detail.contributionPolicy,
            { initialNpGauge: result.detail.candidateEvidence.startNpGauge },
          );
          const portable = executePortableCalculation(
            createRankingPortableRequest(result.detail, currentCalculationVersionContext(master)),
            master,
          );
          expect(portable.status).toBe('executed');
          if (portable.status === 'executed')
            expect(portable.execution.result).toEqual(replay.result);
        }
        return {
          policy: `${selfBuffs}:${conditionalEffects}`,
          status: result.status,
          maximum:
            result.status === 'calculated'
              ? result.detail.result.rows.find(({ npLevel }) => npLevel === 2)?.maximum
              : null,
          plan: result.status === 'calculated' ? result.detail.scenario.preNoblePhantasmPlan : [],
        };
      }),
    );
    expect(ranking.map(({ status }) => status)).toEqual(Array(4).fill('calculated'));
    expect(ranking.map(({ maximum }) => maximum)).toEqual([33715, 106204, 21612, 48628]);
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
    await artifact('battle-point-705300.json', { calculator, ranking, rejections: [] });
  }, 60_000);

  it('uses the shared absolute 3300200 domain for three calculator conditions without inventing a capacity', async () => {
    const master = await loadMaster();
    const domain = master.battlePointDomains.find(({ id }) => id === '3300200')!;
    expect(domain.capacity).toEqual({ default: null, maximum: null, traitOverrides: [] });
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
        terminalPhase: execution.status === 'executable' ? execution.input.battlePointPhase : null,
      };
    });
    expect(calculator.map(({ status }) => status)).toEqual(Array(3).fill('calculated'));
    expect(calculator.map(({ maximum }) => maximum)).toEqual([33725, 44920, 56115]);
    expect(calculator.map(({ terminalPhase }) => terminalPhase)).toEqual([1, 1, 1]);
    await artifact('battle-point-3300200-calculator.json', { calculator, rejections: [] });
  }, 30_000);

  it.each(sharedDomainPolicies)(
    'calculates 3300200 NP2 under $selfBuffs:$conditionalEffects without cross-policy state',
    async ({ selfBuffs, conditionalEffects, maximum }) => {
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
      if (selfBuffs === 'included' && conditionalEffects === 'satisfied') {
        const selection = compileRankingSelection(conditions);
        expect(selection.status).toBe('valid');
        if (selection.status !== 'valid') return;
        const basis = resolveRankingBasis(servant, { servantBuilds: {} }, selection.selection);
        const spaces = compileRankingCandidateSpaces(
          servant,
          master,
          basis,
          conditions,
          createStaticAttackProfiles(servant),
        );
        expect(
          spaces.reduce((sum, space) => sum + (space.status === 'ready' ? space.upperBound : 0), 0),
        ).toBe(3072);
        const candidates = spaces.flatMap((space) =>
          space.status === 'ready'
            ? materializeRankingCandidateSpace({ servant, master, basis, conditions, space })
            : [],
        );
        const selected = candidates.filter(
          ({ evidence }) =>
            evidence.preparationPlanKey ===
              '["3300200",0]|{"kind":"useSkillSlot","slot":1,"skillLevel":10,"choice":null}' &&
            Object.values(evidence.canonicalInputValues).every((value) => value === 0) &&
            evidence.targetCandidateKey.endsWith('"facts":[]}') &&
            evidence.fieldCandidateKey === 'field:[{"trait":"fieldShore","present":false}]' &&
            evidence.quantityCandidateKey === 'quantity:{"battlePointPhase":10}',
        );
        expect(selected).toHaveLength(1);
        const execution = calculateScenarioWithPolicy(
          selected[0]!.scenario,
          master,
          versions,
          selected[0]!.contributionPolicy,
          { initialNpGauge: selected[0]!.evidence.startNpGauge },
        );
        expect(execution.result.status).toBe('calculated');
        const record = {
          policy: `${selfBuffs}:${conditionalEffects}`,
          status: execution.result.status,
          maximum:
            execution.result.status === 'calculated'
              ? execution.result.rows.find(({ npLevel }) => npLevel === 2)?.maximum
              : null,
          plan: selected[0]!.scenario.preNoblePhantasmPlan,
          candidateUpperBound: candidates.length,
        };
        expect(record.maximum).toBe(maximum);
        await artifact(`battle-point-3300200-${selfBuffs}-${conditionalEffects}.json`, record);
        return;
      }
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
      expect(result.status).toBe('calculated');
      const record = {
        policy: `${selfBuffs}:${conditionalEffects}`,
        status: result.status,
        maximum:
          result.status === 'calculated'
            ? result.detail.result.rows.find(({ npLevel }) => npLevel === 2)?.maximum
            : null,
        plan: result.status === 'calculated' ? result.detail.scenario.preNoblePhantasmPlan : [],
      };
      expect(record.maximum).toBe(maximum);
      await artifact(`battle-point-3300200-${selfBuffs}-${conditionalEffects}.json`, record);
    },
    60_000,
  );
});
