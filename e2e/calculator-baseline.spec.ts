import { expect, test, type Page } from '@playwright/test';
import { completeSetup } from './setup';

async function openCalculator(page: Page) {
  await page.route('https://static.atlasacademy.io/**', (route) => route.abort());
  await page.goto('/');
  await completeSetup(page);
  await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible();
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
}

test('calculator desktop UI baseline', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The desktop project owns both explicit viewport baselines');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openCalculator(page);
  await expect(page).toHaveScreenshot('calculator-desktop.png', { fullPage: true });
});

test('calculator 320px UI baseline', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The desktop project owns both explicit viewport baselines');
  await page.setViewportSize({ width: 320, height: 700 });
  await openCalculator(page);
  await expect(page).toHaveScreenshot('calculator-320px.png', { fullPage: true });
});
