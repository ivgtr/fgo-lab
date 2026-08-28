import { describe, expect, it } from 'vitest';
import type { ActivationFact, ActivationSourceRef } from './index';
import { activationFactKey, analyzeActivationFactSet } from './activationFactSet';

const source: ActivationSourceRef = {
  origin: 'support',
  sourceInstanceId: 'support:one',
  skillId: 'skill:1',
};
const choice: ActivationFact = {
  kind: 'choice',
  source,
  family: 'mode',
  candidate: 'one',
};

function sorted(facts: readonly ActivationFact[]): ActivationFact[] {
  return [...facts].sort((left, right) =>
    activationFactKey(left).localeCompare(activationFactKey(right)),
  );
}

describe('activation fact set analyzer', () => {
  it('accepts canonical facts and builds immutable lookup indexes', () => {
    const trigger: ActivationFact = { kind: 'operationTrigger', source, position: 1 };
    const facts = sorted([choice, trigger]);
    const result = analyzeActivationFactSet(facts);
    expect(result.status).toBe('valid');
    if (result.status !== 'valid') throw new Error('expected valid fact set');
    expect(result.factSet.facts).toEqual(facts);
    expect(result.factSet.factKeys).toEqual(new Set(facts.map(activationFactKey)));
    expect(result.factSet.operationTriggers.size).toBe(1);
  });

  it('rejects non-canonical order and duplicate facts', () => {
    const trigger: ActivationFact = { kind: 'operationTrigger', source, position: 1 };
    const canonical = sorted([choice, trigger]);
    const result = analyzeActivationFactSet([canonical[1]!, canonical[0]!, canonical[0]!]);
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') throw new Error('expected invalid fact set');
    expect(result.issues.map(({ kind }) => kind)).toEqual(['nonCanonicalOrder', 'duplicateFact']);
  });

  it('rejects conflicting choice candidates but scopes choices by source instance', () => {
    const sibling: ActivationFact = { ...choice, candidate: 'two' };
    const otherSource: ActivationFact = {
      ...sibling,
      source: { ...source, sourceInstanceId: 'support:two' },
    };
    expect(analyzeActivationFactSet(sorted([choice, otherSource])).status).toBe('valid');
    const conflict = analyzeActivationFactSet(sorted([choice, sibling]));
    expect(conflict.status).toBe('invalid');
    if (conflict.status !== 'invalid') throw new Error('expected invalid fact set');
    expect(conflict.issues.map(({ kind }) => kind)).toContain('conflictingChoiceSelection');
  });

  it('intersects compatible source quantity ranges and rejects an empty intersection', () => {
    const atLeast: ActivationFact = {
      kind: 'sourceQuantity',
      source,
      quantity: 'battlePointRate',
      subjectId: 'subject',
      comparison: 'atLeast',
      value: 500,
    };
    const atMost: ActivationFact = { ...atLeast, comparison: 'atMost', value: 999 };
    const valid = analyzeActivationFactSet(sorted([atLeast, atMost]));
    expect(valid.status).toBe('valid');
    if (valid.status !== 'valid') throw new Error('expected valid fact set');
    expect([...valid.factSet.sourceQuantityRanges.values()]).toEqual([{ min: 500, max: 999 }]);
    const impossible = analyzeActivationFactSet(sorted([atLeast, { ...atMost, value: 499 }]));
    expect(impossible.status).toBe('invalid');
    if (impossible.status !== 'invalid') throw new Error('expected invalid fact set');
    expect(impossible.issues.map(({ kind }) => kind)).toContain('conflictingSourceQuantityRange');
  });
});
