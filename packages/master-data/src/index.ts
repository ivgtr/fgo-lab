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
  schemaVersion: z.literal(4),
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
  buffRateTargets: z.array(z.string()).optional(),
  cardTypes: z.array(z.enum(['buster', 'arts', 'quick'])).max(3),
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

const traitReferenceSchema = z.object({ id: z.number().int(), name: z.string().min(1) });

const npDamageParameterSchema = z.object({
  ratePermille: z.number().int(),
  valuePermille: z.number().int(),
  secondaryValuePermille: z.number().int().optional(),
  targetId: z.number().int().optional(),
  correctionPermille: z.number().int().optional(),
  targetTrait: traitReferenceSchema.optional(),
  targetIds: z.array(z.number().int()).optional(),
  targetTraits: z.array(traitReferenceSchema).optional(),
  maximumTargetCount: z.number().int().nonnegative().optional(),
  targetRarities: z.array(z.number().int().nonnegative()).optional(),
  andCheckTraitIds: z.array(z.number().int()).optional(),
  andCheckTraits: z.array(traitReferenceSchema).optional(),
  additionalTraitId: z.number().int().optional(),
  additionalTraitIds: z.array(z.number().int()).optional(),
  includeIgnoreIndividuality: z.number().int().optional(),
  ignoreUnreleaseableTraits: z.number().int().optional(),
  checkDead: z.number().int().optional(),
  hideMiss: z.number().int().optional(),
  hideNoEffect: z.number().int().optional(),
});
const fiveNpDamageParametersSchema = z.tuple([
  npDamageParameterSchema,
  npDamageParameterSchema,
  npDamageParameterSchema,
  npDamageParameterSchema,
  npDamageParameterSchema,
]);
const npDamageParameterMatrixSchema = z.tuple([
  fiveNpDamageParametersSchema,
  fiveNpDamageParametersSchema,
  fiveNpDamageParametersSchema,
  fiveNpDamageParametersSchema,
  fiveNpDamageParametersSchema,
]);
const npDamageBaseSchema = z.object({
  functionId: z.string().min(1),
  target: z.enum(['single', 'all']),
  parametersByOvercharge: npDamageParameterMatrixSchema,
  rawPath: z.string().min(1),
});
export const npDamageSpecSchema = z
  .discriminatedUnion('kind', [
    npDamageBaseSchema.extend({
      kind: z.literal('standard'),
      rawFunctionType: z.literal('damageNp'),
    }),
    npDamageBaseSchema.extend({
      kind: z.literal('defensePiercing'),
      rawFunctionType: z.literal('damageNpPierce'),
    }),
    npDamageBaseSchema.extend({
      kind: z.literal('trait'),
      rawFunctionType: z.literal('damageNpIndividual'),
    }),
    npDamageBaseSchema.extend({
      kind: z.literal('traitCount'),
      rawFunctionType: z.literal('damageNpIndividualSum'),
    }),
    npDamageBaseSchema.extend({
      kind: z.literal('stateTrait'),
      rawFunctionType: z.literal('damageNpStateIndividualFix'),
    }),
    npDamageBaseSchema.extend({
      kind: z.literal('hpRatioLow'),
      rawFunctionType: z.literal('damageNpHpratioLow'),
    }),
    npDamageBaseSchema.extend({
      kind: z.literal('battlePointPhase'),
      rawFunctionType: z.literal('damageNpBattlePointPhase'),
    }),
    npDamageBaseSchema.extend({
      kind: z.literal('targetRarity'),
      rawFunctionType: z.literal('damageNpRare'),
    }),
    npDamageBaseSchema.extend({
      kind: z.literal('traitExpression'),
      rawFunctionType: z.literal('damageNpAndOrCheckIndividuality'),
    }),
  ])
  .superRefine((spec, context) => {
    const requiredFieldsByKind = {
      standard: [],
      defensePiercing: [],
      trait: ['targetId', 'targetTrait', 'correctionPermille'],
      traitCount: [
        'targetId',
        'targetIds',
        'targetTraits',
        'secondaryValuePermille',
        'correctionPermille',
        'maximumTargetCount',
      ],
      stateTrait: ['targetId', 'targetTrait', 'correctionPermille'],
      hpRatioLow: ['targetId'],
      battlePointPhase: ['targetId', 'secondaryValuePermille', 'correctionPermille'],
      targetRarity: ['targetId', 'targetRarities', 'correctionPermille'],
      traitExpression: ['targetId', 'andCheckTraitIds', 'andCheckTraits', 'correctionPermille'],
    } as const;
    for (const [overchargeIndex, row] of spec.parametersByOvercharge.entries())
      for (const [npLevelIndex, parameter] of row.entries())
        for (const field of requiredFieldsByKind[spec.kind])
          if (parameter[field] === undefined)
            context.addIssue({
              code: 'custom',
              message: `missing ${field} for ${spec.kind}`,
              path: ['parametersByOvercharge', overchargeIndex, npLevelIndex, field],
            });
  });
export type NpDamageSpec = z.infer<typeof npDamageSpecSchema>;

export const noblePhantasmMasterSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  priority: z.number().int(),
  card: z.enum(['buster', 'arts', 'quick']),
  damage: z.array(npDamageSpecSchema).min(1),
  effects: z.array(masterEffectSchema.extend({ timing: z.enum(['beforeDamage', 'afterDamage']) })),
});
export type NoblePhantasmMaster = z.infer<typeof noblePhantasmMasterSchema>;

export const servantMasterSchema = z.object({
  id: z.string(),
  name: z.string(),
  classId: z.string(),
  attribute: z.enum(['human', 'earth', 'sky', 'star', 'beast', 'unknown']).default('unknown'),
  rarity: z.number().int().min(0).max(5),
  atkByLevel: z.record(z.string(), z.number().int().nonnegative()),
  noblePhantasms: z.array(noblePhantasmMasterSchema),
  traits: z.array(z.string()),
  imageKey: z.string().nullable(),
  skills: z.array(masterSkillSchema).default([]),
  passives: z.array(masterSkillSchema).default([]),
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

export function getPrimaryNoblePhantasm(
  servant: Pick<ServantMaster, 'noblePhantasms'>,
): NoblePhantasmMaster | undefined {
  return servant.noblePhantasms.reduce<NoblePhantasmMaster | undefined>(
    (selected, candidate) =>
      !selected || candidate.priority > selected.priority ? candidate : selected,
    undefined,
  );
}

export function getPrimaryNpDamage(
  servant: Pick<ServantMaster, 'noblePhantasms'>,
): NpDamageSpec | undefined {
  return getPrimaryNoblePhantasm(servant)?.damage[0];
}

export function getPrimaryNpPresentation(servant: Pick<ServantMaster, 'noblePhantasms'>): {
  card: NoblePhantasmMaster['card'];
  target: NpDamageSpec['target'];
} | null {
  const noblePhantasm = getPrimaryNoblePhantasm(servant);
  const damage = noblePhantasm?.damage[0];
  return noblePhantasm && damage ? { card: noblePhantasm.card, target: damage.target } : null;
}

export function deriveNpMultipliers(
  damage: NpDamageSpec,
  overcharge: number,
): [number, number, number, number, number] {
  const parameters = damage.parametersByOvercharge[overcharge - 1];
  if (!parameters) throw new RangeError('invalid overcharge');
  return parameters.map((value) => value.valuePermille / 10) as [
    number,
    number,
    number,
    number,
    number,
  ];
}

export function deriveNpSpecialMultipliers(
  damage: NpDamageSpec,
  overcharge: number,
): [number, number, number, number, number] {
  const parameters = damage.parametersByOvercharge[overcharge - 1];
  if (!parameters) throw new RangeError('invalid overcharge');
  return parameters.map((value) => (value.correctionPermille ?? 1_000) / 1_000) as [
    number,
    number,
    number,
    number,
    number,
  ];
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
  normalization: z.object({
    attackFunctions: z.object({
      sourceCount: z.number().int().nonnegative(),
      includedCount: z.number().int().nonnegative(),
      excluded: z.array(
        z.object({
          servantId: z.string(),
          noblePhantasmId: z.string(),
          functionId: z.string(),
          rawFunctionType: z.string(),
          reason: z.enum([
            'missingCollectionNo',
            'servantTypeExcluded',
            'servantIdentityIncomplete',
          ]),
        }),
      ),
    }),
  }),
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
  }
  const includedAttackFunctions = parsed.data.servants.reduce(
    (count, servant) =>
      count + servant.noblePhantasms.reduce((npCount, np) => npCount + np.damage.length, 0),
    0,
  );
  const attackCoverage = parsed.data.normalization.attackFunctions;
  if (attackCoverage.includedCount !== includedAttackFunctions)
    errors.push(
      `attack function included count:${String(attackCoverage.includedCount)}:${String(includedAttackFunctions)}`,
    );
  if (attackCoverage.sourceCount !== attackCoverage.includedCount + attackCoverage.excluded.length)
    errors.push(
      `attack function source count:${String(attackCoverage.sourceCount)}:${String(attackCoverage.includedCount + attackCoverage.excluded.length)}`,
    );
  const unknownAttackFunctions: string[] = [];
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
