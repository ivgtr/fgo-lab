import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { equalProductionAuditDiagnosticValues as equal } from './productionAuditDiagnosticEquality';
import {
  decodeProductionAuditArtifact,
  decodeProductionAuditDiagnostic,
  encodeProductionAuditDiagnostic,
  productionAuditTestOptions,
  writeProductionAuditArtifact,
} from './productionAuditArtifacts';

it('compares complete declared values independently of transport and alias topology', () => {
  const leaf = Object.freeze({ own: undefined, value: [null, true, 'text', 1.5] });
  const source = {
    first: leaf,
    second: leaf,
    set: new Set([undefined, null, 'first']),
    map: new Map<unknown, unknown>([
      [{ key: 1 }, leaf],
      ['second', undefined],
    ]),
    nullObject: Object.assign(Object.create(null) as object, { kind: 'literal', value: undefined }),
    tag: { kind: 'reference', index: 0 },
  };
  const independent = {
    first: { own: undefined, value: [null, true, 'text', 1.5] },
    second: { own: undefined, value: [null, true, 'text', 1.5] },
    set: new Set([undefined, null, 'first']),
    map: new Map<unknown, unknown>([
      [{ key: 1 }, { own: undefined, value: [null, true, 'text', 1.5] }],
      ['second', undefined],
    ]),
    nullObject: Object.assign(Object.create(null) as object, { kind: 'literal', value: undefined }),
    tag: { kind: 'reference', index: 0 },
  };
  expect(equal(source, independent)).toBe(true);
  expect(equal(independent, source)).toBe(true);
  expect(
    equal(source, decodeProductionAuditDiagnostic(encodeProductionAuditDiagnostic(source))),
  ).toBe(true);
  expect(equal({ own: undefined }, {})).toBe(false);
  expect(equal(null, undefined)).toBe(false);
  expect(equal(source.nullObject, { kind: 'literal', value: undefined })).toBe(false);
  expect(equal({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
});

it('detects nested differences below repeated subgraphs without caching between comparisons', () => {
  const shared = { deep: { value: 1 } };
  const expected = { a: shared, b: shared };
  const actual = { a: { deep: { value: 1 } }, b: { deep: { value: 1 } } };
  expect(equal(expected, actual)).toBe(true);
  actual.b.deep.value = 2;
  expect(equal(expected, actual)).toBe(false);
  actual.b.deep.value = 1;
  expect(equal(expected, actual)).toBe(true);
  const different = { deep: { value: 2 } };
  expect(equal({ a: shared, b: different }, { a: shared, b: shared })).toBe(false);
});

it('compares ordered Set and Map cardinality, keys and values', () => {
  expect(equal(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(false);
  expect(
    equal(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
      new Map([
        ['b', 2],
        ['a', 1],
      ]),
    ),
  ).toBe(false);
  expect(equal(new Map([[{ key: 1 }, { value: 2 }]]), new Map([[{ key: 2 }, { value: 2 }]]))).toBe(
    false,
  );
  expect(equal(new Map([[{ key: 1 }, { value: 2 }]]), new Map([[{ key: 1 }, { value: 3 }]]))).toBe(
    false,
  );
  const set = new Set([{ value: 1 }, { value: 1 }]);
  const map = new Map([
    [{ key: 1 }, 'first'],
    [{ key: 1 }, 'second'],
  ]);
  // Content interning can collapse distinct equal object members/keys. Detect the loss,
  // rather than treating a matching re-encode or shared reference as restoration proof.
  expect(equal(set, decodeProductionAuditDiagnostic(encodeProductionAuditDiagnostic(set)))).toBe(
    false,
  );
  expect(equal(map, decodeProductionAuditDiagnostic(encodeProductionAuditDiagnostic(map)))).toBe(
    false,
  );
});

it('rejects invalid values and cycles even when the same object occurs on both sides', () => {
  const cycle: Record<string, unknown> = {};
  cycle['self'] = cycle;
  const accessor = Object.defineProperty({}, 'value', { enumerable: true, get: () => 1 });
  const hidden = Object.defineProperty({}, 'value', { value: 1 });
  const extraSet = Object.assign(new Set([1]), { extra: 2 });
  for (const value of [
    cycle,
    NaN,
    Infinity,
    -0,
    1n,
    () => 1,
    new Date(),
    Array(1),
    accessor,
    hidden,
    { [Symbol('key')]: 1 },
    extraSet,
  ]) {
    expect(() => equal(value, value)).toThrow(TypeError);
    expect(() => equal({}, value)).toThrow(TypeError);
  }
});

it('compares a shared DAG without unfolding every path', () => {
  const graph = () => {
    let node: unknown = { leaf: 1 };
    for (let depth = 0; depth < 24; depth++) node = { left: node, right: node };
    return node;
  };
  expect(equal(graph(), graph())).toBe(true);
});

it(
  'publishes complete original values before assertions and compares actual disk restoration',
  productionAuditTestOptions(['tsk-08-restoration-comparison-contract.json']),
  async ({ task }) => {
    const leaf = { expected: undefined, actual: null };
    const payload = {
      expected: leaf,
      actual: {
        items: [leaf, leaf],
        set: new Set(['second', 'first']),
        map: new Map([
          ['second', 2],
          ['first', 1],
        ]),
      },
    };
    const diagnostic = encodeProductionAuditDiagnostic(payload);
    await writeProductionAuditArtifact(task.meta, 'tsk-08-restoration-comparison-contract.json', {
      encoded: diagnostic,
    });
    const bytes = await readFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR']!, 'tsk-08-restoration-comparison-contract.json'),
    );
    const restored = decodeProductionAuditDiagnostic(
      (decodeProductionAuditArtifact(bytes) as { encoded: typeof diagnostic }).encoded,
    );
    expect(equal(payload, restored)).toBe(true);
  },
);
