import { deepStrictEqual } from 'node:assert';
import { calculateScenarioWithPolicy } from '../src/scenario';
import {
  createRankingPortableRequest,
  currentCalculationVersionContext,
  executePortableCalculation,
} from '../src/portableCalculation';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  APP_VERSION,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  rankingSelectionSchema,
} from '@fgo-lab/schema';
import { calculateRankingPolicy } from '../src/rankingPolicyCalculation';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from '../src/rankingContracts';

const root = resolve(import.meta.dirname, '../../..');
const output = resolve(root, process.argv[2] ?? '.test-results/tsk-06-48-a5/matrix');
await mkdir(output, { recursive: true });
const bytes = await readFile(
  resolve(root, process.env['FGO_AUDIT_MASTER'] ?? 'apps/web/public/master/master.json'),
);
const master = masterSnapshotSchema.parse(JSON.parse(bytes.toString()));
const identity = {
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  masterSha256: createHash('sha256').update(bytes).digest('hex'),
  command:
    'pnpm --filter @fgo-lab/data-pipeline exec tsx ../calculation-application/scripts/audit-oc-matrix.ts',
  gaugeModel: 'canonical-fixed-initial-oc',
  worktree: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }),
};
const versions = {
  schemaVersion: SCHEMA_VERSION,
  engineVersion: ENGINE_VERSION,
  appVersion: APP_VERSION,
  masterDataVersion: master.version,
  gameRegion: 'JP' as const,
  masterDataLocale: 'ja-JP' as const,
};
const summaries = [];
let failedParity = 0;
for (const levelBasis of ['naturalLimit', 'uniformLevel90'] as const)
  for (const selfBuffs of ['included', 'excluded'] as const)
    for (const conditionalEffects of ['baseline', 'satisfied'] as const)
      for (const npLevel of [1, 2, 3, 4, 5] as const)
        for (const initialOvercharge of [1, 2, 3] as const) {
          if (
            initialOvercharge * 10000 >
            master.npResourceSemantics.capacityByNpLevel[npLevel - 1]!
          )
            continue;
          if (
            process.env['FGO_AUDIT_OC'] &&
            process.env['FGO_AUDIT_OC'] !== String(initialOvercharge)
          )
            continue;
          if (process.env['FGO_AUDIT_LEVEL'] && process.env['FGO_AUDIT_LEVEL'] !== levelBasis)
            continue;
          if (process.env['FGO_AUDIT_SELF'] && process.env['FGO_AUDIT_SELF'] !== selfBuffs)
            continue;
          if (
            process.env['FGO_AUDIT_CONDITIONAL'] &&
            process.env['FGO_AUDIT_CONDITIONAL'] !== conditionalEffects
          )
            continue;
          if (process.env['FGO_AUDIT_NP'] && process.env['FGO_AUDIT_NP'] !== String(npLevel))
            continue;
          const conditions = {
            ...DEFAULT_RANKING_POLICY_CONDITIONS,
            levelBasis,
            initialOvercharge,
            selfBuffs,
            conditionalEffects,
            npLevelBasis: { kind: 'specified' as const, npLevel },
          };
          rankingSelectionSchema.parse(conditions);
          const start = performance.now();
          const result = calculateRankingPolicy(
            master,
            { servantBuilds: {} },
            conditions,
            versions,
          );
          const elapsedMs = performance.now() - start;
          const key = `${levelBasis}-${selfBuffs}-${conditionalEffects}-np${npLevel}-oc${initialOvercharge}`;
          const records = Object.entries(result.profileResults).map(([profile, value]) =>
            value.status === 'calculated'
              ? {
                  profile,
                  status: value.status,
                  input: value.detail.input,
                  result: value.detail.result,
                  scenario: value.detail.scenario,
                  evidence: value.detail.candidateEvidence,
                  actions: value.detail.appliedPreparationActions,
                  metrics: value.detail.executionMetrics,
                }
              : { profile, ...value },
          );
          let parityCount = 0;
          const parityFailures: {
            servantId: string;
            path: string;
            status: string;
            detail?: string;
          }[] = [];
          for (const outcome of Object.values(result.profileResults)) {
            if (outcome.status !== 'calculated') continue;
            const detail = outcome.detail;
            const calculator = calculateScenarioWithPolicy(
              detail.scenario,
              master,
              versions,
              detail.contributionPolicy,
            );
            const portable = executePortableCalculation(
              createRankingPortableRequest(detail, currentCalculationVersionContext(master)),
              master,
            );
            let matched = true;
            for (const [path, execution] of [
              ['calculator', calculator],
              ['portable', portable.status === 'executed' ? portable.execution : null],
            ] as const) {
              if (execution?.status !== 'executable') {
                parityFailures.push({
                  servantId: detail.input.attackerId,
                  path,
                  status: execution?.status ?? portable.status,
                  ...(portable.status === 'invalid' && portable.detail
                    ? { detail: portable.detail }
                    : {}),
                });
                matched = false;
                continue;
              }
              try {
                deepStrictEqual(execution.input, detail.input);
                deepStrictEqual(execution.result, detail.result);
                deepStrictEqual(
                  execution.appliedPreparationActions,
                  detail.appliedPreparationActions,
                );
              } catch (error) {
                parityFailures.push({
                  servantId: detail.input.attackerId,
                  path,
                  status: 'mismatch',
                  detail: String(error),
                });
                matched = false;
              }
            }
            if (matched) parityCount++;
          }
          const summary = {
            key,
            conditions,
            elapsedMs,
            parityCount,
            parityFailures,
            calculated: result.rows.length,
            exclusions: result.exclusions.length,
            damageCache: result.damageCache,
            digest: createHash('sha256').update(JSON.stringify(records)).digest('hex'),
          };
          await writeFile(
            resolve(output, `${key}.json`),
            JSON.stringify({ identity, summary, records }),
          );
          summaries.push(summary);
          failedParity += parityFailures.length;
          await writeFile(
            resolve(output, 'manifest.json'),
            JSON.stringify({ identity, summaries }, null, 2),
          );
          console.log(`${key}: ${result.rows.length} calculated, ${elapsedMs.toFixed(0)}ms`);
        }

if (failedParity > 0) throw new Error(`matrix_parity_failures:${failedParity}`);
