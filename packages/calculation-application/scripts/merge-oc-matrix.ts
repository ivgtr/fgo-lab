import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  connectProductionAuditMatrix,
  createTsk065ProductionAuditSource,
} from '@fgo-lab/master-data/production-audit';
import {
  productionClosureConditionKey,
  productionClosureConditions,
  type ProductionClosureAudit,
} from '../src/productionClosureAudit';
import {
  combineRankingEligibilityPartitionDigests,
  RANKING_ELIGIBILITY_DIGEST_PARTITION_COUNT,
} from '../src/rankingEligibilityAudit';
import {
  evaluateProductionFinalOutcomeGate,
  evaluateProductionParityGate,
  type ProductionFinalOutcomeFailure,
  type ProductionFinalProfileOutcome,
} from '../src/productionParityDiagnostics';

const root = resolve(import.meta.dirname, '../../..');
const output = resolve(root, process.argv[2] ?? '.test-results/tsk-06-45-production-closure');
let failureArtifact: Record<string, unknown> = { output, stage: 'read-shards' };

async function merge(): Promise<void> {
  await mkdir(output, { recursive: true });
  const names = (await readdir(output))
    .filter((name) => /^manifest-shard-\d+\.json$/.test(name))
    .sort();
  const expectedShardNames = Array.from(
    { length: RANKING_ELIGIBILITY_DIGEST_PARTITION_COUNT },
    (_, index) => `manifest-shard-${String(index)}.json`,
  );
  if (JSON.stringify(names) !== JSON.stringify(expectedShardNames))
    throw new TypeError('production_closure_shard_partition_set_mismatch');
  const shards = await Promise.all(
    names.map(async (name) => JSON.parse(await readFile(resolve(output, name), 'utf8'))),
  );
  const identity = shards[0]!.identity;
  failureArtifact = { output, identity, stage: 'verify-master-identity' };
  if (shards.some((shard) => JSON.stringify(shard.identity) !== JSON.stringify(identity)))
    throw new TypeError('production_closure_shard_identity_mismatch');
  const masterBytes = await readFile(
    resolve(root, process.env['FGO_AUDIT_MASTER'] ?? 'apps/web/public/master/master.json'),
  );
  const masterSha256 = createHash('sha256').update(masterBytes).digest('hex');
  if (masterSha256 !== identity.masterSha256) {
    failureArtifact = {
      output,
      identity,
      masterSha256,
      expectedMasterSha256: identity.masterSha256,
      stage: 'verify-master-identity',
    };
    throw new TypeError(`production_closure_master_identity_mismatch:${identity.masterSha256}`);
  }
  const master = masterSnapshotSchema.parse(JSON.parse(masterBytes.toString()));
  const order = new Map(
    productionClosureConditions().map((condition, index) => [
      productionClosureConditionKey(condition),
      index,
    ]),
  );
  const conditionSummaries = shards
    .flatMap(
      (shard) => shard.audit.conditionSummaries as ProductionClosureAudit['conditionSummaries'],
    )
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
  const parityFailures = shards.flatMap(
    (shard) => shard.audit.parityFailures as ProductionClosureAudit['parityFailures'],
  );
  const finalProfileFailures = shards.flatMap((shard) => {
    const failures = shard.executionRatchets?.finalProfileOutcomes?.failures as
      readonly ProductionFinalOutcomeFailure[] | undefined;
    return (failures ?? []).flatMap((failure) =>
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
    const failures = shard.executionRatchets?.finalProfileOutcomes?.failures as
      readonly ProductionFinalOutcomeFailure[] | undefined;
    return (failures ?? []).flatMap((failure) =>
      failure.reason === 'finalProfileOutcomeIdentityMismatch' ? [failure.firstDifference] : [],
    );
  });
  const sumMaps = (values: readonly Record<string, number>[]) =>
    values.reduce<Record<string, number>>((sum, value) => {
      for (const [key, count] of Object.entries(value)) sum[key] = (sum[key] ?? 0) + count;
      return sum;
    }, {});
  const staticSemantics = shards[0]!.audit.eligibility.staticSemantics;
  if (
    shards.some(
      (shard) =>
        shard.audit.eligibility.staticSemantics.digest !== staticSemantics.digest ||
        JSON.stringify(shard.audit.eligibility.staticSemantics) !== JSON.stringify(staticSemantics),
    )
  )
    throw new TypeError('production_eligibility_static_inventory_mismatch');
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
    digest: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
  };
  const source = createTsk065ProductionAuditSource(
    JSON.parse(
      await readFile(resolve(root, 'docs/evidence/tsk-06-5-production-closure.json'), 'utf8'),
    ),
    {
      masterDataVersion: master.version,
      artifact: 'docs/evidence/tsk-06-5-production-closure.json',
    },
  );
  const parityGate = evaluateProductionParityGate(source, audit);
  const finalOutcomeGate = evaluateProductionFinalOutcomeGate({
    outcomes: audit.outcomes,
    failures: finalProfileFailures,
    inheritedIdentityFailures: inheritedOutcomeIdentityFailures,
  });
  const sharedAuditModel =
    parityGate.status === 'passed' ? connectProductionAuditMatrix(source, audit) : null;
  failureArtifact = {
    identity,
    audit,
    executionRatchets: { finalProfileOutcomes: finalOutcomeGate },
    parityGate,
    ...(sharedAuditModel ? { sharedAuditModel } : {}),
    stage: 'production-parity-gate',
  };
  if (parityGate.status === 'failed') {
    if (parityGate.reason === 'parityFailure')
      throw new Error(`production_closure_parity:${String(parityGate.failures.length)}`);
    throw new TypeError(
      `production_parity_gate:${parityGate.canonicalIdentity}:${parityGate.firstDifference.path || '<record>'}`,
    );
  }
  if (finalOutcomeGate.status === 'failed')
    throw new TypeError(
      `production_final_outcome_gate:${finalOutcomeGate.canonicalIdentity}:${finalOutcomeGate.firstDifference.path}`,
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
        identity,
        audit,
        executionRatchets: { finalProfileOutcomes: finalOutcomeGate },
        parityGate,
        ...(sharedAuditModel ? { sharedAuditModel } : {}),
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
    await writeFile(
      resolve(output, 'manifest.json'),
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
