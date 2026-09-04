import { expect, test, type Page } from './observedTest';
import { resolve } from 'node:path';
import { installRankingFixtureWorker, openTestHome } from './setup';

async function storedDraftJson(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      new Promise<string | null>((resolve, reject) => {
        const request = indexedDB.open('fgo-lab', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction('user', 'readonly');
          const stored = transaction.objectStore('user').get('profiles');
          stored.onerror = () => reject(stored.error);
          stored.onsuccess = () => {
            const collection = stored.result as {
              activeProfileId: string;
              profiles: Array<{ profileId: string; draft: unknown }>;
            };
            const draft = collection.profiles.find(
              ({ profileId }) => profileId === collection.activeProfileId,
            )?.draft;
            resolve(draft ? JSON.stringify(draft) : null);
          };
        };
      }),
  );
}

async function replaceStoredDraft(page: Page, draftJson: string): Promise<void> {
  await page.evaluate(
    ({ replacement }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('fgo-lab', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction('user', 'readwrite');
          const store = transaction.objectStore('user');
          const stored = store.get('profiles');
          stored.onerror = () => reject(stored.error);
          stored.onsuccess = () => {
            const collection = stored.result as {
              activeProfileId: string;
              profiles: Array<{ profileId: string; draft: unknown }>;
            };
            const profile = collection.profiles.find(
              ({ profileId }) => profileId === collection.activeProfileId,
            )!;
            profile.draft = JSON.parse(replacement);
            store.put(collection, 'profiles');
          };
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => resolve();
        };
      }),
    { replacement: draftJson },
  );
}

async function openFixtureRanking(
  page: Page,
  width: number,
  height: number,
  options: { iconMode?: 'fixture' | 'fallback' } = {},
) {
  await page.setViewportSize({ width, height });
  await installRankingFixtureWorker(page);
  await page.route('https://static.atlasacademy.io/**', (route) =>
    options.iconMode === 'fallback'
      ? route.abort()
      : route.fulfill({
          path: resolve(process.cwd(), 'apps/web/public/filter-icons/class/saber.png'),
          contentType: 'image/png',
        }),
  );
  await openTestHome(page);
  const rankingButton = page.getByRole('button', { name: '火力ランキング' });
  const moreButton = page.getByRole('button', { name: 'その他' });
  await expect(rankingButton.or(moreButton)).toBeVisible();
  if (await rankingButton.isVisible()) await rankingButton.click();
  else {
    await moreButton.click();
    await page.getByLabel('その他の機能').getByRole('button', { name: '火力ランキング' }).click();
  }
  await expect(page.getByRole('status')).toContainText('12件表示 / 12件を計算');
}

test('[E2E-011] ranking icon fallback @mobile @vrt', async ({ page }) => {
  await openFixtureRanking(page, 390, 844, { iconMode: 'fallback' });
  await expect(
    page.getByRole('list', { name: '宝具火力ランキング' }).getByRole('listitem').first(),
  ).toHaveScreenshot('ranking-row-icon-fallback-390px.png');
});

for (const viewport of [
  { id: 'E2E-014', name: '390px', width: 390, height: 844 },
  { id: 'E2E-015', name: '320px', width: 320, height: 700 },
] as const) {
  test(`[${viewport.id}] ranking ${viewport.name} UI baseline @mobile @vrt`, async ({ page }) => {
    await openFixtureRanking(page, viewport.width, viewport.height);
    await expect(page).toHaveScreenshot(`ranking-${viewport.name}.png`);
    if (viewport.width === 320) {
      const first = page
        .getByRole('list', { name: '宝具火力ランキング' })
        .getByRole('listitem')
        .first();
      await expect(first).toHaveScreenshot('ranking-row-320px.png');
    }
  });
}

test('[E2E-016] ranking density and overflow @desktop @vrt', async ({ page }) => {
  const limits = {
    1440: { rowHeight: 72, filterHeight: 135 },
    390: { rowHeight: 82, filterHeight: 140 },
    320: { rowHeight: 90, filterHeight: 150 },
  } as const;
  for (const width of [1440, 390, 320] as const) {
    await openFixtureRanking(page, width, 900);
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
  }
});

test('[E2E-050] real ranking module worker and detail @desktop @journey', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('https://static.atlasacademy.io/**', (route) =>
    route.fulfill({
      path: resolve(process.cwd(), 'apps/web/public/filter-icons/class/saber.png'),
      contentType: 'image/png',
    }),
  );
  await openTestHome(page);
  await page.getByRole('button', { name: '火力ランキング' }).click();
  // E2E-A050-SUMMARY
  await expect(page.getByRole('status')).toContainText('393件表示 / 393件を計算・順位外 40件', {
    timeout: 30_000,
  });
  const first = page
    .getByRole('list', { name: '宝具火力ランキング' })
    .getByRole('listitem')
    .first();
  const rankingAverage = Number(
    (await first.locator('.ranking-primary-damage strong').textContent())?.replaceAll(',', ''),
  );
  // E2E-A012-DESKTOP-VRT
  await expect(page).toHaveScreenshot('ranking-desktop.png');
  await first.getByRole('button', { name: /の計算詳細を開く/ }).click();
  // E2E-A050-DETAIL
  await expect(first.getByRole('region', { name: /の計算詳細/ })).toContainText('最低', {
    timeout: 15_000,
  });
  await expect(page).toHaveScreenshot('ranking-detail-desktop.png');
  // E2E-A050-HANDOFF
  await first.getByRole('button', { name: '同じ条件で計算機を開く' }).click();
  await expect(page.getByRole('heading', { name: 'ダメージ計算' })).toBeVisible();
  const notice = page.getByLabel('計算条件の版情報');
  // E2E-A050-NOTICE
  await expect(notice).toContainText('ランキングから引き継いだ計算条件');
  const calculatorAverage = Number(
    (
      await page
        .getByRole('row', { name: /NP1.*現在/ })
        .locator('td.average')
        .textContent()
    )?.replaceAll(',', ''),
  );
  expect(calculatorAverage).toBe(rankingAverage);
  await expect.poll(() => storedDraftJson(page)).not.toBeNull();
  const originalDraft = await storedDraftJson(page);
  if (!originalDraft) throw new Error('ranking handoff draft missing');
  const missingSubjectDraft = JSON.stringify({
    ...JSON.parse(originalDraft),
    request: {
      ...JSON.parse(originalDraft).request,
      scenario: {
        ...JSON.parse(originalDraft).request.scenario,
        attacker: {
          ...JSON.parse(originalDraft).request.scenario.attacker,
          servantId: 'missing-reset-subject',
        },
      },
    },
  });
  await replaceStoredDraft(page, missingSubjectDraft);
  await page.goto('/calculator');
  const rejectedNotice = page.locator('[data-calculation-error-summary]');
  await expect(rejectedNotice).toContainText('計算条件を復元できません', { timeout: 30_000 });
  await rejectedNotice.getByRole('button', { name: '通常の計算条件へ戻す' }).click();
  await expect(rejectedNotice).toContainText('計算条件を復元できません');
  await expect.poll(() => storedDraftJson(page)).toBe(missingSubjectDraft);
  await page.reload();
  await expect(page.locator('[data-calculation-error-summary]')).toContainText(
    '計算条件を復元できません',
    {
      timeout: 30_000,
    },
  );
  await expect.poll(() => storedDraftJson(page)).toBe(missingSubjectDraft);

  await replaceStoredDraft(page, originalDraft);
  await page.reload();
  const restoredNotice = page.getByLabel('計算条件の版情報');
  await expect(restoredNotice).toContainText('ランキングから引き継いだ計算条件', {
    timeout: 30_000,
  });
  // E2E-A050-RESET
  await restoredNotice.getByRole('button', { name: '通常の計算条件へ戻す' }).click();
  await expect(page.getByText('ランキングから引き継いだ計算条件')).toHaveCount(0);
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
});
