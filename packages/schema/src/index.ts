import {
  initialOverchargeSchema,
  rankingSelectionSchema,
  resolvedRankingBasisSchema,
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

export const versionContextSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    masterDataVersion: z.string().min(1).max(100),
    engineVersion: z.string().min(1).max(100),
    appVersion: z.string().min(1).max(50),
    gameRegion: z.literal('JP'),
    masterDataLocale: z.literal('ja-JP'),
  })
  .strict();
export type VersionContext = z.infer<typeof versionContextSchema>;

const skillLevelsSchema = z.record(z.string().min(1), z.number().int().min(1).max(10));
const appendLevelsSchema = z.record(z.string().min(1), z.number().int().min(0).max(10));

export const servantBuildSchema = z
  .object({
    servantId: z.string().min(1).max(80),
    level: z.number().int().min(1).max(120),
    ascension: z.number().int().min(0).max(4),
    npLevel: z.number().int().min(0).max(5),
    fouAtk: z.number().int().min(0).max(3000),
    skills: skillLevelsSchema,
    appends: appendLevelsSchema,
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type ServantBuild = z.infer<typeof servantBuildSchema>;

export const servantTargetSchema = servantBuildSchema.omit({ npLevel: true }).extend({
  planned: z.boolean(),
});
export type ServantTarget = z.infer<typeof servantTargetSchema>;

export const craftEssenceCopySchema = z
  .object({
    copyId: z.uuid(),
    craftEssenceId: z.string().min(1).max(80),
    level: z.number().int().min(1).max(100),
    limitBreak: z.number().int().min(0).max(4),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type CraftEssenceCopy = z.infer<typeof craftEssenceCopySchema>;

export const supportSkillSchema = z
  .object({
    skillId: z.string().min(1).max(80),
    skillLevel: z.number().int().min(1).max(10),
    enabled: z.boolean(),
  })
  .strict();
export type SupportSkill = z.infer<typeof supportSkillSchema>;

export const supportSourceSchema = z
  .object({
    sourceInstanceId: z.string().min(1).max(160),
    servantId: z.string().min(1).max(80),
    skills: z.array(supportSkillSchema).max(20),
  })
  .strict();
export type SupportSource = z.infer<typeof supportSourceSchema>;

export const supportEffectRefSchema = z
  .object({
    sourceInstanceId: z.string().min(1).max(160),
    skillId: z.string().min(1).max(80),
    effectId: z.string().min(1).max(80),
    effectOccurrenceId: z.string().min(1).max(80),
  })
  .strict();
export type SupportEffectRef = z.infer<typeof supportEffectRefSchema>;
export const supportEffectInclusionSchema = supportEffectRefSchema.extend({
  included: z.literal(false),
});
export type SupportEffectInclusion = z.infer<typeof supportEffectInclusionSchema>;

export const supportCompositionSchema = z
  .object({
    sources: z.array(supportSourceSchema).max(20),
    effectInclusions: z.array(supportEffectInclusionSchema).max(200),
  })
  .strict();
export type SupportComposition = z.infer<typeof supportCompositionSchema>;

export const supportTemplateSchema = z
  .object({
    templateId: z.uuid(),
    name: z.string().trim().min(1).max(80),
    masterDataVersion: z.string().min(1),
    composition: supportCompositionSchema,
    updatedAt: z.iso.datetime(),
    lastUsedAt: z.iso.datetime().nullable(),
  })
  .strict();
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
  z.object({ kind: z.literal('classIdentity'), classId: canonicalTargetClassIdSchema }).strict(),
  z
    .object({
      kind: z.literal('attributeIdentity'),
      attribute: canonicalTargetAttributeSchema,
    })
    .strict(),
  z
    .object({ kind: z.literal('familyMembership'), familyId: canonicalTargetFamilyIdSchema })
    .strict(),
]);
export type TargetPredicate = z.infer<typeof targetPredicateSchema>;

export const targetClassContextSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('relative'),
      relation: z.enum(['advantage2', 'advantage15', 'neutral', 'disadvantage']),
    })
    .strict(),
  z.object({ kind: z.literal('concrete'), classId: canonicalTargetClassIdSchema }).strict(),
]);
export type TargetClassContext = z.infer<typeof targetClassContextSchema>;

export const targetAttributeContextSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('relative'),
      relation: z.enum(['advantage', 'neutral', 'disadvantage']),
    })
    .strict(),
  z.object({ kind: z.literal('concrete'), attribute: canonicalTargetAttributeSchema }).strict(),
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
      z
        .object({
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
        })
        .strict(),
      z
        .object({
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
        })
        .strict(),
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
      .exactOptional(),
    attackerHpPermille: quantityFactValueSchema('attackerHpPermille').nullable(),
    targetRarity: quantityFactValueSchema('targetRarity').nullable(),
    targetStateTraits: z.array(z.string().min(1).max(80)).max(100),
    battlePointPhase: quantityFactValueSchema('battlePointPhase').nullable(),
    target: z
      .object({
        classId: canonicalTargetClassIdSchema.nullable(),
        attribute: z.enum(['man', 'earth', 'sky', 'star', 'beast', 'unknown']),
        traits: z.array(z.string().min(1).max(80)).max(100),
      })
      .strict(),
  })
  .strict()
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
        initialActorFormId: z
          .object({
            actorId: z.string().min(1).max(80),
            limitCount: z.number().int().nonnegative(),
          })
          .strict(),
        source: z.enum(['owned', 'master']),
        level: z.number().int().min(1).max(120),
        npLevel: z.number().int().min(1).max(5),
        fouAtk: z.number().int().min(0).max(3000),
      })
      .strict(),
    initialOvercharge: initialOverchargeSchema,
    targetContext: targetContextSchema,
    attackerHpPermille: quantityFactValueSchema('attackerHpPermille').nullable(),
    battleState: z
      .object({
        battlePointPhase: quantityFactValueSchema('battlePointPhase').nullable(),
      })
      .strict(),
    canonicalInputValues: z.record(
      z.string().min(1).max(300),
      z
        .object({
          kind: z.literal('integer'),
          value: z.number().int(),
          origin: z.enum(['baseline', 'maximum', 'witness', 'explicit']).exactOptional(),
        })
        .strict(),
    ),
  })
  .strict();

const resolvedScenarioShapeSchema = scenarioBaseSchema
  .extend({
    mode: z.literal('resolved'),
    craftEssence: z
      .object({
        craftEssenceId: z.string().min(1).max(80),
        level: z.number().int().min(1).max(100),
        limitBreak: z.number().int().min(0).max(4),
      })
      .strict()
      .nullable(),
    preNoblePhantasmPlan: preNoblePhantasmPlanSchema,
    mysticCode: z
      .object({
        mysticCodeId: z.string().min(1).max(80),
        skills: z.array(supportSkillSchema).min(1).max(3),
      })
      .strict()
      .nullable(),
    support: z
      .object({
        sourceTemplateId: z.uuid().nullable(),
        composition: supportCompositionSchema,
      })
      .strict()
      .nullable(),
    effectDecisions: z.array(
      z
        .object({
          decisionKey: z.string().min(1).max(300),
          operationEnabled: z.boolean(),
          conditionSatisfaction: z.enum(['evaluate', 'assumeSatisfied']),
        })
        .strict(),
    ),
    activationFacts: activationFactsSchema,
    worldFactAssertions: z.array(
      z
        .object({
          decisionKey: z.string().min(1).max(300),
          fact: z.discriminatedUnion('kind', [
            z
              .object({
                kind: z.literal('trait'),
                scope: z.enum(['attacker', 'attackerState', 'target', 'targetState', 'field']),
                trait: z.string().min(1).max(80),
                present: z.boolean(),
              })
              .strict(),
            worldFactQuantitySchema,
          ]),
        })
        .strict(),
    ),
    explicitOverrides: z
      .object({
        attackerAtk: z.number().int().nonnegative().max(100000).exactOptional(),
        fouAtk: z.number().int().nonnegative().max(3000).exactOptional(),
        craftEssenceAtk: z.number().int().nonnegative().max(10000).exactOptional(),
        classAttackRate: z.number().min(0).max(5).exactOptional(),
      })
      .strict(),
  })
  .strict();

export const resolvedScenarioSchema = resolvedScenarioShapeSchema
  .extend({
    enemyDefenseBuff: z.number().min(-5).max(5),
    initialBattlePointPoints: z
      .record(z.string().min(1).max(80), z.number().int().min(-1))
      .exactOptional(),
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

export const calculationVersionContextSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    masterDataVersion: z.string().min(1).max(100),
    engineVersion: z.string().min(1).max(100),
  })
  .strict();
export type CalculationVersionContext = z.infer<typeof calculationVersionContextSchema>;
const calculatorExecutionIntentSchema = z
  .object({
    kind: z.literal('calculator'),
    initialNpGauge: z.union([z.literal(10000), z.literal(20000), z.literal(30000)]),
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
function validatePortableRequestValues(value: unknown, context: z.RefinementCtx) {
  const ancestors = new Set<object>();
  function visit(current: unknown, path: (string | number)[]): void {
    if (current === undefined) {
      context.addIssue({ code: 'custom', path, message: 'explicit_undefined_not_allowed' });
      return;
    }
    if (current === null || typeof current !== 'object') return;
    if (ancestors.has(current)) {
      context.addIssue({ code: 'custom', path, message: 'cyclic_request_not_allowed' });
      return;
    }
    ancestors.add(current);
    if (Object.getOwnPropertySymbols(current).length > 0)
      context.addIssue({ code: 'custom', path, message: 'symbol_request_key_not_allowed' });
    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index++) visit(current[index], [...path, index]);
    } else {
      for (const [key, item] of Object.entries(current)) visit(item, [...path, key]);
    }
    ancestors.delete(current);
  }
  visit(value, []);
}

export const portableCalculationRequestSchema = z
  .unknown()
  .superRefine(validatePortableRequestValues)
  .pipe(
    z.union([resolvedPortableCalculationRequestSchema, manualPortableCalculationRequestSchema]),
  );
export type PortableCalculationRequest = z.infer<typeof portableCalculationRequestSchema>;

export const damageRowSchema = z
  .object({
    npLevel: z.number().int().min(1).max(5),
    minimum: z.number().int().nonnegative(),
    average: z.number().nonnegative(),
    maximum: z.number().int().nonnegative(),
  })
  .strict();
export type DamageRow = z.infer<typeof damageRowSchema>;
export const calculationEvidenceSchema = z
  .object({
    key: z.string().min(1),
    subject: z.string().min(1),
    status: z.enum(['validated', 'provisional']),
    sources: z.array(z.string().min(1)),
    goldenCaseIds: z.array(z.string().min(1)),
    differentialCaseIds: z.array(z.string().min(1)),
    reviewedAt: z.iso.date(),
    engineVersion: z.string().min(1).max(100),
  })
  .strict();
export type CalculationEvidence = z.infer<typeof calculationEvidenceSchema>;
const resultBaseSchema = z
  .object({
    effects: z.array(
      z
        .object({
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
        })
        .strict(),
    ),
    assumptions: z.array(z.string()),
    issues: z.array(z.object({ code: z.string(), detail: z.string() }).strict()),
    trace: z.array(z.object({ step: z.string(), detail: z.string() }).strict()),
    evidence: z.array(calculationEvidenceSchema).min(1),
    versions: versionContextSchema,
  })
  .strict();
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
  breakdown: z.array(
    z.object({ key: z.string(), labelKey: z.string(), value: z.number() }).strict(),
  ),
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
    z
      .object({
        key: z.string().min(1),
        owner: z.enum(['attacker', 'target', 'field', 'party', 'source']),
        label: z.string().min(1),
        description: z.string().min(1),
        minimum: z.number().int(),
        maximum: z.number().int(),
        step: z.number().int().positive(),
        effectOccurrenceIds: z.array(z.string().min(1)).min(1),
      })
      .strict(),
  ),
});
export const calculationResultSchema = z.discriminatedUnion('status', [
  calculatedResultSchema,
  unavailableResultSchema,
  inputRequiredResultSchema,
  unsupportedResultSchema,
]);
export type CalculationResult = z.infer<typeof calculationResultSchema>;
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
      versionContext: { schemaVersion: number; masterDataVersion: string; engineVersion: string };
    };
    result: {
      versions: { schemaVersion: number; masterDataVersion: string; engineVersion: string };
    };
  },
  context: z.core.$RefinementCtx,
) {
  if (
    value.request.versionContext.masterDataVersion !== value.result.versions.masterDataVersion ||
    value.request.versionContext.engineVersion !== value.result.versions.engineVersion ||
    value.request.versionContext.schemaVersion !== value.result.versions.schemaVersion
  )
    context.addIssue({
      code: 'custom',
      path: ['result', 'versions'],
      message: 'request_result_version_mismatch',
    });
}
export const calculationDraftSchema = z
  .object(calculationSnapshotShape)
  .strict()
  .superRefine(requireMatchingCalculationVersions);
export type CalculationDraft = z.infer<typeof calculationDraftSchema>;
export const calculationHistoryEntrySchema = z
  .object({
    ...calculationSnapshotShape,
    historyId: z.uuid(),
    finalizedAt: z.iso.datetime(),
    lastUsedAt: z.iso.datetime(),
  })
  .strict()
  .superRefine(requireMatchingCalculationVersions);
export type CurrentCalculationHistoryEntry = z.infer<typeof calculationHistoryEntrySchema>;
export type CalculationHistoryEntry = z.infer<typeof calculationHistoryEntrySchema>;

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
export const localProfileSchema = z
  .object({
    ...localProfileShape,
    draft: calculationDraftSchema.nullable(),
    history: z.array(calculationHistoryEntrySchema).max(20),
  })
  .strict()
  .superRefine((profile, context) => {
    if (profile.draft && profile.draft.profileId !== profile.profileId)
      context.addIssue({
        code: 'custom',
        path: ['draft', 'profileId'],
        message: 'calculation_profile_owner_mismatch',
      });
    const historyIds = new Set<string>();
    for (const [index, entry] of profile.history.entries()) {
      if (entry.profileId !== profile.profileId)
        context.addIssue({
          code: 'custom',
          path: ['history', index, 'profileId'],
          message: 'calculation_profile_owner_mismatch',
        });
      if (historyIds.has(entry.historyId))
        context.addIssue({
          code: 'custom',
          path: ['history', index, 'historyId'],
          message: 'duplicate_history_id',
        });
      historyIds.add(entry.historyId);
    }
  });
export type LocalProfile = z.infer<typeof localProfileSchema>;

export const profileCollectionSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    activeProfileId: z.uuid(),
    profiles: z.array(localProfileSchema).min(1).max(20),
  })
  .strict()
  .superRefine((collection, context) => {
    const profileIds = new Set<string>();
    for (const [index, profile] of collection.profiles.entries()) {
      if (profileIds.has(profile.profileId))
        context.addIssue({
          code: 'custom',
          path: ['profiles', index, 'profileId'],
          message: 'duplicate_profile_id',
        });
      profileIds.add(profile.profileId);
    }
    if (!profileIds.has(collection.activeProfileId))
      context.addIssue({
        code: 'custom',
        path: ['activeProfileId'],
        message: 'active_profile_missing',
      });
  });
export type ProfileCollection = z.infer<typeof profileCollectionSchema>;

export function parseStoredProfileCollection(value: unknown): { collection: ProfileCollection } {
  return { collection: profileCollectionSchema.parse(value) };
}

export const userDataBackupSchema = z
  .object({
    kind: z.literal('fgo-lab-user-backup'),
    schemaVersion: z.literal(SCHEMA_VERSION),
    exportedAt: z.iso.datetime(),
    appVersion: z.string(),
    profiles: profileCollectionSchema,
  })
  .strict();
export type UserDataBackup = z.infer<typeof userDataBackupSchema>;
export const calculationShareSnapshotSchema = z
  .object({
    kind: z.literal('fgo-lab-calculation-share'),
    schemaVersion: z.literal(SCHEMA_VERSION),
    sharedAt: z.iso.datetime(),
    request: portableCalculationRequestSchema,
    result: calculationResultSchema,
  })
  .strict()
  .superRefine(requireMatchingCalculationVersions);
export type CalculationShareSnapshot = z.infer<typeof calculationShareSnapshotSchema>;
export function parseUserDataBackup(value: unknown): UserDataBackup {
  return userDataBackupSchema.parse(value);
}

export function parseCalculationShareSnapshot(value: unknown): CalculationShareSnapshot {
  return calculationShareSnapshotSchema.parse(value);
}
