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
  const resultCard = page.getByLabel('共有対象の計算結果');
  await expect(page.locator('.result-pane')).toHaveCount(0);
  expect(
    await resultCard.evaluate((card) => {
      const container = getComputedStyle(card.parentElement!);
      return [container.backgroundColor, container.borderTopWidth, container.paddingTop];
    }),
  ).toEqual(['rgba(0, 0, 0, 0)', '0px', '0px']);
  await expect(page.getByRole('heading', { name: '宝具ダメージ', exact: true })).toHaveCount(1);
  await expect(page.getByText('宝具ダメージ目安', { exact: true })).toHaveCount(0);
  await expect(resultCard).toContainText('アルトリア・ペンドラゴン');
  await expect(resultCard).toContainText('lancer・earth');
  await expect(resultCard).toContainText('支援なし');
  await expect(page.getByLabel('攻撃役の自身スキル').getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('row', { name: /NP1.*現在/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(page.getByRole('row', { name: /NP1.*現在/ })).toContainText('33,713');
  await expect(page.getByLabel('自動適用される能力')).toContainText('クラス相性2.00倍');
  await expect(page.getByLabel('攻撃役の自身スキル')).toContainText('理想郷の騎士 EX');
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

test('mobile servant editor moves between list and detail', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile layout uses list-to-detail navigation');
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  if (await setup.isVisible()) await setup.click();
  await page.getByRole('button', { name: '所持', exact: true }).click();

  const list = page.getByRole('list', { name: 'サーヴァント一覧' });
  await expect(list).toBeVisible();
  await expect(page.getByLabel('宝具Lv')).toBeHidden();
  await list.getByRole('listitem').first().click();
  await expect(list).toBeHidden();
  await expect(page.getByLabel('宝具Lv')).toBeVisible();
  await page.getByRole('button', { name: '一覧へ戻る' }).click();
  await expect(list).toBeVisible();
});

test('mobile calculator selects virtual attacker and CE from the full DB', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile project covers the compact picker flow');
  await page.setViewportSize({ width: 320, height: 700 });
  await page.route('https://static.atlasacademy.io/**', (route) => route.abort());
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  if (await setup.isVisible()) await setup.click();
  await page.getByRole('button', { name: '計算', exact: true }).click();

  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const attackerDialog = page.getByRole('dialog', { name: '攻撃役を選択' });
  await attackerDialog.getByRole('tab', { name: '全DB' }).click();
  await attackerDialog.getByLabel('名前・クラス').fill('アルトリア・ペンドラゴン');
  await attackerDialog
    .getByRole('button', { name: /アルトリア・ペンドラゴン saber・Lv90/ })
    .click();
  await expect(page.getByRole('button', { name: '攻撃役を変更' })).toContainText('全DBの仮想設定');

  await page.getByRole('button', { name: /礼装なし・選択する/ }).click();
  const ceDialog = page.getByRole('dialog', { name: '概念礼装を選択' });
  await ceDialog.getByRole('tab', { name: '全DB' }).click();
  await ceDialog.getByLabel('礼装名').fill('カレイドスコープ');
  await ceDialog
    .getByRole('button', { name: /カレイドスコープ/ })
    .first()
    .click();
  await expect(page.getByRole('button', { name: '概念礼装を変更' })).toContainText(
    '全DBの仮想設定',
  );

  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  await page.keyboard.press('Escape');
  await expect(attackerDialog).toBeHidden();
  await expect(page.getByRole('button', { name: '攻撃役を変更' })).toBeFocused();
  const imageDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '画像として保存' }).click();
  const imageStream = await (await imageDownloadPromise).createReadStream();
  const imageChunks: Buffer[] = [];
  for await (const chunk of imageStream) imageChunks.push(Buffer.from(chunk));
  expect(Buffer.concat(imageChunks).readUInt32BE(16)).toBe(1120);
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
  await page.getByLabel('攻撃バフ（%）').fill('20');
  await expect(page.getByRole('button', { name: '直前の操作を元に戻す' })).toBeEnabled();
  await page.reload();
  await page.getByRole('button', { name: 'ダメージ計算' }).click();
  await page.getByRole('tab', { name: '直接入力' }).click();
  await expect(page.getByLabel('攻撃バフ（%）')).toHaveValue('20');
});

test('restores complete direct inputs, CE effects, and trait special NP resolution', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop project covers the full calculator form');
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  if (await setup.isVisible()) await setup.click();
  await page.getByRole('button', { name: 'ダメージ計算' }).click();
  await page.getByRole('tab', { name: '直接入力' }).click();
  for (const label of [
    '基礎ATK',
    'ATKフォウ',
    '礼装ATK',
    'クラス攻撃補正',
    'クラス相性',
    '属性相性',
    '攻撃バフ（%）',
    '敵防御力（%）',
    'カード耐性（%）',
    '宝具耐性（%）',
    '特攻宝具倍率（%）',
    'イベント特攻（%）',
    '固定ダメージ軽減',
  ])
    await expect(page.getByLabel(label)).toBeVisible();

  await page.getByLabel('クラス相性').fill('1');
  await page.getByLabel('敵クラス').selectOption('archer');
  await expect(page.getByLabel('クラス相性')).toHaveValue('1');
  await page.getByRole('button', { name: 'ATK・相性を自動値へ戻す' }).click();
  await expect(page.getByLabel('クラス相性')).toHaveValue('0.5');

  await page.getByRole('button', { name: /礼装なし・選択する/ }).click();
  const ceDialog = page.getByRole('dialog', { name: '概念礼装を選択' });
  await ceDialog.getByRole('tab', { name: '全DB' }).click();
  await ceDialog.getByLabel('礼装名').fill('黒の聖杯');
  await ceDialog
    .getByRole('button', { name: /黒の聖杯/ })
    .first()
    .click();
  await expect(page.getByLabel('自動適用される能力')).toContainText('宝具威力アップ');
  await expect(page.getByLabel('自動適用される能力')).toContainText('+60%');

  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const attackerDialog = page.getByRole('dialog', { name: '攻撃役を選択' });
  await attackerDialog.getByRole('tab', { name: '全DB' }).click();
  await attackerDialog.getByLabel('名前・クラス').fill('ジークフリート');
  await attackerDialog.getByRole('button', { name: /ジークフリート saber・Lv90/ }).click();
  const damage = page.getByRole('row', { name: /NP1.*現在/ }).locator('td.average');
  const withoutTrait = Number((await damage.textContent())?.replaceAll(',', ''));
  await expect(page.getByLabel('自動適用される能力')).toContainText('対象特性なし');
  await page.getByLabel('敵特性（カンマ区切り）').fill('dragon');
  await expect(page.getByLabel('自動適用される能力')).toContainText('1.50倍');
  const withTrait = Number((await damage.textContent())?.replaceAll(',', ''));
  expect(withTrait).toBeGreaterThan(withoutTrait * 1.49);
});

test('round-trips an allowlisted calculation share', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'One browser project covers clipboard and download sharing');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  if (await setup.isVisible()) await setup.click();
  await page.getByRole('button', { name: 'ダメージ計算' }).click();
  const currentDamage = page.getByRole('row', { name: /NP1.*現在/ }).locator('td.average');
  await page.getByLabel('理想郷の騎士 EXを使用').check();
  await page.getByLabel('敵クラス').selectOption('berserker');
  const sharedDamage = await currentDamage.textContent();
  await page.getByRole('button', { name: 'URLをコピー' }).click();
  await expect(page.getByText('共有URLをコピーしました')).toBeVisible();
  const sharedUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(sharedUrl).toContain('#share=');
  await page.goto('about:blank');
  await page.goto(sharedUrl);
  await expect(page.getByRole('heading', { name: 'ダメージ計算' })).toBeVisible();
  await expect(page.getByLabel('敵クラス')).toHaveValue('berserker');
  await expect(currentDamage).toHaveText(sharedDamage ?? '');
  await expect(page.getByLabel('理想郷の騎士 EXを使用')).not.toBeChecked();

  const imageDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '画像として保存' }).click();
  const imageStream = await (await imageDownloadPromise).createReadStream();
  const imageChunks: Buffer[] = [];
  for await (const chunk of imageStream) imageChunks.push(Buffer.from(chunk));
  const resultImage = Buffer.concat(imageChunks);
  expect(resultImage.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect(resultImage.readUInt32BE(16)).toBe(1120);
  expect(resultImage.readUInt32BE(20)).toBeGreaterThan(900);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '共有専用JSONを保存' }).click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const sharedJson = Buffer.concat(chunks).toString('utf8');
  expect(sharedJson).toContain('fgo-lab-calculation-share');
  expect(sharedJson).not.toContain('profileId');
  expect(sharedJson).not.toContain('servantBuilds');
  expect(sharedJson).not.toContain('copyId');
  expect(sharedJson).not.toContain('attackerSkills');
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

  await page.getByRole('button', { name: '概念礼装', exact: true }).click();
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
  await page.getByLabel('理想郷の騎士 EXを使用').click();
  await expect(page.getByLabel('理想郷の騎士 EXを使用')).toBeChecked();
  await page.getByLabel('理想郷の騎士 EXのスキルレベル').selectOption('8');
  await expect(page.getByRole('region', { name: '支援条件の編集' })).toContainText(
    '使用中 1スキル',
  );

  await page.getByRole('button', { name: 'ダメージ計算' }).click();
  const currentDamage = page.getByRole('row', { name: /NP1.*現在/ }).locator('td.average');
  const unequippedDamage = Number((await currentDamage.textContent())?.replaceAll(',', ''));
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const attackerDialog = page.getByRole('dialog', { name: '攻撃役を選択' });
  await expect(attackerDialog.getByRole('tab', { name: '所持・育成管理' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(attackerDialog.getByRole('listitem')).toHaveCount(1);
  await attackerDialog.getByRole('button', { name: /アルトリア・ペンドラゴン/ }).click();
  await expect(page.getByRole('button', { name: '攻撃役を変更' })).toContainText(
    '所持・育成管理の保存値',
  );
  const selfSkillRegion = page.getByLabel('攻撃役の自身スキル');
  const damageBeforeSelfSkill = Number((await currentDamage.textContent())?.replaceAll(',', ''));
  await expect(selfSkillRegion).toContainText('保存値');
  await selfSkillRegion.getByLabel('理想郷の騎士 EXのスキルレベル').selectOption('8');
  await expect(selfSkillRegion).toContainText('一時変更');
  await selfSkillRegion.getByLabel('理想郷の騎士 EXを使用').check();
  const damageWithSelfSkill = Number((await currentDamage.textContent())?.replaceAll(',', ''));
  expect(damageWithSelfSkill).toBeGreaterThan(damageBeforeSelfSkill);
  await page.getByRole('button', { name: /礼装なし・選択する/ }).click();
  const calculatorCeDialog = page.getByRole('dialog', { name: '概念礼装を選択' });
  await expect(calculatorCeDialog.getByRole('tab', { name: '登録済みコピー' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(calculatorCeDialog.getByRole('listitem')).toHaveCount(2);
  await calculatorCeDialog
    .getByRole('button', { name: /カレイドスコープ/ })
    .first()
    .click();
  await expect(page.getByRole('button', { name: '概念礼装を変更' })).toContainText('登録コピー');
  await page.getByLabel('礼装Lv').fill('20');
  await expect(page.getByRole('button', { name: '概念礼装を変更' })).toContainText('Lv20');
  const equippedDamage = Number((await currentDamage.textContent())?.replaceAll(',', ''));
  expect(equippedDamage).toBeGreaterThan(unequippedDamage);
  const baseDamage = equippedDamage;
  await page.getByRole('button', { name: '支援条件を呼び出す' }).click();
  const templateDialog = page.getByRole('dialog', { name: '保存済み支援条件' });
  await templateDialog.getByRole('button', { name: '呼び出す' }).click();
  await expect(page.getByLabel('支援・バフ')).toContainText('支援条件 1');
  await expect(page.getByLabel('支援・バフ')).toContainText('+27%');
  await expect(page.getByLabel('共有対象の計算結果')).toContainText('カレイドスコープ Lv.20');
  await expect(page.getByLabel('共有対象の計算結果')).toContainText('自身スキル1件適用');
  await expect(page.getByLabel('共有対象の計算結果')).toContainText('支援条件 1（1スキル）');
  const supportedDamage = Number((await currentDamage.textContent())?.replaceAll(',', ''));
  expect(supportedDamage).toBeGreaterThan(baseDamage);

  await page.getByRole('button', { name: '育成計画' }).click();
  await expect(page.getByRole('table', { name: '必要素材台帳' })).toContainText('剣の輝石');
  await expect(page.getByRole('table', { name: '必要素材台帳' })).toContainText('QP');
  await expect(page.getByLabel('素材の使用先')).toContainText('アルトリア・ペンドラゴン');

  await page.reload();
  await page.getByRole('button', { name: 'ダメージ計算' }).click();
  await expect(page.getByLabel('支援・バフ')).toContainText('支援条件 1');
  await expect(page.getByLabel('理想郷の騎士 EXを使用')).toBeChecked();
  await expect(page.getByLabel('理想郷の騎士 EXのスキルレベル')).toHaveValue('8');
  await expect(page.getByRole('button', { name: '概念礼装を変更' })).toContainText(
    '登録コピー・Lv20',
  );
  await page.getByRole('button', { name: '概念礼装', exact: true }).click();
  await expect(
    page.getByRole('list', { name: '登録済み概念礼装' }).getByRole('listitem'),
  ).toHaveCount(2);
  const restoredCopyLevels = page
    .getByRole('list', { name: '登録済み概念礼装' })
    .getByLabel('カレイドスコープのレベル');
  await expect(restoredCopyLevels.nth(0)).toHaveValue('1');
  await expect(restoredCopyLevels.nth(1)).toHaveValue('1');
  await page.getByRole('button', { name: '所持・育成' }).click();
  await expect(page.getByLabel('スキル1')).toHaveValue('1');
  await page.getByRole('button', { name: '支援条件' }).click();
  await expect(page.getByLabel('理想郷の騎士 EXを使用')).toBeChecked();
  await expect(page.getByLabel('理想郷の騎士 EXのスキルレベル')).toHaveValue('8');
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
  await expect(page.getByRole('status')).toContainText('415件をWorkerで計算・unsupported 5件');
  await expect(page.getByRole('table', { name: '共通条件の平均ダメージ順' })).toContainText(
    'アルトリア・ペンドラゴン',
  );
  await page.getByLabel('宝具カード').selectOption('arts');
  await expect(page.getByRole('status')).not.toContainText('415件表示');
  await page.getByLabel('クラス').selectOption('saber');
  await expect(page.getByRole('status')).not.toContainText('415件表示');
  await page.getByLabel('対象範囲').selectOption('owned');
  await expect(page.getByRole('status')).toContainText('0件表示');
});
