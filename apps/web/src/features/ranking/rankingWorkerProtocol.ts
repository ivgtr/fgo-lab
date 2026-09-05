import { z } from 'zod';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  rankingSelectionSchema,
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

import {
  rankingRowResponseSchema,
  rankingExclusionResponseSchema,
  rankingDetailResponseSchema,
} from './rankingResponsePayloadSchema';

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
const responseEnvelope: z.ZodType<RankingWorkerResponse> = z.union([
  z.object({ ...envelope, kind: z.literal('ready') }).strict(),
  z
    .object({
      ...envelope,
      kind: z.literal('result'),
      fingerprint: z.string(),
      rows: z.array(rankingRowResponseSchema),
      exclusions: z.array(rankingExclusionResponseSchema),
    })
    .strict(),
  z
    .object({
      ...envelope,
      kind: z.literal('detail'),
      fingerprint: z.string(),
      entryId: z.string(),
      detail: rankingDetailResponseSchema,
    })
    .strict(),
  z
    .object({
      ...envelope,
      kind: z.literal('error'),
      stage: z.enum(['initialization', 'summary']),
      fingerprint: z.string().nullable(),
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
  z
    .object({
      ...envelope,
      kind: z.literal('error'),
      stage: z.literal('detail'),
      fingerprint: z.string(),
      entryId: z.string().min(1),
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
    if (response.entryId !== detail.entryId) return null;
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
  return response;
}
