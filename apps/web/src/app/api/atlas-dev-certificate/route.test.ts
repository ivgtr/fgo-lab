import { afterEach, describe, expect, it, vi } from 'vitest';
import { atlasSourceCertificateUrl, sourceCertificateSchema } from '@fgo-lab/master-data';
import { ATLAS_CONTRACT_SHA256 } from '../../../adapters/atlasContractFingerprint';
import { GET } from './route';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('development Atlas certificate route', () => {
  it('requires an explicit local mode and refuses production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_FGO_LOCAL_CERTIFICATE', '0');
    expect(GET().status).toBe(404);

    vi.stubEnv('NEXT_PUBLIC_FGO_LOCAL_CERTIFICATE', '1');
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const certificate = sourceCertificateSchema.parse(await response.json());
    expect(certificate.contractSha256).toBe(ATLAS_CONTRACT_SHA256);
    expect(certificate.exports).toHaveLength(13);
    expect(certificate.referencedSkills).toHaveLength(25);

    vi.stubEnv('NODE_ENV', 'production');
    expect(GET().status).toBe(404);
  });

  it('uses the public certificate outside the explicit local mode', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_FGO_LOCAL_CERTIFICATE', '1');
    vi.resetModules();
    expect((await import('../../../adapters/atlasSource')).ATLAS_CERTIFICATE_URL).toBe(
      '/api/atlas-dev-certificate',
    );

    vi.stubEnv('NEXT_PUBLIC_FGO_LOCAL_CERTIFICATE', '0');
    vi.resetModules();
    expect((await import('../../../adapters/atlasSource')).ATLAS_CERTIFICATE_URL).toBe(
      atlasSourceCertificateUrl(ATLAS_CONTRACT_SHA256),
    );

    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_FGO_LOCAL_CERTIFICATE', '1');
    vi.resetModules();
    expect((await import('../../../adapters/atlasSource')).ATLAS_CERTIFICATE_URL).toBe(
      atlasSourceCertificateUrl(ATLAS_CONTRACT_SHA256),
    );
  });
});
