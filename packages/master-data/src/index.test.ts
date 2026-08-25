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
  it('rejects an unknown attack function in the normalized master', () =>
    expect(
      validateMasterSnapshot({
        ...fixture,
        servants: [
          {
            ...fixture.servants[0],
            noblePhantasms: [
              {
                ...fixture.servants[0]!.noblePhantasms[0]!,
                damage: [
                  {
                    ...fixture.servants[0]!.noblePhantasms[0]!.damage[0]!,
                    rawFunctionType: 'futureDamage',
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toMatchObject({ valid: false, unknownAttackFunctions: [] }));
  it('accepts a servant without an attacking NP', () =>
    expect(
      validateMasterSnapshot({
        ...fixture,
        normalization: { attackFunctions: { sourceCount: 0, includedCount: 0, excluded: [] } },
        servants: [
          {
            ...fixture.servants[0],
            noblePhantasms: [],
          },
        ],
      }),
    ).toMatchObject({ valid: true, unknownAttackFunctions: [] }));
  it('rejects an incomplete NP parameter matrix', () =>
    expect(
      validateMasterSnapshot({
        ...fixture,
        servants: [
          {
            ...fixture.servants[0],
            noblePhantasms: [
              {
                ...fixture.servants[0]!.noblePhantasms[0]!,
                damage: [
                  {
                    ...fixture.servants[0]!.noblePhantasms[0]!.damage[0]!,
                    parametersByOvercharge: [],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toMatchObject({ valid: false }));
  it('derives CE attack and rejects levels over the limit', () => {
    expect(deriveCraftEssenceAtk(parsedFixture.craftEssences[0]!, 1, 0)).toBe(0);
    expect(() => deriveCraftEssenceAtk(parsedFixture.craftEssences[0]!, 21, 0)).toThrow(RangeError);
  });
});
