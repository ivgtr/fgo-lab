import { expect, test, type Page } from '@playwright/test';
import { SCHEMA_VERSION } from '../packages/schema/src/index';
import { completeSetup } from './setup';

async function useAttackerSkill(page: Page, name: string | RegExp) {
  const row = page.getByLabel('攻撃役の自身スキル').getByRole('listitem').filter({ hasText: name });
  const toggle = row.getByRole('button', { name: /を使用する$/ });
  await toggle.click();
  await expect(row.getByRole('button', { name: /を使用しない$/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
}

async function useAllAttackerSkills(page: Page) {
  const group = page.getByLabel('攻撃役の自身スキル');
  while ((await group.getByRole('button', { name: /を使用する$/ }).count()) > 0)
    await group
      .getByRole('button', { name: /を使用する$/ })
      .first()
      .click();
}

async function selectAttacker(page: Page, name: string) {
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const dialog = page.getByRole('dialog', { name: '攻撃役を選択' });
  await dialog.getByRole('tab', { name: '全DB' }).click();
  await dialog.getByLabel('名前で検索').fill(name);
  await dialog
    .getByRole('button', { name: new RegExp(`${name}.*Lv`) })
    .first()
    .click();
}

test('diagnostic setup and main calculation flow', async ({ page }) => {
  await page.goto('/');
  await completeSetup(page);
  await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible();
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  const effectiveInput = page.getByLabel('計算に使用する最終値');
  await expect(effectiveInput.locator('details')).not.toHaveAttribute('open', '');
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
  await expect(page.getByLabel('計算に使用する最終値')).toContainText('クラス相性2.00倍');
  await expect(page.getByLabel('攻撃役の自身スキル')).toContainText('理想郷の騎士 EX');
  await expect(page.getByRole('group', { name: '適用条件' })).toHaveCount(0);
  await useAllAttackerSkills(page);
  const ownEffects = page.getByRole('group', { name: /自身の適用内容/ });
  await expect(ownEffects.getByRole('button', { name: /バスターアップ/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await ownEffects.getByRole('button', { name: /バスターアップ/ }).click();
  await ownEffects.getByRole('button', { name: /バスターアップ/ }).click();
  await ownEffects.getByRole('button', { name: /宝具威力アップ/ }).click();
  await ownEffects.getByRole('button', { name: /宝具威力アップ/ }).click();
  await expect(ownEffects).not.toContainText('コマンドカードタイプチェンジ');
  await expect(ownEffects).not.toContainText('弱体耐性アップ');
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
  await expect(page.getByLabel('計算に使用する最終値')).toContainText(
    'BUSTER性能／耐性50.0%／0.0%',
  );
  await expect(page.getByLabel('計算に使用する最終値')).toContainText('宝具威力／耐性30.0%／0.0%');
});

test('works at 320px without horizontal document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await completeSetup(page);
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  const effectiveInput = page.getByLabel('計算に使用する最終値');
  await effectiveInput.locator('summary').click();
  await expect(effectiveInput.locator('.automatic-modifiers')).toBeVisible();
  const overflow = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    return [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => element.getBoundingClientRect().right > viewportWidth + 0.5)
      .map((element) => ({
        className: element.className,
        right: element.getBoundingClientRect().right,
        tagName: element.tagName,
      }))
      .slice(0, 10);
  });
  expect(overflow).toEqual([]);
});

test('adds a support servant directly and optionally saves the composition', async ({ page }) => {
  await page.goto('/');
  await completeSetup(page);
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();

  const damage = page.getByRole('row', { name: /NP1.*現在/ }).locator('td.average');
  const before = Number((await damage.textContent())?.replaceAll(',', ''));
  await page.getByRole('button', { name: '＋ 支援役を追加' }).click();
  const dialog = page.getByRole('dialog', { name: '支援サーヴァントを追加' });
  await dialog.getByRole('tab', { name: '全DB' }).click();
  await dialog.getByLabel('名前で検索').fill('アルトリア・キャスター');
  await dialog
    .getByRole('button', { name: /アルトリア・キャスター/ })
    .first()
    .click();

  const support = page.getByLabel('支援・バフ');
  await expect(support).toContainText('未保存の構成');
  await expect(support).toContainText('除外0効果');
  const attackEffect = support
    .getByRole('group', { name: /支援の適用内容/ })
    .getByRole('button', { name: /攻撃力アップ.*アルトリア・キャスター/ })
    .first();
  await support
    .getByRole('button', { name: /を使用する$/ })
    .first()
    .click();
  await expect(attackEffect).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(async () => Number((await damage.textContent())?.replaceAll(',', '')))
    .toBeGreaterThan(before);

  await support.getByRole('button', { name: '別名で保存' }).click();
  await expect(support.getByLabel('現在の支援構成')).toContainText('支援条件 1');
  await expect(support.getByLabel('現在の支援構成')).toContainText('除外0効果');

  await page.reload();
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  await expect(page.getByLabel('支援・バフ')).toContainText('アルトリア・キャスター');
  await expect(
    page
      .getByLabel('支援・バフ')
      .getByRole('button', { name: /攻撃力アップ.*アルトリア・キャスター/ })
      .first(),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('mobile servant editor moves between list and detail', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile layout uses list-to-detail navigation');
  await page.goto('/');
  await completeSetup(page);
  await page.getByRole('button', { name: '所持', exact: true }).click();

  const list = page.getByRole('list', { name: 'サーヴァント一覧' });
  await expect(list).toBeVisible();
  await expect(page.getByLabel('宝具Lv')).toBeHidden();
  await page.getByRole('button', { name: /^絞り込み/ }).click();
  const filterDialog = page.getByRole('dialog', { name: '詳細な絞り込み' });
  await expect(filterDialog).toBeVisible();
  await filterDialog.getByRole('button', { name: 'Quick', exact: true }).click();
  await filterDialog.getByRole('button', { name: /騎を表示$/ }).click();
  await expect(list.getByRole('listitem').first()).toContainText('QUICK');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await list.getByRole('listitem').first().click();
  await expect(list).toBeHidden();
  await expect(page.getByLabel('宝具Lv')).toBeVisible();
  await page.getByRole('button', { name: '一覧へ戻る' }).click();
  await expect(list).toBeVisible();
});

test('mobile support editor moves between saved list and detail', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile layout uses list-to-detail navigation');
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await completeSetup(page);
  await page.getByRole('button', { name: 'その他' }).click();
  await page.getByRole('button', { name: '支援条件' }).click();

  await page.getByRole('button', { name: '最初の支援条件を作成' }).click();
  const list = page.getByRole('list', { name: '保存済み支援条件' });
  await expect(list).toBeHidden();
  await expect(page.getByRole('region', { name: '支援条件の編集' })).toBeVisible();
  await page.getByRole('button', { name: '支援条件一覧へ戻る' }).click();
  await expect(list).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test('mobile calculator selects virtual attacker and CE from the full DB', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile project covers the compact picker flow');
  await page.setViewportSize({ width: 320, height: 700 });
  await page.route('https://static.atlasacademy.io/**', (route) => route.abort());
  await page.goto('/');
  await completeSetup(page);
  await page.getByRole('button', { name: '計算', exact: true }).click();

  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const attackerDialog = page.getByRole('dialog', { name: '攻撃役を選択' });
  await attackerDialog.getByRole('tab', { name: '全DB' }).click();
  await attackerDialog.getByRole('button', { name: /絞り込み/ }).click();
  await expect(
    attackerDialog
      .getByRole('group', { name: 'クラス' })
      .getByRole('button', { name: 'セイバー', exact: true })
      .locator('img'),
  ).toHaveAttribute('src', /filter-icons\/class\/saber\.png$/);
  await expect(
    attackerDialog
      .getByRole('group', { name: '宝具タイプ' })
      .getByRole('button', { name: 'Buster' })
      .locator('img'),
  ).toHaveAttribute('src', /filter-icons\/card\/buster\.png$/);
  await attackerDialog
    .getByRole('group', { name: 'レア度' })
    .getByRole('button', { name: '★5' })
    .click();
  await attackerDialog
    .getByRole('group', { name: 'クラス' })
    .getByRole('button', { name: 'セイバー', exact: true })
    .click();
  await attackerDialog
    .getByRole('group', { name: '宝具タイプ' })
    .getByRole('button', { name: 'Buster' })
    .click();
  await attackerDialog
    .getByRole('group', { name: '宝具範囲' })
    .getByRole('button', { name: '全体' })
    .click();
  const showFilteredCandidates = attackerDialog.getByRole('button', { name: /騎の候補を見る/ });
  await expect(showFilteredCandidates).not.toContainText('469騎');
  await showFilteredCandidates.click();
  await attackerDialog.getByLabel('名前で検索').fill('アルトリア・ペンドラゴン');
  await attackerDialog
    .getByRole('button', { name: /アルトリア・ペンドラゴン.*★5・セイバー.*Lv90/ })
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
  await expect(setup.or(home)).toBeVisible({ timeout: 15_000 });
  if (await setup.isVisible()) await setup.click();
  await expect(home).toBeVisible({ timeout: 15_000 });
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(home).toBeVisible({ timeout: 15_000 });
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/端末内に自動保存・オフライン/)).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('replaces an older active master with the current published version', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop project covers the IndexedDB master update path');
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  const home = page.getByRole('heading', { name: 'ホーム' });
  await expect(setup.or(home)).toBeVisible({ timeout: 15_000 });
  if (await setup.isVisible()) await setup.click();
  await expect(home).toBeVisible({ timeout: 15_000 });

  const currentVersion = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open('fgo-lab', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('master', 'readwrite');
          const store = transaction.objectStore('master');
          const activeRequest = store.get('active');
          transaction.onerror = () => reject(transaction.error);
          activeRequest.onsuccess = () => {
            const active = activeRequest.result as {
              manifest: { masterDataVersion: string };
              snapshot: {
                version: string;
                servants: Array<{
                  id: string;
                  skills: Array<{
                    id: string;
                    effects: Array<{ id: string; execution: unknown[] }>;
                  }>;
                }>;
              };
            };
            const current = active.manifest.masterDataVersion;
            active.manifest.masterDataVersion = `${current}-stale`;
            active.snapshot.version = `${current}-stale`;
            const boost = active.snapshot.servants
              .find((servant) => servant.id === '2800100')
              ?.skills.find((skill) => skill.id === '904650')
              ?.effects.find((effect) => effect.id === '7366');
            if (boost) boost.execution = [];
            store.put(active, 'active');
            transaction.oncomplete = () => {
              resolve(current);
              db.close();
            };
          };
        };
      }),
  );

  await page.reload();
  await expect(home).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<{ version: string; operation: string | undefined }>((resolve, reject) => {
            const request = indexedDB.open('fgo-lab', 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result;
              const transaction = db.transaction('master', 'readonly');
              const activeRequest = transaction.objectStore('master').get('active');
              transaction.onerror = () => reject(transaction.error);
              activeRequest.onsuccess = () => {
                const active = activeRequest.result as {
                  manifest: { masterDataVersion: string };
                  snapshot: {
                    servants: Array<{
                      id: string;
                      skills: Array<{
                        id: string;
                        effects: Array<{ id: string; execution: Array<{ kind: string }> }>;
                      }>;
                    }>;
                  };
                };
                const boost = active.snapshot.servants
                  .find((servant) => servant.id === '2800100')
                  ?.skills.find((skill) => skill.id === '904650')
                  ?.effects.find((effect) => effect.id === '7366');
                resolve({
                  version: active.manifest.masterDataVersion,
                  operation: boost?.execution[0]?.kind,
                });
                db.close();
              };
            };
          }),
      ),
    )
    .toEqual({ version: currentVersion, operation: 'modifierRateChange' });
});

test('discards an incompatible master cache without deleting user data', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop project covers IndexedDB migration recovery');
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.goto('/');
  await completeSetup(page);
  await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible({ timeout: 15_000 });

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
            const active = masterRequest.result as { snapshot: { version: string } };
            active.snapshot.version = 'incompatible-master-version';
            masterStore.put(active, 'active');
          };
        };
      }),
  );

  await page.reload();
  await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText('互換性のない旧マスターデータを削除し、現行版へ更新しました。'),
  ).toBeVisible();
  await expect.poll(() => pageErrors.map((error) => error.message)).toEqual([]);
  const recovered = await page.evaluate(
    () =>
      new Promise<{ profileId: string; masterVersion: string }>((resolve, reject) => {
        const request = indexedDB.open('fgo-lab', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['master', 'user'], 'readonly');
          const masterRequest = transaction.objectStore('master').get('active');
          const userRequest = transaction.objectStore('user').get('profiles');
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            const active = masterRequest.result as { snapshot: { version: string } };
            const profiles = userRequest.result as { activeProfileId: string };
            resolve({
              profileId: profiles.activeProfileId,
              masterVersion: active.snapshot.version,
            });
            db.close();
          };
        };
      }),
  );
  expect(recovered.profileId).toBe(profileId);
  expect(recovered.masterVersion).not.toBe('incompatible-master-version');

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
              snapshot: { servants: Array<{ rarity: number }> };
            };
            active.snapshot.servants[0]!.rarity = 99;
            store.put(active, 'active');
          };
        };
      }),
  );
  await page.route('**/master/**', (route) => route.abort());
  await page.reload();
  await expect(page.getByRole('button', { name: 'セットアップを開始' })).toBeVisible({
    timeout: 15_000,
  });
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

test('rejects v1 profiles instead of reinterpreting old calculation data', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop project covers IndexedDB profile migration');
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.goto('/');
  await completeSetup(page);
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
  const resetSetup = page.getByRole('button', { name: 'セットアップを開始' });
  const resetHome = page.getByRole('heading', { name: 'ホーム' });
  await expect(resetSetup.or(resetHome)).toBeVisible({ timeout: 15_000 });
  if (await resetSetup.isVisible()) await resetSetup.click();
  await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible();
  const recovered = await page.evaluate(
    () =>
      new Promise<{
        schemaVersion: number;
        servantBuildCount: number;
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
                servantBuilds: Record<string, unknown>;
              }>;
            };
            const profile = collection.profiles[0]!;
            resolve({
              schemaVersion: collection.schemaVersion,
              servantBuildCount: Object.keys(profile.servantBuilds).length,
            });
            db.close();
          };
        };
      }),
  );
  expect(recovered).toEqual({ schemaVersion: SCHEMA_VERSION, servantBuildCount: 0 });
  await expect.poll(() => pageErrors.map((error) => error.message)).toEqual([]);
});

test('autosaves and restores a directly edited calculation draft', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop navigation exposes the persistent undo status');
  await page.goto('/');
  await completeSetup(page);
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  await page.getByRole('tab', { name: '直接入力' }).click();
  await page.getByLabel('攻撃バフ（%）').fill('20');
  await expect(page.getByRole('button', { name: '直前の操作を元に戻す' })).toBeEnabled();
  await page.reload();
  await page.getByRole('button', { name: 'ダメージ計算' }).click();
  await page.getByRole('tab', { name: '直接入力' }).click();
  await expect(page.getByLabel('攻撃バフ（%）')).toHaveValue('20');
  await page.getByRole('tab', { name: 'クイック操作' }).click();
  await page.getByRole('tab', { name: '直接入力' }).click();
  await expect(page.getByLabel('攻撃バフ（%）')).toHaveValue('0');
  await expect(
    page.getByText('直接入力ではパッシブ・スキル・礼装効果を自動加算しません。'),
  ).toBeVisible();
});

test('edits Fou ATK from quick controls and shares the value with direct input', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop project covers draft persistence across input modes');
  await page.goto('/');
  await completeSetup(page);
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
  await expect(page.getByRole('tab', { name: '直接入力' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByLabel('ATKフォウ')).toHaveValue('2000');
  await page.getByRole('tab', { name: 'クイック操作' }).click();
  await expect(page.getByLabel('ATKフォウ（加算）')).toHaveValue('2000');
});

test('uses quick servant level presets and resets only the level', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop project covers calculator draft changes');
  await page.goto('/');
  await completeSetup(page);
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

test('separates final direct inputs from resolved CE and trait effects', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop project covers the full calculator form');
  await page.goto('/');
  await completeSetup(page);
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
  await expect(
    page.getByText('直接入力ではパッシブ・スキル・礼装効果を自動加算しません。'),
  ).toBeVisible();
  await expect(page.getByLabel('計算に使用する最終値')).toContainText('宝具威力／耐性0.0%');
  await page.getByRole('tab', { name: 'クイック操作' }).click();
  await expect(page.getByLabel('計算に使用する最終値')).toContainText('宝具威力アップ');
  await expect(page.getByLabel('計算に使用する最終値')).toContainText('+60%');

  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const attackerDialog = page.getByRole('dialog', { name: '攻撃役を選択' });
  await attackerDialog.getByRole('tab', { name: '全DB' }).click();
  await attackerDialog.getByLabel('名前で検索').fill('ジークフリート');
  await attackerDialog.getByRole('button', { name: /ジークフリート.*セイバー.*Lv80/ }).click();
  await useAllAttackerSkills(page);
  const ownEffects = page.getByRole('group', { name: /自身の適用内容/ });
  const dragonPower = ownEffects.getByRole('button', { name: /威力アップ・対竜/ });
  const dragonNpSpecial = ownEffects.getByRole('button', { name: /竜・特攻宝具/ });
  const damage = page.getByRole('row', { name: /NP1.*現在/ }).locator('td.average');
  const withoutTrait = Number((await damage.textContent())?.replaceAll(',', ''));
  await expect(dragonPower).toHaveAttribute('aria-pressed', 'false');
  await expect(dragonNpSpecial).toHaveAttribute('aria-pressed', 'false');
  await dragonNpSpecial.click();
  await dragonPower.click();
  await expect(dragonPower).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('計算に使用する最終値')).toContainText('150.0%');
  const withTrait = Number((await damage.textContent())?.replaceAll(',', ''));
  expect(withTrait).toBeGreaterThan(withoutTrait * 1.49);

  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  await attackerDialog.getByRole('tab', { name: '全DB' }).click();
  await attackerDialog.getByLabel('名前で検索').fill('アーキタイプ：アース');
  await attackerDialog
    .getByRole('button', { name: /アーキタイプ：アース.*ムーンキャンサー.*Lv90/ })
    .click();
  await useAllAttackerSkills(page);
  const archetypeEffects = page.getByRole('group', { name: /自身の適用内容/ });
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
  await expect(archetypeEffects).toContainText('防御力ダウン');
  await expect(archetypeEffects).toContainText('+20%・S1');
  await expect(archetypeEffects).toContainText('攻撃力アップ');
  await expect(archetypeEffects).toContainText('+30%・S1');
  await expect(archetypeEffects).toContainText('宝具威力アップ');
  await expect(archetypeEffects).toContainText('+20%・S2');
  await expect(archetypeEffects).not.toContainText('千年城フィールドを適用');
  await expect(archetypeEffects).toContainText('バスターアップ：千年城');
  await expect(archetypeEffects).toContainText('+30%・S1');
  await expect(archetypeEffects).not.toContainText('倍率不明');
  await expect(archetypeEffects).not.toContainText('未対応');
  await page.getByLabel('宝具Lv').selectOption('5');
  const chaoticTrait = page
    .getByRole('group', { name: /自身の適用内容/ })
    .getByRole('button', { name: /混沌・特攻宝具/ })
    .first();
  await expect(chaoticTrait).toContainText('2.00倍');
  await expect(chaoticTrait).toHaveAttribute('aria-pressed', 'false');
  await chaoticTrait.click();
  await expect(page.getByLabel('計算に使用する最終値')).toContainText('2.00倍');
});

test('requests quantitative context only when the selected NP requires it', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop project covers contextual damage inputs');
  await page.goto('/');
  await completeSetup(page);
  await page.getByRole('button', { name: 'ダメージ計算' }).click();
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const attackerDialog = page.getByRole('dialog', { name: '攻撃役を選択' });
  await attackerDialog.getByRole('tab', { name: '全DB' }).click();
  await attackerDialog.getByLabel('名前で検索').fill('アン・ボニー＆メアリー・リード');
  await attackerDialog
    .getByRole('button', { name: /アン・ボニー＆メアリー・リード.*ライダー.*Lv80/ })
    .first()
    .click();

  const remainingHp = page.getByRole('spinbutton', { name: '自身の残りHP（%）' });
  await expect(remainingHp).toBeVisible();
  await expect(remainingHp).toHaveValue('');
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toHaveCount(0);
  await remainingHp.fill('50');
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
});

test('executes Dante and Summer Wu production effects through the ordered path', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop project covers the production servant execution audit');
  await page.goto('/');
  await completeSetup(page);
  await page.getByRole('button', { name: 'ダメージ計算' }).click();

  const ownEffects = page.getByRole('group', { name: /自身の適用内容/ });
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const attackerDialog = page.getByRole('dialog', { name: '攻撃役を選択' });
  await attackerDialog.getByRole('tab', { name: '全DB' }).click();
  await attackerDialog.getByLabel('名前で検索').fill('ダンテ・アリギエーリ');
  await attackerDialog.getByRole('button', { name: /ダンテ・アリギエーリ.*Lv90/ }).click();
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
  await expect(ownEffects).toContainText('威力アップ・対 天の力');
  await expect(ownEffects).toContainText('威力アップ・対 地の力');
  await expect(ownEffects).toContainText('宝具威力アップ');
  await expect(ownEffects).not.toContainText('呪い');

  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  await attackerDialog.getByRole('tab', { name: '全DB' }).click();
  await attackerDialog.getByLabel('名前で検索').fill('武則天');
  await attackerDialog.getByRole('button', { name: /武則天.*キャスター.*Lv80/ }).click();
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
  await expect(ownEffects).toContainText('宝具威力アップ');
  await expect(ownEffects).not.toContainText('死霊特性付与');
  await expect(ownEffects).not.toContainText('防御力ダウン');
});

test('reuses the existing HP input for HP-linear own effects at desktop and narrow widths', async ({
  page,
}) => {
  await page.goto('/');
  await completeSetup(page);
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const attackerDialog = page.getByRole('dialog', { name: '攻撃役を選択' });
  await attackerDialog.getByRole('tab', { name: '全DB' }).click();
  await attackerDialog.getByLabel('名前で検索').fill('クー・フーリン');
  await attackerDialog
    .getByRole('button', { name: /クー・フーリン.*ランサー.*Lv70/ })
    .first()
    .click();
  await useAttackerSkill(page, '四枝の浅瀬');

  const hp = page.getByRole('spinbutton', { name: '自身の残りHP（%）' });
  const ownEffects = page.getByRole('group', { name: /自身の適用内容/ });
  const hpAttack = ownEffects.getByRole('button', { name: /攻撃力アップ.*四枝の浅瀬/ });
  const table = page.getByRole('table', { name: '宝具レベル別のダメージ' });

  await expect(hp).toBeVisible();
  await expect(hp).toHaveValue('');
  await expect(hpAttack).toHaveAttribute('aria-pressed', 'true');
  await expect(table).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('正確に計算できない');

  await hp.fill('50');
  await expect(table).toBeVisible();
  await expect(hpAttack).toContainText('+35%');
  const effectiveInput = page.getByLabel('計算に使用する最終値');
  await effectiveInput.locator('summary').click();
  await expect(effectiveInput).toContainText('攻撃バフ／敵防御35.0%／0.0%');

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(hp).toBeVisible();
    await expect(hpAttack).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  }
});

test('Tonelico uses one skill decision for the cumulative HP attack buff', async ({ page }) => {
  await page.goto('/');
  await completeSetup(page);
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const attackerDialog = page.getByRole('dialog', { name: '攻撃役を選択' });
  await attackerDialog.getByRole('tab', { name: '全DB' }).click();
  await attackerDialog.getByLabel('名前で検索').fill('雨の魔女トネリコ');
  await attackerDialog.getByRole('button', { name: /雨の魔女トネリコ.*キャスター.*Lv90/ }).click();
  await useAttackerSkill(page, '逆境のカリスマ');

  const ownEffects = page.getByRole('group', { name: /自身の適用内容/ });
  const attack = ownEffects.getByRole('button', {
    name: /攻撃力アップ.*逆境のカリスマ/,
  });
  const hp = page.getByRole('spinbutton', { name: '自身の残りHP（%）' });
  const row = page.getByRole('row', { name: /NP1.*現在/ });

  await expect(attack).toHaveCount(1);
  await expect(hp).toHaveValue('');
  await hp.fill('100');
  await expect(attack).toHaveAttribute('aria-pressed', 'true');
  await expect(attack).toContainText('合計+20%');
  await expect(row).toContainText('37,263');

  await hp.fill('25');
  await expect(attack).toContainText('合計+60%');
  await expect(row).toContainText('49,684');
  await attack.click();
  await expect(attack).toHaveAttribute('aria-pressed', 'false');
  await expect(row).toContainText('31,052');

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(attack).toBeVisible();
    await expect(hp).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  }
});

test('One Summer Castle applies automatically only at fifty percent HP or below', async ({
  page,
}) => {
  await page.goto('/');
  await completeSetup(page);
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const attackerDialog = page.getByRole('dialog', { name: '攻撃役を選択' });
  await attackerDialog.getByRole('tab', { name: '全DB' }).click();
  await attackerDialog.getByLabel('名前で検索').fill('アルトリア・ペンドラゴン');
  await attackerDialog
    .getByRole('button', { name: /アルトリア・ペンドラゴン.*セイバー.*Lv90/ })
    .first()
    .click();

  await page.getByRole('button', { name: /礼装なし・選択する/ }).click();
  const ceDialog = page.getByRole('dialog', { name: '概念礼装を選択' });
  await ceDialog.getByRole('tab', { name: '全DB' }).click();
  await ceDialog.getByLabel('礼装名').fill('一夏の城');
  await ceDialog
    .getByRole('button', { name: /一夏の城/ })
    .first()
    .click();

  const ownEffects = page.getByRole('group', { name: /自身の適用内容/ });
  const effect = ownEffects.getByRole('img', { name: /一夏の城/ }).locator('xpath=ancestor::li[1]');
  const hp = page.getByRole('spinbutton', { name: '自身の残りHP（%）' });
  const row = page.getByRole('row', { name: /NP1.*現在/ });

  await expect(hp).toHaveValue('');
  await hp.fill('100');
  await expect(effect).toContainText('宝具威力アップ');
  await expect(effect).toContainText('+30%・礼装・条件外');
  await expect(effect.getByRole('button', { name: /宝具威力アップ/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(row).toContainText('33,988');

  await hp.fill('50');
  await expect(effect).toContainText('+30%・礼装');
  await expect(effect).not.toContainText('条件外');
  await expect(row).toContainText('44,185');
  await hp.fill('51');
  await expect(effect).toContainText('+30%・礼装・条件外');
  await expect(row).toContainText('33,988');
});

test('NP card choices replace exclusive siblings and update final-card buffs', async ({ page }) => {
  await page.goto('/');
  await completeSetup(page);
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const attackerDialog = page.getByRole('dialog', { name: '攻撃役を選択' });
  await attackerDialog.getByRole('tab', { name: '全DB' }).click();
  await attackerDialog.getByLabel('名前で検索').fill('エミヤ');
  await attackerDialog
    .getByRole('button', { name: /エミヤ.*アーチャー.*Lv80/ })
    .first()
    .click();
  await useAllAttackerSkills(page);

  const ownEffects = page.getByRole('group', { name: /自身の適用内容/ });
  const artsChange = ownEffects.getByRole('radio', { name: /宝具タイプチェンジ：Arts/ });
  const busterChange = ownEffects.getByRole('radio', { name: /宝具タイプチェンジ：Buster/ });
  const table = page.getByRole('table', { name: '宝具レベル別のダメージ' });
  const average = table
    .getByRole('row', { name: /NP1.*現在/ })
    .locator('td')
    .first();
  const initialAverage = await average.textContent();

  await expect(ownEffects.getByRole('button', { name: /バスターアップ/ })).toBeVisible();
  await expect(ownEffects.getByRole('button', { name: /アーツアップ/ })).toHaveCount(0);
  await artsChange.click();
  await expect(artsChange).toHaveAttribute('aria-checked', 'true');
  await expect(busterChange).toHaveAttribute('aria-checked', 'false');
  await expect(average).not.toHaveText(initialAverage ?? '');
  const artsBuff = ownEffects.getByRole('button', { name: /アーツアップ/ });
  await expect(artsBuff).toBeVisible();
  await expect(ownEffects.getByRole('button', { name: /バスターアップ/ })).toHaveCount(0);
  await expect(artsBuff).toHaveAttribute('aria-pressed', 'true');
  const effectiveInput = page.getByLabel('計算に使用する最終値');
  await effectiveInput.locator('summary').click();
  await expect(effectiveInput).toContainText('ARTS性能／耐性50.0%／0.0%');

  await busterChange.click();
  await expect(table).toBeVisible();
  await expect(busterChange).toHaveAttribute('aria-checked', 'true');
  await expect(artsChange).toHaveAttribute('aria-checked', 'false');
  await expect(effectiveInput).toContainText('BUSTER性能／耐性');

  await artsChange.click();
  await expect(table).toBeVisible();
  await expect(artsChange).toHaveAttribute('aria-checked', 'true');
  await expect(busterChange).toHaveAttribute('aria-checked', 'false');

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(artsChange).toBeVisible();
    await expect(artsBuff).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  }
});

test('Jade Rabbit replaces NP form state with the selected final card', async ({ page }) => {
  await page.goto('/');
  await completeSetup(page);
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const attackerDialog = page.getByRole('dialog', { name: '攻撃役を選択' });
  await attackerDialog.getByRole('tab', { name: '全DB' }).click();
  await attackerDialog.getByLabel('名前で検索').fill('玉兎');
  await attackerDialog.getByRole('button', { name: /玉兎.*ムーンキャンサー.*Lv90/ }).click();
  await useAllAttackerSkills(page);

  const ownEffects = page.getByRole('group', { name: /自身の適用内容/ });
  const busterForm = ownEffects.getByRole('radio', { name: /^月下、有効/ });
  const artsForm = ownEffects.getByRole('radio', { name: /^日輪、有効/ });
  const table = page.getByRole('table', { name: '宝具レベル別のダメージ' });
  const effectiveInput = page.getByLabel('計算に使用する最終値');
  await effectiveInput.locator('summary').click();

  await expect(table).toBeVisible();
  await expect(effectiveInput).toContainText('ARTS性能／耐性');
  await busterForm.click();
  await expect(busterForm).toHaveAttribute('aria-checked', 'true');
  await expect(artsForm).toHaveAttribute('aria-checked', 'false');
  await expect(table).toBeVisible();
  await expect(effectiveInput).toContainText('BUSTER性能／耐性');

  await artsForm.click();
  await expect(table).toBeVisible();
  await expect(artsForm).toHaveAttribute('aria-checked', 'true');
  await expect(busterForm).toHaveAttribute('aria-checked', 'false');
  await expect(effectiveInput).toContainText('ARTS性能／耐性');
});

test('Dante realm decisions are exclusive and preserve the damage UI on desktop and mobile', async ({
  page,
}) => {
  await page.goto('/');
  await completeSetup(page);
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const attackerDialog = page.getByRole('dialog', { name: '攻撃役を選択' });
  await attackerDialog.getByRole('tab', { name: '全DB' }).click();
  await attackerDialog.getByLabel('名前で検索').fill('ダンテ・アリギエーリ');
  await attackerDialog.getByRole('button', { name: /ダンテ・アリギエーリ.*Lv90/ }).click();
  await useAllAttackerSkills(page);

  const ownEffects = page.getByRole('group', { name: /自身の適用内容/ });
  const sky = ownEffects.getByRole('radio', { name: /威力アップ・対 天の力/ });
  const earth = ownEffects.getByRole('radio', { name: /威力アップ・対 地の力/ });
  const table = page.getByRole('table', { name: '宝具レベル別のダメージ' });
  const np1Average = table
    .getByRole('row', { name: /NP1.*現在/ })
    .locator('td')
    .first();
  const initialAverage = await np1Average.textContent();

  await expect(sky).toHaveAttribute('aria-checked', 'false');
  await expect(earth).toHaveAttribute('aria-checked', 'false');
  await expect(ownEffects).not.toContainText('フィールド変化');
  await expect(ownEffects).not.toContainText('クイックアップ');
  await expect(ownEffects).not.toContainText('バスターアップ');
  const npBeforeDamageBuff = ownEffects.getByRole('button', {
    name: /宝具威力アップ.*宝具前効果/,
  });
  await expect(npBeforeDamageBuff).toHaveAttribute('aria-pressed', 'true');
  await npBeforeDamageBuff.click();
  await expect(npBeforeDamageBuff).toHaveAttribute('aria-pressed', 'false');
  await npBeforeDamageBuff.click();
  await expect(ownEffects.getByRole('button', { name: /アーツアップ.*陣地作成/ })).toHaveCount(1);

  await sky.click();
  await expect(sky).toHaveAttribute('aria-checked', 'true');
  await expect(earth).toHaveAttribute('aria-checked', 'false');
  await expect(np1Average).not.toHaveText(initialAverage ?? '');
  const skyAverage = await np1Average.textContent();
  const effectiveInput = page.getByLabel('計算に使用する最終値');
  await effectiveInput.locator('summary').click();
  await expect(effectiveInput).toContainText('特攻状態＋イベント50.0%');

  await earth.click();
  await expect(sky).toHaveAttribute('aria-checked', 'false');
  await expect(earth).toHaveAttribute('aria-checked', 'true');
  await expect(table).toBeVisible();
  await expect(np1Average).not.toHaveText(skyAverage ?? '');
  await expect(effectiveInput).toContainText('特攻状態＋イベント50.0%');
});

test('canonical actor counts derive safe minima and reject lower final totals', async ({
  page,
  isMobile,
}) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await completeSetup(page);
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const attackerDialog = page.getByRole('dialog', { name: '攻撃役を選択' });
  await attackerDialog.getByRole('tab', { name: '全DB' }).click();
  await attackerDialog.getByLabel('名前で検索').fill('ジョン・ラックランド');
  await attackerDialog.getByRole('button', { name: /ジョン・ラックランド.*Lv90/ }).click();

  const ownEffects = page.getByRole('group', { name: /自身の適用内容/ });
  const king = ownEffects.getByRole('spinbutton', { name: '〔王〕一致数' });
  const evil = ownEffects.getByRole('spinbutton', { name: '〔悪〕一致数' });
  const table = page.getByRole('table', { name: '宝具レベル別のダメージ' });
  await expect(king).toHaveValue('1');
  await expect(evil).toHaveValue('1');
  await expect(page.getByText(/同一対象は別の特性条件で重複計上/).first()).toBeVisible();
  await expect(table.getByRole('row', { name: /NP1.*現在/ })).toContainText('31,827');

  await king.fill('0');
  await expect(table).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('正確な計算に必要な戦闘情報');
  await king.fill('1');
  await expect(table).toBeVisible();
  await expect(table.getByRole('row', { name: /NP1.*現在/ })).toContainText('31,827');

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(king).toBeVisible();
    await expect(evil).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  }
});

test('Habetrot uses the final enemy total from one through three', async ({ page }) => {
  await page.goto('/');
  await completeSetup(page);
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const attackerDialog = page.getByRole('dialog', { name: '攻撃役を選択' });
  await attackerDialog.getByRole('tab', { name: '全DB' }).click();
  await attackerDialog.getByLabel('名前で検索').fill('ハベトロット');
  await attackerDialog.getByRole('button', { name: /ハベトロット.*プリテンダー.*Lv80/ }).click();

  const ownEffects = page.getByRole('group', { name: /自身の適用内容/ });
  const count = ownEffects.getByRole('group', { name: '敵の合計数' });
  const row = page.getByRole('row', { name: /NP1.*現在/ });
  await expect(count.getByRole('button', { name: '1' })).toHaveAttribute('aria-pressed', 'true');
  await expect(row).toContainText('50,394');
  await count.getByRole('button', { name: '3' }).click();
  await expect(count.getByRole('button', { name: '3' })).toHaveAttribute('aria-pressed', 'true');
  await expect(row).toContainText('59,557');
  await count.getByRole('button', { name: '1' }).focus();
  await count.getByRole('button', { name: '1' }).press('Enter');
  await expect(row).toContainText('50,394');

  const starAttack = ownEffects.getByRole('button', { name: /攻撃力アップ/ });
  const stars = ownEffects.getByRole('spinbutton', { name: 'クリティカルスター数' });
  await expect(starAttack).toHaveCount(1);
  await expect(stars).toHaveValue('0');
  await expect(starAttack).toHaveAttribute('aria-pressed', 'false');
  await expect(starAttack).toContainText('未使用');
  await starAttack.click();
  await expect(starAttack).toHaveAttribute('aria-pressed', 'true');
  const sourceToggle = page
    .getByLabel('攻撃役の自身スキル')
    .getByRole('button', { name: /南海の大決戦.*使用しない/ });
  await expect(sourceToggle).toHaveAttribute('aria-pressed', 'true');
  await starAttack.click();
  await expect(starAttack).toHaveAttribute('aria-pressed', 'false');
  await expect(sourceToggle).toHaveAttribute('aria-pressed', 'true');
  await starAttack.click();
  await stars.fill('99');
  await expect(row).toContainText('96,207');
  await expect(ownEffects.getByRole('button', { name: /攻撃力アップ/ })).toHaveCount(1);
});

test('probabilistic NP effects use scenario switches and one chained success count', async ({
  page,
}) => {
  await page.goto('/');
  await completeSetup(page);
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();

  await selectAttacker(page, 'ガイウス・ユリウス・カエサル');
  let ownEffects = page.getByRole('group', { name: /自身の適用内容/ });
  const successCount = ownEffects.getByRole('spinbutton', { name: '確率効果の成功回数' });
  await expect(successCount).toHaveValue('5');
  await expect(ownEffects).toContainText('連続判定・各80%');
  await expect(page.getByRole('row', { name: /NP1.*現在/ })).toContainText('81,133');
  await successCount.fill('0');
  await expect(page.getByRole('row', { name: /NP1.*現在/ })).toContainText('54,130');
  await successCount.fill('2');
  await expect(page.getByRole('row', { name: /NP1.*現在/ })).toContainText('64,931');

  await selectAttacker(page, '杉谷善住坊');
  ownEffects = page.getByRole('group', { name: /自身の適用内容/ });
  const independentRolls = ownEffects.getByRole('button', { name: /成功時・/ });
  await expect(independentRolls).toHaveCount(3);
  await expect(ownEffects).not.toContainText('アーツアップ');
  await expect(page.getByRole('row', { name: /NP1.*現在/ })).toContainText('73,499');
  while ((await ownEffects.getByRole('button', { name: /成功時・/ }).count()) > 0)
    await ownEffects
      .getByRole('button', { name: /成功時・/ })
      .first()
      .click();
  await expect(ownEffects.getByRole('button', { name: /失敗扱い・/ })).toHaveCount(3);
  await expect(page.getByRole('row', { name: /NP1.*現在/ })).toContainText('43,749');

  await selectAttacker(page, 'ドゥリーヨダナ');
  ownEffects = page.getByRole('group', { name: /自身の適用内容/ });
  const artsResistance = ownEffects.getByRole('button', {
    name: /アーツ耐性ダウン.*成功時・60%/,
  });
  await expect(artsResistance).toHaveAttribute('aria-pressed', 'true');
  await expect(ownEffects).not.toContainText('クイック耐性ダウン');
  await expect(ownEffects).not.toContainText('バスター耐性ダウン');
  await expect(page.getByRole('row', { name: /NP1.*現在/ })).toContainText('28,427');
  await artsResistance.click();
  await expect(page.getByRole('row', { name: /NP1.*現在/ })).toContainText('23,689');
  await page.getByLabel('OC').selectOption('5');
  await expect(
    ownEffects.getByRole('button', { name: /アーツ耐性ダウン.*比較のため除外/ }),
  ).toHaveAttribute('aria-pressed', 'false');
});

test('Gareth activates required hidden sunlight and preserves its source when excluded', async ({
  page,
}) => {
  await page.goto('/');
  await completeSetup(page);
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const attackerDialog = page.getByRole('dialog', { name: '攻撃役を選択' });
  await attackerDialog.getByRole('tab', { name: '全DB' }).click();
  await attackerDialog.getByLabel('名前で検索').fill('ガレス');
  await attackerDialog.getByRole('button', { name: /ガレス.*セイバー.*Lv80/ }).click();

  const ownEffects = page.getByRole('group', { name: /自身の適用内容/ });
  const sunlightPower = ownEffects.getByRole('button', { name: /^攻撃力アップ、\+20%/ });
  const table = page.getByRole('table', { name: '宝具レベル別のダメージ' });
  const np1Average = table
    .getByRole('row', { name: /NP1.*現在/ })
    .locator('td')
    .first();
  await expect(np1Average).toHaveText(/\d/);
  const initialAverage = await np1Average.textContent();

  await expect(ownEffects).not.toContainText('フィールドセット');
  await expect(sunlightPower).toHaveAttribute('aria-pressed', 'false');
  await expect(sunlightPower).toContainText('条件外');
  await sunlightPower.click();
  await expect(sunlightPower).toHaveAttribute('aria-pressed', 'true');
  await expect(sunlightPower).not.toContainText('条件外');
  await expect(np1Average).not.toHaveText(initialAverage ?? '');

  await page.getByText('計算内訳・根拠・仮定・警告').click();
  await expect(
    page.getByText(/attackerSkill:addTrait:.*8411:0:addTrait-field:fieldSunlight:applied/),
  ).toBeVisible();

  await sunlightPower.click();
  await expect(sunlightPower).toHaveAttribute('aria-pressed', 'false');
  await expect(sunlightPower).toContainText('除外');
  await expect(np1Average).toHaveText(initialAverage ?? '');
  await expect(
    page.getByText(/attackerSkill:addTrait:.*8411:0:addTrait-field:fieldSunlight:applied/),
  ).toBeVisible();
});

test('OR condition effects stay operable and causal at PC, 390px, and 320px', async ({ page }) => {
  await page.goto('/');
  await completeSetup(page);
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const attackerDialog = page.getByRole('dialog', { name: '攻撃役を選択' });
  await attackerDialog.getByRole('tab', { name: '全DB' }).click();
  await attackerDialog.getByLabel('名前で検索').fill('インドラ');
  await attackerDialog.getByRole('button', { name: /インドラ.*Lv90/ }).click();
  await useAllAttackerSkills(page);

  const ownEffects = page.getByRole('group', { name: /自身の適用内容/ });
  const orEffect = ownEffects.getByRole('button', { name: /威力アップ〔蛇・竜〕/ });
  await expect(ownEffects).not.toContainText('Quick攻撃ダメージ前追加効果');
  const table = page.getByRole('table', { name: '宝具レベル別のダメージ' });
  const average = table
    .getByRole('row', { name: /NP1.*現在/ })
    .locator('td')
    .first();
  const initialAverage = await average.textContent();

  await expect(orEffect).toHaveAttribute('aria-pressed', 'false');
  await orEffect.click();
  await expect(orEffect).toHaveAttribute('aria-pressed', 'true');
  await expect(orEffect).not.toContainText('条件外');
  await expect(average).not.toHaveText(initialAverage ?? '');
  await expect(table).toBeVisible();

  const details = page.getByText('計算内訳・根拠・仮定・警告');
  await details.click();
  await expect(page.getByText(/user-decision:.*condition:assumeSatisfied/).first()).toBeVisible();
  await expect(page.getByText(/attackerSkill:addModifier:.*:applied/).first()).toBeVisible();

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(orEffect).toBeVisible();
    await orEffect.click();
    await expect(orEffect).toHaveAttribute('aria-pressed', 'false');
    await orEffect.click();
    await expect(orEffect).toHaveAttribute('aria-pressed', 'true');
    await expect(table).toBeVisible();
  }
});

test('matches the reported Water Lilith inputs and exposes passive damage stacks', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop project covers the full direct input comparison');
  await page.goto('/');
  await completeSetup(page);
  await page.getByRole('button', { name: 'ダメージ計算' }).click();

  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const attackerDialog = page.getByRole('dialog', { name: '攻撃役を選択' });
  await attackerDialog.getByRole('tab', { name: '全DB' }).click();
  await attackerDialog.getByLabel('名前で検索').fill('リリス');
  await attackerDialog.getByRole('button', { name: /リリス.*ライダー.*Lv90/ }).click();
  await page.getByRole('spinbutton', { name: 'サーヴァントLv', exact: true }).fill('120');
  await page.getByRole('tab', { name: '直接入力' }).click();
  await page.getByLabel('ATKフォウ').fill('3000');
  await page.getByLabel('礼装ATK').fill('2400');
  await page.getByLabel('宝具Lv').selectOption('5');
  await page.getByRole('spinbutton', { name: /^クラス相性/ }).fill('1');
  await page.getByRole('spinbutton', { name: /^属性相性/ }).fill('1');
  await page.getByLabel('宝具威力（%）').fill('80');

  const np5 = page.getByRole('row', { name: /NP5.*現在/ });
  await expect(np5).toContainText('61,944');
  await expect(np5).toContainText('75,640');
  const effectiveInput = page.getByLabel('計算に使用する最終値');
  const effectiveInputDetails = effectiveInput.locator('details');
  const effectiveModifiers = effectiveInput.locator('.automatic-modifiers');
  await expect(effectiveInputDetails).not.toHaveAttribute('open', '');
  await expect(effectiveModifiers).toBeHidden();
  await effectiveInput.locator('summary').click();
  await expect(effectiveInputDetails).toHaveAttribute('open', '');
  await expect(effectiveModifiers).toHaveCSS('display', 'flex');
  await expect(effectiveModifiers).toHaveCSS('flex-wrap', 'wrap');
  await expect(effectiveModifiers.locator('div').first()).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  );
  await expect(effectiveModifiers.locator('div').first()).toHaveCSS('padding-top', '0px');
  await expect(effectiveInput).toContainText('QUICK性能／耐性0.0%');
  await expect(effectiveInput).toContainText('固定ダメージ／軽減0／0');

  await page.getByRole('tab', { name: 'クイック操作' }).click();
  const damageEffects = page.getByRole('group', { name: '火力効果の内訳' });
  await expect(damageEffects.getByRole('list')).toHaveCSS('display', 'flex');
  await expect(damageEffects.getByRole('list')).toHaveCSS('flex-wrap', 'wrap');
  await expect(damageEffects).toContainText('クイックアップ +12%');
  await expect(damageEffects).toContainText('アタックプラス +175');
  await expect(damageEffects.getByLabel(/リリス・騎乗 EX \+12%/)).toBeVisible();
  await expect(damageEffects.getByLabel(/リリス・神性 B \+175/)).toBeVisible();
});

test('round-trips an allowlisted calculation share', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'One browser project covers clipboard and download sharing');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await completeSetup(page);
  await page.getByRole('button', { name: 'ダメージ計算' }).click();
  await selectAttacker(page, 'ガイウス・ユリウス・カエサル');
  const procSuccessCount = page
    .getByRole('group', { name: /自身の適用内容/ })
    .getByRole('spinbutton', { name: '確率効果の成功回数' });
  await procSuccessCount.fill('2');
  const currentDamage = page.getByRole('row', { name: /NP1.*現在/ }).locator('td.average');
  await page.getByLabel('クラス相性の状況').selectOption('1.5');
  const sharedDamage = await currentDamage.textContent();
  await page.getByRole('button', { name: 'URLをコピー' }).click();
  await expect(page.getByText('共有URLをコピーしました')).toBeVisible();
  const sharedUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(sharedUrl).toContain('#share=');
  await page.goto('about:blank');
  await page.goto(sharedUrl);
  await expect(page.getByRole('heading', { name: 'ダメージ計算' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByLabel('クラス相性の状況')).toHaveValue('1.5');
  await expect(currentDamage).toHaveText(sharedDamage ?? '');
  await expect(procSuccessCount).toHaveValue('2');

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
  expect(sharedJson).toContain('attackerSkills');
});

test('persists servant, target, CE copies, and support templates', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop navigation covers all management pages');
  await page.goto('/');
  await completeSetup(page);

  await page.getByRole('button', { name: '所持・育成' }).click();
  await expect(page.getByText('469騎')).toBeVisible();
  await page
    .getByRole('group', { name: 'クラス' })
    .getByRole('button', { name: 'セイバー', exact: true })
    .click();
  const servantList = page.getByRole('list', { name: 'サーヴァント一覧' });
  await expect(servantList.getByRole('listitem').first()).toContainText('saber');

  await page.getByRole('button', { name: /^絞り込み/ }).click();
  const servantFilterDialog = page.getByRole('dialog', { name: '詳細な絞り込み' });
  await servantFilterDialog.getByRole('button', { name: '★5', exact: true }).click();
  await servantFilterDialog.getByRole('button', { name: 'Buster', exact: true }).click();
  await servantFilterDialog.getByRole('button', { name: /騎を表示$/ }).click();
  await expect(servantList.getByRole('listitem').first()).toContainText('saber・全体BUSTER');

  await page.getByRole('button', { name: /^絞り込み/ }).click();
  await servantFilterDialog.getByRole('button', { name: '条件をクリア' }).click();
  await servantFilterDialog.getByRole('button', { name: /騎を表示$/ }).click();
  await page.getByRole('button', { name: '全', exact: true }).click();
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
  await page.getByRole('button', { name: '新規作成', exact: true }).click();
  await page.getByLabel('支援条件名').fill('周回支援');
  await page.getByLabel('支援条件名').press('Tab');
  await expect(page.getByRole('list', { name: '保存済み支援条件' })).toContainText('周回支援');
  await page.getByRole('button', { name: /支援元を追加/ }).click();
  const supportDialog = page.getByRole('dialog', { name: '支援元サーヴァントを選択' });
  await supportDialog.getByRole('button', { name: /^絞り込み/ }).click();
  await expect(supportDialog.getByRole('group', { name: 'レア度' })).toBeVisible();
  await expect(supportDialog.getByRole('group', { name: '宝具タイプ' })).toHaveCount(0);
  await supportDialog.getByLabel('名前で検索').fill('アルトリア・ペンドラゴン');
  await supportDialog
    .getByRole('button', { name: /^アルトリア・ペンドラゴン ★5・セイバー/ })
    .click();
  await page.getByLabel('理想郷の騎士 EXのスキルレベル').selectOption('8');
  const supportEditor = page.getByRole('region', { name: '支援条件の編集' });
  await supportEditor
    .getByRole('button', { name: /を使用する$/ })
    .first()
    .click();
  const presetAttackEffect = page
    .getByRole('region', { name: '支援条件の編集' })
    .getByRole('button', { name: /攻撃力アップ/ })
    .first();
  await expect(presetAttackEffect).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: '支援条件の編集' })).toContainText('除外 0効果');
  await page.getByRole('button', { name: /支援元を追加/ }).click();
  await supportDialog.getByLabel('名前で検索').fill('アルトリア・ペンドラゴン');
  await supportDialog
    .getByRole('button', { name: /^アルトリア・ペンドラゴン ★5・セイバー/ })
    .click();
  await expect(page.getByRole('region', { name: '支援条件の編集' })).toContainText('支援元 2騎');
  await expect(page.getByLabel('理想郷の騎士 EXのスキルレベル')).toHaveCount(2);
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
  const selfAttackEffect = page
    .getByRole('group', { name: /自身の適用内容/ })
    .getByRole('button', { name: /攻撃力アップ.*理想郷の騎士 EX/ })
    .first();
  await selfSkillRegion
    .getByRole('button', { name: /を使用する$/ })
    .first()
    .click();
  await expect(selfAttackEffect).toHaveAttribute('aria-pressed', 'true');
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
  await page.getByRole('button', { name: '保存セットを呼び出す' }).click();
  const templateDialog = page.getByRole('dialog', { name: '保存済み支援条件' });
  await templateDialog.getByRole('button', { name: '呼び出す' }).click();
  const calculatorSupport = page.getByLabel('支援・バフ');
  await expect(calculatorSupport).toContainText('周回支援');
  await expect(calculatorSupport).toContainText('+27%');
  await expect(calculatorSupport).not.toContainText('チャージ増加');
  await expect(calculatorSupport).not.toContainText('Extra Attackアップ');
  const supportAttackEffect = calculatorSupport
    .getByRole('group', { name: /支援の適用内容/ })
    .getByRole('button', { name: /攻撃力アップ/ })
    .first();
  await expect(supportAttackEffect).toHaveAttribute('aria-pressed', 'true');
  const damageWithSupportEffect = Number((await currentDamage.textContent())?.replaceAll(',', ''));
  await supportAttackEffect.click();
  const damageWithoutSupportEffect = Number(
    (await currentDamage.textContent())?.replaceAll(',', ''),
  );
  expect(damageWithoutSupportEffect).toBeLessThan(damageWithSupportEffect);
  await supportAttackEffect.click();
  await expect(page.getByLabel('共有対象の計算結果')).toContainText('カレイドスコープ Lv.20');
  await expect(page.getByLabel('共有対象の計算結果')).toContainText('自身スキル1件適用');
  await expect(page.getByLabel('共有対象の計算結果')).toContainText('周回支援（除外0効果）');
  const supportedDamage = Number((await currentDamage.textContent())?.replaceAll(',', ''));
  expect(supportedDamage).toBeGreaterThan(baseDamage);

  await page.getByRole('button', { name: '火力ランキング' }).click();
  const rankingCondition = page.getByRole('region', { name: 'ランキングの共通支援条件' });
  await page.getByLabel('クラス').selectOption('saber');
  const rankingRow = page.getByRole('row', {
    name: /^\d+ アルトリア・ペンドラゴン [\d,]+$/,
  });
  await expect(rankingRow).toBeVisible();
  const rankingWithoutSupport = Number(
    (await rankingRow.locator('td.average').textContent())?.replaceAll(',', ''),
  );
  await rankingCondition.getByRole('button', { name: '選択' }).click();
  const rankingSupportDialog = page.getByRole('dialog', { name: '保存済み支援条件' });
  await rankingSupportDialog.getByRole('button', { name: '呼び出す' }).click();
  await expect(rankingCondition).toContainText('周回支援・除外0効果');
  await expect
    .poll(async () =>
      Number((await rankingRow.locator('td.average').textContent())?.replaceAll(',', '')),
    )
    .toBeGreaterThan(rankingWithoutSupport);

  await page.getByRole('button', { name: '育成計画' }).click();
  await expect(page.getByRole('table', { name: '必要素材台帳' })).toContainText('剣の輝石');
  await expect(page.getByRole('table', { name: '必要素材台帳' })).toContainText('QP');
  await expect(page.getByLabel('素材の使用先')).toContainText('アルトリア・ペンドラゴン');

  await page.reload();
  await page.getByRole('button', { name: 'ダメージ計算' }).click();
  await expect(page.getByLabel('支援・バフ')).toContainText('周回支援');
  await expect(
    page
      .getByRole('group', { name: /自身の適用内容/ })
      .getByRole('button', { name: /攻撃力アップ.*理想郷の騎士 EX/ })
      .first(),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByLabel('攻撃役の自身スキル').getByLabel('理想郷の騎士 EXのスキルレベル'),
  ).toHaveValue('8');
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
  await expect(
    page
      .getByRole('region', { name: '支援条件の編集' })
      .getByRole('button', { name: /攻撃力アップ/ })
      .first(),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('理想郷の騎士 EXのスキルレベル').first()).toHaveValue('8');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'この支援条件を削除' }).click();
  await expect(page.getByText('保存済みの支援条件はありません。')).toBeVisible();
  await page.getByRole('button', { name: '直前の操作を元に戻す' }).click();
  await expect(page.getByRole('list', { name: '保存済み支援条件' })).toContainText('周回支援');
});

test('finalizes one deduplicated history entry per calculation input', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop navigation exercises history and backup together');
  await page.goto('/');
  await completeSetup(page);
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
  await completeSetup(page);
  await page.getByRole('button', { name: '火力ランキング' }).click();
  await expect(page.getByRole('status')).toContainText('420件表示 / 420件を計算');
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
