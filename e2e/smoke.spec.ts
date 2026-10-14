import { expect, test, type NewObservedPage, type Page } from './observedTest';
import { completeSetup, openTestHome } from './setup';
import { webcrypto } from 'node:crypto';
import { portableCalculationFingerprint } from '../packages/workspace-domain/src/index';
import { editCurrentStoredProfiles } from './currentProfileFixture';
import { ATLAS_CONTRACT_SHA256 } from '../apps/web/src/adapters/atlasContractFingerprint';

const fixtureImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=',
  'base64',
);

async function openCalculator(page: Page) {
  await openTestHome(page);
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/calculator$/);
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
}

async function freshPage(newObservedPage: NewObservedPage) {
  return await newObservedPage({ storageState: { cookies: [], origins: [] } });
}

async function pinStoredDraftToHistorical(page: Page, unsupported: boolean) {
  await editCurrentStoredProfiles(page, async (collection) => {
    const draft = collection.profiles[0]!.draft;
    if (!draft || draft.request.scenario.mode !== 'resolved')
      throw new Error('resolved draft required');
    draft.request.versionContext = {
      ...draft.request.versionContext,
      masterDataVersion: 'historical-master',
      engineVersion: 'historical-engine',
    };
    if (unsupported)
      draft.request.scenario.craftEssence = { craftEssenceId: 'missing', level: 1, limitBreak: 0 };
    draft.result.versions.masterDataVersion = 'historical-master';
    draft.result.versions.engineVersion = 'historical-engine';
    draft.requestFingerprint = await portableCalculationFingerprint(draft.request, (bytes) =>
      webcrypto.subtle.digest('SHA-256', new Uint8Array(bytes)),
    );
  });
}

async function storedDraftVersionContext(page: Page) {
  return await page.evaluate(
    () =>
      new Promise<{ masterDataVersion: string; engineVersion: string }>((resolve, reject) => {
        const request = indexedDB.open('fgo-lab', 2);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('user', 'readonly');
          const profilesRequest = transaction.objectStore('user').get('profiles');
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            const collection = profilesRequest.result as {
              profiles: Array<{
                draft: {
                  request: {
                    versionContext: { masterDataVersion: string; engineVersion: string };
                  };
                };
              }>;
            };
            const { masterDataVersion, engineVersion } =
              collection.profiles[0]!.draft.request.versionContext;
            resolve({ masterDataVersion, engineVersion });
            db.close();
          };
        };
      }),
  );
}

test('[E2E-017] setup to calculator package journey @desktop @journey', async ({ page }) => {
  await page.route('https://static.atlasacademy.io/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: fixtureImage }),
  );
  await openCalculator(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: '宝具ダメージ', exact: true })).toBeVisible();
  const result = page.getByLabel('共有対象の計算結果');
  await expect(result).toContainText('アルトリア・ペンドラゴン');
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '宝具ダメージ', exact: true })).toHaveCount(1);
  const ownEffects = page.getByRole('group', { name: /自身の適用内容/ });
  await ownEffects.getByRole('button', { name: /バスターアップ/ }).click();
  await expect(ownEffects.getByRole('button', { name: /バスターアップ/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'ホーム', exact: true }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/calculator$/);
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
});

test('[E2E-062] calculator target selection persists @desktop @journey', async ({ page }) => {
  await page.route('https://static.atlasacademy.io/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: fixtureImage }),
  );
  await openCalculator(page);
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const picker = page.getByRole('dialog', { name: '攻撃役を選択' });
  await picker.getByRole('tab', { name: '全DB' }).click();
  await picker.getByLabel('名前で検索').fill('オルガマリー');
  await picker
    .getByRole('button', { name: /Ｕ－オルガマリー.*Lv/ })
    .first()
    .click();
  await expect(
    page.getByText(
      '対象によってダメージが変わります。クラス相性・属性相性の欄で対象クラス・属性を指定し、必要なら対象特性の該当・非該当も選択してください。',
    ),
  ).toBeVisible();
  await page.getByRole('combobox', { name: '属性相性の状況' }).selectOption('attribute:earth');
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
  await openTestHome(page);
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  await expect(page.getByRole('combobox', { name: '属性相性の状況' })).toHaveValue(
    'attribute:earth',
  );
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
});

test('[E2E-020] mobile servant editor navigation @mobile @journey', async ({ page }) => {
  await openTestHome(page);
  await page.getByRole('button', { name: '所持', exact: true }).click();
  await expect(page).toHaveURL(/\/servants$/);
  const list = page.getByRole('list', { name: 'サーヴァント一覧' });
  await expect(list).toBeVisible();
  await list.getByRole('listitem').first().click();
  await expect(list).toBeHidden();
  await expect(page.getByLabel('宝具Lv')).toBeVisible();
  await page.getByRole('button', { name: '一覧へ戻る' }).click();
  await expect(list).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
});

test('[E2E-021] mobile support editor navigation @mobile @journey', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openTestHome(page);
  await page.getByRole('button', { name: 'その他' }).click();
  await page.getByRole('button', { name: '支援条件', exact: true }).click();
  await page.getByRole('button', { name: '最初の支援条件を作成' }).click();
  const list = page.getByRole('list', { name: '保存済み支援条件' });
  await expect(list).toBeHidden();
  await page.getByRole('button', { name: '支援条件一覧へ戻る' }).click();
  await expect(list).toBeVisible();
});

test('[E2E-022] mobile picker focus and image download @mobile @journey', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.route('https://static.atlasacademy.io/**', (route) => route.abort());
  await openTestHome(page);
  await page.getByRole('button', { name: '計算', exact: true }).click();
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  const dialog = page.getByRole('dialog', { name: '攻撃役を選択' });
  await dialog.getByRole('tab', { name: '全DB' }).click();
  await dialog.getByLabel('名前で検索').fill('アルトリア・ペンドラゴン');
  await dialog
    .getByRole('button', { name: /アルトリア・ペンドラゴン.*Lv90/ })
    .first()
    .click();
  await page.getByRole('button', { name: '攻撃役を変更' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '攻撃役を変更' })).toBeFocused();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '画像として保存' }).click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).readUInt32BE(16)).toBe(1120);
});

test('[E2E-023] offline reopen through service worker @desktop @journey', async ({
  context,
  page,
}) => {
  try {
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise<void>((resolve) =>
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
            once: true,
          }),
        );
    });
    await page.goto('/');
    await completeSetup(page);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const cache = await caches.open('fgo-lab-shell-v5');
          const assets = [
            ...new Set(
              performance
                .getEntriesByType('resource')
                .map((entry) => entry.name)
                .filter((url) => new URL(url).pathname.startsWith('/_next/static/')),
            ),
          ];
          return (
            assets.length > 0 &&
            (await Promise.all(assets.map((url) => cache.match(url)))).every(Boolean)
          );
        }),
      )
      .toBe(true);
    const cachedUrls = await page.evaluate(async () => {
      const requests = await Promise.all(
        (await caches.keys()).map((cacheName) =>
          caches.open(cacheName).then((cache) => cache.keys()),
        ),
      );
      return requests.flat().map(({ url }) => url);
    });
    expect(cachedUrls.some((url) => new URL(url).origin !== new URL(page.url()).origin)).toBe(
      false,
    );
    await context.unroute(
      'https://raw.githubusercontent.com/ivgtr/fgo-lab/atlas-certificates/JP/**',
    );
    await context.setOffline(true);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/端末内に自動保存・オフライン/)).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('[E2E-025] damaged certified master preserves user data @desktop @journey', async ({
  newObservedPage,
}) => {
  // a failed refresh retains the damaged bytes and the user profile.
  const { context, page } = await freshPage(newObservedPage);
  try {
    await page.goto('/');
    await completeSetup(page);
    const profileId = await page.evaluate(
      (contract) =>
        new Promise<string>((resolve, reject) => {
          const request = indexedDB.open('fgo-lab', 2);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['master', 'user'], 'readwrite');
            const masterRequest = transaction.objectStore('master').get(`atlas-active:${contract}`);
            const userRequest = transaction.objectStore('user').get('profiles');
            transaction.onerror = () => reject(transaction.error);
            transaction.oncomplete = () => {
              resolve((userRequest.result as { activeProfileId: string }).activeProfileId);
              db.close();
            };
            masterRequest.onsuccess = () => {
              const active = masterRequest.result as { snapshotBytes: ArrayBuffer };
              const snapshot = JSON.parse(new TextDecoder().decode(active.snapshotBytes)) as {
                version: string;
              };
              snapshot.version = 'incompatible-master-version';
              active.snapshotBytes = new TextEncoder().encode(JSON.stringify(snapshot)).buffer;
              transaction.objectStore('master').put(active, `atlas-active:${contract}`);
            };
          };
        }),
      ATLAS_CONTRACT_SHA256,
    );
    await page.route(
      'https://raw.githubusercontent.com/ivgtr/fgo-lab/atlas-certificates/JP/**',
      (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: 'not-json' }),
    );
    await page.reload();
    await expect(page.getByRole('button', { name: 'セットアップを開始' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('.startup-screen__notice')).toContainText(
      '保存済みマスターを検証できません（canonical）',
    );
    const retained = await page.evaluate(
      (contract) =>
        new Promise<{ hasMaster: boolean; profileId: string }>((resolve, reject) => {
          const request = indexedDB.open('fgo-lab', 2);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['master', 'user'], 'readonly');
            const master = transaction.objectStore('master').get(`atlas-active:${contract}`);
            const user = transaction.objectStore('user').get('profiles');
            transaction.onerror = () => reject(transaction.error);
            transaction.oncomplete = () => {
              resolve({
                hasMaster: master.result !== undefined,
                profileId: (user.result as { activeProfileId: string }).activeProfileId,
              });
              db.close();
            };
          };
        }),
      ATLAS_CONTRACT_SHA256,
    );
    expect(retained).toEqual({ hasMaster: true, profileId });
  } finally {
    await context.close();
  }
});

test('[E2E-055] invalid profile requires confirmation before fresh setup @desktop @journey', async ({
  newObservedPage,
}) => {
  const { context, page } = await freshPage(newObservedPage);
  try {
    await openTestHome(page);
    const oldProfileId = await page.evaluate(
      () =>
        new Promise<string>((resolve, reject) => {
          const opening = indexedDB.open('fgo-lab', 2);
          opening.onerror = () => reject(opening.error);
          opening.onsuccess = () => {
            const db = opening.result;
            const transaction = db.transaction('user', 'readwrite');
            const request = transaction.objectStore('user').get('profiles');
            transaction.onerror = () => reject(transaction.error);
            let profileId = '';
            transaction.oncomplete = () => {
              db.close();
              resolve(profileId);
            };
            request.onsuccess = () => {
              const collection = request.result as {
                activeProfileId: string;
                schemaVersion: number;
              };
              profileId = collection.activeProfileId;
              transaction.objectStore('user').put({ ...collection, schemaVersion: 32 }, 'profiles');
            };
          };
        }),
    );
    await page.reload();
    const reset = page.getByRole('button', { name: '保存プロフィールを削除して新規開始' });
    await expect(reset).toBeVisible();
    page.once('dialog', (dialog) => void dialog.dismiss());
    await reset.click();
    await page.reload();
    await expect(reset).toBeVisible();
    page.once('dialog', (dialog) => void dialog.accept());
    await reset.click();
    await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible({ timeout: 30_000 });
    const recovered = await page.evaluate(
      (contract) =>
        new Promise<{ profileId: string; hasMaster: boolean }>((resolve, reject) => {
          const opening = indexedDB.open('fgo-lab', 2);
          opening.onerror = () => reject(opening.error);
          opening.onsuccess = () => {
            const db = opening.result;
            const transaction = db.transaction(['user', 'master'], 'readonly');
            const user = transaction.objectStore('user').get('profiles');
            const master = transaction.objectStore('master').get(`atlas-active:${contract}`);
            transaction.onerror = () => reject(transaction.error);
            transaction.oncomplete = () => {
              resolve({
                profileId: (user.result as { activeProfileId: string }).activeProfileId,
                hasMaster: master.result !== undefined,
              });
              db.close();
            };
          };
        }),
      ATLAS_CONTRACT_SHA256,
    );
    expect(recovered.profileId).not.toBe(oldProfileId);
    expect(recovered.hasMaster).toBe(true);
  } finally {
    await context.close();
  }
});

test('[E2E-027] calculator draft autosave restore @desktop @journey', async ({ page }) => {
  await openCalculator(page);
  await page.getByRole('tab', { name: '直接入力' }).click();
  await page.getByLabel('攻撃バフ（%）').fill('20');
  await page.reload();
  await page.getByRole('button', { name: 'ダメージ計算' }).click();
  await page.getByRole('tab', { name: '直接入力' }).click();
  await expect(page.getByLabel('攻撃バフ（%）')).toHaveValue('20');
});

test('[E2E-045] calculation share clipboard and downloads @desktop @journey', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openCalculator(page);
  await page.getByRole('button', { name: 'URLをコピー' }).click();
  await expect(page.getByText('共有URLをコピーしました')).toBeVisible();
  const sharedUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(sharedUrl).toContain('#share=');
  await page.goto(sharedUrl);
  await expect(page.getByRole('heading', { name: 'ダメージ計算' })).toBeVisible();
  await expect(page.getByLabel('共有対象の計算結果')).toContainText('アルトリア・ペンドラゴン');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '共有専用JSONを保存' }).click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString('utf8')).toContain('fgo-lab-calculation-share');
});

test('[E2E-046] successful version recovery commits and focuses @desktop @journey', async ({
  page,
}) => {
  await openCalculator(page);
  const ownEffects = page.getByRole('group', { name: /自身の適用内容/ });
  await ownEffects.getByRole('button', { name: /バスターアップ/ }).click();
  await expect(page.getByRole('button', { name: '直前の操作を元に戻す' })).toBeEnabled();
  await pinStoredDraftToHistorical(page, false);
  await page.reload();
  await expect(page.getByRole('heading', { name: /履歴値.*再計算されていません/ })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: '現在のバージョンで再計算' }).click();
  await expect(page.getByRole('heading', { name: '宝具ダメージ', exact: true })).toBeFocused();
  expect(await storedDraftVersionContext(page)).not.toEqual({
    masterDataVersion: 'historical-master',
    engineVersion: 'historical-engine',
  });
});

test('[E2E-047] unsupported version recovery retains and focuses @desktop @journey', async ({
  page,
}) => {
  await openCalculator(page);
  const ownEffects = page.getByRole('group', { name: /自身の適用内容/ });
  await ownEffects.getByRole('button', { name: /バスターアップ/ }).click();
  await expect(page.getByRole('button', { name: '直前の操作を元に戻す' })).toBeEnabled();
  await pinStoredDraftToHistorical(page, true);
  await page.reload();
  const retry = page.getByRole('button', { name: '現在のバージョンで再計算' });
  await retry.click();
  const error = page.locator('[data-calculation-error-summary]');
  await expect(error).toContainText('元の履歴値を保持しています');
  await expect(error).toBeFocused();
  expect(await storedDraftVersionContext(page)).toEqual({
    masterDataVersion: 'historical-master',
    engineVersion: 'historical-engine',
  });
});

test('[E2E-048] profile repository round-trip @desktop @journey', async ({ page }) => {
  await openTestHome(page);
  await page.getByRole('button', { name: '所持・育成' }).click();
  await page.getByLabel('宝具Lv').selectOption('2');
  await page.getByRole('button', { name: '概念礼装', exact: true }).click();
  await page.getByRole('button', { name: 'DBから礼装を登録' }).click();
  const dialog = page.getByRole('dialog', { name: '概念礼装を検索' });
  await dialog.getByLabel('礼装名').fill('カレイドスコープ');
  await dialog.getByRole('button', { name: '登録' }).first().click();
  await page.reload();
  await page.getByRole('button', { name: '概念礼装', exact: true }).click();
  await expect(
    page.getByRole('list', { name: '登録済み概念礼装' }).getByRole('listitem'),
  ).toHaveCount(1);
  await page.getByRole('button', { name: '所持・育成' }).click();
  await expect(page.getByLabel('宝具Lv')).toHaveValue('2');
  await page.getByRole('button', { name: '支援条件', exact: true }).click();
  await page.getByRole('button', { name: '新規作成', exact: true }).click();
  await page.getByLabel('支援条件名').fill('周回支援');
  await page.getByLabel('支援条件名').press('Tab');
  await page.getByRole('button', { name: /支援元を追加/ }).click();
  const supportDialog = page.getByRole('dialog', { name: '支援元サーヴァントを選択' });
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
  await page.reload();
  await page.getByRole('button', { name: '支援条件', exact: true }).click();
  await expect(page.getByRole('list', { name: '保存済み支援条件' })).toContainText('周回支援');
  await expect(page.getByLabel('理想郷の騎士 EXのスキルレベル')).toHaveValue('8');
  await expect(
    page
      .getByRole('region', { name: '支援条件の編集' })
      .getByRole('button', { name: /攻撃力アップ/ })
      .first(),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('[E2E-049] history backup download and restore @desktop @journey', async ({ page }) => {
  await openCalculator(page);
  await page.getByRole('button', { name: 'ホーム' }).click();
  await page.getByRole('button', { name: 'データ管理' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '全データをバックアップ' }).click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const backup = Buffer.concat(chunks);
  const parsed = JSON.parse(backup.toString('utf8')) as {
    profiles: { profiles: { history: unknown[] }[] };
  };
  expect(parsed.profiles.profiles[0]?.history).toHaveLength(1);
  await page.getByLabel('バックアップを復元').setInputFiles({
    name: 'round-trip.json',
    mimeType: 'application/json',
    buffer: backup,
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
