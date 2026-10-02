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

// Publication is a fixed declaration boundary. Do not strip unknown fields before validation.
const publishedManifestSchema = masterManifestSchema
  .extend({
    source: masterManifestSchema.shape.source.strict(),
    files: masterManifestSchema.shape.files.element.strict().array().min(1),
  })
  .strict();

export function parsePublishedManifest(value: unknown): MasterManifest {
  const manifest = publishedManifestSchema.parse(value);
  const keys = new Set<string>();
  const paths = new Set<string>();
  for (const file of manifest.files) {
    if (
      file.file.startsWith('/') ||
      file.file.includes('\\') ||
      file.file.includes('\0') ||
      file.file.split('/').some((part) => part === '' || part === '.' || part === '..')
    )
      throw new Error(`published_file_path_invalid:${file.file}`);
    if (keys.has(file.key)) throw new Error(`published_file_key_duplicate:${file.key}`);
    if (paths.has(file.file)) throw new Error(`published_file_path_duplicate:${file.file}`);
    keys.add(file.key);
    paths.add(file.file);
  }
  if (manifest.files.filter((file) => file.key === 'master' && file.required).length !== 1)
    throw new Error('published_required_master_missing');
  return manifest;
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
  return parsePublishedManifest({
    manifestVersion: 1,
    masterDataVersion: input.masterDataVersion,
    createdAt: input.createdAt,
    source: { name: 'Atlas Academy', region: 'JP', retrievedAt: input.retrievedAt },
    minimalAppVersion: input.minimalAppVersion,
    schemaVersion: 56,
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
  const manifest = parsePublishedManifest(manifestValue);
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
        const snapshot = JSON.parse(content) as unknown;
        const report = validateMasterSnapshot(snapshot);
        if (
          snapshot === null ||
          typeof snapshot !== 'object' ||
          !('version' in snapshot) ||
          snapshot.version !== manifest.masterDataVersion
        )
          errors.push(`version:${file.file}`);
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
