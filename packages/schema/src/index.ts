import { z } from 'zod';

export const SCHEMA_VERSION = 7 as const;
export const ENGINE_VERSION = '4.1.0' as const;
export const APP_VERSION = '0.1.0' as const;

export const versionContextSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  masterDataVersion: z.string().min(1).max(100),
  engineVersion: z.literal(ENGINE_VERSION),
  appVersion: z.string().min(1).max(50),
  gameRegion: z.literal('JP'),
  masterDataLocale: z.literal('ja-JP'),
});
export type VersionContext = z.infer<typeof versionContextSchema>;

const skillLevelsSchema = z.record(z.string().min(1), z.number().int().min(1).max(10));
const appendLevelsSchema = z.record(z.string().min(1), z.number().int().min(0).max(10));

export const servantBuildSchema = z.object({
  servantId: z.string().min(1).max(80),
  level: z.number().int().min(1).max(120),
  ascension: z.number().int().min(0).max(4),
  npLevel: z.number().int().min(0).max(5),
  fouAtk: z.number().int().min(0).max(3000),
  skills: skillLevelsSchema,
  appends: appendLevelsSchema,
  updatedAt: z.iso.datetime(),
});
export type ServantBuild = z.infer<typeof servantBuildSchema>;

export const servantTargetSchema = servantBuildSchema.omit({ npLevel: true }).extend({
  planned: z.boolean(),
});
export type ServantTarget = z.infer<typeof servantTargetSchema>;

export const craftEssenceCopySchema = z.object({
  copyId: z.uuid(),
  craftEssenceId: z.string().min(1).max(80),
  level: z.number().int().min(1).max(100),
  limitBreak: z.number().int().min(0).max(4),
  updatedAt: z.iso.datetime(),
});
export type CraftEssenceCopy = z.infer<typeof craftEssenceCopySchema>;

export const supportSkillSchema = z.object({
  skillId: z.string().min(1).max(80),
  skillLevel: z.number().int().min(1).max(10),
});
export type SupportSkill = z.infer<typeof supportSkillSchema>;

export const supportSourceSchema = z.object({
  sourceInstanceId: z.string().min(1).max(160),
  servantId: z.string().min(1).max(80),
  skills: z.array(supportSkillSchema).max(20),
});
export type SupportSource = z.infer<typeof supportSourceSchema>;

export const supportEffectRefSchema = z.object({
  sourceInstanceId: z.string().min(1).max(160),
  skillId: z.string().min(1).max(80),
  effectId: z.string().min(1).max(80),
});
export type SupportEffectRef = z.infer<typeof supportEffectRefSchema>;

export const supportCompositionSchema = z.object({
  sources: z.array(supportSourceSchema).max(20),
  selectedEffects: z.array(supportEffectRefSchema).max(200),
});
export type SupportComposition = z.infer<typeof supportCompositionSchema>;

export const supportTemplateSchema = z.object({
  templateId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  masterDataVersion: z.string().min(1),
  composition: supportCompositionSchema,
  updatedAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
});
export type SupportTemplate = z.infer<typeof supportTemplateSchema>;

export const damageResolutionInputSchema = z.object({
  attackerId: z.string().min(1).max(80),
  attackerLevel: z.number().int().min(1).max(120),
  attackerAtk: z.number().int().nonnegative().max(100000),
  fouAtk: z.number().int().nonnegative().max(3000),
  craftEssenceId: z.string().max(80).nullable(),
  craftEssenceAtk: z.number().int().nonnegative().max(10000),
  npLevel: z.number().int().min(1).max(5),
  overcharge: z.number().int().min(1).max(5),
  npMultipliers: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]),
  damageFunction: z.discriminatedUnion('status', [
    z.object({
      status: z.literal('resolved'),
      kind: z.enum([
        'standard',
        'defensePiercing',
        'trait',
        'traitCount',
        'stateTrait',
        'hpRatioLow',
        'battlePointPhase',
        'targetRarity',
        'traitExpression',
      ]),
      ignoreDefense: z.boolean(),
    }),
    z.object({
      status: z.literal('unsupported'),
      kind: z.enum([
        'standard',
        'defensePiercing',
        'trait',
        'traitCount',
        'stateTrait',
        'hpRatioLow',
        'battlePointPhase',
        'targetRarity',
        'traitExpression',
      ]),
      missingEvidence: z.string().min(1),
    }),
  ]),
  cardType: z.enum(['buster', 'arts', 'quick']),
  classAttackRate: z.number().min(0).max(5),
  classAffinity: z.number().min(0).max(5),
  attributeAffinity: z.number().min(0).max(5),
  attackBuff: z.number().min(-1).max(5),
  defenseBuff: z.number().min(-5).max(5).default(0),
  cardBuff: z.number().min(-1).max(5),
  cardResistance: z.number().min(-5).max(5).default(0),
  npDamageBuff: z.number().min(-1).max(5),
  npResistance: z.number().min(-5).max(5).default(0),
  powerMod: z.number().min(-1).max(10),
  eventDamageBuff: z.number().min(-1).max(10).default(0),
  npSpecialMultipliers: z.tuple([
    z.number().min(0).max(20),
    z.number().min(0).max(20),
    z.number().min(0).max(20),
    z.number().min(0).max(20),
    z.number().min(0).max(20),
  ]),
  specialDamageBuff: z.number().min(-1).max(20).default(0),
  specialResistance: z.number().min(-5).max(5),
  flatDamage: z.number().int().min(-100000).max(100000),
  damageCut: z.number().int().min(0).max(100000).default(0),
  fieldTraits: z.array(z.string().min(1).max(80)).max(100).default([]),
  attackerStateTraits: z.array(z.string().min(1).max(80)).max(100),
  attackerHpPermille: z.number().int().min(0).max(1000).nullable(),
  targetRarity: z.number().int().min(0).max(5).nullable(),
  targetStateTraits: z.array(z.string().min(1).max(80)).max(100),
  battlePointPhase: z.number().int().nonnegative().nullable(),
  target: z.object({
    classId: z.string().min(1).max(40),
    attribute: z.enum(['man', 'earth', 'sky', 'star', 'beast', 'unknown']),
    traits: z.array(z.string().min(1).max(80)).max(100),
  }),
});
export type DamageResolutionInput = z.infer<typeof damageResolutionInputSchema>;

export const damageKernelInputSchema = z
  .object({
    totalAtk: z.number().int().nonnegative().max(120000),
    npMultiplierPermille: z.number().nonnegative().max(200000),
    card: z.enum(['buster', 'arts', 'quick']),
    classAttackRatePermille: z.number().nonnegative().max(5000),
    classAffinityPermille: z.number().nonnegative().max(5000),
    attributeAffinityPermille: z.number().nonnegative().max(5000),
    attackModifierPermille: z.number().min(-5000).max(10000),
    cardModifierPermille: z.number().min(-5000).max(10000),
    npPowerModifierPermille: z.number().min(-5000).max(30000),
    specialModifierPermille: z.number().nonnegative().max(200000),
    npSpecialMultiplierPermille: z.number().nonnegative().max(20000),
    flatDamage: z.number().int().min(-100000).max(100000),
    damageCut: z.number().int().nonnegative().max(100000),
    ignoreDefense: z.boolean(),
  })
  .strict();
export type DamageKernelInput = z.infer<typeof damageKernelInputSchema>;

export const attackerSkillSelectionSchema = z.object({
  skillId: z.string().min(1).max(80),
  skillLevel: z.number().int().min(1).max(10),
});
export type AttackerSkillSelection = z.infer<typeof attackerSkillSelectionSchema>;

export const calculationEditorStateSchema = z.object({
  attackerSource: z.enum(['owned', 'master']),
  effectMode: z.enum(['resolved', 'manual']).default('resolved'),
  attackerSkills: z.array(attackerSkillSelectionSchema).max(20).optional(),
  mysticCode: z
    .object({
      mysticCodeId: z.string().min(1).max(80),
      skills: z.array(attackerSkillSelectionSchema).min(1).max(3),
    })
    .nullable()
    .optional(),
  effectOverrides: z.record(z.string(), z.boolean()).optional(),
  support: z
    .object({
      sourceTemplateId: z.uuid().nullable(),
      composition: supportCompositionSchema,
    })
    .nullable()
    .optional(),
  manualOverrides: z
    .array(
      z.enum([
        'attackerAtk',
        'fouAtk',
        'craftEssenceAtk',
        'classAttackRate',
        'classAffinity',
        'attributeAffinity',
      ]),
    )
    .max(6)
    .optional(),
  craftEssence: z
    .object({
      source: z.enum(['registered', 'master']),
      craftEssenceId: z.string().min(1).max(80),
      copyId: z.uuid().nullable(),
      level: z.number().int().min(1).max(100),
      limitBreak: z.number().int().min(0).max(4),
    })
    .nullable(),
});
export type CalculationEditorState = z.infer<typeof calculationEditorStateSchema>;

const scenarioBaseSchema = z
  .object({
    attacker: z.object({
      servantId: z.string().min(1).max(80),
      source: z.enum(['owned', 'master']),
      level: z.number().int().min(1).max(120),
      npLevel: z.number().int().min(1).max(5),
      fouAtk: z.number().int().min(0).max(3000),
      stateTraits: z.array(z.string().min(1).max(80)).max(100),
    }),
    overcharge: z.number().int().min(1).max(5),
    target: z.object({
      classId: z.string().min(1).max(40),
      attribute: z.enum(['man', 'earth', 'sky', 'star', 'beast', 'unknown']),
      traits: z.array(z.string().min(1).max(80)).max(100),
      stateTraits: z.array(z.string().min(1).max(80)).max(100),
      rarity: z.number().int().min(0).max(5).nullable(),
    }),
    attackerHpPermille: z.number().int().min(0).max(1000).nullable(),
    fieldTraits: z.array(z.string().min(1).max(80)).max(100),
    battleState: z.object({ battlePointPhase: z.number().int().nonnegative().nullable() }),
    assumptions: z.object({
      classAffinity: z.number().min(0).max(5),
      attributeAffinity: z.number().min(0).max(5),
    }),
  })
  .strict();

const resolvedScenarioSchema = scenarioBaseSchema
  .extend({
    mode: z.literal('resolved'),
    craftEssence: z
      .object({
        craftEssenceId: z.string().min(1).max(80),
        level: z.number().int().min(1).max(100),
        limitBreak: z.number().int().min(0).max(4),
      })
      .nullable(),
    attackerSkills: z.array(attackerSkillSelectionSchema).max(20),
    mysticCode: calculationEditorStateSchema.shape.mysticCode.unwrap().nullable(),
    support: calculationEditorStateSchema.shape.support.unwrap().nullable(),
    effectDecisions: z.record(z.string(), z.boolean()),
    explicitOverrides: z.object({
      attackerAtk: z.number().int().nonnegative().max(100000).optional(),
      fouAtk: z.number().int().nonnegative().max(3000).optional(),
      craftEssenceAtk: z.number().int().nonnegative().max(10000).optional(),
      classAttackRate: z.number().min(0).max(5).optional(),
    }),
  })
  .strict();

const manualScenarioSchema = scenarioBaseSchema
  .extend({
    mode: z.literal('manual'),
    manual: damageResolutionInputSchema,
  })
  .strict();

export const calculationScenarioSchema = z.discriminatedUnion('mode', [
  resolvedScenarioSchema,
  manualScenarioSchema,
]);
export type CalculationScenario = z.infer<typeof calculationScenarioSchema>;

export const damageRowSchema = z.object({
  npLevel: z.number().int().min(1).max(5),
  minimum: z.number().int().nonnegative(),
  average: z.number().nonnegative(),
  maximum: z.number().int().nonnegative(),
});
export type DamageRow = z.infer<typeof damageRowSchema>;
export const calculationEvidenceSchema = z.object({
  key: z.string().min(1),
  subject: z.string().min(1),
  status: z.enum(['validated', 'provisional']),
  sources: z.array(z.string().min(1)),
  goldenCaseIds: z.array(z.string().min(1)),
  differentialCaseIds: z.array(z.string().min(1)),
  reviewedAt: z.iso.date(),
  engineVersion: z.literal(ENGINE_VERSION),
});
export type CalculationEvidence = z.infer<typeof calculationEvidenceSchema>;
const resultBaseSchema = z.object({
  effects: z.array(
    z.object({
      effectKey: z.string(),
      state: z.enum(['applied', 'rejected', 'unsupported']),
      reasonCode: z.string(),
    }),
  ),
  assumptions: z.array(z.string()),
  issues: z.array(z.object({ code: z.string(), detail: z.string() })),
  trace: z.array(z.object({ step: z.string(), detail: z.string() })),
  evidence: z.array(calculationEvidenceSchema).min(1),
  versions: versionContextSchema,
});
const calculatedResultSchema = resultBaseSchema.extend({
  status: z.literal('calculated'),
  precision: z.enum(['exact', 'approximate']),
  rows: z.tuple([
    damageRowSchema,
    damageRowSchema,
    damageRowSchema,
    damageRowSchema,
    damageRowSchema,
  ]),
  breakdown: z.array(z.object({ key: z.string(), labelKey: z.string(), value: z.number() })),
});
const unsupportedResultSchema = resultBaseSchema.extend({
  status: z.literal('unsupported'),
  rows: z.tuple([]),
  missingEvidence: z.array(z.string()),
});
export const calculationResultSchema = z.discriminatedUnion('status', [
  calculatedResultSchema,
  unsupportedResultSchema,
]);
export type CalculationResult = z.infer<typeof calculationResultSchema>;

export const calculationDraftSchema = z.object({
  profileId: z.uuid(),
  calculationSessionId: z.uuid(),
  scenario: calculationScenarioSchema,
  result: calculationResultSchema,
  scenarioFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  updatedAt: z.iso.datetime(),
});
export const calculationHistoryEntrySchema = calculationDraftSchema.extend({
  historyId: z.uuid(),
  finalizedAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime(),
});

export const localProfileSchema = z.object({
  profileId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  servantBuilds: z.record(z.string(), servantBuildSchema),
  servantTargets: z.record(z.string(), servantTargetSchema),
  craftEssences: z.array(craftEssenceCopySchema).max(10000),
  supportTemplates: z.array(supportTemplateSchema).max(1000),
  draft: calculationDraftSchema.nullable(),
  history: z.array(calculationHistoryEntrySchema).max(20),
});
export type LocalProfile = z.infer<typeof localProfileSchema>;

export const profileCollectionSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  activeProfileId: z.uuid(),
  profiles: z.array(localProfileSchema).min(1).max(20),
});
export type ProfileCollection = z.infer<typeof profileCollectionSchema>;

export function parseStoredProfileCollection(value: unknown): {
  collection: ProfileCollection;
  upgraded: boolean;
} {
  return { collection: profileCollectionSchema.parse(value), upgraded: false };
}

export const userDataBackupSchema = z.object({
  kind: z.literal('fgo-lab-user-backup'),
  schemaVersion: z.literal(SCHEMA_VERSION),
  exportedAt: z.iso.datetime(),
  appVersion: z.string(),
  profiles: profileCollectionSchema,
});
export type UserDataBackup = z.infer<typeof userDataBackupSchema>;

export const calculationShareSnapshotSchema = z.object({
  kind: z.literal('fgo-lab-calculation-share'),
  schemaVersion: z.literal(SCHEMA_VERSION),
  sharedAt: z.iso.datetime(),
  scenario: calculationScenarioSchema,
  result: calculationResultSchema,
});
export type CalculationShareSnapshot = z.infer<typeof calculationShareSnapshotSchema>;

export function parseUserDataBackup(value: unknown): UserDataBackup {
  return userDataBackupSchema.parse(value);
}

export function parseCalculationShareSnapshot(value: unknown): CalculationShareSnapshot {
  return calculationShareSnapshotSchema.parse(value);
}
