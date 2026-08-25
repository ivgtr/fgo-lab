import { describe, expect, it } from 'vitest';
import {
  calculationShareSnapshotSchema,
  calculationSelectionSchema,
  calculationResultSchema,
  calculationScenarioSchema,
  damageKernelInputSchema,
  parseStoredProfileCollection,
  SCHEMA_VERSION,
  supportTemplateSchema,
} from './index';

describe('portable schema boundaries', () => {
  it('keeps resolved scenarios free of master-derived numeric inputs', () => {
    const scenario = calculationScenarioSchema.parse({
      mode: 'resolved',
      attacker: { servantId: '1', source: 'master', level: 90, npLevel: 1, fouAtk: 1000 },
      overcharge: 1,
      target: {
        classId: 'lancer',
        attribute: 'earth',
        traits: [],
        stateTraits: [],
        rarity: 5,
        hpPermille: 1000,
      },
      fieldTraits: [],
      battleState: { battlePointPhase: null },
      assumptions: { classAffinity: 2, attributeAffinity: 1 },
      craftEssence: null,
      attackerSkills: [],
      support: null,
      effectDecisions: {},
      explicitOverrides: {},
    });
    expect(scenario.mode).toBe('resolved');
    expect(scenario).not.toHaveProperty('npMultipliers');
    expect(() =>
      calculationScenarioSchema.parse({ ...scenario, npMultipliers: [1, 1, 1, 1, 1] }),
    ).toThrow();
  });
  it('does not allow unsupported results to carry numeric rows', () => {
    const unsupported = {
      status: 'unsupported',
      rows: [{ npLevel: 1, minimum: 1, average: 1, maximum: 1 }],
      effects: [],
      assumptions: [],
      issues: [],
      trace: [],
      missingEvidence: ['handler'],
      versions: {
        schemaVersion: SCHEMA_VERSION,
        masterDataVersion: 'fixture',
        engineVersion: '2.0.0',
        appVersion: '0.1.0',
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
      },
    };
    expect(calculationResultSchema.safeParse(unsupported).success).toBe(false);
  });
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
    expect(
      damageKernelInputSchema.shape.npSpecialMultipliers.safeParse([1, 1.5, 2, 2.5, 3]),
    ).toMatchObject({ success: true });
    expect(damageKernelInputSchema.shape.npSpecialMultipliers.safeParse(1.5)).toMatchObject({
      success: false,
    });
  });

  it('normalizes stored selections to the resolved effect mode', () => {
    expect(
      calculationSelectionSchema.parse({ attackerSource: 'master', craftEssence: null }),
    ).toEqual({ attackerSource: 'master', effectMode: 'resolved', craftEssence: null });
  });

  it('stores support sources, skill levels, and selected effects separately', () => {
    const template = supportTemplateSchema.parse({
      templateId: crypto.randomUUID(),
      name: '旧形式',
      masterDataVersion: 'test',
      composition: {
        sources: [
          {
            sourceInstanceId: 'support-instance-1',
            servantId: 'support-1',
            skills: [{ skillId: 'skill-1', skillLevel: 10 }],
          },
        ],
        selectedEffects: [
          {
            sourceInstanceId: 'support-instance-1',
            skillId: 'skill-1',
            effectId: 'attack-up',
          },
        ],
      },
      updatedAt: '2026-08-24T00:00:00.000Z',
      lastUsedAt: null,
    });

    expect(template.composition.selectedEffects).toHaveLength(1);
  });

  it('rejects legacy profiles instead of maintaining a compatibility migration', () => {
    const profileId = crypto.randomUUID();
    expect(() =>
      parseStoredProfileCollection({
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
      }),
    ).toThrow();
  });

  it('does not reinterpret unknown future profile schemas', () => {
    expect(() =>
      parseStoredProfileCollection({ schemaVersion: SCHEMA_VERSION + 1, profiles: [] }),
    ).toThrow();
  });
});
