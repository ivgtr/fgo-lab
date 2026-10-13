import { expect, it } from 'vitest';
import { ManagedAtlasIssues, type MonitorEvidence } from './managedIssues';

it('creates one issue for a failure, updates changed evidence, and resolves it', async () => {
  const issues: { number: number; state: 'open' | 'closed'; body: string | null }[] = [];
  let writes = 0;
  const payload = (body: BodyInit | null | undefined) => {
    if (typeof body !== 'string') throw new TypeError('expected_json_body');
    return JSON.parse(body) as { body?: string; state?: 'open' | 'closed' };
  };
  const fetcher: typeof fetch = (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const method = init?.method ?? 'GET';
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-token' });
    if (url.pathname.endsWith('/labels/atlas-monitor')) return Promise.resolve(new Response('{}'));
    if (url.pathname.endsWith('/issues') && method === 'GET')
      return Promise.resolve(new Response(JSON.stringify(issues)));
    if (url.pathname.endsWith('/issues') && method === 'POST') {
      const created = payload(init?.body);
      issues.push({ number: 1, state: 'open', body: created.body ?? null });
      writes++;
      return Promise.resolve(new Response('{}'));
    }
    if (url.pathname.endsWith('/issues/1') && method === 'PATCH') {
      const updated = payload(init?.body);
      issues[0] = {
        number: 1,
        state: updated.state ?? issues[0]!.state,
        body: updated.body ?? issues[0]!.body,
      };
      writes++;
      return Promise.resolve(new Response('{}'));
    }
    throw new Error(`unexpected_api_request:${method}:${url.pathname}`);
  };
  const monitor = new ManagedAtlasIssues('test-token', 'ivgtr/fgo-lab', fetcher);
  const evidence: MonitorEvidence = {
    key: 'audit-raw-vocabulary',
    title: 'Atlas raw vocabulary changed',
    summary: 'mstClass has a new field',
    details: 'mstClass.newField: number',
    source: 'raw=abc api=def',
    runUrl: 'https://github.com/ivgtr/fgo-lab/actions/runs/1',
  };
  expect(await monitor.reportFailure(evidence)).toBe('created');
  expect(await monitor.reportFailure({ ...evidence, runUrl: 'run/2' })).toBe('unchanged');
  expect(writes).toBe(1);
  expect(await monitor.reportFailure({ ...evidence, details: 'mstClass.newField: string' })).toBe(
    'updated',
  );
  expect(writes).toBe(2);
  expect(await monitor.resolve('audit-')).toBe(1);
  expect(issues[0]?.state).toBe('closed');
});
