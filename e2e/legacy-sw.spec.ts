import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from './observedTest';
import { completeSetup } from './setup';

test('[E2E-057] old service worker blocks Atlas and clears its cache on upgrade @desktop @journey', async ({
  context,
  page,
}) => {
  test.setTimeout(90_000);
  const oldScript = await readFile(resolve('packages/test-fixtures/legacy-sw-v4.js'), 'utf8');
  const newScript = await readFile(resolve('apps/web/public/sw.js'), 'utf8');
  let serveOld = true;
  await context.route('**/sw.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: serveOld ? oldScript : newScript,
    }),
  );
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        }),
      );
  });
  let certificateRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'raw.githubusercontent.com') certificateRequests++;
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'セットアップを開始' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('.startup-screen__notice')).toContainText(
    '旧Service Workerの更新を待っています',
  );
  expect(certificateRequests).toBe(0);
  await page.evaluate(async () => {
    const oldCache = await caches.open('fgo-lab-shell-v4');
    await oldCache.put(
      'https://api.atlasacademy.io/export/JP/nice_servant.json',
      new Response('{}', { headers: { 'content-type': 'application/json' } }),
    );
  });
  serveOld = false;
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) throw new Error('old_service_worker_missing');
    await registration.update();
  });
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const controller = navigator.serviceWorker.controller;
          if (!controller) return null;
          return new Promise<number | null>((resolve) => {
            const channel = new MessageChannel();
            const timer = setTimeout(() => resolve(null), 500);
            channel.port1.onmessage = (event) => {
              clearTimeout(timer);
              resolve(event.data?.version ?? null);
            };
            controller.postMessage({ kind: 'fgo-lab-atlas-controller-check' }, [channel.port2]);
          });
        }),
      { timeout: 15_000 },
    )
    .toBe(5);
  await expect
    .poll(() => page.evaluate(async () => caches.keys()))
    .not.toContain('fgo-lab-shell-v4');
  await page.reload();
  await completeSetup(page);
  await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible();
  expect(certificateRequests).toBeGreaterThan(0);
});
