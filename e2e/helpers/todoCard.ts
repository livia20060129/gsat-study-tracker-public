import { expect, type Locator } from '@playwright/test';

/** Editors are opened through the same whole-card interaction available to users. */
export async function expandTodoCard(card: Locator): Promise<void> {
  await expect(card).toBeVisible();
  if (await card.getAttribute('data-expanded') === 'false') await card.locator('h3').click();
  await expect(card).toHaveAttribute('data-expanded', 'true');
}
