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

test('reopens saved local data while offline', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'One browser project is sufficient for the service worker offline drill');
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  if (await setup.isVisible()) await setup.click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible();
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible();
    await expect(page.getByText(/端末内に自動保存・オフライン/)).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('autosaves and restores a directly edited calculation draft', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop navigation exposes the persistent undo status');
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  if (await setup.isVisible()) await setup.click();
  await page.getByRole('button', { name: 'ダメージ計算' }).click();
  await page.getByRole('tab', { name: '直接入力' }).click();
  await page.getByLabel('攻撃力補正').fill('0.2');
  await expect(page.getByRole('button', { name: '直前の操作を元に戻す' })).toBeEnabled();
  await page.reload();
  await page.getByRole('button', { name: 'ダメージ計算' }).click();
  await page.getByRole('tab', { name: '直接入力' }).click();
  await expect(page.getByLabel('攻撃力補正')).toHaveValue('0.2');
});

test('round-trips an allowlisted calculation share', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'One browser project covers clipboard and download sharing');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  if (await setup.isVisible()) await setup.click();
  await page.getByRole('button', { name: 'ダメージ計算' }).click();
  await page.getByLabel('敵クラス').fill('berserker');
  await page.getByRole('button', { name: 'URLをコピー' }).click();
  await expect(page.getByText('共有URLをコピーしました')).toBeVisible();
  const sharedUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(sharedUrl).toContain('#share=');
  await page.goto(sharedUrl);
  await expect(page.getByRole('heading', { name: 'ダメージ計算' })).toBeVisible();
  await expect(page.getByLabel('敵クラス')).toHaveValue('berserker');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '共有専用JSONを保存' }).click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const sharedJson = Buffer.concat(chunks).toString('utf8');
  expect(sharedJson).toContain('fgo-lab-calculation-share');
  expect(sharedJson).not.toContain('profileId');
  expect(sharedJson).not.toContain('servantBuilds');
});

test('persists servant, target, CE copies, and support templates', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop navigation covers all management pages');
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  if (await setup.isVisible()) await setup.click();

  await page.getByRole('button', { name: '所持・育成' }).click();
  await expect(page.getByText('469騎')).toBeVisible();
  await page.getByLabel('宝具Lv').selectOption('1');
  await expect(
    page
      .getByRole('list', { name: 'サーヴァント一覧' })
      .getByRole('listitem')
      .filter({ hasText: 'アルトリア・ペンドラゴン' })
      .first(),
  ).toContainText('NP1');
  await page.getByRole('button', { name: '所持のみ', exact: true }).click();
  await expect(
    page.getByRole('list', { name: 'サーヴァント一覧' }).getByRole('listitem'),
  ).toHaveCount(1);
  await page.getByRole('tab', { name: '育成目標' }).click();
  await page.getByLabel('レベル').fill('90');
  await page.getByLabel('スキル1').fill('2');
  await page.getByLabel('育成計画へ含める').check();

  await page.getByRole('button', { name: '概念礼装' }).click();
  for (let index = 0; index < 2; index += 1) {
    await page.getByRole('button', { name: 'DBから礼装を登録' }).click();
    const dialog = page.getByRole('dialog', { name: '概念礼装を検索' });
    await dialog.getByLabel('礼装名').fill('カレイドスコープ');
    await dialog.getByRole('button', { name: '登録' }).first().click();
    await expect(dialog).toBeHidden();
  }
  await expect(
    page.getByRole('list', { name: '登録済み概念礼装' }).getByRole('listitem'),
  ).toHaveCount(2);
  const ceRows = page.getByRole('list', { name: '登録済み概念礼装' }).getByRole('listitem');
  await ceRows.nth(0).getByLabel('カレイドスコープの限界突破').selectOption('4');
  await ceRows.nth(0).getByLabel('カレイドスコープのレベル').fill('20');
  await expect(ceRows.nth(0)).toContainText('ATK');
  await expect(ceRows.nth(1).getByLabel('カレイドスコープのレベル')).toHaveValue('1');
  await page.getByRole('button', { name: '直前の操作を元に戻す' }).click();
  await expect(ceRows.nth(0).getByLabel('カレイドスコープのレベル')).toHaveValue('1');

  await page.getByRole('button', { name: '支援条件' }).click();
  await page.getByRole('button', { name: '支援条件を作成' }).click();
  await expect(page.getByLabel('保存済み支援条件')).toContainText('支援条件 1');
  await page.getByRole('button', { name: '支援元を追加' }).click();
  const supportDialog = page.getByRole('dialog', { name: '支援元サーヴァントを検索' });
  await supportDialog.getByLabel('サーヴァント名').fill('アルトリア・ペンドラゴン');
  await supportDialog.getByRole('button', { name: '追加', exact: true }).first().click();
  await page.getByLabel('カリスマ Bを使用').click();
  await expect(page.getByLabel('カリスマ Bを使用')).toBeChecked();
  await page.getByLabel('カリスマ Bのスキルレベル').selectOption('8');
  await expect(page.getByRole('region', { name: '支援条件の編集' })).toContainText(
    '使用中 1スキル',
  );

  await page.getByRole('button', { name: '育成計画' }).click();
  await expect(page.getByRole('table', { name: '必要素材台帳' })).toContainText('剣の輝石');
  await expect(page.getByRole('table', { name: '必要素材台帳' })).toContainText('QP');
  await expect(page.getByLabel('素材の使用先')).toContainText('アルトリア・ペンドラゴン');

  await page.reload();
  await page.getByRole('button', { name: '概念礼装' }).click();
  await expect(
    page.getByRole('list', { name: '登録済み概念礼装' }).getByRole('listitem'),
  ).toHaveCount(2);
  await page.getByRole('button', { name: '支援条件' }).click();
  await expect(page.getByLabel('カリスマ Bを使用')).toBeChecked();
  await expect(page.getByLabel('カリスマ Bのスキルレベル')).toHaveValue('8');
});

test('finalizes one deduplicated history entry per calculation input', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop navigation exercises history and backup together');
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  if (await setup.isVisible()) await setup.click();
  for (let index = 0; index < 2; index += 1) {
    await page.getByRole('button', { name: 'ダメージ計算' }).click();
    await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
    await page.getByRole('button', { name: 'ホーム' }).click();
  }
  await page.getByRole('button', { name: 'データ管理' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '全データをバックアップ' }).click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const backupBuffer = Buffer.concat(chunks);
  const backup = JSON.parse(backupBuffer.toString('utf8')) as {
    profiles: { profiles: { history: unknown[] }[] };
  };
  expect(backup.profiles.profiles[0]?.history).toHaveLength(1);
  await page.getByLabel('バックアップを復元').setInputFiles({
    name: 'round-trip.json',
    mimeType: 'application/json',
    buffer: backupBuffer,
  });
  const preview = page.getByRole('region', { name: '復元内容のプレビュー' });
  await expect(preview).toContainText('プロフィール 1件');
  await expect(preview.getByRole('button', { name: '全置換を実行' })).toBeDisabled();
  const preImportDownload = page.waitForEvent('download');
  await preview.getByRole('button', { name: '復元前バックアップを保存' }).click();
  await preImportDownload;
  await preview.getByRole('button', { name: '全置換を実行' }).click();
  await expect(page.getByText('検証済みデータへ全置換しました')).toBeVisible();
});

test('calculates ranking in a worker', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop navigation exposes the ranking page');
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  if (await setup.isVisible()) await setup.click();
  await page.getByRole('button', { name: '火力ランキング' }).click();
  await expect(page.getByRole('status')).toContainText('420件をWorkerで計算');
  await expect(page.getByRole('table', { name: '共通条件の平均ダメージ順' })).toContainText(
    'アルトリア・ペンドラゴン',
  );
  await page.getByLabel('宝具カード').selectOption('arts');
  await expect(page.getByRole('status')).not.toContainText('420件表示');
  await page.getByLabel('クラス').selectOption('saber');
  await expect(page.getByRole('status')).not.toContainText('420件表示');
  await page.getByLabel('対象範囲').selectOption('owned');
  await expect(page.getByRole('status')).toContainText('0件表示');
});
