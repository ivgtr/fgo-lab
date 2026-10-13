import {
  ATLAS_EXPORT_KEYS,
  certifiedMasterSnapshotSchema,
  type AtlasExportKey,
  type CertifiedMasterDataSnapshot,
  type SourceCertificate,
} from '@fgo-lab/master-data';
import { portableSha256 } from './portableHash';
import { normalizeNiceCombatRules } from './niceCombatRules';
import { normalizeAtlasSnapshot } from './snapshotNormalization';

export function certifiedSourceVersion(certificate: SourceCertificate): string {
  return `atlas:${portableSha256(
    JSON.stringify({
      contractSha256: certificate.contractSha256,
      exports: certificate.exports,
      referencedSkills: certificate.referencedSkills,
    }),
  )}`;
}

/** Called by both the auditor and the browser after exact Atlas body verification. */
export function normalizeCertifiedAtlasSnapshot(input: {
  certificate: SourceCertificate;
  exports: ReadonlyMap<AtlasExportKey, unknown>;
  referencedSkills: ReadonlyMap<number, unknown>;
}): CertifiedMasterDataSnapshot {
  if (input.exports.size !== ATLAS_EXPORT_KEYS.length)
    throw new TypeError('certified_snapshot:export_count');
  for (const key of ATLAS_EXPORT_KEYS)
    if (!input.exports.has(key)) throw new TypeError(`certified_snapshot:missing_export:${key}`);
  if (input.referencedSkills.size !== input.certificate.referencedSkills.length)
    throw new TypeError('certified_snapshot:reference_count');
  const referenceIds = input.certificate.referencedSkills.map(({ id }) => id);
  if (referenceIds.some((id) => !input.referencedSkills.has(id)))
    throw new TypeError('certified_snapshot:missing_reference');
  const master = normalizeAtlasSnapshot({
    version: certifiedSourceVersion(input.certificate),
    combatRules: normalizeNiceCombatRules({
      classAttackRate: input.exports.get('NiceClassAttackRate'),
      classRelation: input.exports.get('NiceClassRelation'),
      attributeRelation: input.exports.get('NiceAttributeRelation'),
      card: input.exports.get('NiceCard'),
      constant: input.exports.get('NiceConstant'),
    }),
    servants: input.exports.get('nice_servant'),
    equips: input.exports.get('nice_equip'),
    mysticCodes: input.exports.get('nice_mystic_code'),
    items: input.exports.get('nice_item'),
    battlePoints: input.exports.get('nice_battle_point'),
    referencedSkills: referenceIds.map((id) => input.referencedSkills.get(id)),
  });
  if (portableSha256(JSON.stringify(master)) !== input.certificate.canonicalSha256)
    throw new TypeError('certified_snapshot:canonical_digest_mismatch');
  return certifiedMasterSnapshotSchema.parse(master);
}
