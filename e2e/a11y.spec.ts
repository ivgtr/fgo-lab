import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './observedTest';
import { openTestHome } from './setup';
import type { Page } from './observedTest';

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const violations = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

test('[E2E-001] startup screen @desktop @a11y', async ({ newObservedPage }) => {
  const { context, page } = await newObservedPage({
    storageState: { cookies: [], origins: [] },
  });
  try {
    await page.goto('/');
    await expect(page.locator('.startup-screen')).toBeVisible();
    await expectNoSeriousViolations(page);
    const notFound = await page.request.get('/route-that-does-not-exist');
    expect(notFound.status()).toBe(404);
    expect(await notFound.text()).toContain('ページが見つかりません');
  } finally {
    await context.close();
  }
});

test('[E2E-002] major desktop screens @desktop @a11y', async ({ page }) => {
  test.setTimeout(60_000);
  await openTestHome(page);
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
    if (name === '火力ランキング') {
      await expect(page.getByRole('status')).toContainText('件を計算', { timeout: 30_000 });
      const first = page
        .getByRole('list', { name: '宝具火力ランキング' })
        .getByRole('listitem')
        .first();
      await first.getByRole('button', { name: /の計算詳細を開く/ }).click();
      await expect(first.getByRole('region', { name: /の計算詳細/ })).toBeVisible({
        timeout: 15_000,
      });
      await expectNoSeriousViolations(page);
      await first.getByRole('button', { name: /の計算詳細を閉じる/ }).click();
    }
  }
});

test('[E2E-003] mobile home and calculator @mobile @a11y', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openTestHome(page);
  await expectNoSeriousViolations(page);
  await page.getByRole('button', { name: '計算', exact: true }).click();
  await expectNoSeriousViolations(page);
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  await expectNoSeriousViolations(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /礼装なし・選択する/ }).click();
  await expectNoSeriousViolations(page);
});
