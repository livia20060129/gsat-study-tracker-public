export type NaturalMaterialPageMapRow = readonly [
  start: number,
  end: number,
  unit: string,
  topic: string,
];

/**
 * 《新關鍵》生物學測總複習講義。
 *
 * The photographed contents page prints exact starts for topics 1–23. The
 * review/mock sections do not print separate starts, so they remain explicit
 * combined ranges instead of being incorrectly attributed to the prior topic.
 */
export const BIOLOGY_NEW_KEY_PAGE_MAP = [
  [4, 8, '單元 1 細胞的構造與功能', '主題 1 生命現象與細胞學說'],
  [9, 15, '單元 1 細胞的構造與功能', '主題 2 生物的尺寸與細胞形態的多樣性'],
  [16, 21, '單元 1 細胞的構造與功能', '主題 3 真核細胞的構造'],
  [22, 24, '單元 1 細胞的構造與功能', '主題 4 細胞中能量的獲得與轉換'],
  [25, 30, '單元 1 細胞的構造與功能', '主題 5 光合作用與呼吸作用'],
  [31, 32, '單元 1 細胞的構造與功能', '主題 6 染色體與染色質'],
  [33, 37, '單元 1 細胞的構造與功能', '主題 7 細胞週期與細胞分裂'],
  [38, 40, '單元 1 細胞的構造與功能', '主題 8 人體配子的形成與受精卵的發育'],
  [41, 41, '單元 1 細胞的構造與功能', '主題 9 單元 1 探討活動'],
  [42, 71, '單元 1 複習', '科學探究練功坊／第一次模考'],
  [72, 74, '單元 2 生殖與遺傳', '主題 10 穿越歷史的遺傳學'],
  [75, 82, '單元 2 生殖與遺傳', '主題 11 孟德爾的遺傳法則'],
  [83, 92, '單元 2 生殖與遺傳', '主題 12 孟德爾遺傳法則的延伸'],
  [93, 96, '單元 2 生殖與遺傳', '主題 13 遺傳的染色體學說'],
  [97, 102, '單元 2 生殖與遺傳', '主題 14 確認遺傳物質為 DNA'],
  [103, 108, '單元 2 生殖與遺傳', '主題 15 DNA 的複製與基因的表現'],
  [109, 110, '單元 2 生殖與遺傳', '主題 16 遺傳變異與環境因子影響性狀的表現'],
  [111, 114, '單元 2 生殖與遺傳', '主題 17 遺傳工程及其應用'],
  [115, 115, '單元 2 生殖與遺傳', '主題 18 單元 2 探討活動'],
  [116, 141, '單元 2 複習', '第二次模考'],
  [142, 144, '單元 3 演化與多樣的生物', '主題 19 早期演化觀念的形成與發展'],
  [145, 148, '單元 3 演化與多樣的生物', '主題 20 達爾文演化理論的孕育'],
  [149, 153, '單元 3 演化與多樣的生物', '主題 21 演化的證據'],
  [154, 159, '單元 3 演化與多樣的生物', '主題 22 親緣關係的重建'],
  [160, 160, '單元 3 演化與多樣的生物', '主題 23 單元 3 探討活動'],
  [161, 236, '全範圍複習', '諾貝爾／科學探究練功坊、跨科題本、第三次模考與學測'],
] as const satisfies readonly NaturalMaterialPageMapRow[];

/** 《新關鍵》化學學測總複習講義，含單元頁、歷屆題與探究實作。 */
export const CHEMISTRY_NEW_KEY_PAGE_MAP = [
  [2, 3, '單元 1 物質的組成', '單元導讀'],
  [4, 7, '單元 1 物質的組成', '主題 1 物質的分類'],
  [8, 11, '單元 1 物質的組成', '主題 2 混合物的分離方法'],
  [12, 17, '單元 1 物質的組成', '主題 3 物質的狀態與相變'],
  [18, 25, '單元 1 物質的組成', '主題 4 基本定律'],
  [26, 27, '單元 1 物質的組成', '主題 5 原子量與分子量'],
  [28, 39, '單元 1 物質的組成', '主題 6 莫耳數的求法'],
  [40, 41, '單元 2 物質的構造', '單元導讀'],
  [42, 47, '單元 2 物質的構造', '主題 1 原子的結構'],
  [48, 54, '單元 2 物質的構造', '主題 2 元素週期表'],
  [55, 56, '單元 2 物質的構造', '主題 3 化學鍵（離子鍵）'],
  [57, 58, '單元 2 物質的構造', '主題 4 化學鍵（金屬鍵）'],
  [59, 65, '單元 2 物質的構造', '主題 5 化學鍵（共價鍵）'],
  [66, 85, '單元 2 物質的構造', '主題 6 路易斯電子點式'],
  [86, 87, '單元 3 化學反應', '單元導讀'],
  [88, 94, '單元 3 化學反應', '主題 1 化學式'],
  [95, 98, '單元 3 化學反應', '主題 2 反應式的平衡'],
  [99, 102, '單元 3 化學反應', '主題 3 化學計量'],
  [103, 119, '單元 3 化學反應', '主題 4 反應熱'],
  [120, 121, '單元 4 溶液', '單元導讀'],
  [122, 124, '單元 4 溶液', '主題 1 溶液的種類與特性'],
  [125, 129, '單元 4 溶液', '主題 2 溶液的濃度'],
  [130, 145, '單元 4 溶液', '主題 3 溶解度'],
  [146, 147, '單元 5 常見的化學反應', '單元導讀'],
  [148, 154, '單元 5 常見的化學反應', '主題 1 氧化還原反應'],
  [155, 173, '單元 5 常見的化學反應', '主題 2 水溶液中的酸鹼反應'],
  [174, 175, '單元 6 生活中的化學', '單元導讀'],
  [176, 184, '單元 6 生活中的化學', '主題 1 生物體中的分子'],
  [185, 186, '單元 6 生活中的化學', '主題 2 藥物'],
  [187, 188, '單元 6 生活中的化學', '主題 3 界面活性劑'],
  [189, 194, '單元 6 生活中的化學', '主題 4 空氣污染、水污染、水的處理與純化'],
  [195, 196, '單元 6 生活中的化學', '主題 5 奈米材料'],
  [197, 215, '單元 6 生活中的化學', '主題 6 綠色化學、能源'],
  [216, 217, '單元 7 有機化合物基本概念（補充）', '單元導讀'],
  [218, 224, '單元 7 有機化合物基本概念（補充）', '主題 1 有機化合物'],
  [225, 225, '單元 8 實驗', '單元導讀'],
  [226, 232, '單元 8 實驗', '主題 1 常用的實驗器材與操作'],
  [233, 235, '單元 8 實驗', '主題 2 萃取、蒸餾與層析分析'],
  [236, 238, '單元 8 實驗', '主題 3 溶解度的測定'],
  [239, 241, '單元 8 實驗', '主題 4 酸鹼指示劑'],
  [242, 252, '單元 8 實驗', '主題 5 氧化還原反應'],
  [253, 260, '歷屆闖關練功坊', '近 5 年重要考題'],
  [261, 261, '科學探究練功坊', '單元導讀'],
  [262, 268, '科學探究練功坊', '主題 1 科學論證'],
  [269, 272, '科學探究練功坊', '主題 2 邏輯推論'],
  [273, 281, '科學探究練功坊', '主題 3 探究實作'],
] as const satisfies readonly NaturalMaterialPageMapRow[];

export interface NaturalMaterialPageMatch {
  start: number;
  end: number;
  unit: string;
  topic: string;
}

function pageMatches(
  rows: readonly NaturalMaterialPageMapRow[],
  startValue: unknown,
  endValue: unknown,
): NaturalMaterialPageMatch[] {
  let start = Number(startValue);
  let end = Number(endValue);
  if (!Number.isFinite(start) || start < 1) return [];
  if (!Number.isFinite(end) || end < 1) end = start;
  if (end < start) [start, end] = [end, start];

  return rows
    .filter(row => end >= row[0] && start <= row[1])
    .map(row => ({
      start: Math.max(start, row[0]),
      end: Math.min(end, row[1]),
      unit: row[2],
      topic: row[3],
    }));
}

export function biologyNewKeyPageMatches(startValue: unknown, endValue: unknown): NaturalMaterialPageMatch[] {
  return pageMatches(BIOLOGY_NEW_KEY_PAGE_MAP, startValue, endValue);
}

export function chemistryNewKeyPageMatches(startValue: unknown, endValue: unknown): NaturalMaterialPageMatch[] {
  return pageMatches(CHEMISTRY_NEW_KEY_PAGE_MAP, startValue, endValue);
}

function pageText(matches: readonly NaturalMaterialPageMatch[], rangeText: string): string {
  if (matches.length === 0) return `頁碼不在已建立的教材範圍 ${rangeText} 內。`;
  return matches.map(match => {
    const pages = match.start === match.end ? `p.${match.start}` : `p.${match.start}–${match.end}`;
    return `${match.unit}｜${match.topic}（${pages}）`;
  }).join('、');
}

export function biologyNewKeyPageText(startValue: unknown, endValue: unknown): string {
  return pageText(biologyNewKeyPageMatches(startValue, endValue), 'p.4–236');
}

export function chemistryNewKeyPageText(startValue: unknown, endValue: unknown): string {
  return pageText(chemistryNewKeyPageMatches(startValue, endValue), 'p.2–281');
}

export function naturalNewKeyPageText(subject: unknown, startValue: unknown, endValue: unknown): string {
  if (subject === '生物') return biologyNewKeyPageText(startValue, endValue);
  if (subject === '化學') return chemistryNewKeyPageText(startValue, endValue);
  return '此科目的「新關鍵」尚未建立頁碼對應。';
}

