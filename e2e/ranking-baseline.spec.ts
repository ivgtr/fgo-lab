import { expect, test, type Page } from '@playwright/test';
import { completeSetup } from './setup';

async function openRanking(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.route('https://static.atlasacademy.io/**', (route) => route.abort());
  await page.goto('/');
  await completeSetup(page);
  const rankingButton = page.getByRole('button', { name: '火力ランキング' });
  if (await rankingButton.isVisible()) await rankingButton.click();
  else {
    await page.getByRole('button', { name: 'その他' }).click();
    await page.getByLabel('その他の機能').getByRole('button', { name: '火力ランキング' }).click();
  }
  await expect(page.getByRole('status')).toContainText('420件表示 / 420件を計算', {
    timeout: 30_000,
  });
}

test('ranking desktop UI baseline', async ({ page, isMobile }) => {
  test.setTimeout(60_000);
  test.skip(isMobile, 'The desktop project owns the explicit viewport baselines');
  await openRanking(page, 1440, 1000);
  await expect(page).toHaveScreenshot('ranking-desktop.png');
  const first = page
    .getByRole('list', { name: '宝具火力ランキング' })
    .getByRole('listitem')
    .first();
  await first.getByRole('button', { name: '詳細' }).click();
  await expect(first.getByRole('region', { name: /の計算詳細/ })).toContainText('最低', {
    timeout: 15_000,
  });
  await expect(page).toHaveScreenshot('ranking-detail-desktop.png');
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
    if (viewport.width === 320)
      await expect(
        page.getByRole('list', { name: '宝具火力ランキング' }).getByRole('listitem').first(),
      ).toHaveScreenshot('ranking-row-320px.png');
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
    measured.push({
      width,
      rowHeight: Math.round(metrics.rowHeight * 100) / 100,
      filterHeight: Math.round(metrics.filterHeight * 100) / 100,
      overflow: metrics.overflow,
    });
  }
  expect(measured).toEqual([
    { width: 1440, rowHeight: 68, filterHeight: 126.89, overflow: 0 },
    { width: 390, rowHeight: 75.59, filterHeight: 126.89, overflow: 0 },
    { width: 320, rowHeight: 73.59, filterHeight: 126.89, overflow: 0 },
  ]);
});
