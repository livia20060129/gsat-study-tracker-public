export type LecturePageMapRow = readonly [number, number, string, string?];

export const CHEMISTRY_NAVIGATOR_MATERIAL = '領航';
export const PHYSICS_ADVANTAGE_MATERIAL = '優勢';
export const PHYSICS_COMEBACK_MATERIAL = '逆轉勝';
export const MATH_GRAND_SLAM_MATERIAL = '新大滿貫';

export const LECTURE_IDENTIFIERS = {
  chemistryNavigator: 'GSAT-CHEM-LINGHANG',
  physicsAdvantage: 'GSAT-PHYS-YOUSHI',
  englishWeeklyPlan: 'GSAT-ENG-WEEKPLAN',
  englishMixed30: 'GSAT-ENG-MIXED30',
  physicsComeback: 'GSAT-PHYS-NIZHUANSHENG',
  mathGrandSlamA: 'GSAT-MATHA-NEW-DAMANFEN',
} as const;

export type LectureIdentifierMatch =
  | { kind: 'natural'; subject: '化學' | '物理'; material: string }
  | { kind: 'englishBook'; book: '學測週計畫' | '混合題30篇實戰演練' }
  | { kind: 'math'; material: '新大滿貫'; book: 'A' };

export function lectureIdentifierMatch(value: unknown): LectureIdentifierMatch | null {
  const identifier = String(value ?? '').toUpperCase().replace(/[\s​-‍﻿]+/g, '');
  const matches = (materialIdentifier: string) => identifier === materialIdentifier || identifier.startsWith(`${materialIdentifier}-`);
  if (matches(LECTURE_IDENTIFIERS.chemistryNavigator)) return { kind: 'natural', subject: '化學', material: CHEMISTRY_NAVIGATOR_MATERIAL };
  if (matches(LECTURE_IDENTIFIERS.physicsAdvantage)) return { kind: 'natural', subject: '物理', material: PHYSICS_ADVANTAGE_MATERIAL };
  if (matches(LECTURE_IDENTIFIERS.physicsComeback)) return { kind: 'natural', subject: '物理', material: PHYSICS_COMEBACK_MATERIAL };
  if (matches(LECTURE_IDENTIFIERS.englishWeeklyPlan)) return { kind: 'englishBook', book: '學測週計畫' };
  if (matches(LECTURE_IDENTIFIERS.englishMixed30)) return { kind: 'englishBook', book: '混合題30篇實戰演練' };
  if (matches(LECTURE_IDENTIFIERS.mathGrandSlamA)) return { kind: 'math', material: MATH_GRAND_SLAM_MATERIAL, book: 'A' };
  return null;
}

/** 化學《領航》，依使用者提供的目錄與末頁 p.290。 */
export const CHEMISTRY_NAVIGATOR_PAGE_MAP: readonly LecturePageMapRow[] = [
  [2, 18, '第1章 物質的組成', '1-1 物質的分類與分離'],
  [19, 29, '第1章 物質的組成', '1-2 道耳頓的原子說'],
  [30, 37, '第1章 物質的組成', '1-3 原子量與莫耳數'],
  [38, 71, '第1章 物質的組成', '1-4 原子結構與元素週期表'],
  [72, 90, '第2章 物質的構造與反應', '2-1 化學鍵'],
  [91, 102, '第2章 物質的構造與反應', '2-2 化學式'],
  [103, 117, '第2章 物質的構造與反應', '2-3 反應式的平衡與化學計量'],
  [118, 143, '第2章 物質的構造與反應', '2-4 化學反應熱'],
  [144, 151, '第3章 溶液與反應', '3-1 溶液的種類與特性'],
  [152, 162, '第3章 溶液與反應', '3-2 水溶液的濃度'],
  [163, 172, '第3章 溶液與反應', '3-3 溶解度'],
  [173, 187, '第3章 溶液與反應', '3-4 水溶液中的酸鹼反應'],
  [188, 219, '第3章 溶液與反應', '3-5 氧化還原反應'],
  [220, 235, '第4章 生活中的化學', '4-1 生物體分子'],
  [236, 245, '第4章 生活中的化學', '4-2 藥物與界面活性劑'],
  [246, 264, '第4章 生活中的化學', '4-3 環境與化學'],
  [265, 290, '第4章 生活中的化學', '4-4 化學的現代應用'],
];

/** 物理《優勢》，章首頁併入該章第一個分項，末頁 p.244。 */
export const PHYSICS_ADVANTAGE_PAGE_MAP: readonly LecturePageMapRow[] = [
  [7, 11, '第1章 科學的態度與方法', '1-1 科學的態度與方法'],
  [12, 16, '第1章 科學的態度與方法', '1-2 物理學簡介'],
  [17, 30, '第1章 科學的態度與方法', '1-3 物理量的單位'],
  [31, 40, '第2章 物質的組成與交互作用', '2-1 物質的組成'],
  [41, 48, '第2章 物質的組成與交互作用', '2-2 原子的尺度與結構'],
  [49, 67, '第2章 物質的組成與交互作用', '2-3 物質間的基本交互作用'],
  [68, 86, '第3章 物體的運動', '3-1 物體的運動'],
  [87, 101, '第3章 物體的運動', '3-2 牛頓運動定律'],
  [102, 117, '第3章 物體的運動', '3-3 天體運動'],
  [118, 125, '第4章 電與磁的統一', '4-1 電流的磁效應'],
  [126, 136, '第4章 電與磁的統一', '4-2 電磁感應'],
  [137, 150, '第4章 電與磁的統一', '4-3 波的性質與現象'],
  [151, 183, '第4章 電與磁的統一', '4-4 光與電磁波'],
  [184, 201, '第5章 能量', '5-1 功與能量的形式'],
  [202, 204, '第5章 能量', '5-2 能量轉換的關係'],
  [205, 219, '第5章 能量', '5-3 核能與核能發電'],
  [220, 229, '第6章 量子現象', '6-1 波粒二象性'],
  [230, 244, '第6章 量子現象', '6-2 原子光譜'],
];

/**
 * 物理《逆轉勝》的來源照片只有 16 週單元表，沒有各單元起始頁。
 * 因此僅建立可驗證的全書範圍，避免臆測單元頁界。
 */
export const PHYSICS_COMEBACK_PAGE_MAP: readonly LecturePageMapRow[] = [
  [1, 255, '16週複習計畫', '來源未提供各單元頁界'],
];

export const PHYSICS_COMEBACK_UNIT_PLAN = [
  '單元1 科學的態度與方法',
  '單元2 物體的運動',
  '單元3 牛頓運動定律',
  '單元4 物質的組成',
  '單元5 基本交互作用',
  '單元6 電與磁的統一',
  '單元7 波動與光學',
  '單元8 功與能量',
  '單元9 量子現象',
  '素養導向進階試題',
] as const;

/** 數學A《新大滿貫》，依使用者提供的目錄與末頁 p.353。 */
export const MATH_GRAND_SLAM_PAGE_MAP: readonly LecturePageMapRow[] = [
  [6, 19, '單元1 數與式'],
  [20, 44, '單元2 多項式函數'],
  [45, 69, '單元3 直線與圓'],
  [70, 91, '單元4 指數與對數函數'],
  [92, 109, '單元5 數列與級數'],
  [110, 132, '單元6 數據分析'],
  [133, 157, '單元7 排列組合'],
  [158, 184, '單元8 機率'],
  [185, 210, '單元9 三角比'],
  [211, 234, '單元10 三角函數'],
  [235, 260, '單元11 向量的運算與內積'],
  [261, 292, '單元12 空間概念、行列式與外積'],
  [293, 315, '單元13 空間中的平面與直線'],
  [316, 348, '單元14 矩陣'],
  [349, 353, '114學年度學科能力測驗（數學A考科）'],
];

export function naturalLecturePageMap(subjectValue: unknown, materialValue: unknown): readonly LecturePageMapRow[] {
  const subject = String(subjectValue ?? '').trim();
  const material = String(materialValue ?? '').replace(/\s+/g, '');
  if (subject === '化學' && material.includes(CHEMISTRY_NAVIGATOR_MATERIAL)) return CHEMISTRY_NAVIGATOR_PAGE_MAP;
  if (subject === '物理' && material.includes(PHYSICS_ADVANTAGE_MATERIAL)) return PHYSICS_ADVANTAGE_PAGE_MAP;
  if (subject === '物理' && material.includes(PHYSICS_COMEBACK_MATERIAL)) return PHYSICS_COMEBACK_PAGE_MAP;
  return [];
}
