import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { verifyArtifactFiles } from '../../../scripts/test-observation-lib.mjs';
import { firstCanonicalAuditDifference } from '@fgo-lab/master-data/production-audit';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { auditProductionClosure, productionClosureConditions } from '../src/productionClosureAudit';
import {
  auditProductionPreparationTransactionObservations,
  evaluateProductionFinalOutcomeGate,
  evaluateProductionPreparationTransactionGate,
  type ProductionFinalProfileOutcome,
  type ProductionPreparationTransactionObservation,
} from '../src/productionParityDiagnostics';
import { RANKING_ELIGIBILITY_DIGEST_PARTITION_COUNT } from '../src/rankingEligibilityAudit';

const root = resolve(import.meta.dirname, '../../..');
const output = resolve(root, process.argv[2] ?? '.test-results/tsk-06-45-production-closure');
let manifestName = 'manifest.json';
let failureArtifact: Record<string, unknown> = { output, stage: 'read-master' };
const conditionArtifacts: Array<{
  conditionKey: string;
  path: string;
  bytes: number;
  sha256: string;
}> = [];
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
  const shardCount = Number(process.env['FGO_AUDIT_SHARDS'] ?? '0');
  const shardIndex = Number(process.env['FGO_AUDIT_SHARD'] ?? '0');
  if (
    !Number.isSafeInteger(shardCount) ||
    shardCount !== RANKING_ELIGIBILITY_DIGEST_PARTITION_COUNT ||
    !Number.isSafeInteger(shardIndex) ||
    shardIndex < 0 ||
    shardIndex >= shardCount
  )
    throw new TypeError(
      `invalid_audit_shard:${String(shardIndex)}/${String(shardCount)}; require FGO_AUDIT_SHARDS=8 and FGO_AUDIT_SHARD=0..7, then merge-oc-matrix.ts`,
    );
  manifestName = `manifest-shard-${String(shardIndex)}.json`;
  const selectedConditions = productionClosureConditions().filter(
    (_, index) => index % shardCount === shardIndex,
  );
  const finalProfileFailures: ProductionFinalProfileOutcome[] = [];
  const preparationTransactionObservations: ProductionPreparationTransactionObservation[] = [];

  const audit = await auditProductionClosure(
    master,
    { servantBuilds: {} },
    versions,
    async ({ records, ...summary }) => {
      for (const value of records) {
        if (typeof value === 'object' && value !== null && 'status' in value) {
          if (
            value.status === 'calculated' &&
            'profileKey' in value &&
            typeof value.profileKey === 'string' &&
            'scenario' in value &&
            typeof value.scenario === 'object' &&
            value.scenario !== null &&
            'preNoblePhantasmPlan' in value.scenario &&
            Array.isArray(value.scenario.preNoblePhantasmPlan) &&
            'appliedPreparationActions' in value &&
            Array.isArray(value.appliedPreparationActions)
          )
            preparationTransactionObservations.push({
              conditionKey: summary.key,
              profileKey: value.profileKey,
              commands: value.scenario
                .preNoblePhantasmPlan as ProductionPreparationTransactionObservation['commands'],
              actions:
                value.appliedPreparationActions as ProductionPreparationTransactionObservation['actions'],
            });
        }
        if (
          typeof value === 'object' &&
          value !== null &&
          'profileKey' in value &&
          'status' in value &&
          (value.status === 'unsupported' ||
            value.status === 'invalid' ||
            value.status === 'inputRequired')
        )
          finalProfileFailures.push({
            conditionKey: summary.key,
            profileKey: String(value.profileKey),
            status: value.status,
          });
      }
      const content = `${JSON.stringify({ identity, summary, records })}\n`;
      await writeFile(resolve(output, `${summary.key}.json`), content);
      conditionArtifacts.push({
        conditionKey: summary.key,
        path: `${summary.key}.json`,
        bytes: Buffer.byteLength(content),
        sha256: createHash('sha256').update(content).digest('hex'),
      });
      failureArtifact = {
        output,
        identity,
        productionArtifacts: { conditionRecords: conditionArtifacts },
        stage: 'audit-conditions',
      };
      console.log(
        `${summary.key}: ${String(summary.calculated)} calculated, ${String(summary.unavailableUnderPolicy)} unavailable, ${summary.elapsedMs.toFixed(0)}ms`,
      );
    },
    selectedConditions,
  );
  failureArtifact = { output, identity, audit, stage: 'build-parity-gate' };
  const finalOutcomeGate = evaluateProductionFinalOutcomeGate({
    outcomes: audit.outcomes,
    failures: finalProfileFailures,
  });
  const preparationTransactionAudit = auditProductionPreparationTransactionObservations(
    preparationTransactionObservations,
  );
  const preparationTransactionGate = evaluateProductionPreparationTransactionGate({
    expectedCalculatedProfiles: audit.outcomes.calculated,
    ...preparationTransactionAudit,
  });
  const productionArtifacts = { conditionRecords: conditionArtifacts };
  const artifactVerificationResult = verifyArtifactFiles(
    output,
    conditionArtifacts.map(({ path, bytes, sha256 }) => ({
      path,
      format: 'json',
      allowEmpty: false,
      expectedBytes: bytes,
      expectedSha256: sha256,
    })),
  );
  const artifactDifference = artifactVerificationResult.errors.length
    ? firstCanonicalAuditDifference(
        [
          {
            identity: 'tsk-08:production-condition-artifacts',
            value: conditionArtifacts,
          },
        ],
        [
          {
            identity: 'tsk-08:production-condition-artifacts',
            value: artifactVerificationResult,
          },
        ],
      )
    : null;
  const artifactVerification = {
    ...artifactVerificationResult,
    firstDifference: artifactDifference,
  };
  failureArtifact = {
    identity,
    audit,
    productionArtifacts,
    artifactVerification,
    executionRatchets: {
      finalProfileOutcomes: finalOutcomeGate,
      preparationTransactions: preparationTransactionGate,
    },
    stage: 'production-parity-gate',
  };

  if (artifactVerification.errors.length > 0)
    throw new TypeError(
      `production_condition_artifact_verification:${artifactVerification.errors.join(',')}`,
    );

  if (finalOutcomeGate.status === 'failed')
    throw new TypeError(
      `production_final_outcome_gate:${finalOutcomeGate.canonicalIdentity}:${finalOutcomeGate.firstDifference.path}`,
    );

  if (preparationTransactionGate.status === 'failed')
    throw new TypeError(
      `production_preparation_transaction_gate:${preparationTransactionGate.canonicalIdentity}:${preparationTransactionGate.firstDifference.path}`,
    );

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
        productionArtifacts,
        artifactVerification,
        executionRatchets: {
          finalProfileOutcomes: finalOutcomeGate,
          preparationTransactions: preparationTransactionGate,
        },
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
