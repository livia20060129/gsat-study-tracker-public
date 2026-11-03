import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { showMobileSection } from './helpers/siteNavigation.ts';

test.use({ isMobile: true, hasTouch: true });

async function readNavigation(page: Page): Promise<{
  surface: string[]; buttonStyles: string[][]; contained: boolean; height: number;
}> {
  return page.locator('#siteMobileBar').evaluate(bar => {
    const nav = bar.querySelector('nav')!;
    const surface = getComputedStyle(nav);
    const bounds = bar.getBoundingClientRect();
    const buttons = [...nav.querySelectorAll('button')];
    return {
      surface: [surface.marginTop, surface.marginBottom, surface.paddingTop, surface.paddingBottom,
        surface.borderTopWidth, surface.borderBottomWidth, surface.borderRadius, surface.boxShadow, surface.backgroundColor],
      buttonStyles: buttons.map(button => {
        const style = getComputedStyle(button);
        return [style.paddingTop, style.paddingBottom, style.borderTopWidth, style.borderRadius,
          style.fontSize, style.lineHeight, style.boxShadow];
      }),
      contained: buttons.length === 3 && buttons.every(button => {
        const rect = button.getBoundingClientRect();
        return rect.left >= bounds.left - 0.5 && rect.right <= bounds.right + 0.5
          && rect.top >= bounds.top - 0.5 && rect.bottom <= bounds.bottom + 0.5;
      }),
      height: bounds.height,
    };
  });
}

test('prompt navigation has no content-card frame and keeps all three buttons inside the header', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/gpt.prompt.html');
  await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
  const navigation = await readNavigation(page);
  expect(navigation.surface.slice(0, 7)).toEqual(Array(7).fill('0px'));
  expect(navigation.surface[7]).toBe('none');
  expect(navigation.contained).toBe(true);
  expect(navigation.height).toBe(112);
  await page.screenshot({ path: testInfo.outputPath('prompt-mobile-navigation.png') });
});

test('mobile navigation geometry and unselected hover styles stay consistent across all standalone pages', async ({ page }) => {
  test.setTimeout(120_000);
  for (const width of [320, 393]) {
    await page.setViewportSize({ width, height: 852 });
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
    const reference = await readNavigation(page);
    const hover = page.locator('button[data-mobile-section="date"]');
    await hover.hover();
    const hoverColor = await hover.evaluate(node => getComputedStyle(node).backgroundColor);
    for (const path of ['/gpt.prompt.html', '/todo.html', '/summary.html', '/material.progress.html',
      '/vocabulary.review.html', '/privacy.html', '/terms.html', '/support.html', '/vocabulary.sources.html']) {
      await page.goto(path);
      await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
      expect(await readNavigation(page), `${width}px ${path}`).toEqual(reference);
      await page.locator('button[data-mobile-section="date"]').hover();
      await expect(page.locator('button[data-mobile-section="date"]')).toHaveCSS('background-color', hoverColor);
    }
  }
});

test('prompt contents keep their cards, copy action and anchors while full-page switching retains its scroll', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      async writeText(text: string): Promise<void> { document.documentElement.dataset.copiedPrompt = text; },
    } });
  });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/gpt.prompt.html');
  await expect(page.locator('main > nav')).toHaveCSS('border-radius', '22px');
  await page.getByRole('button', { name: '複製完整 Prompt', exact: true }).click();
  await expect(page.getByRole('button', { name: '已複製', exact: true })).toBeVisible();
  const copied = await page.locator('html').getAttribute('data-copied-prompt');
  expect(copied).toContain('角色與目標');
  expect(copied).toContain('GSAT-BIO-NEWKEY');
  expect(copied).not.toContain('功能選單');
  await page.getByRole('link', { name: '角色與目標', exact: true }).click();
  await expect(page).toHaveURL(/#role$/);
  // URL changes precede the native smooth scroll; finish it before setting the test position.
  await expect.poll(() => page.locator('#role').evaluate(node => Math.abs(
    node.getBoundingClientRect().top - parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop),
  ))).toBeLessThan(1);
  await page.evaluate(() => scrollTo({ top: 650, behavior: 'instant' }));
  const scroll = await page.evaluate(() => scrollY);
  await showMobileSection(page, 'tools');
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
  await expect(page.locator('#siteRightRail')).toBeVisible();
  await showMobileSection(page, 'content');
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
  await showMobileSection(page, 'content');
  expect((await readNavigation(page)).contained).toBe(true);
});
