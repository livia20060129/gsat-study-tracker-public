import type { VocabularyContentKind, VocabularyReviewEntry } from './vocabularyReview.ts';
import { vocabularyMeaningGroups } from './vocabularyMeaningGroups.ts';
import { ECDICT_MIT_LICENSE } from '../data/vocabularyLicenses.ts';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

/** No Chinese answers are embedded in the blank version, including hidden markup. */
export function vocabularyPrintDocument(
  entries: VocabularyReviewEntry[],
  kind: VocabularyContentKind,
  withTranslations: boolean,
): string {
  const title = `英文${kind === '單字' ? '單字' : kind}表（${withTranslations ? '有' : '無'}翻譯）`;
  const notices = [];
  if (entries.some(entry => entry.referenceSources?.ceec)) {
    notices.push('<p>詞性／級數參考：大學入學考試中心《高中英文參考詞彙表》（111 學年度起適用，109 年 7 月）。著作權屬財團法人大學入學考試中心基金會，僅供非營利目的使用。</p>');
  }
  if (withTranslations && entries.some(entry => entry.referenceSources?.ecdict || entry.dictionarySources?.some(source => source.provider === 'ecdict'))) {
    notices.push('<p>中文參考：ECDICT（skywind3000/ECDICT），https://github.com/skywind3000/ECDICT 。僅擷取對應詞性、分列意思並以 OpenCC 轉為繁體；手動修改內容不代表來源認可。</p>');
    notices.push(`<pre>${escapeHtml(ECDICT_MIT_LICENSE)}</pre>`);
  }
  if (withTranslations && entries.some(entry => entry.dictionarySources?.some(source => source.provider === 'cambridge'))) {
    notices.push('<p>歷史保存釋義來源：Cambridge Dictionary（線上服務已停用）。只保留既有資料的出處，不將舊內容改標為 ECDICT；內容使用與匯出範圍仍依原字典授權辦理。</p>');
  }
  const tables = entries.map(function entryRows(entry): string {
    const groups = vocabularyMeaningGroups(entry, kind);
    const rowCount = groups.reduce((total, group) => total + group.meanings.length, 0);
    let rowIndex = 0;
    const rows = groups.flatMap(group => group.meanings.map(function meaningRow(meaning, index): string {
      const english = rowIndex++ === 0 ? `<td class="english" rowspan="${rowCount}">${escapeHtml(entry.text)}</td>` : '';
      const part = index === 0 ? `<td class="part" rowspan="${group.meanings.length}">${escapeHtml(group.partOfSpeech)}</td>` : '';
      const chinese = withTranslations && meaning ? escapeHtml(meaning) : '&#160;';
      return `<tr>${english}${part}<td class="meaning">${chinese}</td></tr>`;
    }));
    return `<tbody>${rows.join('')}</tbody>`;
  });
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><style>
@page{size:A4 portrait;margin:15mm}
*{box-sizing:border-box}body{margin:20px;color:#000;background:#fff;font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",Arial,sans-serif;font-size:11pt}
h1{margin:0 0 12px;font-size:16pt;font-weight:600}table{width:100%;table-layout:fixed;border-collapse:collapse}col{width:33.333%}th,td{border:1px solid #000;padding:4px 8px;text-align:center;vertical-align:middle;overflow-wrap:anywhere;line-height:1.45}th{font-weight:500}td.meaning{height:8mm;white-space:pre-wrap}thead{display:table-header-group}tbody{break-inside:avoid;page-break-inside:avoid}tr{break-inside:avoid;page-break-inside:avoid}
.print-actions{margin-bottom:18px;font:14px sans-serif}.print-actions button{margin-right:12px;padding:9px 14px;cursor:pointer}.print-actions p{margin:8px 0}
.source-notices{margin-top:12px;font-size:8pt;line-height:1.4}.source-notices pre{font:7pt/1.3 Arial,sans-serif;white-space:pre-wrap;break-inside:avoid}
@media print{body{margin:0}.print-actions{display:none}}
</style></head><body>
<div class="print-actions"><button id="printVocabulary" type="button">列印／儲存為 PDF</button><p>目的地選擇「儲存為 PDF」。建議關閉瀏覽器的頁首及頁尾，避免加入網址與日期。</p></div>
<h1>${title}</h1><table aria-label="${title}"><colgroup><col><col><col></colgroup><thead><tr><th scope="col">英文</th><th scope="col">詞性</th><th scope="col">中文翻譯</th></tr></thead>${tables.join('')}</table>
${notices.length ? `<footer class="source-notices">${notices.join('')}</footer>` : ''}
<script>document.getElementById('printVocabulary').addEventListener('click',function(){window.print()});</script>
</body></html>`;
}
