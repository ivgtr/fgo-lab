import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'pnpm dev --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
  },
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(process.env['PLAYWRIGHT_WEBKIT']
      ? [{ name: 'webkit', use: { ...devices['iPhone 13 Mini'] } }]
      : [{ name: 'mobile-chromium', use: { ...devices['Pixel 7'] } }]),
  ],
});
