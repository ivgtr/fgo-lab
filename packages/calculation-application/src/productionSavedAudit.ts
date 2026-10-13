import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { masterSnapshotSchema, naturalServantLevel } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION, servantBuildSchema } from '@fgo-lab/schema';
import { acceptedProductionAuditValue } from './productionAuditValue';
import { attackProfileKey, createStaticAttackProfiles } from './attackProfile';
import { auditProductionSavedClosure, type ProductionSavedBasis } from './productionClosureAudit';
import { verifyCurrentProductionRecord } from './productionCurrentRecord';
import type { RankingProfileInput } from './rankingContracts';

const root = resolve(import.meta.dirname, '../../..');
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const stamp = '2026-10-03T00:00:00.000Z';

async function verifyReceipts(
  directory: string,
  receipts: readonly { path: string; bytes: number; sha256: string }[],
): Promise<{ verified: { path: string; bytes: number; sha256: string }[]; errors: string[] }> {
  const verified: { path: string; bytes: number; sha256: string }[] = [];
  const errors: string[] = [];
  for (const receipt of receipts) {
    if (
      !/^[a-zA-Z0-9_-]+\.json$/.test(receipt.path) ||
      !Number.isSafeInteger(receipt.bytes) ||
      receipt.bytes <= 0 ||
      !/^[a-f0-9]{64}$/.test(receipt.sha256)
    )
      throw new TypeError(`saved_artifact_path_invalid:${receipt.path}`);
    const bytes = await readFile(resolve(directory, receipt.path));
    if (bytes.length !== receipt.bytes || sha(bytes) !== receipt.sha256) {
      errors.push(`receipt_mismatch:${receipt.path}`);
      continue;
    }
    try {
      JSON.parse(bytes.toString());
    } catch {
      errors.push(`json_invalid:${receipt.path}`);
      continue;
    }
    verified.push(receipt);
  }
  return { verified, errors };
}

export function createProductionSavedProfile(
  master: ReturnType<typeof masterSnapshotSchema.parse>,
  basis: ProductionSavedBasis,
): RankingProfileInput {
  const entries = master.servants.map((servant) => {
    const skillLevels = Object.fromEntries(
      [...new Set(servant.skills.map(({ slot }) => slot))].map((slot) => {
        const level = basis === 'S0' ? 10 : slot === 1 ? 1 : slot === 2 ? 5 : 9;
        return [String(slot), level];
      }),
    );
    return [
      servant.id,
      servantBuildSchema.parse({
        servantId: servant.id,
        level: basis === 'S0' ? naturalServantLevel(servant.rarity) : 90,
        ascension: 4,
        npLevel: basis === 'S0' ? 1 : 2,
        fouAtk: basis === 'S0' ? 1000 : 1234,
        skills: skillLevels,
        appends: {},
        updatedAt: stamp,
      }),
    ] as const;
  });
  const servantBuilds = Object.fromEntries(entries);
  if (Object.keys(servantBuilds).length !== master.servants.length)
    throw new TypeError('production_saved_servant_identity_duplicate');
  return { servantBuilds };
}

export async function runProductionSavedAudit(
  outputArgument: string,
  matrixArgument: string,
  expectedMatrixHead: string,
): Promise<void> {
  if (!outputArgument || !matrixArgument || !/^[0-9a-f]{40}$/.test(expectedMatrixHead))
    throw new TypeError(
      'usage: audit-saved-matrix.ts <new-output> <passed-current-matrix> <matrix-head>',
    );
  const output = resolve(root, outputArgument);
  const matrixDirectory = resolve(root, matrixArgument);
  const artifacts: {
    basis: ProductionSavedBasis;
    key: string;
    path: string;
    bytes: number;
    sha256: string;
  }[] = [];
  const groupResults: Record<string, unknown> = {};
  let stage = 'inputs';
  let outputCreated = false;

  try {
    await mkdir(output, { recursive: false });
    outputCreated = true;
    const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    const worktree = execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' });
    if (worktree !== '') throw new TypeError('saved_audit_requires_clean_worktree');
    const masterBytes = await readFile(
      resolve(root, 'packages/test-fixtures/production-master/master.json'),
    );
    const master = masterSnapshotSchema.parse(JSON.parse(masterBytes.toString()));
    const matrixBytes = await readFile(resolve(matrixDirectory, 'manifest.json'));
    const matrix = JSON.parse(matrixBytes.toString()) as {
      identity?: {
        head?: string;
        worktree?: string;
        masterSha256?: string;
        masterDataVersion?: string;
      };
      audit?: { conditionCount?: number; attackProfileCount?: number; outcomeCount?: number };
      parityGate?: { status?: string };
      canonicalRecords?: { comparison?: { status?: string } };
      executionRatchets?: {
        finalProfileOutcomes?: { status?: string };
        preparationTransactions?: { status?: string };
      };
      productionArtifacts?: {
        conditionRecords?: { path: string; bytes: number; sha256: string }[];
      };
    };
    if (
      matrix.identity?.head !== expectedMatrixHead ||
      matrix.identity.worktree !== '' ||
      matrix.identity.masterSha256 !== sha(masterBytes) ||
      matrix.identity.masterDataVersion !== master.version ||
      matrix.audit?.conditionCount !== 80 ||
      matrix.audit.attackProfileCount !== 433 ||
      matrix.audit.outcomeCount !== 34640 ||
      matrix.parityGate?.status !== 'passed' ||
      matrix.canonicalRecords?.comparison?.status !== 'passed' ||
      matrix.executionRatchets?.finalProfileOutcomes?.status !== 'passed' ||
      matrix.executionRatchets.preparationTransactions?.status !== 'passed'
    )
      throw new TypeError('saved_audit_current_matrix_identity_or_gate_invalid');
    const commonRecords = new Map<string, Map<string, Record<string, unknown>>>();
    const commonReceipts = [];
    for (const selfBuffs of ['included', 'excluded'] as const)
      for (const conditionalEffects of ['baseline', 'satisfied'] as const) {
        const key = `naturalLimit-${selfBuffs}-${conditionalEffects}-np1-oc1`;
        const path = `${key}.json`;
        const receipt = matrix.productionArtifacts?.conditionRecords?.find(
          (item) => item.path === path,
        );
        if (!receipt) throw new TypeError(`saved_audit_common_receipt_missing:${key}`);
        commonReceipts.push(receipt);
        const value = JSON.parse((await readFile(resolve(matrixDirectory, path))).toString()) as {
          identity?: { head?: string };
          summary?: { key?: string; calculated?: number; unavailableUnderPolicy?: number };
          records?: Record<string, unknown>[];
        };
        if (
          value.identity?.head !== expectedMatrixHead ||
          value.summary?.key !== key ||
          value.records?.length !== 433
        )
          throw new TypeError(`saved_audit_common_body_invalid:${key}`);
        commonRecords.set(
          `${selfBuffs}:${conditionalEffects}`,
          new Map(value.records.map((record) => [String(record['profileKey']), record])),
        );
      }
    const commonVerification = await verifyReceipts(matrixDirectory, commonReceipts);
    if (commonVerification.errors.length) throw new TypeError('saved_audit_common_receipt_invalid');
    const versions = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: APP_VERSION,
      masterDataVersion: master.version,
      gameRegion: 'JP' as const,
      masterDataLocale: 'ja-JP' as const,
    };
    const profilesByKey = new Map(
      master.servants
        .flatMap(createStaticAttackProfiles)
        .map((profile) => [attackProfileKey(profile), profile]),
    );
    const identity = {
      sourceHead,
      worktree,
      masterDataVersion: master.version,
      masterSha256: sha(masterBytes),
      matrixHead: expectedMatrixHead,
      matrixManifestSha256: sha(matrixBytes),
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: APP_VERSION,
      timestamp: stamp,
    };
    stage = 'saved-groups';
    for (const basis of ['S0', 'S1'] as const) {
      const profile = createProductionSavedProfile(master, basis);
      const profileDigest = sha(JSON.stringify(acceptedProductionAuditValue(profile)));
      let commonParityCount = 0;
      const audit = await auditProductionSavedClosure(
        master,
        profile,
        versions,
        basis,
        async ({ records, ...summary }) => {
          const path = `${summary.key}.json`;
          const body = `${JSON.stringify(acceptedProductionAuditValue({ identity, profileDigest, summary, records }))}\n`;
          await writeFile(resolve(output, path), body);
          artifacts.push({
            basis,
            key: summary.key,
            path,
            bytes: Buffer.byteLength(body),
            sha256: sha(body),
          });
          for (const record of records) {
            const strictFailures = verifyCurrentProductionRecord({
              value: record,
              condition: summary.conditions,
              master,
              versions,
              profile,
              profilesByKey,
            });
            if (strictFailures.length)
              throw new TypeError(
                `saved_record_invalid:${summary.key}:${JSON.stringify(strictFailures[0])}`,
              );
            if (basis !== 'S0') continue;
            const entry = record as Record<string, unknown>;
            const common = commonRecords
              .get(`${summary.conditions.selfBuffs}:${summary.conditions.conditionalEffects}`)
              ?.get(String(entry['profileKey']));
            if (!common) throw new TypeError(`saved_common_profile_missing:${summary.key}`);
            const current = {
              status: entry['status'],
              plan: (entry['scenario'] as { preNoblePhantasmPlan?: unknown } | undefined)
                ?.preNoblePhantasmPlan,
              input: entry['canonicalInput'],
              damageRows: entry['damageRows'],
            };
            const reference = {
              status: common['status'],
              plan: (common['scenario'] as { preNoblePhantasmPlan?: unknown } | undefined)
                ?.preNoblePhantasmPlan,
              input: common['canonicalInput'],
              damageRows: common['damageRows'],
            };
            if (!isDeepStrictEqual(current, reference))
              throw new TypeError(
                `saved_common_parity_mismatch:${summary.key}:${String(entry['profileKey'])}`,
              );
            commonParityCount += 1;
          }
          console.log(
            `${summary.key}: ${summary.calculated} calculated, ${summary.unavailableUnderPolicy} unavailable, ${summary.elapsedMs.toFixed(0)}ms`,
          );
        },
      );
      if (
        audit.conditionCount !== (basis === 'S0' ? 4 : 8) ||
        audit.attackProfileCount !== 433 ||
        audit.outcomeCount !== audit.conditionCount * 433 ||
        audit.outcomes.inputRequired !== 0 ||
        audit.outcomes.invalid !== 0 ||
        audit.outcomes.unsupported !== 0 ||
        audit.parityFailures.length !== 0 ||
        audit.parityCount !== audit.outcomes.calculated ||
        (basis === 'S0' && commonParityCount !== 4 * 433)
      )
        throw new TypeError(`saved_audit_gate_failed:${basis}`);
      groupResults[basis] = {
        profileDigest,
        profileCount: Object.keys(profile.servantBuilds).length,
        commonParityCount,
        audit,
      };
    }
    const verification = await verifyReceipts(output, artifacts);
    if (verification.errors.length) throw new TypeError('saved_audit_artifact_verification_failed');
    const result = {
      status: 'passed',
      identity,
      commonVerification,
      artifacts,
      verification,
      groups: groupResults,
    };
    await writeFile(
      resolve(output, 'manifest.json'),
      `${JSON.stringify(acceptedProductionAuditValue(result))}\n`,
    );
    console.log(
      JSON.stringify({
        status: 'passed',
        output,
        conditions: artifacts.length,
        groups: Object.fromEntries(
          Object.entries(groupResults).map(([key, value]) => [
            key,
            (value as { audit: { outcomes: unknown; parityCount: number } }).audit.outcomes,
          ]),
        ),
      }),
    );
  } catch (error: unknown) {
    if (outputCreated)
      await writeFile(
        resolve(output, 'manifest.json'),
        `${JSON.stringify(acceptedProductionAuditValue({ status: 'failed', stage, artifacts, groups: groupResults, error: error instanceof Error ? error.message : String(error) }))}\n`,
      );
    throw error;
  }
}
