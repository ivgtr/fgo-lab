import { z } from 'zod';

export const SCHEMA_VERSION = 1 as const;
export const ENGINE_VERSION = '1.1.0' as const;
export const APP_VERSION = '0.1.0' as const;

export const versionContextSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  masterDataVersion: z.string().min(1).max(100),
  engineVersion: z.string().min(1).max(50),
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
  fouAtk: z.number().int().min(0).max(5000),
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

export const supportEffectSchema = z.object({
  sourceType: z.enum(['servant', 'craftEssence', 'mysticCode', 'custom']),
  sourceId: z.string().min(1).max(80),
  effectId: z.string().min(1).max(80),
  skillLevel: z.number().int().min(1).max(10),
  targetRole: z.literal('ATTACKER'),
  enabled: z.boolean(),
  order: z.number().int().nonnegative(),
});
export const supportTemplateSchema = z.object({
  templateId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  masterDataVersion: z.string().min(1),
  effects: z.array(supportEffectSchema).max(100),
  updatedAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
});
export type SupportTemplate = z.infer<typeof supportTemplateSchema>;

export const calcInputSchema = z.object({
  attackerId: z.string().min(1).max(80),
  attackerLevel: z.number().int().min(1).max(120),
  attackerAtk: z.number().int().nonnegative().max(100000),
  fouAtk: z.number().int().nonnegative().max(5000),
  craftEssenceId: z.string().max(80).nullable(),
  craftEssenceAtk: z.number().int().nonnegative().max(10000),
  npLevel: z.number().int().min(1).max(5),
  overcharge: z.number().int().min(1).max(5),
  npMultipliers: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]),
  attackNpFunctionType: z.string().optional(),
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
  npSpecialMultiplier: z.number().min(0).max(20),
  specialDamageBuff: z.number().min(-1).max(20).default(0),
  specialResistance: z.number().min(-5).max(5),
  flatDamage: z.number().int().min(-100000).max(100000),
  damageCut: z.number().int().min(0).max(100000).default(0),
  target: z.object({
    classId: z.string().min(1).max(40),
    attribute: z.enum(['man', 'earth', 'sky', 'star', 'beast', 'unknown']),
    traits: z.array(z.string().min(1).max(80)).max(100),
  }),
});
export type CalcInput = z.infer<typeof calcInputSchema>;

export const attackerSkillSelectionSchema = z.object({
  skillId: z.string().min(1).max(80),
  skillLevel: z.number().int().min(1).max(10),
  enabled: z.boolean(),
});
export type AttackerSkillSelection = z.infer<typeof attackerSkillSelectionSchema>;

export const calculationSelectionSchema = z.object({
  attackerSource: z.enum(['owned', 'master']),
  attackerSkills: z.array(attackerSkillSelectionSchema).max(20).optional(),
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
export type CalculationSelection = z.infer<typeof calculationSelectionSchema>;

export const damageSummarySchema = z.object({
  npLevel: z.number().int().min(1).max(5),
  minimum: z.number().int().nonnegative(),
  average: z.number().nonnegative(),
  maximum: z.number().int().nonnegative(),
});
export const calcResultSchema = z.object({
  precision: z.enum(['exact', 'approximate', 'unsupported']),
  results: z.array(damageSummarySchema).length(5),
  breakdown: z.array(z.object({ key: z.string(), labelKey: z.string(), value: z.number() })),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
  trace: z.array(z.object({ step: z.string(), detail: z.string() })),
  versions: versionContextSchema,
});
export type CalcResult = z.infer<typeof calcResultSchema>;

export const calculationDraftSchema = z.object({
  profileId: z.uuid(),
  calculationSessionId: z.uuid(),
  input: calcInputSchema,
  result: calcResultSchema,
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  supportTemplate: supportTemplateSchema.nullable().optional(),
  selection: calculationSelectionSchema.optional(),
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

export const userDataBackupSchema = z.object({
  kind: z.literal('fgo-lab-user-backup'),
  schemaVersion: z.literal(SCHEMA_VERSION),
  exportedAt: z.iso.datetime(),
  appVersion: z.string(),
  profiles: profileCollectionSchema,
});
export type UserDataBackup = z.infer<typeof userDataBackupSchema>;

export const calculationShareCompositionSchema = z.object({
  craftEssence: calculationSelectionSchema.shape.craftEssence
    .unwrap()
    .omit({ source: true, copyId: true })
    .nullable(),
});

export const calculationShareSnapshotSchema = z.object({
  kind: z.literal('fgo-lab-calculation-share'),
  schemaVersion: z.literal(SCHEMA_VERSION),
  sharedAt: z.iso.datetime(),
  input: calcInputSchema,
  result: calcResultSchema,
  composition: calculationShareCompositionSchema.optional(),
});
export type CalculationShareSnapshot = z.infer<typeof calculationShareSnapshotSchema>;

export function parseUserDataBackup(value: unknown): UserDataBackup {
  return userDataBackupSchema.parse(value);
}

export function parseCalculationShareSnapshot(value: unknown): CalculationShareSnapshot {
  return calculationShareSnapshotSchema.parse(value);
}
