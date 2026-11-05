import { expect, type Locator, type Page } from '@playwright/test';

export async function showLongTermTodoCards(page: Page): Promise<void> {
  const section = page.locator('#todoLongTerm');
  if (await section.isVisible() && !await section.evaluate(node => (node as HTMLDetailsElement).open)) {
    await section.locator(':scope > summary').click();
  }
  await expect(section).not.toHaveAttribute('data-disclosure-motion');
}

/** Editors are opened through the same whole-card interaction available to users. */
export async function expandTodoCard(card: Locator): Promise<void> {
  if (!await card.isVisible()) await showLongTermTodoCards(card.page());
  await expect(card).toBeVisible();
  // A visible heading can still move when a clipped parent finishes expanding.
  const movingContainers = card.locator('xpath=ancestor-or-self::*[@data-disclosure-motion]');
  await expect(movingContainers).toHaveCount(0);
  if (await card.getAttribute('data-expanded') === 'false') await card.locator('h3').click();
  await expect(card).toHaveAttribute('data-expanded', 'true');
  await expect(movingContainers).toHaveCount(0);
}
