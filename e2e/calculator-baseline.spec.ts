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

test('selected effect state remains visible at 390px', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The desktop project owns the explicit 390px interaction baseline');
  await page.setViewportSize({ width: 390, height: 844 });
  await openCalculator(page);
  const firstSkill = page.getByLabel('攻撃役の自身スキル').getByRole('listitem').first();
  await firstSkill.getByRole('button', { name: '使用する' }).click();
  const ownEffects = page.getByRole('group', { name: /自身の適用内容/ });
  await expect(ownEffects.getByRole('button', { name: /攻撃力アップ/ }).first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(ownEffects).toHaveScreenshot('selected-effects-390px.png');
});
