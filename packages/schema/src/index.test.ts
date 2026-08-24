import { describe, expect, it } from 'vitest';
import {
  calculationShareCompositionSchema,
  calculationShareSnapshotSchema,
  calcInputSchema,
  SCHEMA_VERSION,
} from './index';

describe('portable schema boundaries', () => {
  it('rejects profile data in a share snapshot', () => {
    const result = calculationShareSnapshotSchema.safeParse({
      kind: 'fgo-lab-calculation-share',
      schemaVersion: SCHEMA_VERSION,
      profileId: crypto.randomUUID(),
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown future schema versions', () => {
    expect(
      calculationShareSnapshotSchema.safeParse({
        kind: 'fgo-lab-calculation-share',
        schemaVersion: SCHEMA_VERSION + 1,
      }),
    ).toMatchObject({ success: false });
  });

  it('uses one explicit special NP multiplier per NP level', () => {
    expect(calcInputSchema.shape.npSpecialMultipliers.safeParse([1, 1.5, 2, 2.5, 3])).toMatchObject(
      { success: true },
    );
    expect(calcInputSchema.shape.npSpecialMultipliers.safeParse(1.5)).toMatchObject({
      success: false,
    });
  });

  it('keeps portable CE state while stripping local copy identity', () => {
    const parsed = calculationShareCompositionSchema.parse({
      craftEssence: {
        source: 'registered',
        craftEssenceId: 'ce-1',
        copyId: crypto.randomUUID(),
        level: 80,
        limitBreak: 4,
      },
    });
    expect(parsed).toEqual({
      craftEssence: { craftEssenceId: 'ce-1', level: 80, limitBreak: 4 },
    });
  });
});
