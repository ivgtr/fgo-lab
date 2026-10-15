import { expect, test, testUnseeded, type Page } from './observedTest';
import { completeSetup } from './setup';
import { loadObservedAtlasFixture } from './atlasObservedFixture';
import { ATLAS_EXPORT_KEYS, type AtlasExportKey } from '../packages/master-data/src/index';
import { ATLAS_CONTRACT_SHA256 } from '../apps/web/src/adapters/atlasContractFingerprint';
import { markDeliveredAtlasFixtureResponse } from './atlasFixtureResponse';

async function storedAtlasDigest(page: Page): Promise<string> {
  return page.evaluate(async (contract) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('fgo-lab', 2);
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => resolve(opening.result);
    });
    try {
      const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        const request = db
          .transaction('master', 'readonly')
          .objectStore('master')
          .get(`atlas-active:${contract}`);
        request.onerror = () => reject(request.error);
        request.onsuccess = () =>
          resolve((request.result as { snapshotBytes: ArrayBuffer }).snapshotBytes);
      });
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      return [...hash].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    } finally {
      db.close();
    }
  }, ATLAS_CONTRACT_SHA256);
}

testUnseeded(
  '[E2E-056] Atlas bytes to Worker, storage, calculator and ranking @desktop @journey',
  async ({ page, context }) => {
    testUnseeded.setTimeout(180_000);
    const fixture = await loadObservedAtlasFixture();
    let generation = 1;
    let corruptServantBody = false;
    let atlasBodyRequests = 0;
    let atlasIdentityBytes = 0;
    const pendingSourceRequests = new Set<object>();
    let lastSourceActivity = Date.now();
    const sourceRequest = (url: string) =>
      ['api.atlasacademy.io', 'raw.githubusercontent.com'].includes(new URL(url).hostname);
    context.on('request', (request) => {
      if (sourceRequest(request.url())) {
        pendingSourceRequests.add(request);
        lastSourceActivity = Date.now();
      }
    });
    context.on('requestfinished', (request) => {
      if (pendingSourceRequests.delete(request)) {
        lastSourceActivity = Date.now();
      }
    });
    context.on('requestfailed', (request) => {
      if (pendingSourceRequests.delete(request)) {
        lastSourceActivity = Date.now();
      }
    });
    const waitForSourceIdle = () =>
      expect
        .poll(() => pendingSourceRequests.size === 0 && Date.now() - lastSourceActivity >= 500, {
          timeout: 15_000,
        })
        .toBe(true);
    try {
      await context.route(
        /^https:\/\/(?:api\.atlasacademy\.io|raw\.githubusercontent\.com)\//,
        async (route) => {
          const url = new URL(route.request().url());
          if (url.hostname === 'raw.githubusercontent.com') {
            expect(url.pathname).toBe(
              `/ivgtr/fgo-lab/atlas-certificates/JP/${ATLAS_CONTRACT_SHA256}.json`,
            );
            await route.fulfill({
              contentType: 'text/plain',
              headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
              body: JSON.stringify({ ...fixture.certificate, generation }),
            });
            markDeliveredAtlasFixtureResponse(route.request());
            return;
          }
          const exportMatch = /^\/export\/JP\/([A-Za-z_]+)\.json$/.exec(url.pathname);
          const skillMatch = /^\/nice\/JP\/skill\/([1-9][0-9]*)$/.exec(url.pathname);
          if (exportMatch) expect(ATLAS_EXPORT_KEYS).toContain(exportMatch[1] as AtlasExportKey);
          else expect(skillMatch).not.toBeNull();
          const recorded = fixture.bodies.get(url.pathname);
          expect(recorded, url.pathname).toBeDefined();
          const body =
            corruptServantBody && url.pathname === '/export/JP/nice_servant.json'
              ? Buffer.from('{}')
              : recorded!;
          atlasBodyRequests++;
          atlasIdentityBytes += body.byteLength;
          await route.fulfill({
            body,
            headers: {
              'content-type': 'application/json',
              'access-control-allow-origin': '*',
              'cache-control': 'no-store',
            },
          });
          markDeliveredAtlasFixtureResponse(route.request());
        },
      );
      await page.route('https://static.atlasacademy.io/**', (route) =>
        route.fulfill({
          contentType: 'image/png',
          body: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=',
            'base64',
          ),
        }),
      );
      await page.goto('/');
      await completeSetup(page);
      expect(await storedAtlasDigest(page)).toBe(fixture.canonicalSha256);
      const completeBodyCount =
        ATLAS_EXPORT_KEYS.length + fixture.certificate.referencedSkills.length;
      expect(atlasBodyRequests).toBe(completeBodyCount);
      await page.getByRole('button', { name: '所持・育成' }).click();
      await page.getByLabel('名前で検索').fill('アルトリア・ペンドラゴン');
      await page
        .getByRole('list', { name: 'サーヴァント一覧' })
        .getByRole('listitem')
        .first()
        .click();
      await page.getByLabel('宝具Lv').selectOption('1');
      await expect(page.getByLabel('宝具Lv')).toHaveValue('1');
      await page.getByRole('button', { name: 'ダメージ計算' }).click();
      await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
      await waitForSourceIdle();
      await page.goto(
        '/ranking?rGrowth=common&rPopulation=owned&rLevelBasis=naturalLimit&rNpBasis=1&rOc=1&rAffinity=neutral&rSelf=included&rConditional=baseline',
      );
      await expect(page.getByRole('list', { name: '宝具火力ランキング' })).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole('button', { name: 'ホーム', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible();
      await waitForSourceIdle();
      await page.reload();
      await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible({ timeout: 15_000 });
      expect(atlasBodyRequests).toBe(completeBodyCount);
      generation = 2;
      corruptServantBody = true;
      await waitForSourceIdle();
      await page.reload();
      await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByText(
          /Atlas更新の確認に失敗したため検証済みのマスターを使用中: atlas_source:export_digest_mismatch:nice_servant/,
        ),
      ).toBeVisible();
      expect(await storedAtlasDigest(page)).toBe(fixture.canonicalSha256);
      expect(atlasIdentityBytes).toBeGreaterThan(0);
      await waitForSourceIdle();
      await page.waitForLoadState('networkidle');
    } finally {
      await fixture.cleanup();
    }
  },
);

test('[E2E-058] certified Atlas update preserves the saved profile @desktop @journey', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const fixture = await loadObservedAtlasFixture();
  let atlasBodyRequests = 0;
  const pendingAtlasRequests = new Set<object>();
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'api.atlasacademy.io')
      pendingAtlasRequests.add(request);
  });
  page.on('requestfinished', (request) => pendingAtlasRequests.delete(request));
  page.on('requestfailed', (request) => pendingAtlasRequests.delete(request));
  const waitForAtlasIdle = () =>
    expect.poll(() => pendingAtlasRequests.size, { timeout: 15_000 }).toBe(0);
  try {
    await page.goto('/');
    await completeSetup(page);
    const previousDigest = await storedAtlasDigest(page);
    expect(previousDigest).not.toBe(fixture.canonicalSha256);
    await page.getByRole('button', { name: '所持・育成' }).click();
    await page.getByLabel('名前で検索').fill('アルトリア・ペンドラゴン');
    await page
      .getByRole('list', { name: 'サーヴァント一覧' })
      .getByRole('listitem')
      .first()
      .click();
    await page.getByLabel('宝具Lv').selectOption('1');
    const savedProfile = async () =>
      page.evaluate(
        () =>
          new Promise<string>((resolve, reject) => {
            const opening = indexedDB.open('fgo-lab', 2);
            opening.onerror = () => reject(opening.error);
            opening.onsuccess = () => {
              const db = opening.result;
              const request = db
                .transaction('user', 'readonly')
                .objectStore('user')
                .get('profiles');
              request.onerror = () => {
                db.close();
                reject(request.error);
              };
              request.onsuccess = () => {
                db.close();
                resolve(JSON.stringify(request.result));
              };
            };
          }),
      );
    await expect
      .poll(async () => {
        const collection = JSON.parse(await savedProfile()) as {
          profiles: Array<{ servantBuilds: Record<string, { npLevel: number }> }>;
        };
        return Object.values(collection.profiles[0]!.servantBuilds).some(
          (build) => build.npLevel === 1,
        );
      })
      .toBe(true);
    const beforeProfile = await savedProfile();
    await page.getByRole('button', { name: 'ホーム', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible();
    await page.route(
      /^https:\/\/(?:api\.atlasacademy\.io|raw\.githubusercontent\.com)\//,
      async (route) => {
        const url = new URL(route.request().url());
        if (url.hostname === 'raw.githubusercontent.com') {
          expect(url.pathname).toBe(
            `/ivgtr/fgo-lab/atlas-certificates/JP/${ATLAS_CONTRACT_SHA256}.json`,
          );
          await route.fulfill({
            contentType: 'text/plain',
            headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
            body: JSON.stringify({ ...fixture.certificate, generation: 2 }),
          });
          markDeliveredAtlasFixtureResponse(route.request());
          return;
        }
        const body = fixture.bodies.get(url.pathname);
        expect(body, url.pathname).toBeDefined();
        atlasBodyRequests++;
        await route.fulfill({
          body,
          headers: {
            'content-type': 'application/json',
            'access-control-allow-origin': '*',
            'cache-control': 'no-store',
          },
        });
        markDeliveredAtlasFixtureResponse(route.request());
      },
    );
    await page.route('https://static.atlasacademy.io/**', (route) =>
      route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=',
          'base64',
        ),
      }),
    );
    await page.reload();
    await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible({ timeout: 30_000 });
    expect(await storedAtlasDigest(page)).toBe(fixture.canonicalSha256);
    expect(atlasBodyRequests).toBe(
      ATLAS_EXPORT_KEYS.length + fixture.certificate.referencedSkills.length,
    );
    expect(await savedProfile()).toBe(beforeProfile);
    await waitForAtlasIdle();
    await page.getByRole('button', { name: 'ダメージ計算' }).click();
    await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
    await waitForAtlasIdle();
    await page.goto(
      '/ranking?rGrowth=common&rPopulation=owned&rLevelBasis=naturalLimit&rNpBasis=1&rOc=1&rAffinity=neutral&rSelf=included&rConditional=baseline',
    );
    await expect(page.getByRole('list', { name: '宝具火力ランキング' })).toBeVisible({
      timeout: 30_000,
    });
    await waitForAtlasIdle();
    await page.waitForLoadState('networkidle');
  } finally {
    await fixture.cleanup();
  }
});
