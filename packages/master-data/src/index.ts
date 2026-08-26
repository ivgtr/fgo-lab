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
  schemaVersion: z.literal(30),
  files: z.array(masterFileSchema).min(1),
  imagesEnabled: z.boolean(),
});
export type MasterManifest = z.infer<typeof masterManifestSchema>;

const signedTraitSchema = z.object({
  name: z.string().min(1),
  negative: z.boolean(),
});
export const traitConditionSchema = z.object({
  operator: z.enum(['any', 'all']),
  traits: z.array(signedTraitSchema),
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
    expectedRecipient: z.enum(['attacker', 'target']),
    targetMismatch: z.enum(['ignore', 'unsupported']),
    semanticSupport: z.enum(['supported', 'unresolved']),
  }),
  z.object({
    kind: z.literal('cardTypeMutation'),
    targetPolicy: z.literal('attackerNpCard'),
    card: z.enum(['buster', 'arts', 'quick']),
    stateTraits: z.array(z.string().min(1)),
    semanticSupport: z.enum(['supported', 'unresolved']),
  }),
  z.object({
    kind: z.literal('contextMutation'),
    mutation: z.enum(['addTrait', 'removeTrait', 'suppressInitialTrait']),
    scope: z.enum(['field', 'recipientState']),
    targetPolicy: canonicalTargetPolicySchema,
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
  mysticCodes: z.array(mysticCodeMasterSchema),
  materials: z.array(materialMasterSchema),
});
export const masterSnapshotSchema = masterSnapshotBaseSchema.superRefine((snapshot, context) => {
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
    servant.skills.forEach((skill, skillIndex) =>
      rejectMlbOnly(skill.effects, ['servants', servantIndex, 'skills', skillIndex, 'effects']),
    );
    servant.passives.forEach((skill, skillIndex) =>
      rejectMlbOnly(skill.effects, ['servants', servantIndex, 'passives', skillIndex, 'effects']),
    );
    servant.noblePhantasms.forEach((np, npIndex) =>
      rejectMlbOnly(np.effects, ['servants', servantIndex, 'noblePhantasms', npIndex, 'effects']),
    );
  });
  snapshot.mysticCodes.forEach((code, codeIndex) =>
    code.skills.forEach((skill, skillIndex) =>
      rejectMlbOnly(skill.effects, ['mysticCodes', codeIndex, 'skills', skillIndex, 'effects']),
    ),
  );
  snapshot.craftEssences.forEach((craftEssence, craftEssenceIndex) =>
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
    ),
  );
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
      ['np', servant.noblePhantasms],
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
