import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { calculateRankingPolicyDetail } from './rankingPolicyCalculation';
import { createStaticAttackProfiles } from './attackProfile';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';
import { calculateScenarioWithPolicy } from './scenario';
import {
  currentCalculationVersionContext,
  createRankingPortableRequest,
  executePortableCalculation,
} from './portableCalculation';
const root = resolve(import.meta.dirname, '../../..');
const masterPromise = readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8').then(
  (s) => masterSnapshotSchema.parse(JSON.parse(s)),
);
it('closes all five independent marker profiles across the 35 acceptance conditions', async () => {
  const master = await masterPromise;
  const versions = {
    ...currentCalculationVersionContext(master),
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    engineVersion: ENGINE_VERSION,
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const records: unknown[] = [],
    failures: unknown[] = [];
  for (const actor of master.servants.filter((actor) =>
    ['105900', '204900', '405700', '2501400'].includes(actor.id),
  ))
    for (const profile of createStaticAttackProfiles(actor))
      for (const conditions of [
        ...([1, 2, 5] as const).map((npLevel) => ({
          ...DEFAULT_RANKING_POLICY_CONDITIONS,
          npLevelBasis: { kind: 'specified' as const, npLevel },
        })),
        ...(['included', 'excluded'] as const).flatMap((selfBuffs) =>
          (['baseline', 'satisfied'] as const).map((conditionalEffects) => ({
            ...DEFAULT_RANKING_POLICY_CONDITIONS,
            npLevelBasis: { kind: 'specified' as const, npLevel: 2 as const },
            selfBuffs,
            conditionalEffects,
          })),
        ),
      ]) {
        const result = calculateRankingPolicyDetail(
          actor,
          master,
          { servantBuilds: {} },
          conditions,
          versions,
          profile,
        );
        const record = {
          actor: actor.id,
          profile: profile.id,
          conditions,
          status: result.status,
          ...(result.status === 'calculated'
            ? {
                scenario: result.detail.scenario,
                rows: result.detail.result.rows,
                metrics: result.detail.executionMetrics,
              }
            : { result }),
        };
        records.push(record);
        if (result.status !== 'calculated') {
          if (!(
            actor.id === '2501400' &&
            result.status === 'unavailableUnderPolicy' &&
            result.reason === 'insufficientNpGauge' &&
            conditions.selfBuffs === 'excluded'
          ))
            failures.push(record);
          continue;
        }
        const replay = calculateScenarioWithPolicy(
          result.detail.scenario,
          master,
          versions,
          result.detail.contributionPolicy,
          { initialNpGauge: result.detail.candidateEvidence.startNpGauge },
        );
        expect('rows' in replay.result ? replay.result.rows : []).toEqual(
          result.detail.result.rows,
        );
        const portable = executePortableCalculation(
          createRankingPortableRequest(result.detail, currentCalculationVersionContext(master)),
          master,
        );
        expect(portable.status).toBe('executed');
        if (portable.status === 'executed')
          expect(portable.execution.result).toEqual(replay.result);
      }
  if (process.env['FGO_TEST_ARTIFACT_DIR'])
    await writeFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR'], 'marker-acceptance.json'),
      JSON.stringify({ records, failures }, null, 2) + '\n',
    );
  expect(records).toHaveLength(35);
  expect(failures).toEqual([]);
}, 120_000);

it('keeps marker profiles aligned at legal OC2, natural level, Lv90 and stable owned basis', async () => {
  const master = await masterPromise;
  const versions = {
    ...currentCalculationVersionContext(master),
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    engineVersion: ENGINE_VERSION,
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const records: unknown[] = [];
  for (const actor of master.servants.filter((actor) =>
    ['105900', '204900', '405700', '2501400'].includes(actor.id),
  ))
    for (const profile of createStaticAttackProfiles(actor))
      for (const levelBasis of ['naturalLimit', 'uniformLevel90', 'ownedLevel'] as const)
        for (const selfBuffs of ['included', 'excluded'] as const)
          for (const conditionalEffects of ['baseline', 'satisfied'] as const) {
            const conditions = {
              ...DEFAULT_RANKING_POLICY_CONDITIONS,
              population: levelBasis === 'ownedLevel' ? ('owned' as const) : ('all' as const),
              levelBasis,
              npLevelBasis:
                levelBasis === 'ownedLevel'
                  ? { kind: 'owned' as const }
                  : { kind: 'specified' as const, npLevel: 2 as const },
              initialOvercharge: 2 as const,
              selfBuffs,
              conditionalEffects,
            };
            const result = calculateRankingPolicyDetail(
              actor,
              master,
              {
                servantBuilds: {
                  [actor.id]: {
                    servantId: actor.id,
                    level: 90,
                    ascension: 4,
                    npLevel: 2,
                    fouAtk: 1000,
                    skills: { '1': 10, '2': 10, '3': 10 },
                    appends: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
                    updatedAt: '2026-09-13T00:00:00Z',
                  },
                },
              },
              conditions,
              versions,
              profile,
            );
            records.push({
              actor: actor.id,
              profile: profile.id,
              conditions,
              status: result.status,
              ...(result.status === 'calculated'
                ? { scenario: result.detail.scenario, rows: result.detail.result.rows }
                : { result }),
            });
            if (actor.id === '2501400' && selfBuffs === 'excluded') {
              expect(result).toMatchObject({
                status: 'unavailableUnderPolicy',
                reason: 'insufficientNpGauge',
              });
              continue;
            }
            expect(result.status).toBe('calculated');
            if (result.status !== 'calculated') continue;
            const replay = calculateScenarioWithPolicy(
              result.detail.scenario,
              master,
              versions,
              result.detail.contributionPolicy,
              { initialNpGauge: result.detail.candidateEvidence.startNpGauge },
            );
            expect('rows' in replay.result ? replay.result.rows : []).toEqual(
              result.detail.result.rows,
            );
          }
  expect(records).toHaveLength(60);
  if (process.env['FGO_TEST_ARTIFACT_DIR'])
    await writeFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR'], 'marker-cross-paths.json'),
      JSON.stringify({ records }, null, 2) + '\n',
    );
}, 120_000);

it('executes the shared marker population across legal NP/OC cells, CE normal/LB and support recipients', async () => {
  const { getNoblePhantasmVariants, getSkillsForActorForm, getDefaultInitialActorForm } =
    await import('@fgo-lab/master-data');
  const { createDefaultResolvedScenario, calculateScenario } = await import('./scenario');
  const { applyCanonicalInputCommand } = await import('./canonicalInputs');
  const master = await masterPromise;
  const versions = {
    ...currentCalculationVersionContext(master),
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    engineVersion: ENGINE_VERSION,
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const hasMarker = (
    effect: (typeof master.servants)[number]['skills'][number]['effects'][number],
  ) =>
    effect.execution.some(
      (operation) => operation.kind === 'buffInstanceMutation' && operation.marker,
    );
  const actors = master.servants.filter(
    (actor) =>
      createStaticAttackProfiles(actor).length > 0 &&
      [
        ...actor.skills.flatMap((s) => s.effects),
        ...actor.passives.flatMap((s) => s.effects),
        ...getNoblePhantasmVariants(actor).flatMap((n) => n.effects),
      ].some(hasMarker),
  );
  const records: unknown[] = [],
    failures: unknown[] = [];
  const ces = master.craftEssences.filter((ce) => ce.effects.some(hasMarker));
  for (const actor of actors) {
    const base = createDefaultResolvedScenario(master, undefined, actor);
    for (const [npLevel, initialOvercharge] of [
      [1, 1],
      [2, 1],
      [5, 1],
      [2, 2],
      [5, 3],
    ] as const) {
      let scenario: ReturnType<typeof createDefaultResolvedScenario> = {
        ...base,
        attacker: { ...base.attacker, npLevel },
        initialOvercharge,
      };
      let execution = calculateScenario(scenario, master, versions);
      const initialStatus = execution.result.status;
      const repairedKeys = new Set<string>();
      for (let attempt = 0; attempt < 3 && execution.result.status === 'inputRequired'; attempt++) {
        for (const input of execution.result.requiredInputs) {
          expect(input.key).toMatch(/^oc:world:/);
          expect(repairedKeys.has(input.key)).toBe(false);
          repairedKeys.add(input.key);
          scenario = applyCanonicalInputCommand(scenario, {
            kind: 'setCanonicalIntegerInput',
            key: input.key,
            value: 0,
          });
        }
        execution = calculateScenario(scenario, master, versions);
      }
      const record = {
        actor: actor.id,
        npLevel,
        initialOvercharge,
        initialStatus,
        scenario,
        status: execution.result.status,
        issues: execution.result.issues,
      };
      records.push(record);
      if (execution.result.status !== 'calculated' && execution.result.status !== 'unsupported')
        failures.push(record);
    }
    for (const ce of ces)
      for (const limitBreak of [0, 4] as const) {
        const scenario = {
          ...base,
          craftEssence: {
            craftEssenceId: ce.id,
            level: ce.maxLevelByLimitBreak[limitBreak],
            limitBreak,
          },
        };
        const execution = calculateScenario(scenario, master, versions);
        const record = {
          actor: actor.id,
          ce: ce.id,
          limitBreak,
          status: execution.result.status,
          issues: execution.result.issues,
        };
        records.push(record);
        if (execution.result.status !== 'calculated' && execution.result.status !== 'unsupported')
          failures.push(record);
      }
  }
  for (const support of master.servants.filter((actor) =>
    ['105900', '204900', '405700', '2501400'].includes(actor.id),
  ))
    for (const skill of getSkillsForActorForm(
      support,
      getDefaultInitialActorForm(support)!.id,
    ).filter((skill) => skill.effects.some(hasMarker)))
      for (const actor of [
        master.servants.find(
          (actor) => actor.rarity <= 3 && createStaticAttackProfiles(actor).length > 0,
        )!,
        support,
      ]) {
        const base = createDefaultResolvedScenario(master, undefined, actor);
        const scenario = {
          ...base,
          support: {
            sourceTemplateId: null,
            composition: {
              effectInclusions: [],
              sources: [
                {
                  sourceInstanceId: 'marker-support',
                  servantId: support.id,
                  skills: [{ skillId: skill.id, skillLevel: 10, enabled: true }],
                },
              ],
            },
          },
        };
        const execution = calculateScenario(scenario, master, versions);
        const record = {
          actor: actor.id,
          support: support.id,
          skill: skill.id,
          status: execution.result.status,
          issues: execution.result.issues,
        };
        records.push(record);
        if (execution.result.status !== 'calculated') failures.push(record);
      }
  if (process.env['FGO_TEST_ARTIFACT_DIR'])
    await writeFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR'], 'marker-shared-paths.json'),
      JSON.stringify({ actors: actors.map((a) => a.id), records, failures }, null, 2) + '\n',
    );
  expect(failures).toEqual([]);
}, 120_000);
