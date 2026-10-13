import { describe, expect, it } from 'vitest';
import { diffRawInventory, scanRawTables } from './rawInventory';

describe('raw inventory before normalization', () => {
  const tracked = new Set(['mstFunc:$[].funcType', 'mstSvt:$[].script.form']);
  const baseline = scanRawTables(
    new Map<string, unknown>([
      ['master/mstFunc.json', [{ id: 1, funcType: 10, script: { effect: 'known' } }]],
      ['master/mstSvt.json', [{ id: 100, script: { form: 'base' } }]],
    ]),
    tracked,
  );

  it('retains all nested fields and their example rows', () => {
    const func = baseline.tables.find((table) => table.table === 'mstFunc');
    expect(func?.fields.find((field) => field.path === '$[].script.effect')).toEqual({
      path: '$[].script.effect',
      occurrences: 1,
      types: ['string'],
      examples: ['id:1'],
    });
    expect(func?.fields.find((field) => field.path === '$[].funcType')?.values).toEqual(['10']);
  });

  it('reports new tables, fields, types and selected concept values', () => {
    const current = scanRawTables(
      new Map<string, unknown>([
        [
          'master/mstFunc.json',
          [
            { id: 1, funcType: 10, script: { effect: 'known', newCondition: true } },
            { id: 2, funcType: 11, script: { effect: 2 } },
          ],
        ],
        ['master/mstSvt.json', [{ id: 100, script: { form: 'base' } }]],
        ['master/mstNewConcept.json', [{ id: 3 }]],
      ]),
      tracked,
    );
    expect(diffRawInventory(baseline, current)).toEqual(
      expect.arrayContaining([
        { kind: 'newTable', table: 'mstNewConcept' },
        { kind: 'rowCountChanged', table: 'mstFunc', value: '1->2' },
        { kind: 'newField', table: 'mstFunc', path: '$[].script.newCondition' },
        { kind: 'newType', table: 'mstFunc', path: '$[].script.effect', value: 'integer' },
        { kind: 'newValue', table: 'mstFunc', path: '$[].funcType', value: '11' },
      ]),
    );
  });

  it('reports removed values and types as changes to the raw vocabulary', () => {
    const before = scanRawTables(
      new Map<string, unknown>([
        [
          'master/mstFunc.json',
          [
            { id: 1, funcType: 10, value: 'known' },
            { id: 2, funcType: 11, value: 1 },
          ],
        ],
      ]),
      tracked,
    );
    const after = scanRawTables(
      new Map<string, unknown>([
        ['master/mstFunc.json', [{ id: 1, funcType: 10, value: 'known' }]],
      ]),
      tracked,
    );
    expect(diffRawInventory(before, after)).toEqual(
      expect.arrayContaining([
        { kind: 'rowCountChanged', table: 'mstFunc', value: '2->1' },
        { kind: 'removedValue', table: 'mstFunc', path: '$[].funcType', value: '11' },
        { kind: 'removedType', table: 'mstFunc', path: '$[].value', value: 'integer' },
      ]),
    );
  });

  it('rejects malformed raw table values instead of omitting them', () => {
    expect(() =>
      scanRawTables(new Map<string, unknown>([['catalog/enum.json', { class: {} }]])),
    ).toThrow(/catalog_requires_separate_scan/);
    const malformed = new Map<string, unknown>([['master/mstFunc.json', { id: 1 }]]);
    expect(() => scanRawTables(malformed)).toThrow(/expected_array/);
    const infinite = new Map<string, unknown>([
      ['master/mstFunc.json', [{ id: Number.POSITIVE_INFINITY }]],
    ]);
    expect(() => scanRawTables(infinite)).toThrow(/nonfinite_number/);
  });
});
