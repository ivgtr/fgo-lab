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
    schemaVersion: 1,
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
export interface AtlasFunctionInventory {
  attackEntries: number;
  counts: Record<string, number>;
  unknown: string[];
}
const ATTACK_TYPES = new Set([
  'damageNp',
  'damageNpIndividual',
  'damageNpPierce',
  'damageNpIndividualSum',
  'damageNpStateIndividualFix',
  'damageNpHpratioLow',
  'damageNpBattlePointPhase',
  'damageNpRare',
  'damageNpAndOrCheckIndividuality',
]);
export function inventoryAtlasAttackFunctions(
  servants: readonly unknown[],
): AtlasFunctionInventory {
  const counts: Record<string, number> = {};
  for (const value of servants) {
    if (!value || typeof value !== 'object') continue;
    const nps = (value as { noblePhantasms?: unknown }).noblePhantasms;
    if (!Array.isArray(nps)) continue;
    for (const np of nps) {
      if (!np || typeof np !== 'object') continue;
      const functions = (np as { functions?: unknown }).functions;
      if (!Array.isArray(functions)) continue;
      for (const fn of functions) {
        if (!fn || typeof fn !== 'object') continue;
        const type = (fn as { funcType?: unknown }).funcType;
        if (typeof type === 'string' && type.startsWith('damageNp'))
          counts[type] = (counts[type] ?? 0) + 1;
      }
    }
  }
  const unknown = Object.keys(counts)
    .filter((type) => !ATTACK_TYPES.has(type))
    .sort();
  return {
    attackEntries: Object.values(counts).reduce((sum, count) => sum + count, 0),
    counts: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
    unknown,
  };
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
