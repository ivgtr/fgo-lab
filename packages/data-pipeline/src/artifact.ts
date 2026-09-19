import { createHash } from 'node:crypto';
import type { MasterManifest } from '@fgo-lab/master-data';
import { masterManifestSchema, validateMasterSnapshot } from '@fgo-lab/master-data';

export function sha256(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}
export interface FileArtifact {
  key: string;
  file: string;
  content: string;
  required: boolean;
}
export function createManifest(input: {
  masterDataVersion: string;
  createdAt: string;
  retrievedAt: string;
  minimalAppVersion: string;
  artifactKind: 'production' | 'diagnostic';
  imagesEnabled: boolean;
  files: readonly FileArtifact[];
}): MasterManifest {
  return masterManifestSchema.parse({
    manifestVersion: 1,
    masterDataVersion: input.masterDataVersion,
    createdAt: input.createdAt,
    source: { name: 'Atlas Academy', region: 'JP', retrievedAt: input.retrievedAt },
    minimalAppVersion: input.minimalAppVersion,
    schemaVersion: 55,
    artifactKind: input.artifactKind,
    imagesEnabled: input.imagesEnabled,
    files: input.files.map((file) => ({
      key: file.key,
      file: file.file,
      bytes: Buffer.byteLength(file.content),
      sha256: sha256(file.content),
      required: file.required,
    })),
  });
}

export function assertMasterVersionIdentity(
  current: MasterManifest | undefined,
  candidate: MasterManifest,
): void {
  if (!current || current.masterDataVersion !== candidate.masterDataVersion) return;
  const currentMaster = current.files.find((file) => file.key === 'master' && file.required);
  const candidateMaster = candidate.files.find((file) => file.key === 'master' && file.required);
  if (!currentMaster || !candidateMaster || currentMaster.sha256 !== candidateMaster.sha256)
    throw new Error(`master_version_reused:${candidate.masterDataVersion}`);
}

export function validatePublishedArtifact(
  manifestValue: unknown,
  files: Readonly<Record<string, string>>,
) {
  const manifest = masterManifestSchema.parse(manifestValue);
  const errors: string[] = [];
  for (const file of manifest.files) {
    const content = files[file.file];
    if (content === undefined) {
      if (file.required) errors.push(`missing:${file.file}`);
      continue;
    }
    if (Buffer.byteLength(content) !== file.bytes) errors.push(`bytes:${file.file}`);
    if (sha256(content) !== file.sha256) errors.push(`sha256:${file.file}`);
    if (file.key === 'master') {
      try {
        const report = validateMasterSnapshot(JSON.parse(content));
        errors.push(
          ...report.errors.map((error) => `schema:${error}`),
          ...report.unknownAttackFunctions.map((type) => `unknown:${type}`),
        );
      } catch {
        errors.push(`json:${file.file}`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
