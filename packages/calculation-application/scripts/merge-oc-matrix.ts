import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  productionClosureConditionKey,
  productionClosureConditions,
  type ProductionClosureAudit,
} from '../src/productionClosureAudit';

const root = resolve(import.meta.dirname, '../../..');
const output = resolve(root, process.argv[2] ?? '.test-results/tsk-06-45-production-closure');
const names = (await readdir(output))
  .filter((name) => /^manifest-shard-\d+\.json$/.test(name))
  .sort();
if (!names.length) throw new TypeError('production_closure_shards_missing');
const shards = await Promise.all(
  names.map(async (name) => JSON.parse(await readFile(resolve(output, name), 'utf8'))),
);
const identity = shards[0]!.identity;
if (shards.some((shard) => JSON.stringify(shard.identity) !== JSON.stringify(identity)))
  throw new TypeError('production_closure_shard_identity_mismatch');
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
    digest: createHash('sha256')
      .update(JSON.stringify(candidates.map(({ digest }) => digest)))
      .digest('hex'),
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
if (audit.outcomeCount !== 34_640)
  throw new TypeError(`production_closure_outcomes:${audit.outcomeCount}`);
if (audit.outcomes.unsupported || audit.outcomes.invalid || audit.outcomes.inputRequired)
  throw new TypeError(`production_closure_nonnumeric:${JSON.stringify(audit.outcomes)}`);
if (audit.parityFailures.length)
  throw new TypeError(`production_closure_parity:${String(audit.parityFailures.length)}`);
if (eligibility.conditionCount !== 80)
  throw new TypeError(`production_eligibility_condition_count:${eligibility.conditionCount}`);
if (eligibility.staticSemantics.unsupportedPrograms || eligibility.staticSemantics.invalidPrograms)
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
  `${JSON.stringify({ identity, audit }, null, 2)}\n`,
);
console.log(
  JSON.stringify({ output, digest: audit.digest, outcomes, parityCount: audit.parityCount }),
);
