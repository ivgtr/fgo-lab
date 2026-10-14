import { expect, test } from './observedTest';
import { writeFileSync } from 'node:fs';

const consoleTypes = ['log', 'info', 'debug', 'warn', 'error', 'assert'] as const;

async function emitConsole(page: import('@playwright/test').Page, identity: string) {
  await page.goto('data:text/html,<title>observer fixture</title>');
  await page.evaluate(
    ({ types, prefix }) => {
      for (const type of types) {
        if (type === 'assert') console.assert(false, `${prefix}:${type}`);
        else console[type](`${prefix}:${type}`);
      }
    },
    { types: consoleTypes, prefix: identity },
  );
}

async function startHeldFetch(page: import('@playwright/test').Page) {
  await page.route('https://fixture.invalid/', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>active request</title>' }),
  );
  await page.goto('https://fixture.invalid/');
  await page.route('https://fixture.invalid/abort', () => {});
  const failed = page.waitForEvent(
    'requestfailed',
    (request) => request.url() === 'https://fixture.invalid/abort',
  );
  const started = page.waitForRequest('https://fixture.invalid/abort');
  await page.evaluate(() => {
    const controller = new AbortController();
    (window as typeof window & { abortFixture?: () => void }).abortFixture = () =>
      controller.abort();
    fetch('https://fixture.invalid/abort', { signal: controller.signal }).catch(() => {});
  });
  await started;
  return {
    failed,
    abort: () =>
      page.evaluate(() => (window as typeof window & { abortFixture: () => void }).abortFixture()),
  };
}

test('default page captures every supported console type', async ({ page }) => {
  await emitConsole(page, 'default');
  const popupPromise = page.waitForEvent('popup');
  await page.evaluate(() => window.open('about:blank'));
  const popup = await popupPromise;
  const popupError = popup.waitForEvent('pageerror');
  await popup.evaluate(() => {
    console.log('popup:log');
    setTimeout(() => {
      throw new Error('popup:pageerror');
    });
  });
  await popupError;
});

test('manual context page uses the same observer', async ({ newObservedPage }, testInfo) => {
  const { page } = await newObservedPage();
  await emitConsole(page, 'manual');
  await page.route('https://fixture.invalid/image.png', (route) => route.abort('failed'));
  await page.setContent('<img src="https://fixture.invalid/image.png">');
  await expect.poll(() => page.locator('img').evaluate((image) => image.complete)).toBe(true);
  const attachmentPath = testInfo.outputPath('fixture.txt');
  writeFileSync(attachmentPath, 'abc');
  await testInfo.attach('physical fixture', { path: attachmentPath, contentType: 'text/plain' });
});

test('an active fetch abort after a same-document URL change remains a resource failure', async ({
  page,
}) => {
  const { failed, abort } = await startHeldFetch(page);
  const changedUrl = page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame());
  await page.evaluate(() => {
    location.hash = 'changed';
  });
  await changedUrl;
  await abort();
  await failed;
});

test('an active fetch abort after a failed document navigation remains a resource failure', async ({
  page,
}) => {
  const { failed, abort } = await startHeldFetch(page);
  await page.route('https://fixture.invalid/fail', (route) => route.abort('aborted'));
  await expect(page.goto('https://fixture.invalid/fail')).rejects.toThrow();
  await expect(page).toHaveURL('https://fixture.invalid/');
  await abort();
  await failed;
});

test('a hash change during a pending reload does not hide an active fetch abort', async ({
  page,
}) => {
  const { failed } = await startHeldFetch(page);
  const controller = await page.context().newPage();
  await controller.route('https://fixture.invalid/', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>controller</title>' }),
  );
  await controller.goto('https://fixture.invalid/');
  await page.evaluate(() => {
    const channel = new BroadcastChannel('observer-reload-fixture');
    channel.onmessage = () => {
      location.hash = 'changed';
      (window as typeof window & { abortFixture: () => void }).abortFixture();
    };
  });
  let releaseReload!: () => void;
  const reloadHeld = new Promise<void>((resolve) => {
    releaseReload = resolve;
  });
  await page.route('https://fixture.invalid/', async (route) => {
    await reloadHeld;
    await route.fulfill({ contentType: 'text/html', body: '<title>reloaded</title>' });
  });
  const reloadRequest = page.waitForRequest(
    (request) => request.isNavigationRequest() && request.url() === 'https://fixture.invalid/',
  );
  const hashChange = page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame());
  const reload = page.reload();
  await reloadRequest;
  await controller.evaluate(() => {
    const channel = new BroadcastChannel('observer-reload-fixture');
    channel.postMessage('change');
    channel.close();
  });
  await hashChange;
  await failed;
  releaseReload();
  await reload;
  await controller.close();
});
