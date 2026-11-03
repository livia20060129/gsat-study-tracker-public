import { readFile } from 'node:fs/promises';
import { expect, type Page } from '@playwright/test';
import { inspectVocabularyPdf } from '../../tests/helpers/pdfText.ts';

export async function downloadVocabularyPdf(page: Page, translated: boolean, path: string): Promise<Awaited<ReturnType<typeof inspectVocabularyPdf>>> {
  const pending = page.waitForEvent('download');
  await page.locator(`[data-export-vocabulary="${translated ? 'translated' : 'blank'}"]`).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  await download.saveAs(path);
  expect(await download.failure()).toBeNull();
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  return inspectVocabularyPdf(bytes);
}
