import { AlignmentType, BorderStyle, Document, HeadingLevel, HeightRule, Packer, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, VerticalMergeType, WidthType } from 'docx';
import { vocabularyExportNotices, vocabularyExportTitle } from './vocabularyExportContent.ts';
import { vocabularyMeaningGroups } from './vocabularyMeaningGroups.ts';
import type { VocabularyContentKind, VocabularyReviewEntry } from './vocabularyReview.ts';
const COLUMN_WIDTHS = [3400, 1800, 4438];
const BORDER = { style: BorderStyle.SINGLE, size: 6, color: 'D9D9D9' } as const;
function cell(text: string, column: number, merge?: 'restart' | 'continue', header = false, lastRowInMerge = true): TableCell {
    return new TableCell({ width: { size: COLUMN_WIDTHS[column], type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER, verticalMerge: merge,
        borders: {
            top: merge === VerticalMergeType.CONTINUE ? { style: BorderStyle.NIL } : BORDER,
            bottom: lastRowInMerge ? BORDER : { style: BorderStyle.NIL },
            left: BORDER,
            right: BORDER,
        },
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        shading: header ? { fill: 'F0F3F7' } : undefined,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: 276 },
                children: [new TextRun({ text, bold: header, color: '000000', size: 22 })] })] });
}
/** Real OOXML with A4 margins, repeated table headings and independent blank answer cells. */
export async function vocabularyDocxDocument(entries: VocabularyReviewEntry[], kind: VocabularyContentKind, withTranslations: boolean): Promise<Blob> {
    const rows = [new TableRow({ tableHeader: true, cantSplit: true, children: ['英文', '詞性', '中文翻譯'].map((label, index) => cell(label, index, undefined, true)) })];
    for (const entry of entries) {
        const groups = vocabularyMeaningGroups(entry, kind);
        let remainingRows = groups.reduce((total, group) => total + group.meanings.length, 0);
        let firstWordRow = true;
        for (const group of groups) {
            for (const [index, meaning] of group.meanings.entries()) {
                remainingRows -= 1;
                rows.push(new TableRow({ cantSplit: true, height: { value: 454, rule: HeightRule.ATLEAST }, children: [
                        cell(firstWordRow ? entry.text : '', 0, firstWordRow ? VerticalMergeType.RESTART : VerticalMergeType.CONTINUE, false, remainingRows === 0),
                        cell(index === 0 ? group.partOfSpeech : '', 1, index === 0 ? VerticalMergeType.RESTART : VerticalMergeType.CONTINUE, false, index === group.meanings.length - 1),
                        cell(withTranslations ? meaning : '', 2),
                    ] }));
                firstWordRow = false;
            }
        }
    }
    const title = vocabularyExportTitle(kind, withTranslations);
    const document = new Document({ creator: 'GSAT Study Tracker', title,
        styles: { default: { document: { run: { font: 'Microsoft JhengHei', size: 22, color: '000000' } } } },
        sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children: [
                    new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 220 }, children: [new TextRun({ text: title, size: 32, bold: true, color: '000000' })] }),
                    new Table({ rows, columnWidths: COLUMN_WIDTHS, layout: TableLayoutType.FIXED, width: { size: 9638, type: WidthType.DXA },
                        borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideHorizontal: BORDER, insideVertical: BORDER } }),
                    ...vocabularyExportNotices(entries, withTranslations).map(text => new Paragraph({ spacing: { before: 150, after: 0 },
                        children: text.split('\n').flatMap((line, index) => [new TextRun({ text: line, break: index ? 1 : undefined, size: 16, color: '000000' })]) })),
                ] }],
    });
    return Packer.toBlob(document);
}
