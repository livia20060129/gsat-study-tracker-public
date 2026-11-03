import { expect, type Page } from '@playwright/test';

interface CardHierarchyMetrics {
  titleSize: number;
  rangeSize: number;
  detailSize: number;
  titleWeight: number;
  rangeWeight: number;
}

export async function expectCardHierarchy(page: Page, cardSelector: string, titleSelector: string): Promise<void> {
  const sample: { metrics: CardHierarchyMetrics | null } = { metrics: null };
  await expect.poll(async function sampleConnectedCard(): Promise<boolean> {
    sample.metrics = await page.evaluate(function readHierarchy({ cardSelector, titleSelector }): CardHierarchyMetrics | null {
      const root = document.querySelector(cardSelector);
      if (!root?.isConnected) return null;

      function visible(node: Element): boolean {
        const style = getComputedStyle(node);
        return node.isConnected && node.getClientRects().length > 0
          && style.visibility !== 'hidden' && style.visibility !== 'collapse';
      }

      function firstVisible(scope: Element, selector: string): Element | undefined {
        return [...scope.querySelectorAll(selector)].find(visible);
      }

      const title = firstVisible(root, titleSelector);
      const range = firstVisible(root, '.study-heading-range, [data-study-hierarchy="range"] :is(input,select,.fixed-book-value,.small,.inline), dd[data-study-hierarchy="range"]');
      const detail = firstVisible(root, '.field > label, .checkline label, .todo-record-grid dt');
      if (!title || !range || !detail) return null;

      const titleStyle = getComputedStyle(title);
      const rangeStyle = getComputedStyle(range);
      const metrics = {
        titleSize: Number.parseFloat(titleStyle.fontSize),
        rangeSize: Number.parseFloat(rangeStyle.fontSize),
        detailSize: Number.parseFloat(getComputedStyle(detail).fontSize),
        titleWeight: Number.parseFloat(titleStyle.fontWeight),
        rangeWeight: Number.parseFloat(rangeStyle.fontWeight),
      };
      if (!Object.values(metrics).every(Number.isFinite)) return null;
      return metrics;
    }, { cardSelector, titleSelector });
    return sample.metrics !== null;
  }, {
    timeout: 5_000,
    message: `Read visible, connected title/range/detail styles together for ${cardSelector}`,
  }).toBe(true);

  const metrics = sample.metrics;
  if (!metrics) throw new Error('Card hierarchy styles were unavailable.');
  expect(metrics.titleSize, 'Card title must be larger than its range').toBeGreaterThan(metrics.rangeSize);
  expect(metrics.rangeSize - metrics.detailSize, 'Range must be at least 5px larger than details').toBeGreaterThanOrEqual(5);
  expect(metrics.titleWeight, 'Card title must be heavier than its range').toBeGreaterThan(metrics.rangeWeight);
}
