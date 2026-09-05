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

export async function installRankingFixtureWorker(page: Page): Promise<void> {
  await page.addInitScript(
    ({ fixtureResponse }) => {
      class RankingFixtureWorker {
        onmessage: ((event: MessageEvent) => void) | null = null;
        postMessage(request: {
          kind: string;
          requestId: string;
          contextId: string;
          conditions?: Record<string, unknown>;
          fingerprint?: string;
          entryId?: string;
        }) {
          if (request.kind === 'initialize') {
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
