import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PageSizes, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { vocabularyExportNotices, vocabularyExportTitle } from './vocabularyExportContent.ts';
import { vocabularyMeaningGroups } from './vocabularyMeaningGroups.ts';
import type { VocabularyContentKind, VocabularyReviewEntry } from './vocabularyReview.ts';

const MARGIN = 20 * 72 / 25.4;
const [PAGE_WIDTH, PAGE_HEIGHT] = PageSizes.A4;
const TABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;
const COLUMN_WIDTHS = [TABLE_WIDTH * 0.34, TABLE_WIDTH * 0.19, TABLE_WIDTH * 0.47];
const FONT_SIZE = 11;
const LINE_HEIGHT = 16;
const PADDING = 7;
const HEADER_HEIGHT = 28;
const BORDER = rgb(0.72, 0.75, 0.79);

interface MeaningRow {
  group: number;
  part: string[];
  meaning: string[];
  height: number;
}

function wrappedLines(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = '';
    for (const character of paragraph) {
      if (line && font.widthOfTextAtSize(line + character, size) > width) {
        lines.push(line.trimEnd());
        line = character.trimStart();
      } else {
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawCell(page: PDFPage, font: PDFFont, lines: string[], x: number, top: number, width: number, height: number, heading = false): void {
  page.drawRectangle({ x, y: top - height, width, height, borderColor: BORDER, borderWidth: 0.6,
    color: heading ? rgb(0.94, 0.95, 0.97) : rgb(1, 1, 1) });
  const baseline = top - height / 2 + (lines.length - 1) * LINE_HEIGHT / 2 - FONT_SIZE * 0.35;
  lines.forEach(function drawLine(line, index): void {
    page.drawText(line, { x: x + (width - font.widthOfTextAtSize(line, FONT_SIZE)) / 2,
      y: baseline - index * LINE_HEIGHT, font, size: FONT_SIZE, color: rgb(0, 0, 0) });
  });
}

function entryRows(entry: VocabularyReviewEntry, kind: VocabularyContentKind, translated: boolean, font: PDFFont): MeaningRow[] {
  const rows: MeaningRow[] = [];
  const maxLines = Math.floor((PAGE_HEIGHT - MARGIN * 2 - HEADER_HEIGHT - PADDING * 2) / LINE_HEIGHT);
  for (const [group, meanings] of vocabularyMeaningGroups(entry, kind).entries()) {
    const part = wrappedLines(meanings.partOfSpeech, font, FONT_SIZE, COLUMN_WIDTHS[1] - PADDING * 2);
    for (const meaning of meanings.meanings) {
      const lines = wrappedLines(translated ? meaning : '', font, FONT_SIZE, COLUMN_WIDTHS[2] - PADDING * 2);
      for (let offset = 0; offset < lines.length; offset += maxLines) {
        const segment = lines.slice(offset, offset + maxLines);
        rows.push({ group, part, meaning: segment, height: Math.max(28, segment.length * LINE_HEIGHT + PADDING * 2, part.length * LINE_HEIGHT + PADDING * 2) });
      }
    }
  }
  return rows;
}

/** Embed the complete static font: CJK subsetting can silently lose visible glyphs. */
export async function vocabularyPdfDocument(entries: VocabularyReviewEntry[], kind: VocabularyContentKind, withTranslations: boolean, fontBytes: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const font = await document.embedFont(fontBytes, {
    subset: false,
    // Keep copyable Unicode glyphs; automatic fraction/ligature substitutions lose mappings.
    features: { frac: false, numr: false, dnom: false, liga: false, clig: false, calt: false, locl: false, ccmp: false },
  });
  const title = vocabularyExportTitle(kind, withTranslations);
  document.setTitle(title);
  document.setCreator('GSAT Study Tracker');
  document.setProducer('GSAT Study Tracker');
  let page: PDFPage;
  let top = 0;

  function newPage(first = false, table = true): void {
    page = document.addPage(PageSizes.A4);
    top = PAGE_HEIGHT - MARGIN;
    if (first) {
      page.drawText(title, { x: MARGIN, y: top - 16, font, size: 16, color: rgb(0, 0, 0) });
      top -= 38;
    }
    if (table) {
      let x = MARGIN;
      ['英文', '詞性', '中文翻譯'].forEach(function heading(label, column): void {
        drawCell(page, font, [label], x, top, COLUMN_WIDTHS[column], HEADER_HEIGHT, true);
        x += COLUMN_WIDTHS[column];
      });
      top -= HEADER_HEIGHT;
    }
  }

  newPage(true);
  for (const entry of entries) {
    const english = wrappedLines(entry.text, font, FONT_SIZE, COLUMN_WIDTHS[0] - PADDING * 2);
    const rows = entryRows(entry, kind, withTranslations, font);
    const englishHeight = english.length * LINE_HEIGHT + PADDING * 2;
    const freshPageSpace = PAGE_HEIGHT - MARGIN * 2 - HEADER_HEIGHT;
    if (englishHeight > freshPageSpace) throw new Error('The English text is too long for one PDF page.');
    const blockHeight = rows.reduce((sum, row) => sum + row.height, 0);
    if (englishHeight > blockHeight) rows[rows.length - 1].height += englishHeight - blockHeight;
    const fullHeight = Math.max(blockHeight, englishHeight);
    if (fullHeight <= freshPageSpace && fullHeight > top - MARGIN) newPage();
    let remaining = rows;
    while (remaining.length) {
      if (Math.max(remaining[0].height, englishHeight) > top - MARGIN) newPage();
      let height = 0;
      let length = 0;
      for (const row of remaining) {
        if (height + row.height > top - MARGIN) break;
        height += row.height;
        length += 1;
      }
      if (!length) throw new Error('The vocabulary entry is too long for one PDF page.');
      const chunk = remaining.slice(0, length);
      if (height < englishHeight) {
        chunk[chunk.length - 1] = { ...chunk[chunk.length - 1], height: chunk[chunk.length - 1].height + englishHeight - height };
        height = englishHeight;
      }
      drawCell(page!, font, english, MARGIN, top, COLUMN_WIDTHS[0], height);
      let rowTop = top;
      let partTop = top;
      let partHeight = 0;
      chunk.forEach(function drawMeaning(row, index): void {
        drawCell(page, font, row.meaning, MARGIN + COLUMN_WIDTHS[0] + COLUMN_WIDTHS[1], rowTop, COLUMN_WIDTHS[2], row.height);
        partHeight += row.height;
        rowTop -= row.height;
        if (index === chunk.length - 1 || chunk[index + 1].group !== row.group) {
          drawCell(page, font, row.part, MARGIN + COLUMN_WIDTHS[0], partTop, COLUMN_WIDTHS[1], partHeight);
          partTop -= partHeight;
          partHeight = 0;
        }
      });
      top -= height;
      remaining = remaining.slice(length);
      if (remaining.length) newPage();
    }
  }

  for (const notice of vocabularyExportNotices(entries, withTranslations)) {
    top -= 14;
    const lines = wrappedLines(notice, font, 8, TABLE_WIDTH);
    for (const line of lines) {
      if (top - 11 < MARGIN) newPage(false, false);
      page!.drawText(line, { x: MARGIN, y: top - 8, size: 8, font, color: rgb(0, 0, 0) });
      top -= 11;
    }
  }
  return document.save();
}
