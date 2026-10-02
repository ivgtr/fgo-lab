import { expect, test } from './observedTest';
import { openTestHome } from './setup';

test('[E2E-051] initial OC commands, keyboard, responsive detail and reset @desktop @journey', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openTestHome(page);
  await page.getByRole('button', { name: '火力ランキング', exact: true }).click();
  const oc = page.getByRole('combobox', { name: '初期OC', exact: true });
  const np = page.getByRole('combobox', { name: '宝具Lv', exact: true });
  // E2E-A051-COMMAND
  await expect(oc.locator('option')).toHaveCount(1);
  await np.selectOption('5');
  await expect(oc.locator('option')).toHaveCount(3);
  await page.getByText('計算基準', { exact: true }).click();
  const calculationBasis = page.locator('.ranking-calculation-basis');
  await oc.selectOption('2');
  await expect(calculationBasis).toContainText('初期OC2・スキルLv10');
  await page.setViewportSize({ width: 320, height: 700 });
  await oc.focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(oc).toHaveValue('3');
  await expect(calculationBasis).toContainText('初期OC3・スキルLv10');
  await expect(page).toHaveURL(/rOc=3/);
  await expect(page.getByRole('status')).toContainText('件を計算', { timeout: 30_000 });
  const first = page
    .getByRole('list', { name: '宝具火力ランキング' })
    .getByRole('listitem')
    .first();
  await first.getByRole('button', { name: /の計算詳細を開く/ }).click();
  const detail = first.getByRole('region', { name: /の計算詳細/ });
  await expect(detail).toContainText(/開始NP\s*300%/, { timeout: 15_000 });
  await expect(detail).toContainText('発動時OC');
  // E2E-A051-VIEWPORT
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(oc).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  // E2E-A051-RESET
  await page.getByRole('combobox', { name: '対象', exact: true }).selectOption('owned');
  await np.selectOption('owned');
  await page.getByRole('combobox', { name: '対象', exact: true }).selectOption('all');
  await expect(np).toHaveValue('1');
  await expect(oc).toHaveValue('1');
  await expect(calculationBasis).toContainText('初期OC1・スキルLv10');
  const invalid = new URL(page.url());
  invalid.searchParams.set('rOc', '5');
  await page.goto(invalid.toString());
  await page.getByRole('button', { name: '計算条件をリセット' }).click();
  await expect(page.getByRole('status')).toBeFocused();
  await expect(page.getByRole('combobox', { name: '初期OC', exact: true })).toHaveValue('1');
  await expect(page.getByRole('combobox', { name: '宝具Lv', exact: true })).toHaveValue('1');
});
