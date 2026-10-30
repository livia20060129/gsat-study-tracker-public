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

/** 《新關鍵》物理學測總複習講義，含單元頁、練功坊與探究實作。 */
export const PHYSICS_NEW_KEY_PAGE_MAP = [
  [2, 2, '單元 1 緒論', '單元導讀'],
  [3, 4, '單元 1 緒論', '主題 1 物理學簡介'],
  [5, 17, '單元 1 緒論', '主題 2 物理量的單位'],
  [18, 18, '單元 2 物體的運動', '單元導讀'],
  [19, 21, '單元 2 物體的運動', '主題 1 位移、速度、加速度'],
  [22, 26, '單元 2 物體的運動', '主題 2 運動函數圖形'],
  [27, 31, '單元 2 物體的運動', '主題 3 等加速運動'],
  [32, 37, '單元 2 物體的運動', '主題 4 牛頓運動定律'],
  [38, 45, '單元 2 物體的運動', '主題 5 生活中常見的力'],
  [46, 60, '單元 2 物體的運動', '主題 6 克卜勒行星運動定律'],
  [61, 61, '單元 3 物質的組成與交互作用', '單元導讀'],
  [62, 66, '單元 3 物質的組成與交互作用', '主題 1 原子組成物質'],
  [67, 67, '單元 3 物質的組成與交互作用', '主題 2 原子模型的發展歷史'],
  [68, 75, '單元 3 物質的組成與交互作用', '主題 3 原子與原子核的組成'],
  [76, 78, '單元 3 物質的組成與交互作用', '主題 4 重力'],
  [79, 86, '單元 3 物質的組成與交互作用', '主題 5 電磁力'],
  [87, 88, '單元 3 物質的組成與交互作用', '主題 6 強核力與弱核力'],
  [89, 98, '單元 3 物質的組成與交互作用', '主題 7 自然界的基本交互作用'],
  [99, 99, '單元 4 電與磁的統一', '單元導讀'],
  [100, 108, '單元 4 電與磁的統一', '主題 1 電流的磁效應'],
  [109, 120, '單元 4 電與磁的統一', '主題 2 電磁感應'],
  [121, 123, '單元 4 電與磁的統一', '主題 3 電磁感應的應用'],
  [124, 130, '單元 4 電與磁的統一', '主題 4 波的性質'],
  [131, 133, '單元 4 電與磁的統一', '主題 5 波的反射與折射'],
  [134, 135, '單元 4 電與磁的統一', '主題 6 波的干涉與繞射'],
  [136, 138, '單元 4 電與磁的統一', '主題 7 都卜勒效應'],
  [139, 143, '單元 4 電與磁的統一', '主題 8 光與電磁波'],
  [144, 145, '單元 4 電與磁的統一', '主題 9 光的反射'],
  [146, 149, '單元 4 電與磁的統一', '主題 10 光的折射'],
  [150, 161, '單元 4 電與磁的統一', '主題 11 光的干涉與繞射'],
  [162, 162, '單元 5 能量', '單元導讀'],
  [163, 165, '單元 5 能量', '主題 1 能量的形式'],
  [166, 166, '單元 5 能量', '主題 2 能量的轉換與能量守恆'],
  [167, 173, '單元 5 能量', '主題 3 常見的力學能守恆'],
  [174, 179, '單元 5 能量', '主題 4 核能'],
  [180, 192, '單元 5 能量', '主題 5 能量的有效利用與節約'],
  [193, 193, '單元 6 量子現象', '單元導讀'],
  [194, 198, '單元 6 量子現象', '主題 1 黑體輻射與量子論'],
  [199, 206, '單元 6 量子現象', '主題 2 光電效應'],
  [207, 209, '單元 6 量子現象', '主題 3 波粒二象性'],
  [210, 211, '單元 6 量子現象', '主題 4 氫原子模型'],
  [212, 222, '單元 6 量子現象', '主題 5 原子光譜'],
  [223, 223, '單元 7 現象背後的物理密碼', '單元導讀'],
  [224, 225, '單元 7 現象背後的物理密碼', '主題 1 路徑解密'],
  [226, 229, '單元 7 現象背後的物理密碼', '主題 2 電冰箱的冷媒循環全解'],
  [230, 232, '單元 7 現象背後的物理密碼', '主題 3 晶片世界的微縮科技'],
  [233, 240, '單元 7 現象背後的物理密碼', '主題 4 磁振造影'],
  [241, 251, '諾貝爾獎練功坊', '物理學重要發展與應用'],
  [252, 270, '科學探究練功坊', '探究實作'],
] as const satisfies readonly NaturalMaterialPageMapRow[];

/** 《新關鍵》地球科學學測總複習講義，含 7 個單元與進階探究題。 */
export const EARTH_SCIENCE_NEW_KEY_PAGE_MAP = [
  [2, 5, '單元 01 地球的歷史', '主題 1 地球的起源與演化'],
  [6, 19, '單元 01 地球的歷史', '主題 2 相對地質年代與絕對地質年代'],
  [20, 24, '單元 02 天文', '主題 3 恆星的亮度、光度與顏色'],
  [25, 30, '單元 02 天文', '主題 4 太陽系'],
  [31, 34, '單元 02 天文', '主題 5 地球防護罩與適居性'],
  [35, 38, '單元 02 天文', '主題 6 宇宙的結構與宇宙膨脹'],
  [39, 43, '單元 02 天文', '主題 7 天球中的天體'],
  [44, 46, '單元 02 天文', '主題 8 多波段星空觀測及限制'],
  [47, 53, '單元 02 天文', '主題 9 周日運動與不同緯度的星空'],
  [54, 57, '單元 02 天文', '主題 10 周年運動'],
  [58, 73, '單元 02 天文', '主題 11 四季變化'],
  [74, 77, '單元 03 地質', '主題 12 固體地球的結構'],
  [78, 87, '單元 03 地質', '主題 13 板塊運動'],
  [88, 103, '單元 03 地質', '主題 14 臺灣的板塊構造'],
  [104, 107, '單元 04 大氣', '主題 15 大氣的溫壓垂直結構'],
  [108, 114, '單元 04 大氣', '主題 16 雲霧的產生'],
  [115, 119, '單元 04 大氣', '主題 17 風向與風速'],
  [120, 137, '單元 04 大氣', '主題 18 氣象觀測與天氣圖'],
  [138, 143, '單元 05 海洋', '主題 19 海水的組成與結構'],
  [144, 147, '單元 05 海洋', '主題 20 波浪與其對海岸的影響'],
  [148, 153, '單元 05 海洋', '主題 21 海流'],
  [154, 159, '單元 05 海洋', '主題 22 潮汐'],
  [160, 177, '單元 05 海洋', '主題 23 海氣交互作用與聖嬰現象'],
  [178, 186, '單元 06 天然災害', '主題 24 颱風'],
  [187, 205, '單元 06 天然災害', '主題 25 地震'],
  [206, 212, '單元 07 全球氣候變遷與資源永續發展', '主題 26 氣候變遷'],
  [213, 217, '單元 07 全球氣候變遷與資源永續發展', '主題 27 全球暖化'],
  [218, 233, '單元 07 全球氣候變遷與資源永續發展', '主題 28 永續發展'],
  [234, 237, '單元 08 進階探究題', '觸類旁通 1 鋒面系統'],
  [238, 241, '單元 08 進階探究題', '觸類旁通 2 月相與日月食'],
  [242, 243, '單元 08 進階探究題', '脈絡整合 1 時間之箭'],
  [244, 245, '單元 08 進階探究題', '脈絡整合 2 望星空'],
  [246, 247, '單元 08 進階探究題', '脈絡整合 3 地球的自轉與公轉'],
  [248, 249, '單元 08 進階探究題', '脈絡整合 4 固體地球'],
  [250, 251, '單元 08 進階探究題', '脈絡整合 5 金鐘罩'],
  [252, 253, '單元 08 進階探究題', '脈絡整合 6 海、氣與氣候變遷'],
  [254, 256, '單元 08 進階探究題', '終極探究 1 冷氣團來襲'],
  [257, 258, '單元 08 進階探究題', '終極探究 2 土壤液化'],
  [259, 260, '單元 08 進階探究題', '終極探究 3 鐵皮屋的開窗設計'],
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

export function physicsNewKeyPageMatches(startValue: unknown, endValue: unknown): NaturalMaterialPageMatch[] {
  return pageMatches(PHYSICS_NEW_KEY_PAGE_MAP, startValue, endValue);
}

export function earthScienceNewKeyPageMatches(startValue: unknown, endValue: unknown): NaturalMaterialPageMatch[] {
  return pageMatches(EARTH_SCIENCE_NEW_KEY_PAGE_MAP, startValue, endValue);
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

export function physicsNewKeyPageText(startValue: unknown, endValue: unknown): string {
  return pageText(physicsNewKeyPageMatches(startValue, endValue), 'p.2–270');
}

export function earthScienceNewKeyPageText(startValue: unknown, endValue: unknown): string {
  return pageText(earthScienceNewKeyPageMatches(startValue, endValue), 'p.2–260');
}

export function naturalNewKeyPageText(subject: unknown, startValue: unknown, endValue: unknown): string {
  if (subject === '生物') return biologyNewKeyPageText(startValue, endValue);
  if (subject === '化學') return chemistryNewKeyPageText(startValue, endValue);
  if (subject === '物理') return physicsNewKeyPageText(startValue, endValue);
  if (subject === '地科') return earthScienceNewKeyPageText(startValue, endValue);
  return '此科目的「新關鍵」尚未建立頁碼對應。';
}
