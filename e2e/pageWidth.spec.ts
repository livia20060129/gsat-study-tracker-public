import { expect, test } from '@playwright/test';

const pages = [
  ['/', ['main']],
  ['/material.progress.html', ['.progress-page']],
  ['/summary.html', ['.summary-page']],
  ['/todo.html', ['.todo-page']],
  ['/vocabulary.review.html', ['.vocabulary-page']],
  ['/gpt.prompt.html', ['header .inner', 'main']],
  ['/privacy.html', ['.header-inner', '.document', '.site-footer']],
  ['/terms.html', ['.header-inner', '.document', '.site-footer']],
  ['/support.html', ['.header-inner', '.document', '.site-footer']],
  ['/vocabulary.sources.html', ['body > header', 'body > section']],
] as const;

test.use({ viewport: { width: 1920, height: 900 } });

test('site pages use the same desktop content width', async ({ page }) => {
  for (const [path, selectors] of pages) {
    await page.goto(path);
    for (const selector of selectors) {
      const layouts = await page.locator(selector).evaluateAll(elements => elements.map(element => ({
        maxWidth: getComputedStyle(element).maxWidth,
        width: element.getBoundingClientRect().width,
      })));
      expect(layouts.length).toBeGreaterThan(0);
      for (const layout of layouts) {
        expect(layout.maxWidth, `${path} ${selector}`).toBe('1050px');
        expect(layout.width, `${path} ${selector}`).toBeCloseTo(1050, 0);
      }
    }
  }
});
