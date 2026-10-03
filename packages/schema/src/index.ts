import {
  initialOverchargeSchema,
  rankingSelectionSchema,
  resolvedRankingBasisSchema,
  rankingSelectionV41Schema,
  resolvedRankingBasisV41Schema,
} from './rankingSelection';
export * from './rankingSelection';
import { z } from 'zod';
import { analyzeActivationFactSet } from './activationFactSet';
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

export const SCHEMA_VERSION = 42 as const;
export const ENGINE_VERSION = '49.0.0' as const;
export const APP_VERSION = '0.1.0' as const;

export const versionContextSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  masterDataVersion: z.string().min(1).max(100),
  engineVersion: z.string().min(1).max(100),
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

export const damageResolutionInputSchema = z
  .object({
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
    stackStateCounts: z
      .object({
        attackerState: z.record(z.string().min(1).max(80), z.number().int().nonnegative()),
        targetState: z.record(z.string().min(1).max(80), z.number().int().nonnegative()),
        field: z.record(z.string().min(1).max(80), z.number().int().nonnegative()),
      })
      .strict()
      .optional(),
    attackerHpPermille: quantityFactValueSchema('attackerHpPermille').nullable(),
    targetRarity: quantityFactValueSchema('targetRarity').nullable(),
    targetStateTraits: z.array(z.string().min(1).max(80)).max(100),
    battlePointPhase: quantityFactValueSchema('battlePointPhase').nullable(),
    target: z.object({
      classId: canonicalTargetClassIdSchema.nullable(),
      attribute: z.enum(['man', 'earth', 'sky', 'star', 'beast', 'unknown']),
      traits: z.array(z.string().min(1).max(80)).max(100),
    }),
  })
  .superRefine((input, context) => {
    if (!input.stackStateCounts) return;
    for (const [scope, traits] of [
      ['attackerState', input.attackerStateTraits],
      ['targetState', input.targetStateTraits],
      ['field', input.fieldTraits],
    ] as const) {
      for (const [trait, count] of Object.entries(input.stackStateCounts[scope]))
        if (traits.filter((value) => value === trait).length !== Number(count > 0))
          context.addIssue({
            code: 'custom',
            message: 'contradictory_stack_state_presence',
            path: ['stackStateCounts', scope, trait],
          });
    }
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

const skillSlotSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const preparationChoiceSchema = z
  .object({
    groupKey: z.string().min(1).max(80),
    candidateKey: z.string().min(1).max(80),
  })
  .strict();
export const preNoblePhantasmCommandSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('useSkillSlot'),
      slot: skillSlotSchema,
      skillLevel: z.number().int().min(1).max(10),
      choice: preparationChoiceSchema.nullable(),
    })
    .strict(),
  z.object({ kind: z.literal('useTransformNoblePhantasm') }).strict(),
  z.object({ kind: z.literal('executeAttackNoblePhantasm') }).strict(),
]);
export type PreNoblePhantasmCommand = z.infer<typeof preNoblePhantasmCommandSchema>;
export type AttackerSkillUse = Extract<PreNoblePhantasmCommand, { kind: 'useSkillSlot' }>;

const preNoblePhantasmPlanSchema = z
  .array(preNoblePhantasmCommandSchema)
  .min(1)
  .max(5)
  .superRefine((commands, context) => {
    const attackIndexes = commands.flatMap((command, index) =>
      command.kind === 'executeAttackNoblePhantasm' ? [index] : [],
    );
    if (attackIndexes.length !== 1 || attackIndexes[0] !== commands.length - 1)
      context.addIssue({
        code: 'custom',
        message: 'attack noble phantasm must terminate the plan',
      });
    if (commands.filter(({ kind }) => kind === 'useTransformNoblePhantasm').length > 1)
      context.addIssue({ code: 'custom', message: 'transform noble phantasm may be used once' });
    const slots = commands.flatMap((command) =>
      command.kind === 'useSkillSlot' ? [command.slot] : [],
    );
    if (new Set(slots).size !== slots.length)
      context.addIssue({ code: 'custom', message: 'skill slot may be used once' });
  });

const scenarioBaseSchema = z
  .object({
    attacker: z
      .object({
        servantId: z.string().min(1).max(80),
        initialActorFormId: z.object({
          actorId: z.string().min(1).max(80),
          limitCount: z.number().int().nonnegative(),
        }),
        source: z.enum(['owned', 'master']),
        level: z.number().int().min(1).max(120),
        npLevel: z.number().int().min(1).max(5),
        fouAtk: z.number().int().min(0).max(3000),
      })
      .strict(),
    initialOvercharge: initialOverchargeSchema,
    targetContext: targetContextSchema,
    attackerHpPermille: quantityFactValueSchema('attackerHpPermille').nullable(),
    battleState: z.object({
      battlePointPhase: quantityFactValueSchema('battlePointPhase').nullable(),
    }),
    canonicalInputValues: z.record(
      z.string().min(1).max(300),
      z
        .object({
          kind: z.literal('integer'),
          value: z.number().int(),
          origin: z.enum(['baseline', 'maximum', 'witness', 'explicit']).optional(),
        })
        .strict(),
    ),
  })
  .strict();

const resolvedScenarioV40Schema = scenarioBaseSchema
  .extend({
    mode: z.literal('resolved'),
    craftEssence: z
      .object({
        craftEssenceId: z.string().min(1).max(80),
        level: z.number().int().min(1).max(100),
        limitBreak: z.number().int().min(0).max(4),
      })
      .nullable(),
    preNoblePhantasmPlan: preNoblePhantasmPlanSchema,
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

export const resolvedScenarioSchema = resolvedScenarioV40Schema
  .extend({
    enemyDefenseBuff: z.number().min(-5).max(5),
    initialBattlePointPoints: z
      .record(z.string().min(1).max(80), z.number().int().min(-1))
      .optional(),
  })
  .strict();

const legacyResolvedScenarioSchema = resolvedScenarioV40Schema
  .omit({ initialOvercharge: true })
  .extend({ overcharge: z.number().int().min(1).max(5) })
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

export const calculationVersionContextSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    masterDataVersion: z.string().min(1).max(100),
    engineVersion: z.string().min(1).max(100),
  })
  .strict();
export type CalculationVersionContext = z.infer<typeof calculationVersionContextSchema>;
const calculationVersionContextV40Schema = calculationVersionContextSchema.omit({
  schemaVersion: true,
});

const calculatorExecutionIntentSchema = z
  .object({
    kind: z.literal('calculator'),
    initialNpGauge: z.union([z.literal(10000), z.literal(20000), z.literal(30000)]),
  })
  .strict();
const rankingExecutionIntentV35Schema = z
  .object({
    kind: z.literal('ranking'),
    initialNpGauge: z.number().int().nonnegative().max(100_000),
    policy: z
      .object({
        selfBuffs: z.enum(['included', 'excluded']),
        conditionalEffects: z.enum(['baseline', 'satisfied']),
      })
      .strict(),
  })
  .strict();
const rankingExecutionIntentSchema = z
  .object({
    kind: z.literal('ranking'),
    initialNpGauge: z.number().int().nonnegative().max(100_000),
    policy: rankingSelectionSchema,
    basis: resolvedRankingBasisSchema,
  })
  .strict();
const rankingExecutionIntentV41Schema = rankingExecutionIntentSchema.extend({
  policy: rankingSelectionV41Schema,
  basis: resolvedRankingBasisV41Schema,
}).strict();
const legacyRankingExecutionIntentV37Schema = rankingExecutionIntentV41Schema
  .extend({
    policy: z.object(rankingSelectionV41Schema.shape).omit({ initialOvercharge: true }).strict(),
    basis: resolvedRankingBasisV41Schema.omit({ initialOvercharge: true }),
  })
  .strict();
const portableCalculationRequestV35Schema = z.union([
  z
    .object({
      versionContext: calculationVersionContextV40Schema,
      scenario: legacyResolvedScenarioSchema,
      executionIntent: z.union([calculatorExecutionIntentSchema, rankingExecutionIntentV35Schema]),
    })
    .strict(),
  z
    .object({
      versionContext: calculationVersionContextV40Schema,
      scenario: manualScenarioSchema,
      executionIntent: z.object({ kind: z.literal('manual') }).strict(),
    })
    .strict(),
]);
const legacyPortableCalculationRequestSchema = z.union([
  portableCalculationRequestV35Schema,
  z
    .object({
      versionContext: calculationVersionContextV40Schema,
      scenario: legacyResolvedScenarioSchema,
      executionIntent: legacyRankingExecutionIntentV37Schema,
    })
    .strict(),
]);
const resolvedPortableCalculationRequestSchema = z
  .object({
    versionContext: calculationVersionContextSchema,
    scenario: resolvedScenarioSchema,
    executionIntent: z.union([calculatorExecutionIntentSchema, rankingExecutionIntentSchema]),
  })
  .strict()
  .refine(
    ({ scenario, executionIntent: intent }) => {
      if (intent.kind !== 'ranking') return true;
      if (intent.initialNpGauge !== scenario.initialOvercharge * 10000) return false;
      const { basis, policy } = intent;
      return (
        basis.initialOvercharge === scenario.initialOvercharge &&
        policy.initialOvercharge === scenario.initialOvercharge &&
        basis.servantId === scenario.attacker.servantId &&
        basis.level === scenario.attacker.level &&
        basis.npLevel === scenario.attacker.npLevel &&
        basis.growthBasis === policy.growthBasis &&
        basis.fouAtk === scenario.attacker.fouAtk &&
        basis.levelSource === policy.levelBasis &&
        basis.npSource === policy.npLevelBasis.kind &&
        (policy.npLevelBasis.kind !== 'specified' ||
          basis.npLevel === policy.npLevelBasis.npLevel) &&
        (policy.levelBasis !== 'uniformLevel90' || basis.level === 90)
      );
    },
    { message: 'ranking_basis_scenario_mismatch' },
  );
const manualPortableCalculationRequestSchema = z
  .object({
    versionContext: calculationVersionContextSchema,
    scenario: manualScenarioSchema,
    executionIntent: z.object({ kind: z.literal('manual') }).strict(),
  })
  .strict();
export const portableCalculationRequestSchema = z.union([
  resolvedPortableCalculationRequestSchema,
  manualPortableCalculationRequestSchema,
]);
export type PortableCalculationRequest = z.infer<typeof portableCalculationRequestSchema>;

export const portableCalculationRequestV40Schema = z.union([
  z
    .object({
      versionContext: calculationVersionContextV40Schema,
      scenario: resolvedScenarioV40Schema,
      executionIntent: z.union([calculatorExecutionIntentSchema, rankingExecutionIntentV41Schema]),
    })
    .strict(),
  manualPortableCalculationRequestSchema.extend({
    versionContext: calculationVersionContextV40Schema,
  }),
]);
export type PortableCalculationRequestV40 = z.infer<typeof portableCalculationRequestV40Schema>;
export const portableCalculationRequestV41Schema = z.union([
  z.object({
    versionContext: calculationVersionContextSchema.extend({schemaVersion:z.literal(41)}),
    scenario: resolvedScenarioSchema,
    executionIntent:z.union([calculatorExecutionIntentSchema,rankingExecutionIntentV41Schema]),
  }).strict().refine(({scenario,executionIntent:intent})=>intent.kind !== 'ranking' || (
    intent.initialNpGauge === scenario.initialOvercharge * 10000 &&
    intent.basis.initialOvercharge === scenario.initialOvercharge &&
    intent.policy.initialOvercharge === scenario.initialOvercharge &&
    intent.basis.servantId === scenario.attacker.servantId &&
    intent.basis.level === scenario.attacker.level && intent.basis.npLevel === scenario.attacker.npLevel &&
    intent.basis.levelSource === intent.policy.levelBasis && intent.basis.npSource === intent.policy.npLevelBasis.kind &&
    (intent.policy.npLevelBasis.kind !== 'specified' || intent.basis.npLevel === intent.policy.npLevelBasis.npLevel) &&
    (intent.policy.levelBasis !== 'uniformLevel90' || intent.basis.level === 90)
  ),{message:'ranking_basis_scenario_mismatch'}),
  manualPortableCalculationRequestSchema.extend({
    versionContext:calculationVersionContextSchema.extend({schemaVersion:z.literal(41)}),
  }),
]);
export type PortableCalculationRequestV41 = z.infer<typeof portableCalculationRequestV41Schema>;


const portableCalculationRequestV33Schema = z.union([
  z
    .object({
      versionContext: calculationVersionContextV40Schema,
      scenario: legacyResolvedScenarioSchema,
      executionIntent: z.union([
        z
          .object({
            kind: z.literal('resolved'),
            origin: z.literal('calculator'),
            initialNpGauge: z.union([z.literal(10000), z.literal(20000), z.literal(30000)]),
            contribution: z.literal('standard'),
          })
          .strict(),
        z
          .object({
            kind: z.literal('resolved'),
            origin: z.literal('ranking'),
            initialNpGauge: z.number().int().nonnegative().max(100_000),
            contribution: z.enum(['standard', 'excludeVoluntarySkillModifiers']),
          })
          .strict(),
      ]),
    })
    .strict(),
  z
    .object({
      versionContext: calculationVersionContextV40Schema,
      scenario: manualScenarioSchema,
      executionIntent: z.object({ kind: z.literal('manual') }).strict(),
    })
    .strict(),
]);
type PortableCalculationRequestV33 = z.infer<typeof portableCalculationRequestV33Schema>;

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
  engineVersion: z.string().min(1).max(100),
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
export const calculationUnavailabilityReasonSchema = z.enum([
  'insufficientNpGauge',
  'npCapacityExceeded',
  'attackerDead',
  'selectedAttackProfileHasNoAttack',
  'selectedAttackProfileChanged',
]);
export type CalculationUnavailabilityReason = z.infer<typeof calculationUnavailabilityReasonSchema>;
const unavailableResultSchema = resultBaseSchema.extend({
  status: z.literal('unavailable'),
  rows: z.tuple([]),
  reason: calculationUnavailabilityReasonSchema,
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
const calculationResultBeforeV39Schema = z.discriminatedUnion('status', [
  calculatedResultSchema,
  inputRequiredResultSchema,
  unsupportedResultSchema,
]);
export const calculationResultSchema = z.discriminatedUnion('status', [
  calculatedResultSchema,
  unavailableResultSchema,
  inputRequiredResultSchema,
  unsupportedResultSchema,
]);
export type CalculationResult = z.infer<typeof calculationResultSchema>;
const resultVersionsV40Schema = versionContextSchema.extend({ schemaVersion: z.literal(40) });
export const calculationResultV40Schema = z.discriminatedUnion('status', [
  calculatedResultSchema.extend({ versions: resultVersionsV40Schema }),
  unavailableResultSchema.extend({ versions: resultVersionsV40Schema }),
  inputRequiredResultSchema.extend({ versions: resultVersionsV40Schema }),
  unsupportedResultSchema.extend({ versions: resultVersionsV40Schema }),
]);
export type CalculationResultV40 = z.infer<typeof calculationResultV40Schema>;
export const calculationResultV41Schema = z.discriminatedUnion('status', [
  calculatedResultSchema.extend({versions:versionContextSchema.extend({schemaVersion:z.literal(41)})}),
  unavailableResultSchema.extend({versions:versionContextSchema.extend({schemaVersion:z.literal(41)})}),
  inputRequiredResultSchema.extend({versions:versionContextSchema.extend({schemaVersion:z.literal(41)})}),
  unsupportedResultSchema.extend({versions:versionContextSchema.extend({schemaVersion:z.literal(41)})}),
]);
export type CalculationResultV41 = z.infer<typeof calculationResultV41Schema>;


const calculationSnapshotShape = {
  profileId: z.uuid(),
  calculationSessionId: z.uuid(),
  request: portableCalculationRequestSchema,
  result: calculationResultSchema,
  requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  updatedAt: z.iso.datetime(),
};
function requireMatchingCalculationVersions(
  value: {
    request: {
      versionContext: { schemaVersion?: number; masterDataVersion: string; engineVersion: string };
    };
    result: { versions: {schemaVersion:number; masterDataVersion:string; engineVersion:string} };
  },
  context: z.core.$RefinementCtx,
) {
  if (
    value.request.versionContext.masterDataVersion !== value.result.versions.masterDataVersion ||
    value.request.versionContext.engineVersion !== value.result.versions.engineVersion ||
    (value.request.versionContext.schemaVersion !== undefined &&
      value.request.versionContext.schemaVersion !== value.result.versions.schemaVersion)
  )
    context.addIssue({
      code: 'custom',
      path: ['result', 'versions'],
      message: 'request_result_version_mismatch',
    });
}
export const calculationDraftSchema = z
  .object(calculationSnapshotShape)
  .superRefine(requireMatchingCalculationVersions);
export type CalculationDraft = z.infer<typeof calculationDraftSchema>;
export const calculationHistoryEntrySchema = z
  .object({
    ...calculationSnapshotShape,
    historyId: z.uuid(),
    finalizedAt: z.iso.datetime(),
    lastUsedAt: z.iso.datetime(),
  })
  .superRefine(requireMatchingCalculationVersions);
export type CurrentCalculationHistoryEntry = z.infer<typeof calculationHistoryEntrySchema>;
const historicalCalculationHistoryEntryV33Schema = z.object({
  disposition: z.literal('historicalOnly'),
  sourceSchemaVersion: z.literal(33),
  profileId: z.uuid(),
  calculationSessionId: z.uuid(),
  scenario: legacyResolvedScenarioSchema,
  legacyRankingIntent: z.object({
    initialNpGauge: z.number().int().nonnegative().max(100_000),
    contribution: z.enum(['standard', 'excludeVoluntarySkillModifiers']),
  }),
  result: z.union([calculationResultBeforeV39Schema, calculationResultV40Schema]),
  legacyResultSchemaVersion: z.literal(33),
  requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  updatedAt: z.iso.datetime(),
  historyId: z.uuid(),
  finalizedAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime(),
});
const historicalCalculationV40Shape = {
  disposition: z.literal('historicalOnly'),
  sourceSchemaVersion: z.literal(40),
  profileId: z.uuid(),
  calculationSessionId: z.uuid(),
  scenario: z.union([resolvedScenarioV40Schema, manualScenarioSchema]),
  result: calculationResultV40Schema,
  requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  updatedAt: z.iso.datetime(),
  legacySnapshot: z.unknown(),
};
export const historicalCalculationDraftV40Schema = z.object(historicalCalculationV40Shape);
export type HistoricalCalculationDraftV40 = z.infer<typeof historicalCalculationDraftV40Schema>;
const historicalCalculationDraftV41Schema = historicalCalculationDraftV40Schema.extend({
  sourceSchemaVersion:z.literal(41),scenario:calculationScenarioSchema,result:calculationResultV41Schema,
});
export const historicalCalculationDraftSchema = z.union([historicalCalculationDraftV40Schema,historicalCalculationDraftV41Schema]);
export type HistoricalCalculationDraft = z.infer<typeof historicalCalculationDraftSchema>;
const historicalCalculationHistoryEntryV41Schema = historicalCalculationDraftV41Schema.extend({
  historyId:z.uuid(),finalizedAt:z.iso.datetime(),lastUsedAt:z.iso.datetime(),
});

const historicalCalculationHistoryEntryV40Schema = historicalCalculationDraftV40Schema.extend({
  historyId: z.uuid(),
  finalizedAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime(),
});
export const historicalCalculationHistoryEntrySchema = z.union([
  historicalCalculationHistoryEntryV33Schema,
  ...([34, 35, 36, 37] as const).map((version) =>
    historicalCalculationHistoryEntryV33Schema.extend({
      sourceSchemaVersion: z.literal(version),
      legacyResultSchemaVersion: z.literal(version),
      legacyRankingIntent: z.union([
        rankingExecutionIntentV35Schema,
        legacyRankingExecutionIntentV37Schema,
        calculatorExecutionIntentSchema,
      ]),
    }),
  ),
  historicalCalculationHistoryEntryV33Schema.extend({
    sourceSchemaVersion: z.literal(38),
    legacyResultSchemaVersion: z.literal(38),
    scenario: resolvedScenarioV40Schema,
    legacyRankingIntent: z.union([rankingExecutionIntentV41Schema, calculatorExecutionIntentSchema]),
  }),
  historicalCalculationHistoryEntryV40Schema,
  historicalCalculationHistoryEntryV41Schema,
]);
export const storedCalculationHistoryEntrySchema = z.union([
  calculationHistoryEntrySchema,
  historicalCalculationHistoryEntrySchema,
]);
export type CalculationHistoryEntry = z.infer<typeof storedCalculationHistoryEntrySchema>;

function servantIdentityRecordSchema<Value extends z.ZodType<{ servantId: string }>>(
  valueSchema: Value,
) {
  const recordSchema = z.record(z.string(), valueSchema);
  return z.unknown().transform((input, context) => {
    const parsed = recordSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) context.addIssue({ ...issue });
      return z.NEVER;
    }
    // Record parsing can discard own keys. Check the original population before publishing it.
    for (const recordKey of Object.keys(input as object)) {
      if (!Object.hasOwn(parsed.data, recordKey))
        context.addIssue({
          code: 'custom',
          path: [recordKey],
          message: 'servant_record_key_not_preserved',
        });
      else if (recordKey !== parsed.data[recordKey]!.servantId)
        context.addIssue({
          code: 'custom',
          path: [recordKey, 'servantId'],
          message: 'servant_record_identity_mismatch',
        });
    }
    return parsed.data;
  });
}

export const servantBuildRecordSchema = servantIdentityRecordSchema(servantBuildSchema);
const servantTargetRecordSchema = servantIdentityRecordSchema(servantTargetSchema);
const localProfileShape = {
  profileId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  servantBuilds: servantBuildRecordSchema,
  servantTargets: servantTargetRecordSchema,
  craftEssences: z.array(craftEssenceCopySchema).max(10000),
  supportTemplates: z.array(supportTemplateSchema).max(1000),
};
export const localProfileSchema = z.object({
  ...localProfileShape,
  draft: calculationDraftSchema.nullable(),
  historicalDraft: historicalCalculationDraftSchema.nullish(),
  history: z.array(storedCalculationHistoryEntrySchema).max(20),
});
export type LocalProfile = z.infer<typeof localProfileSchema>;

export const profileCollectionSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  activeProfileId: z.uuid(),
  profiles: z.array(localProfileSchema).min(1).max(20),
});
export type ProfileCollection = z.infer<typeof profileCollectionSchema>;

const profileCollectionV40Schema = z.object({
  schemaVersion: z.literal(40),
  activeProfileId: z.uuid(),
  profiles: z
    .array(
      z.object({
        ...localProfileShape,
        draft: z.unknown().nullable(),
        history: z.array(z.unknown()).max(20),
      }),
    )
    .min(1)
    .max(20),
});
const calculationSnapshotV40Schema = z
  .object({
    profileId: z.uuid(),
    calculationSessionId: z.uuid(),
    request: portableCalculationRequestV40Schema,
    result: calculationResultV40Schema,
    requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    updatedAt: z.iso.datetime(),
  })
  .strict();
const calculationHistoryEntryV40Schema = calculationSnapshotV40Schema.extend({
  historyId: z.uuid(),
  finalizedAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime(),
});
const calculationSnapshotV41Schema = calculationSnapshotV40Schema.extend({
  request:portableCalculationRequestV41Schema,result:calculationResultV41Schema,
}).strict().superRefine(requireMatchingCalculationVersions);
const calculationHistoryEntryV41Schema = calculationSnapshotV41Schema.safeExtend({
  historyId:z.uuid(),finalizedAt:z.iso.datetime(),lastUsedAt:z.iso.datetime(),
});
export function parseHistoricalCalculationSnapshot(value:unknown) {
  if (value === null || typeof value !== 'object' || !('request' in value)) throw new TypeError('historical_snapshot_invalid');
  const version = z.object({request:z.object({versionContext:z.object({schemaVersion:z.number().int().optional()})})}).parse(value).request.versionContext.schemaVersion;
  if (version === undefined) return parseHistoricalCalculationSnapshotV40(value);
  if (version !== 41) throw new TypeError('historical_schema_version_unsupported');
  return 'historyId' in value ? calculationHistoryEntryV41Schema.parse(value) : calculationSnapshotV41Schema.parse(value);
}
const profileCollectionV41Schema = z.object({
  schemaVersion:z.literal(41),activeProfileId:z.uuid(),profiles:z.array(z.object({
    ...localProfileShape,draft:z.unknown().nullable(),historicalDraft:historicalCalculationDraftV40Schema.nullish(),history:z.array(z.unknown()).max(20),
  })).min(1).max(20),
});
/** Preserves exact v41 snapshots; publishes only a validated historical envelope, never a runnable old request. */
export async function migrateStoredProfileCollectionV41(value:unknown, fingerprint:(request:PortableCalculationRequestV40|PortableCalculationRequestV41)=>Promise<string>):Promise<ProfileCollection> {
  const source = profileCollectionV41Schema.parse(value);
  const profiles = await Promise.all(source.profiles.map(async(profile)=>{
    const preserve = async(value:unknown,history:boolean)=>{
      const snapshot = parseHistoricalCalculationSnapshot(value);
      if((!('schemaVersion' in snapshot.request.versionContext) || snapshot.request.versionContext.schemaVersion !== 41) || await fingerprint(snapshot.request) !== snapshot.requestFingerprint) throw new TypeError('v41_snapshot_identity_mismatch');
      const record={...snapshot,disposition:'historicalOnly' as const,sourceSchemaVersion:41 as const,scenario:snapshot.request.scenario,legacySnapshot:value};
      return history ? historicalCalculationHistoryEntryV41Schema.parse(record) : historicalCalculationDraftV41Schema.parse(record);
    };
    const historicalDraft = profile.draft === null ? profile.historicalDraft : await preserve(profile.draft,false);
    if(profile.draft !== null && profile.historicalDraft != null) throw new TypeError('v41_conflicting_drafts');
    const history = await Promise.all(profile.history.map(entry=>{
      if(entry !== null && typeof entry === 'object' && 'disposition' in entry) return historicalCalculationHistoryEntrySchema.parse(entry);
      return preserve(entry,true);
    }));
    return {...profile,draft:null,historicalDraft,history};
  }));
  const result=profileCollectionSchema.parse({...source,schemaVersion:SCHEMA_VERSION,profiles});
  await validateHistoricalCalculationIdentities(result,fingerprint);
  return result;
}
export async function validateHistoricalCalculationIdentities(collection:ProfileCollection,fingerprint:(request:PortableCalculationRequestV40|PortableCalculationRequestV41)=>Promise<string>):Promise<void> {
  await validateHistoricalV40Identities(collection,fingerprint);
  for(const profile of collection.profiles) for(const record of [profile.historicalDraft,...profile.history]) {
    if(!record || !('sourceSchemaVersion' in record) || record.sourceSchemaVersion !== 41) continue;
    const snapshot=parseHistoricalCalculationSnapshot(record.legacySnapshot);
    if((!('schemaVersion' in snapshot.request.versionContext) || snapshot.request.versionContext.schemaVersion !== 41) || snapshot.profileId !== record.profileId || snapshot.calculationSessionId !== record.calculationSessionId || snapshot.updatedAt !== record.updatedAt || snapshot.requestFingerprint !== record.requestFingerprint || JSON.stringify(snapshot.request.scenario) !== JSON.stringify(record.scenario) || JSON.stringify(snapshot.result) !== JSON.stringify(record.result) || await fingerprint(snapshot.request) !== record.requestFingerprint || ['historyId','finalizedAt','lastUsedAt'].some(key=>(snapshot as Record<string,unknown>)[key] !== (record as Record<string,unknown>)[key])) throw new TypeError('historical_v41_identity_mismatch');
  }
}

export function parseHistoricalCalculationSnapshotV40(value: unknown) {
  const snapshot =
    value !== null && typeof value === 'object' && 'historyId' in value
      ? calculationHistoryEntryV40Schema.parse(value)
      : calculationSnapshotV40Schema.parse(value);
  requireV40ResultMatchesRequest(snapshot.request, snapshot.result);
  return snapshot;
}

function requireV40ResultMatchesRequest(
  request: PortableCalculationRequestV40,
  result: CalculationResultV40,
) {
  if (
    result.versions.masterDataVersion !== request.versionContext.masterDataVersion ||
    result.versions.engineVersion !== request.versionContext.engineVersion
  )
    throw new TypeError('v40_request_result_version_mismatch');
}

/** An exact, one-way v40 migration. The caller supplies the portable SHA-256 implementation. */
export async function migrateStoredProfileCollectionV40(
  value: unknown,
  fingerprint: (request: PortableCalculationRequestV40) => Promise<string>,
): Promise<ProfileCollection> {
  const source = profileCollectionV40Schema.parse(value);
  const profiles = await Promise.all(
    source.profiles.map(async (profile) => {
      const historicalDraft =
        profile.draft === null
          ? null
          : await (async () => {
              const old = calculationSnapshotV40Schema.parse(profile.draft);
              requireV40ResultMatchesRequest(old.request, old.result);
              if ((await fingerprint(old.request)) !== old.requestFingerprint)
                throw new TypeError('v40_draft_fingerprint_mismatch');
              return historicalCalculationDraftV40Schema.parse({
                disposition: 'historicalOnly',
                sourceSchemaVersion: 40,
                profileId: old.profileId,
                calculationSessionId: old.calculationSessionId,
                scenario: old.request.scenario,
                result: old.result,
                requestFingerprint: old.requestFingerprint,
                updatedAt: old.updatedAt,
                legacySnapshot: profile.draft,
              });
            })();
      const history = await Promise.all(
        profile.history.map(async (entry) => {
          const historical = z
            .object({ disposition: z.literal('historicalOnly') })
            .loose()
            .safeParse(entry);
          if (historical.success) {
            return historicalCalculationHistoryEntrySchema.parse(entry);
          }
          const old = calculationHistoryEntryV40Schema.parse(entry);
          requireV40ResultMatchesRequest(old.request, old.result);
          if ((await fingerprint(old.request)) !== old.requestFingerprint)
            throw new TypeError('v40_history_fingerprint_mismatch');
          return historicalCalculationHistoryEntrySchema.parse({
            disposition: 'historicalOnly',
            sourceSchemaVersion: 40,
            profileId: old.profileId,
            calculationSessionId: old.calculationSessionId,
            scenario: old.request.scenario,
            result: old.result,
            requestFingerprint: old.requestFingerprint,
            updatedAt: old.updatedAt,
            historyId: old.historyId,
            finalizedAt: old.finalizedAt,
            lastUsedAt: old.lastUsedAt,
            legacySnapshot: entry,
          });
        }),
      );
      return { ...profile, draft: null, historicalDraft, history };
    }),
  );
  return profileCollectionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    activeProfileId: source.activeProfileId,
    profiles,
  });
}

export async function validateHistoricalV40Identities(
  collection: ProfileCollection,
  fingerprint: (request: PortableCalculationRequestV40) => Promise<string>,
): Promise<void> {
  for (const profile of collection.profiles) {
    for (const record of [
      profile.historicalDraft,
      ...profile.history.filter(
        (entry) => 'disposition' in entry && entry.sourceSchemaVersion === 40,
      ),
    ]) {
      if (!record || record.sourceSchemaVersion !== 40 || !('legacySnapshot' in record)) continue;
      const snapshot = parseHistoricalCalculationSnapshotV40(record.legacySnapshot);
      if (
        snapshot.profileId !== record.profileId ||
        snapshot.calculationSessionId !== record.calculationSessionId ||
        snapshot.updatedAt !== record.updatedAt ||
        ['historyId', 'finalizedAt', 'lastUsedAt'].some(
          (key) =>
            (snapshot as Record<string, unknown>)[key] !== (record as Record<string, unknown>)[key],
        ) ||
        snapshot.requestFingerprint !== record.requestFingerprint ||
        JSON.stringify(snapshot.request.scenario) !== JSON.stringify(record.scenario) ||
        JSON.stringify(snapshot.result) !== JSON.stringify(record.result) ||
        (await fingerprint(snapshot.request)) !== record.requestFingerprint
      )
        throw new TypeError('historical_v40_identity_mismatch');
    }
  }
}

const localProfileV34Schema = z.object({
  ...localProfileShape,
  draft: z.unknown().nullable(),
  history: z.array(z.unknown()).max(20),
});
const profileCollectionV34Schema = z.object({
  schemaVersion: z.union([
    z.literal(34),
    z.literal(35),
    z.literal(36),
    z.literal(37),
    z.literal(38),
  ]),
  activeProfileId: z.uuid(),
  profiles: z.array(localProfileV34Schema).min(1).max(20),
});

const calculationSnapshotV33Schema = z
  .object({
    profileId: z.uuid(),
    calculationSessionId: z.uuid(),
    request: portableCalculationRequestV33Schema,
    result: z.unknown(),
    requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    updatedAt: z.iso.datetime(),
  })
  .strict();
const calculationHistoryEntryV33Schema = calculationSnapshotV33Schema.extend({
  historyId: z.uuid(),
  finalizedAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime(),
});
const localProfileV33Schema = z
  .object({
    profileId: z.uuid(),
    name: z.string().trim().min(1).max(80),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    servantBuilds: servantBuildRecordSchema,
    servantTargets: servantTargetRecordSchema,
    craftEssences: z.array(craftEssenceCopySchema).max(10000),
    supportTemplates: z.array(supportTemplateSchema).max(1000),
    draft: calculationSnapshotV33Schema.nullable(),
    history: z.array(calculationHistoryEntryV33Schema).max(20),
  })
  .strict();
const profileCollectionV33Schema = z
  .object({
    schemaVersion: z.literal(33),
    activeProfileId: z.uuid(),
    profiles: z.array(localProfileV33Schema).min(1).max(20),
  })
  .strict();

const localProfileV32Schema = z
  .object({
    profileId: z.uuid(),
    name: z.string().trim().min(1).max(80),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    servantBuilds: servantBuildRecordSchema,
    servantTargets: servantTargetRecordSchema,
    craftEssences: z.array(craftEssenceCopySchema).max(10000),
    supportTemplates: z.array(supportTemplateSchema).max(1000),
    draft: z.unknown(),
    history: z.unknown(),
  })
  .strict();
const profileCollectionV32Schema = z
  .object({
    schemaVersion: z.literal(32),
    activeProfileId: z.uuid(),
    profiles: z.array(localProfileV32Schema).min(1).max(20),
  })
  .strict()
  .superRefine((collection, context) => {
    if (!collection.profiles.some(({ profileId }) => profileId === collection.activeProfileId))
      context.addIssue({ code: 'custom', message: 'active_profile_missing' });
  });

export function parseStoredProfileCollection(value: unknown): {
  collection: ProfileCollection;
  upgraded: boolean;
  discardedCalculationSnapshots: boolean;
} {
  const current = profileCollectionSchema.safeParse(value);
  if (current.success)
    return {
      collection: current.data,
      upgraded: false,
      discardedCalculationSnapshots: false,
    };
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>)['schemaVersion'] === SCHEMA_VERSION
  )
    return {
      collection: profileCollectionSchema.parse(value),
      upgraded: false,
      discardedCalculationSnapshots: false,
    };
  const version34 = profileCollectionV34Schema.safeParse(value);
  if (version34.success) {
    const sourceVersion = version34.data.schemaVersion;
    let discardedCalculationSnapshots = false;
    const profiles = version34.data.profiles.map((profile) => {
      const draft = migrateCalculationSnapshotV34(profile.draft, sourceVersion);
      if (profile.draft && !draft) discardedCalculationSnapshots = true;
      return {
        ...profile,
        draft,
        history: profile.history.map((entry) =>
          migrateCalculationHistoryEntryV34(entry, sourceVersion),
        ),
      };
    });
    return {
      collection: profileCollectionSchema.parse({
        ...version34.data,
        schemaVersion: SCHEMA_VERSION,
        profiles,
      }),
      upgraded: true,
      discardedCalculationSnapshots,
    };
  }
  const version33 = profileCollectionV33Schema.safeParse(value);
  if (version33.success) {
    let discardedCalculationSnapshots = false;
    const profiles = version33.data.profiles.map((profile) => {
      const draft = migrateCalculationSnapshotV33(profile.draft);
      const history = profile.history.flatMap((entry) => {
        const migrated = migrateCalculationHistoryEntryV33(entry);
        if (!migrated) discardedCalculationSnapshots = true;
        return migrated ? [migrated] : [];
      });
      if (profile.draft && !draft) discardedCalculationSnapshots = true;
      return { ...profile, draft, history };
    });
    return {
      collection: profileCollectionSchema.parse({
        schemaVersion: SCHEMA_VERSION,
        activeProfileId: version33.data.activeProfileId,
        profiles,
      }),
      upgraded: true,
      discardedCalculationSnapshots,
    };
  }
  const legacy = profileCollectionV32Schema.parse(value);
  return {
    collection: profileCollectionSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      activeProfileId: legacy.activeProfileId,
      profiles: legacy.profiles.map((profile) => ({
        ...profile,
        draft: null,
        history: [],
      })),
    }),
    upgraded: true,
    discardedCalculationSnapshots: true,
  };
}

function migrateCalculationResultV34(
  result: unknown,
  sourceVersion: 34 | 35 | 36 | 37 | 38,
): CalculationResult {
  const envelope = z
    .object({ versions: z.object({ schemaVersion: z.literal(sourceVersion) }).loose() })
    .loose()
    .parse(result);
  return calculationResultBeforeV39Schema.parse({
    ...envelope,
    versions: { ...envelope.versions, schemaVersion: SCHEMA_VERSION },
  });
}
function parseCalculationSnapshotV34(snapshot: unknown, sourceVersion: 34 | 35 | 36 | 37 | 38) {
  const requestSchema =
    sourceVersion === 38
      ? portableCalculationRequestV40Schema
      : legacyPortableCalculationRequestSchema;
  const envelope = z
    .object({ request: requestSchema, result: z.unknown() })
    .loose()
    .parse(snapshot);
  const result = migrateCalculationResultV34(envelope.result, sourceVersion);
  const parsed = z
    .object({ ...calculationSnapshotShape, request: requestSchema })
    .superRefine(requireMatchingCalculationVersions)
    .parse({ ...envelope, result });
  return { ...envelope, ...parsed };
}
function migrateCalculationSnapshotV34(snapshot: unknown, sourceVersion: 34 | 35 | 36 | 37 | 38) {
  if (snapshot === null) return null;
  const parsed = parseCalculationSnapshotV34(snapshot, sourceVersion);
  return parsed.request.scenario.mode === 'resolved'
    ? null
    : calculationDraftSchema.parse({
        ...parsed,
        request: {
          ...parsed.request,
          versionContext: { ...parsed.request.versionContext, schemaVersion: SCHEMA_VERSION },
        },
      });
}
function migrateCalculationHistoryEntryV34(
  entry: unknown,
  sourceVersion: 34 | 35 | 36 | 37 | 38,
): CalculationHistoryEntry {
  const envelope = z
    .object({ disposition: z.string().optional(), result: z.unknown() })
    .loose()
    .parse(entry);
  if (envelope.disposition === 'historicalOnly')
    return historicalCalculationHistoryEntrySchema.parse({
      ...envelope,
      result: migrateCalculationResultV34(envelope.result, sourceVersion),
    });
  const parsed = parseCalculationSnapshotV34(entry, sourceVersion);
  if (parsed.request.scenario.mode === 'manual')
    return calculationHistoryEntrySchema.parse({
      ...parsed,
      request: {
        ...parsed.request,
        versionContext: { ...parsed.request.versionContext, schemaVersion: SCHEMA_VERSION },
      },
    });
  return historicalCalculationHistoryEntrySchema.parse({
    ...parsed,
    disposition: 'historicalOnly',
    sourceSchemaVersion: sourceVersion,
    legacyResultSchemaVersion: sourceVersion,
    scenario: parsed.request.scenario,
    legacyRankingIntent: parsed.request.executionIntent,
  });
}

function migrateCalculationResultV33(
  result: unknown,
  request: PortableCalculationRequestV33,
): CalculationResult | null {
  if (!result || typeof result !== 'object') return null;
  const versions = (result as { versions?: unknown }).versions;
  if (!versions || typeof versions !== 'object') return null;
  const record = versions as Record<string, unknown>;
  if (
    record['schemaVersion'] !== 33 ||
    record['masterDataVersion'] !== request.versionContext.masterDataVersion ||
    record['engineVersion'] !== request.versionContext.engineVersion
  )
    return null;
  const migrated = calculationResultBeforeV39Schema.safeParse({
    ...result,
    versions: { ...record, schemaVersion: SCHEMA_VERSION },
  });
  return migrated.success ? migrated.data : null;
}

function migratePortableCalculationRequestV33(
  request: PortableCalculationRequestV33,
): PortableCalculationRequest | null {
  if (request.scenario.mode === 'manual')
    return portableCalculationRequestSchema.parse({
      versionContext: { ...request.versionContext, schemaVersion: SCHEMA_VERSION },
      scenario: request.scenario,
      executionIntent: { kind: 'manual' },
    });
  return null;
}

function migrateCalculationSnapshotV33(
  snapshot: z.infer<typeof calculationSnapshotV33Schema> | null,
) {
  if (!snapshot) return null;
  const request = migratePortableCalculationRequestV33(snapshot.request);
  const result = migrateCalculationResultV33(snapshot.result, snapshot.request);
  if (!request || !result) return null;
  return calculationDraftSchema.parse({ ...snapshot, request, result });
}

function migrateCalculationHistoryEntryV33(
  entry: z.infer<typeof calculationHistoryEntryV33Schema>,
): CalculationHistoryEntry | null {
  const result = migrateCalculationResultV33(entry.result, entry.request);
  if (!result) return null;
  const request = migratePortableCalculationRequestV33(entry.request);
  if (request) return calculationHistoryEntrySchema.parse({ ...entry, request, result });
  if (entry.request.scenario.mode !== 'resolved') return null;
  const intent = entry.request.executionIntent;
  if (intent.kind === 'manual') return null;
  return historicalCalculationHistoryEntrySchema.parse({
    disposition: 'historicalOnly',
    sourceSchemaVersion: 33,
    profileId: entry.profileId,
    calculationSessionId: entry.calculationSessionId,
    scenario: entry.request.scenario,
    legacyRankingIntent: {
      initialNpGauge: intent.initialNpGauge,
      contribution: intent.contribution,
    },
    result,
    legacyResultSchemaVersion: 33,
    requestFingerprint: entry.requestFingerprint,
    updatedAt: entry.updatedAt,
    historyId: entry.historyId,
    finalizedAt: entry.finalizedAt,
    lastUsedAt: entry.lastUsedAt,
  });
}

export const userDataBackupSchema = z.object({
  kind: z.literal('fgo-lab-user-backup'),
  schemaVersion: z.literal(SCHEMA_VERSION),
  exportedAt: z.iso.datetime(),
  appVersion: z.string(),
  profiles: profileCollectionSchema,
});
export type UserDataBackup = z.infer<typeof userDataBackupSchema>;
const userDataBackupV32Schema = z
  .object({
    kind: z.literal('fgo-lab-user-backup'),
    schemaVersion: z.literal(32),
    exportedAt: z.iso.datetime(),
    appVersion: z.string(),
    profiles: profileCollectionV32Schema,
  })
  .strict();
const userDataBackupV33Schema = z
  .object({
    kind: z.literal('fgo-lab-user-backup'),
    schemaVersion: z.literal(33),
    exportedAt: z.iso.datetime(),
    appVersion: z.string(),
    profiles: profileCollectionV33Schema,
  })
  .strict();
const userDataBackupV34Schema = z.object({
  kind: z.literal('fgo-lab-user-backup'),
  schemaVersion: z.union([
    z.literal(34),
    z.literal(35),
    z.literal(36),
    z.literal(37),
    z.literal(38),
  ]),
  exportedAt: z.iso.datetime(),
  appVersion: z.string(),
  profiles: profileCollectionV34Schema,
});

const userDataBackupV40Schema = z.object({
  kind: z.literal('fgo-lab-user-backup'),
  schemaVersion: z.literal(40),
  exportedAt: z.iso.datetime(),
  appVersion: z.string(),
  profiles: profileCollectionV40Schema,
});

export async function migrateUserDataBackupV40(
  value: unknown,
  fingerprint: (
    request: PortableCalculationRequest | z.infer<typeof portableCalculationRequestV40Schema>,
  ) => Promise<string>,
): Promise<UserDataBackup> {
  const source = userDataBackupV40Schema.parse(value);
  return userDataBackupSchema.parse({
    ...source,
    schemaVersion: SCHEMA_VERSION,
    profiles: await migrateStoredProfileCollectionV40(source.profiles, fingerprint),
  });
}

export const calculationShareSnapshotSchema = z
  .object({
    kind: z.literal('fgo-lab-calculation-share'),
    schemaVersion: z.literal(SCHEMA_VERSION),
    sharedAt: z.iso.datetime(),
    request: portableCalculationRequestSchema,
    result: calculationResultSchema,
  })
  .superRefine(requireMatchingCalculationVersions);
export type CalculationShareSnapshot = z.infer<typeof calculationShareSnapshotSchema>;
const calculationShareSnapshotV40Schema = z.object({
  kind: z.literal('fgo-lab-calculation-share'),
  schemaVersion: z.literal(40),
  sharedAt: z.iso.datetime(),
  request: portableCalculationRequestV40Schema,
  result: calculationResultV40Schema,
});
const calculationShareSnapshotV41Schema = calculationShareSnapshotV40Schema.extend({
  schemaVersion:z.literal(41),request:portableCalculationRequestV41Schema,result:calculationResultV41Schema,
}).superRefine(requireMatchingCalculationVersions);
export function parseHistoricalCalculationShareSnapshot(value:unknown) {
  const version=z.object({schemaVersion:z.number().int()}).parse(value).schemaVersion;
  if(version===40)return parseCalculationShareSnapshotV40(value);
  if(version===41)return calculationShareSnapshotV41Schema.parse(value);
  throw new TypeError('historical_share_schema_unsupported');
}
export async function migrateUserDataBackupV41(value:unknown,fingerprint:(request:PortableCalculationRequestV40|PortableCalculationRequestV41)=>Promise<string>):Promise<UserDataBackup> {
  const source=userDataBackupV40Schema.extend({schemaVersion:z.literal(41),profiles:profileCollectionV41Schema}).parse(value);
  return userDataBackupSchema.parse({...source,schemaVersion:SCHEMA_VERSION,profiles:await migrateStoredProfileCollectionV41(source.profiles,fingerprint)});
}
export function parseCalculationShareSnapshotV40(value: unknown) {
  const snapshot = calculationShareSnapshotV40Schema.parse(value);
  requireV40ResultMatchesRequest(snapshot.request, snapshot.result);
  return snapshot;
}

export function parseUserDataBackup(value: unknown): UserDataBackup {
  const current = userDataBackupSchema.safeParse(value);
  if (current.success) return current.data;
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>)['schemaVersion'] === SCHEMA_VERSION
  )
    return userDataBackupSchema.parse(value);
  const version34 = userDataBackupV34Schema.safeParse(value);
  if (version34.success)
    return userDataBackupSchema.parse({
      kind: version34.data.kind,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: version34.data.exportedAt,
      appVersion: version34.data.appVersion,
      profiles: parseStoredProfileCollection(version34.data.profiles).collection,
    });
  const version33 = userDataBackupV33Schema.safeParse(value);
  if (version33.success)
    return userDataBackupSchema.parse({
      kind: version33.data.kind,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: version33.data.exportedAt,
      appVersion: version33.data.appVersion,
      profiles: parseStoredProfileCollection(version33.data.profiles).collection,
    });
  const legacy = userDataBackupV32Schema.parse(value);
  return userDataBackupSchema.parse({
    kind: legacy.kind,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: legacy.exportedAt,
    appVersion: legacy.appVersion,
    profiles: parseStoredProfileCollection(legacy.profiles).collection,
  });
}

export function parseCalculationShareSnapshot(value: unknown): CalculationShareSnapshot {
  return calculationShareSnapshotSchema.parse(value);
}
