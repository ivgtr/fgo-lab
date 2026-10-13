import { createHash } from 'node:crypto';
import {
  ATLAS_AUDIT_STATUS_URL,
  atlasAuditStatusSchema,
  atlasSourceCertificateUrl,
  sourceCertificateSchema,
} from '@fgo-lab/master-data';

const MAX_STATUS_BYTES = 4 * 1024;
const MAX_CERTIFICATE_BYTES = 1024 * 1024;
const MAX_AUDIT_AGE_MS = 18 * 60 * 60 * 1000;

export type AtlasHeartbeatCheck =
  | { status: 'healthy'; auditedAt: string; generation: number; source: string }
  | { status: 'failed'; reason: string; details: string; source: string };

async function publicJson(url: string, maxBytes: number, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url, {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 200)
    throw new TypeError(`atlas_watchdog:http_${String(response.status)}`);
  if (
    !response.headers.get('content-type')?.startsWith('text/plain') ||
    response.headers.get('access-control-allow-origin') !== '*'
  )
    throw new TypeError('atlas_watchdog:delivery_headers');
  const body = await response.text();
  if (body.length === 0 || body.length > maxBytes) throw new RangeError('atlas_watchdog:body_size');
  return JSON.parse(body) as unknown;
}

export async function checkAtlasHeartbeat(
  now: Date,
  fetcher: typeof fetch = fetch,
): Promise<AtlasHeartbeatCheck> {
  let source = 'status=unavailable';
  try {
    if (Number.isNaN(now.getTime())) throw new TypeError('atlas_watchdog:invalid_clock');
    const status = atlasAuditStatusSchema.parse(
      await publicJson(ATLAS_AUDIT_STATUS_URL, MAX_STATUS_BYTES, fetcher),
    );
    source = `raw=${status.rawCommit} api=${status.exporterCommit} contract=${status.contractSha256}`;
    const auditAge = now.getTime() - Date.parse(status.auditedAt);
    if (auditAge < -5 * 60_000) throw new TypeError('atlas_watchdog:future_audit_timestamp');
    if (Date.parse(status.observedAt) > Date.parse(status.auditedAt))
      throw new TypeError('atlas_watchdog:observation_after_audit');
    if (auditAge > MAX_AUDIT_AGE_MS)
      return {
        status: 'failed',
        reason: 'audit-stale',
        details: `Last successful audit: ${status.auditedAt}; maximum age: 18 hours.`,
        source,
      };
    const certificate = sourceCertificateSchema.parse(
      await publicJson(
        atlasSourceCertificateUrl(status.contractSha256),
        MAX_CERTIFICATE_BYTES,
        fetcher,
      ),
    );
    const certificateSha256 = createHash('sha256')
      .update(JSON.stringify(certificate))
      .digest('hex');
    if (
      certificate.contractSha256 !== status.contractSha256 ||
      certificate.generation !== status.certificateGeneration ||
      certificateSha256 !== status.certificateSha256
    )
      throw new TypeError('atlas_watchdog:certificate_identity_mismatch');
    return {
      status: 'healthy',
      auditedAt: status.auditedAt,
      generation: certificate.generation,
      source,
    };
  } catch (cause) {
    return {
      status: 'failed',
      reason: 'delivery-failed',
      details: cause instanceof Error ? cause.message : String(cause),
      source,
    };
  }
}
