import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env['PLAYWRIGHT_PORT'] ?? 4173);
const baseURL = `http://127.0.0.1:${String(port)}`;

export default defineConfig({
  testDir: './e2e',
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  workers: 2,
  reporter: process.env['CI'] ? [['html'], ['github']] : [['html']],
  webServer: {
    command: `pnpm --filter @fgo-lab/web exec vite --port ${String(port)} --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: true,
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
