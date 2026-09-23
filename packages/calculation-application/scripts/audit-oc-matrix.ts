import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  connectProductionAuditMatrix,
  createTsk065ProductionAuditSource,
} from '@fgo-lab/master-data/production-audit';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { auditProductionClosure, productionClosureConditions } from '../src/productionClosureAudit';
import { evaluateProductionParityGate } from '../src/productionParityDiagnostics';
import { RANKING_ELIGIBILITY_DIGEST_PARTITION_COUNT } from '../src/rankingEligibilityAudit';

const root = resolve(import.meta.dirname, '../../..');
const output = resolve(root, process.argv[2] ?? '.test-results/tsk-06-45-production-closure');
let manifestName = 'manifest.json';
let failureArtifact: Record<string, unknown> = { output, stage: 'read-master' };
async function audit(): Promise<void> {
  await mkdir(output, { recursive: true });
  const masterPath = resolve(
    root,
    process.env['FGO_AUDIT_MASTER'] ?? 'apps/web/public/master/master.json',
  );
  const bytes = await readFile(masterPath);
  const master = masterSnapshotSchema.parse(JSON.parse(bytes.toString()));
  const identity = {
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    worktree: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }),
    masterDataVersion: master.version,
    masterSha256: createHash('sha256').update(bytes).digest('hex'),
    command:
      'pnpm --filter @fgo-lab/data-pipeline exec tsx ../calculation-application/scripts/audit-oc-matrix.ts <output>',
    matrix: 'naturalLimit|uniformLevel90 × four policies × ten legal NP/initial-OC pairs',
  };
  failureArtifact = { output, identity, stage: 'audit-conditions' };
  const versions = {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    appVersion: APP_VERSION,
    masterDataVersion: master.version,
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const shardCount = Number(process.env['FGO_AUDIT_SHARDS'] ?? '1');
  const shardIndex = Number(process.env['FGO_AUDIT_SHARD'] ?? '0');
  if (
    !Number.isSafeInteger(shardCount) ||
    (shardCount !== 1 && shardCount !== RANKING_ELIGIBILITY_DIGEST_PARTITION_COUNT) ||
    !Number.isSafeInteger(shardIndex) ||
    shardIndex < 0 ||
    shardIndex >= shardCount
  )
    throw new TypeError(`invalid_audit_shard:${String(shardIndex)}/${String(shardCount)}`);
  manifestName = shardCount === 1 ? 'manifest.json' : `manifest-shard-${String(shardIndex)}.json`;
  const selectedConditions = productionClosureConditions().filter(
    (_, index) => index % shardCount === shardIndex,
  );

  const audit = await auditProductionClosure(
    master,
    { servantBuilds: {} },
    versions,
    async ({ records, ...summary }) => {
      await writeFile(
        resolve(output, `${summary.key}.json`),
        `${JSON.stringify({ identity, summary, records })}\n`,
      );
      console.log(
        `${summary.key}: ${String(summary.calculated)} calculated, ${String(summary.unavailableUnderPolicy)} unavailable, ${summary.elapsedMs.toFixed(0)}ms`,
      );
    },
    selectedConditions,
  );
  failureArtifact = { output, identity, audit, stage: 'build-parity-gate' };
  const source =
    shardCount === 1
      ? createTsk065ProductionAuditSource(
          JSON.parse(
            await readFile(resolve(root, 'docs/evidence/tsk-06-5-production-closure.json'), 'utf8'),
          ),
          {
            masterDataVersion: master.version,
            artifact: 'docs/evidence/tsk-06-5-production-closure.json',
          },
        )
      : null;
  const parityGate = source ? evaluateProductionParityGate(source, audit) : null;
  const sharedAuditModel =
    source && parityGate?.status === 'passed' ? connectProductionAuditMatrix(source, audit) : null;
  failureArtifact = {
    identity,
    audit,
    ...(parityGate ? { parityGate } : {}),
    ...(sharedAuditModel ? { sharedAuditModel } : {}),
    stage: 'production-parity-gate',
  };

  if (parityGate?.status === 'failed') {
    if (parityGate.reason === 'parityFailure')
      throw new Error(`matrix_parity_failures:${String(parityGate.failures.length)}`);
    throw new TypeError(
      `production_parity_gate:${parityGate.canonicalIdentity}:${parityGate.firstDifference.path || '<record>'}`,
    );
  }

  if (audit.conditionCount !== selectedConditions.length)
    throw new Error(`matrix_condition_count:${audit.conditionCount}`);
  if (audit.attackProfileCount !== 433)
    throw new Error(`matrix_attack_profile_count:${audit.attackProfileCount}`);
  if (audit.outcomeCount !== 433 * selectedConditions.length)
    throw new Error(`matrix_outcome_count:${audit.outcomeCount}`);
  if (audit.outcomes.unsupported || audit.outcomes.invalid || audit.outcomes.inputRequired)
    throw new Error(`matrix_nonnumeric_outcomes:${JSON.stringify(audit.outcomes)}`);
  if (audit.parityFailures.length)
    throw new Error(`matrix_parity_failures:${String(audit.parityFailures.length)}`);

  await writeFile(
    resolve(output, manifestName),
    `${JSON.stringify(
      {
        identity,
        audit,
        ...(parityGate ? { parityGate } : {}),
        ...(sharedAuditModel ? { sharedAuditModel } : {}),
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify({
      output,
      digest: audit.digest,
      outcomes: audit.outcomes,
      parityCount: audit.parityCount,
    }),
  );
}

void audit().catch(async (error: unknown) => {
  const failure = {
    name: error instanceof Error ? error.name : 'Error',
    reason: error instanceof Error ? error.message : String(error),
  };
  try {
    await mkdir(output, { recursive: true });
    await writeFile(
      resolve(output, manifestName),
      `${JSON.stringify({ ...failureArtifact, status: 'failed', failure }, null, 2)}\n`,
    );
  } catch (artifactError) {
    const artifactFailure =
      artifactError instanceof Error ? artifactError.message : String(artifactError);
    console.error(`production_closure_failure_artifact_write_failed:${artifactFailure}`);
  }
  console.error(`${failure.name}:${failure.reason}`);
  process.exitCode = 1;
});
