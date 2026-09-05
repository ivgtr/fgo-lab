import { z } from 'zod';
import {
  actorFormGraphSchema,
  actorFormIdSchema,
  canonicalInputDefinitionSchema,
  masterEffectSchema,
  noblePhantasmVariantRefSchema,
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
  status: z.enum(['invalid', 'unsupported', 'inputRequired', 'unavailableUnderPolicy']),
  reason: z.string(),
  issues: calculationResultSchema.options[0].shape.issues,
});
const contributionPolicySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('calculator') }),
  z.object({
    kind: z.literal('ranking'),
    selfBuffs: rankingSelectionSchema.shape.selfBuffs,
    conditionalEffects: rankingSelectionSchema.shape.conditionalEffects,
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
const inputDefinition = canonicalInputDefinitionSchema.options[0];
const effectInputSchema = z.object({
  ...inputDefinition.shape,
  kind: z.union(canonicalInputDefinitionSchema.options.map((option) => option.shape.kind)),
  control: z.enum(['segmented', 'stepper', 'percentage']),
  value: z.number().nullable(),
  explicit: z.boolean(),
  invalid: z.boolean(),
  section: z.enum(['own', 'support']),
  relatedProjectionKeys: z.array(z.string()),
  relatedEffectLabels: z.array(z.string()),
});
const resourceSchema = z.object({
  npLevel: rankingNpLevelSchema,
  capacity: z.number(),
  gauge: z.number(),
});
const preparationActionSchema = z.object({
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
      effect: masterEffectSchema,
      stochasticOutcome: z.enum(['success', 'failure']).nullable(),
    }),
  ),
  activationFacts: z.array(activationFactSchema),
  transition: actorFormGraphSchema.shape.transitions.element.nullable(),
  resourceBefore: resourceSchema,
  resourceAfter: resourceSchema,
  baseOvercharge: z.number().nullable(),
});
const resolvedScenario = calculationScenarioSchema.options[0];
const effects = z.array(rankingEffectResponseSchema);
const warnings = z.array(z.string());

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
