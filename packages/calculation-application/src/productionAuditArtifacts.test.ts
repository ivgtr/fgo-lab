import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { compareProductionParity } from './productionParityDiagnostics';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  decodeStoredProductionAuditArtifact,
  decodeProductionAuditArtifact,
  productionAuditTestOptions,
  serializeProductionAuditArtifact,
  writeProductionAuditArtifact,
  readStoredProductionAuditArtifact,
  encodeProductionAuditDiagnostic,
  decodeProductionAuditDiagnostic,
  decodeStoredProductionAuditDiagnostic,
} from './productionAuditArtifacts';

it('restores every diagnostic string and rejects an alien version or missing string entry', () => {
  const path = 'owner.canonical.state.'.repeat(40);
  const source = {
    path,
    failure: { path, own: undefined },
    values: [path, '', '\ud800', `${'a'.repeat(127)}😀`],
  };
  const encoded = encodeProductionAuditDiagnostic(source);
  expect(serializeProductionAuditArtifact(encoded).length).toBeLessThan(path.length * 2);
  expect(decodeProductionAuditDiagnostic(encoded)).toEqual(source);
  expect(() => decodeProductionAuditDiagnostic({ ...encoded, version: 1 })).toThrow(
    'invalid_diagnostic_version',
  );
  expect(() => decodeProductionAuditDiagnostic({ ...encoded, strings: [] })).toThrow(
    'invalid_diagnostic_string_reference',
  );
  expect(
    decodeProductionAuditDiagnostic(encodeProductionAuditDiagnostic(undefined)),
  ).toBeUndefined();
});

it('owns completed diagnostic values and does not trust copies or later input mutations', () => {
  const key = { value: 1 };
  const source = {
    key,
    set: new Set([key, { value: 1 }]),
    map: new Map([
      [key, undefined],
      [{ value: 1 }, null],
    ]),
  };
  const completed = encodeProductionAuditDiagnostic(source);
  const before = serializeProductionAuditArtifact(completed);
  expect(Object.isFrozen(completed)).toBe(true);
  expect(Object.isFrozen(completed.nodes)).toBe(true);
  for (const node of completed.nodes) {
    expect(Object.isFrozen(node)).toBe(true);
    if ('entries' in node) {
      expect(Object.isFrozen(node.entries)).toBe(true);
      for (const entry of node.entries) expect(Object.isFrozen(entry)).toBe(true);
    }
  }
  expect(Reflect.set(completed.nodes[0]!, 'kind', 'alien')).toBe(false);
  expect(Reflect.set(completed, 'version', 99)).toBe(false);
  key.value = 2;
  expect(serializeProductionAuditArtifact(completed)).toEqual(before);
  expect(serializeProductionAuditArtifact(encodeProductionAuditDiagnostic(source))).not.toEqual(
    before,
  );
  const restored = decodeProductionAuditDiagnostic(completed) as typeof source;
  expect(restored.key.value).toBe(1);
  expect(restored.set.size).toBe(2);
  expect(restored.map.size).toBe(2);
  expect(restored.set.has(restored.key)).toBe(true);
  expect(decodeStoredProductionAuditDiagnostic(gzipSync(before, { level: 1 }))).toEqual(restored);
  expect(serializeProductionAuditArtifact({ ...completed })).toEqual(before);
});

it('rejects unsafe diagnostic sources without executing getters or proxy traps', () => {
  let calls = 0;
  const array = Object.defineProperty([], '0', { enumerable: true, get: () => ++calls });
  const proxy = new Proxy(
    {},
    {
      ownKeys: () => {
        calls++;
        return [];
      },
    },
  );
  for (const value of [
    array,
    proxy,
    Object.assign(new Set([1]), { extra: true }),
    Object.assign(new Map(), { extra: true }),
  ])
    expect(() => encodeProductionAuditDiagnostic(value)).toThrow(TypeError);
  expect(() => serializeProductionAuditArtifact(proxy)).toThrow('artifact_proxy');
  expect(calls).toBe(0);
});

it('rejects alien diagnostic fields, nodes, references and collection entries', () => {
  const encoded = encodeProductionAuditDiagnostic({ value: undefined });
  const invalid = [
    { ...encoded, future: true },
    { ...encoded, nodes: encoded.nodes.map((node) => ({ ...node, future: true })) },
    { ...encoded, root: -100 },
    { ...encoded, root: { kind: 'literal', value: -0 } },
    { ...encoded, strings: [{ prefix: 0, suffix: 'forward' }] },
    { ...encoded, root: 1, nodes: [{ kind: 'undefined' }, { kind: 'set', items: [0, 0] }] },
    {
      ...encoded,
      root: 1,
      nodes: [
        { kind: 'undefined' },
        {
          kind: 'map',
          entries: [
            [0, 0],
            [0, 0],
          ],
        },
      ],
    },
  ];
  for (const value of invalid)
    expect(() => decodeProductionAuditDiagnostic(value as unknown as typeof encoded)).toThrow(
      TypeError,
    );
  for (const value of invalid)
    expect(() =>
      decodeStoredProductionAuditDiagnostic(
        gzipSync(serializeProductionAuditArtifact(value), { level: 1 }),
      ),
    ).toThrow(TypeError);
  const negativeZeroBytes = Buffer.from(
    '{"artifactVersion":2,"payload":{"version":4,"root":{"kind":"literal","value":-0},"nodes":[],"strings":[]},"undefinedPaths":[],"containers":[]}',
  );
  expect(() =>
    decodeStoredProductionAuditDiagnostic(gzipSync(negativeZeroBytes, { level: 1 })),
  ).toThrow('invalid_diagnostic_literal');
});

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

it('restores metadata at every shared occurrence and preserves subsequent mutations', () => {
  const shared = {
    value: 1,
    own: undefined,
    array: [undefined],
    set: new Set([{ value: 1 }, { value: 1 }, undefined]),
    map: new Map([
      [{ key: 1 }, undefined],
      [{ key: 1 }, null],
    ]),
    nullObject: Object.assign(Object.create(null) as object, { own: undefined }),
  };
  const source = { first: shared, second: shared, nested: [shared] };
  const bytes = serializeProductionAuditArtifact(source);
  const restored = decodeProductionAuditArtifact(bytes) as typeof source;
  expect(restored).toEqual(source);
  for (const value of [restored.first, restored.second, restored.nested[0]!]) {
    expect(Object.hasOwn(value, 'own')).toBe(true);
    expect(value.set.size).toBe(3);
    expect(value.map.size).toBe(2);
    expect(Object.getPrototypeOf(value.nullObject)).toBeNull();
    expect(Object.hasOwn(value.nullObject, 'own')).toBe(true);
  }
  shared.value = 2;
  const next = decodeProductionAuditArtifact(
    serializeProductionAuditArtifact(source),
  ) as typeof source;
  expect(next.first.value).toBe(2);
  expect(next.second.value).toBe(2);
  expect(restored.first.value).toBe(1);
  const cycle: Record<string, unknown> = {};
  cycle['self'] = cycle;
  expect(() => serializeProductionAuditArtifact({ first: shared, second: cycle })).toThrow(
    'artifact_cycle',
  );
});

it('rejects malformed value metadata instead of guessing how to restore it', () => {
  for (const envelope of [
    { artifactVersion: 2, payload: null, undefinedPaths: [], containers: [], futureField: true },
    {
      artifactVersion: 2,
      payload: [],
      undefinedPaths: [],
      containers: [{ path: [], kind: 'set', futureField: true }],
    },
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
    const receipt = await writeProductionAuditArtifact(
      task.meta,
      'tsk-08-artifact-contract.json',
      payload,
    );
    const bytes = await readStoredProductionAuditArtifact('tsk-08-artifact-contract.json');
    expect(decodeStoredProductionAuditArtifact(bytes)).toEqual(payload);
    expect(receipt.path).toBe('tsk-08-artifact-contract.json.gz');
    expect(receipt.expectedBytes).toBe(bytes.length);
    expect(receipt.expectedSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    const decodedBytes = gunzipSync(bytes);
    expect(decodedBytes).toEqual(serializeProductionAuditArtifact(payload));
    expect(receipt.expectedDecodedBytes).toBe(decodedBytes.length);
    expect(receipt.expectedDecodedSha256).toBe(
      createHash('sha256').update(decodedBytes).digest('hex'),
    );
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

it('uses an explicit gzip disk transport and rejects plain or corrupt stored bytes', () => {
  const bytes = serializeProductionAuditArtifact({ absent: undefined, actual: null });
  const stored = gzipSync(bytes, { level: 1 });
  expect(decodeStoredProductionAuditArtifact(stored)).toEqual({ absent: undefined, actual: null });
  expect(() => decodeStoredProductionAuditArtifact(bytes)).toThrow();
  expect(() =>
    decodeStoredProductionAuditArtifact(stored.subarray(0, stored.length - 1)),
  ).toThrow();
  expect(() => productionAuditTestOptions(['already.json.gz'])).toThrow(
    'logical_path_must_be_json',
  );
});

it('rejects missing contracts, unsafe paths, duplicate publication and write failures', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'fgo-artifact-writer-'));
  vi.stubEnv('FGO_TEST_ARTIFACT_DIR', root);
  const options = (path: string) => productionAuditTestOptions([path]).meta;
  try {
    await expect(writeProductionAuditArtifact({}, 'missing.json', {})).rejects.toThrow(
      'contract_missing',
    );
    for (const target of ['contract', 'descriptor', 'receipt'] as const) {
      const meta = options('unknown.json');
      const contract = Reflect.get(meta, 'fgoProductionAuditArtifacts') as {
        requiredArtifacts: object[];
        receipts: object[];
      };
      if (target === 'contract') Reflect.set(contract, 'futureField', true);
      if (target === 'descriptor') Reflect.set(contract.requiredArtifacts[0]!, 'futureField', true);
      if (target === 'receipt')
        contract.receipts.push({
          path: 'unknown.json.gz',
          expectedBytes: 1,
          expectedSha256: '0'.repeat(64),
          expectedDecodedBytes: 1,
          expectedDecodedSha256: '0'.repeat(64),
          futureField: true,
        });
      await expect(writeProductionAuditArtifact(meta, 'unknown.json', {})).rejects.toThrow(
        target === 'contract'
          ? 'contract_missing'
          : target === 'descriptor'
            ? 'declaration_invalid'
            : 'receipt_invalid',
      );
    }
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
    await mkdir(resolve(root, 'directory.json.gz'));
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
    await symlink(resolve(root, 'nested/value.json.gz'), resolve(root, 'linked.json.gz'));
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
