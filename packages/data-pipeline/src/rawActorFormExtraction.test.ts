import { describe, expect, it } from 'vitest';
import { extractReachableActorForms, stateTraitName } from './rawActorFormExtraction';

describe('actor form trait identity', () => {
  it('preserves distinct numeric trait IDs when Atlas has no label', () => {
    const servant = {
      id: 100,
      name: 'Test',
      traits: [
        { id: 9001, name: 'unknown' },
        { id: 9002, name: 'unknown' },
        { id: 101, name: 'classLancer' },
      ],
      skills: [],
      classPassive: [],
      noblePhantasms: [],
    };
    const forms = extractReachableActorForms(servant, new Map([[100, servant]]), new Map());
    expect(forms).toHaveLength(1);
    expect(forms[0]!.traits).toEqual(['traitId:9001', 'traitId:9002', 'classLancer']);
    expect(stateTraitName({ id: 3004, name: 'buffPositiveEffect' }, new Map())).toBeNull();
  });
});
