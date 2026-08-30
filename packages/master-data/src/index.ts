import { z } from 'zod';
import {
  canonicalTargetAttributeSchema,
  canonicalTargetClassIdSchema,
  canonicalTargetFamilyIdSchema,
  targetPredicateSchema,
  type TargetPredicate,
} from '@fgo-lab/schema';

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
  schemaVersion: z.literal(39),
  files: z.array(masterFileSchema).min(1),
  imagesEnabled: z.boolean(),
});
export type MasterManifest = z.infer<typeof masterManifestSchema>;

const signedTraitSchema = z.object({
  name: z.string().min(1),
  negative: z.boolean(),
});
const conditionSignedTraitSchema = signedTraitSchema.extend({
  layer: z.enum(['combined', 'state']),
});
type ConditionAtom =
  | { name: string; negative: boolean; layer: 'combined' | 'state' }
  | {
      predicate: TargetPredicate;
      negative: boolean;
    };
const targetPredicateConditionAtomSchema = z.object({
  predicate: targetPredicateSchema,
  negative: z.boolean(),
});
const conditionAtomSchema: z.ZodType<ConditionAtom> = z.union([
  conditionSignedTraitSchema,
  targetPredicateConditionAtomSchema,
]);
export const traitConditionSchema = z.object({
  operator: z.enum(['any', 'all']),
  traits: z.array(conditionAtomSchema),
});
export type TraitCondition = z.infer<typeof traitConditionSchema>;

export const traitReadPolicySchema = z.object({
  stateSources: z.enum(['activeOnly', 'activeAndPassive']),
  ignoredStateTraits: z.enum(['exclude', 'include']),
  unremovableStateTraits: z.enum(['include', 'exclude']),
});
export type TraitReadPolicy = z.infer<typeof traitReadPolicySchema>;

export const effectConditionsSchema = z.object({
  recipient: z.array(traitConditionSchema),
  holder: traitConditionSchema,
  opponent: traitConditionSchema,
  field: traitConditionSchema,
});
export type EffectConditions = z.infer<typeof effectConditionsSchema>;

const effectParameterSemanticsSchema = z.object({
  value: z.array(z.string().min(1)),
  lifecycle: z.array(z.string().min(1)),
  presentation: z.array(z.string().min(1)),
  condition: z.array(z.string().min(1)),
  contextMutation: z.array(z.string().min(1)),
  choice: z.array(z.string().min(1)),
  valueExpression: z.array(z.string().min(1)),
  buffIdentity: z.array(z.string().min(1)),
  unresolved: z.array(z.string().min(1)),
});
export type EffectParameterSemantics = z.infer<typeof effectParameterSemanticsSchema>;

const effectQuantityConditionSchema = z.object({
  quantity: z.enum(['attackerHpPermille', 'battlePointPhase']),
  subjectId: z.string().min(1).optional(),
  comparison: z.enum(['atMost', 'atLeast']),
  value: z.number().int(),
});
const effectSourceQuantityConditionSchema = z.object({
  quantity: z.literal('battlePointRate'),
  subjectId: z.string().min(1),
  comparison: z.enum(['atMost', 'atLeast']),
  value: z.number().int(),
});

const effectParameterSchema = z.record(z.string(), z.json());
const effectParameterSetsSchema = z.tuple([
  z.array(effectParameterSchema).max(10),
  z.array(effectParameterSchema).max(10),
  z.array(effectParameterSchema).max(10),
  z.array(effectParameterSchema).max(10),
  z.array(effectParameterSchema).max(10),
]);
const modifierValueExpressionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('inverseHpLinear'),
    basePermille: z.number().int(),
    bonusAtZeroHpPermille: z.number().int(),
  }),
  z.object({
    kind: z.literal('hpRangeLinear'),
    basePermille: z.number().int(),
    minimumHpPermille: z.number().int(),
    maximumHpPermille: z.number().int(),
    valueAtMinimumHpPermille: z.number().int(),
    valueAtMaximumHpPermille: z.number().int(),
  }),
  z.object({
    kind: z.literal('inputLinear'),
    inputKey: z.string().min(1),
    basePermille: z.number().int(),
    perUnitPermille: z.number().int(),
    maximumUnits: z.number().int().nonnegative(),
    maximumValuePermille: z.number().int().nullable(),
  }),
]);
const modifierValueExpressionSetsSchema = z.tuple([
  z.array(modifierValueExpressionSchema.nullable()).max(10),
  z.array(modifierValueExpressionSchema.nullable()).max(10),
  z.array(modifierValueExpressionSchema.nullable()).max(10),
  z.array(modifierValueExpressionSchema.nullable()).max(10),
  z.array(modifierValueExpressionSchema.nullable()).max(10),
]);
export type ModifierValueExpression = z.infer<typeof modifierValueExpressionSchema>;

const canonicalTargetPolicySchema = z.enum([
  'sourceSelf',
  'partyMember',
  'partyOther',
  'enemy',
  'attackerNpCard',
  'unresolved',
]);
export type CanonicalTargetPolicy = z.infer<typeof canonicalTargetPolicySchema>;

const effectContributionScopeSchema = z.enum([
  'personal',
  'partyWide',
  'partyOther',
  'enemyApplied',
]);
export type CanonicalEffectContributionScope = z.infer<typeof effectContributionScopeSchema>;

const canonicalValueSetsSchema = z.tuple([
  z.array(z.number().nullable()).max(10),
  z.array(z.number().nullable()).max(10),
  z.array(z.number().nullable()).max(10),
  z.array(z.number().nullable()).max(10),
  z.array(z.number().nullable()).max(10),
]);
export type CanonicalValueSets = z.infer<typeof canonicalValueSetsSchema>;

const canonicalInputBaseSchema = z.object({
  key: z.string().min(1),
  owner: z.enum(['attacker', 'target', 'field', 'party', 'source']),
  label: z.string().min(1),
  description: z.string().min(1),
  minimum: z.number().int(),
  maximum: z.number().int(),
  step: z.number().int().positive(),
  defaultReason: z.string().min(1).nullable(),
});

const fixedCanonicalInputDefinitionSchema = canonicalInputBaseSchema.extend({
  kind: z.enum([
    'currentTurn',
    'criticalStars',
    'effectStackCount',
    'fieldActorCount',
    'availableSkillCount',
    'friendshipLevel',
    'sourceHpPermille',
    'procSuccessCount',
  ]),
  defaultValue: z.number().int().nullable(),
});

const actorCountPredicateAtomSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('trait'), trait: signedTraitSchema }),
  z.object({ kind: z.literal('actorProperty'), property: z.literal('inBattle') }),
]);

const actorCountPredicateSchema = z.discriminatedUnion('counting', [
  z.object({
    counting: z.literal('matchingTraits'),
    atoms: z.array(actorCountPredicateAtomSchema).min(1),
  }),
  z.object({
    counting: z.literal('matchingClauses'),
    clauses: z.array(z.array(actorCountPredicateAtomSchema).min(1)).min(1),
  }),
]);

const matchingActorCountCanonicalInputDefinitionSchema = canonicalInputBaseSchema.extend({
  kind: z.literal('matchingActorCount'),
  owner: z.literal('field'),
  defaultValue: z.number().int().nullable(),
  countSemantics: z.object({
    population: z.enum(['allActors', 'allies', 'enemies']),
    aliveOnly: z.boolean(),
    sourcePredicate: actorCountPredicateSchema.nullable(),
    otherPredicate: actorCountPredicateSchema.nullable(),
  }),
});

export const canonicalInputDefinitionSchema = z.discriminatedUnion('kind', [
  fixedCanonicalInputDefinitionSchema,
  matchingActorCountCanonicalInputDefinitionSchema,
]);
export type CanonicalInputDefinition = z.infer<typeof canonicalInputDefinitionSchema>;
export type ActorCountPredicate = z.infer<typeof actorCountPredicateSchema>;

const effectInputQuantityConditionSchema = z.object({
  inputKey: z.string().min(1),
  comparison: z.enum(['lessThan', 'atMost', 'equal', 'atLeast', 'greaterThan']),
  value: z.number().int(),
});

const valuedExecutionFields = {
  targetPolicy: canonicalTargetPolicySchema,
  contributionScope: effectContributionScopeSchema,
  expectedRecipient: z.enum(['attacker', 'target']),
  targetMismatch: z.enum(['ignore', 'unsupported']),
  values: canonicalValueSetsSchema,
  limitBreakValues: canonicalValueSetsSchema.optional(),
  valueExpressions: modifierValueExpressionSetsSchema,
  limitBreakValueExpressions: modifierValueExpressionSetsSchema.optional(),
  semanticSupport: z.enum(['supported', 'unresolved']),
};
const effectExecutionOperationSchema = z.union([
  z.object({
    kind: z.literal('damageModifier'),
    modifier: z.enum([
      'attackBuff',
      'cardBuff',
      'npDamageBuff',
      'powerMod',
      'flatDamage',
      'defenseBuff',
      'cardResistance',
      'npResistance',
    ]),
    sign: z.union([z.literal(1), z.literal(-1)]),
    card: z.enum(['buster', 'arts', 'quick']).nullable(),
    ...valuedExecutionFields,
  }),
  z.object({
    kind: z.literal('modifierRateChange'),
    modifier: z.literal('npDamageBuff'),
    ...valuedExecutionFields,
  }),
  z.object({
    kind: z.enum(['ignoreDefense', 'ignoreDamageCut']),
    targetPolicy: canonicalTargetPolicySchema,
    contributionScope: effectContributionScopeSchema,
    expectedRecipient: z.enum(['attacker', 'target']),
    targetMismatch: z.enum(['ignore', 'unsupported']),
    semanticSupport: z.enum(['supported', 'unresolved']),
  }),
  z.object({
    kind: z.literal('selectNoblePhantasmVariant'),
    variant: z.object({
      actorFormId: z.object({
        actorId: z.string().min(1),
        limitCount: z.number().int().nonnegative(),
      }),
      noblePhantasmId: z.string().min(1),
    }),
  }),
  z.object({
    kind: z.literal('transformActorForm'),
    targetFormId: z.object({
      actorId: z.string().min(1),
      limitCount: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    kind: z.literal('contextMutation'),
    mutation: z.enum(['addTrait', 'removeTrait', 'suppressInitialTrait']),
    scope: z.enum(['field', 'recipientState']),
    targetPolicy: canonicalTargetPolicySchema,
    contributionScope: effectContributionScopeSchema,
    trait: z.string().min(1),
    damageRelevant: z.boolean(),
  }),
  z.object({
    kind: z.literal('contextMutation'),
    mutation: z.literal('addQuantity'),
    quantity: z.literal('battlePointPhase'),
    subjectId: z.string().min(1),
    amount: z.number().int(),
    applicationTiming: z.enum(['duringExecution', 'representedByCurrentInput']),
    damageRelevant: z.boolean(),
  }),
  z.object({ kind: z.literal('nonDamage') }),
  z.object({
    kind: z.literal('unresolved'),
    targetPolicy: canonicalTargetPolicySchema,
    reason: z.enum(['contextReference', 'operationSemantics', 'targetPolicy']),
    damageRelevant: z.boolean(),
  }),
]);
export type EffectExecutionOperation = z.infer<typeof effectExecutionOperationSchema>;

const procRateSetsSchema = z.tuple([
  z.array(z.number().int().min(0).max(1000)).max(10),
  z.array(z.number().int().min(0).max(1000)).max(10),
  z.array(z.number().int().min(0).max(1000)).max(10),
  z.array(z.number().int().min(0).max(1000)).max(10),
  z.array(z.number().int().min(0).max(1000)).max(10),
]);

const effectProcSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('guaranteed') }),
  z.object({ kind: z.literal('singleRoll'), ratePermille: procRateSetsSchema }),
  z.object({
    kind: z.literal('independentRolls'),
    ratePermille: procRateSetsSchema,
    groupKey: z.string().min(1),
    index: z.number().int().nonnegative(),
    total: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('chainedRolls'),
    ratePermille: procRateSetsSchema,
    seriesKey: z.string().min(1),
    index: z.number().int().nonnegative(),
    maximumSuccesses: z.number().int().positive(),
  }),
]);
export type EffectProc = z.infer<typeof effectProcSchema>;

const effectProcSelectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('effectInclusion') }),
  z.object({
    kind: z.literal('successCount'),
    inputKey: z.string().min(1),
    defaultSelection: z.enum(['minimum', 'maximum']),
  }),
]);
export type EffectProcSelection = z.infer<typeof effectProcSelectionSchema>;

const atlasEffectEvidenceSchema = z.object({
  functionType: z.string(),
  target: z.string(),
  parameterSets: effectParameterSetsSchema,
  limitBreakParameterSets: effectParameterSetsSchema.optional(),
  parameterSemantics: effectParameterSemanticsSchema,
  unresolvedSemanticKeys: z.array(z.string().min(1)),
  buffTypes: z.array(z.string()),
  buffRateTargets: z.array(z.string()),
  buffConditionKeys: z.array(z.string().min(1)),
});
export type AtlasEffectEvidence = z.infer<typeof atlasEffectEvidenceSchema>;

export const masterEffectSchema = z.object({
  id: z.string(),
  occurrenceId: z.string().min(1),
  label: z.string(),
  availability: z.enum(['allLimitBreakStates', 'maximumLimitBreakOnly']),
  inclusionPolicy: z.object({ default: z.enum(['include', 'exclude']) }),
  gameActivation: z.enum(['constant', 'skillUse', 'npBeforeDamage', 'derived']),
  proc: effectProcSchema,
  procSelection: effectProcSelectionSchema,
  interaction: z
    .discriminatedUnion('kind', [
      z.object({
        kind: z.literal('inputThresholdSeries'),
        key: z.string().min(1),
      }),
      z.object({
        kind: z.literal('quantityThresholdSeries'),
        key: z.string().min(1),
        quantity: z.literal('attackerHpPermille'),
      }),
      z.object({
        kind: z.literal('procSeries'),
        key: z.string().min(1),
      }),
    ])
    .nullable(),
  choice: z
    .object({
      family: z.enum(['actSet', 'actSelectIndex']),
      candidate: z.number().int(),
    })
    .nullable(),
  triggerScope: z.enum(['commandCard', 'commandCardAttack']).nullable(),
  operationTrigger: z
    .object({ kind: z.literal('functionPosition'), position: z.number().int() })
    .nullable(),
  operationReference: z
    .object({
      kind: z.literal('resolvedSkill'),
      skillId: z.string().min(1),
      levelSource: z.enum(['skillLevelParameter', 'secondaryValueParameter']),
      defaultLevel: z.number().int().min(1).max(10),
    })
    .nullable(),
  stateIdentity: z
    .object({ kind: z.literal('linkedTraitFamily'), key: z.string().min(1) })
    .nullable(),
  quantityConditions: z.array(effectQuantityConditionSchema),
  sourceQuantityConditions: z.array(effectSourceQuantityConditionSchema),
  inputDefinitions: z.array(canonicalInputDefinitionSchema),
  inputQuantityConditions: z.array(effectInputQuantityConditionSchema),
  traitReadPolicy: traitReadPolicySchema,
  conditions: effectConditionsSchema,
  conditionTargetPolicy: canonicalTargetPolicySchema,
  execution: z.array(effectExecutionOperationSchema).min(1),
  atlasEvidence: atlasEffectEvidenceSchema,
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

export const mysticCodeMasterSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  maxLevel: z.number().int().min(1).max(10),
  imageKey: z.string().nullable(),
  skills: z.array(masterSkillSchema).min(1).max(3),
});
export type MysticCodeMaster = z.infer<typeof mysticCodeMasterSchema>;

type DamageTraitReference =
  { kind: 'trait'; name: string } | { kind: 'targetPredicate'; predicate: TargetPredicate };
const traitReferenceSchema: z.ZodType<DamageTraitReference> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('trait'), name: z.string().min(1) }),
  z.object({ kind: z.literal('targetPredicate'), predicate: targetPredicateSchema }),
]);

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
  stateTraitNames: z.array(z.string().min(1)),
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
      maximumBattlePointPhase: z.number().int().nonnegative(),
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

export const actorFormIdSchema = z.object({
  actorId: z.string().min(1),
  limitCount: z.number().int().nonnegative(),
});
export type ActorFormId = z.infer<typeof actorFormIdSchema>;

export const noblePhantasmVariantRefSchema = z.object({
  actorFormId: actorFormIdSchema,
  noblePhantasmId: z.string().min(1),
});
export type NoblePhantasmVariantRef = z.infer<typeof noblePhantasmVariantRefSchema>;

const noblePhantasmVariantBaseSchema = z.object({
  canonicalId: z.string().regex(/^[a-f0-9]{64}$/),
  ref: noblePhantasmVariantRefSchema,
  name: z.string(),
  priority: z.number().int(),
  effects: z.array(masterEffectSchema.extend({ timing: z.enum(['beforeDamage', 'afterDamage']) })),
});
export const noblePhantasmVariantSchema = z.discriminatedUnion('kind', [
  noblePhantasmVariantBaseSchema.extend({
    kind: z.literal('attack'),
    card: z.enum(['buster', 'arts', 'quick']),
    targetScope: z.enum(['single', 'all']),
    damage: z.array(npDamageSpecSchema).min(1),
  }),
  noblePhantasmVariantBaseSchema.extend({
    kind: z.literal('nonAttack'),
  }),
]);
export type NoblePhantasmVariant = z.infer<typeof noblePhantasmVariantSchema>;
export type AttackNoblePhantasmVariant = Extract<NoblePhantasmVariant, { kind: 'attack' }>;
export type NoblePhantasmVariantCanonicalId = NoblePhantasmVariant['canonicalId'];

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, canonicalJsonValue(nested)]),
    );
  return value;
}

type CanonicalNoblePhantasmVariantSemantics =
  | Pick<
      AttackNoblePhantasmVariant,
      'kind' | 'ref' | 'priority' | 'card' | 'targetScope' | 'damage' | 'effects'
    >
  | Pick<
      Extract<NoblePhantasmVariant, { kind: 'nonAttack' }>,
      'kind' | 'ref' | 'priority' | 'effects'
    >;

export function canonicalNoblePhantasmVariantSemanticsKey(
  variant: CanonicalNoblePhantasmVariantSemantics,
): string {
  return JSON.stringify(
    canonicalJsonValue({
      kind: variant.kind,
      noblePhantasmId: variant.ref.noblePhantasmId,
      priority: variant.priority,
      ...(variant.kind === 'attack'
        ? { card: variant.card, targetScope: variant.targetScope, damage: variant.damage }
        : {}),
      effects: variant.effects,
    }),
  );
}

export const noblePhantasmVariantGroupSchema = z.object({
  id: z.string().min(1),
  baseVariant: noblePhantasmVariantRefSchema,
  variants: z.array(noblePhantasmVariantSchema).min(1),
});
export type NoblePhantasmVariantGroup = z.infer<typeof noblePhantasmVariantGroupSchema>;

const actorFormNodeSchema = z.object({
  id: actorFormIdSchema,
  name: z.string(),
  traits: z.array(z.string()),
  skillIds: z.array(z.string().min(1)),
  passiveIds: z.array(z.string().min(1)),
  baseNoblePhantasmVariant: noblePhantasmVariantRefSchema.nullable(),
});

const actorFormTransitionSchema = z.object({
  id: z.string().min(1),
  from: actorFormIdSchema,
  to: actorFormIdSchema,
  direction: z.enum(['forward', 'reverse']),
  activation: z.object({
    sourceKind: z.enum(['skill', 'passive', 'noblePhantasm']),
    sourceId: z.string().min(1),
    effectOccurrenceIds: z.array(z.string().min(1)).min(1),
  }),
  operations: z.array(effectExecutionOperationSchema).min(2),
});

export const actorFormGraphSchema = z.object({
  actorId: z.string().min(1),
  forms: z.array(actorFormNodeSchema).min(1),
  initialFormIds: z.array(actorFormIdSchema).min(1),
  defaultInitialFormId: actorFormIdSchema,
  transitions: z.array(actorFormTransitionSchema),
});
export type ActorFormGraph = z.infer<typeof actorFormGraphSchema>;
export type ActorFormNode = ActorFormGraph['forms'][number];
export type ActorFormTransition = ActorFormGraph['transitions'][number];

export const servantMasterSchema = z.object({
  id: z.string(),
  name: z.string(),
  classId: z.string(),
  attribute: z.enum(['human', 'earth', 'sky', 'star', 'beast', 'unknown']).default('unknown'),
  rarity: z.number().int().min(0).max(5),
  atkByLevel: z.record(z.string(), z.number().int().nonnegative()),
  actorFormGraph: actorFormGraphSchema,
  baseNoblePhantasmGroupId: z.string().min(1).nullable(),
  noblePhantasmVariantGroups: z.array(noblePhantasmVariantGroupSchema),
  traits: z.array(z.string()),
  predicates: z.array(targetPredicateSchema).default([]),
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

export function naturalServantLevel(rarity: ServantMaster['rarity']): number {
  switch (rarity) {
    case 0:
    case 2:
      return 65;
    case 1:
      return 60;
    case 3:
      return 70;
    case 4:
      return 80;
    case 5:
      return 90;
    default:
      throw new RangeError(`unsupported servant rarity:${String(rarity)}`);
  }
}

export function noblePhantasmVariantKey(ref: NoblePhantasmVariantRef): string {
  return JSON.stringify([ref.actorFormId.actorId, ref.actorFormId.limitCount, ref.noblePhantasmId]);
}

export function actorFormKey(id: ActorFormId): string {
  return JSON.stringify([id.actorId, id.limitCount]);
}

export function actorFormEquals(left: ActorFormId, right: ActorFormId): boolean {
  return left.actorId === right.actorId && left.limitCount === right.limitCount;
}

export interface ResolvedFormSkillUse {
  slot: 1 | 2 | 3;
  actorFormId: ActorFormId;
  skillId: string;
  transitionId: string | null;
}

export interface FormExecutionState {
  initialFormId: ActorFormId;
  currentFormId: ActorFormId;
  selectedNoblePhantasmVariant: NoblePhantasmVariantRef | null;
  usedSkillSlots: ReadonlySet<1 | 2 | 3>;
  appliedSkillUses: readonly ResolvedFormSkillUse[];
  transitions: readonly ActorFormTransition[];
}

export interface FormSkillSlotAction {
  skill: MasterSkill;
  transitions: readonly ActorFormTransition[];
  allowsNoTransition: boolean;
}

export function resolveFormSkillSlotAction(
  servant: Pick<ServantMaster, 'actorFormGraph' | 'skills'>,
  currentFormId: ActorFormId,
  slot: 1 | 2 | 3,
): FormSkillSlotAction {
  const skills = getSkillsForActorForm(servant, currentFormId).filter(
    (skill) => skill.slot === slot,
  );
  if (skills.length !== 1)
    throw new TypeError(`actor_form_skill_slot_unresolved:${actorFormKey(currentFormId)}:${slot}`);
  const skill = skills[0]!;
  const transitions = servant.actorFormGraph.transitions.filter(
    (transition) =>
      actorFormEquals(transition.from, currentFormId) &&
      transition.activation.sourceKind === 'skill' &&
      transition.activation.sourceId === skill.id,
  );
  const hasMandatoryTransition = transitions.some((transition) => {
    const effect = skill.effects.find(({ occurrenceId }) =>
      transition.activation.effectOccurrenceIds.includes(occurrenceId),
    );
    return effect?.choice === null;
  });
  return { skill, transitions, allowsNoTransition: !hasMandatoryTransition };
}

export function createFormExecutionState(
  servant: Pick<ServantMaster, 'actorFormGraph'>,
  initialFormId: ActorFormId,
): FormExecutionState {
  const initial = findActorForm(servant, initialFormId);
  if (
    !initial ||
    !servant.actorFormGraph.initialFormIds.some((id) => actorFormEquals(id, initialFormId))
  )
    throw new TypeError(`unknown_initial_actor_form:${actorFormKey(initialFormId)}`);
  return {
    initialFormId,
    currentFormId: initialFormId,
    selectedNoblePhantasmVariant: initial.baseNoblePhantasmVariant,
    usedSkillSlots: new Set(),
    appliedSkillUses: [],
    transitions: [],
  };
}

export function applyFormSkillSlotUse(
  servant: Pick<ServantMaster, 'actorFormGraph' | 'skills'>,
  state: FormExecutionState,
  slot: 1 | 2 | 3,
  transitionId: string | null,
): FormExecutionState {
  if (state.usedSkillSlots.has(slot)) throw new TypeError(`actor_form_skill_slot_reused:${slot}`);
  const action = resolveFormSkillSlotAction(servant, state.currentFormId, slot);
  const transition = transitionId
    ? action.transitions.find(({ id }) => id === transitionId)
    : undefined;
  if (transitionId && !transition)
    throw new TypeError(`actor_form_transition_unavailable:${transitionId}`);
  if (!transitionId && !action.allowsNoTransition)
    throw new TypeError(`mandatory_actor_form_transition_missing:${action.skill.id}`);
  const selectedNoblePhantasmVariant = transition
    ? transition.operations.reduce(
        (selected, operation) =>
          operation.kind === 'selectNoblePhantasmVariant' ? operation.variant : selected,
        state.selectedNoblePhantasmVariant,
      )
    : state.selectedNoblePhantasmVariant;
  return {
    ...state,
    currentFormId: transition?.to ?? state.currentFormId,
    selectedNoblePhantasmVariant,
    usedSkillSlots: new Set([...state.usedSkillSlots, slot]),
    appliedSkillUses: [
      ...state.appliedSkillUses,
      {
        slot,
        actorFormId: state.currentFormId,
        skillId: action.skill.id,
        transitionId: transition?.id ?? null,
      },
    ],
    transitions: transition ? [...state.transitions, transition] : state.transitions,
  };
}

export function getBaseNoblePhantasmGroup(
  servant: Pick<ServantMaster, 'baseNoblePhantasmGroupId' | 'noblePhantasmVariantGroups'>,
): NoblePhantasmVariantGroup | undefined {
  if (servant.baseNoblePhantasmGroupId === null) return undefined;
  return servant.noblePhantasmVariantGroups.find(
    (group) => group.id === servant.baseNoblePhantasmGroupId,
  );
}

export function findNoblePhantasmVariant(
  servant: Pick<ServantMaster, 'noblePhantasmVariantGroups'>,
  ref: NoblePhantasmVariantRef,
): NoblePhantasmVariant | undefined {
  const key = noblePhantasmVariantKey(ref);
  return servant.noblePhantasmVariantGroups
    .flatMap((group) => group.variants)
    .find((variant) => noblePhantasmVariantKey(variant.ref) === key);
}

export function getNoblePhantasmVariants(
  servant: Pick<ServantMaster, 'noblePhantasmVariantGroups'>,
): NoblePhantasmVariant[] {
  return servant.noblePhantasmVariantGroups.flatMap((group) => group.variants);
}

export function getAttackNoblePhantasmVariants(
  servant: Pick<ServantMaster, 'noblePhantasmVariantGroups'>,
): AttackNoblePhantasmVariant[] {
  return getNoblePhantasmVariants(servant).filter(
    (variant): variant is AttackNoblePhantasmVariant => variant.kind === 'attack',
  );
}

export function getSelectableNoblePhantasmVariants(
  servant: Pick<
    ServantMaster,
    | 'actorFormGraph'
    | 'baseNoblePhantasmGroupId'
    | 'noblePhantasmVariantGroups'
    | 'skills'
    | 'passives'
  >,
): NoblePhantasmVariant[] {
  const group = getBaseNoblePhantasmGroup(servant);
  if (!group) return [];
  const keys = new Set(
    getInitialActorForms(servant).flatMap(({ baseNoblePhantasmVariant }) =>
      baseNoblePhantasmVariant ? [noblePhantasmVariantKey(baseNoblePhantasmVariant)] : [],
    ),
  );
  for (const source of [...servant.skills, ...servant.passives])
    for (const effect of source.effects)
      for (const operation of effect.execution)
        if (operation.kind === 'selectNoblePhantasmVariant')
          keys.add(noblePhantasmVariantKey(operation.variant));
  return group.variants.filter((variant) => keys.has(noblePhantasmVariantKey(variant.ref)));
}

export function getBaseNoblePhantasmVariant(
  servant: Pick<ServantMaster, 'baseNoblePhantasmGroupId' | 'noblePhantasmVariantGroups'>,
): NoblePhantasmVariant | undefined {
  const group = getBaseNoblePhantasmGroup(servant);
  return group?.variants.find(
    (variant) =>
      noblePhantasmVariantKey(variant.ref) === noblePhantasmVariantKey(group.baseVariant),
  );
}

export function findActorForm(servant: Pick<ServantMaster, 'actorFormGraph'>, id: ActorFormId) {
  const key = actorFormKey(id);
  return servant.actorFormGraph.forms.find((form) => actorFormKey(form.id) === key);
}

export function getInitialActorForms(servant: Pick<ServantMaster, 'actorFormGraph'>) {
  const keys = new Set(servant.actorFormGraph.initialFormIds.map(actorFormKey));
  return servant.actorFormGraph.forms.filter((form) => keys.has(actorFormKey(form.id)));
}

export function getDefaultInitialActorForm(servant: Pick<ServantMaster, 'actorFormGraph'>) {
  return findActorForm(servant, servant.actorFormGraph.defaultInitialFormId);
}

export function getBaseNoblePhantasmVariantForForm(
  servant: Pick<ServantMaster, 'actorFormGraph' | 'noblePhantasmVariantGroups'>,
  actorFormId: ActorFormId,
): NoblePhantasmVariant | undefined {
  const ref = findActorForm(servant, actorFormId)?.baseNoblePhantasmVariant;
  return ref ? findNoblePhantasmVariant(servant, ref) : undefined;
}

export function getSkillsForActorForm(
  servant: Pick<ServantMaster, 'actorFormGraph' | 'skills'>,
  actorFormId: ActorFormId,
) {
  const ids = new Set(findActorForm(servant, actorFormId)?.skillIds ?? []);
  return servant.skills.filter(({ id }) => ids.has(id));
}

export function getPassivesForActorForm(
  servant: Pick<ServantMaster, 'actorFormGraph' | 'passives'>,
  actorFormId: ActorFormId,
) {
  const ids = new Set(findActorForm(servant, actorFormId)?.passiveIds ?? []);
  return servant.passives.filter(({ id }) => ids.has(id));
}

export function getBaseAttackNoblePhantasmVariant(
  servant: Pick<ServantMaster, 'baseNoblePhantasmGroupId' | 'noblePhantasmVariantGroups'>,
): AttackNoblePhantasmVariant | undefined {
  const variant = getBaseNoblePhantasmVariant(servant);
  return variant?.kind === 'attack' ? variant : undefined;
}

export function getPrimaryNpDamage(
  servant: Pick<ServantMaster, 'baseNoblePhantasmGroupId' | 'noblePhantasmVariantGroups'>,
): NpDamageSpec | undefined {
  return getBaseAttackNoblePhantasmVariant(servant)?.damage[0];
}

export function getPrimaryNpPresentation(
  servant: Pick<ServantMaster, 'baseNoblePhantasmGroupId' | 'noblePhantasmVariantGroups'>,
): {
  card: AttackNoblePhantasmVariant['card'];
  target: NpDamageSpec['target'];
} | null {
  const noblePhantasm = getBaseAttackNoblePhantasmVariant(servant);
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
  effects: z.array(masterEffectSchema).default([]),
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
const masterSnapshotBaseSchema = z.object({
  version: z.string(),
  normalization: z.object({
    attackFunctions: z.object({
      sourceCount: z.number().int().nonnegative(),
      includedCount: z.number().int().nonnegative(),
      expansionCount: z.number().int().nonnegative(),
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
  targetSemantics: z.object({
    execution: z.object({
      classIdentities: z.array(canonicalTargetClassIdSchema),
      attributeIdentities: z.array(canonicalTargetAttributeSchema),
      families: z.array(
        z.object({
          familyId: canonicalTargetFamilyIdSchema,
          membershipConstraints: z.object({ kind: z.literal('independent') }),
        }),
      ),
    }),
    evidence: z.object({
      families: z.array(
        z.object({
          familyId: canonicalTargetFamilyIdSchema,
          atlasTargets: z.array(
            z.object({
              targetId: z.string().min(1),
              rawClassName: z.string().min(1),
            }),
          ),
          sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
        }),
      ),
    }),
  }),
  servants: z.array(servantMasterSchema),
  craftEssences: z.array(craftEssenceMasterSchema),
  mysticCodes: z.array(mysticCodeMasterSchema),
  materials: z.array(materialMasterSchema),
});
export type CanonicalTargetDomain = z.infer<
  typeof masterSnapshotBaseSchema
>['targetSemantics']['execution'];
export type TargetFamilyEvidence = z.infer<
  typeof masterSnapshotBaseSchema
>['targetSemantics']['evidence']['families'][number];
export const masterSnapshotSchema = masterSnapshotBaseSchema.superRefine((snapshot, context) => {
  const validateProcSelection = (effects: readonly MasterEffect[], path: (string | number)[]) => {
    effects.forEach((effect, effectIndex) => {
      const effectPath = [...path, effectIndex];
      if (effect.proc.kind !== 'chainedRolls') {
        if (effect.procSelection.kind !== 'effectInclusion')
          context.addIssue({
            code: 'custom',
            message: 'non-chained proc requires effectInclusion selection',
            path: [...effectPath, 'procSelection'],
          });
        return;
      }
      if (effect.procSelection.kind !== 'successCount') {
        context.addIssue({
          code: 'custom',
          message: 'chainedRolls requires successCount selection',
          path: [...effectPath, 'procSelection'],
        });
        return;
      }
      const procSelection = effect.procSelection;
      const expectedDefaultSelection =
        effect.gameActivation === 'npBeforeDamage' || effect.gameActivation === 'constant'
          ? 'maximum'
          : 'minimum';
      const definition = effect.inputDefinitions.find(
        (input) => input.key === procSelection.inputKey,
      );
      if (
        definition?.kind !== 'procSuccessCount' ||
        definition.minimum !== 0 ||
        definition.maximum !== effect.proc.maximumSuccesses ||
        procSelection.defaultSelection !== expectedDefaultSelection ||
        definition.defaultValue !==
          (procSelection.defaultSelection === 'maximum' ? definition.maximum : 0) ||
        effect.interaction?.kind !== 'procSeries' ||
        effect.interaction.key !== procSelection.inputKey ||
        effect.choice !== null
      )
        context.addIssue({
          code: 'custom',
          message: 'invalid chained proc selection contract',
          path: [...effectPath, 'procSelection'],
        });
    });
  };
  const rejectMlbOnly = (effects: readonly MasterEffect[], path: (string | number)[]) => {
    effects.forEach((effect, effectIndex) => {
      if (effect.availability !== 'maximumLimitBreakOnly') return;
      context.addIssue({
        code: 'custom',
        message: 'maximumLimitBreakOnly is only valid for craft essence effects',
        path: [...path, effectIndex, 'availability'],
      });
    });
  };
  snapshot.servants.forEach((servant, servantIndex) => {
    servant.skills.forEach((skill, skillIndex) => {
      const path = ['servants', servantIndex, 'skills', skillIndex, 'effects'];
      rejectMlbOnly(skill.effects, path);
      validateProcSelection(skill.effects, path);
    });
    servant.passives.forEach((skill, skillIndex) => {
      const path = ['servants', servantIndex, 'passives', skillIndex, 'effects'];
      rejectMlbOnly(skill.effects, path);
      validateProcSelection(skill.effects, path);
    });
    const graph = servant.actorFormGraph;
    const formIds = new Set(graph.forms.map((form) => actorFormKey(form.id)));
    const initialFormKeys = graph.initialFormIds.map(actorFormKey);
    if (new Set(initialFormKeys).size !== initialFormKeys.length)
      context.addIssue({
        code: 'custom',
        message: 'actor form graph contains duplicate initial forms',
        path: ['servants', servantIndex, 'actorFormGraph', 'initialFormIds'],
      });
    if (
      initialFormKeys.some((key) => !formIds.has(key)) ||
      !initialFormKeys.includes(actorFormKey(graph.defaultInitialFormId))
    )
      context.addIssue({
        code: 'custom',
        message: 'actor form graph initial/default form is not a graph node',
        path: ['servants', servantIndex, 'actorFormGraph'],
      });
    const skillIds = new Set(servant.skills.map(({ id }) => id));
    const passiveIds = new Set(servant.passives.map(({ id }) => id));
    const groupIds = new Set<string>();
    const variantKeys = new Set<string>();
    const variantSemanticsByCanonicalId = new Map<string, string>();
    const variantCanonicalIdBySemantics = new Map<string, string>();
    servant.noblePhantasmVariantGroups.forEach((group, groupIndex) => {
      if (groupIds.has(group.id))
        context.addIssue({
          code: 'custom',
          message: 'duplicate noble phantasm variant group',
          path: ['servants', servantIndex, 'noblePhantasmVariantGroups', groupIndex, 'id'],
        });
      groupIds.add(group.id);
      const memberKeys = new Set(
        group.variants.map((variant) => noblePhantasmVariantKey(variant.ref)),
      );
      if (!memberKeys.has(noblePhantasmVariantKey(group.baseVariant)))
        context.addIssue({
          code: 'custom',
          message: 'base noble phantasm variant is not a group member',
          path: ['servants', servantIndex, 'noblePhantasmVariantGroups', groupIndex, 'baseVariant'],
        });
      group.variants.forEach((variant, variantIndex) => {
        const variantPath = [
          'servants',
          servantIndex,
          'noblePhantasmVariantGroups',
          groupIndex,
          'variants',
          variantIndex,
        ];
        const key = noblePhantasmVariantKey(variant.ref);
        if (!formIds.has(actorFormKey(variant.ref.actorFormId)))
          context.addIssue({
            code: 'custom',
            message: 'noble phantasm variant references an unknown actor form',
            path: [...variantPath, 'ref', 'actorFormId'],
          });
        if (variantKeys.has(key))
          context.addIssue({
            code: 'custom',
            message: 'duplicate form-qualified noble phantasm variant',
            path: [...variantPath, 'ref'],
          });
        variantKeys.add(key);
        const canonicalId = variant.canonicalId;
        const semanticsKey = canonicalNoblePhantasmVariantSemanticsKey(variant);
        const canonicalSemantics = variantSemanticsByCanonicalId.get(canonicalId);
        if (canonicalSemantics !== undefined && canonicalSemantics !== semanticsKey)
          context.addIssue({
            code: 'custom',
            message: 'conflicting canonical noble phantasm variant semantics',
            path: [...variantPath, 'ref', 'noblePhantasmId'],
          });
        else variantSemanticsByCanonicalId.set(canonicalId, semanticsKey);
        const semanticCanonicalId = variantCanonicalIdBySemantics.get(semanticsKey);
        if (semanticCanonicalId !== undefined && semanticCanonicalId !== canonicalId)
          context.addIssue({
            code: 'custom',
            message: 'equivalent noble phantasm semantics use different canonical IDs',
            path: [...variantPath, 'canonicalId'],
          });
        else variantCanonicalIdBySemantics.set(semanticsKey, canonicalId);
        if (variant.kind === 'attack') {
          if (variant.damage.some((damage) => damage.target !== variant.targetScope))
            context.addIssue({
              code: 'custom',
              message: 'attack target scope differs from its damage function',
              path: [...variantPath, 'targetScope'],
            });
        }
        const effectsPath = [...variantPath, 'effects'];
        rejectMlbOnly(variant.effects, effectsPath);
        validateProcSelection(variant.effects, effectsPath);
      });
    });
    if (
      servant.baseNoblePhantasmGroupId !== null &&
      !groupIds.has(servant.baseNoblePhantasmGroupId)
    )
      context.addIssue({
        code: 'custom',
        message: 'base noble phantasm group does not exist',
        path: ['servants', servantIndex, 'baseNoblePhantasmGroupId'],
      });
    if (servant.baseNoblePhantasmGroupId === null && servant.noblePhantasmVariantGroups.length > 0)
      context.addIssue({
        code: 'custom',
        message: 'noble phantasm variants require a base group',
        path: ['servants', servantIndex, 'baseNoblePhantasmGroupId'],
      });
    graph.forms.forEach((form, formIndex) => {
      const path = ['servants', servantIndex, 'actorFormGraph', 'forms', formIndex];
      if (form.skillIds.some((id) => !skillIds.has(id)))
        context.addIssue({
          code: 'custom',
          message: 'actor form references an unknown skill',
          path: [...path, 'skillIds'],
        });
      if (form.passiveIds.some((id) => !passiveIds.has(id)))
        context.addIssue({
          code: 'custom',
          message: 'actor form references an unknown passive',
          path: [...path, 'passiveIds'],
        });
      if (
        form.baseNoblePhantasmVariant &&
        (!variantKeys.has(noblePhantasmVariantKey(form.baseNoblePhantasmVariant)) ||
          !actorFormEquals(form.id, form.baseNoblePhantasmVariant.actorFormId))
      )
        context.addIssue({
          code: 'custom',
          message: 'actor form base noble phantasm is not a form-qualified variant',
          path: [...path, 'baseNoblePhantasmVariant'],
        });
    });
    const operationRefs = [
      ...servant.skills.flatMap((skill) => skill.effects),
      ...servant.passives.flatMap((skill) => skill.effects),
      ...servant.noblePhantasmVariantGroups.flatMap((group) =>
        group.variants.flatMap((variant) => variant.effects),
      ),
    ].flatMap((effect) => effect.execution);
    for (const operation of operationRefs) {
      if (
        operation.kind === 'transformActorForm' &&
        !formIds.has(actorFormKey(operation.targetFormId))
      )
        context.addIssue({
          code: 'custom',
          message: 'actor form transition references an unknown form',
          path: ['servants', servantIndex, 'actorFormGraph', 'forms'],
        });
      if (
        operation.kind === 'selectNoblePhantasmVariant' &&
        !variantKeys.has(noblePhantasmVariantKey(operation.variant))
      )
        context.addIssue({
          code: 'custom',
          message: 'noble phantasm selection references an unknown variant',
          path: ['servants', servantIndex, 'noblePhantasmVariantGroups'],
        });
    }
    const transitionIds = new Set<string>();
    for (const [transitionIndex, transition] of graph.transitions.entries()) {
      const path = ['servants', servantIndex, 'actorFormGraph', 'transitions', transitionIndex];
      if (transitionIds.has(transition.id))
        context.addIssue({ code: 'custom', message: 'duplicate actor form transition', path });
      transitionIds.add(transition.id);
      if (!formIds.has(actorFormKey(transition.from)) || !formIds.has(actorFormKey(transition.to)))
        context.addIssue({
          code: 'custom',
          message: 'transition references an unknown form',
          path,
        });
      const source = (() => {
        switch (transition.activation.sourceKind) {
          case 'skill':
            return servant.skills.find(({ id }) => id === transition.activation.sourceId);
          case 'passive':
            return servant.passives.find(({ id }) => id === transition.activation.sourceId);
          case 'noblePhantasm':
            return servant.noblePhantasmVariantGroups
              .flatMap(({ variants }) => variants)
              .find(
                (variant) =>
                  variant.ref.noblePhantasmId === transition.activation.sourceId &&
                  actorFormEquals(variant.ref.actorFormId, transition.from),
              );
        }
      })();
      const effects = transition.activation.effectOccurrenceIds.map((occurrenceId) =>
        source?.effects.find((effect) => effect.occurrenceId === occurrenceId),
      );
      if (
        effects.some((effect) => !effect) ||
        JSON.stringify(effects.flatMap((effect) => effect?.execution ?? [])) !==
          JSON.stringify(transition.operations)
      )
        context.addIssue({
          code: 'custom',
          message: 'transition activation does not resolve to its atomic operation group',
          path,
        });
    }
  });
  snapshot.mysticCodes.forEach((code, codeIndex) =>
    code.skills.forEach((skill, skillIndex) => {
      const path = ['mysticCodes', codeIndex, 'skills', skillIndex, 'effects'];
      rejectMlbOnly(skill.effects, path);
      validateProcSelection(skill.effects, path);
    }),
  );
  snapshot.craftEssences.forEach((craftEssence, craftEssenceIndex) => {
    validateProcSelection(craftEssence.effects, ['craftEssences', craftEssenceIndex, 'effects']);
    craftEssence.effects.forEach((effect, effectIndex) =>
      effect.execution.forEach((operation, operationIndex) => {
        if (operation.kind !== 'damageModifier' && operation.kind !== 'modifierRateChange') return;
        if (operation.limitBreakValues && operation.limitBreakValueExpressions) return;
        context.addIssue({
          code: 'custom',
          message: 'craft essence valued operations require explicit limit-break values',
          path: [
            'craftEssences',
            craftEssenceIndex,
            'effects',
            effectIndex,
            'execution',
            operationIndex,
          ],
        });
      }),
    );
  });
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
    for (const [origin, skills] of [
      ['skill', servant.skills],
      ['passive', servant.passives],
      [
        'np',
        servant.noblePhantasmVariantGroups.flatMap((group) =>
          group.variants.map((variant) => ({
            id: noblePhantasmVariantKey(variant.ref),
            effects: variant.effects,
          })),
        ),
      ],
    ] as const)
      for (const skill of skills) {
        const occurrenceIds = new Set<string>();
        for (const effect of skill.effects) {
          if (occurrenceIds.has(effect.occurrenceId))
            errors.push(
              `duplicate effect occurrence:${servant.id}:${origin}:${skill.id}:${effect.occurrenceId}`,
            );
          occurrenceIds.add(effect.occurrenceId);
        }
      }
  }
  const mysticCodeIds = new Set<string>();
  for (const mysticCode of parsed.data.mysticCodes) {
    if (mysticCodeIds.has(mysticCode.id)) errors.push(`duplicate mystic code:${mysticCode.id}`);
    mysticCodeIds.add(mysticCode.id);
    for (const skill of mysticCode.skills) {
      const occurrenceIds = new Set<string>();
      for (const effect of skill.effects) {
        if (occurrenceIds.has(effect.occurrenceId))
          errors.push(
            `duplicate effect occurrence:mysticCode:${mysticCode.id}:${skill.id}:${effect.occurrenceId}`,
          );
        occurrenceIds.add(effect.occurrenceId);
      }
    }
  }
  for (const craftEssence of parsed.data.craftEssences) {
    const occurrenceIds = new Set<string>();
    for (const effect of craftEssence.effects) {
      if (occurrenceIds.has(effect.occurrenceId))
        errors.push(
          `duplicate effect occurrence:craftEssence:${craftEssence.id}:${effect.occurrenceId}`,
        );
      occurrenceIds.add(effect.occurrenceId);
    }
  }
  const includedAttackFunctions = parsed.data.servants.reduce(
    (count, servant) =>
      count +
      servant.noblePhantasmVariantGroups.reduce(
        (groupCount, group) =>
          groupCount +
          group.variants.reduce(
            (variantCount, variant) =>
              variantCount + (variant.kind === 'attack' ? variant.damage.length : 0),
            0,
          ),
        0,
      ),
    0,
  );
  const attackCoverage = parsed.data.normalization.attackFunctions;
  if (attackCoverage.includedCount !== includedAttackFunctions)
    errors.push(
      `attack function included count:${String(attackCoverage.includedCount)}:${String(includedAttackFunctions)}`,
    );
  if (
    attackCoverage.sourceCount + attackCoverage.expansionCount !==
    attackCoverage.includedCount + attackCoverage.excluded.length
  )
    errors.push(
      `attack function source count:${String(attackCoverage.sourceCount + attackCoverage.expansionCount)}:${String(attackCoverage.includedCount + attackCoverage.excluded.length)}`,
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
