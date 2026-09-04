import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import runtimeContract from './scripts/e2e-runtime-contract.json' with { type: 'json' };

const baseURL = runtimeContract.baseURL;
const port = new URL(baseURL).port;
const appRequire = createRequire(resolve(import.meta.dirname, 'apps/web/package.json'));
const nextPackage = JSON.parse(readFileSync(appRequire.resolve('next/package.json'), 'utf8')) as {
  version: string;
};
if (nextPackage.version !== runtimeContract.server.version)
  throw new Error(
    `E2E Next.js runtime contract mismatch: expected ${runtimeContract.server.version}, received ${nextPackage.version}`,
  );

export default defineConfig({
  testDir: './e2e',
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  workers: 2,
  reporter: [
    ['./scripts/playwright-observation-reporter.mjs'],
    ['html', { outputFolder: process.env['PLAYWRIGHT_HTML_OUTPUT_DIR'] ?? 'playwright-report' }],
    ...(process.env['CI'] ? ([['github']] as const) : []),
  ],
  outputDir: process.env['PLAYWRIGHT_OUTPUT_DIR'] ?? 'test-results',
  webServer: {
    command: `pnpm --filter @fgo-lab/web build && pnpm --filter @fgo-lab/web exec next start --hostname 127.0.0.1 --port ${String(port)}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_PUBLIC_E2E: 'true' },
  },
  use: {
    baseURL,
    trace: process.env['CI'] ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /setup\.setup\.ts/ },
    {
      name: 'chromium',
      testIgnore: /setup\.setup\.ts/,
      grep: /@desktop/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    ...(process.env['PLAYWRIGHT_WEBKIT']
      ? [
          {
            name: 'webkit',
            testIgnore: /setup\.setup\.ts/,
            grep: /@mobile/,
            dependencies: ['setup'],
            use: { ...devices['iPhone 13 Mini'] },
          },
        ]
      : [
          {
            name: 'mobile-chromium',
            testIgnore: /setup\.setup\.ts/,
            grep: /@mobile/,
            dependencies: ['setup'],
            use: { ...devices['Pixel 7'] },
          },
        ]),
  ],
});
