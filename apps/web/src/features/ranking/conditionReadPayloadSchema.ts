import { z } from 'zod';
import {
  actorFormIdSchema,
  noblePhantasmVariantRefSchema,
  canonicalTraitProvenanceSchema,
} from '@fgo-lab/master-data';
import { activationFactSchema, targetPredicateSchema } from '@fgo-lab/schema';
import type {
  ConditionExpression,
  ConditionRead,
  SourceActivationReceipt,
} from '@fgo-lab/calculation-application';

const scope = z.enum(['attacker', 'attackerState', 'target', 'targetState', 'field']);
const comparison = z.enum(['lessThan', 'atMost', 'equal', 'atLeast', 'greaterThan']);
const expression: z.ZodType<ConditionExpression> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal('always') }).strict(),
    z
      .object({
        kind: z.literal('unsupported'),
        reason: z.enum([
          'unresolvedRecipient',
          'unresolvedPreparationWrite',
          'unresolvedBattlePointDomain',
        ]),
        readDependency: expression.optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('trait'),
        scope,
        trait: z.string().min(1),
        present: z.boolean(),
        provenance: canonicalTraitProvenanceSchema.optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('targetPredicate'),
        scope: z.enum(['attacker', 'target']),
        predicate: targetPredicateSchema,
        present: z.boolean(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('traitCount'),
        scope,
        traits: z.array(z.string().min(1)),
        comparison: z.enum(['atLeast', 'atMost', 'equal']),
        count: z.number().int().nonnegative(),
      })
      .strict(),
    z.object({ kind: z.literal('card'), card: z.enum(['buster', 'arts', 'quick']) }).strict(),
    z
      .object({ kind: z.literal('noblePhantasmVariant'), variant: noblePhantasmVariantRefSchema })
      .strict(),
    activationFactSchema,
    z
      .object({
        kind: z.literal('quantity'),
        quantity: z.enum(['attackerHpPermille', 'targetRarity', 'battlePointPhase']),
        subjectId: z.string().min(1).optional(),
        comparison,
        value: z.number(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('inputQuantity'),
        inputKey: z.string().min(1),
        comparison,
        value: z.number(),
      })
      .strict(),
    z.object({ kind: z.literal('all'), expressions: z.array(expression) }).strict(),
    z.object({ kind: z.literal('any'), expressions: z.array(expression) }).strict(),
    z.object({ kind: z.literal('not'), expression }).strict(),
  ]),
);

const clock = z
  .object({
    phase: z.enum(['initial', 'sourceUse', 'operation', 'damageEvaluation']),
    actorFormId: actorFormIdSchema,
    actor: z.string().min(1),
    actionId: z.string().min(1).nullable(),
    operationId: z.string().min(1).nullable(),
    sourceInstanceId: z.string().min(1).nullable(),
    occurrenceId: z.string().min(1).nullable(),
    valueSetIndex: z.number().int().min(0).max(4).nullable(),
    valueIndex: z.number().int().min(0).max(9).nullable(),
  })
  .strict();
const proof = z
  .object({
    kind: z.enum([
      'canonicalIntrinsic',
      'selectedInitialResource',
      'legalChoice',
      'guaranteedWrite',
      'externalAssumption',
      'possibleOutcome',
    ]),
    clock,
  })
  .strict();
const common = {
  clock,
  evidence: z.array(
    z
      .object({
        expression,
        value: z.union([z.boolean(), z.number()]).nullable(),
        proof: proof.nullable(),
      })
      .strict(),
  ),
  support: z.array(proof),
};
export const conditionReadPayloadSchema: z.ZodType<ConditionRead> = z
  .discriminatedUnion('kind', [
    z
      .object({
        ...common,
        kind: z.literal('known'),
        truth: z.boolean(),
        certainty: z.enum(['guaranteed', 'possible']),
      })
      .strict(),
    z
      .object({ ...common, kind: z.literal('inputRequired'), truth: z.null(), certainty: z.null() })
      .strict(),
    z
      .object({ ...common, kind: z.literal('unsupported'), truth: z.null(), certainty: z.null() })
      .strict(),
  ])
  .superRefine((read, ctx) => {
    if (read.kind !== 'known') return;
    const guaranteed = read.support.every(
      ({ kind }) => kind !== 'externalAssumption' && kind !== 'possibleOutcome',
    );
    if ((read.certainty === 'guaranteed') !== guaranteed)
      ctx.addIssue({
        code: 'custom',
        message: 'condition_read_proof_mismatch',
        path: ['certainty'],
      });
  });
export const sourceActivationPayloadSchema: z.ZodType<SourceActivationReceipt> =
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('unread') }).strict(),
    z.object({ kind: z.literal('notApplicable') }).strict(),
    z
      .object({
        kind: z.literal('read'),
        read: conditionReadPayloadSchema,
        proc: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('unread') }).strict(),
          z
            .object({
              kind: z.literal('resolved'),
              outcome: z.enum(['success', 'failure']),
              certainty: z.enum(['guaranteed', 'possible']),
              ratePermille: z.number().int().min(0).max(1000),
              selection: z.enum(['declared', 'witness']),
            })
            .strict(),
          z.object({ kind: z.literal('inputRequired'), inputKey: z.string().min(1) }).strict(),
          z
            .object({
              kind: z.literal('invalid'),
              issue: z
                .object({
                  kind: z.literal('invalidStochasticOutcome'),
                  operationId: z.string().min(1),
                  detail: z.enum([
                    'missingStochasticOutcome',
                    'contradictoryStochasticOutcome',
                    'partialStochasticOutcome',
                    'missingSuccessCountDefinition',
                    'invalidSuccessCountValue',
                  ]),
                })
                .strict(),
            })
            .strict(),
        ]),
      })
      .strict(),
  ]);
