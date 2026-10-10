import { expect, it } from 'vitest';
import { firstCanonicalAuditDifference } from '@fgo-lab/master-data/production-audit';
import {
  captureBattlePointCapacityValue as capture,
  materializeBattlePointCapacityValue as materialize,
  battlePointCapacityCanonicalSnapshotter,
} from './productionBattlePointCapacityProof';
import { scalarQuantitySnapshot } from './productionScalarQuantityAudit';
import { equalProductionAuditDiagnosticValues as equal } from './productionAuditDiagnosticEquality';
import {
  encodeProductionAuditDiagnostic,
  decodeProductionAuditDiagnostic,
} from './productionAuditArtifacts';

it('captures complete typed values without exposing mutable live containers', () => {
  const leaf = { own: undefined, values: [null, true, 'text', 1.5] };
  const raw = {
    first: leaf,
    second: leaf,
    nullObject: Object.assign(Object.create(null) as object, { own: undefined }),
    set: new Set<unknown>(['second', leaf]),
    map: new Map<unknown, unknown>([
      [leaf, undefined],
      ['second', null],
    ]),
    tag: { kind: 'array', items: [1] },
  };
  const proof = capture(raw);
  const saved = materialize(proof);
  expect(equal(saved, raw)).toBe(true);
  const checkFrozen = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) checkFrozen(child);
  };
  checkFrozen(proof);
  leaf.values[0] = 2;
  raw.set.clear();
  raw.map.clear();
  expect(equal(materialize(proof), saved)).toBe(true);
  expect(equal(materialize(capture(raw)), saved)).toBe(false);
  const restored = saved as typeof raw;
  expect(restored.first).toBe(restored.second);
  expect(restored.first).not.toBe(leaf);
  expect(Object.getPrototypeOf(restored.nullObject)).toBe(null);
  restored.first.values[0] = 3;
  expect(equal(materialize(proof), saved)).toBe(false);
});

it('preserves ordered distinct equal Set members and Map keys and rejects independent losses', () => {
  const a = { value: 1 },
    b = { value: 1 };
  const raw = {
    set: new Set([a, b]),
    map: new Map([
      [a, 'first'],
      [b, 'second'],
    ]),
  };
  const proof = capture(raw);
  const restored = materialize(proof) as typeof raw;
  expect(restored.set.size).toBe(2);
  expect(restored.map.size).toBe(2);
  expect([...restored.set][0]).not.toBe([...restored.set][1]);
  expect([...restored.map.keys()]).toEqual([...restored.set]);
  expect([...restored.map.keys()][0]).toBe([...restored.set][0]);
  expect(equal(raw, restored)).toBe(true);
  const encoded = encodeProductionAuditDiagnostic(restored);
  const decoded = decodeProductionAuditDiagnostic(encoded) as typeof raw;
  expect(equal(raw, decoded)).toBe(true);
  expect(decoded.set.size).toBe(2);
  expect(decoded.map.size).toBe(2);
  const missingSetMember = decodeProductionAuditDiagnostic(encoded) as typeof raw;
  missingSetMember.set.delete([...missingSetMember.set][0]!);
  expect(equal(raw, missingSetMember)).toBe(false);
  const missingMapKey = decodeProductionAuditDiagnostic(encoded) as typeof raw;
  missingMapKey.map.delete([...missingMapKey.map.keys()][0]!);
  expect(equal(raw, missingMapKey)).toBe(false);
});

it('rejects invalid or unknown value forms without invoking accessors or dropping properties', () => {
  const cycle: Record<string, unknown> = {};
  cycle['self'] = cycle;
  let reads = 0;
  const accessor = Object.defineProperty({}, 'value', {
    enumerable: true,
    get: () => {
      reads++;
      return 1;
    },
  });
  for (const raw of [
    cycle,
    NaN,
    Infinity,
    -0,
    1n,
    () => 1,
    new Date(),
    Array(1),
    accessor,
    Object.defineProperty({}, 'hidden', { value: 1 }),
    { [Symbol('key')]: 1 },
    Object.assign(new Set([1]), { extra: 2 }),
    Object.assign(new Map([[1, 2]]), { extra: 2 }),
    Object.assign([1], { extra: 2 }),
    Object.defineProperty([1], '0', { get: () => 1 }),
  ])
    expect(() => capture(raw)).toThrow(TypeError);
  expect(reads).toBe(0);
});

it('keeps canonical projection separate from typed proof with call-local identity sharing', () => {
  const leaf = {
    own: undefined as unknown,
    set: new Set(['b', 'a']),
    map: new Map([
      ['b', 2],
      ['a', 1],
    ]),
  };
  const raw = { first: leaf, second: leaf, copy: { ...leaf } };
  const snapshot = battlePointCapacityCanonicalSnapshotter();
  const canonical = snapshot(raw);
  expect(canonical).toEqual(scalarQuantitySnapshot(raw));
  expect(materialize(capture(raw))).not.toEqual(canonical);
  const fields = canonical as Record<string, unknown>;
  expect(fields['first']).toBe(fields['second']);
  expect(fields['copy']).not.toBe(fields['first']);
  expect(snapshot(leaf)).toBe(fields['first']);
  leaf.own = 1;
  expect(battlePointCapacityCanonicalSnapshotter()(raw)).not.toEqual(canonical);
  expect(
    firstCanonicalAuditDifference(
      [{ identity: 'capacity', value: scalarQuantitySnapshot(raw) }],
      [{ identity: 'capacity', value: canonical }],
    ),
  ).toEqual(
    firstCanonicalAuditDifference(
      [{ identity: 'capacity', value: battlePointCapacityCanonicalSnapshotter()(raw) }],
      [{ identity: 'capacity', value: canonical }],
    ),
  );
});

it('captures a shared acyclic graph without unfolding its paths', () => {
  let raw: unknown = { leaf: undefined };
  for (let depth = 0; depth < 24; depth++) raw = { left: raw, right: raw };
  expect(equal(raw, materialize(capture(raw)))).toBe(true);
  expect(() =>
    battlePointCapacityCanonicalSnapshotter()(
      (() => {
        const v: unknown[] = [];
        v.push(v);
        return v;
      })(),
    ),
  ).toThrow(TypeError);
});
