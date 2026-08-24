import { expect, test } from '@playwright/test';

test('diagnostic setup and main calculation flow', async ({ page }) => {
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  if (await setup.isVisible()) await setup.click();
  await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible();
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
  await expect(page.getByRole('row', { name: /NP1.*現在/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('works at 320px without horizontal document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  if (await setup.isVisible()) await setup.click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test('persists servant, target, CE copies, and support templates', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop navigation covers all management pages');
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  if (await setup.isVisible()) await setup.click();

  await page.getByRole('button', { name: '所持・育成' }).click();
  await page.getByLabel('宝具Lv').selectOption('1');
  await expect(page.getByRole('button', { name: /検証用セイバー.*NP1/ })).toBeVisible();
  await page.getByRole('tab', { name: '育成目標' }).click();
  await page.getByLabel('レベル').fill('90');
  await page.getByLabel('育成計画へ含める').check();

  await page.getByRole('button', { name: '概念礼装' }).click();
  await page.getByRole('button', { name: 'DBから礼装を登録' }).click();
  await page.getByRole('button', { name: 'DBから礼装を登録' }).click();
  await expect(
    page.getByRole('list', { name: '登録済み概念礼装' }).getByRole('listitem'),
  ).toHaveCount(2);

  await page.getByRole('button', { name: '支援条件' }).click();
  await page.getByRole('button', { name: '支援条件を作成' }).click();
  await expect(
    page.getByRole('list', { name: '保存済み支援条件' }).getByRole('listitem'),
  ).toContainText('支援条件 1');

  await page.reload();
  await page.getByRole('button', { name: '概念礼装' }).click();
  await expect(
    page.getByRole('list', { name: '登録済み概念礼装' }).getByRole('listitem'),
  ).toHaveCount(2);
});
