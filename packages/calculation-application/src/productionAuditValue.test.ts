import { expect, it } from 'vitest';
import {
  inspectProductionAuditValue,
  acceptedProductionAuditValue,
  ProductionAuditValueError,
} from './productionAuditValue';
import { compareProductionParity } from './productionParityDiagnostics';
import { compareProductionConditionRecords } from './productionClosureRecordIntegrity';
import { productionClosureRecordDigest } from './productionClosureAudit';

it.each([Infinity, -Infinity, NaN, -0, undefined, BigInt(1), new Date(), new Set([1])])(
  'rejects unrepresentable audit values before digest and even on both parity sides: %s',
  (value) => {
    const input = { canonicalInput: { targetRarity: value } };
    const inspected = inspectProductionAuditValue(input);
    expect(inspected.status).toBe('failed');
    expect(() => productionClosureRecordDigest(input)).toThrow(ProductionAuditValueError);
    for (const actual of [input, { canonicalInput: { targetRarity: null } }]) {
      const result = compareProductionParity({
        conditionKey: 'condition',
        profileKey: 'profile',
        path: 'portable',
        actualStatus: 'executable',
        expected: input,
        actual,
      });
      expect(result).toMatchObject({
        reason: 'auditValueInvalid',
        firstDifference: { path: 'canonicalInput.targetRarity' },
      });
      expect(inspectProductionAuditValue(result).status).toBe('accepted');
    }
  },
);

it('preserves field order, finite numbers, null, absent fields and prototype-safe keys', () => {
  const input: unknown = JSON.parse('{"z":null,"__proto__":{"value":1},"a":[true,0,0.1,1e308]}');
  const accepted = acceptedProductionAuditValue(input);
  expect(JSON.stringify(accepted)).toBe(JSON.stringify(input));
  expect(Object.hasOwn(accepted as object, '__proto__')).toBe(true);
  const comparison = (expected: unknown, actual: unknown) =>
    compareProductionParity({
      conditionKey: 'condition',
      profileKey: 'profile',
      path: 'calculator',
      actualStatus: 'executable',
      expected,
      actual,
    });
  expect(comparison({ field: null }, {})).toMatchObject({ reason: 'canonicalMismatch' });
  expect(comparison({ a: 1, b: 2 }, { b: 2, a: 1 })).toBeNull();
  expect(comparison({}, { field: undefined })).toMatchObject({ reason: 'auditValueInvalid' });
});

it('rejects cycles, accessors, symbols and discarded array properties without evaluating getters', () => {
  let reads = 0;
  const accessor = Object.defineProperty({}, 'value', {
    enumerable: true,
    get: () => {
      reads += 1;
      return Infinity;
    },
  });
  const cycle: Record<string, unknown> = {};
  cycle['self'] = cycle;
  const array = [1];
  Object.defineProperty(array, '4294967295', { value: 2, enumerable: true });
  for (const value of [
    accessor,
    cycle,
    { [Symbol('field')]: 1 },
    Array(2),
    array,
    Object.defineProperty({}, 'hidden', { value: 1 }),
  ]) {
    const result = inspectProductionAuditValue(value);
    expect(result.status).toBe('failed');
    if (result.status === 'failed')
      expect((JSON.parse(JSON.stringify(result)) as typeof result).issues).toEqual(result.issues);
  }
  expect(reads).toBe(0);
});

it('retains every invalid leaf in JSON-safe failure capture', () => {
  const value = Object.fromEntries(
    Array.from({ length: 1024 }, (_, i) => [`value${i}`, i % 2 ? Infinity : -0]),
  );
  const result = inspectProductionAuditValue(value);
  expect(result.status).toBe('failed');
  if (result.status !== 'failed') throw new Error('expected failure');
  expect(result.issues).toHaveLength(1024);
  expect(Object.keys(result.diagnostic as object)).toHaveLength(1024);
  expect(inspectProductionAuditValue(result).status).toBe('accepted');
});

it('does not compare forged typed canonical records containing the same NaN', () => {
  const records = [{ identity: 'profile', value: { quantity: NaN } }];
  expect(compareProductionConditionRecords(records, records)).toMatchObject([
    { reason: 'recordValueInvalid', firstDifference: { path: '0.value.quantity' } },
  ]);
});

it('encodes missing-field diagnostics without colliding with a real marker-shaped value', () => {
  const failure = compareProductionParity({
    conditionKey: 'condition',
    profileKey: 'profile',
    path: 'calculator',
    actualStatus: 'executable',
    expected: { field: { auditValueAbsent: true } },
    actual: {},
  });
  expect(failure).toMatchObject({
    reason: 'canonicalMismatch',
    firstDifference: {
      path: 'field',
      expected: { present: true, value: { auditValueAbsent: true } },
      actual: { present: false },
    },
  });
  expect(inspectProductionAuditValue(failure).status).toBe('accepted');
});
