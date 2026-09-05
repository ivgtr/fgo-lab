import { describe, expect, it } from 'vitest';
import {
  calculationShareSnapshotSchema,
  calculationResultSchema,
  calculationScenarioSchema,
  damageResolutionInputSchema,
  ENGINE_VERSION,
  localProfileSchema,
  parseUserDataBackup,
  parseStoredProfileCollection,
  SCHEMA_VERSION,
  supportTemplateSchema,
  QUANTITY_FACT_DOMAINS,
} from './index';

const servantIdentityProfileId = '00000000-0000-4000-8000-000000000047';
const servantIdentityTimestamp = '2026-09-05T00:00:00.000Z';
function servantIdentityProfile() {
  return {
    profileId: servantIdentityProfileId,
    name: 'identity fixture',
    createdAt: servantIdentityTimestamp,
    updatedAt: servantIdentityTimestamp,
    servantBuilds: {
      'servant-a': {
        servantId: 'servant-a',
        level: 1,
        ascension: 0,
        npLevel: 0,
        fouAtk: 0,
        skills: {},
        appends: {},
        updatedAt: servantIdentityTimestamp,
      },
    },
    servantTargets: {
      'servant-a': {
        servantId: 'servant-a',
        level: 1,
        ascension: 0,
        fouAtk: 0,
        skills: {},
        appends: {},
        planned: true,
        updatedAt: servantIdentityTimestamp,
      },
    },
    craftEssences: [],
    supportTemplates: [],
    draft: null,
    history: [],
  };
}

function servantIdentityCollection(schemaVersion: 32 | 33 | 34 | 35 | typeof SCHEMA_VERSION) {
  return {
    schemaVersion,
    activeProfileId: servantIdentityProfileId,
    profiles: [servantIdentityProfile()],
  };
}

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

  it('retains coherent NP0 build and target identities in the current profile schema', () => {
    for (const npLevel of [0, 1, 2, 3, 4, 5]) {
      const collection = servantIdentityCollection(SCHEMA_VERSION);
      collection.profiles[0]!.servantBuilds['servant-a'].npLevel = npLevel;
      expect(
        parseStoredProfileCollection(collection).collection.profiles[0]?.servantBuilds,
      ).toEqual(collection.profiles[0]!.servantBuilds);
    }
    expect(parseStoredProfileCollection(servantIdentityCollection(SCHEMA_VERSION))).toMatchObject({
      upgraded: false,
      collection: {
        profiles: [
          {
            servantBuilds: { 'servant-a': { servantId: 'servant-a', npLevel: 0 } },
            servantTargets: { 'servant-a': { servantId: 'servant-a' } },
          },
        ],
      },
    });
  });

  it.each([34, 35] as const)(
    'migrates coherent schema %s and historicalizes only ranking snapshots',
    (sourceVersion) => {
      const baseCollection = servantIdentityCollection(sourceVersion);
      const scenario = calculationScenarioSchema.parse({
        mode: 'resolved',
        attacker: {
          servantId: 'servant-a',
          initialActorFormId: { actorId: 'servant-a', limitCount: 0 },
          source: 'master',
          level: 1,
          npLevel: 1,
          fouAtk: 0,
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
      const snapshot = {
        profileId: servantIdentityProfileId,
        calculationSessionId: '00000000-0000-4000-8000-000000000048',
        request: {
          versionContext: { masterDataVersion: 'fixture', engineVersion: ENGINE_VERSION },
          scenario,
          executionIntent: { kind: 'calculator', initialNpGauge: 10_000 },
        },
        result: {
          status: 'unsupported',
          rows: [],
          effects: [],
          assumptions: [],
          issues: [],
          trace: [],
          evidence: [
            {
              key: 'schema-34',
              subject: 'fixture',
              status: 'provisional',
              sources: ['fixture'],
              goldenCaseIds: [],
              differentialCaseIds: [],
              reviewedAt: '2026-09-05',
              engineVersion: ENGINE_VERSION,
            },
          ],
          missingEvidence: ['schema-34'],
          versions: {
            schemaVersion: sourceVersion,
            masterDataVersion: 'fixture',
            engineVersion: ENGINE_VERSION,
            appVersion: '0.1.0',
            gameRegion: 'JP',
            masterDataLocale: 'ja-JP',
          },
        },
        requestFingerprint: 'a'.repeat(64),
        updatedAt: servantIdentityTimestamp,
      };
      const collection = {
        ...baseCollection,
        profiles: [
          {
            ...baseCollection.profiles[0]!,
            draft: snapshot,
            history: [
              {
                ...snapshot,
                historyId: '00000000-0000-4000-8000-000000000049',
                finalizedAt: servantIdentityTimestamp,
                lastUsedAt: servantIdentityTimestamp,
              },
            ],
          },
        ],
      };
      const migrated = parseStoredProfileCollection(collection);
      expect(migrated).toMatchObject({
        upgraded: true,
        discardedCalculationSnapshots: false,
        collection: {
          schemaVersion: SCHEMA_VERSION,
          profiles: [
            {
              servantBuilds: { 'servant-a': { npLevel: 0 } },
              draft: { result: { versions: { schemaVersion: SCHEMA_VERSION } } },
              history: [{ result: { versions: { schemaVersion: SCHEMA_VERSION } } }],
            },
          ],
        },
      });
      expect(
        parseUserDataBackup({
          kind: 'fgo-lab-user-backup',
          schemaVersion: sourceVersion,
          exportedAt: servantIdentityTimestamp,
          appVersion: '0.1.0',
          profiles: collection,
        }),
      ).toMatchObject({
        schemaVersion: SCHEMA_VERSION,
        profiles: migrated.collection,
      });
      const rankingSnapshot = {
        ...snapshot,
        request: {
          ...snapshot.request,
          executionIntent: {
            kind: 'ranking',
            initialNpGauge: 10000,
            policy: { selfBuffs: 'included', conditionalEffects: 'baseline' },
          },
        },
      };
      const rankingCollection = {
        ...collection,
        profiles: [
          {
            ...collection.profiles[0]!,
            draft: rankingSnapshot,
            history: [{ ...collection.profiles[0]!.history[0]!, ...rankingSnapshot }],
          },
        ],
      };
      const historical = parseStoredProfileCollection(rankingCollection);
      expect(historical.discardedCalculationSnapshots).toBe(true);
      expect(historical.collection.profiles[0]!.draft).toBeNull();
      expect(historical.collection.profiles[0]!.history[0]).toMatchObject({
        disposition: 'historicalOnly',
        sourceSchemaVersion: sourceVersion,
        scenario,
        legacyRankingIntent: rankingSnapshot.request.executionIntent,
      });
      expect(historical.collection.profiles[0]!.history[0]).not.toHaveProperty('request');
      expect(
        parseUserDataBackup({
          kind: 'fgo-lab-user-backup',
          schemaVersion: sourceVersion,
          exportedAt: servantIdentityTimestamp,
          appVersion: '0.1.0',
          profiles: rankingCollection,
        }).profiles,
      ).toEqual(historical.collection);
      const mixed = structuredClone(rankingCollection);
      Object.assign(mixed.profiles[0]!.draft.request.executionIntent.policy, { population: 'all' });
      expect(() => parseStoredProfileCollection(mixed)).toThrow();
    },
  );

  it.each(['servantBuilds', 'servantTargets'] as const)(
    'rejects a %s record identity mismatch in current and v32/v33/v34 profile or backup input',
    (mapName) => {
      for (const schemaVersion of [SCHEMA_VERSION, 35, 34, 33, 32] as const) {
        const collection = servantIdentityCollection(schemaVersion);
        collection.profiles[0]![mapName]['servant-a'].servantId = 'servant-b';
        expect(
          () => parseStoredProfileCollection(collection),
          `${mapName}:stored:v${String(schemaVersion)}`,
        ).toThrow(/servant_record_identity_mismatch/);
        expect(
          () =>
            parseUserDataBackup({
              kind: 'fgo-lab-user-backup',
              schemaVersion,
              exportedAt: servantIdentityTimestamp,
              appVersion: '0.1.0',
              profiles: collection,
            }),
          `${mapName}:backup:v${String(schemaVersion)}`,
        ).toThrow(/servant_record_identity_mismatch/);
      }
    },
  );

  it.each(['servantBuilds', 'servantTargets'] as const)(
    'conserves raw %s keys or rejects before current and legacy stored/backup parsing',
    (mapName) => {
      for (const schemaVersion of [SCHEMA_VERSION, 35, 34, 33, 32] as const)
        for (const recordKey of ['servant-a', '__proto__', 'constructor', 'toString'])
          for (const matching of [true, false]) {
            const source = servantIdentityCollection(schemaVersion);
            const profile = source.profiles[0]!;
            // JSON creates an own __proto__ property, not an object-literal prototype setter.
            const records = JSON.parse(
              JSON.stringify({
                [recordKey]: {
                  ...profile[mapName]['servant-a'],
                  servantId: matching ? recordKey : 'servant-b',
                },
              }),
            ) as Record<string, unknown>;
            const collection = {
              ...source,
              profiles: [{ ...profile, [mapName]: records }],
            };
            const inputs = [
              () => parseStoredProfileCollection(collection).collection,
              () =>
                parseUserDataBackup({
                  kind: 'fgo-lab-user-backup',
                  schemaVersion,
                  exportedAt: servantIdentityTimestamp,
                  appVersion: '0.1.0',
                  profiles: collection,
                }).profiles,
            ];
            for (const parse of inputs) {
              const label = `${mapName}:v${String(schemaVersion)}:${recordKey}:${String(matching)}`;
              if (recordKey === '__proto__')
                expect(parse, label).toThrow(/servant_record_key_not_preserved/);
              else if (!matching) expect(parse, label).toThrow(/servant_record_identity_mismatch/);
              else expect(parse().profiles[0]![mapName], label).toEqual(records);
              expect(Object.keys(records), label).toEqual([recordKey]);
            }
          }
    },
  );

  it.each(['servantBuilds', 'servantTargets'] as const)(
    'retains schema errors for malformed %s maps and values',
    (mapName) => {
      for (const records of [null, [], 1, { 'servant-a': null }, { 'servant-a': {} }]) {
        const parsed = localProfileSchema.safeParse({
          ...servantIdentityProfile(),
          [mapName]: records,
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success)
          expect(parsed.error.issues.some((issue) => issue.path[0] === mapName)).toBe(true);
      }
    },
  );

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

  it('migrates schema 33 by intent without inferring a missing ranking policy', () => {
    const profileId = crypto.randomUUID();
    const now = '2026-09-01T00:00:00.000Z';
    const resolved = calculationScenarioSchema.parse({
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
    const manual = calculationScenarioSchema.parse({
      mode: 'manual',
      manual: {
        attackerId: '1',
        attackerLevel: 90,
        attackerAtk: 10_000,
        fouAtk: 1_000,
        craftEssenceId: null,
        craftEssenceAtk: 0,
        npLevel: 1,
        overcharge: 1,
        npMultipliers: [3, 4, 4.5, 4.75, 5],
        damageFunction: { status: 'resolved', kind: 'standard', ignoreDefense: false },
        cardType: 'buster',
        classAttackRate: 1,
        classAffinity: 1,
        attributeAffinity: 1,
        attackBuff: 0,
        defenseBuff: 0,
        cardBuff: 0,
        cardResistance: 0,
        npDamageBuff: 0,
        npResistance: 0,
        powerMod: 0,
        eventDamageBuff: 0,
        npSpecialMultipliers: [1, 1, 1, 1, 1],
        specialDamageBuff: 0,
        specialResistance: 0,
        flatDamage: 0,
        damageCut: 0,
        ignoreDamageCut: false,
        fieldTraits: [],
        attackerStateTraits: [],
        attackerHpPermille: null,
        targetRarity: null,
        targetStateTraits: [],
        battlePointPhase: null,
        target: { classId: 'lancer', attribute: 'earth', traits: [] },
      },
    });
    const versionContext = { masterDataVersion: 'fixture', engineVersion: '29.0.0' };
    const result = {
      status: 'unsupported',
      rows: [],
      effects: [],
      assumptions: [],
      issues: [],
      trace: [],
      evidence: [
        {
          key: 'legacy',
          subject: 'fixture',
          status: 'provisional',
          sources: ['fixture'],
          goldenCaseIds: ['fixture'],
          differentialCaseIds: [],
          reviewedAt: '2026-09-01',
          engineVersion: '29.0.0',
        },
      ],
      missingEvidence: ['legacy'],
      versions: {
        schemaVersion: 33,
        masterDataVersion: 'fixture',
        engineVersion: '29.0.0',
        appVersion: '0.1.0',
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
      },
    };
    const snapshot = (request: object, suffix: string) => ({
      profileId,
      calculationSessionId: `00000000-0000-4000-8000-0000000000${suffix}`,
      request,
      result,
      requestFingerprint: suffix.repeat(64).slice(0, 64),
      updatedAt: now,
    });
    const calculatorRequest = {
      versionContext,
      scenario: resolved,
      executionIntent: {
        kind: 'resolved',
        origin: 'calculator',
        initialNpGauge: 10_000,
        contribution: 'standard',
      },
    };
    const manualRequest = { versionContext, scenario: manual, executionIntent: { kind: 'manual' } };
    const rankingRequest = {
      versionContext,
      scenario: resolved,
      executionIntent: {
        kind: 'resolved',
        origin: 'ranking',
        initialNpGauge: 20_000,
        contribution: 'excludeVoluntarySkillModifiers',
      },
    };
    const history = (request: object, suffix: string) => ({
      ...snapshot(request, suffix),
      historyId: `10000000-0000-4000-8000-0000000000${suffix}`,
      finalizedAt: now,
      lastUsedAt: now,
    });
    const collection = {
      schemaVersion: 33,
      activeProfileId: profileId,
      profiles: [
        {
          profileId,
          name: 'schema 33',
          createdAt: now,
          updatedAt: now,
          servantBuilds: {},
          servantTargets: {},
          craftEssences: [],
          supportTemplates: [],
          draft: snapshot(rankingRequest, '01'),
          history: [
            history(manualRequest, '02'),
            history(calculatorRequest, '03'),
            history(rankingRequest, '04'),
          ],
        },
      ],
    };
    const migrated = parseStoredProfileCollection(collection);
    expect(migrated).toMatchObject({
      upgraded: true,
      discardedCalculationSnapshots: true,
      collection: {
        schemaVersion: SCHEMA_VERSION,
        profiles: [
          {
            draft: null,
            history: [
              { request: { executionIntent: { kind: 'manual' } } },
              { request: { executionIntent: { kind: 'calculator', initialNpGauge: 10_000 } } },
              {
                disposition: 'historicalOnly',
                sourceSchemaVersion: 33,
                legacyRankingIntent: {
                  initialNpGauge: 20_000,
                  contribution: 'excludeVoluntarySkillModifiers',
                },
              },
            ],
          },
        ],
      },
    });
    expect(
      parseUserDataBackup({
        kind: 'fgo-lab-user-backup',
        schemaVersion: 33,
        exportedAt: now,
        appVersion: '0.1.0',
        profiles: collection,
      }),
    ).toMatchObject({ schemaVersion: SCHEMA_VERSION, profiles: migrated.collection });
    expect(() =>
      parseStoredProfileCollection({
        ...collection,
        profiles: [
          {
            ...collection.profiles[0],
            draft: {
              ...snapshot(rankingRequest, '05'),
              request: { ...rankingRequest, executionIntent: { kind: 'ranking' } },
            },
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
