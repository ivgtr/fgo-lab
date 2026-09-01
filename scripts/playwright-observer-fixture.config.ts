import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: resolve(import.meta.dirname, '../e2e'),
  testMatch: 'browser-observer.fixture.ts',
  reporter: [['./playwright-observation-reporter.mjs'], ['dot']],
  outputDir: process.env['FGO_TEST_ARTIFACT_DIR'],
  workers: 1,
  retries: 0,
  use: { browserName: 'chromium' },
});
