import { describe, expect, it } from 'vitest';
import { compareRawVocabulary, type RawVocabularyBaseline } from './rawVocabulary';

describe('raw vocabulary acceptance', () => {
  const baseline: RawVocabularyBaseline = {
    format: 'fgo-lab-raw-vocabulary-v1',
    revision: 'a'.repeat(40),
    tables: { mstFunc: { '$[].funcType': { types: ['string'], values: ['addState'] } } },
  };

  it('accepts more rows with known fields and reports new concepts before conversion', () => {
    expect(
      compareRawVocabulary(baseline, {
        tables: [
          {
            table: 'mstFunc',
            rows: 2,
            fields: [
              {
                path: '$[].funcType',
                occurrences: 2,
                types: ['string'],
                values: ['addState'],
                examples: [],
              },
            ],
          },
        ],
      }),
    ).toEqual([]);
    expect(
      compareRawVocabulary(baseline, {
        tables: [
          {
            table: 'mstFunc',
            rows: 2,
            fields: [
              {
                path: '$[].funcType',
                occurrences: 2,
                types: ['string'],
                values: ['addState', 'newFunction'],
                examples: [],
              },
              { path: '$[].newField', occurrences: 1, types: ['integer'], examples: [] },
            ],
          },
        ],
      }),
    ).toEqual([
      { kind: 'field', table: 'mstFunc', path: '$[].newField' },
      { kind: 'value', table: 'mstFunc', path: '$[].funcType', value: 'newFunction' },
    ]);
  });
});
