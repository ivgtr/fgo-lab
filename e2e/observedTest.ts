import { expect, test as base } from '@playwright/test';
import type { BrowserContext, BrowserContextOptions, TestInfo } from '@playwright/test';
import { seedAtlasFixture } from './atlasFixture';

export { expect };
export type { Browser, BrowserContext, Page } from '@playwright/test';

export type NewObservedPage = (
  options?: BrowserContextOptions,
) => Promise<{ context: BrowserContext; page: import('@playwright/test').Page }>;

type ObservationFixtures = {
  newObservedPage: NewObservedPage;
  observationPageId: () => string;
};

const canonicalConsoleTypes: Readonly<Record<string, string>> = {
  log: 'log',
  info: 'info',
  debug: 'debug',
  warning: 'warn',
  error: 'error',
  assert: 'assert',
};

export const test = base.extend<ObservationFixtures>({
  observationPageId: async ({}, use) => {
    let pageSequence = 0;
    await use(() => `page-${++pageSequence}`);
  },
  page: async ({ page, context, observationPageId }, use, testInfo) => {
    await observeContext(context, testInfo, observationPageId);
    const baseURL = testInfo.project.use.baseURL;
    if (typeof baseURL === 'string') await seedAtlasFixture(context, page, baseURL);
    await use(page);
  },
  newObservedPage: async ({ browser, observationPageId }, use, testInfo) => {
    const contexts: BrowserContext[] = [];
    await use(async (options) => {
      const context = await browser.newContext(options);
      contexts.push(context);
      await observeContext(context, testInfo, observationPageId);
      const page = await context.newPage();
      const baseURL = testInfo.project.use.baseURL;
      if (typeof baseURL === 'string') await seedAtlasFixture(context, page, baseURL);
      return { context, page };
    });
    await Promise.all(contexts.map(async (context) => context.close().catch(() => undefined)));
  },
});

/** First-run source tests start with an empty origin while keeping browser observation. */
export const testUnseeded = base.extend<Pick<ObservationFixtures, 'observationPageId'>>({
  observationPageId: async ({}, use) => {
    let pageSequence = 0;
    await use(() => `page-${++pageSequence}`);
  },
  page: async ({ page, context, observationPageId }, use, testInfo) => {
    await observeContext(context, testInfo, observationPageId);
    await use(page);
  },
});

async function observeContext(
  context: BrowserContext,
  testInfo: TestInfo,
  nextPageId: () => string,
) {
  const observationPath = process.env['FGO_BROWSER_OBSERVATION_PATH'];
  if (!observationPath) return;
  const record = (
    kind: string,
    message: string,
    detail: Record<string, string | number | boolean | null>,
  ) => {
    process.getBuiltinModule('fs').appendFileSync(
      observationPath,
      `${JSON.stringify({
        runner: 'playwright',
        testId: testInfo.titlePath.join(' > '),
        kind,
        message,
        detail,
      })}\n`,
    );
  };

  const observedPages = new WeakSet<import('@playwright/test').Page>();
  const observePage = (page: import('@playwright/test').Page) => {
    if (observedPages.has(page)) return;
    observedPages.add(page);
    const pageId = nextPageId();
    let socketSequence = 0;
    const documentNavigationSequence = new WeakMap<import('@playwright/test').Frame, number>();
    const pendingDocumentNavigations = new WeakMap<
      import('@playwright/test').Frame,
      Set<import('@playwright/test').Request>
    >();
    const respondedDocumentNavigations = new WeakSet<import('@playwright/test').Request>();
    const finishDocumentNavigation = (request: import('@playwright/test').Request) => {
      if (!request.isNavigationRequest()) return;
      const frame = requestStart.get(request)?.frame;
      if (frame) pendingDocumentNavigations.get(frame)?.delete(request);
    };
    const requestStart = new WeakMap<
      import('@playwright/test').Request,
      {
        frame: import('@playwright/test').Frame | null;
        documentNavigationSequence: number;
      }
    >();
    page.on('request', (request) => {
      let frame: import('@playwright/test').Frame | null = null;
      try {
        frame = request.frame();
      } catch {
        // Service-worker requests do not expose a frame.
      }
      if (frame && request.isNavigationRequest()) {
        let pending = pendingDocumentNavigations.get(frame);
        if (!pending) {
          pending = new Set();
          pendingDocumentNavigations.set(frame, pending);
        }
        pending.add(request);
      }
      requestStart.set(request, {
        frame,
        documentNavigationSequence: frame ? (documentNavigationSequence.get(frame) ?? 0) : 0,
      });
    });
    page.on('framenavigated', (frame) => {
      const pending = pendingDocumentNavigations.get(frame);
      if (!pending) return;
      const documentUrl = frame.url().split('#', 1)[0];
      if (
        ![...pending].some(
          (request) =>
            respondedDocumentNavigations.has(request) &&
            request.url().split('#', 1)[0] === documentUrl,
        )
      )
        return;
      documentNavigationSequence.set(frame, (documentNavigationSequence.get(frame) ?? 0) + 1);
      pending.clear();
    });
    page.on('response', (response) => {
      const request = response.request();
      if (request.isNavigationRequest()) respondedDocumentNavigations.add(request);
    });
    page.on('requestfinished', finishDocumentNavigation);
    page.on('console', (message) => {
      const rawType = message.type();
      record('browser.console', message.text(), {
        type: canonicalConsoleTypes[rawType] ?? rawType,
        url: page.url(),
        locationUrl: message.location().url || null,
        pageId,
      });
    });
    page.on('pageerror', (error) =>
      record('browser.pageerror', error.message, { url: page.url(), pageId }),
    );
    page.on('requestfailed', (request) => {
      finishDocumentNavigation(request);
      const failureText = request.failure()?.errorText ?? 'unknown request failure';
      const start = requestStart.get(request);
      const lifecycleAbort =
        page.isClosed() ||
        start?.frame?.isDetached() ||
        (start !== undefined &&
          start.frame !== null &&
          (documentNavigationSequence.get(start.frame) ?? 0) > start.documentNavigationSequence);
      if (failureText === 'net::ERR_ABORTED' && lifecycleAbort) return;
      const detail = {
        url: request.url(),
        resourceType: request.resourceType(),
        failureText,
        pageId,
      };
      record(
        'browser.resource_failure',
        `${detail.resourceType} ${detail.url}: ${detail.failureText}`,
        detail,
      );
    });
    page.on('websocket', (socket) => {
      const socketId = `${pageId}-socket-${++socketSequence}`;
      const detail = () => ({ url: socket.url(), pageUrl: page.url(), pageId, socketId });
      record('browser.websocket', 'open', { ...detail(), phase: 'open' });
      socket.on('socketerror', (error) =>
        record('browser.websocket', String(error), { ...detail(), phase: 'error' }),
      );
      socket.on('close', () =>
        record('browser.websocket', 'close', { ...detail(), phase: 'close' }),
      );
    });
  };
  for (const page of context.pages()) observePage(page);
  context.on('page', observePage);
}
