import { describe, expect, it } from 'vitest';
import {
  calculationShareCompositionSchema,
  calculationShareSnapshotSchema,
  calculationSelectionSchema,
  calcInputSchema,
  parseStoredProfileCollection,
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

  it('normalizes stored selections to the resolved effect mode', () => {
    expect(
      calculationSelectionSchema.parse({ attackerSource: 'master', craftEssence: null }),
    ).toEqual({ attackerSource: 'master', effectMode: 'resolved', craftEssence: null });
  });

  it('upgrades v1 profiles once while discarding incompatible calculation snapshots', () => {
    const profileId = crypto.randomUUID();
    const recovered = parseStoredProfileCollection({
      schemaVersion: 1,
      activeProfileId: profileId,
      profiles: [
        {
          profileId,
          name: '保存済み',
          createdAt: '2026-08-24T00:00:00.000Z',
          updatedAt: '2026-08-24T00:00:00.000Z',
          servantBuilds: {
            '405900': {
              servantId: '405900',
              level: 90,
              ascension: 4,
              npLevel: 1,
              fouAtk: 1000,
              skills: { '1': 10 },
              appends: {},
              updatedAt: '2026-08-24T00:00:00.000Z',
            },
          },
          servantTargets: {},
          craftEssences: [],
          supportTemplates: [],
          draft: { input: { npSpecialMultiplier: 1.5 } },
          history: [{ input: { npSpecialMultiplier: 1.5 } }],
        },
      ],
    });

    expect(recovered).toMatchObject({
      upgraded: true,
      collection: {
        schemaVersion: SCHEMA_VERSION,
        profiles: [
          {
            servantBuilds: { '405900': { npLevel: 1 } },
            draft: null,
            history: [],
          },
        ],
      },
    });
    expect(parseStoredProfileCollection(recovered.collection).upgraded).toBe(false);
  });

  it('does not reinterpret unknown future profile schemas', () => {
    expect(() =>
      parseStoredProfileCollection({ schemaVersion: SCHEMA_VERSION + 1, profiles: [] }),
    ).toThrow();
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
