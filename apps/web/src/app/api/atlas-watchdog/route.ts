import { checkAtlasHeartbeat, ManagedAtlasIssues } from '@fgo-lab/atlas-monitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env['CRON_SECRET'];
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`)
    return new Response('Unauthorized', { status: 401 });
  const token = process.env['ATLAS_MONITOR_GITHUB_TOKEN'];
  if (!token) {
    console.error('atlas_watchdog:missing_github_issue_token');
    return Response.json({ status: 'unavailable' }, { status: 503 });
  }
  try {
    const monitor = new ManagedAtlasIssues(token, 'ivgtr/fgo-lab');
    const check = await checkAtlasHeartbeat(new Date());
    if (check.status === 'healthy') {
      await monitor.resolve('watchdog-');
      return Response.json({ status: 'healthy', generation: check.generation });
    }
    await monitor.reportFailure({
      key: 'watchdog-atlas-audit',
      title: 'Atlas JP audit or certificate delivery stopped',
      summary: `Independent watchdog: ${check.reason}`,
      details: check.details,
      source: check.source,
      runUrl: request.url,
    });
    return Response.json({ status: 'failed', reason: check.reason }, { status: 503 });
  } catch (cause) {
    console.error('atlas_watchdog:notification_failed', cause);
    return Response.json({ status: 'unavailable' }, { status: 503 });
  }
}
