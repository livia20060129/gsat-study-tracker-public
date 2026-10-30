import type { Page } from '@playwright/test';

export async function enableMaterialEditing(page: Page): Promise<void> {
  const toggle = page.locator('#toggleMaterialEditing');
  if (await toggle.getAttribute('aria-pressed') === 'false') await toggle.click();
}
