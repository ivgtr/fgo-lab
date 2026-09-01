import { expect, test as setup } from '@playwright/test';
import { completeSetup } from './setup';

setup('[E2E-SETUP-001] verify canonical browser setup @journey', async ({ page }) => {
  await page.goto('/');
  await completeSetup(page);
  await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible();
});
