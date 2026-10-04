import { readFileSync } from 'node:fs';
import type { Request } from '@playwright/test';
import { expect, test, type Page } from './observedTest';
import { openTestHome } from './setup';
import { masterSnapshotSchema } from '../packages/master-data/src/index';
import { createStaticAttackProfiles } from '../packages/calculation-application/src/index';
import { validateProfileCollection } from '../packages/workspace-domain/src/index';
import { calculationShareSnapshotSchema } from '../packages/schema/src/index';

const published = masterSnapshotSchema.parse(
  JSON.parse(readFileSync('apps/web/public/master/master.json', 'utf8')),
);
const savedSubject = published.servants.find(
  (servant) =>
    createStaticAttackProfiles(servant).length > 0 &&
    servant.atkByLevel['90'] !== undefined &&
    new Set(servant.skills.map(({ slot }) => slot)).size === 3 &&
    published.servants.filter(({ name }) => name === servant.name).length === 1,
);
if (!savedSubject) throw new Error('saved ranking representative unavailable');

async function storedProfiles(page: Page) {
  const value = await page.evaluate(
    () =>
      new Promise<unknown>((resolve, reject) => {
        const opening = indexedDB.open('fgo-lab', 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const read = db.transaction('user', 'readonly').objectStore('user').get('profiles');
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
          read.onsuccess = () => {
            db.close();
            resolve(read.result);
          };
        };
      }),
  );
  const collection = await validateProfileCollection(value, (bytes) =>
    crypto.subtle.digest('SHA-256', new Uint8Array(bytes)),
  );
  const active = collection.profiles.find(
    ({ profileId }) => profileId === collection.activeProfileId,
  );
  if (!active) throw new Error('active profile unavailable');
  return active;
}

test('[E2E-051] initial OC commands, keyboard, responsive detail and reset @desktop @journey', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const pendingImages = new Set<Request>();
  page.on('request', (request) => {
    if (request.resourceType() === 'image') pendingImages.add(request);
  });
  page.on('requestfinished', (request) => pendingImages.delete(request));
  page.on('requestfailed', (request) => pendingImages.delete(request));
  const waitForImages = async () => {
    await expect.poll(() => pendingImages.size).toBe(0);
  };
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
  await waitForImages();
  await page.goto(invalid.toString());
  await page.getByRole('button', { name: '計算条件をリセット' }).click();
  await expect(page.getByRole('status')).toBeFocused();
  await expect(page.getByRole('combobox', { name: '初期OC', exact: true })).toHaveValue('1');
  await expect(page.getByRole('combobox', { name: '宝具Lv', exact: true })).toHaveValue('1');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '所持・育成', exact: true }).click();
  await page.getByLabel('名前で検索').fill(savedSubject.name);
  await page
    .getByRole('list', { name: 'サーヴァント一覧' })
    .getByRole('listitem')
    .filter({
      has: page.getByText(savedSubject.name, { exact: true }),
    })
    .click();
  await page.getByLabel('宝具Lv').selectOption('2');
  await page.getByLabel('レベル', { exact: true }).fill('90');
  await page.getByLabel('ATKフォウ', { exact: true }).fill('1234');
  const savedSkills = page.locator('.skill-field').getByRole('spinbutton');
  await savedSkills.nth(0).fill('2');
  for (const [index, level] of ['1', '5', '9'].entries()) await savedSkills.nth(index).fill(level);
  await expect
    .poll(async () => {
      const build = (await storedProfiles(page)).servantBuilds[savedSubject.id];
      return (
        build && {
          level: build.level,
          npLevel: build.npLevel,
          fouAtk: build.fouAtk,
          skills: build.skills,
        }
      );
    })
    .toEqual({ level: 90, npLevel: 2, fouAtk: 1234, skills: { '1': 1, '2': 5, '3': 9 } });

  await page.getByRole('button', { name: '火力ランキング', exact: true }).click();
  await page.getByRole('combobox', { name: '対象', exact: true }).selectOption('owned');
  await page.getByText('計算基準', { exact: true }).click();
  await page.getByRole('combobox', { name: '育成基準', exact: true }).selectOption('saved');
  await oc.selectOption('2');
  await expect(page).toHaveURL(/rGrowth=saved/);
  await expect(page.getByRole('combobox', { name: 'レベル', exact: true })).toBeDisabled();
  await expect(np).toHaveValue('owned');
  await expect(np).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('件を計算', { timeout: 30_000 });
  const savedRow = page
    .getByRole('list', { name: '宝具火力ランキング' })
    .getByRole('listitem')
    .first();
  await expect(savedRow).toContainText(savedSubject.name);
  const rankingAverage = Number(
    (await savedRow.locator('.ranking-primary-damage strong').textContent())?.replaceAll(',', ''),
  );
  await savedRow.getByRole('button', { name: /の計算詳細を開く/ }).click();
  await expect(savedRow.getByRole('region', { name: /の計算詳細/ })).toContainText(
    /開始NP\s*200%/,
    { timeout: 15_000 },
  );
  await savedRow.getByRole('button', { name: '同じ条件で計算機を開く' }).click();
  await expect(page.getByLabel('計算条件の版情報')).toContainText(
    'ランキングから引き継いだ計算条件',
  );
  await expect
    .poll(async () => (await storedProfiles(page)).draft?.request.executionIntent.kind)
    .toBe('ranking');
  const pinned = (await storedProfiles(page)).draft!;
  if (pinned.request.executionIntent.kind !== 'ranking') throw new Error('ranking draft required');
  expect(pinned.request.executionIntent.basis).toMatchObject({
    servantId: savedSubject.id,
    growthBasis: 'saved',
    level: 90,
    npLevel: 2,
    fouAtk: 1234,
    skillLevels: { '1': 1, '2': 5, '3': 9 },
    initialOvercharge: 2,
  });
  const calculatorAverage = async () =>
    Number(
      (
        await page
          .getByRole('row', { name: /NP2.*現在/ })
          .locator('td.average')
          .textContent()
      )?.replaceAll(',', ''),
    );
  expect(await calculatorAverage()).toBe(rankingAverage);
  await waitForImages();
  await page.reload();
  await expect(page.getByLabel('計算条件の版情報')).toContainText(
    'ランキングから引き継いだ計算条件',
    { timeout: 30_000 },
  );
  expect((await storedProfiles(page)).draft?.request).toEqual(pinned.request);
  expect((await storedProfiles(page)).draft?.result).toEqual(pinned.result);

  await page.getByRole('button', { name: '所持・育成', exact: true }).click();
  await page.getByLabel('名前で検索').fill(savedSubject.name);
  await page
    .getByRole('list', { name: 'サーヴァント一覧' })
    .getByRole('listitem')
    .filter({
      has: page.getByText(savedSubject.name, { exact: true }),
    })
    .click();
  await page.getByLabel('ATKフォウ', { exact: true }).fill('2000');
  await expect
    .poll(async () => (await storedProfiles(page)).servantBuilds[savedSubject.id]?.fouAtk)
    .toBe(2000);
  await waitForImages();
  await page.goto('/calculator');
  await expect(page.getByLabel('計算条件の版情報')).toContainText(
    'ランキングから引き継いだ計算条件',
    { timeout: 30_000 },
  );
  expect(await calculatorAverage()).toBe(rankingAverage);
  expect((await storedProfiles(page)).draft?.requestFingerprint).toBe(pinned.requestFingerprint);
  expect((await storedProfiles(page)).draft?.request).toEqual(pinned.request);

  await page.getByRole('button', { name: 'ホーム', exact: true }).click();
  await page.getByRole('button', { name: 'データ管理', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '全データをバックアップ' }).click();
  const stream = await (await downloading).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await page.getByLabel('バックアップを復元').setInputFiles({
    name: 'saved-ranking-round-trip.json',
    mimeType: 'application/json',
    buffer: Buffer.concat(chunks),
  });
  const preview = page.getByRole('region', { name: '復元内容のプレビュー' });
  await expect(preview).toContainText('プロフィール 1件');
  await expect(preview.getByRole('button', { name: '全置換を実行' })).toBeDisabled();
  const beforeImport = page.waitForEvent('download');
  await preview.getByRole('button', { name: '復元前バックアップを保存' }).click();
  await beforeImport;
  await preview.getByRole('button', { name: '全置換を実行' }).click();
  await expect(page.getByText('検証済みデータへ全置換しました')).toBeVisible();
  const restored = await storedProfiles(page);
  expect(restored.draft?.request).toEqual(pinned.request);
  expect(restored.draft?.result).toEqual(pinned.result);
  expect(
    restored.history.some(
      ({ requestFingerprint }) => requestFingerprint === pinned.requestFingerprint,
    ),
  ).toBe(true);

  await waitForImages();
  await page.goto('/calculator');
  await page.getByRole('button', { name: /履歴（/ }).click();
  await page
    .getByRole('dialog', { name: '計算履歴' })
    .getByRole('button')
    .filter({ hasText: savedSubject.name })
    .first()
    .click();
  await expect
    .poll(async () => (await storedProfiles(page)).draft?.request)
    .toEqual(pinned.request);
  await expect.poll(async () => (await storedProfiles(page)).draft?.result).toEqual(pinned.result);
  expect(await calculatorAverage()).toBe(rankingAverage);

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'URLをコピー' }).click();
  await expect(page.getByText('共有URLをコピーしました')).toBeVisible();
  const sharedUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(sharedUrl).toContain('#share=');
  await waitForImages();
  await page.goto(sharedUrl);
  await expect(page.getByLabel('共有対象の計算結果')).toContainText(savedSubject.name, {
    timeout: 30_000,
  });
  expect(await calculatorAverage()).toBe(rankingAverage);
  const shareDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '共有専用JSONを保存' }).click();
  const shareStream = await (await shareDownload).createReadStream();
  const shareChunks: Buffer[] = [];
  for await (const chunk of shareStream) shareChunks.push(Buffer.from(chunk));
  const shared = calculationShareSnapshotSchema.parse(
    JSON.parse(Buffer.concat(shareChunks).toString('utf8')),
  );
  expect(shared.request).toEqual(pinned.request);
  expect(shared.result).toEqual(pinned.result);
});
