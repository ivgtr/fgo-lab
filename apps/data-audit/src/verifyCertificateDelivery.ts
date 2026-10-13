import {
  atlasSourceCertificateUrl,
  sourceCertificateSchema,
  type SourceCertificate,
} from '@fgo-lab/master-data';

export async function verifyCertificateDelivery(
  certificate: SourceCertificate,
  fetcher: typeof fetch = fetch,
  pause: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<void> {
  const expected = `${JSON.stringify(sourceCertificateSchema.parse(certificate))}\n`;
  for (let attempt = 0; attempt < 21; attempt++) {
    try {
      const response = await fetcher(atlasSourceCertificateUrl(certificate.contractSha256), {
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
      if (
        response.status === 200 &&
        response.headers.get('content-type')?.startsWith('text/plain') &&
        response.headers.get('access-control-allow-origin') === '*'
      ) {
        const body = await response.text();
        if (body === expected) return;
      }
    } catch {
      // A cached prior generation or transient edge failure is retried below.
    }
    if (attempt < 20) await pause(30_000);
  }
  throw new TypeError('atlas_publication:delivery_not_verified_within_10_minutes');
}
