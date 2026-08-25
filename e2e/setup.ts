import { expect, type Page } from '@playwright/test';

export async function completeSetup(page: Page): Promise<void> {
  const setup = page.getByRole('button', { name: 'セットアップを開始' });
  const home = page.getByRole('heading', { name: 'ホーム' });
  await expect(setup.or(home)).toBeVisible({ timeout: 15_000 });
  if (await setup.isVisible()) await setup.click();
  await expect(home).toBeVisible({ timeout: 30_000 });
}
