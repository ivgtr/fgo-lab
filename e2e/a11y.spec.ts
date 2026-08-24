import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
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

test('@a11y major desktop screens have no serious axe violations', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop navigation covers every R1 screen');
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  if (await setup.isVisible()) await setup.click();
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
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expectNoSeriousViolations(page);
  }
});

test('@a11y mobile home and calculator have no serious axe violations', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  if (await setup.isVisible()) await setup.click();
  await expectNoSeriousViolations(page);
  await page.getByRole('button', { name: '計算', exact: true }).click();
  await expectNoSeriousViolations(page);
});
