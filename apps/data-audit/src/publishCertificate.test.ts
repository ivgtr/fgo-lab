import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { ATLAS_EXPORT_KEYS, sourceCertificateSchema } from '@fgo-lab/master-data';
import { publishCertificate } from './publishCertificate';

const run = promisify(execFile);
const workspaces: string[] = [];
afterEach(async () => {
  await Promise.all(
    workspaces.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

it('publishes once per source and advances generation when a certified body changes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fgo-atlas-publication-'));
  workspaces.push(directory);
  const remote = join(directory, 'remote.git');
  await run('git', ['init', '--bare', '--quiet', remote]);
  const contract = 'd'.repeat(64);
  const candidate = sourceCertificateSchema.parse({
    format: 'fgo-lab-atlas-source-v1',
    region: 'JP',
    generation: 1,
    publishedAt: '2026-10-13T05:00:00.000Z',
    observedAt: '2026-10-13T04:00:00.000Z',
    rawCommit: 'a'.repeat(40),
    rawCommittedAt: '2026-10-12T15:00:00.000Z',
    exporterCommit: 'b'.repeat(40),
    publisherCommit: 'c'.repeat(40),
    contractSha256: contract,
    masterSchemaVersion: 57,
    canonicalSha256: 'e'.repeat(64),
    exports: ATLAS_EXPORT_KEYS.map((key) => ({ key, bytes: 2, sha256: 'f'.repeat(64) })),
    referencedSkills: [],
  });
  const publish = (value: typeof candidate, attempt: number) =>
    publishCertificate({
      candidate: value,
      remote,
      workspace: join(directory, `attempt-${String(attempt)}`),
      now: new Date(`2026-10-13T0${String(attempt + 5)}:00:00.000Z`),
      publisherCommit: candidate.publisherCommit,
      verifyDelivery: () => Promise.resolve(),
      beforeHeartbeat: () => Promise.resolve(),
    });
  const first = await publish(candidate, 1);
  expect(first).toMatchObject({ status: 'published', certificate: { generation: 1 } });
  const unchanged = await publish(
    { ...candidate, rawCommit: '1'.repeat(40), exporterCommit: '2'.repeat(40) },
    2,
  );
  expect(unchanged).toMatchObject({ status: 'unchanged', certificate: first.certificate });
  expect(unchanged.auditStatus.rawCommit).toBe('1'.repeat(40));
  const changed = await publish(
    {
      ...candidate,
      canonicalSha256: '0'.repeat(64),
      exports: [
        { ...candidate.exports[0]!, sha256: '0'.repeat(64) },
        ...candidate.exports.slice(1),
      ],
    },
    3,
  );
  expect(changed).toMatchObject({ status: 'published', certificate: { generation: 2 } });
  const file = await readFile(join(directory, 'attempt-3', 'JP', `${contract}.json`), 'utf8');
  expect(JSON.parse(file)).toEqual(changed.certificate);
  expect(changed.branchCommit).not.toBe(unchanged.branchCommit);
  await expect(
    publishCertificate({
      candidate: {
        ...candidate,
        exports: [
          { ...candidate.exports[0]!, sha256: '3'.repeat(64) },
          ...candidate.exports.slice(1),
        ],
      },
      remote,
      workspace: join(directory, 'attempt-4'),
      now: new Date('2026-10-13T09:00:00.000Z'),
      publisherCommit: candidate.publisherCommit,
      verifyDelivery: () => Promise.reject(new Error('edge unavailable')),
      beforeHeartbeat: () => Promise.resolve(),
    }),
  ).rejects.toThrow('edge unavailable');
  const statusAfterFailure = JSON.parse(
    await readFile(join(directory, 'attempt-4', 'JP', 'status.json'), 'utf8'),
  ) as { auditedAt: string };
  expect(statusAfterFailure.auditedAt).toBe(changed.auditStatus.auditedAt);
});
