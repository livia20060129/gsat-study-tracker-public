export type MathMaterialPageMapRow = readonly [
  startPage: number,
  endPage: number,
  unit: string,
  chapter?: string,
];

/**
 * 新關鍵學測複習講義 1～2 冊。
 *
 * Page boundaries are taken from the printed unit index supplied by the user;
 * the final unit ends on p.191.
 */
export const NEWKEY_12_PAGE_MAP = [
  [2, 28, '實數與指對數'],
  [29, 59, '多項式函數'],
  [60, 84, '直線與圓'],
  [85, 106, '數列與級數'],
  [107, 137, '排列組合與機率'],
  [138, 166, '數據分析'],
  [167, 191, '三角比'],
] as const satisfies readonly MathMaterialPageMapRow[];

/**
 * 新關鍵學測複習講義 3A～4A 冊。
 *
 * Page boundaries are taken from the printed unit index supplied by the user;
 * the final unit ends on p.187.
 */
export const NEWKEY_34_PAGE_MAP = [
  [2, 30, '三角函數'],
  [31, 57, '指數與對數函數'],
  [58, 90, '平面向量'],
  [91, 115, '空間向量'],
  [116, 140, '空間中的平面與直線'],
  [141, 153, '條件機率與貝氏定理'],
  [154, 187, '矩陣'],
] as const satisfies readonly MathMaterialPageMapRow[];
