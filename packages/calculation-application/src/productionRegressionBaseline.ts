import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { z } from 'zod';
import type { ProductionAuditSource } from '@fgo-lab/master-data/production-audit';
import { inspectProductionAuditValue } from './productionAuditValue';
import {
  productionClosureMatrixDigest,
  type ProductionClosureAudit,
  type ProductionClosureConditionRecord,
} from './productionClosureAudit';
import {
  inspectProductionMatrixAuditShapes,
  inspectProductionAuditAggregate,
  inspectProductionConditionRecords,
  recordFailure,
  type ProductionRecordFailure,
} from './productionClosureRecordIntegrity';
import { inspectProductionConditionSummaries } from './productionShardAcceptance';

export const PRODUCTION_BASELINE_FORMAT = 'production-regression-v1' as const;
export type ProductionBaselineAudit = Omit<
  ProductionClosureAudit,
  'conditionSummaries' | 'eligibility'
> & {
  eligibility: Omit<ProductionClosureAudit['eligibility'], 'digest'> & {
    admissions: ProductionClosureAudit['eligibility']['admissions'] & { shardDigests: string[] };
    candidates: ProductionClosureAudit['eligibility']['candidates'] & { shardDigests: string[] };
  };
  conditionSummaries: readonly Omit<ProductionClosureConditionRecord, 'records' | 'elapsedMs'>[];
};
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const positive = z.number().int().positive();
const identitySchema = z.strictObject({
  masterDataVersion: z.string().min(1),
  masterSha256: hash,
  command: z.string().min(1),
  matrix: z.string().min(1),
});
export const productionBaselineManifestSchema = z.strictObject({
  format: z.literal(PRODUCTION_BASELINE_FORMAT),
  identity: identitySchema,
  origin: z.strictObject({
    head: z.string().regex(/^[a-f0-9]{40}$/),
    manifestBytes: positive,
    manifestSha256: hash,
  }),
  audit: z.unknown(),
  conditions: z.array(
    z.strictObject({
      conditionKey: z.string().min(1),
      path: z.string().min(1),
      bytes: positive,
      sha256: hash,
      contentBytes: positive,
      contentSha256: hash,
    }),
  ),
});
export type ProductionBaselineDeclaration = z.infer<
  typeof productionBaselineManifestSchema
>['conditions'][number];
export type ProductionBaselineManifest = Omit<
  z.infer<typeof productionBaselineManifestSchema>,
  'audit'
> & { audit: ProductionBaselineAudit };
export const productionBaselineSha256 = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

// Frozen production-regression-v1 selection. Its seven fields describe the
// historical bytes; current RankingSelection must not reinterpret this input.
const historicalConditions = () => {
  const conditions = [];
  for (const levelBasis of ['naturalLimit', 'uniformLevel90'] as const)
    for (const selfBuffs of ['included', 'excluded'] as const)
      for (const conditionalEffects of ['baseline', 'satisfied'] as const)
        for (const npLevel of [1, 2, 3, 4, 5] as const)
          for (const initialOvercharge of [1, 2, 3] as const) {
            const legalMaximum = npLevel === 1 ? 1 : npLevel === 5 ? 3 : 2;
            if (initialOvercharge > legalMaximum) continue;
            conditions.push({
              population: 'all' as const,
              initialOvercharge,
              levelBasis,
              npLevelBasis: { kind: 'specified' as const, npLevel },
              classAffinity: 'neutral' as const,
              selfBuffs,
              conditionalEffects,
            });
          }
  return conditions;
};
const historicalConditionKey = (condition: ReturnType<typeof historicalConditions>[number]) =>
  `${condition.levelBasis}-${condition.selfBuffs}-${condition.conditionalEffects}-np${String(condition.npLevelBasis.npLevel)}-oc${String(condition.initialOvercharge)}`;

function failure(
  reason: ProductionRecordFailure['reason'],
  identity: string,
  expected: unknown,
  actual: unknown,
) {
  return recordFailure(reason, identity, expected, actual)!;
}
function valueFailures(value: unknown, identity: string): ProductionRecordFailure[] {
  const domain = inspectProductionAuditValue(value);
  return domain.status === 'accepted'
    ? []
    : domain.issues.map((issue) => ({
        ...failure('recordValueInvalid', identity, { auditValue: 'accepted' }, { issue }),
        firstDifference: {
          identity,
          path: issue.path,
          expected: { auditValue: 'accepted' },
          actual: { issue },
        },
      }));
}

/** The fixed reference is the authority. No directory search or regenerated expectation. */
export async function readProductionBaselineManifest(
  root: string,
  reference: ProductionAuditSource['matrix']['canonicalRecords'],
) {
  const identity = 'production-regression:canonical-record-reference';
  const path = resolve(root, reference.manifest);
  const failures: ProductionRecordFailure[] = [];
  const receipt = {
    path: reference.manifest,
    expectedBytes: reference.bytes,
    expectedSha256: reference.sha256,
    errors: [] as string[],
  };
  const reject = () => ({
    status: 'failed' as const,
    manifest: null,
    directory: dirname(path),
    failures,
    receipt,
  });
  let bytes: Buffer;
  let value: unknown;
  try {
    bytes = await readFile(path);
    const actual = { bytes: bytes.length, sha256: productionBaselineSha256(bytes) };
    const mismatch = recordFailure(
      'recordArtifactUnavailable',
      identity,
      { bytes: reference.bytes, sha256: reference.sha256 },
      actual,
    );
    if (mismatch) {
      failures.push(mismatch);
      receipt.errors.push('baseline_manifest_receipt_mismatch');
      return reject();
    }
    value = JSON.parse(bytes.toString('utf8'));
  } catch (cause) {
    receipt.errors.push('baseline_manifest_unreadable');
    failures.push(
      failure(
        'recordArtifactUnavailable',
        identity,
        { readable: true },
        { readable: false, error: String(cause) },
      ),
    );
    return reject();
  }
  failures.push(...valueFailures(value, identity));
  if (failures.length) return reject();
  const shape = productionBaselineManifestSchema.safeParse(value);
  if (!shape.success) {
    for (const issue of shape.error.issues)
      failures.push(
        failure(
          'recordShapeInvalid',
          identity,
          { schema: PRODUCTION_BASELINE_FORMAT },
          { path: issue.path.join('.'), message: issue.message },
        ),
      );
    return reject();
  }
  const manifest = value as ProductionBaselineManifest;
  const add = (
    reason: ProductionRecordFailure['reason'],
    suffix: string,
    expected: unknown,
    actual: unknown,
  ) => {
    const mismatch = recordFailure(reason, `${identity}:${suffix}`, expected, actual);
    if (mismatch) failures.push(mismatch);
  };
  add('recordIdentityMismatch', 'format', reference.format, manifest.format);
  add('recordIdentityMismatch', 'identity', reference.identity, manifest.identity);
  failures.push(...inspectProductionMatrixAuditShapes([manifest.audit]).failures);
  if (failures.length) return reject();
  failures.push(
    ...inspectProductionConditionSummaries(manifest.audit.conditionSummaries, 'baseline').failures,
  );
  if (failures.length) return reject();
  const conditions = historicalConditions();
  const keys = conditions.map(historicalConditionKey);
  add(
    'recordSummaryMismatch',
    'coverage',
    keys,
    manifest.conditions.map((d) => d.conditionKey),
  );
  add(
    'recordSummaryMismatch',
    'summary-coverage',
    keys,
    manifest.audit.conditionSummaries.map((s) => s.key),
  );
  for (const declaration of manifest.conditions)
    add(
      'recordShapeInvalid',
      declaration.conditionKey,
      `${declaration.conditionKey}.json.gz`,
      declaration.path,
    );
  for (const [index, summary] of manifest.audit.conditionSummaries.entries())
    add(
      'recordSummaryMismatch',
      `${summary.key}:conditions`,
      conditions[index] ?? { present: false },
      summary.conditions,
    );
  failures.push(
    ...inspectProductionAuditAggregate(manifest.audit, 'production-regression:baseline-matrix'),
  );
  const { digest, ...audit } = manifest.audit;
  add('recordDigestMismatch', 'matrix-digest', digest, productionClosureMatrixDigest(audit));
  if (failures.length) return reject();
  return { status: 'accepted' as const, manifest, directory: dirname(path), failures, receipt };
}

export async function readProductionBaselineCondition(input: {
  directory: string;
  declaration: ProductionBaselineDeclaration;
  summary: ProductionBaselineAudit['conditionSummaries'][number];
  profileCount: number;
}) {
  const { declaration, directory } = input;
  const identity = `production:${declaration.conditionKey}`;
  const failures: ProductionRecordFailure[] = [];
  const reject = () => ({ status: 'failed' as const, records: [], failures });
  let value: unknown;
  try {
    const bytes = await readFile(resolve(directory, declaration.path));
    const mismatch = recordFailure(
      'recordArtifactUnavailable',
      identity,
      { bytes: declaration.bytes, sha256: declaration.sha256 },
      { bytes: bytes.length, sha256: productionBaselineSha256(bytes) },
    );
    if (mismatch) {
      failures.push(mismatch);
      return reject();
    }
    const content = gunzipSync(bytes, { maxOutputLength: declaration.contentBytes });
    const contentMismatch = recordFailure(
      'recordArtifactUnavailable',
      identity,
      { bytes: declaration.contentBytes, sha256: declaration.contentSha256 },
      { bytes: content.length, sha256: productionBaselineSha256(content) },
    );
    if (contentMismatch) {
      failures.push(contentMismatch);
      return reject();
    }
    value = JSON.parse(content.toString('utf8'));
  } catch (cause) {
    failures.push(
      failure(
        'recordArtifactUnavailable',
        identity,
        { readable: true },
        { readable: false, error: String(cause) },
      ),
    );
    return reject();
  }
  failures.push(...valueFailures(value, identity));
  if (failures.length) return reject();
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    failures.push(
      failure('recordShapeInvalid', identity, { shape: 'conditionKey/records' }, value),
    );
    return reject();
  }
  const body = value as Record<string, unknown>;
  const shape = recordFailure(
    'recordShapeInvalid',
    identity,
    ['conditionKey', 'records'],
    Object.keys(body).sort(),
  );
  const key = recordFailure(
    'recordIdentityMismatch',
    identity,
    declaration.conditionKey,
    body['conditionKey'] ?? { present: false },
  );
  if (shape) failures.push(shape);
  if (key) failures.push(key);
  if (failures.length) return reject();
  return inspectProductionConditionRecords({
    records: body['records'],
    conditionKey: declaration.conditionKey,
    summary: input.summary,
    profileCount: input.profileCount,
  });
}
