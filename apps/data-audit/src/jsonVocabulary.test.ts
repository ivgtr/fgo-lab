import { describe, expect, it } from 'vitest';
import { compareJsonVocabulary, JsonVocabularyScanner } from './jsonVocabulary';

describe('Atlas response vocabulary gate', () => {
  it('accepts new data identities through declared maps and rejects new effect words', () => {
    const baseline = new JsonVocabularyScanner();
    baseline.scan('nice_servant', [
      {
        extraAssets: { faces: { costume: { '1001': 'a' } } },
        functions: [{ funcType: 'addState' }],
      },
    ]);
    const changed = new JsonVocabularyScanner();
    changed.scan('nice_servant', [
      {
        extraAssets: { faces: { costume: { '2002': 'b' } } },
        functions: [{ funcType: 'newFunction' }],
      },
    ]);
    expect(compareJsonVocabulary(baseline.result(), changed.result())).toEqual([
      'new_value:nice_servant:$[].functions[].funcType:newFunction',
    ]);
  });

  it('reports structural fields and rejects malformed dynamic identities', () => {
    const baseline = new JsonVocabularyScanner();
    baseline.scan('nice_trait', { '1': 'trait' });
    const changed = new JsonVocabularyScanner();
    changed.scan('nice_trait', { '2': { name: 'trait' } });
    expect(compareJsonVocabulary(baseline.result(), changed.result())).toEqual([
      'new_field:nice_trait:$.*.name',
      'new_type:nice_trait:$.*:object',
    ]);
    expect(() => baseline.scan('nice_trait', { unknown: 'trait' })).toThrow(
      'json_vocabulary:invalid_dynamic_key',
    );
  });
});
