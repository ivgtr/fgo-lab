import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { normalizeCertifiedAtlasSnapshot } from '../packages/data-pipeline/src/browser';
import {
  ATLAS_EXPORT_KEYS,
  sourceCertificateSchema,
  type AtlasExportKey,
} from '../packages/master-data/src/sourceCertificate';

const [certificatePath, observedDirectory, baseUrl, ...extra] = process.argv.slice(2);
if (!certificatePath || !observedDirectory || !baseUrl || extra.length)
  throw new TypeError(
    'usage: atlas-worker-probe <certificate-json> <observed-directory> <base-url>',
  );

const certificate = sourceCertificateSchema.parse(
  JSON.parse(await readFile(certificatePath, 'utf8')) as unknown,
);
const exports = new Map<AtlasExportKey, unknown>();
const references = new Map<number, unknown>();
for (const key of ATLAS_EXPORT_KEYS)
  exports.set(
    key,
    JSON.parse(await readFile(join(observedDirectory, `${key}.json`), 'utf8')) as unknown,
  );
for (const { id } of certificate.referencedSkills)
  references.set(
    id,
    JSON.parse(
      await readFile(join(observedDirectory, 'referenced_skills', `${String(id)}.json`), 'utf8'),
    ) as unknown,
  );
const nodeMaster = normalizeCertifiedAtlasSnapshot({
  certificate,
  exports,
  referencedSkills: references,
});
const nodeSha256 = createHash('sha256').update(JSON.stringify(nodeMaster)).digest('hex');
if (nodeSha256 !== certificate.canonicalSha256)
  throw new TypeError('atlas_worker_probe:node_digest_mismatch');

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  let generation = certificate.generation;
  let corruptServantBody = false;
  let certificateRequests = 0;
  let atlasBodyRequests = 0;
  let atlasBytes = 0;
  await context.route(
    /^https:\/\/(?:api\.atlasacademy\.io|raw\.githubusercontent\.com)\//,
    async (route) => {
      const url = new URL(route.request().url());
      let body: Buffer;
      if (url.hostname === 'raw.githubusercontent.com') {
        const expectedPath = `/ivgtr/fgo-lab/atlas-certificates/JP/${certificate.contractSha256}.json`;
        if (url.pathname !== expectedPath)
          throw new TypeError(`unexpected_certificate_url:${url.pathname}`);
        certificateRequests++;
        body = Buffer.from(JSON.stringify({ ...certificate, generation }));
      } else {
        const exportMatch = /^\/export\/JP\/([A-Za-z_]+)\.json$/.exec(url.pathname);
        const skillMatch = /^\/nice\/JP\/skill\/([1-9][0-9]*)$/.exec(url.pathname);
        if (exportMatch) {
          const key = exportMatch[1];
          if (!ATLAS_EXPORT_KEYS.includes(key as AtlasExportKey))
            throw new TypeError(`unexpected_export:${key}`);
          body =
            corruptServantBody && key === 'nice_servant'
              ? Buffer.from('{}')
              : await readFile(join(observedDirectory, `${key}.json`));
        } else if (skillMatch) {
          const id = Number(skillMatch[1]);
          if (!certificate.referencedSkills.some((entry) => entry.id === id))
            throw new TypeError(`unexpected_skill:${String(id)}`);
          body = await readFile(join(observedDirectory, 'referenced_skills', `${String(id)}.json`));
        } else throw new TypeError(`unexpected_atlas_url:${url.pathname}`);
        atlasBodyRequests++;
        atlasBytes += body.byteLength;
      }
      await route.fulfill({
        status: 200,
        body,
        headers: {
          'content-type':
            url.hostname === 'raw.githubusercontent.com' ? 'text/plain' : 'application/json',
          'access-control-allow-origin': '*',
          'cache-control': 'no-store',
        },
      });
    },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  const browserDigest = async () =>
    page.evaluate(async (contract) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('fgo-lab', 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const stored = await new Promise<{ snapshotBytes: ArrayBuffer }>((resolve, reject) => {
          const request = database
            .transaction('master', 'readonly')
            .objectStore('master')
            .get(`atlas-active:${contract}`);
          request.onsuccess = () => resolve(request.result as { snapshotBytes: ArrayBuffer });
          request.onerror = () => reject(request.error);
        });
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', stored.snapshotBytes));
        return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      } finally {
        database.close();
      }
    }, certificate.contractSha256);

  await page.goto(baseUrl);
  await page.getByRole('button', { name: 'セットアップを開始' }).click();
  await page.getByRole('heading', { name: 'ホーム' }).waitFor({ state: 'visible' });
  const initialDigest = await browserDigest();
  if (initialDigest !== nodeSha256)
    throw new TypeError(`atlas_worker_probe:worker_digest_mismatch:${initialDigest}:${nodeSha256}`);
  if (atlasBodyRequests !== ATLAS_EXPORT_KEYS.length + certificate.referencedSkills.length)
    throw new TypeError(`atlas_worker_probe:unexpected_body_requests:${String(atlasBodyRequests)}`);

  await page.goto(new URL('/calculator', baseUrl).href);
  await page.getByRole('table', { name: '宝具レベル別のダメージ' }).waitFor({ state: 'visible' });
  await page.goto(new URL('/ranking', baseUrl).href);
  await page.getByRole('list', { name: '宝具火力ランキング' }).waitFor({ state: 'visible' });

  await page.reload();
  await page.getByRole('list', { name: '宝具火力ランキング' }).waitFor({ state: 'visible' });
  if (atlasBodyRequests !== ATLAS_EXPORT_KEYS.length + certificate.referencedSkills.length)
    throw new TypeError('atlas_worker_probe:unchanged_refetched_bodies');

  generation++;
  corruptServantBody = true;
  await page.reload();
  await page.getByRole('list', { name: '宝具火力ランキング' }).waitFor({ state: 'visible' });
  await page.getByText(/Atlas更新の確認に失敗したため検証済みのマスターを使用中/).waitFor();
  if ((await browserDigest()) !== initialDigest)
    throw new TypeError('atlas_worker_probe:failed_update_replaced_active');
  process.stdout.write(
    `${JSON.stringify({
      nodeSha256,
      workerSha256: initialDigest,
      certificateRequests,
      atlasBodyRequests,
      atlasBytes,
      servants: nodeMaster.servants.length,
      craftEssences: nodeMaster.craftEssences.length,
    })}\n`,
  );
} finally {
  await browser.close();
}
