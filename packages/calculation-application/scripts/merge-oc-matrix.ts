import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { verifyProductionMatrixRecords } from './production-matrix-records';
import { recordFailure } from '../src/productionClosureRecordIntegrity';
import {
  acceptProductionShardManifests,
  shardInputFailure,
} from '../src/productionShardAcceptance';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { verifyArtifactFiles } from '../../../scripts/test-observation-lib.mjs';
import {
  createProductionAuditSource,
  firstCanonicalAuditDifference,
} from '@fgo-lab/master-data/production-audit';
import {
  productionClosureConditionKey,
  productionClosureConditions,
  productionClosureMatrixDigest,
  type ProductionClosureAudit,
} from '../src/productionClosureAudit';
import {
  combineRankingEligibilityPartitionDigests,
  RANKING_ELIGIBILITY_DIGEST_PARTITION_COUNT,
} from '../src/rankingEligibilityAudit';
import {
  evaluateProductionFinalOutcomeGate,
  evaluateProductionPreparationTransactionGate,
  evaluateProductionParityGate,
  productionRecordComparisonFailure,
  type ProductionFinalProfileOutcome,
  type ProductionPreparationTransactionFailure,
  type ProductionPreparationTransactionSummary,
} from '../src/productionParityDiagnostics';

const root = resolve(import.meta.dirname, '../../..');
const output = resolve(root, process.argv[2] ?? '.test-results/production-matrix');
let failureArtifact: Record<string, unknown> = { output, stage: 'read-shards' };
let inputEvidence: Record<string, unknown> = {};

async function merge(): Promise<void> {
  await mkdir(output, { recursive: true });
  const names = (await readdir(output))
    .filter((name) => /^manifest-shard-\d+\.json$/.test(name))
    .sort();
  const expectedShardNames = Array.from(
    { length: RANKING_ELIGIBILITY_DIGEST_PARTITION_COUNT },
    (_, index) => `manifest-shard-${String(index)}.json`,
  );
  const shardInputs = verifyArtifactFiles(
    output,
    names.map((path) => ({ path, format: 'text', allowEmpty: false })),
  );
  inputEvidence = {
    shardInputs,
    conditionInputs: productionClosureConditions().map((condition) => ({
      path: `${productionClosureConditionKey(condition)}.json`,
    })),
  };
  const rawShards: unknown[] = [];
  const readFailures = [];
  for (const [index, name] of names.entries()) {
    try {
      rawShards.push(JSON.parse(await readFile(resolve(output, name), 'utf8')));
    } catch (error) {
      readFailures.push(
        shardInputFailure(
          'recordArtifactUnavailable',
          index,
          name,
          { readableJson: true },
          { readableJson: false, error: error instanceof Error ? error.message : String(error) },
        ),
      );
    }
  }
  inputEvidence['shards'] = rawShards;
  if (JSON.stringify(names) !== JSON.stringify(expectedShardNames))
    readFailures.push(
      shardInputFailure(
        'shardManifestShapeInvalid',
        0,
        'shardPartitions',
        expectedShardNames,
        names,
      ),
    );
  if (shardInputs.errors.length)
    readFailures.push(
      shardInputFailure(
        'recordArtifactUnavailable',
        0,
        'shardInputs',
        { errors: [] },
        { errors: shardInputs.errors },
      ),
    );
  const expectedConditionKeysByShard = Array.from(
    { length: RANKING_ELIGIBILITY_DIGEST_PARTITION_COUNT },
    (_, shardIndex) =>
      productionClosureConditions()
        .filter(
          (_, conditionIndex) =>
            conditionIndex % RANKING_ELIGIBILITY_DIGEST_PARTITION_COUNT === shardIndex,
        )
        .map(productionClosureConditionKey),
  );
  const accepted = readFailures.length
    ? {
        comparison: {
          status: 'failed' as const,
          failures: readFailures,
          firstDifference: readFailures[0]!.firstDifference,
        },
        shards: null,
      }
    : acceptProductionShardManifests(rawShards, expectedConditionKeysByShard);
  const acceptanceGate = productionRecordComparisonFailure(accepted.comparison);
  if (!accepted.shards || acceptanceGate) {
    // Known canonical paths remain inspectable even if declarations/gates are malformed.
    inputEvidence['conditionInputs'] = verifyArtifactFiles(
      output,
      productionClosureConditions().map((condition) => ({
        path: `${productionClosureConditionKey(condition)}.json`,
        format: 'json',
        allowEmpty: false,
      })),
    );
    failureArtifact = {
      output,
      stage: 'verify-shard-manifest',
      shardAcceptance: accepted.comparison,
      ...(acceptanceGate ? { parityGate: acceptanceGate } : {}),
    };
    throw new TypeError(
      `production_shard_manifest:${acceptanceGate?.reason}:${acceptanceGate?.canonicalIdentity}:${acceptanceGate?.firstDifference.path}:see_manifest`,
    );
  }
  const shards = accepted.shards;
  const conditionArtifacts = shards.flatMap((shard) => shard.productionArtifacts.conditionRecords);
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
  const artifactErrors = artifactVerificationResult.errors;
  const artifactDifference = artifactErrors.length
    ? firstCanonicalAuditDifference(
        [
          {
            identity: 'production-audit:production-condition-artifacts',
            value: expectedConditionKeysByShard,
          },
        ],
        [
          {
            identity: 'production-audit:production-condition-artifacts',
            value: { conditionArtifacts, errors: artifactErrors },
          },
        ],
      )
    : null;
  inputEvidence['productionArtifacts'] = { conditionRecords: conditionArtifacts };
  inputEvidence['conditionInputs'] = artifactVerificationResult;
  const artifactVerification = {
    ...artifactVerificationResult,
    errors: artifactErrors,
    firstDifference: artifactDifference,
  };
  const identity = shards[0]!.identity;
  failureArtifact = { output, identity, stage: 'verify-master-identity' };
  const masterBytes = await readFile(
    resolve(root, process.env['FGO_AUDIT_MASTER'] ?? 'apps/web/public/master/master.json'),
  );
  const masterSha256 = createHash('sha256').update(masterBytes).digest('hex');
  if (masterSha256 !== identity.masterSha256) {
    const failure = shardInputFailure(
      'recordIdentityMismatch',
      0,
      'identity.masterSha256',
      masterSha256,
      identity.masterSha256,
    );
    const parityGate = productionRecordComparisonFailure({
      status: 'failed',
      failures: [failure],
      firstDifference: failure.firstDifference,
    });
    failureArtifact = {
      output,
      identity,
      masterSha256,
      expectedMasterSha256: identity.masterSha256,
      parityGate,
      stage: 'verify-master-identity',
    };
    throw new TypeError(
      `production_closure_master_identity_mismatch:${failure.canonicalIdentity}:${failure.firstDifference.path}:see_manifest`,
    );
  }
  const master = masterSnapshotSchema.parse(JSON.parse(masterBytes.toString()));
  const order = new Map(
    productionClosureConditions().map((condition, index) => [
      productionClosureConditionKey(condition),
      index,
    ]),
  );
  const conditionSummaries = shards
    .flatMap((shard) => shard.audit.conditionSummaries)
    .sort((left, right) => order.get(left.key)! - order.get(right.key)!);
  if (
    conditionSummaries.length !== 80 ||
    new Set(conditionSummaries.map(({ key }) => key)).size !== 80
  )
    throw new TypeError(`production_closure_condition_count:${String(conditionSummaries.length)}`);
  const outcomes = {
    calculated: 0,
    unavailableUnderPolicy: 0,
    inputRequired: 0,
    invalid: 0,
    unsupported: 0,
  };
  for (const shard of shards)
    for (const key of Object.keys(outcomes) as (keyof typeof outcomes)[])
      outcomes[key] += shard.audit.outcomes[key];
  const parityFailures = shards.flatMap((shard) => shard.audit.parityFailures);
  const finalProfileFailures = shards.flatMap((shard) => {
    return shard.executionRatchets.finalProfileOutcomes.failures.flatMap((failure) =>
      failure.reason === 'finalProfileStatusPresent'
        ? [
            {
              conditionKey: failure.conditionKey,
              profileKey: failure.profileKey,
              status: failure.status,
            } satisfies ProductionFinalProfileOutcome,
          ]
        : [],
    );
  });
  const inheritedOutcomeIdentityFailures = shards.flatMap((shard) => {
    return shard.executionRatchets.finalProfileOutcomes.failures.flatMap((failure) =>
      failure.reason === 'finalProfileOutcomeIdentityMismatch' ? [failure.firstDifference] : [],
    );
  });
  const sumMaps = (values: readonly Record<string, number>[]) =>
    values.reduce<Record<string, number>>(
      (sum, value) => {
        for (const [key, count] of Object.entries(value)) sum[key] = (sum[key] ?? 0) + count;
        return sum;
      },
      Object.create(null) as Record<string, number>,
    );
  const staticSemantics = shards[0]!.audit.eligibility.staticSemantics;
  const admissions = shards.map((shard) => shard.audit.eligibility.admissions);
  const candidates = shards.map((shard) => shard.audit.eligibility.candidates);
  const candidateDigest = combineRankingEligibilityPartitionDigests(
    candidates.map((value, index) => ({
      partition: index,
      digest: value.digest,
    })),
  );
  const eligibility = {
    conditionCount: shards.reduce((sum, shard) => sum + shard.audit.eligibility.conditionCount, 0),
    staticSemantics,
    admissions: {
      observations: admissions.reduce((sum, value) => sum + value.observations, 0),
      dispositions: admissions.reduce((sum, value) => sum + value.dispositions, 0),
      byPolicy: sumMaps(admissions.map(({ byPolicy }) => byPolicy)),
      byKind: sumMaps(admissions.map(({ byKind }) => byKind)),
      shardDigests: admissions.map(({ digest }) => digest),
      digest: createHash('sha256')
        .update(JSON.stringify(admissions.map(({ digest }) => digest)))
        .digest('hex'),
    },
    candidates: {
      observations: candidates.reduce((sum, value) => sum + value.observations, 0),
      candidatePlans: candidates.reduce((sum, value) => sum + value.candidatePlans, 0),
      generated: candidates.reduce((sum, value) => sum + value.generated, 0),
      deduplicated: candidates.reduce((sum, value) => sum + value.deduplicated, 0),
      upperBound: candidates.reduce((sum, value) => sum + value.upperBound, 0),
      maximumSingleProfileUpperBound: Math.max(
        ...candidates.map(({ maximumSingleProfileUpperBound }) => maximumSingleProfileUpperBound),
      ),
      maximumSingleProfileGenerated: Math.max(
        ...candidates.map(({ maximumSingleProfileGenerated }) => maximumSingleProfileGenerated),
      ),
      byStatus: sumMaps(candidates.map(({ byStatus }) => byStatus)),
      byPolicy: sumMaps(candidates.map(({ byPolicy }) => byPolicy)),
      candidateSpaceStatus: sumMaps(
        candidates.map(({ candidateSpaceStatus }) => candidateSpaceStatus),
      ),
      shardDigests: candidates.map(({ digest }) => digest),
      digest: candidateDigest,
    },
  };
  const result = {
    conditionCount: conditionSummaries.length,
    attackProfileCount: 433,
    outcomeCount: Object.values(outcomes).reduce((sum, count) => sum + count, 0),
    outcomes,
    parityCount: shards.reduce((sum, shard) => sum + shard.audit.parityCount, 0),
    parityFailures,
    unavailable: shards.flatMap(
      (shard) => shard.audit.unavailable as ProductionClosureAudit['unavailable'],
    ),
    conditionSummaries,
    eligibility,
  };
  const audit = {
    ...result,
    digest: productionClosureMatrixDigest(result),
  };
  const sourcePath =
    process.argv[3] ?? 'packages/calculation-application/baselines/production-v1/source.json';
  const source = createProductionAuditSource(
    JSON.parse(await readFile(resolve(root, sourcePath), 'utf8')),
    {
      masterDataVersion: master.version,
      artifact: sourcePath,
    },
  );
  failureArtifact = { identity, audit, artifactVerification, stage: 'verify-canonical-records' };
  const canonicalRecords = await verifyProductionMatrixRecords({
    root,
    output,
    source,
    identity,
    shards,
    artifacts: conditionArtifacts,
    audit,
    master,
    versions: {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: APP_VERSION,
      masterDataVersion: master.version,
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
    },
  });
  const receiptFailure = recordFailure(
    'recordArtifactUnavailable',
    'production-audit:production-condition-artifacts',
    { errors: [] },
    { errors: artifactVerification.errors },
  );
  if (receiptFailure) {
    const failures = [...canonicalRecords.comparison.failures, receiptFailure];
    canonicalRecords.comparison = {
      status: 'failed',
      failures,
      firstDifference: failures[0]!.firstDifference,
    };
  }
  const parityGate = evaluateProductionParityGate(source, audit, canonicalRecords.comparison);
  if (parityGate.status === 'failed') {
    failureArtifact = {
      identity,
      audit,
      artifactVerification,
      canonicalRecords,
      shardAcceptance: accepted.comparison,
      parityGate,
      stage: 'verify-canonical-records',
    };
    throw new TypeError(
      `production_parity_gate:${parityGate.reason}:${parityGate.canonicalIdentity}:${parityGate.firstDifference.path || '<record>'}:see_manifest`,
    );
  }
  const finalOutcomeGate = evaluateProductionFinalOutcomeGate({
    outcomes: audit.outcomes,
    failures: finalProfileFailures,
    inheritedIdentityFailures: [...inheritedOutcomeIdentityFailures],
  });
  const preparationFailures: ProductionPreparationTransactionFailure[] = [];
  const preparationSummary: ProductionPreparationTransactionSummary = {
    calculatedProfiles: 0,
    commandCount: 0,
    actionCount: 0,
    npUseReceiptCount: 0,
  };
  for (const shard of shards) {
    const gate = shard.executionRatchets.preparationTransactions;
    for (const key of Object.keys(
      preparationSummary,
    ) as (keyof ProductionPreparationTransactionSummary)[])
      preparationSummary[key] += gate.summary[key];
    preparationFailures.push(...gate.failures);
  }
  const preparationTransactionGate = evaluateProductionPreparationTransactionGate({
    expectedCalculatedProfiles: audit.outcomes.calculated,
    summary: preparationSummary,
    failures: preparationFailures,
  });
  failureArtifact = {
    identity,
    audit,
    productionArtifacts: { conditionRecords: conditionArtifacts },
    artifactVerification,
    canonicalRecords,
    executionRatchets: {
      finalProfileOutcomes: finalOutcomeGate,
      preparationTransactions: preparationTransactionGate,
    },
    parityGate,
    stage: 'production-parity-gate',
  };
  if (artifactVerification.errors.length > 0)
    throw new TypeError(
      `production_condition_artifact_verification:${artifactVerification.errors.length}:see_manifest`,
    );
  if (finalOutcomeGate.status === 'failed')
    throw new TypeError(
      `production_final_outcome_gate:${finalOutcomeGate.canonicalIdentity}:${finalOutcomeGate.firstDifference.path}`,
    );
  if (preparationTransactionGate.status === 'failed')
    throw new TypeError(
      `production_preparation_transaction_gate:${preparationTransactionGate.canonicalIdentity}:${preparationTransactionGate.firstDifference.path}`,
    );
  if (audit.outcomeCount !== 34_640)
    throw new TypeError(`production_closure_outcomes:${audit.outcomeCount}`);
  if (audit.outcomes.unsupported || audit.outcomes.invalid || audit.outcomes.inputRequired)
    throw new TypeError(`production_closure_nonnumeric:${JSON.stringify(audit.outcomes)}`);
  if (audit.parityFailures.length)
    throw new TypeError(`production_closure_parity:${String(audit.parityFailures.length)}`);
  if (eligibility.conditionCount !== 80)
    throw new TypeError(`production_eligibility_condition_count:${eligibility.conditionCount}`);
  if (
    eligibility.staticSemantics.unsupportedPrograms ||
    eligibility.staticSemantics.invalidPrograms
  )
    throw new TypeError(
      `production_eligibility_static_failure:${JSON.stringify({
        unsupported: eligibility.staticSemantics.unsupportedPrograms,
        invalid: eligibility.staticSemantics.invalidPrograms,
      })}`,
    );
  if (
    eligibility.candidates.generated !==
      conditionSummaries.reduce(
        (sum, summary) => sum + summary.candidateInventory.generatedCount,
        0,
      ) ||
    eligibility.candidates.upperBound !==
      conditionSummaries.reduce(
        (sum, summary) => sum + summary.candidateInventory.semanticUpperBound,
        0,
      )
  )
    throw new TypeError('production_eligibility_candidate_inventory_mismatch');
  if (
    eligibility.candidates.maximumSingleProfileUpperBound > 4_096 ||
    eligibility.candidates.maximumSingleProfileGenerated > 4_096
  )
    throw new TypeError('production_eligibility_candidate_cap_exceeded');
  await writeFile(
    resolve(output, 'manifest.json'),
    `${JSON.stringify(
      {
        ...inputEvidence,
        identity,
        audit,
        productionArtifacts: { conditionRecords: conditionArtifacts },
        artifactVerification,
        canonicalRecords,
        executionRatchets: {
          finalProfileOutcomes: finalOutcomeGate,
          preparationTransactions: preparationTransactionGate,
        },
        parityGate,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    JSON.stringify({ output, digest: audit.digest, outcomes, parityCount: audit.parityCount }),
  );
}

void merge().catch(async (error: unknown) => {
  const failure = {
    name: error instanceof Error ? error.name : 'Error',
    reason: error instanceof Error ? error.message : String(error),
  };
  try {
    await mkdir(output, { recursive: true });
    inputEvidence['rawConditionInputs'] = verifyArtifactFiles(
      output,
      productionClosureConditions().map((condition) => ({
        path: `${productionClosureConditionKey(condition)}.json`,
        format: 'text',
        allowEmpty: false,
      })),
    );
    await writeFile(
      resolve(output, 'manifest.json'),
      `${JSON.stringify({ ...inputEvidence, ...failureArtifact, status: 'failed', failure }, null, 2)}\n`,
    );
  } catch (artifactError) {
    const artifactFailure =
      artifactError instanceof Error ? artifactError.message : String(artifactError);
    console.error(`production_closure_failure_artifact_write_failed:${artifactFailure}`);
  }
  const boundedText = (value: string) => (value.length > 512 ? `${value.slice(0, 512)}…` : value);
  console.error(boundedText(`${failure.name}:${failure.reason}`));
  const gate = failureArtifact['parityGate'] as
    ReturnType<typeof evaluateProductionParityGate> | undefined;
  if (gate?.status === 'failed') {
    const boundedValue = (value: unknown) => {
      const text = JSON.stringify(value) ?? 'missing';
      return text.length > 512 ? `${text.slice(0, 512)}…` : text;
    };
    console.error(
      JSON.stringify({
        reason: gate.reason,
        identity: boundedText(gate.firstDifference.identity),
        path: boundedText(gate.firstDifference.path),
        expected: boundedValue(gate.firstDifference.expected),
        actual: boundedValue(gate.firstDifference.actual),
        failures: gate.failures.length,
        artifact: boundedText(resolve(output, 'manifest.json')),
      }),
    );
  }
  process.exitCode = 1;
});
