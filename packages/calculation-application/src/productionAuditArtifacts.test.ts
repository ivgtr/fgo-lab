import { mkdtemp, readFile, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { compareProductionParity } from './productionParityDiagnostics';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import {
  decodeProductionAuditArtifact,
  productionAuditTestOptions,
  serializeProductionAuditArtifact,
  writeProductionAuditArtifact,
} from './productionAuditArtifacts';

it('round trips omitted undefined properties, array undefined, null, and absent properties', () => {
  const source = {
    firstDifference: { expected: undefined, actual: null },
    observations: [undefined, null, { resolvedValue: undefined }],
  };
  const before = structuredClone(source);
  const decoded = decodeProductionAuditArtifact(
    serializeProductionAuditArtifact(source),
  ) as typeof source;

  expect(decoded).toEqual(source);
  expect(Object.hasOwn(decoded.firstDifference, 'expected')).toBe(true);
  expect(Object.hasOwn(decoded.firstDifference, 'missing')).toBe(false);
  expect(decoded.firstDifference.actual).toBeNull();
  expect(Object.hasOwn(decoded.observations[2]!, 'resolvedValue')).toBe(true);
  expect(source).toEqual(before);
  expect(serializeProductionAuditArtifact(source).toString()).toContain('undefinedPaths');
});

it('preserves ordered Set and Map contents and nested missing values without changing the source', () => {
  const source = {
    set: new Set<unknown>(['second', 'first', undefined, null, { own: undefined }]),
    map: new Map<unknown, unknown>([
      ['z', new Set([null, undefined])],
      ['a', { value: undefined }],
      [undefined, null],
    ]),
    emptySet: new Set(),
    emptyMap: new Map(),
    nullObject: Object.assign(Object.create(null) as object, { value: undefined }),
    ordinary: { kind: 'set', members: [1] },
    dangerousKeys: JSON.parse('{"__proto__":{"value":1},"constructor":null}') as unknown,
  };
  const before = serializeProductionAuditArtifact(source);
  const decoded = decodeProductionAuditArtifact(before) as typeof source;
  expect(decoded).toEqual(source);
  expect([...decoded.set]).toEqual([...source.set]);
  expect([...decoded.map.keys()]).toEqual([...source.map.keys()]);
  expect(Object.getPrototypeOf(decoded.nullObject)).toBeNull();
  expect(Object.hasOwn(decoded.dangerousKeys as object, '__proto__')).toBe(true);
  expect(serializeProductionAuditArtifact(source)).toEqual(before);
  for (const value of [undefined, new Set([undefined]), new Map([['key', undefined]])])
    expect(decodeProductionAuditArtifact(serializeProductionAuditArtifact(value))).toEqual(value);
});

it('rejects malformed value metadata instead of guessing how to restore it', () => {
  for (const envelope of [
    { artifactVersion: 1, payload: null, undefinedPaths: [], containers: [] },
    { artifactVersion: 2, payload: {}, undefinedPaths: [['a'], ['a']], containers: [] },
    {
      artifactVersion: 2,
      payload: {},
      undefinedPaths: [['__proto__', 'polluted']],
      containers: [],
    },
    { artifactVersion: 2, payload: [], undefinedPaths: [[-1]], containers: [] },
    {
      artifactVersion: 2,
      payload: [1, 1],
      undefinedPaths: [],
      containers: [{ path: [], kind: 'set' }],
    },
    {
      artifactVersion: 2,
      payload: [
        ['a', 1],
        ['a', 2],
      ],
      undefinedPaths: [],
      containers: [{ path: [], kind: 'map' }],
    },
  ])
    expect(() => decodeProductionAuditArtifact(Buffer.from(JSON.stringify(envelope)))).toThrow();
});

it('rejects values that JSON transport cannot preserve', () => {
  const cycle: Record<string, unknown> = {};
  cycle['cycle'] = cycle;
  expect(() => serializeProductionAuditArtifact(cycle)).toThrow('artifact_cycle');
  expect(() => serializeProductionAuditArtifact({ value: 1n })).toThrow(
    'unsupported_artifact_value:bigint',
  );
  expect(() => serializeProductionAuditArtifact({ value: Number.NaN })).toThrow(
    'unsupported_artifact_number:NaN',
  );
  expect(() => serializeProductionAuditArtifact(new Date())).toThrow('artifact_non_plain_object');
  expect(() => serializeProductionAuditArtifact(Array(1))).toThrow('artifact_sparse_array');
});

it(
  'publishes complete bytes and a receipt through test metadata before assertions',
  productionAuditTestOptions(['tsk-08-artifact-contract.json']),
  async ({ task }) => {
    const payload = {
      canonicalIdentity: 'fixture:artifact-contract',
      observations: {
        groups: new Set(['second', 'first']),
        defaults: new Map([
          ['nullable', null],
          ['missing', undefined],
        ]),
      },
      snapshot: { firstDifference: null, resolvedValue: null },
      failures: Array.from({ length: 6 }, (_, index) =>
        compareProductionParity({
          conditionKey: 'artifact-fixture',
          profileKey: `profile-${String(index)}`,
          path: 'calculator',
          actualStatus: 'executable',
          expected: { value: index },
          actual: { value: index + 1 },
        }),
      ),
      missingValues: { expected: undefined, actual: null },
    };
    if (process.env['FGO_ARTIFACT_CONTRACT_EXPECT_FAILURE'] === 'before-save')
      throw new Error('intentional_producer_failure_before_publication');
    const malformedField = process.env['FGO_ARTIFACT_MALFORMED_FIELD'];
    if (malformedField) Reflect.deleteProperty(payload.failures[0]!, malformedField);
    await writeProductionAuditArtifact(task.meta, 'tsk-08-artifact-contract.json', payload);
    const bytes = await readFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR']!, 'tsk-08-artifact-contract.json'),
    );
    expect(decodeProductionAuditArtifact(bytes)).toEqual(payload);
    for (const failure of payload.failures) {
      expect(failure?.canonicalIdentity).toEqual(expect.any(String));
      expect(failure?.reason).toBe('canonicalMismatch');
      expect(failure?.firstDifference).toBeDefined();
      expect(failure?.firstDifference.identity).toBe(failure?.canonicalIdentity);
      expect(failure?.firstDifference.path).toBe('value');
    }
    if (process.env['FGO_ARTIFACT_CONTRACT_EXPECT_FAILURE'] === '1')
      throw new Error('intentional_domain_assertion_after_artifact_publication');
  },
);

it('rejects missing contracts, unsafe paths, duplicate publication and write failures', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'fgo-artifact-writer-'));
  vi.stubEnv('FGO_TEST_ARTIFACT_DIR', root);
  const options = (path: string) => productionAuditTestOptions([path]).meta;
  try {
    await expect(writeProductionAuditArtifact({}, 'missing.json', {})).rejects.toThrow(
      'contract_missing',
    );
    for (const path of ['../escape.json', '/absolute.json', 'a/../escape.json', 'a\\escape.json'])
      expect(() => options(path)).toThrow('artifact_path');
    expect(() => productionAuditTestOptions(['a//b.json', 'a/b.json'])).toThrow('duplicate');
    const meta = options('nested/value.json');
    await writeProductionAuditArtifact(meta, 'nested/value.json', { value: undefined });
    await expect(writeProductionAuditArtifact(meta, 'nested/value.json', {})).rejects.toThrow(
      'duplicate',
    );
    await expect(
      writeProductionAuditArtifact(options('nested/value.json'), 'nested/value.json', {}),
    ).rejects.toThrow('already_exists');
    await mkdir(resolve(root, 'directory.json'));
    await expect(
      writeProductionAuditArtifact(options('directory.json'), 'directory.json', {}),
    ).rejects.toThrow('already_exists');
    await writeFile(resolve(root, 'parent'), 'not a directory');
    await expect(
      writeProductionAuditArtifact(options('parent/value.json'), 'parent/value.json', {}),
    ).rejects.toThrow('unsafe_parent');
    const outside = await mkdtemp(resolve(tmpdir(), 'fgo-artifact-outside-'));
    await symlink(outside, resolve(root, 'escape'));
    await expect(
      writeProductionAuditArtifact(options('escape/value.json'), 'escape/value.json', {}),
    ).rejects.toThrow('unsafe_parent');
    await symlink(resolve(root, 'nested/value.json'), resolve(root, 'linked.json'));
    await expect(
      writeProductionAuditArtifact(options('linked.json'), 'linked.json', {}),
    ).rejects.toThrow('target_symlink');
    vi.stubEnv('FGO_TEST_ARTIFACT_DIR', '');
    await expect(
      writeProductionAuditArtifact(options('missing.json'), 'missing.json', {}),
    ).rejects.toThrow('directory_missing');
  } finally {
    vi.unstubAllEnvs();
  }
});
