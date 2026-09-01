import { expect, test, type Page } from './observedTest';
import { openTestHome } from './setup';

async function openCalculator(page: Page) {
  await page.route('https://static.atlasacademy.io/**', (route) => route.abort());
  await openTestHome(page);
  await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible();
  await page
    .getByRole('button', { name: /^(ダメージ計算|計算)$/ })
    .first()
    .click();
  await expect(page.getByRole('table', { name: '宝具レベル別のダメージ' })).toBeVisible();
}

test('[E2E-004] calculator desktop UI baseline @desktop @vrt', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openCalculator(page);
  await expect(page).toHaveScreenshot('calculator-desktop.png', { fullPage: true });
});

test('[E2E-005] calculator 320px UI baseline @mobile @vrt', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openCalculator(page);
  await expect(page).toHaveScreenshot('calculator-320px.png', { fullPage: true });
});

test('[E2E-006] selected effect state at 390px @mobile @vrt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCalculator(page);
  const skillSection = page.getByLabel('攻撃役の自身スキル');
  await expect(skillSection.locator('[aria-pressed]')).toHaveCount(0);
  const ownEffects = page.getByRole('group', { name: /自身の適用内容/ });
  await ownEffects
    .getByRole('button', { name: /攻撃力アップ/ })
    .first()
    .click();
  await expect(ownEffects.getByRole('button', { name: /攻撃力アップ/ }).first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(ownEffects).toHaveScreenshot('selected-effects-390px.png');
  await expect(page).toHaveScreenshot('calculator-390px.png', { fullPage: true });
});

test('[E2E-007] calculator density and overflow @desktop @vrt', async ({ page }) => {
  const limits = {
    1280: { skillHeight: 250, effectHeight: 150, averageChipHeight: 55 },
    390: { skillHeight: 290, effectHeight: 190, averageChipHeight: 60 },
    320: { skillHeight: 310, effectHeight: 220, averageChipHeight: 70 },
  } as const;
  for (const width of [1280, 390, 320] as const) {
    await page.setViewportSize({ width, height: 900 });
    await openCalculator(page);
    const skills = page.locator('.attacker-skills');
    const effects = page.locator('.calculator-applied-effect-group');
    const chips = effects.locator('.applied-effect-item:not([data-has-input])');
    await expect(skills).toBeVisible();
    await expect(effects).toBeVisible();
    await expect(chips).toHaveCount(4);
    const metrics = await page.evaluate(() => {
      const skillSection = document.querySelector<HTMLElement>('.attacker-skills')!;
      const effectSection = document.querySelector<HTMLElement>(
        '.calculator-applied-effect-group',
      )!;
      const inputlessChips = [
        ...effectSection.querySelectorAll<HTMLElement>(
          '.applied-effect-item:not([data-has-input])',
        ),
      ];
      const effectWidth = effectSection.getBoundingClientRect().width;
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        skillHeight: skillSection.getBoundingClientRect().height,
        effectHeight: effectSection.getBoundingClientRect().height,
        averageChipHeight:
          inputlessChips.reduce((sum, chip) => sum + chip.getBoundingClientRect().height, 0) /
          inputlessChips.length,
        fullWidthChipCount: inputlessChips.filter(
          (chip) => chip.getBoundingClientRect().width >= effectWidth - 2,
        ).length,
      };
    });
    expect(metrics.overflow, `${String(width)}px horizontal overflow`).toBe(0);
    // E2E-A018-320-OVERFLOW
    // E2E-A043-RESPONSIVE
    expect(metrics.fullWidthChipCount, `${String(width)}px full-width inputless chips`).toBe(0);
    expect(metrics.skillHeight, `${String(width)}px skill section height`).toBeLessThanOrEqual(
      limits[width].skillHeight,
    );
    expect(metrics.effectHeight, `${String(width)}px effect section height`).toBeLessThanOrEqual(
      limits[width].effectHeight,
    );
    expect(metrics.averageChipHeight, `${String(width)}px average chip height`).toBeLessThanOrEqual(
      limits[width].averageChipHeight,
    );
  }
});
