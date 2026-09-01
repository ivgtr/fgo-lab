import { describe, expect, it } from 'vitest';
import {
  calculationShareSnapshotSchema,
  calculationResultSchema,
  calculationScenarioSchema,
  damageResolutionInputSchema,
  ENGINE_VERSION,
  parseUserDataBackup,
  parseStoredProfileCollection,
  SCHEMA_VERSION,
  supportTemplateSchema,
  QUANTITY_FACT_DOMAINS,
} from './index';

describe('portable schema boundaries', () => {
  it('keeps resolved scenarios free of master-derived numeric inputs', () => {
    const scenario = calculationScenarioSchema.parse({
      mode: 'resolved',
      attacker: {
        servantId: '1',
        initialActorFormId: { actorId: '1', limitCount: 0 },
        source: 'master',
        level: 90,
        npLevel: 1,
        fouAtk: 1000,
      },
      overcharge: 1,
      targetContext: {
        class: { kind: 'concrete', classId: 'lancer' },
        attribute: { kind: 'concrete', attribute: 'earth' },
        families: [],
      },
      attackerHpPermille: 1000,
      battleState: { battlePointPhase: null },
      canonicalInputValues: {},
      craftEssence: null,
      preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' }],
      mysticCode: null,
      support: null,
      effectDecisions: [],
      activationFacts: [],
      worldFactAssertions: [],
      explicitOverrides: {},
    });
    expect(scenario.mode).toBe('resolved');
    if (scenario.mode !== 'resolved') throw new TypeError('expected resolved scenario');
    expect(scenario).not.toHaveProperty('npMultipliers');
    expect(() =>
      calculationScenarioSchema.parse({
        ...scenario,
        targetContext: { ...scenario.targetContext, traits: ['dragon'] },
      }),
    ).toThrow();
    expect(() =>
      calculationScenarioSchema.parse({ ...scenario, npMultipliers: [1, 1, 1, 1, 1] }),
    ).toThrow();
    expect(() =>
      calculationScenarioSchema.parse({
        ...scenario,
        attackerSkills: [{ skillId: 'skill-1', skillLevel: 10 }],
      }),
    ).toThrow();
    expect(
      calculationScenarioSchema.safeParse({
        ...scenario,
        activationFacts: [
          {
            kind: 'choice',
            source: { origin: 'attacker', sourceInstanceId: 'self', skillId: 'skill' },
            family: 'choice',
            candidate: 'a',
          },
          {
            kind: 'choice',
            source: { origin: 'attacker', sourceInstanceId: 'self', skillId: 'skill' },
            family: 'choice',
            candidate: 'b',
          },
        ],
      }).success,
    ).toBe(false);
    const sharedFact = {
      kind: 'choice' as const,
      source: { origin: 'attacker' as const, sourceInstanceId: 'self', skillId: 'skill' },
      family: 'choice',
      candidate: 'a',
    };
    expect(
      calculationScenarioSchema.parse({
        ...scenario,
        activationFacts: [sharedFact],
      }),
    ).toMatchObject({ activationFacts: [sharedFact] });
    expect(
      calculationScenarioSchema.safeParse({
        ...scenario,
        activationFacts: [sharedFact, sharedFact],
      }).success,
    ).toBe(false);
    expect(
      calculationScenarioSchema.safeParse({
        ...scenario,
        activationFacts: [{ ...sharedFact, candidate: '' }],
      }).success,
    ).toBe(false);
    expect(
      calculationScenarioSchema.safeParse({
        ...scenario,
        activationFacts: [
          {
            kind: 'sourceQuantity',
            source: sharedFact.source,
            quantity: 'battlePointRate',
            subjectId: '1',
            comparison: 'atMost',
            value: 999,
          },
          sharedFact,
        ],
      }).success,
    ).toBe(false);
    expect(
      calculationScenarioSchema.safeParse({
        ...scenario,
        activationDecisions: [],
      }).success,
    ).toBe(false);
  });

  it('rejects the removed untyped battle-context value map', () => {
    const base = calculationScenarioSchema.parse({
      mode: 'resolved',
      attacker: {
        servantId: '1',
        initialActorFormId: { actorId: '1', limitCount: 0 },
        source: 'master',
        level: 90,
        npLevel: 1,
        fouAtk: 1000,
      },
      overcharge: 1,
      targetContext: {
        class: { kind: 'concrete', classId: 'lancer' },
        attribute: { kind: 'concrete', attribute: 'earth' },
        families: [],
      },
      attackerHpPermille: 1000,
      battleState: { battlePointPhase: null },
      canonicalInputValues: {},
      craftEssence: null,
      preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' }],
      mysticCode: null,
      support: null,
      effectDecisions: [],
      activationFacts: [],
      worldFactAssertions: [],
      explicitOverrides: {},
    });
    expect(
      calculationScenarioSchema.safeParse({
        ...base,
        canonicalInputValues: undefined,
        battleContext: { values: { 'field:enemyCount': 2 } },
      }).success,
    ).toBe(false);
    expect(
      calculationScenarioSchema.safeParse({
        ...base,
        canonicalInputValues: { 'field:enemyCount': 2 },
      }).success,
    ).toBe(false);
  });

  it('rejects out-of-domain quantity world facts at the portable input boundary', () => {
    const scenario = calculationScenarioSchema.parse({
      mode: 'resolved',
      attacker: {
        servantId: '1',
        initialActorFormId: { actorId: '1', limitCount: 0 },
        source: 'master',
        level: 90,
        npLevel: 1,
        fouAtk: 1000,
      },
      overcharge: 1,
      targetContext: {
        class: { kind: 'concrete', classId: 'lancer' },
        attribute: { kind: 'concrete', attribute: 'earth' },
        families: [],
      },
      attackerHpPermille: null,
      battleState: { battlePointPhase: null },
      canonicalInputValues: {},
      craftEssence: null,
      preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' }],
      mysticCode: null,
      support: null,
      effectDecisions: [],
      activationFacts: [],
      worldFactAssertions: [],
      explicitOverrides: {},
    });
    for (const [quantity, domain] of Object.entries(QUANTITY_FACT_DOMAINS)) {
      for (const value of [domain.min, domain.max])
        expect(
          calculationScenarioSchema.safeParse({
            ...scenario,
            worldFactAssertions: [
              { decisionKey: `world:${quantity}`, fact: { kind: 'quantity', quantity, value } },
            ],
          }).success,
          `${quantity}:${String(value)}`,
        ).toBe(true);
    }
    for (const [quantity, values] of [
      ['attackerHpPermille', [-1, 1_001]],
      ['targetRarity', [-1, 6]],
      ['battlePointPhase', [-1, 11]],
    ] as const)
      for (const value of values)
        expect(
          calculationScenarioSchema.safeParse({
            ...scenario,
            worldFactAssertions: [
              { decisionKey: `world:${quantity}`, fact: { kind: 'quantity', quantity, value } },
            ],
          }).success,
          `${quantity}:${String(value)}`,
        ).toBe(false);
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
        engineVersion: ENGINE_VERSION,
        appVersion: '0.1.0',
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
      },
    };
    expect(calculationResultSchema.safeParse(unsupported).success).toBe(false);
  });

  it('rejects old schema envelopes while parsing engine versions as bounded opaque identity', () => {
    const currentResult = {
      status: 'unsupported',
      rows: [],
      effects: [],
      assumptions: [],
      issues: [],
      trace: [],
      evidence: [
        {
          key: 'kernel:np-damage-v1',
          subject: 'fixture',
          status: 'validated',
          sources: [],
          goldenCaseIds: [],
          differentialCaseIds: [],
          reviewedAt: '2026-08-25',
          engineVersion: ENGINE_VERSION,
        },
      ],
      missingEvidence: ['fixture'],
      versions: {
        schemaVersion: SCHEMA_VERSION,
        masterDataVersion: 'fixture',
        engineVersion: ENGINE_VERSION,
        appVersion: '0.1.0',
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
      },
    };
    expect(calculationResultSchema.safeParse(currentResult).success).toBe(true);
    expect(
      calculationResultSchema.safeParse({
        ...currentResult,
        versions: { ...currentResult.versions, schemaVersion: SCHEMA_VERSION - 1 },
      }).success,
    ).toBe(false);
    expect(
      calculationResultSchema.safeParse({
        ...currentResult,
        versions: { ...currentResult.versions, engineVersion: '3.0.0' },
      }).success,
    ).toBe(true);
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
      damageResolutionInputSchema.shape.npSpecialMultipliers.safeParse([1, 1.5, 2, 2.5, 3]),
    ).toMatchObject({ success: true });
    expect(damageResolutionInputSchema.shape.npSpecialMultipliers.safeParse(1.5)).toMatchObject({
      success: false,
    });
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
            skills: [{ skillId: 'skill-1', skillLevel: 10, enabled: true }],
          },
        ],
        effectInclusions: [
          {
            sourceInstanceId: 'support-instance-1',
            skillId: 'skill-1',
            effectId: 'attack-up',
            effectOccurrenceId: 'attack-up:0',
            included: false,
          },
        ],
      },
      updatedAt: '2026-08-24T00:00:00.000Z',
      lastUsedAt: null,
    });

    expect(template.composition.effectInclusions).toHaveLength(1);
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

  it('migrates exact schema 32 profiles and backups while discarding only calculation snapshots', () => {
    const profileId = crypto.randomUUID();
    const profile = {
      profileId,
      name: '保存済み',
      createdAt: '2026-08-24T00:00:00.000Z',
      updatedAt: '2026-08-25T00:00:00.000Z',
      servantBuilds: {
        '405900': {
          servantId: '405900',
          level: 90,
          ascension: 4,
          npLevel: 2,
          fouAtk: 1000,
          skills: { '1': 10 },
          appends: {},
          updatedAt: '2026-08-25T00:00:00.000Z',
        },
      },
      servantTargets: {},
      craftEssences: [],
      supportTemplates: [],
      draft: { unsafeLegacyScenario: true },
      history: [{ unsafeLegacyScenario: true }],
    };
    const migrated = parseStoredProfileCollection({
      schemaVersion: 32,
      activeProfileId: profileId,
      profiles: [profile],
    });
    expect(migrated).toMatchObject({
      upgraded: true,
      collection: {
        schemaVersion: SCHEMA_VERSION,
        activeProfileId: profileId,
        profiles: [
          {
            profileId,
            name: '保存済み',
            servantBuilds: { '405900': { npLevel: 2 } },
            draft: null,
            history: [],
          },
        ],
      },
    });
    expect(
      parseUserDataBackup({
        kind: 'fgo-lab-user-backup',
        schemaVersion: 32,
        exportedAt: '2026-09-01T00:00:00.000Z',
        appVersion: '0.1.0',
        profiles: { schemaVersion: 32, activeProfileId: profileId, profiles: [profile] },
      }),
    ).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      profiles: { profiles: [{ profileId, draft: null, history: [] }] },
    });
  });

  it('does not reinterpret unknown future profile schemas', () => {
    expect(() =>
      parseStoredProfileCollection({ schemaVersion: SCHEMA_VERSION + 1, profiles: [] }),
    ).toThrow();
  });
});
