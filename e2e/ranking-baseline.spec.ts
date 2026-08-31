import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { completeSetup } from './setup';

async function openRanking(
  page: Page,
  width: number,
  height: number,
  iconMode: 'fixture' | 'fallback' = 'fixture',
  waitForResult = true,
) {
  await page.setViewportSize({ width, height });
  await page.route('https://static.atlasacademy.io/**', (route) =>
    iconMode === 'fixture'
      ? route.fulfill({
          path: resolve(process.cwd(), 'apps/web/public/filter-icons/class/saber.png'),
          contentType: 'image/png',
        })
      : route.abort(),
  );
  await page.goto('/');
  await completeSetup(page);
  const rankingButton = page.getByRole('button', { name: '火力ランキング' });
  if (await rankingButton.isVisible()) await rankingButton.click();
  else {
    await page.getByRole('button', { name: 'その他' }).click();
    await page.getByLabel('その他の機能').getByRole('button', { name: '火力ランキング' }).click();
  }
  if (waitForResult)
    await expect(page.getByRole('status')).toContainText('433件表示 / 433件を計算', {
      timeout: 30_000,
    });
}

test('ranking gives the initial calculation a dedicated loading surface', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(60_000);
  test.skip(isMobile, 'The desktop project owns the loading presentation baseline');
  await openRanking(page, 1440, 1000, 'fixture', false);
  await expect(page.locator('.ranking-loading')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('ランキングを更新中');
});

test('ranking keeps single and all-target variants as independent entries', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(60_000);
  test.skip(isMobile, 'The desktop project owns the target-scope entry contract');
  await openRanking(page, 1440, 1000);
  const filters = page.getByRole('region', { name: 'ランキングの表示絞り込み' });
  await filters.getByText('絞り込み', { exact: true }).click();
  const clearButton = filters.getByRole('button', { name: '絞り込みを解除' });
  const targetSelect = filters.getByLabel('宝具範囲');
  const [clearBox, targetBox] = await Promise.all([
    clearButton.boundingBox(),
    targetSelect.boundingBox(),
  ]);
  expect(clearBox?.height).toBe(targetBox?.height);
  await filters.getByLabel('名前検索').fill('玉兎');
  const list = page.getByRole('list', { name: '宝具火力ランキング' });
  const jadeRows = list.getByRole('listitem').filter({ hasText: '玉兎' });
  await expect(jadeRows).toHaveCount(2);
  await expect(jadeRows.filter({ hasText: '単体・末那識・十六夜残花' })).toHaveCount(1);
  await expect(jadeRows.filter({ hasText: '全体・末那識・十六夜残花' })).toHaveCount(1);

  await filters.getByLabel('宝具範囲').selectOption('single');
  await expect(jadeRows).toHaveCount(1);
  await expect(jadeRows.first()).toContainText('単体');
  await filters.getByLabel('宝具範囲').selectOption('all');
  await expect(jadeRows).toHaveCount(1);
  await expect(jadeRows.first()).toContainText('全体');
});

test('ranking exposes only five calculation policies in keyboard order', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(60_000);
  test.skip(isMobile, 'The desktop project owns the semantic controls baseline');
  await openRanking(page, 1440, 1000);
  const conditions = page.getByRole('region', { name: 'ランキングの計算条件' });
  const controls = conditions.getByRole('combobox');
  await expect(controls).toHaveCount(5);
  await expect(conditions.getByLabel('比較')).toHaveValue('standard');
  await expect(conditions.getByLabel('宝具Lv')).toHaveValue('1');
  await expect(conditions.getByLabel('クラス相性')).toHaveValue('neutral');
  await expect(conditions.getByLabel('自己バフ')).toHaveValue('included');
  await expect(conditions.getByLabel('条件効果')).toHaveValue('baseline');
  await expect(conditions.getByLabel('特攻')).toHaveCount(0);
  await expect(conditions.getByLabel('フィールド')).toHaveCount(0);
  await expect(conditions).toContainText('自然上限・Fou1000');
  await expect(conditions).toContainText('OC1・スキルLv10');
  await conditions.getByText('計算基準', { exact: true }).click();
  await expect(conditions.locator('.ranking-calculation-basis')).toBeVisible();
  await expect(conditions.locator('input')).toHaveCount(0);
  await controls.first().focus();
  for (let index = 0; index < 5; index += 1) {
    await expect(controls.nth(index)).toBeFocused();
    await page.keyboard.press('Tab');
  }
  await expect(conditions.getByText('計算基準', { exact: true })).toBeFocused();
});

test('ranking icon fallback is deterministic', async ({ page, isMobile }) => {
  test.setTimeout(60_000);
  test.skip(isMobile, 'The desktop project owns the icon fallback baseline');
  await openRanking(page, 390, 844, 'fallback');
  await expect(
    page.getByRole('list', { name: '宝具火力ランキング' }).getByRole('listitem').first(),
  ).toHaveScreenshot('ranking-row-icon-fallback-390px.png');
});

test('ranking desktop UI baseline', async ({ page, isMobile }) => {
  test.setTimeout(60_000);
  test.skip(isMobile, 'The desktop project owns the explicit viewport baselines');
  await openRanking(page, 1440, 1000);
  await expect(page).toHaveScreenshot('ranking-desktop.png');
  const first = page
    .getByRole('list', { name: '宝具火力ランキング' })
    .getByRole('listitem')
    .first();
  await first.getByRole('button', { name: /の計算詳細を開く/ }).click();
  await expect(first.getByRole('region', { name: /の計算詳細/ })).toContainText('最低', {
    timeout: 15_000,
  });
  await expect(page).toHaveScreenshot('ranking-detail-desktop.png');
});

test('ranking includes self-applicable area buffs and explains their contribution', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(60_000);
  test.skip(isMobile, 'The desktop project owns the ranking detail baseline');
  await openRanking(page, 1440, 1000);
  await page.getByPlaceholder('名前で検索').fill('雨の魔女トネリコ');
  const row = page
    .getByRole('list', { name: '宝具火力ランキング' })
    .getByRole('listitem')
    .filter({ hasText: '雨の魔女トネリコ' });
  await expect(row.locator('.ranking-primary-damage strong')).toHaveText('27,947');
  const primaryDamage = await row.locator('.ranking-primary-damage strong').textContent();
  await row.getByRole('button', { name: /の計算詳細を開く/ }).click();
  const detail = row.getByRole('region', { name: /雨の魔女トネリコの計算詳細/ });
  const area = detail.getByRole('region', { name: 'エリア貢献' });
  await expect(area).toContainText('18,631');
  await expect(area).toContainText('27,947');
  await expect(area).toContainText('エリア効果');
  await expect(row.locator('.ranking-primary-damage strong')).toHaveText(primaryDamage ?? '');
});

for (const viewport of [
  { name: '390px', width: 390, height: 844 },
  { name: '320px', width: 320, height: 700 },
] as const) {
  test(`ranking ${viewport.name} UI baseline`, async ({ page, isMobile }) => {
    test.setTimeout(60_000);
    test.skip(isMobile, 'The desktop project owns the explicit viewport baselines');
    await openRanking(page, viewport.width, viewport.height);
    await expect(page).toHaveScreenshot(`ranking-${viewport.name}.png`);
    if (viewport.width === 320) {
      const first = page
        .getByRole('list', { name: '宝具火力ランキング' })
        .getByRole('listitem')
        .first();
      await expect(first).toHaveScreenshot('ranking-row-320px.png');
      await first.getByRole('button', { name: /の計算詳細を開く/ }).click();
      await expect(first.getByRole('region', { name: /の計算詳細/ })).toContainText('最低');
      await expect(first.getByRole('button', { name: '同じ条件で計算機を開く' })).toBeVisible();
      await expect(first).toHaveScreenshot('ranking-detail-320px.png');
    }
  });
}

test('ranking list density and responsive layout stay within limits', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(120_000);
  test.skip(isMobile, 'The desktop project measures explicit viewports');
  const limits = {
    1440: { rowHeight: 72, filterHeight: 135 },
    390: { rowHeight: 82, filterHeight: 140 },
    320: { rowHeight: 90, filterHeight: 150 },
  } as const;
  const measured: { width: number; rowHeight: number; filterHeight: number; overflow: number }[] =
    [];
  for (const width of [1440, 390, 320] as const) {
    await openRanking(page, width, 900);
    const metrics = await page.evaluate(() => {
      const firstRow = document.querySelector<HTMLElement>('.ranking-row')!;
      const filters = document.querySelector<HTMLElement>('.ranking-filter-section')!;
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        rowHeight: firstRow.getBoundingClientRect().height,
        filterHeight: filters.getBoundingClientRect().height,
        closedDetails: document.querySelectorAll('.ranking-list [aria-expanded="true"]').length,
      };
    });
    expect(metrics.overflow, `${String(width)}px horizontal overflow`).toBe(0);
    expect(metrics.closedDetails, `${String(width)}px initially expanded rows`).toBe(0);
    expect(metrics.rowHeight, `${String(width)}px closed row height`).toBeLessThanOrEqual(
      limits[width].rowHeight,
    );
    expect(metrics.filterHeight, `${String(width)}px filter controls height`).toBeLessThanOrEqual(
      limits[width].filterHeight,
    );
    const firstRow = page
      .getByRole('list', { name: '宝具火力ランキング' })
      .getByRole('listitem')
      .first();
    const disclosure = firstRow.getByRole('button', { name: /の計算詳細を開く/ });
    await disclosure.click();
    await expect(firstRow.locator('.ranking-row')).toHaveAttribute('aria-expanded', 'true');
    await expect(firstRow.getByRole('region', { name: /の計算詳細/ })).toContainText('最低');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
      `${String(width)}px expanded detail horizontal overflow`,
    ).toBe(0);
    measured.push({
      width,
      rowHeight: Math.round(metrics.rowHeight * 100) / 100,
      filterHeight: Math.round(metrics.filterHeight * 100) / 100,
      overflow: metrics.overflow,
    });
  }
  expect(measured).toEqual([
    { width: 1440, rowHeight: 68, filterHeight: 126.89, overflow: 0 },
    { width: 390, rowHeight: 73.59, filterHeight: 126.89, overflow: 0 },
    { width: 320, rowHeight: 73.59, filterHeight: 126.89, overflow: 0 },
  ]);
});
