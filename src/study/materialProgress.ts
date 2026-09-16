import {
  BOOK_PAGE_MAPS,
  canonicalPageMappedBook,
  CHINESE_TOPIC_BOOK,
  DEEP_FIFTEEN_BOOK,
  ENGLISH_TOPIC_CLOZE_BOOK,
  ENGLISH_TOPIC_READING_BOOK,
  ENGLISH_MIXED_30_BOOK,
  ENGLISH_WEEKLY_PLAN_BOOK,
  pageMappedBookSubject,
  type PageMappedBook,
} from '../data/bookPageMaps.ts';
import { LISTENING_TEST_BOOK_TITLE, isListeningTestBookTitle } from '../data/englishBooks.ts';
import {
  AZAR_GRAMMAR_BOOK_TITLE,
  AZAR_GRAMMAR_SECTIONS,
  isAzarGrammarBookTitle,
} from '../data/azarGrammar.ts';
import { NEWKEY_12_PAGE_MAP, NEWKEY_34_PAGE_MAP } from '../data/mathMaterialPageMaps.ts';
import {
  CHEMISTRY_NAVIGATOR_PAGE_MAP,
  MATH_GRAND_SLAM_PAGE_MAP,
  PHYSICS_ADVANTAGE_PAGE_MAP,
  PHYSICS_COMEBACK_PAGE_MAP,
} from '../data/lecturePageMaps.ts';
import { ACTIVE_RECORD_PREFIX_KEY } from '../storage/local.ts';
import type { CalendarNaturalIntegrationEntry, StudyItem, StudyRecord } from '../types.ts';
import { recordedPageRangeFields } from './recordedPageRange.ts';

export { ACTIVE_RECORD_PREFIX_KEY } from '../storage/local.ts';

export const MATERIAL_PROGRESS_SUBJECTS = ['chinese', 'english', 'math', 'natural'] as const;
export type MaterialProgressSubject = (typeof MATERIAL_PROGRESS_SUBJECTS)[number];

export interface MaterialProgressSegment {
  key: string;
  label: string;
  recorded: boolean;
  /** 0-100, based on the actual covered pages (or exact unit completion). */
  completionPercent: number;
  /** Page count for page-based materials; one for rounds, units and exact sections. */
  completionWeight: number;
  tone: 'deep' | 'light';
}

export interface MaterialProgressRow {
  id: string;
  subject: MaterialProgressSubject;
  title: string;
  unitLabel: string;
  recorded: number;
  total: number;
  completionPercent: number;
  segments: MaterialProgressSegment[];
}

interface MaterialCoverage {
  ranges: Array<[number, number]>;
  exactKeys: Set<string>;
}

interface SegmentDefinition {
  key: string;
  label: string;
  start: number;
  end: number;
  topic?: string;
  detail?: string;
}

interface MaterialDefinition {
  id: string;
  subject: MaterialProgressSubject;
  title: string;
  unitLabel: string;
  segments: SegmentDefinition[];
}

type LooseRecord = Record<string, unknown>;
type PageMapRow = readonly [number, number, string, string?];

const REVIEW_WEEKLY_PAGE_MAP: PageMapRow[] = [
  [2, 7, '數與式'], [8, 13, '直線與圓'], [14, 20, '多項式函數'], [21, 25, '第一冊混合題專區'],
  [26, 32, '第一冊複習'], [33, 40, '數列與級數、數據分析'], [41, 48, '排列組合與機率'],
  [49, 55, '三角比'], [56, 59, '第二冊混合題專區'], [60, 66, '第一至二冊複習'],
  [67, 72, '三角函數'], [73, 78, '指數、對數函數'], [79, 84, '平面向量'],
  [85, 88, '第三冊混合題專區'], [89, 95, '第一至三冊複習'], [96, 100, '空間向量'],
  [101, 106, '條件機率與貝氏定理'], [107, 114, '矩陣'], [115, 118, '第四冊混合題專區'],
  [119, 125, '學測全範圍（一）'], [126, 132, '學測全範圍（二）'],
];

const SMART_12_PAGE_MAP: PageMapRow[] = [
  [5, 25, '實數與指對數'], [26, 54, '直線與圓'], [55, 86, '多項式函數'],
  [87, 108, '數列與級數'], [109, 130, '數據分析'], [131, 164, '排列組合與機率'],
  [165, Number.MAX_SAFE_INTEGER, '三角比'],
];

const SMART_34_PAGE_MAP: PageMapRow[] = [
  [5, 36, '三角函數'], [37, 65, '指數與對數函數'], [66, 95, '平面向量'],
  [96, 122, '空間向量'], [123, 145, '空間中的平面與直線'], [146, 166, '條件機率與貝氏定理'],
  [167, 198, '矩陣'], [199, 213, 'B版補充教材'], [214, 217, '115學測試題數學A'],
];

const TEACHING_MATH_PAGE_MAP: Record<string, PageMapRow[]> = {
  '1': [
    [1, 15, '數與式', '實數'], [16, 33, '數與式', '絕對值'], [34, 43, '數與式', '式的運算'],
    [44, 67, '數與式', '指數與對數'], [68, 76, '數與式', '綜合練習／實戰演練'],
    [77, 98, '直線與圓', '直線方程式'], [99, 120, '直線與圓', '直線方程式的應用'],
    [121, 140, '直線與圓', '圓與直線的關係'], [141, 148, '直線與圓', '綜合練習／實戰演練'],
    [149, 172, '多項式函數', '多項式及其運算'], [173, 197, '多項式函數', '簡單多項式函數及其圖形'],
    [198, 221, '多項式函數', '多項不等式'],
  ],
  '2': [
    [1, 22, '數列與級數', '數列與遞迴關係'], [23, 41, '數列與級數', '級數'],
    [42, 52, '數列與級數', '綜合練習／實戰演練'], [53, 72, '數據分析', '一維數據分析'],
    [73, 92, '數據分析', '二維數據分析'], [93, 106, '數據分析', '綜合練習／實戰演練'],
    [107, 132, '排列組合', '集合與計數原理'], [133, 148, '排列組合', '排列'],
    [149, 166, '排列組合', '組合與二項式定理'], [167, 178, '排列組合', '綜合練習／實戰演練'],
    [179, 197, '古典機率', '機率的定義與性質'], [198, 207, '古典機率', '期望值'],
    [208, 218, '古典機率', '綜合練習／實戰演練'], [219, 237, '三角', '直角三角形的三角比'],
    [238, 260, '三角', '廣義角與極坐標'], [261, 279, '三角', '正弦定理與餘弦定理'],
  ],
  '3A': [
    [1, 11, '三角函數', '弧度量'], [12, 32, '三角函數', '三角函數的圖形及其運用'],
    [33, 49, '三角函數', '三角的和角與差角公式'], [50, 63, '三角函數', '正餘弦的疊合'],
    [64, 78, '三角函數', '綜合練習／實戰演練'], [79, 103, '指數函數與對數函數', '指數函數'],
    [104, 118, '指數函數與對數函數', '對數律'], [119, 135, '指數函數與對數函數', '對數函數'],
    [136, 148, '指數函數與對數函數', '綜合練習／實戰演練'], [149, 172, '平面向量', '平面向量的表示法'],
    [173, 194, '平面向量', '平面向量的內積'], [195, 210, '平面向量', '面積與二階行列式'],
  ],
  '4A': [
    [1, 20, '空間向量', '空間概念'], [21, 37, '空間向量', '空間向量的坐標表示法'],
    [38, 52, '空間向量', '空間向量的內積'], [53, 70, '空間向量', '外積與行列式'],
    [71, 86, '空間向量', '綜合練習／實戰演練'], [87, 103, '空間中的平面與直線', '空間中的平面方程式'],
    [104, 135, '空間中的平面與直線', '空間中的直線方程式'],
    [136, 150, '空間中的平面與直線', '綜合練習／實戰演練'],
    [151, 167, '條件機率與貝式定理', '條件機率與獨立事件'],
    [168, 180, '條件機率與貝式定理', '貝式定理'],
    [181, 196, '條件機率與貝式定理', '綜合練習／實戰演練'],
    [197, 221, '矩陣', '線性方程組與矩陣列運算'], [222, 249, '矩陣', '矩陣的運算'],
    [250, 275, '矩陣', '矩陣的應用'],
  ],
};

const GOODPOINT_PAGE_MAPS: Record<string, PageMapRow[]> = {
  '物理': [
    [6, 14, '物理簡史與國際單位制'], [15, 34, '物體的運動'], [35, 55, '牛頓運動定律'],
    [56, 71, '重力'], [72, 91, '克卜勒行星運動定律'], [92, 118, '波的性質'],
    [119, 131, '靜電力與磁力'], [132, 154, '電與磁的統一'], [155, 169, '原子與原子核'],
    [170, 197, '功與能量'], [198, 223, '量子現象'],
  ],
  '化學': [
    [6, 22, '基礎實驗觀念與氣體製備'], [23, 48, '物質的狀態與物質分離'],
    [49, 68, '基本定律、原子結構與週期表'], [69, 89, '化學鍵與化學式'],
    [90, 105, '化學反應式與能量變化'], [106, 120, '溶液的性質'], [121, 134, '酸鹼反應'],
    [135, 146, '氧化還原反應'], [147, 162, '生物、有機化學'], [163, 184, '永續化學'],
  ],
};

const DAY123_PAGE_MAPS: Record<string, PageMapRow[]> = {
  '物理': [[2, 19, 'Chapter 1 緒論'], [20, 55, 'Chapter 2 物質的組成和交互作用'], [56, 113, 'Chapter 3 物體的運動'], [114, 143, 'Chapter 4 電與磁的統一'], [144, 183, 'Chapter 5 光的波動性'], [184, 219, 'Chapter 6 能量'], [220, 244, 'Chapter 7 量子現象']],
  '化學': [[2, 8, 'Chapter 0 學習要領與實驗器材'], [9, 44, 'Chapter 1 物質的組成'], [45, 95, 'Chapter 2 物質的形成'], [96, 128, 'Chapter 3 物質間的反應'], [129, 171, 'Chapter 4 水溶液中的反應'], [172, 227, 'Chapter 5 生活與環境化學']],
  '生物': [[2, 57, 'Chapter 1 細胞的構造與功能'], [58, 111, 'Chapter 2 遺傳'], [112, 163, 'Chapter 3 演化']],
  '地科': [[2, 63, 'Chapter 1 探索地球'], [64, 111, 'Chapter 2 地質'], [112, 167, 'Chapter 3 大氣'], [168, 209, 'Chapter 4 海洋'], [210, 250, 'Chapter 5 氣候變遷與永續發展']],
};

const GRAMMAR_REVIEW_PAGE_MAP: PageMapRow[] = [
  [1, 11, 'Chapter 1 英文基本句型'], [12, 27, 'Chapter 2 動詞時態'], [28, 44, 'Chapter 3 被動語態'],
  [45, 47, 'Review 1'], [48, 63, 'Chapter 4 助動詞'], [64, 77, 'Chapter 5 主詞與動詞一致'],
  [78, 89, 'Chapter 6 假設語氣'], [90, 91, 'Review 2'], [92, 102, 'Chapter 7 名詞子句'],
  [103, 120, 'Chapter 8 形容詞子句'], [121, 139, 'Chapter 9 副詞子句'], [140, 142, 'Review 3'],
  [143, 158, 'Chapter 10 不定詞'], [159, 173, 'Chapter 11 動名詞'], [174, 190, 'Chapter 12 分詞'],
  [191, 192, 'Review 4'], [193, 216, 'Chapter 13 形容詞與副詞'], [217, 237, 'Chapter 14 代名詞'],
  [238, 254, 'Chapter 15 否定句與倒裝句'], [255, 255, 'Review 5'],
];

function numberedSegments(total: number, noun: string): SegmentDefinition[] {
  return Array.from({ length: total }, (_, index) => ({
    key: String(index + 1),
    label: `${noun} ${index + 1}`,
    start: index + 1,
    end: index + 1,
  }));
}

function mappedSegments(rows: readonly PageMapRow[]): SegmentDefinition[] {
  return rows.map((row, index) => ({
    key: String(index + 1),
    label: `${row[2]}${row[3] ? `｜${row[3]}` : ''}（p.${row[0]}${row[0] === row[1] ? '' : `–${row[1] === Number.MAX_SAFE_INTEGER ? '末' : row[1]}`}）`,
    start: row[0],
    end: row[1],
  }));
}

function bookDefinition(book: PageMappedBook): MaterialDefinition {
  const subject = pageMappedBookSubject(book) === '國文' ? 'chinese' : 'english';
  return {
    id: `book:${book}`,
    subject,
    title: book,
    unitLabel: '篇',
    segments: BOOK_PAGE_MAPS[book].map((section, index) => ({
      key: String(index + 1),
      label: `${section.topic}｜${section.detail}（p.${section.start}–${section.end}）`,
      start: section.start,
      end: section.end,
      topic: section.topic,
      detail: section.detail,
    })),
  };
}

function mathDefinition(material: string, book: string, rows: readonly PageMapRow[]): MaterialDefinition {
  return {
    id: material === '複習週記' ? 'math:複習週記' : `math:${material}:${book}`,
    subject: 'math',
    title: material === '複習週記' ? '數學｜複習週記' : `數學｜${material}｜${book}`,
    unitLabel: '單元',
    segments: mappedSegments(rows),
  };
}

const MATERIAL_DEFINITIONS: MaterialDefinition[] = [
  { id: 'chinese:gujin', subject: 'chinese', title: '國文｜古今悅讀一百', unitLabel: '回', segments: numberedSegments(100, '第') },
  bookDefinition(DEEP_FIFTEEN_BOOK),
  bookDefinition(CHINESE_TOPIC_BOOK),
  { id: 'english:ace', subject: 'english', title: '英文｜ACE Reading', unitLabel: '回', segments: numberedSegments(60, '第') },
  { id: 'english:listening', subject: 'english', title: `英文｜${LISTENING_TEST_BOOK_TITLE}`, unitLabel: 'Test', segments: numberedSegments(10, 'Test') },
  { id: 'english:essential', subject: 'english', title: '英文｜Essential Grammar in Use', unitLabel: 'Unit', segments: numberedSegments(115, 'Unit') },
  { id: 'english:writing', subject: 'english', title: '英文｜英文寫作測驗', unitLabel: '回', segments: numberedSegments(40, '第') },
  { id: 'english:grammar', subject: 'english', title: '英文｜英文文法總複習講義', unitLabel: '章節', segments: mappedSegments(GRAMMAR_REVIEW_PAGE_MAP) },
  {
    id: 'english:azar-intermediate',
    subject: 'english',
    title: `英文｜${AZAR_GRAMMAR_BOOK_TITLE}`,
    unitLabel: '分項',
    segments: AZAR_GRAMMAR_SECTIONS.map(section => ({
      key: section.code,
      label: `${section.code}${section.title}（p.${section.start}${section.start === section.end ? '' : `–${section.end}`}）`,
      start: section.start,
      end: section.end,
    })),
  },
  bookDefinition(ENGLISH_TOPIC_READING_BOOK),
  bookDefinition(ENGLISH_TOPIC_CLOZE_BOOK),
  bookDefinition(ENGLISH_WEEKLY_PLAN_BOOK),
  bookDefinition(ENGLISH_MIXED_30_BOOK),
  ...Object.entries(TEACHING_MATH_PAGE_MAP).map(([book, rows]) => mathDefinition('教學講義', book, rows)),
  mathDefinition('複習週記', '', REVIEW_WEEKLY_PAGE_MAP),
  mathDefinition('智慧型', '1~2', SMART_12_PAGE_MAP),
  mathDefinition('智慧型', '3A~4A', SMART_34_PAGE_MAP),
  mathDefinition('新關鍵', '1~2', NEWKEY_12_PAGE_MAP),
  mathDefinition('新關鍵', '3A~4A', NEWKEY_34_PAGE_MAP),
  mathDefinition('新大滿貫', 'A', MATH_GRAND_SLAM_PAGE_MAP),
  ...Object.entries(DAY123_PAGE_MAPS).map(([subject, rows]) => ({
    id: `natural:${subject}:123日的淬鍊`, subject: 'natural' as const,
    title: `自然｜${subject}｜123日的淬鍊`, unitLabel: '章', segments: mappedSegments(rows),
  })),
  ...Object.entries(GOODPOINT_PAGE_MAPS).map(([subject, rows]) => ({
    id: `natural:${subject}:好考點`, subject: 'natural' as const,
    title: `自然｜${subject}｜好考點`, unitLabel: '單元', segments: mappedSegments(rows),
  })),
  { id: 'natural:化學:領航', subject: 'natural', title: '自然｜化學｜領航', unitLabel: '分項', segments: mappedSegments(CHEMISTRY_NAVIGATOR_PAGE_MAP) },
  { id: 'natural:物理:優勢', subject: 'natural', title: '自然｜物理｜優勢', unitLabel: '分項', segments: mappedSegments(PHYSICS_ADVANTAGE_PAGE_MAP) },
  { id: 'natural:物理:逆轉勝', subject: 'natural', title: '自然｜物理｜逆轉勝', unitLabel: '全書', segments: mappedSegments(PHYSICS_COMEBACK_PAGE_MAP) },
];

const definitionById = new Map(MATERIAL_DEFINITIONS.map(definition => [definition.id, definition]));

function objectValue(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {};
}

function integer(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function hasRecordedActivity(item: StudyItem): boolean {
  if (item.done === true || Number(item.minutes) > 0) return true;
  const fields = objectValue(item.f);
  return ['progress', 'graded', 'corrected', 'review'].some(key => fields[key] === true);
}

function normalizeMathMaterial(value: unknown): string {
  const text = String(value ?? '').replace(/\s+/g, '');
  if (text.includes('教學講義')) return '教學講義';
  if (text.includes('複習週記')) return '複習週記';
  if (text.includes('智慧型')) return '智慧型';
  if (text.includes('新關鍵')) return '新關鍵';
  if (text.includes('新大滿貫')) return '新大滿貫';
  return text;
}

function normalizeMathBook(value: unknown): string {
  return String(value ?? '').replace(/^數學/, '').replace(/第|冊|\s/g, '').replace(/[～–—]/g, '~').toUpperCase();
}

function normalizeNaturalSubject(value: unknown): string {
  const text = String(value ?? '');
  return ['物理', '化學', '生物', '地科'].find(subject => text.includes(subject)) ?? '';
}

function normalizeNaturalMaterial(value: unknown): string {
  const text = String(value ?? '').replace(/\s+/g, '');
  if (text.includes('123日')) return '123日的淬鍊';
  if (text.includes('好考點')) return '好考點';
  if (text.includes('領航')) return '領航';
  if (text.includes('優勢')) return '優勢';
  if (text.includes('逆轉勝')) return '逆轉勝';
  return text;
}

function coverageFor(recorded: Map<string, MaterialCoverage>, definitionId: string): MaterialCoverage {
  const existing = recorded.get(definitionId);
  if (existing) return existing;
  const created: MaterialCoverage = { ranges: [], exactKeys: new Set<string>() };
  recorded.set(definitionId, created);
  return created;
}

function markRange(recorded: Map<string, MaterialCoverage>, definitionId: string, startValue: unknown, endValue: unknown): void {
  const definition = definitionById.get(definitionId);
  const start = integer(startValue);
  const endCandidate = integer(endValue);
  if (!definition || start === null) return;
  const end = endCandidate ?? start;
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  coverageFor(recorded, definitionId).ranges.push([low, high]);
}

function markBookSelection(recorded: Map<string, MaterialCoverage>, book: PageMappedBook, fields: LooseRecord): void {
  const definitionId = `book:${book}`;
  const definition = definitionById.get(definitionId);
  if (!definition) return;
  const topic = String(fields.topic ?? '').trim();
  const detail = String(fields.round ?? fields.detail ?? '').trim();
  if (topic && detail) {
    const target = coverageFor(recorded, definitionId).exactKeys;
    definition.segments.forEach(segment => {
      if (segment.topic === topic && segment.detail === detail) target.add(segment.key);
    });
    return;
  }
  markRange(recorded, definitionId, fields.start, fields.end);
}

function markLinear(recorded: Map<string, MaterialCoverage>, definitionId: string, start: unknown, end?: unknown): void {
  markRange(recorded, definitionId, start, end ?? start);
}

function markExact(recorded: Map<string, MaterialCoverage>, definitionId: string, keyValue: unknown): void {
  const definition = definitionById.get(definitionId);
  const key = String(keyValue ?? '').trim();
  if (!definition || !key || !definition.segments.some(segment => segment.key === key)) return;
  coverageFor(recorded, definitionId).exactKeys.add(key);
}

function markStudyItem(recorded: Map<string, MaterialCoverage>, item: StudyItem): void {
  const fields = objectValue(item.f);
  const delegatesRangeToChildren = ['groupedWorkEntries', 'dailyWorkSourceItems']
    .some(key => Array.isArray(fields[key]) && (fields[key] as unknown[]).length > 0);
  const type = String(item.type ?? '');
  const actualMathFields = type === 'mathStudy' || type === 'mathLecture' || type === 'mathPractice'
    ? recordedPageRangeFields(item.f)
    : null;
  if (!delegatesRangeToChildren && item.done === true && actualMathFields) {
    const material = normalizeMathMaterial(actualMathFields.material);
    const book = normalizeMathBook(actualMathFields.book);
    const definitionId = material === '複習週記' ? 'math:複習週記' : `math:${material}:${book}`;
    markRange(recorded, definitionId, actualMathFields.start, actualMathFields.end);
  }
  if (hasRecordedActivity(item) && !delegatesRangeToChildren) {
    const title = String(fields.title ?? item.title ?? '');
    const mappedBook = canonicalPageMappedBook(fields.book ?? fields.title ?? item.title);

    if (type === 'chineseReading') {
      if (String(fields.kind ?? '') === 'reading' || /古今悅讀一百/.test(title)) {
        markLinear(recorded, 'chinese:gujin', fields.round);
      } else if (mappedBook && pageMappedBookSubject(mappedBook) === '國文') {
        markBookSelection(recorded, mappedBook, fields);
      }
    }

    if (type === 'extra' || type === 'aceReading') {
      if (/ACE\s*Reading/i.test(title)) markLinear(recorded, 'english:ace', fields.round);
      else if (isListeningTestBookTitle(title)) markLinear(recorded, 'english:listening', fields.round);
      else if (/Essential\s+Grammar\s+in\s+Use/i.test(title)) markLinear(recorded, 'english:essential', fields.unitStart ?? fields.unit, fields.unitEnd ?? fields.unitStart ?? fields.unit);
      else if (/英文寫作測驗/.test(title)) markLinear(recorded, 'english:writing', fields.round);
      else if (isAzarGrammarBookTitle(title)) {
        if (fields.azarSectionCode) markExact(recorded, 'english:azar-intermediate', fields.azarSectionCode);
        else markRange(recorded, 'english:azar-intermediate', fields.start, fields.end);
      }
      else if (/英文文法總複習講義/.test(title)) markRange(recorded, 'english:grammar', fields.start, fields.end);
      else if (mappedBook && pageMappedBookSubject(mappedBook) === '英文') markBookSelection(recorded, mappedBook, fields);
    }

    if (type === 'scienceReview') {
      const subject = normalizeNaturalSubject(fields.subject);
      const material = normalizeNaturalMaterial(fields.material);
      markRange(recorded, `natural:${subject}:${material}`, fields.start, fields.end);
    }
  }

  const integrationEntries = Array.isArray(fields.calendarIntegrationEntries)
    ? fields.calendarIntegrationEntries as CalendarNaturalIntegrationEntry[]
    : [];
  integrationEntries.forEach(entry => {
    if (!entry || entry.done !== true) return;
    const material = normalizeNaturalMaterial(entry.material ?? '123日的淬鍊');
    (entry.ranges ?? []).forEach(range => markRange(recorded, `natural:${entry.subject}:${material}`, range[0], range[1]));
  });
}

function visitStudyItem(recorded: Map<string, MaterialCoverage>, item: StudyItem, visited: WeakSet<object>): void {
  if (!item || typeof item !== 'object' || visited.has(item)) return;
  visited.add(item);
  markStudyItem(recorded, item);
  const fields = objectValue(item.f);
  ['groupedWorkEntries', 'dailyWorkSourceItems', 'makeupEntries', 'reviewEntries', 'interactiveEntries'].forEach(key => {
    const children = fields[key];
    if (!Array.isArray(children)) return;
    children.forEach(child => {
      if (child && typeof child === 'object') visitStudyItem(recorded, child as StudyItem, visited);
    });
  });
}

function coveredLength(ranges: readonly [number, number][], start: number, end: number): number {
  const intersections = ranges
    .map(([low, high]) => [Math.max(start, low), Math.min(end, high)] as [number, number])
    .filter(([low, high]) => low <= high)
    .sort((left, right) => left[0] - right[0]);
  if (intersections.length === 0) return 0;

  let total = 0;
  let [currentStart, currentEnd] = intersections[0];
  for (const [low, high] of intersections.slice(1)) {
    if (low <= currentEnd + 1) {
      currentEnd = Math.max(currentEnd, high);
      continue;
    }
    total += currentEnd - currentStart + 1;
    currentStart = low;
    currentEnd = high;
  }
  return total + currentEnd - currentStart + 1;
}

function segmentCompletionPercent(segment: SegmentDefinition, coverage: MaterialCoverage): number {
  if (coverage.exactKeys.has(segment.key)) return 100;
  const touched = coverage.ranges.some(([low, high]) => high >= segment.start && low <= segment.end);
  if (!touched) return 0;
  // A legacy open-ended map has no reliable final page, so it remains an exact recorded unit.
  if (segment.end === Number.MAX_SAFE_INTEGER) return 100;
  const total = segment.end - segment.start + 1;
  return Math.min(100, Math.round((coveredLength(coverage.ranges, segment.start, segment.end) / total) * 100));
}

export function materialProgressRows(records: readonly StudyRecord[]): MaterialProgressRow[] {
  const recorded = new Map<string, MaterialCoverage>();
  const visited = new WeakSet<object>();
  records.forEach(record => (record.items ?? []).forEach(item => visitStudyItem(recorded, item, visited)));
  return MATERIAL_DEFINITIONS.map(definition => {
    const found = recorded.get(definition.id) ?? { ranges: [], exactKeys: new Set<string>() };
    const segments = definition.segments.map((segment, index) => {
      const completionPercent = segmentCompletionPercent(segment, found);
      const completionWeight = segment.end === Number.MAX_SAFE_INTEGER
        ? 1
        : Math.max(1, segment.end - segment.start + 1);
      return {
        key: segment.key,
        label: segment.label,
        completionPercent,
        completionWeight,
        recorded: completionPercent > 0,
        tone: index % 2 === 0 ? 'deep' as const : 'light' as const,
      };
    });
    const totalWeight = segments.reduce((sum, segment) => sum + segment.completionWeight, 0);
    const completionPercent = totalWeight > 0
      ? Math.round(segments.reduce(
        (sum, segment) => sum + segment.completionPercent * segment.completionWeight,
        0,
      ) / totalWeight)
      : 0;
    return {
      id: definition.id,
      subject: definition.subject,
      title: definition.title,
      unitLabel: definition.unitLabel,
      recorded: segments.filter(segment => segment.recorded).length,
      total: segments.length,
      completionPercent,
      segments,
    };
  });
}

function validRecordPrefix(value: string | null): value is string {
  return Boolean(value && /^study-v11:(?:guest|user:[^:]+):$/.test(value));
}

function discoveredPrefixes(storage: Pick<Storage, 'length' | 'key'>): string[] {
  const prefixes = new Set<string>();
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index) ?? '';
    const match = key.match(/^(study-v11:(?:guest|user:[^:]+):)\d{4}-\d{2}-\d{2}$/);
    if (match) prefixes.add(match[1]);
  }
  return [...prefixes];
}

export function activeStudyRecordPrefix(storage: Pick<Storage, 'length' | 'key' | 'getItem'>): string {
  const active = storage.getItem(ACTIVE_RECORD_PREFIX_KEY);
  if (validRecordPrefix(active)) return active;
  const prefixes = discoveredPrefixes(storage);
  const userPrefix = prefixes.find(prefix => prefix.startsWith('study-v11:user:'));
  return userPrefix ?? (prefixes.includes('study-v11:guest:') ? 'study-v11:guest:' : 'study-v11:guest:');
}

export function readMaterialProgressRecords(storage: Pick<Storage, 'length' | 'key' | 'getItem'>): {
  prefix: string;
  records: StudyRecord[];
} {
  const prefix = activeStudyRecordPrefix(storage);
  const records: StudyRecord[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index) ?? '';
    if (!key.startsWith(prefix) || !/^\d{4}-\d{2}-\d{2}$/.test(key.slice(prefix.length))) continue;
    try {
      const value = storage.getItem(key);
      const parsed = value ? JSON.parse(value) as StudyRecord : null;
      if (parsed && Array.isArray(parsed.items)) records.push(parsed);
    } catch {
      // One damaged day must not make the entire progress page unreadable.
    }
  }
  records.sort((left, right) => String(left.date).localeCompare(String(right.date)));
  return { prefix, records };
}

export function subjectIndex(subject: MaterialProgressSubject): number {
  return Math.max(0, MATERIAL_PROGRESS_SUBJECTS.indexOf(subject));
}

export function normalizedProgressSubject(value: unknown): MaterialProgressSubject {
  return MATERIAL_PROGRESS_SUBJECTS.includes(value as MaterialProgressSubject)
    ? value as MaterialProgressSubject
    : 'math';
}
