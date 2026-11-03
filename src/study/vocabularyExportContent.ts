import { ECDICT_MIT_LICENSE } from '../data/vocabularyLicenses.ts';
import type { VocabularyContentKind, VocabularyReviewEntry } from './vocabularyReview.ts';
export function vocabularyExportTitle(kind: VocabularyContentKind, withTranslations: boolean): string {
    return `英文${kind}表（${withTranslations ? '有' : '無'}翻譯）`;
}
/** Shared notices keep the editable Word export consistent with the PDF source disclosures. */
export function vocabularyExportNotices(entries: readonly VocabularyReviewEntry[], withTranslations: boolean): string[] {
    const notices: string[] = [];
    if (entries.some(entry => entry.referenceSources?.ceec))
        notices.push('學測級數參考：大學入學考試中心《高中英文參考詞彙表》（111 學年度起適用，109 年 7 月）。著作權屬財團法人大學入學考試中心基金會，僅供非營利目的使用。');
    if (withTranslations && entries.some(entry => entry.referenceSources?.ecdict || entry.dictionarySources?.some(source => source.provider === 'ecdict'))) {
        notices.push('中文翻譯與詞性參考：ECDICT（skywind3000/ECDICT），https://github.com/skywind3000/ECDICT 。分列意思並以 OpenCC 轉為繁體；手動修改內容不代表來源認可。', ECDICT_MIT_LICENSE);
    }
    if (withTranslations && entries.some(entry => entry.dictionarySources?.some(source => source.provider === 'cambridge')))
        notices.push('歷史保存釋義來源：Cambridge Dictionary（線上服務已停用）。只保留既有資料的出處，不將舊內容改標為 ECDICT；內容使用與匯出範圍仍依原字典授權辦理。');
    return notices;
}
