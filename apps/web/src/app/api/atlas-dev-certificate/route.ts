import certificate from '@fgo-lab/test-fixtures/atlas-observed-jp-20261013-certificate';
import { sourceCertificateSchema } from '@fgo-lab/master-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(): Response {
  if (
    process.env.NODE_ENV !== 'development' ||
    process.env.NEXT_PUBLIC_FGO_LOCAL_CERTIFICATE !== '1'
  )
    return new Response(null, { status: 404 });
  const validated = sourceCertificateSchema.parse(certificate);
  return new Response(`${JSON.stringify(validated)}\n`, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
