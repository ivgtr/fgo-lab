import { expect, test as base } from '@playwright/test';

export { expect };
export type { Browser, Page } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const path = process.env['FGO_BROWSER_OBSERVATION_PATH'];
    const record = (kind: string, message: string) => {
      if (!path) return;
      process.getBuiltinModule('fs').appendFileSync(
        path,
        `${JSON.stringify({
          runner: 'playwright',
          testId: testInfo.titlePath.join(' > '),
          kind,
          message,
        })}\n`,
      );
    };
    page.on('console', (message) => {
      if (['warning', 'error', 'assert'].includes(message.type()))
        record(`browser.console.${message.type()}`, message.text());
    });
    page.on('pageerror', (error) => record('browser.pageerror', error.message));
    await use(page);
  },
});
