import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import {
  ATLAS_EXPORT_KEYS,
  certifiedMasterSnapshotSchema,
  sourceCertificateSchema,
  validateMasterSnapshot,
  type SourceCertificate,
} from '../packages/master-data/src/index';
import {
  certifiedSourceVersion,
  normalizeRawCombatRules,
} from '../packages/data-pipeline/src/browser';
import { ATLAS_CONTRACT_SHA256 } from '../apps/web/src/adapters/atlasContractFingerprint';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

let fixturePromise: Promise<{ certificate: SourceCertificate; snapshot: string }> | undefined;

async function fixture() {
  fixturePromise ??= (async () => {
    const [masterText, rawText] = await Promise.all([
      readFile(resolve('packages/test-fixtures/production-master/master.json'), 'utf8'),
      readFile(
        resolve('packages/data-pipeline/test-fixtures/raw-combat-rules-5d3cbc.json'),
        'utf8',
      ),
    ]);
    const provisional = sourceCertificateSchema.parse({
      format: 'fgo-lab-atlas-source-v1',
      region: 'JP',
      generation: 1,
      publishedAt: '2026-10-13T05:00:00.000Z',
      observedAt: '2026-10-13T04:00:00.000Z',
      rawCommit: '5d3cbcc79ebcea42ec99dbecd5279e6e64effa3c',
      rawCommittedAt: '2026-10-12T15:00:00.000Z',
      exporterCommit: '35cadc444e20c78cc60e56082ad1b64607d4d2e2',
      publisherCommit: 'a'.repeat(40),
      contractSha256: ATLAS_CONTRACT_SHA256,
      masterSchemaVersion: 57,
      canonicalSha256: '0'.repeat(64),
      exports: ATLAS_EXPORT_KEYS.map((key) => ({ key, bytes: 2, sha256: digest(key) })),
      referencedSkills: [],
    });
    const parsed = JSON.parse(masterText) as Record<string, unknown>;
    parsed['version'] = certifiedSourceVersion(provisional);
    parsed['combatRules'] = normalizeRawCombatRules(JSON.parse(rawText) as unknown);
    const canonical = certifiedMasterSnapshotSchema.parse(parsed);
    const validation = validateMasterSnapshot(canonical);
    if (!validation.valid)
      throw new TypeError(`atlas_test_fixture_invalid:${JSON.stringify(validation.errors)}`);
    const snapshot = JSON.stringify(canonical);
    const certificate = sourceCertificateSchema.parse({
      ...provisional,
      canonicalSha256: digest(snapshot),
    });
    return { certificate, snapshot };
  })();
  return fixturePromise;
}

/** Seeds a certified local master; source transport is covered by the separate Worker probe. */
export async function seedAtlasFixture(
  context: BrowserContext,
  page: Page,
  baseURL: string,
): Promise<void> {
  const { certificate, snapshot } = await fixture();
  await context.route(
    'https://raw.githubusercontent.com/ivgtr/fgo-lab/atlas-certificates/JP/**',
    (route) =>
      route.fulfill({
        contentType: 'text/plain',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(certificate),
      }),
  );
  await context.route('**/__atlas_test_seed__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Atlas test seed</title>',
    }),
  );
  await page.goto(new URL('/__atlas_test_seed__', baseURL).href);
  await page.evaluate(
    async ({ certificate, snapshot, contract, certificateSha256 }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const opening = indexedDB.open('fgo-lab', 2);
        opening.onerror = () => reject(opening.error);
        opening.onupgradeneeded = () => {
          for (const name of ['meta', 'master', 'staging', 'user'])
            if (!opening.result.objectStoreNames.contains(name))
              opening.result.createObjectStore(name);
        };
        opening.onsuccess = () => resolve(opening.result);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('master', 'readwrite');
          tx.onerror = () => reject(tx.error);
          tx.oncomplete = () => resolve();
          tx.objectStore('master').put(
            {
              format: 'fgo-lab-atlas-active-v1',
              certificate,
              certificateSha256,
              snapshotBytes: new TextEncoder().encode(snapshot).buffer,
              activatedAt: '2026-10-13T05:00:00.000Z',
            },
            `atlas-active:${contract}`,
          );
        });
      } finally {
        db.close();
      }
    },
    {
      certificate,
      snapshot,
      contract: ATLAS_CONTRACT_SHA256,
      certificateSha256: digest(JSON.stringify(certificate)),
    },
  );
}
