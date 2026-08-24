import { z } from 'zod';

export const masterFileSchema = z.object({
  key: z.string().min(1),
  file: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  required: z.boolean(),
});
export const masterManifestSchema = z.object({
  manifestVersion: z.literal(1),
  masterDataVersion: z.string().min(1),
  createdAt: z.iso.datetime(),
  source: z.object({
    name: z.literal('Atlas Academy'),
    region: z.literal('JP'),
    retrievedAt: z.iso.datetime(),
  }),
  artifactKind: z.enum(['production', 'diagnostic']),
  minimalAppVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  schemaVersion: z.literal(2),
  files: z.array(masterFileSchema).min(1),
  imagesEnabled: z.boolean(),
});
export type MasterManifest = z.infer<typeof masterManifestSchema>;

export const traitConditionSchema = z.object({
  anyOf: z.array(z.string()),
  noneOf: z.array(z.string()),
});
export type TraitCondition = z.infer<typeof traitConditionSchema>;

const masterEffectSchema = z.object({
  id: z.string(),
  type: z.string(),
  target: z.string(),
  label: z.string(),
  values: z.array(z.number()).max(10),
  recipientTraits: z.array(z.string()).optional(),
  targetCondition: traitConditionSchema.optional(),
  requiredFieldTraits: z.array(z.string()).optional(),
  buffTypes: z.array(z.string()).optional(),
});
export type MasterEffect = z.infer<typeof masterEffectSchema>;

const masterSkillSchema = z.object({
  id: z.string(),
  slot: z.number().int().min(0).max(20).default(0),
  priority: z.number().int().default(0),
  name: z.string(),
  detail: z.string(),
  imageKey: z.string().nullable(),
  effects: z.array(masterEffectSchema),
});
export type MasterSkill = z.infer<typeof masterSkillSchema>;

const fiveNumberTupleSchema = z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]);

export const servantMasterSchema = z.object({
  id: z.string(),
  name: z.string(),
  classId: z.string(),
  attribute: z.enum(['human', 'earth', 'sky', 'star', 'beast', 'unknown']).default('unknown'),
  rarity: z.number().int().min(0).max(5),
  hasAttackNp: z.boolean().default(true),
  npCard: z.enum(['buster', 'arts', 'quick']),
  npTarget: z.enum(['single', 'all']),
  atkByLevel: z.record(z.string(), z.number().int().nonnegative()),
  npMultipliers: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]),
  attackNpFunctionType: z.string(),
  traits: z.array(z.string()),
  imageKey: z.string().nullable(),
  skills: z.array(masterSkillSchema).default([]),
  passives: z.array(masterSkillSchema).default([]),
  npEffects: z
    .array(masterEffectSchema.extend({ timing: z.enum(['beforeDamage', 'afterDamage']) }))
    .default([]),
  npSpecialAttack: z
    .object({
      targetCondition: traitConditionSchema,
      multipliersByNpLevelAndOvercharge: z.tuple([
        fiveNumberTupleSchema,
        fiveNumberTupleSchema,
        fiveNumberTupleSchema,
        fiveNumberTupleSchema,
        fiveNumberTupleSchema,
      ]),
    })
    .nullable()
    .optional(),
  growth: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      materialId: z.string(),
      amount: z.number().int().positive(),
      qp: z.number().int().nonnegative(),
    }),
  ),
});
export type ServantMaster = z.infer<typeof servantMasterSchema>;

export function deriveNpSpecialMultipliers(
  servant: Pick<ServantMaster, 'npSpecialAttack'>,
  overcharge: number,
): [number, number, number, number, number] {
  return [0, 1, 2, 3, 4].map(
    (npLevelIndex) =>
      servant.npSpecialAttack?.multipliersByNpLevelAndOvercharge[npLevelIndex]?.[overcharge - 1] ??
      1,
  ) as [number, number, number, number, number];
}
export const craftEssenceMasterSchema = z.object({
  id: z.string(),
  name: z.string(),
  maxLevelByLimitBreak: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]),
  atkMin: z.number().int().nonnegative(),
  atkMax: z.number().int().nonnegative(),
  imageKey: z.string().nullable(),
  effects: z
    .array(
      masterEffectSchema.omit({ values: true }).extend({
        values: z.tuple([z.number(), z.number()]),
      }),
    )
    .default([]),
});
export type CraftEssenceMaster = z.infer<typeof craftEssenceMasterSchema>;
export const materialMasterSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  sortOrder: z.number().int(),
  imageKey: z.string().nullable(),
});
export type MaterialMaster = z.infer<typeof materialMasterSchema>;
export const masterSnapshotSchema = z.object({
  version: z.string(),
  servants: z.array(servantMasterSchema),
  craftEssences: z.array(craftEssenceMasterSchema),
  materials: z.array(materialMasterSchema),
});
export type MasterDataSnapshot = z.infer<typeof masterSnapshotSchema>;

export interface MasterValidationReport {
  valid: boolean;
  errors: string[];
  unknownAttackFunctions: string[];
}
const knownFunctions = new Set([
  'damageNp',
  'damageNpIndividual',
  'damageNpPierce',
  'damageNpIndividualSum',
  'damageNpStateIndividualFix',
  'damageNpHpratioLow',
  'damageNpBattlePointPhase',
  'damageNpRare',
  'damageNpAndOrCheckIndividuality',
]);
export function validateMasterSnapshot(value: unknown): MasterValidationReport {
  const parsed = masterSnapshotSchema.safeParse(value);
  if (!parsed.success)
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      unknownAttackFunctions: [],
    };
  const ids = new Set<string>();
  const errors: string[] = [];
  for (const servant of parsed.data.servants) {
    if (ids.has(servant.id)) errors.push(`duplicate servant:${servant.id}`);
    ids.add(servant.id);
    if (
      ['damageNpIndividual', 'damageNpStateIndividualFix'].includes(servant.attackNpFunctionType) &&
      !servant.npSpecialAttack
    )
      errors.push(`missing special NP condition:${servant.id}`);
  }
  const unknownAttackFunctions = [
    ...new Set(
      parsed.data.servants
        .filter((servant) => servant.hasAttackNp)
        .map((s) => s.attackNpFunctionType)
        .filter((type) => !knownFunctions.has(type)),
    ),
  ];
  return {
    valid: errors.length === 0 && unknownAttackFunctions.length === 0,
    errors,
    unknownAttackFunctions,
  };
}
export function deriveCraftEssenceAtk(
  master: CraftEssenceMaster,
  level: number,
  limitBreak: number,
): number {
  const maximum = master.maxLevelByLimitBreak[limitBreak];
  if (maximum === undefined || level < 1 || level > maximum)
    throw new RangeError('invalid craft essence level');
  if (maximum === 1) return master.atkMin;
  return Math.floor(
    master.atkMin +
      ((master.atkMax - master.atkMin) * (level - 1)) / (master.maxLevelByLimitBreak[4] - 1),
  );
}
