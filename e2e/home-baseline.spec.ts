import { expect, test } from './observedTest';
import { openTestHome } from './setup';

test('[E2E-065] home desktop UI baseline @desktop @vrt', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTestHome(page);
  await expect(page.locator('.home-grid')).toBeVisible();
  await expect(page).toHaveScreenshot('home-desktop.png');
});

test('[E2E-066] home mobile shows the main action @mobile @vrt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTestHome(page);
  await expect(page.getByRole('button', { name: '新しい計算を始める' })).toBeInViewport();
  await expect(page).toHaveScreenshot('home-390px.png');
});

test('[E2E-067] setup mobile UI baseline @mobile @vrt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'セットアップを開始' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page).toHaveScreenshot('setup-390px.png');
});
