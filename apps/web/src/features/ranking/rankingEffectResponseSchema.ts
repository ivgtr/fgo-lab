import { z } from 'zod';
import {
  canonicalInputDefinitionSchema,
  canonicalTraitProvenanceSchema,
  masterEffectSchema,
  noblePhantasmVariantRefSchema,
} from '@fgo-lab/master-data';
import {
  activationFactSchema,
  calculationResultSchema,
  calculationScenarioSchema,
  operationOriginSchema,
  targetAttributeContextSchema,
  targetClassContextSchema,
  targetPredicateSchema,
} from '@fgo-lab/schema';
import type { ConditionExpression, EffectProjection } from '@fgo-lab/calculation-application';

const scope = z.enum(['attacker', 'target', 'attackerState', 'targetState', 'field']);
const comparison = z.enum(['lessThan', 'atMost', 'equal', 'atLeast', 'greaterThan']);
const conditionSchema: z.ZodType<ConditionExpression> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal('always') }),
    z.object({ kind: z.literal('unsupported'), reason: z.literal('unresolvedRecipient') }),
    z
      .object({
        kind: z.literal('trait'),
        scope,
        trait: z.string(),
        present: z.boolean(),
        provenance: canonicalTraitProvenanceSchema.optional(),
      })
      .transform(({ provenance, ...condition }) =>
        provenance === undefined ? condition : { ...condition, provenance },
      ),
    z.object({
      kind: z.literal('targetPredicate'),
      scope: z.enum(['attacker', 'target']),
      predicate: targetPredicateSchema,
      present: z.boolean(),
    }),
    z.object({
      kind: z.literal('traitCount'),
      scope,
      traits: z.array(z.string()),
      comparison: z.enum(['atLeast', 'atMost', 'equal']),
      count: z.number(),
    }),
    z.object({ kind: z.literal('card'), card: z.enum(['buster', 'arts', 'quick']) }),
    z.object({ kind: z.literal('noblePhantasmVariant'), variant: noblePhantasmVariantRefSchema }),
    activationFactSchema,
    z.object({
      kind: z.literal('quantity'),
      quantity: z.enum(['attackerHpPermille', 'targetRarity', 'battlePointPhase']),
      subjectId: z.string().optional(),
      comparison,
      value: z.number(),
    }),
    z.object({
      kind: z.literal('inputQuantity'),
      inputKey: z.string(),
      comparison,
      value: z.number(),
    }),
    z.object({ kind: z.literal('all'), expressions: z.array(conditionSchema) }),
    z.object({ kind: z.literal('any'), expressions: z.array(conditionSchema) }),
    z.object({ kind: z.literal('not'), expression: conditionSchema }),
  ]),
);

export const operationSourceSchema = z
  .object({
    origin: operationOriginSchema,
    sourceInstanceId: z.string(),
    sourceId: z.string(),
    skillId: z.string(),
    effectId: z.string(),
    effectOccurrenceId: z.string(),
    transactionGroupId: z.string().optional(),
  })
  .transform(({ transactionGroupId, ...source }) =>
    transactionGroupId === undefined ? source : { ...source, transactionGroupId },
  );
export const contributionComponentSchema = z.enum([
  'modifier',
  'modifierRate',
  'ignore',
  'npBase',
  'npSpecial',
]);
export const contributionIdSchema = z.templateLiteral([
  z.string(),
  ':',
  contributionComponentSchema,
]);
export const modifierSchema = z.enum([
  'attackBuff',
  'defenseBuff',
  'cardBuff',
  'cardResistance',
  'npDamageBuff',
  'npResistance',
  'eventDamageBuff',
  'specialDamageBuff',
  'powerMod',
  'flatDamage',
  'ignoreDefense',
  'ignoreDamageCut',
]);
const resultEffect = calculationResultSchema.options[0].shape.effects.element;
export const operationOutcomeSchema = resultEffect.shape.outcome;
const decisionState = { state: z.enum(['enabled', 'disabled']), decisionKey: z.string() };
const relativeClass = targetClassContextSchema.options[0];
const relativeAttribute = targetAttributeContextSchema.options[0];
const effectDecisionSchema = z.union([
  z.object({ state: z.literal('none') }),
  z
    .object({
      ...decisionState,
      kind: z.literal('effect'),
      plan: z.object({
        activation: z.enum(['automatic', 'user']),
        condition: z.enum(['evaluate', 'userMayAssume', 'unsupported']),
      }),
      targetContext: z
        .object({
          predicates: z.array(targetPredicateSchema),
          fallbackClass: relativeClass,
          fallbackAttribute: relativeAttribute,
        })
        .optional(),
    })
    .transform(({ targetContext, ...decision }) =>
      targetContext === undefined ? decision : { ...decision, targetContext },
    ),
  z.object({
    ...decisionState,
    kind: z.literal('worldFact'),
    fact: calculationScenarioSchema.options[0].shape.worldFactAssertions.element.shape.fact,
  }),
  z.object({
    ...decisionState,
    kind: z.literal('targetPredicate'),
    target: targetPredicateSchema,
    fallbackClass: targetClassContextSchema.nullable(),
    fallbackAttribute: targetAttributeContextSchema.nullable(),
  }),
]);

// Every field in the application projection is checked, including nested data used by shared UI.
export const rankingEffectResponseSchema: z.ZodType<EffectProjection> = z.object({
  projectionKey: z.string(),
  operationId: z.string(),
  contributionId: contributionIdSchema.nullable(),
  label: z.string(),
  sourceName: z.string(),
  skillName: z.string(),
  gameActivation: z.enum(['constant', 'skillUse', 'npBeforeDamage', 'derived']),
  sourceActive: z.boolean(),
  proc: masterEffectSchema.shape.proc,
  procRatePermille: z.number().nullable(),
  valuePermille: z.number().nullable(),
  value: z.number().nullable(),
  requiredQuantity: z.literal('attackerHpPermille').nullable(),
  requiredQuantityOwner: z.enum(['attacker', 'source']).nullable(),
  requiredInputs: z.array(canonicalInputDefinitionSchema),
  modifier: z.union([modifierSchema, z.enum(['npSpecial', 'npVariantSelection'])]).nullable(),
  source: operationSourceSchema,
  contributionScope: z.enum(['personal', 'partyWide', 'partyOther', 'enemyApplied', 'external']),
  contributionControl: z.enum(['operation', 'worldAssumption']),
  activationSources: z.array(operationSourceSchema),
  executionSupport: z.enum(['supported', 'unsupported']),
  outcome: operationOutcomeSchema,
  visibility: z.enum(['visible', 'hidden']),
  controllability: z.enum(['automatic', 'user']),
  selectionGroups: z.array(z.object({ groupKey: z.string(), candidateKey: z.string() })),
  decision: effectDecisionSchema,
  conditionDecision: z.enum(['none', 'evaluate', 'assumeSatisfied']),
  explanation: z.object({
    code: resultEffect.shape.explanationCode,
    condition: conditionSchema.nullable(),
  }),
});
