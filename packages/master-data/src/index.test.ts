import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { deriveCraftEssenceAtk, masterSnapshotSchema, validateMasterSnapshot } from './index';

const parsedFixture = masterSnapshotSchema.parse(fixture);

describe('master validation', () => {
  it('accepts the legal minimal fixture', () =>
    expect(validateMasterSnapshot(fixture)).toEqual({
      valid: true,
      errors: [],
      unknownAttackFunctions: [],
    }));
  it('reports unknown attack functions', () =>
    expect(
      validateMasterSnapshot({
        ...fixture,
        servants: [{ ...fixture.servants[0], attackNpFunctionType: 'futureDamage' }],
      }).unknownAttackFunctions,
    ).toEqual(['futureDamage']));
  it('derives CE attack and rejects levels over the limit', () => {
    expect(deriveCraftEssenceAtk(parsedFixture.craftEssences[0]!, 1, 0)).toBe(0);
    expect(() => deriveCraftEssenceAtk(parsedFixture.craftEssences[0]!, 21, 0)).toThrow(RangeError);
  });
});
