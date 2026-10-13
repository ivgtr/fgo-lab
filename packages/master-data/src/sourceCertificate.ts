import { z } from 'zod';

export const ATLAS_EXPORT_KEYS = [
  'NiceAttributeRelation',
  'NiceCard',
  'NiceClass',
  'NiceClassAttackRate',
  'NiceClassRelation',
  'NiceConstant',
  'nice_battle_point',
  'nice_enums',
  'nice_equip',
  'nice_item',
  'nice_mystic_code',
  'nice_servant',
  'nice_trait',
] as const;

export type AtlasExportKey = (typeof ATLAS_EXPORT_KEYS)[number];

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const commitSchema = z.string().regex(/^[0-9a-f]{40}$/);
const bodySchema = z.strictObject({
  bytes: z
    .number()
    .int()
    .nonnegative()
    .max(128 * 1024 * 1024),
  sha256: sha256Schema,
});

export const sourceCertificateSchema = z
  .strictObject({
    format: z.literal('fgo-lab-atlas-source-v1'),
    region: z.literal('JP'),
    generation: z.number().int().positive(),
    publishedAt: z.iso.datetime(),
    observedAt: z.iso.datetime(),
    rawCommit: commitSchema,
    rawCommittedAt: z.iso.datetime(),
    exporterCommit: commitSchema,
    publisherCommit: commitSchema,
    contractSha256: sha256Schema,
    masterSchemaVersion: z.literal(57),
    canonicalSha256: sha256Schema,
    exports: z.array(
      z.strictObject({
        key: z.enum(ATLAS_EXPORT_KEYS),
        ...bodySchema.shape,
      }),
    ),
    referencedSkills: z.array(
      z.strictObject({
        id: z.number().int().positive(),
        ...bodySchema.shape,
      }),
    ),
  })
  .superRefine((certificate, context) => {
    if (certificate.exports.length !== ATLAS_EXPORT_KEYS.length)
      context.addIssue({ code: 'custom', message: 'source_certificate:export_count' });
    for (const [index, key] of ATLAS_EXPORT_KEYS.entries())
      if (certificate.exports[index]?.key !== key)
        context.addIssue({
          code: 'custom',
          message: `source_certificate:export_order:${key}`,
          path: ['exports', index],
        });
    for (let index = 1; index < certificate.referencedSkills.length; index++)
      if (certificate.referencedSkills[index]!.id <= certificate.referencedSkills[index - 1]!.id)
        context.addIssue({
          code: 'custom',
          message: 'source_certificate:reference_order',
          path: ['referencedSkills', index],
        });
    if (Date.parse(certificate.publishedAt) < Date.parse(certificate.observedAt))
      context.addIssue({
        code: 'custom',
        message: 'source_certificate:publication_before_observation',
      });
  });

export type SourceCertificate = z.infer<typeof sourceCertificateSchema>;

export const atlasAuditStatusSchema = z.strictObject({
  format: z.literal('fgo-lab-atlas-audit-status-v1'),
  region: z.literal('JP'),
  auditedAt: z.iso.datetime(),
  observedAt: z.iso.datetime(),
  rawCommit: commitSchema,
  exporterCommit: commitSchema,
  publisherCommit: commitSchema,
  contractSha256: sha256Schema,
  certificateGeneration: z.number().int().positive(),
  certificateSha256: sha256Schema,
});
export type AtlasAuditStatus = z.infer<typeof atlasAuditStatusSchema>;

export function atlasSourceCertificateUrl(contractSha256: string): string {
  const contract = sha256Schema.parse(contractSha256);
  return `https://raw.githubusercontent.com/ivgtr/fgo-lab/atlas-certificates/JP/${contract}.json`;
}

export const ATLAS_AUDIT_STATUS_URL =
  'https://raw.githubusercontent.com/ivgtr/fgo-lab/atlas-certificates/JP/status.json';

export function atlasExportUrl(key: AtlasExportKey): string {
  return `https://api.atlasacademy.io/export/JP/${key}.json`;
}

export function atlasReferencedSkillUrl(id: number): string {
  if (!Number.isSafeInteger(id) || id <= 0) throw new TypeError('invalid_atlas_skill_id');
  return `https://api.atlasacademy.io/nice/JP/skill/${String(id)}`;
}
