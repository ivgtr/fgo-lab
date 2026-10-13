import { chromium, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { loadObservedAtlasFixture } from '../e2e/atlasObservedFixture';
import { completeSetup } from '../e2e/setup';
import { ATLAS_CONTRACT_SHA256 } from '../apps/web/src/adapters/atlasContractFingerprint';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '../packages/schema/src/index';

const baseURL = process.argv[2];
if (!baseURL) throw new TypeError('usage: measure-atlas-ranking-browser <base-url>');
const workerCounts = process.argv[3] ? [Number(process.argv[3])] : [1, 2, 4];
if (workerCounts.some((count) => ![1, 2, 4].includes(count)))
  throw new TypeError('worker_count_must_be_1_2_or_4');
const fixture = await loadObservedAtlasFixture();
const browserServer = await chromium.launchServer({ headless: true });
const browser = await chromium.connect(browserServer.wsEndpoint());
const browserPid = browserServer.process().pid;
if (!browserPid) throw new TypeError('browser_pid_unavailable');
function browserRssBytes() {
  const processes = new Map<number, { parent: number; rssBytes: number }>();
  for (const name of readdirSync('/proc')) {
    if (!/^[0-9]+$/.test(name)) continue;
    try {
      const stat = readFileSync(`/proc/${name}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      const residentPages = Number(readFileSync(`/proc/${name}/statm`, 'utf8').split(' ')[1]);
      processes.set(Number(name), { parent: Number(fields[1]), rssBytes: residentPages * 4096 });
    } catch {
      /* Process exited during sampling. */
    }
  }
  const owned = new Set([browserPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, process] of processes)
      if (!owned.has(pid) && owned.has(process.parent)) {
        owned.add(pid);
        changed = true;
      }
  }
  return [...owned].reduce((sum, pid) => sum + (processes.get(pid)?.rssBytes ?? 0), 0);
}
let activeWorkerCount = 0;
const peakBrowserRss = new Map<number, number>();
const memorySampler = setInterval(() => {
  if (activeWorkerCount)
    peakBrowserRss.set(
      activeWorkerCount,
      Math.max(peakBrowserRss.get(activeWorkerCount) ?? 0, browserRssBytes()),
    );
}, 1000);
try {
  const context = await browser.newContext({ baseURL });
  await context.route(
    /^https:\/\/(?:api\.atlasacademy\.io|raw\.githubusercontent\.com)\//,
    async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'raw.githubusercontent.com') {
        if (url.pathname !== `/ivgtr/fgo-lab/atlas-certificates/JP/${ATLAS_CONTRACT_SHA256}.json`)
          throw new TypeError(`unexpected_certificate:${url.pathname}`);
        await route.fulfill({
          body: JSON.stringify(fixture.certificate),
          headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
        });
        return;
      }
      const body = fixture.bodies.get(url.pathname);
      if (!body) throw new TypeError(`unexpected_atlas_body:${url.pathname}`);
      await route.fulfill({
        body,
        headers: {
          'content-type': 'application/json',
          'access-control-allow-origin': '*',
          'cache-control': 'no-store',
        },
      });
    },
  );
  const page = await context.newPage();
  const appRankingWorkers: string[] = [];
  page.on('console', (message) => {
    const phase = /^ranking_probe_phase:([0-9]+)$/.exec(message.text());
    if (phase) activeWorkerCount = Number(phase[1]);
  });
  let resolveWorkerUrl: (value: string) => void;
  const workerUrl = new Promise<string>((resolve) => {
    resolveWorkerUrl = resolve;
  });
  page.on('worker', (worker) => {
    if (worker.url().includes('ranking')) {
      appRankingWorkers.push(worker.url());
      resolveWorkerUrl(worker.url());
    }
  });
  await page.route('https://static.atlasacademy.io/**', (route) => route.abort());
  await page.goto('/');
  await completeSetup(page);
  const appRankingStarted = performance.now();
  await page.getByRole('button', { name: '火力ランキング' }).click();
  await expect(page.getByRole('status')).toContainText('383件表示 / 383件を計算', {
    timeout: 120_000,
  });
  const appRankingWallMs = performance.now() - appRankingStarted;
  const url = await workerUrl;
  const browserCapabilities = await page.evaluate(() => ({
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
  }));
  const versions = {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    appVersion: APP_VERSION,
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const results = await page.evaluate(
    async ({ url, contract, versions, workerCounts }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('fgo-lab', 2);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        const request = db
          .transaction('master', 'readonly')
          .objectStore('master')
          .get(`atlas-active:${contract}`);
        request.onerror = () => reject(request.error);
        request.onsuccess = () =>
          resolve((request.result as { snapshotBytes: ArrayBuffer }).snapshotBytes);
      });
      db.close();
      const master = JSON.parse(new TextDecoder().decode(bytes)) as {
        version: string;
        servants: unknown[];
      };
      const conditions = {
        population: 'all',
        growthBasis: 'common',
        initialOvercharge: 1,
        levelBasis: 'naturalLimit',
        npLevelBasis: { kind: 'specified', npLevel: 1 },
        classAffinity: 'neutral',
        selfBuffs: 'included',
        conditionalEffects: 'baseline',
      };
      const measurements = [];
      let referenceDigest = '';
      for (const workerCount of workerCounts) {
        console.log(`ranking_probe_phase:${String(workerCount)}`);
        const began = performance.now();
        const parts = await Promise.all(
          Array.from(
            { length: workerCount },
            (_, index) =>
              new Promise<{ rows: unknown[]; exclusions: unknown[] }>((resolve, reject) => {
                const worker = new Worker(url);
                worker.onerror = (event) => reject(new Error(event.message));
                worker.onmessage = (event: MessageEvent) => {
                  const response = event.data as {
                    kind: string;
                    rows?: unknown[];
                    exclusions?: unknown[];
                    reason?: string;
                  };
                  if (response.kind === 'error') reject(new Error(response.reason));
                  else if (response.kind === 'ready')
                    worker.postMessage({
                      kind: 'calculate',
                      requestId: 'calculate',
                      contextId: 'probe',
                      conditions,
                    });
                  else if (response.kind === 'result') {
                    worker.terminate();
                    resolve({ rows: response.rows!, exclusions: response.exclusions! });
                  }
                };
                worker.postMessage({
                  kind: 'initialize',
                  requestId: 'initialize',
                  contextId: 'probe',
                  master: {
                    ...master,
                    servants: master.servants.slice(
                      Math.floor((master.servants.length * index) / workerCount),
                      Math.floor((master.servants.length * (index + 1)) / workerCount),
                    ),
                  },
                  profile: { servantBuilds: {} },
                  versions: { ...versions, masterDataVersion: master.version },
                });
              }),
          ),
        );
        const rows = parts.flatMap((part) => part.rows);
        const exclusions = parts.flatMap((part) => part.exclusions);
        const encoded = new TextEncoder().encode(JSON.stringify({ rows, exclusions }));
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoded));
        const digest = [...hash].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        if (referenceDigest && digest !== referenceDigest)
          throw new Error(`parallel_result_mismatch:${workerCount}`);
        referenceDigest = digest;
        measurements.push({
          workerCount,
          wallMs: performance.now() - began,
          rows: rows.length,
          exclusions: exclusions.length,
          digest,
        });
      }
      return measurements;
    },
    { url, contract: ATLAS_CONTRACT_SHA256, versions, workerCounts },
  );
  activeWorkerCount = 0;
  process.stdout.write(
    `${JSON.stringify({
      appRankingWallMs,
      appRankingWorkers: appRankingWorkers.length,
      browserCapabilities,
      probes: results.map((result) => ({
        ...result,
        peakBrowserRssBytes: peakBrowserRss.get(result.workerCount) ?? null,
      })),
    })}\n`,
  );
} finally {
  clearInterval(memorySampler);
  await browser.close();
  await browserServer.close();
  await fixture.cleanup();
}
