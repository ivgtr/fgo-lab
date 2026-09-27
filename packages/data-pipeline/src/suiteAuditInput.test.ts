import { expect, it } from 'vitest';
import { createSuiteAuditInput } from './suiteAuditInput.test-support';

function inputFixture(serialized = '{"rows":[{"value":2},{"value":1},{"value":2}]}') {
  const calls = { read: 0, parse: 0, project: 0 };
  const get = createSuiteAuditInput({
    read: () => {
      calls.read++;
      return Promise.resolve(serialized);
    },
    parse: (input): { rows: { value: number }[] } => {
      calls.parse++;
      if (
        input === null ||
        typeof input !== 'object' ||
        Object.keys(input).join() !== 'rows' ||
        !('rows' in input) ||
        !Array.isArray(input.rows) ||
        input.rows.some(
          (row: unknown) =>
            row === null ||
            typeof row !== 'object' ||
            Object.keys(row).join() !== 'value' ||
            !('value' in row) ||
            typeof row.value !== 'number' ||
            !Number.isFinite(row.value),
        )
      )
        throw new Error('invalid fixture input');
      return input as { rows: { value: number }[] };
    },
    project: (master) => {
      calls.project++;
      return [...master.rows];
    },
  });
  return { calls, get };
}

it('starts in the first consumer and shares one complete ordered input and view', async () => {
  const { get, calls } = inputFixture();
  expect(calls).toEqual({ read: 0, parse: 0, project: 0 });
  const first = get();
  expect(get()).toBe(first);
  const [left, right] = await Promise.all([first, get()]);
  expect(right).toBe(left);
  expect(left.view).toEqual(left.master.rows);
  expect(left.view.map(({ value }) => value)).toEqual([2, 1, 2]);
  expect(await get()).toBe(left);
  expect(calls).toEqual({ read: 1, parse: 1, project: 1 });
});

it('isolates separate boundaries even for identical bytes, and isolates different inputs', async () => {
  const a = inputFixture();
  const b = inputFixture();
  const c = inputFixture('{"rows":[{"value":3}]}');
  const [left, right, other] = await Promise.all([a.get(), b.get(), c.get()]);
  expect(right).toEqual(left);
  expect(right.master).not.toBe(left.master);
  expect(right.view).not.toBe(left.view);
  expect(other.view).toEqual([{ value: 3 }]);
  for (const owner of [a, b, c]) expect(owner.calls).toEqual({ read: 1, parse: 1, project: 1 });
});

it('rejects borrowed master, nested element and view mutation while allowing local derivation', async () => {
  const { get } = inputFixture();
  const { master, view } = await get();
  expect(() => master.rows.push({ value: 4 })).toThrow(TypeError);
  expect(() => {
    master.rows[0]!.value = 9;
  }).toThrow(TypeError);
  expect(() => view.reverse()).toThrow(TypeError);
  const local = view.map(({ value }) => ({ value })).sort((a, b) => a.value - b.value);
  local[0]!.value = 7;
  expect((await get()).view.map(({ value }) => value)).toEqual([2, 1, 2]);
});

it('retains a read rejection without parse, projection, retry or replacement', async () => {
  const cause = new Error('read refused');
  let reads = 0;
  const get = createSuiteAuditInput({
    read: () => {
      reads++;
      return Promise.reject(cause);
    },
    parse: () => {
      throw new Error('must not parse');
    },
    project: () => {
      throw new Error('must not project');
    },
  });
  const first = get();
  await expect(first).rejects.toBe(cause);
  expect(get()).toBe(first);
  await expect(get()).rejects.toBe(cause);
  expect(reads).toBe(1);
});

it('retains malformed JSON failure before schema parsing or projection', async () => {
  const { get, calls } = inputFixture('{');
  const first = get();
  await expect(first).rejects.toBeInstanceOf(SyntaxError);
  expect(get()).toBe(first);
  await expect(get()).rejects.toBeInstanceOf(SyntaxError);
  expect(calls).toEqual({ read: 1, parse: 0, project: 0 });
});

it.each(['{"rows":[{"value":"2"}]}', '{"rows":[],"unknown":true}'])(
  'propagates strict parser rejection without projection or retry: %s',
  async (serialized) => {
    const { get, calls } = inputFixture(serialized);
    const first = get();
    await expect(first).rejects.toThrow('invalid fixture input');
    expect(get()).toBe(first);
    await expect(get()).rejects.toThrow('invalid fixture input');
    expect(calls).toEqual({ read: 1, parse: 1, project: 0 });
  },
);

it('retains projection failure without publishing a partially ready input', async () => {
  const cause = new Error('projection refused');
  let projections = 0;
  const get = createSuiteAuditInput({
    read: () => Promise.resolve('{}'),
    parse: (input) => input,
    project: () => {
      projections++;
      throw cause;
    },
  });
  const first = get();
  await expect(first).rejects.toBe(cause);
  expect(get()).toBe(first);
  await expect(get()).rejects.toBe(cause);
  expect(projections).toBe(1);
});
