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
      await page
        .getByRole('list', { name: '宝具火力ランキング' })
        .getByRole('listitem')
        .first()
        .evaluate((row) => row.scrollIntoView({ block: 'center' }));
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
  await expect(page.getByRole('status')).toContainText('433件表示 / 433件を計算', {
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
      executionIntent: {
        ...JSON.parse(originalDraft).request.executionIntent,
        basis: {
          ...JSON.parse(originalDraft).request.executionIntent.basis,
          servantId: 'missing-reset-subject',
        },
      },
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
  // E2E-A050-COUNT-RECOVERY
  for (const [name, label, maximum] of [
    ['キングプロテア', '増殖の付与数', 10],
    ['水着クロエ', '原稿完成の付与数', 30],
  ] as const) {
    await page.getByRole('button', { name: '攻撃役を変更' }).click();
    const picker = page.getByRole('dialog', { name: '攻撃役を選択' });
    await picker.getByRole('tab', { name: '全DB' }).click();
    await picker.getByLabel('名前で検索').fill(name === '水着クロエ' ? 'クロエ' : name);
    await picker
      .getByRole('button', {
        name: name === '水着クロエ' ? /クロエ.*アヴェンジャー/ : /キングプロテア.*Lv/,
      })
      .first()
      .click();
    const count = page.getByRole('spinbutton', { name: label, exact: true });
    await expect(count).toHaveValue('0');
    await count.fill(String(maximum + 1));
    await expect(count).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('入力範囲を確認してください。')).toBeVisible();
    await count.fill('1');
    await expect(count).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
    await expect
      .poll(
        async () =>
          JSON.parse((await storedDraftJson(page)) ?? '{}').request?.scenario?.canonicalInputValues,
      )
      .toEqual(
        expect.objectContaining({
          [name === '水着クロエ'
            ? 'stack:attackerState:manuscriptComplete'
            : 'stack:attackerState:kingproteaProliferation']: { kind: 'integer', value: 1 },
        }),
      );
    await page.reload();
    await expect(count).toHaveValue('1');
    await count.locator('..').locator('..').getByRole('button', { name: '自動値へ戻す' }).click();
    await expect(count).toHaveValue('0');
  }
  // E2E-A050-POPULATION-RECOVERY
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const populationPicker = page.getByRole('dialog', { name: '攻撃役を選択' });
  await populationPicker.getByRole('tab', { name: '全DB' }).click();
  await populationPicker.getByLabel('名前で検索').fill('黒姫');
  await populationPicker
    .getByRole('button', { name: /黒姫.*Lv/ })
    .first()
    .click();
  const allies = page.getByRole('group', { name: '追加の味方人数', exact: true });
  const initialMatches = page.getByRole('spinbutton', {
    name: '追加対象の初期該当人数',
    exact: true,
  });
  await expect(allies.getByRole('button', { name: '0', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await initialMatches.fill('1');
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toHaveCount(0);
  await allies.getByRole('button', { name: '1', exact: true }).click();
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
  await expect
    .poll(
      async () =>
        JSON.parse((await storedDraftJson(page)) ?? '{}').request?.scenario?.canonicalInputValues?.[
          'population:allies:additional'
        ],
    )
    .toEqual({ kind: 'integer', value: 1 });
  await page.reload();
  await expect(allies.getByRole('button', { name: '1', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(initialMatches).toHaveValue('1');
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
  await initialMatches
    .locator('..')
    .locator('..')
    .getByRole('button', { name: '自動値へ戻す' })
    .click();
  await allies.getByRole('button', { name: '自動値へ戻す' }).click();
  await expect(initialMatches).toHaveValue('0');
  await expect(allies.getByRole('button', { name: '0', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const targetPicker = page.getByRole('dialog', { name: '攻撃役を選択' });
  await targetPicker.getByRole('tab', { name: '全DB' }).click();
  await targetPicker.getByLabel('名前で検索').fill('エリザベート');
  await targetPicker
    .getByRole('button', { name: /エリザベート.*ハロウィン/ })
    .first()
    .click();
  const removable = page.getByRole('group', { name: '敵2の解除可能な強化数', exact: true });
  await removable.getByRole('button', { name: '1', exact: true }).click();
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toHaveCount(0);
  const enemies = page.getByRole('group', { name: '追加の敵人数', exact: true });
  await enemies.getByRole('button', { name: '1', exact: true }).click();
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
  await expect
    .poll(
      async () =>
        JSON.parse((await storedDraftJson(page)) ?? '{}').request?.scenario?.canonicalInputValues?.[
          'population:enemy:1:removableBuffs:buffPositiveEffect'
        ],
    )
    .toEqual({ kind: 'integer', value: 1 });
  await page.reload();
  await expect(removable.getByRole('button', { name: '1', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await removable.getByRole('button', { name: '自動値へ戻す' }).click();
  await enemies.getByRole('button', { name: '自動値へ戻す' }).click();
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
  // Transfer input repair and persisted portable replay use the calculator command path.
  for (const name of ['謎のアルターエゴ・Λ', 'キングプロテア・オルタ', '楊貴妃']) {
    await page.getByRole('button', { name: '攻撃役を変更' }).click();
    const picker = page.getByRole('dialog', { name: '攻撃役を選択' });
    await picker.getByRole('tab', { name: '全DB' }).click();
    await picker.getByLabel('名前で検索').fill(name);
    await picker
      .getByRole('button', { name: new RegExp(`${name}.*Lv`) })
      .first()
      .click();
    const label =
      name === '謎のアルターエゴ・Λ' ? '吸収元の味方1のNP（0.01%）' : '吸収元の敵1のチャージ';
    const donor = page.getByRole('spinbutton', { name: label, exact: true });
    await expect(donor).toHaveValue('0');
    await donor.fill('-1');
    await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toHaveCount(0);
    const value = name === '謎のアルターエゴ・Λ' ? '2000' : '1';
    await donor.fill(value);
    await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
    const key = name === '謎のアルターエゴ・Λ' ? 'transfer:playerNp:0' : 'transfer:enemyCharge:0';
    await expect
      .poll(
        async () =>
          JSON.parse((await storedDraftJson(page)) ?? '{}').request?.scenario
            ?.canonicalInputValues?.[key],
      )
      .toEqual({ kind: 'integer', value: Number(value) });
    await page.reload();
    await expect(donor).toHaveValue(value);
    await donor
      .locator('..')
      .locator('..')
      .screenshot({ path: test.info().outputPath(`np-transfer-${name}.png`) });
    await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
    await donor.locator('..').locator('..').getByRole('button', { name: '自動値へ戻す' }).click();
    await expect(donor).toHaveValue('0');
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '火力ランキング', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('件を計算', { timeout: 30000 });
  await page.getByPlaceholder('名前で検索').fill('土方歳三');
  const hpRow = page
    .getByRole('list', { name: '宝具火力ランキング' })
    .getByRole('listitem')
    .first();
  await expect(hpRow).toContainText('土方歳三');
  await hpRow.getByRole('button', { name: /の計算詳細を開く/ }).click();
  await expect(hpRow.getByLabel('宝具実行時のHP')).toHaveText('HP 92%');
  await hpRow.getByRole('button', { name: /の計算詳細を閉じる/ }).click();
  await page.getByRole('combobox', { name: '宝具Lv', exact: true }).selectOption('2');
  await expect(hpRow.locator('.ranking-primary-damage strong')).toHaveText('65,870', {
    timeout: 30_000,
  });
  await hpRow.getByRole('button', { name: /の計算詳細を開く/ }).click();
  await expect(hpRow.getByLabel('宝具実行時のHP')).toHaveText('HP 92%');
  await hpRow.screenshot({ path: test.info().outputPath('ranking-executed-hp.png') });
});

test('[E2E-052] HP preparation, transfer, death repair and saved replay @desktop @journey', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.route('https://static.atlasacademy.io/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
    }),
  );
  await openTestHome(page);
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  // E2E-A052-HP-RECOVERY
  for (const [name, choice] of [
    ['バーヴァン・シー', /バーヴァン・シー.*Lv/],
    ['カーミラ', /カーミラ.*ライダー/],
    ['土方歳三', /土方歳三.*Lv/],
  ] as const) {
    await page.getByRole('button', { name: '攻撃役を変更' }).click();
    const picker = page.getByRole('dialog', { name: '攻撃役を選択' });
    await picker.getByRole('tab', { name: '全DB' }).click();
    await picker.getByLabel('名前で検索').fill(name);
    await picker.getByRole('button', { name: choice }).first().click();
    await expect(page.getByRole('button', { name: '攻撃役を変更' })).toContainText(name);
    const hp = page.getByRole('spinbutton', { name: /準備開始時のHP/ });
    await hp.fill('0');
    await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toHaveCount(0);
    await expect(
      page.getByText(
        'HPが0のため宝具を使用できません。準備開始時のHPと準備操作を確認してください。',
      ),
    ).toBeVisible();
    await hp.fill('50');
    await expect(hp).toHaveValue('50');
    if (name !== '土方歳三') {
      const donor = page.getByRole('spinbutton', { name: '吸収元の敵1のHP', exact: true });
      await donor.fill('-1');
      await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toHaveCount(0);
      await donor.fill('2000');
    }
    await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
    const display = page.getByText(/^実行後HP:/);
    const executed = await display.textContent();
    await expect
      .poll(
        async () =>
          JSON.parse((await storedDraftJson(page)) ?? '{}').request?.scenario?.attackerHpPermille,
      )
      .toBe(500);
    await page.reload();
    await expect(hp).toHaveValue('50');
    await expect(display).toHaveText(executed!);
    await page.getByRole('combobox', { name: '宝具Lv', exact: true }).selectOption('2');
    await page.getByRole('combobox', { name: '初期OC', exact: true }).selectOption('2');
    await expect(hp).toHaveValue('50');
    await expect(display).toHaveText(executed!);
    const level = page.getByRole('spinbutton', { name: 'サーヴァントLv', exact: true });
    const originalLevel = await level.inputValue();
    await level.fill('100');
    await expect(hp).toHaveValue('50');
    await expect(display).not.toHaveText(executed!);
    await level.fill(originalLevel);
    await expect(display).toHaveText(executed!);
    if (name === 'バーヴァン・シー') {
      await page.getByRole('button', { name: /礼装なし・選択する/ }).click();
      const equip = page.getByRole('dialog', { name: '概念礼装を選択' });
      await equip.getByRole('tab', { name: '全DB', exact: true }).click();
      await equip.getByLabel('礼装名').fill('プリズマコスモス');
      await equip.getByRole('button', { name: /プリズマコスモス.*Lv1/ }).click();
      await expect(hp).toHaveValue('50');
      await expect(display).not.toHaveText(executed!);
      await page.getByRole('button', { name: '外す', exact: true }).click();
      await expect(display).toHaveText(executed!);
    }
    await page.setViewportSize({ width: 320, height: 720 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await hp.locator('..').screenshot({ path: test.info().outputPath(`hp-${name}.png`) });
    await page.getByRole('button', { name: '初期HPを100%へ戻す', exact: true }).click();
    await expect(hp).toHaveValue('100');
    await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
  }
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const formPicker = page.getByRole('dialog', { name: '攻撃役を選択' });
  await formPicker.getByRole('tab', { name: '全DB' }).click();
  await formPicker.getByLabel('名前で検索').fill('フランソワ');
  await formPicker
    .getByRole('button', { name: /フランソワ.*Lv/ })
    .first()
    .click();
  await expect(page.getByRole('button', { name: '攻撃役を変更' })).toContainText('フランソワ');
  const formHp = page.getByRole('spinbutton', { name: /準備開始時のHP/ });
  await formHp.fill('50');
  const formDisplay = page.getByText(/^実行後HP:/);
  const formExecuted = await formDisplay.textContent();
  const form = page.getByRole('combobox', { name: '初期形態', exact: true });
  await form.selectOption({ index: 1 });
  await expect(formHp).toHaveValue('50');
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
  await form.selectOption({ index: 0 });
  await expect(formDisplay).toHaveText(formExecuted!);
  await page.reload();
  await expect(formHp).toHaveValue('50');
  await expect(formDisplay).toHaveText(formExecuted!);
});

test('[E2E-053] independent marker profiles retain calculator state across saved replay @desktop @journey', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.route('https://static.atlasacademy.io/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
    }),
  );
  await openTestHome(page);
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  // E2E-A053-MARKER-REPLAY
  for (const name of ['ヤマトタケル', 'バーゲスト', 'ネモ／ノア', '蒼崎青子']) {
    await page.getByRole('button', { name: '攻撃役を変更' }).click();
    const picker = page.getByRole('dialog', { name: '攻撃役を選択' });
    await picker.getByRole('tab', { name: '全DB' }).click();
    await picker.getByLabel('名前で検索').fill(name);
    await picker
      .getByRole('button', {
        name: name === 'バーゲスト' ? /バーゲスト.*アーチャー/ : new RegExp(name + '.*Lv'),
      })
      .first()
      .click();
    const table = page.getByRole('table', { name: '宝具レベル別のダメージ' });
    await expect(table).toBeVisible();
    await page.getByRole('combobox', { name: '宝具Lv', exact: true }).selectOption('2');
    await page.getByRole('combobox', { name: '初期OC', exact: true }).selectOption('2');
    await expect
      .poll(
        async () =>
          JSON.parse((await storedDraftJson(page)) ?? '{}').request?.scenario?.initialOvercharge,
      )
      .toBe(2);
    const damage = await table.textContent();
    await page.reload();
    await expect(table).toHaveText(damage!);
    await expect(page.getByRole('combobox', { name: '初期OC', exact: true })).toHaveValue('2');
    await page.getByRole('combobox', { name: '宝具Lv', exact: true }).selectOption('1');
    await expect(page.getByRole('combobox', { name: '初期OC', exact: true })).toHaveValue('1');
    await expect(table).toBeVisible();
    await table.screenshot({ path: test.info().outputPath(`marker-${name}.png`) });
  }
});

test('[E2E-054] battle-point phase intent survives replay and resets with attacker @desktop @journey', async ({
  page,
}) => {
  // E2E-A054-BP-REPLAY
  test.setTimeout(60_000);
  await page.route('https://static.atlasacademy.io/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
    }),
  );
  await openTestHome(page);
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  let picker = page.getByRole('dialog', { name: '攻撃役を選択' });
  await picker.getByRole('tab', { name: '全DB' }).click();
  await picker.getByLabel('名前で検索').fill('紅閻魔');
  await picker
    .getByRole('button', { name: /紅閻魔.*Lv/ })
    .nth(1)
    .click();

  const phase = page.getByRole('spinbutton', { name: 'バトルポイント段階' });
  const table = page.getByRole('table', { name: '宝具レベル別のダメージ' });
  await expect(phase).toHaveValue('0');
  await phase.fill('2');
  await page.getByRole('combobox', { name: '宝具Lv', exact: true }).selectOption('2');
  await page.getByRole('combobox', { name: '初期OC', exact: true }).selectOption('2');
  await expect(table).toBeVisible();
  const damage = await table.textContent();
  await expect
    .poll(
      async () =>
        JSON.parse((await storedDraftJson(page)) ?? '{}').request?.scenario?.battleState
          ?.battlePointPhase,
    )
    .toBe(2);
  await page.reload();
  await expect(phase).toHaveValue('2');
  await expect(table).toHaveText(damage!);
  await phase.locator('..').screenshot({ path: test.info().outputPath('battle-point-replay.png') });

  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  picker = page.getByRole('dialog', { name: '攻撃役を選択' });
  await picker.getByRole('tab', { name: '全DB' }).click();
  await picker.getByLabel('名前で検索').fill('エレシュキガル');
  await picker
    .getByRole('button', { name: /エレシュキガル.*Lv/ })
    .first()
    .click();
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  picker = page.getByRole('dialog', { name: '攻撃役を選択' });
  await picker.getByRole('tab', { name: '全DB' }).click();
  await picker.getByLabel('名前で検索').fill('紅閻魔');
  await picker
    .getByRole('button', { name: /紅閻魔.*Lv/ })
    .nth(1)
    .click();
  await expect(phase).toHaveValue('0');
  await expect(table).toBeVisible();
});
