import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import evidence from '../../../docs/evidence/tsk-06-5-production-closure.json';
import { createTsk065ProductionAuditSource } from '@fgo-lab/master-data/production-audit';
import {
  readProductionBaselineManifest,
  readProductionBaselineCondition,
  productionBaselineSha256,
  type ProductionBaselineManifest,
} from './productionRegressionBaseline';
import { inspectProductionConditionRecords } from './productionClosureRecordIntegrity';
import { productionClosureRecordDigest } from './productionClosureAudit';

const root = resolve(import.meta.dirname, '../../..');
const source = createTsk065ProductionAuditSource(evidence, {
  masterDataVersion: evidence.productionMatrix.canonicalRecords.identity.masterDataVersion,
  artifact: 'docs/evidence/tsk-06-5-production-closure.json',
});
const reference = source.matrix.canonicalRecords;
const original = JSON.parse(
  await readFile(resolve(root, reference.manifest), 'utf8'),
) as ProductionBaselineManifest;
async function header(mutate: (value: ProductionBaselineManifest) => void) {
  const directory = await mkdtemp(resolve(tmpdir(), 'fgo-baseline-header-'));
  const value = structuredClone(original);
  mutate(value);
  const bytes = Buffer.from(JSON.stringify(value));
  await writeFile(resolve(directory, 'manifest.json'), bytes);
  return readProductionBaselineManifest(directory, {
    ...reference,
    manifest: 'manifest.json',
    bytes: bytes.length,
    sha256: productionBaselineSha256(bytes),
  });
}
const key = original.conditions[0]!.conditionKey;
const records = [
  {
    profileKey: 'fixture-profile',
    status: 'unavailableUnderPolicy',
    reason: 'fixture',
    diagnostics: null,
  },
];
const summary = {
  ...original.audit.conditionSummaries[0]!,
  calculated: 0,
  unavailableUnderPolicy: 1,
  parityCount: 0,
  digest: productionClosureRecordDigest(records),
};
async function body(
  value: unknown,
  mutate?: (declaration: (typeof original.conditions)[number], compressed: Buffer) => void,
) {
  const directory = await mkdtemp(resolve(tmpdir(), 'fgo-baseline-body-'));
  const content = Buffer.from(JSON.stringify(value));
  const compressed = gzipSync(content);
  const declaration = {
    conditionKey: key,
    path: `${key}.json.gz`,
    bytes: compressed.length,
    sha256: productionBaselineSha256(compressed),
    contentBytes: content.length,
    contentSha256: productionBaselineSha256(content),
  };
  if (mutate) mutate(declaration, compressed);
  await writeFile(resolve(directory, declaration.path), compressed);
  return readProductionBaselineCondition({ directory, declaration, summary, profileCount: 1 });
}
it('loads the fixed approved coverage, inventory and digest without run metadata', async () => {
  const result = await readProductionBaselineManifest(root, reference);
  expect(result.status).toBe('accepted');
  expect(result.failures).toEqual([]);
  expect(original.audit.outcomeCount).toBe(34640);
  expect(
    original.audit.conditionSummaries.every((value) => !Object.hasOwn(value, 'elapsedMs')),
  ).toBe(true);
  expect(Object.keys(original.identity).sort()).toEqual([
    'command',
    'masterDataVersion',
    'masterSha256',
    'matrix',
  ]);
});
it.each([
  ['unknown root', (value: ProductionBaselineManifest) => Object.assign(value, { rawLog: 'bad' })],
  [
    'unknown aggregate',
    (value: ProductionBaselineManifest) =>
      Object.assign(value.audit.eligibility.candidates, { additionalAggregate: 0 }),
  ],
  [
    'run time in baseline',
    (value: ProductionBaselineManifest) =>
      Object.assign(value.audit.conditionSummaries[0]!, { elapsedMs: 0 }),
  ],
  ['coverage missing', (value: ProductionBaselineManifest) => value.conditions.pop()],
  [
    'coverage duplicate',
    (value: ProductionBaselineManifest) => {
      value.conditions[1] = value.conditions[0]!;
    },
  ],
  [
    'identity mismatch',
    (value: ProductionBaselineManifest) => {
      value.identity.masterDataVersion = 'foreign';
    },
  ],
  [
    'path traversal',
    (value: ProductionBaselineManifest) => {
      value.conditions[0]!.path = '../foreign.json.gz';
    },
  ],
  [
    'null audit',
    (value: ProductionBaselineManifest) => {
      (value as unknown as Record<string, unknown>)['audit'] = null;
    },
  ],
  [
    'null count',
    (value: ProductionBaselineManifest) => {
      (value.audit as unknown as Record<string, unknown>)['outcomeCount'] = null;
    },
  ],
  [
    'missing count',
    (value: ProductionBaselineManifest) => {
      delete (value.audit as unknown as Record<string, unknown>)['outcomeCount'];
    },
  ],
])('rejects %s even with a valid manifest storage receipt', async (_name, mutate) => {
  const result = await header(mutate);
  expect(result.status).toBe('failed');
  expect(result.failures.length).toBeGreaterThan(0);
});
it('distinguishes null, absent and changed finite values in the complete body', async () => {
  expect((await body({ conditionKey: key, records })).failures).toEqual([]);
  for (const changed of [
    { ...records[0], diagnostics: 0 },
    { profileKey: 'fixture-profile', status: 'unavailableUnderPolicy', reason: 'fixture' },
    { ...records[0], unexpected: 0 },
  ]) {
    const result = await body({ conditionKey: key, records: [changed] });
    expect(result.failures.some((value) => value.reason === 'recordDigestMismatch')).toBe(true);
  }
  expect((await body({ conditionKey: key, records: null })).status).toBe('failed');
  expect((await body({ conditionKey: key, records, unknown: 0 })).status).toBe('failed');
  expect((await body({ conditionKey: 'foreign', records })).status).toBe('failed');
});
it('rejects compressed corruption and decoded-content receipt mismatch independently', async () => {
  for (const mutate of [
    (d: (typeof original.conditions)[number], bytes: Buffer) => {
      bytes[0] = 0;
      d.sha256 = productionBaselineSha256(bytes);
    },
    (d: (typeof original.conditions)[number]) => {
      d.contentSha256 = '0'.repeat(64);
    },
    (d: (typeof original.conditions)[number]) => {
      d.contentBytes--;
    },
    (d: (typeof original.conditions)[number]) => {
      d.sha256 = '0'.repeat(64);
    },
  ])
    expect((await body({ conditionKey: key, records }, mutate)).failures[0]?.reason).toBe(
      'recordArtifactUnavailable',
    );
});
it('refuses every invalid number before encoding and retains all issue paths', () => {
  const malformed = Array.from({ length: 1024 }, (_, index) => ({
    ...records[0],
    profileKey: `fixture-${index}`,
    diagnostics: index % 2 ? Number.NaN : -0,
  }));
  const result = inspectProductionConditionRecords({
    records: malformed,
    conditionKey: key,
    summary,
    profileCount: 1024,
  });
  expect(result.status).toBe('failed');
  expect(result.failures).toHaveLength(1024);
  expect(result.failures[0]!.firstDifference.path).toBe('0.diagnostics');
  expect(result.failures[1023]!.firstDifference.path).toBe('1023.diagnostics');
});
it('rejects old-only and mixed source declarations instead of dropping keys', () => {
  const invalid = structuredClone(evidence);
  Object.assign(invalid.productionMatrix.canonicalRecords.identity, {
    head: original.origin.head,
    worktree: '',
  });
  expect(() =>
    createTsk065ProductionAuditSource(invalid, {
      masterDataVersion: evidence.productionMatrix.canonicalRecords.identity.masterDataVersion,
      artifact: 'fixture',
    }),
  ).toThrow('invalid_keys');
  delete (
    invalid.productionMatrix.canonicalRecords as Partial<
      typeof invalid.productionMatrix.canonicalRecords
    >
  ).format;
  expect(() =>
    createTsk065ProductionAuditSource(invalid, {
      masterDataVersion: evidence.productionMatrix.canonicalRecords.identity.masterDataVersion,
      artifact: 'fixture',
    }),
  ).toThrow('invalid_keys');
});
