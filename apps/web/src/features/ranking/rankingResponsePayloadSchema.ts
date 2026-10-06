import { z } from 'zod';
import { sourceActivationPayloadSchema } from './conditionReadPayloadSchema';
import { isConsistentNpOcUseReceipt } from '@fgo-lab/calculation-application';
import {
  hpStateSchema,
  actorFormGraphSchema,
  actorFormIdSchema,
  canonicalInputDefinitionSchema,
  canonicalInputBaseSchema,
  populationCountSelectorSchema,
  masterEffectSchema,
  noblePhantasmEffectSchema,
  noblePhantasmVariantRefSchema,
  ocLifetimeLimitSchema,
} from '@fgo-lab/master-data';
import {
  activationFactSchema,
  calculationResultSchema,
  calculationScenarioSchema,
  damageResolutionInputSchema,
  preNoblePhantasmCommandSchema,
  rankingNpLevelSchema,
  rankingSelectionSchema,
  resolvedRankingBasisSchema,
} from '@fgo-lab/schema';
import type {
  AttackProfile,
  RankingPolicyDetail,
  RankingPolicyExclusion,
  RankingRowSummary,
} from '@fgo-lab/calculation-application';
import {
  contributionComponentSchema,
  contributionIdSchema,
  modifierSchema,
  operationOutcomeSchema,
  operationSourceSchema,
  rankingEffectResponseSchema,
} from './rankingEffectResponseSchema';

const card = z.enum(['buster', 'arts', 'quick']);
const target = z.enum(['single', 'all']);
const actorFormProfileIdSchema = z.object({
  servantLineageId: z.string(),
  semantics: z.object({
    skillSlots: z.array(z.object({ slot: z.number(), skillVariantId: z.string() })),
    passiveVariantIds: z.array(z.string()),
    intrinsicTraits: z.array(z.string()),
    baseNoblePhantasmVariantCanonicalId: z.string().nullable(),
    reachableAttackNoblePhantasmVariantCanonicalIds: z.array(z.string()),
  }),
});
const attackProfileSchema: z.ZodType<AttackProfile> = z.object({
  id: z.object({
    servantLineageId: z.string(),
    terminalActorFormProfileId: actorFormProfileIdSchema,
    attackNoblePhantasmVariantCanonicalId: z.string(),
  }),
  noblePhantasmVariant: noblePhantasmVariantRefSchema,
  noblePhantasmVariantCanonicalId: z.string(),
  targetScope: target,
  cardType: card,
  terminalFormLabel: z.string().nullable(),
});
const attackMetadata = {
  entryId: z.string(),
  servantId: z.string(),
  noblePhantasmVariant: noblePhantasmVariantRefSchema,
  noblePhantasmName: z.string(),
  attackProfile: attackProfileSchema,
  npCard: card,
  npTarget: target,
};
const requiredInputResponseSchema = z.object({
  key: z.string().min(1),
  owner: z.enum(['attacker', 'target', 'field', 'party', 'source']),
  label: z.string().min(1),
  description: z.string().min(1),
  minimum: z.number().int(),
  maximum: z.number().int(),
  step: z.number().int().positive(),
  effectOccurrenceIds: z.array(z.string().min(1)).min(1),
});
const rankingExclusionRecoverySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('openCalculator') }),
  z.object({ kind: z.literal('resetRankingConditions') }),
  z.object({ kind: z.literal('reload') }),
  z.object({ kind: z.literal('none') }),
]);
export const rankingRowResponseSchema: z.ZodType<RankingRowSummary> = z.object({
  ...attackMetadata,
  name: z.string(),
  imageKey: z.string().nullable(),
  classId: z.string(),
  rarity: z.number().int(),
  minimum: z.number(),
  average: z.number(),
  maximum: z.number(),
  precision: z.enum(['exact', 'approximate']),
  appliedEffectCount: z.number(),
  supportEffectCount: z.number(),
  supportSourceCount: z.number(),
  specialDamageApplied: z.boolean(),
  level: z.number().int(),
  npLevel: rankingNpLevelSchema,
  owned: z.boolean(),
});
export const rankingExclusionResponseSchema: z.ZodType<RankingPolicyExclusion> = z.object({
  entryId: z.string(),
  servantId: z.string(),
  name: z.string(),
  attackProfile: attackProfileSchema.nullable(),
  status: z.enum(['invalid', 'unsupported', 'inputRequired', 'unavailableUnderPolicy']),
  reason: z.string(),
  requiredInputs: z.array(requiredInputResponseSchema),
  recovery: rankingExclusionRecoverySchema,
  issues: calculationResultSchema.options[0].shape.issues,
});
const contributionPolicySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('calculator') }),
  z.object({
    kind: z.literal('ranking'),
    selfBuffs: rankingSelectionSchema.options[0].shape.selfBuffs,
    conditionalEffects: rankingSelectionSchema.options[0].shape.conditionalEffects,
    areaView: z.enum(['included', 'excluded']),
  }),
]);
const contributionDecisionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('included') }),
  z.object({
    kind: z.literal('excluded'),
    reason: z.enum(['selfBuffPolicy', 'conditionalEffectPolicy', 'areaView']),
  }),
]);
const effectiveContributionsSchema = z.object({
  contributions: z.array(
    z.object({
      contributionId: contributionIdSchema,
      presentationGroupId: z.string(),
      operationId: z.string(),
      component: contributionComponentSchema,
      modifier: z.union([modifierSchema, z.literal('npSpecial')]).nullable(),
      resolvedValue: z.number().nullable(),
      outputAddress: z.enum([
        'damage.modifier',
        'damage.modifierRate',
        'damage.ignore',
        'damage.npBase',
        'damage.npSpecial',
      ]),
      source: operationSourceSchema,
      executionOutcome: operationOutcomeSchema,
      selfDecision: contributionDecisionSchema,
      conditionDecision: contributionDecisionSchema,
      areaViewDecision: contributionDecisionSchema,
      effective: z.boolean(),
      presentationCounted: z.boolean(),
    }),
  ),
  effectivePresentationGroupIds: z.set(z.string()),
});
const effectInputSchema = z.object({
  ...canonicalInputBaseSchema.shape,
  defaultValue: z.number().int().nullable(),
  kind: z.union(canonicalInputDefinitionSchema.options.map((option) => option.shape.kind)),
  control: z.enum(['segmented', 'stepper', 'percentage']),
  value: z.number().nullable(),
  explicit: z.boolean(),
  invalid: z.boolean(),
  section: z.enum(['own', 'support']),
  relatedProjectionKeys: z.array(z.string()),
  relatedEffectLabels: z.array(z.string()),
  populationSelector: populationCountSelectorSchema.optional(),
});
const resourceSchema = z.object({
  npLevel: rankingNpLevelSchema,
  capacity: z.number(),
  gauge: z.number(),
});
const preparationActionSchema = z.object({
  hpBefore: hpStateSchema.optional(),
  hpAfter: hpStateSchema.optional(),
  command: preNoblePhantasmCommandSchema,
  actorFormId: actorFormIdSchema,
  sourceKind: z.enum(['skill', 'noblePhantasm', 'attackNoblePhantasm']),
  sourceId: z.string(),
  selectedEffects: z.array(
    z.object({
      sourceKind: z.enum(['skill', 'noblePhantasm']),
      sourceId: z.string(),
      actorFormId: actorFormIdSchema,
      occurrenceId: z.string(),
      effect: z.union([masterEffectSchema, noblePhantasmEffectSchema]),
      sourceActivation: sourceActivationPayloadSchema,
    }),
  ),
  activationFacts: z.array(activationFactSchema),
  transition: actorFormGraphSchema.shape.transitions.element.nullable(),
  resourceBefore: resourceSchema,
  resourceAfter: resourceSchema,
  resourceTransaction: z.object({
    afterConsumption: resourceSchema,
    mutations: z.array(
      z.object({
        step: z.number().int().nonnegative(),
        occurrenceId: z.string().min(1),
        before: resourceSchema,
        after: resourceSchema,
      }),
    ),
  }),
  baseOvercharge: z.number().nullable(),
  ocUse: z
    .object({
      actionId: z.string().min(1),
      gaugeBefore: z.number().int().min(10000),
      baseOc: z.number().int().min(1).max(3),
      boostTotal: z.number().int().nonnegative(),
      effectiveOc: z.number().int().min(1).max(5),
      participatingInstances: z.array(z.number().int().positive()),
      excludedInstances: z.array(z.number().int().positive()),
      boostUses: z.array(
        z
          .object({
            instanceId: z.number().int().positive(),
            source: operationSourceSchema,
            sourceName: z.string(),
            skillName: z.string(),
            label: z.string(),
            stages: z.number().int().min(1).max(5),
            included: z.boolean(),
            usesBefore: ocLifetimeLimitSchema,
          })
          .strict(),
      ),
    })
    .strict()
    .refine(isConsistentNpOcUseReceipt)
    .nullable(),
  ocOutcomes: z.array(
    z
      .object({
        step: z.number().int().nonnegative(),
        outcome: z.enum([
          'applied',
          'conditionFalse',
          'stochasticFailure',
          'policyExcluded',
          'pendingDependency',
          'alreadyApplied',
          'notApplicable',
        ]),
        effectiveRate: z.number().int().min(0).max(1000).optional(),
      })
      .strict(),
  ),
});
const resolvedScenario = calculationScenarioSchema.options[0];
const effects = z.array(rankingEffectResponseSchema);
const warnings = z.array(z.string());

const stochasticChoiceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('binary'), outcome: z.enum(['success', 'failure']) }).strict(),
  z.object({ kind: z.literal('successCount'), value: z.number().int().nonnegative() }).strict(),
]);
const stochasticWitnessSchema = z.array(
  z.object({ key: z.string().min(1), choice: stochasticChoiceSchema }).strict(),
);
const possibilityCertificateSchema: z.ZodType<RankingPolicyDetail['possibilityCertificate']> =
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('declared') }).strict(),
    z
      .object({
        kind: z.literal('enumerated'),
        policy: z.enum(['baseline', 'satisfied']),
        selectedWitness: stochasticWitnessSchema,
        attemptedExecutionCount: z.number().int().positive(),
        illegalWitnessCount: z.number().int().nonnegative(),
        illegalWitnesses: z.array(z.object({
          witness: stochasticWitnessSchema, key: z.string().min(1),
        }).strict()).max(4096),
        branching: z.array(
          z
            .object({
              witness: stochasticWitnessSchema,
              key: z.string().min(1),
              choices: z.array(stochasticChoiceSchema).min(1),
            })
            .strict(),
        ),
        branches: z
          .array(
            z
              .object({
                witness: stochasticWitnessSchema,
                status: z.enum(['executable', 'rejected', 'invalid']),
                average: z.number().nonnegative().nullable(),
                sourceReads: z.array(sourceActivationPayloadSchema),
                resourceUses: z.array(
                  z
                    .object({
                      actorFormId: actorFormIdSchema,
                      before: resourceSchema,
                      after: resourceSchema,
                      ocUse: preparationActionSchema.shape.ocUse,
                    })
                    .strict(),
                ),
              })
              .strict(),
          )
          .min(1)
          .max(4096),
      })
      .strict(),
  ]);

// The annotation makes missing or weakly validated DTO fields a compile error.
export const rankingDetailResponseSchema: z.ZodType<RankingPolicyDetail> = z
  .object({
    ...attackMetadata,
    scenario: resolvedScenario,
    input: damageResolutionInputSchema,
    result: calculationResultSchema.options[0],
    effects,
    effectInputs: z.array(effectInputSchema),
    warnings,
    appliedPreparationActions: z.array(preparationActionSchema),
    possibilityCertificate: possibilityCertificateSchema,
    contributionPolicy: contributionPolicySchema,
    effectiveContributions: effectiveContributionsSchema,
    rankingPolicy: rankingSelectionSchema,
    basis: resolvedRankingBasisSchema,
    areaContribution: z
      .object({
        withoutAreaScenario: resolvedScenario,
        withoutAreaInput: damageResolutionInputSchema,
        withoutAreaResult: calculationResultSchema,
        withoutAreaEffects: effects,
        contributionPolicy: contributionPolicySchema,
        effectiveContributions: effectiveContributionsSchema,
        warnings,
      })
      .nullable(),
    executionMetrics: z.object({
      worldCandidateCount: z.number(),
      scenarioCalculationCount: z.number(),
    }),
    candidateEvidence: z.object({
      startNpGauge: z.number(),
      policyKey: z.string(),
      candidateKey: z.string(),
      preparationPlanKey: z.string(),
      baselineInputDeviation: z.number(),
      attackProfileKey: z.string(),
      canonicalInputValues: z.record(z.string(), z.number()),
      targetCandidateKey: z.string(),
      fieldCandidateKey: z.string(),
      quantityCandidateKey: z.string(),
    }),
  })
  .superRefine((detail, context) => {
    const actions = detail.appliedPreparationActions;
    const receipts = actions.flatMap((action) => (action.ocUse ? [action.ocUse] : []));
    const terminal = actions.at(-1);
    if (
      new Set(receipts.map((receipt) => receipt.actionId)).size !== receipts.length ||
      actions.some(
        (action) =>
          (action.sourceKind === 'skill') !== (action.ocUse === null) ||
          (action.ocUse !== null &&
            (action.ocUse.gaugeBefore !== action.resourceBefore.gauge ||
              action.ocUse.baseOc !== action.baseOvercharge)) ||
          (action.sourceKind === 'skill'
            ? JSON.stringify(action.resourceTransaction.afterConsumption) !==
              JSON.stringify(action.resourceBefore)
            : action.resourceTransaction.afterConsumption.gauge !== 0) ||
          JSON.stringify(
            action.resourceTransaction.mutations.at(-1)?.after ??
              action.resourceTransaction.afterConsumption,
          ) !== JSON.stringify(action.resourceAfter) ||
          action.resourceTransaction.mutations.some(
            (mutation, index) =>
              JSON.stringify(mutation.before) !==
              JSON.stringify(
                index === 0
                  ? action.resourceTransaction.afterConsumption
                  : action.resourceTransaction.mutations[index - 1]!.after,
              ),
          ),
      ) ||
      terminal?.sourceKind !== 'attackNoblePhantasm' ||
      terminal.ocUse?.effectiveOc !== detail.input.overcharge ||
      detail.scenario.initialOvercharge !== detail.rankingPolicy.initialOvercharge ||
      detail.candidateEvidence.startNpGauge !== detail.scenario.initialOvercharge * 10000
    )
      context.addIssue({ code: 'custom', message: 'inconsistent_oc_execution_evidence' });
    for (const input of detail.effectInputs) {
      if (input.kind !== 'effectStackCount') continue;
      const stored = detail.scenario.canonicalInputValues[input.key];
      if (
        !stored ||
        input.value !== stored.value ||
        detail.candidateEvidence.canonicalInputValues[input.key] !== stored.value ||
        (stored.origin === 'maximum' && stored.value !== input.maximum) ||
        (stored.origin === 'baseline' && stored.value !== input.defaultValue)
      )
        context.addIssue({ code: 'custom', message: 'inconsistent_stack_quantity_evidence' });
    }
  });
