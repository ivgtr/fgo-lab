import { z } from 'zod';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  rankingSelectionSchema,
  resolvedRankingBasisSchema,
  calculationScenarioSchema,
  calculationResultSchema,
  damageResolutionInputSchema,
  portableCalculationRequestSchema,
  servantBuildRecordSchema,
  versionContextSchema,
} from '@fgo-lab/schema';
import type {
  RankingBlockerClass,
  RankingPolicyConditions,
  RankingPolicyDetail,
  RankingPolicyExclusion,
  RankingRowSummary,
} from '@fgo-lab/calculation-application';

const envelope = { requestId: z.string().min(1), contextId: z.string().min(1) };
export const rankingWorkerRequestSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...envelope,
      kind: z.literal('initialize'),
      master: masterSnapshotSchema,
      profile: z.object({ servantBuilds: servantBuildRecordSchema }).strict(),
      versions: versionContextSchema,
    })
    .strict(),
  z
    .object({ ...envelope, kind: z.literal('calculate'), conditions: rankingSelectionSchema })
    .strict(),
  z
    .object({
      ...envelope,
      kind: z.literal('detail'),
      fingerprint: z.string().min(1),
      entryId: z.string().min(1),
    })
    .strict(),
]);
export type RankingWorkerRequest = z.infer<typeof rankingWorkerRequestSchema>;
type ResponseIdentity = { requestId: string; contextId: string };
export type RankingWorkerResponse = ResponseIdentity &
  (
    | { kind: 'ready' }
    | {
        kind: 'result';
        fingerprint: string;
        rows: RankingRowSummary[];
        exclusions: RankingPolicyExclusion[];
      }
    | { kind: 'detail'; fingerprint: string; entryId: string; detail: RankingPolicyDetail }
    | {
        kind: 'error';
        stage: 'initialization' | 'summary';
        fingerprint: string | null;
        reason: string;
        status: RankingBlockerClass | 'failed';
      }
    | {
        kind: 'error';
        stage: 'detail';
        fingerprint: string;
        entryId: string;
        reason: string;
        status: RankingBlockerClass | 'failed';
      }
  );
export function rankingConditionsFingerprint(conditions: RankingPolicyConditions): string {
  return JSON.stringify([
    conditions.population,
    conditions.levelBasis,
    conditions.npLevelBasis.kind === 'owned'
      ? ['owned']
      : ['specified', conditions.npLevelBasis.npLevel],
    conditions.classAffinity,
    conditions.selfBuffs,
    conditions.conditionalEffects,
  ]);
}

// Validate the transport envelope before consulting request identity or publishing any response.
const responseEnvelope = z.discriminatedUnion('kind', [
  z.object({ ...envelope, kind: z.literal('ready') }).strict(),
  z
    .object({
      ...envelope,
      kind: z.literal('result'),
      fingerprint: z.string(),
      rows: z.array(
        z
          .object({
            entryId: z.string(),
            servantId: z.string(),
            name: z.string(),
            imageKey: z.string().nullable(),
            classId: z.string(),
            rarity: z.number().int(),
            npCard: z.enum(['buster', 'arts', 'quick']),
            npTarget: z.enum(['single', 'all']),
            level: z.number().int(),
            npLevel: z.number().int().min(1).max(5),
            owned: z.boolean(),
            precision: z.enum(['exact', 'approximate']),
            appliedEffectCount: z.number(),
            supportEffectCount: z.number(),
            supportSourceCount: z.number(),
            specialDamageApplied: z.boolean(),
            noblePhantasmName: z.string(),
            attackProfile: z
              .object({ id: z.object({ servantLineageId: z.string() }).loose() })
              .loose(),
            average: z.number(),
            minimum: z.number(),
            maximum: z.number(),
          })
          .loose(),
      ),
      exclusions: z.array(
        z
          .object({
            entryId: z.string(),
            reason: z.string(),
            servantId: z.string(),
            name: z.string(),
            issues: z.array(z.unknown()),
            status: z.enum(['invalid', 'unsupported', 'inputRequired', 'unavailableUnderPolicy']),
          })
          .loose(),
      ),
    })
    .strict(),
  z
    .object({
      ...envelope,
      kind: z.literal('detail'),
      fingerprint: z.string(),
      entryId: z.string(),
      detail: z
        .object({
          entryId: z.string(),
          servantId: z.string(),
          scenario: calculationScenarioSchema,
          result: calculationResultSchema,
          input: damageResolutionInputSchema,
          basis: resolvedRankingBasisSchema,
          rankingPolicy: rankingSelectionSchema,
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
          effects: z.array(
            z
              .object({
                projectionKey: z.string(),
                label: z.string(),
                visibility: z.string(),
                proc: z.object({ kind: z.string() }).loose(),
              })
              .loose(),
          ),
          effectInputs: z.array(z.object({ relatedProjectionKeys: z.array(z.string()) }).loose()),
          warnings: z.array(z.unknown()),
          appliedPreparationActions: z.array(z.unknown()),
          effectiveContributions: z.object({ contributions: z.array(z.unknown()) }).loose(),
          areaContribution: z
            .object({
              withoutAreaScenario: calculationScenarioSchema,
              withoutAreaInput: damageResolutionInputSchema,
              withoutAreaResult: calculationResultSchema,
              withoutAreaEffects: z.array(z.unknown()),
              effectiveContributions: z.object({ contributions: z.array(z.unknown()) }).loose(),
              warnings: z.array(z.unknown()),
              contributionPolicy: z.object({}).loose(),
            })
            .loose()
            .nullable(),
        })
        .loose(),
    })
    .strict(),
  z
    .object({
      ...envelope,
      kind: z.literal('error'),
      stage: z.enum(['initialization', 'summary', 'detail']),
      fingerprint: z.string().nullable(),
      entryId: z.string().optional(),
      reason: z.string(),
      status: z.enum([
        'invalid',
        'failed',
        'unsupported',
        'inputRequired',
        'unavailableUnderPolicy',
      ]),
    })
    .strict(),
]);
export function parseRankingWorkerResponse(value: unknown): RankingWorkerResponse | null {
  const parsed = responseEnvelope.safeParse(value);
  if (!parsed.success) return null;
  const response = parsed.data;
  if (response.kind === 'detail') {
    const detail = response.detail;
    if (
      response.entryId !== detail.entryId ||
      detail.result.status !== 'calculated' ||
      detail.scenario.mode !== 'resolved'
    )
      return null;
    if (
      !portableCalculationRequestSchema.safeParse({
        scenario: detail.scenario,
        versionContext: {
          masterDataVersion: detail.result.versions.masterDataVersion,
          engineVersion: detail.result.versions.engineVersion,
        },
        executionIntent: {
          kind: 'ranking',
          policy: detail.rankingPolicy,
          basis: detail.basis,
          initialNpGauge: detail.candidateEvidence.startNpGauge,
        },
      }).success
    )
      return null;
  }
  if (
    response.kind === 'error' &&
    response.stage === 'detail' &&
    (!response.entryId || response.fingerprint === null)
  )
    return null;
  return response as RankingWorkerResponse;
}
