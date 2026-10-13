import { createHash } from 'node:crypto';
import { z } from 'zod';

const issueSchema = z.object({
  number: z.number().int().positive(),
  state: z.enum(['open', 'closed']),
  body: z.string().nullable(),
  pull_request: z.unknown().optional(),
});
const marker = (key: string) => `<!-- fgo-lab-atlas-monitor:JP:${key} -->`;
const evidenceMarker = (fingerprint: string) => `<!-- fgo-lab-atlas-evidence:${fingerprint} -->`;

export interface MonitorEvidence {
  key: string;
  title: string;
  summary: string;
  details: string;
  source: string;
  runUrl: string;
}

function validateEvidence(evidence: MonitorEvidence): void {
  if (!/^(?:audit|watchdog)-[a-z-]+$/.test(evidence.key))
    throw new TypeError('atlas_monitor:invalid_issue_key');
  for (const value of [evidence.title, evidence.summary, evidence.source, evidence.runUrl])
    if (!value || value.length > 1000) throw new TypeError('atlas_monitor:invalid_evidence');
  if (evidence.details.length > 16_000) throw new RangeError('atlas_monitor:evidence_too_large');
}

function evidenceFingerprint(evidence: MonitorEvidence): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        key: evidence.key,
        summary: evidence.summary,
        details: evidence.details,
        source: evidence.source,
      }),
    )
    .digest('hex');
}

export class ManagedAtlasIssues {
  constructor(
    private readonly token: string,
    private readonly repository: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiBase = 'https://api.github.com',
  ) {
    if (!token || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
      throw new TypeError('atlas_monitor:invalid_api_config');
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const response = await this.fetcher(`${this.apiBase}/repos/${this.repository}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2026-03-10',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`atlas_monitor:github_http_${String(response.status)}`);
    return response;
  }

  private async ensureLabel(): Promise<void> {
    const response = await this.fetcher(
      `${this.apiBase}/repos/${this.repository}/labels/atlas-monitor`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2026-03-10',
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (response.ok) return;
    if (response.status !== 404)
      throw new Error(`atlas_monitor:github_http_${String(response.status)}`);
    try {
      await this.request('/labels', {
        method: 'POST',
        body: JSON.stringify({
          name: 'atlas-monitor',
          color: 'b60205',
          description: 'FGO Lab Atlas source and audit monitoring',
        }),
      });
    } catch (cause) {
      // A concurrent audit may have created the label after the 404.
      if (!(cause instanceof Error) || cause.message !== 'atlas_monitor:github_http_422')
        throw cause;
    }
  }

  private async list(): Promise<z.infer<typeof issueSchema>[]> {
    await this.ensureLabel();
    const issues: z.infer<typeof issueSchema>[] = [];
    for (let page = 1; page <= 100; page++) {
      const response = await this.request(
        `/issues?state=all&labels=atlas-monitor&per_page=100&page=${String(page)}`,
      );
      const batch = z.array(issueSchema).parse(await response.json());
      issues.push(...batch.filter((issue) => !issue.pull_request));
      if (batch.length < 100) return issues;
    }
    throw new RangeError('atlas_monitor:issue_pagination_limit');
  }

  async reportFailure(evidence: MonitorEvidence): Promise<'created' | 'updated' | 'unchanged'> {
    validateEvidence(evidence);
    const fingerprint = evidenceFingerprint(evidence);
    const issues = (await this.list()).filter((issue) =>
      issue.body?.includes(marker(evidence.key)),
    );
    if (issues.length > 1) throw new TypeError('atlas_monitor:duplicate_managed_issues');
    const existing = issues[0];
    if (existing?.state === 'open' && existing.body?.includes(evidenceMarker(fingerprint)))
      return 'unchanged';
    const body = [
      marker(evidence.key),
      evidenceMarker(fingerprint),
      evidence.summary,
      '',
      `出典: ${evidence.source}`,
      `検出run: ${evidence.runUrl}`,
      '',
      '<details><summary>検査根拠</summary>',
      '',
      '```text',
      evidence.details.replaceAll('```', "'''") || '詳細なし',
      '```',
      '</details>',
    ].join('\n');
    if (existing) {
      await this.request(`/issues/${String(existing.number)}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: evidence.title, body, state: 'open' }),
      });
      return 'updated';
    }
    await this.request('/issues', {
      method: 'POST',
      body: JSON.stringify({ title: evidence.title, body, labels: ['atlas-monitor'] }),
    });
    return 'created';
  }

  async resolve(prefix: 'audit-' | 'watchdog-'): Promise<number> {
    let closed = 0;
    for (const issue of await this.list()) {
      if (issue.state !== 'open' || !issue.body?.includes('<!-- fgo-lab-atlas-monitor:JP:'))
        continue;
      if (!issue.body.includes(`<!-- fgo-lab-atlas-monitor:JP:${prefix}`)) continue;
      await this.request(`/issues/${String(issue.number)}`, {
        method: 'PATCH',
        body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
      });
      closed++;
    }
    return closed;
  }
}
