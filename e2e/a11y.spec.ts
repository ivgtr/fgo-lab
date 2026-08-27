import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { completeSetup } from './setup';
import type { Page } from '@playwright/test';

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const violations = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

test('@a11y startup screen has no serious axe violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.startup-screen')).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('@a11y major desktop screens have no serious axe violations', async ({ page, isMobile }) => {
  test.setTimeout(60_000);
  test.skip(isMobile, 'Desktop navigation covers every R1 screen');
  await page.goto('/');
  await completeSetup(page);
  for (const name of [
    'ホーム',
    'ダメージ計算',
    '火力ランキング',
    '所持・育成',
    '概念礼装',
    '支援条件',
    '育成計画',
    'データ管理',
  ]) {
    await page.getByRole('button', { name }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expectNoSeriousViolations(page);
  }
});

test('@a11y mobile home and calculator have no serious axe violations', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await completeSetup(page);
  await expectNoSeriousViolations(page);
  await page.getByRole('button', { name: '計算', exact: true }).click();
  await expectNoSeriousViolations(page);
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  await expectNoSeriousViolations(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /礼装なし・選択する/ }).click();
  await expectNoSeriousViolations(page);
});
