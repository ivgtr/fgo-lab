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
