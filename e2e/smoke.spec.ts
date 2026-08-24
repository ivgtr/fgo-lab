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
  await expect(resultCard).toContainText('クラス有利（2.00倍）・属性等倍（1.00倍）');
  await expect(resultCard).toContainText('支援なし');
  await expect(page.getByLabel('攻撃役の自身スキル').getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('row', { name: /NP1.*現在/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(page.getByRole('row', { name: /NP1.*現在/ })).toContainText('33,713');
  await expect(page.getByLabel('自動適用される能力')).toContainText('クラス相性2.00倍');
  await expect(page.getByLabel('攻撃役の自身スキル')).toContainText('理想郷の騎士 EX');
  await expect(page.getByRole('group', { name: '特攻条件' })).toHaveCount(0);
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
  const home = page.getByRole('heading', { name: 'ホーム' });
  await expect(setup.or(home)).toBeVisible();
  if (await setup.isVisible()) await setup.click();
  await expect(home).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(home).toBeVisible();
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible();
    await expect(page.getByText(/端末内に自動保存・オフライン/)).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('discards an incompatible master cache without deleting user data', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop project covers IndexedDB migration recovery');
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  if (await setup.isVisible()) await setup.click();
  await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible();

  const profileId = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open('fgo-lab', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['master', 'user'], 'readwrite');
          const masterStore = transaction.objectStore('master');
          const userStore = transaction.objectStore('user');
          const masterRequest = masterStore.get('active');
          const userRequest = userStore.get('profiles');
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            const profiles = userRequest.result as { activeProfileId: string };
            resolve(profiles.activeProfileId);
            db.close();
          };
          masterRequest.onsuccess = () => {
            const active = masterRequest.result as {
              snapshot: {
                servants: Array<{
                  name: string;
                  npSpecialAttack?: Record<string, unknown> | null;
                }>;
              };
            };
            const servant = active.snapshot.servants.find(
              (candidate) => candidate.name === 'アーキタイプ：アース',
            )!;
            servant.npSpecialAttack = {
              targetTraits: ['alignmentChaotic'],
              multipliersByOvercharge: [1.5, 1.5, 1.5, 1.5, 1.5],
            };
            masterStore.put(active, 'active');
          };
        };
      }),
  );

  await page.reload();
  await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible();
  await expect(
    page.getByText('互換性のない旧マスターデータを削除し、現行版へ更新しました。'),
  ).toBeVisible();
  await expect.poll(() => pageErrors.map((error) => error.message)).toEqual([]);
  const recovered = await page.evaluate(
    () =>
      new Promise<{ profileId: string; hasCurrentSpecialAttack: boolean }>((resolve, reject) => {
        const request = indexedDB.open('fgo-lab', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['master', 'user'], 'readonly');
          const masterRequest = transaction.objectStore('master').get('active');
          const userRequest = transaction.objectStore('user').get('profiles');
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            const active = masterRequest.result as {
              snapshot: {
                servants: Array<{
                  name: string;
                  npSpecialAttack?: Record<string, unknown> | null;
                }>;
              };
            };
            const profiles = userRequest.result as { activeProfileId: string };
            const servant = active.snapshot.servants.find(
              (candidate) => candidate.name === 'アーキタイプ：アース',
            );
            resolve({
              profileId: profiles.activeProfileId,
              hasCurrentSpecialAttack: Boolean(
                servant?.npSpecialAttack?.['multipliersByNpLevelAndOvercharge'],
              ),
            });
            db.close();
          };
        };
      }),
  );
  expect(recovered).toEqual({ profileId, hasCurrentSpecialAttack: true });

  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('fgo-lab', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('master', 'readwrite');
          const store = transaction.objectStore('master');
          const activeRequest = store.get('active');
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            resolve();
            db.close();
          };
          activeRequest.onsuccess = () => {
            const active = activeRequest.result as {
              snapshot: { servants: Array<{ npSpecialAttack?: Record<string, unknown> | null }> };
            };
            const servant = active.snapshot.servants.find(
              (candidate) => candidate.npSpecialAttack,
            )!;
            servant.npSpecialAttack = {
              targetTraits: ['invalid'],
              multipliersByOvercharge: [1, 1, 1, 1, 1],
            };
            store.put(active, 'active');
          };
        };
      }),
  );
  await page.route('**/master/**', (route) => route.abort());
  await page.reload();
  await expect(page.getByRole('heading', { name: '初回セットアップ' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(
    '互換性のない旧マスターデータを削除しました。再セットアップが必要です',
  );
  await expect.poll(() => pageErrors.map((error) => error.message)).toEqual([]);
  const discardedState = await page.evaluate(
    () =>
      new Promise<{ hasActiveMaster: boolean; profileId: string }>((resolve, reject) => {
        const request = indexedDB.open('fgo-lab', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['master', 'user'], 'readonly');
          const masterRequest = transaction.objectStore('master').get('active');
          const userRequest = transaction.objectStore('user').get('profiles');
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            resolve({
              hasActiveMaster: masterRequest.result !== undefined,
              profileId: (userRequest.result as { activeProfileId: string }).activeProfileId,
            });
            db.close();
          };
        };
      }),
  );
  expect(discardedState).toEqual({ hasActiveMaster: false, profileId });
});

test('upgrades v1 profiles without blocking startup', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop project covers IndexedDB profile migration');
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  if (await setup.isVisible()) await setup.click();
  await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible();

  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('fgo-lab', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('user', 'readwrite');
          const store = transaction.objectStore('user');
          const profilesRequest = store.get('profiles');
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            resolve();
            db.close();
          };
          profilesRequest.onsuccess = () => {
            const collection = profilesRequest.result as {
              schemaVersion: number;
              profiles: Array<Record<string, unknown>>;
            };
            const profile = collection.profiles[0]!;
            collection.schemaVersion = 1;
            profile['servantBuilds'] = {
              '405900': {
                servantId: '405900',
                level: 90,
                ascension: 4,
                npLevel: 1,
                fouAtk: 1000,
                skills: { '1': 10 },
                appends: {},
                updatedAt: '2026-08-24T00:00:00.000Z',
              },
            };
            profile['draft'] = { input: { npSpecialMultiplier: 1.5 } };
            profile['history'] = [{ input: { npSpecialMultiplier: 1.5 } }];
            store.put(collection, 'profiles');
          };
        };
      }),
  );

  await page.reload();
  await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible();
  await expect(
    page.getByText('保存済みの育成データを引き継ぎ、旧形式の計算下書きと履歴を削除しました。'),
  ).toBeVisible();
  const recovered = await page.evaluate(
    () =>
      new Promise<{
        schemaVersion: number;
        npLevel: number;
        draft: unknown;
        historyLength: number;
      }>((resolve, reject) => {
        const request = indexedDB.open('fgo-lab', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('user', 'readonly');
          const profilesRequest = transaction.objectStore('user').get('profiles');
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            const collection = profilesRequest.result as {
              schemaVersion: number;
              profiles: Array<{
                servantBuilds: Record<string, { npLevel: number }>;
                draft: unknown;
                history: unknown[];
              }>;
            };
            const profile = collection.profiles[0]!;
            resolve({
              schemaVersion: collection.schemaVersion,
              npLevel: profile.servantBuilds['405900']!.npLevel,
              draft: profile.draft,
              historyLength: profile.history.length,
            });
            db.close();
          };
        };
      }),
  );
  expect(recovered).toEqual({ schemaVersion: 2, npLevel: 1, draft: null, historyLength: 0 });
  await expect.poll(() => pageErrors.map((error) => error.message)).toEqual([]);
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

test('edits Fou ATK from quick controls and shares the value with direct input', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop project covers draft persistence across input modes');
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  if (await setup.isVisible()) await setup.click();
  await page.getByRole('button', { name: 'ダメージ計算' }).click();
  const fou = page.getByLabel('ATKフォウ（加算）');
  await expect(fou).toHaveValue('1000');
  const fouControls = page.getByLabel('ATKフォウのクイック選択');
  const damage = page.getByRole('row', { name: /NP1.*現在/ }).locator('td.average');
  const before = Number((await damage.textContent())?.replaceAll(',', ''));
  await fouControls.getByRole('button', { name: '+1,000' }).click();
  await expect(fou).toHaveValue('2000');
  expect(Number((await damage.textContent())?.replaceAll(',', ''))).toBeGreaterThan(before);
  await fouControls.getByRole('button', { name: '+1,000' }).click();
  await expect(fou).toHaveValue('3000');
  await expect(fouControls.getByRole('button', { name: '+1,000' })).toBeDisabled();
  await fouControls.getByRole('button', { name: 'リセット' }).click();
  await expect(fou).toHaveValue('0');
  await fouControls.getByRole('button', { name: '+1,000' }).click();
  await fouControls.getByRole('button', { name: '+1,000' }).click();
  await page.getByRole('tab', { name: '直接入力' }).click();
  await expect(page.getByLabel('ATKフォウ')).toHaveValue('2000');
  await page.reload();
  await page.getByRole('button', { name: 'ダメージ計算' }).click();
  await expect(page.getByLabel('ATKフォウ（加算）')).toHaveValue('2000');
});

test('uses quick servant level presets and resets only the level', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop project covers calculator draft changes');
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  if (await setup.isVisible()) await setup.click();
  await page.getByRole('button', { name: 'ダメージ計算' }).click();
  const level = page.getByLabel('サーヴァントLv', { exact: true });
  const controls = page.getByLabel('サーヴァントLvのクイック選択');
  await expect(level).toHaveValue('90');
  await controls.getByRole('button', { name: '100', exact: true }).click();
  await expect(level).toHaveValue('100');
  await page.getByLabel('宝具Lv').selectOption('2');
  await controls.getByRole('button', { name: 'リセット' }).click();
  await expect(level).toHaveValue('90');
  await expect(page.getByLabel('宝具Lv')).toHaveValue('2');
  await controls.getByRole('button', { name: '120', exact: true }).click();
  await expect(level).toHaveValue('120');
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
    '攻撃バフ（%）',
    '敵防御力（%）',
    'カード耐性（%）',
    '宝具耐性（%）',
    '特攻宝具倍率（%）',
    'イベント特攻（%）',
    '固定ダメージ軽減',
  ])
    await expect(page.getByLabel(label)).toBeVisible();
  const directClassAffinity = page.getByRole('spinbutton', { name: /^クラス相性/ });
  const directAttributeAffinity = page.getByRole('spinbutton', { name: /^属性相性/ });
  await expect(directClassAffinity).toBeVisible();
  await expect(directAttributeAffinity).toBeVisible();

  await directClassAffinity.fill('1.7');
  await page.getByLabel('クラス相性の状況').selectOption('0.5');
  await expect(directClassAffinity).toHaveValue('0.5');
  await page.getByRole('button', { name: 'ATK・相性を既定値へ戻す' }).click();
  await expect(directClassAffinity).toHaveValue('1');

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
  await page.getByLabel('竜殺し A++を使用').check();
  const damage = page.getByRole('row', { name: /NP1.*現在/ }).locator('td.average');
  const withoutTrait = Number((await damage.textContent())?.replaceAll(',', ''));
  await expect(page.getByLabel('自動適用される能力')).toContainText('対象特性なし');
  const specialConditions = page.getByRole('group', { name: '特攻条件' });
  await expect(specialConditions.getByRole('listitem')).toHaveCount(1);
  await expect(specialConditions).toContainText('竜特攻');
  await expect(specialConditions).toContainText('+80% / 150%');
  await expect(specialConditions).not.toContainText('竜殺し A++');
  await expect(specialConditions.locator('.special-trait-icon')).toHaveCount(2);
  await specialConditions.getByRole('checkbox', { name: /竜特攻/ }).check();
  await expect(page.getByLabel('自動適用される能力')).toContainText('1.50倍');
  const withTrait = Number((await damage.textContent())?.replaceAll(',', ''));
  expect(withTrait).toBeGreaterThan(withoutTrait * 1.49);

  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  await attackerDialog.getByRole('tab', { name: '全DB' }).click();
  await attackerDialog.getByLabel('名前・クラス').fill('アーキタイプ：アース');
  await attackerDialog
    .getByRole('button', { name: /アーキタイプ：アース moonCancer・Lv90/ })
    .click();
  await page.getByLabel('宝具Lv').selectOption('5');
  await expect(specialConditions).toContainText('混沌特攻');
  await expect(specialConditions).toContainText('200%');
  await specialConditions.getByRole('checkbox', { name: /混沌特攻/ }).check();
  await expect(page.getByLabel('自動適用される能力')).toContainText('2.00倍');
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
  await page.getByLabel('クラス相性の状況').selectOption('1.5');
  const sharedDamage = await currentDamage.textContent();
  await page.getByRole('button', { name: 'URLをコピー' }).click();
  await expect(page.getByText('共有URLをコピーしました')).toBeVisible();
  const sharedUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(sharedUrl).toContain('#share=');
  await page.goto('about:blank');
  await page.goto(sharedUrl);
  await expect(page.getByRole('heading', { name: 'ダメージ計算' })).toBeVisible();
  await expect(page.getByLabel('クラス相性の状況')).toHaveValue('1.5');
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
