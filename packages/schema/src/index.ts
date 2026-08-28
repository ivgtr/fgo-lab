import { z } from 'zod';
import { activationFactKey, analyzeActivationFactSet } from './activationFactSet';
import { quantityFactValueSchema, worldFactQuantitySchema } from './quantityFacts';

export {
  activationChoiceGroupKey,
  activationFactKey,
  activationOperationTriggerKey,
  activationSourceKey,
  activationSourceQuantityKey,
  analyzeActivationFactSet,
  type ActivationFactSetAnalysis,
  type ActivationFactSetIssue,
  type ActivationQuantityRange,
  type AnalyzedActivationFactSet,
} from './activationFactSet';

export {
  isQuantityFactValueInDomain,
  QUANTITY_FACT_DOMAINS,
  quantityFactValueSchema,
  worldFactQuantitySchema,
  type QuantityFactName,
} from './quantityFacts';

export const SCHEMA_VERSION = 30 as const;
export const ENGINE_VERSION = '24.0.0' as const;
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
  enabled: z.boolean(),
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
  effectOccurrenceId: z.string().min(1).max(80),
});
export type SupportEffectRef = z.infer<typeof supportEffectRefSchema>;
export const supportEffectInclusionSchema = supportEffectRefSchema.extend({
  included: z.literal(false),
});
export type SupportEffectInclusion = z.infer<typeof supportEffectInclusionSchema>;

export const supportCompositionSchema = z.object({
  sources: z.array(supportSourceSchema).max(20),
  effectInclusions: z.array(supportEffectInclusionSchema).max(200),
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

export const canonicalTargetClassIdSchema = z.enum([
  'saber',
  'archer',
  'lancer',
  'rider',
  'caster',
  'assassin',
  'berserker',
  'shielder',
  'ruler',
  'alterEgo',
  'avenger',
  'moonCancer',
  'foreigner',
  'pretender',
  'beast',
  'beastEresh',
  'unBeastOlgaMarie',
]);
export type CanonicalTargetClassId = z.infer<typeof canonicalTargetClassIdSchema>;

export const canonicalTargetAttributeSchema = z.enum(['man', 'earth', 'sky', 'star', 'beast']);
export type CanonicalTargetAttribute = z.infer<typeof canonicalTargetAttributeSchema>;

export const canonicalTargetFamilyIdSchema = z.enum(['demonGodPillar', 'beast']);
export type CanonicalTargetFamilyId = z.infer<typeof canonicalTargetFamilyIdSchema>;

export const targetPredicateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('classIdentity'), classId: canonicalTargetClassIdSchema }),
  z.object({
    kind: z.literal('attributeIdentity'),
    attribute: canonicalTargetAttributeSchema,
  }),
  z.object({ kind: z.literal('familyMembership'), familyId: canonicalTargetFamilyIdSchema }),
]);
export type TargetPredicate = z.infer<typeof targetPredicateSchema>;

export const targetClassContextSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('relative'),
    relation: z.enum(['advantage2', 'advantage15', 'neutral', 'disadvantage']),
  }),
  z.object({ kind: z.literal('concrete'), classId: canonicalTargetClassIdSchema }),
]);
export type TargetClassContext = z.infer<typeof targetClassContextSchema>;

export const targetAttributeContextSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('relative'),
    relation: z.enum(['advantage', 'neutral', 'disadvantage']),
  }),
  z.object({ kind: z.literal('concrete'), attribute: canonicalTargetAttributeSchema }),
]);
export type TargetAttributeContext = z.infer<typeof targetAttributeContextSchema>;

export const targetContextSchema = z
  .object({
    class: targetClassContextSchema,
    attribute: targetAttributeContextSchema,
    families: z.array(z.object({ familyId: canonicalTargetFamilyIdSchema }).strict()).max(20),
  })
  .strict();
export type TargetContext = z.infer<typeof targetContextSchema>;

export const operationOriginSchema = z.enum([
  'passive',
  'attacker',
  'craftEssence',
  'support',
  'mysticCode',
  'np',
]);
export type OperationOrigin = z.infer<typeof operationOriginSchema>;

export const activationSourceRefSchema = z
  .object({
    origin: operationOriginSchema,
    sourceInstanceId: z.string().min(1).max(300),
    skillId: z.string().min(1).max(300).nullable(),
  })
  .strict();
export type ActivationSourceRef = z.infer<typeof activationSourceRefSchema>;

export const choiceSelectionSchema = z
  .object({
    kind: z.literal('choice'),
    source: activationSourceRefSchema,
    family: z.string().min(1).max(80),
    candidate: z.string().min(1).max(80),
  })
  .strict();
export type ChoiceSelection = z.infer<typeof choiceSelectionSchema>;

export const activationFactSchema = z.discriminatedUnion('kind', [
  choiceSelectionSchema,
  z
    .object({
      kind: z.literal('operationTrigger'),
      source: activationSourceRefSchema,
      position: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('sourceQuantity'),
      source: activationSourceRefSchema,
      quantity: z.literal('battlePointRate'),
      subjectId: z.string().min(1).max(80),
      comparison: z.enum(['atMost', 'atLeast']),
      value: z.number().int(),
    })
    .strict(),
]);
export type ActivationFact = z.infer<typeof activationFactSchema>;

const activationFactsSchema = z
  .array(activationFactSchema)
  .max(300)
  .superRefine((facts, context) => {
    const analysis = analyzeActivationFactSet(facts);
    if (analysis.status === 'valid') return;
    for (const issue of analysis.issues) {
      let message: string;
      if (issue.kind === 'nonCanonicalOrder') message = 'non_canonical_activation_fact_order';
      else if (issue.kind === 'duplicateFact')
        message = `duplicate_activation_fact:${issue.factKey}`;
      else if (issue.kind === 'conflictingChoiceSelection')
        message = `conflicting_choice_selection:${issue.groupKey}`;
      else message = `conflicting_source_quantity_range:${issue.ownerKey}`;
      context.addIssue({
        code: 'custom',
        message,
        path: [issue.index],
      });
    }
  });

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
  ignoreDamageCut: z.boolean().default(false),
  fieldTraits: z.array(z.string().min(1).max(80)).max(100).default([]),
  attackerStateTraits: z.array(z.string().min(1).max(80)).max(100),
  attackerHpPermille: quantityFactValueSchema('attackerHpPermille').nullable(),
  targetRarity: quantityFactValueSchema('targetRarity').nullable(),
  targetStateTraits: z.array(z.string().min(1).max(80)).max(100),
  battlePointPhase: quantityFactValueSchema('battlePointPhase').nullable(),
  target: z.object({
    classId: canonicalTargetClassIdSchema.nullable(),
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
    ignoreDamageCut: z.boolean(),
    ignoreDefense: z.boolean(),
  })
  .strict();
export type DamageKernelInput = z.infer<typeof damageKernelInputSchema>;

export const attackerSkillSelectionSchema = z
  .object({
    skillId: z.string().min(1).max(80),
    skillLevel: z.number().int().min(1).max(10),
  })
  .strict();
export type AttackerSkillSelection = z.infer<typeof attackerSkillSelectionSchema>;

const scenarioBaseSchema = z
  .object({
    attacker: z
      .object({
        servantId: z.string().min(1).max(80),
        source: z.enum(['owned', 'master']),
        level: z.number().int().min(1).max(120),
        npLevel: z.number().int().min(1).max(5),
        fouAtk: z.number().int().min(0).max(3000),
      })
      .strict(),
    overcharge: z.number().int().min(1).max(5),
    targetContext: targetContextSchema,
    attackerHpPermille: quantityFactValueSchema('attackerHpPermille').nullable(),
    battleState: z.object({
      battlePointPhase: quantityFactValueSchema('battlePointPhase').nullable(),
    }),
    canonicalInputValues: z.record(
      z.string().min(1).max(300),
      z.object({ kind: z.literal('integer'), value: z.number().int() }).strict(),
    ),
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
    mysticCode: z
      .object({
        mysticCodeId: z.string().min(1).max(80),
        skills: z.array(supportSkillSchema).min(1).max(3),
      })
      .nullable(),
    support: z
      .object({
        sourceTemplateId: z.uuid().nullable(),
        composition: supportCompositionSchema,
      })
      .nullable(),
    effectDecisions: z.array(
      z.object({
        decisionKey: z.string().min(1).max(300),
        operationEnabled: z.boolean(),
        conditionSatisfaction: z.enum(['evaluate', 'assumeSatisfied']),
      }),
    ),
    activationFacts: activationFactsSchema,
    worldFactAssertions: z.array(
      z.object({
        decisionKey: z.string().min(1).max(300),
        fact: z.discriminatedUnion('kind', [
          z.object({
            kind: z.literal('trait'),
            scope: z.enum(['attacker', 'attackerState', 'target', 'targetState', 'field']),
            trait: z.string().min(1).max(80),
            present: z.boolean(),
          }),
          worldFactQuantitySchema,
        ]),
      }),
    ),
    explicitOverrides: z.object({
      attackerAtk: z.number().int().nonnegative().max(100000).optional(),
      fouAtk: z.number().int().nonnegative().max(3000).optional(),
      craftEssenceAtk: z.number().int().nonnegative().max(10000).optional(),
      classAttackRate: z.number().min(0).max(5).optional(),
    }),
  })
  .strict();

const manualScenarioSchema = z
  .object({
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
      projectionKey: z.string(),
      outcome: z.enum(['applied', 'notApplied', 'notRelevant', 'impossible', 'unsupported']),
      explanationCode: z.enum([
        'applied',
        'disabled',
        'conditionNotMet',
        'cardMismatch',
        'targetMismatch',
        'stateMutationOnly',
        'unresolved',
      ]),
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
const inputRequiredResultSchema = resultBaseSchema.extend({
  status: z.literal('inputRequired'),
  rows: z.tuple([]),
  requiredInputs: z.array(
    z.object({
      key: z.string().min(1),
      owner: z.enum(['attacker', 'target', 'field', 'party', 'source']),
      label: z.string().min(1),
      description: z.string().min(1),
      minimum: z.number().int(),
      maximum: z.number().int(),
      step: z.number().int().positive(),
      effectOccurrenceIds: z.array(z.string().min(1)).min(1),
    }),
  ),
});
export const calculationResultSchema = z.discriminatedUnion('status', [
  calculatedResultSchema,
  inputRequiredResultSchema,
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
export type CalculationDraft = z.infer<typeof calculationDraftSchema>;
export const calculationHistoryEntrySchema = calculationDraftSchema.extend({
  historyId: z.uuid(),
  finalizedAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime(),
});
export type CalculationHistoryEntry = z.infer<typeof calculationHistoryEntrySchema>;

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
