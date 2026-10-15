import { expect, type Page } from '@playwright/test';
import { rankingFixtureResult } from './rankingFixture';

export async function completeSetup(page: Page): Promise<void> {
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  const home = page.getByRole('heading', { name: 'ホーム' });
  await expect(setup.or(home)).toBeVisible({ timeout: 15_000 });
  if (await setup.isVisible()) await setup.click();
  await expect(home).toBeVisible({ timeout: 30_000 });
}

export async function openTestHome(page: Page): Promise<void> {
  await page.goto('/');
  await completeSetup(page);
  await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible({ timeout: 15_000 });
}

export async function waitForCalculatorRoute(page: Page): Promise<void> {
  await page.locator('.shell main h1').getByText('ダメージ計算', { exact: true }).waitFor();
  await page.getByText('画面を読み込んでいます…', { exact: true }).waitFor({ state: 'hidden' });
}

export async function installRankingFixtureWorker(page: Page): Promise<void> {
  await page.addInitScript(
    ({ fixtureResponse }) => {
      let fixtureShardAnchor: string | null = null;
      class RankingFixtureWorker {
        onmessage: ((event: MessageEvent) => void) | null = null;
        ownsFixtureRows = false;
        postMessage(request: {
          kind: string;
          requestId: string;
          contextId: string;
          master?: { servants: Array<{ id: string }> };
          conditions?: Record<string, unknown>;
          fingerprint?: string;
          entryId?: string;
        }) {
          if (request.kind === 'initialize') {
            if (!request.master) throw new TypeError('fixture_master_required');
            const firstServantId = request.master.servants[0]?.id;
            if (!firstServantId) throw new TypeError('fixture_shard_empty');
            // Visual rows use a synthetic ID; bind them to the first canonical shard.
            fixtureShardAnchor ??= firstServantId;
            this.ownsFixtureRows = request.master.servants.some(
              ({ id }) => id === fixtureShardAnchor,
            );
            queueMicrotask(() =>
              this.onmessage?.({
                data: { kind: 'ready', requestId: request.requestId, contextId: request.contextId },
              } as MessageEvent),
            );
            return;
          }
          if (request.kind === 'calculate') {
            setTimeout(
              () =>
                this.onmessage?.({
                  data: {
                    ...fixtureResponse,
                    requestId: request.requestId,
                    contextId: request.contextId,
                    rows: this.ownsFixtureRows ? fixtureResponse.rows : [],
                  },
                } as MessageEvent),
              0,
            );
            return;
          }
          setTimeout(
            () =>
              this.onmessage?.({
                data: {
                  kind: 'error',
                  status: 'invalid',
                  contextId: request.contextId,
                  stage: 'detail',
                  requestId: request.requestId,
                  fingerprint: request.fingerprint,
                  entryId: request.entryId,
                  reason: 'fixture_detail_not_available',
                },
              } as MessageEvent),
            0,
          );
        }
        terminate() {}
        addEventListener() {}
        removeEventListener() {}
        dispatchEvent() {
          return true;
        }
      }
      Object.defineProperty(window, 'Worker', { configurable: true, value: RankingFixtureWorker });
    },
    { fixtureResponse: rankingFixtureResult },
  );
}
