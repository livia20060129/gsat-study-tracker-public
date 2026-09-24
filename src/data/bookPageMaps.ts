import { LECTURE_IDENTIFIERS } from './lecturePageMaps.ts';

export const DEEP_FIFTEEN_BOOK = '深耕十五';
export const CHINESE_TOPIC_BOOK = '主題百匯：閱讀寫作新進化';
export const ENGLISH_TOPIC_READING_BOOK = '主題百匯：篇章結構·閱讀測驗';
export const ENGLISH_TOPIC_CLOZE_BOOK = '主題百匯：克漏字';
export const ENGLISH_WEEKLY_PLAN_BOOK = '學測週計畫';
export const ENGLISH_MIXED_30_BOOK = '混合題30篇實戰演練';
export const GEOGRAPHY_WEEKLY_PLAN_BOOK = '地理｜學測週計畫';
export const HISTORY_WEEKLY_PLAN_BOOK = '歷史｜學測週計畫';
export const CIVICS_WEEKLY_PLAN_BOOK = '公民｜學測週計畫';

export type SocialStudiesSubject = '地理' | '歷史' | '公民';

export type PageMappedBook =
  | typeof DEEP_FIFTEEN_BOOK
  | typeof CHINESE_TOPIC_BOOK
  | typeof ENGLISH_TOPIC_READING_BOOK
  | typeof ENGLISH_TOPIC_CLOZE_BOOK
  | typeof ENGLISH_WEEKLY_PLAN_BOOK
  | typeof ENGLISH_MIXED_30_BOOK
  | typeof GEOGRAPHY_WEEKLY_PLAN_BOOK
  | typeof HISTORY_WEEKLY_PLAN_BOOK
  | typeof CIVICS_WEEKLY_PLAN_BOOK;

export interface BookPageSection {
  start: number;
  end: number;
  topic: string;
  detail: string;
}

export interface BookPageMatch extends BookPageSection {
  matchedStart: number;
  matchedEnd: number;
}

const deepFifteen: BookPageSection[] = [
  { start: 2, end: 7, topic: '先秦文學主流與發展', detail: '主題導讀' },
  { start: 8, end: 25, topic: '先秦文學主流與發展', detail: '燭之武退秦師' },
  { start: 26, end: 43, topic: '先秦文學主流與發展', detail: '大同與小康' },
  { start: 44, end: 63, topic: '先秦文學主流與發展', detail: '諫逐客書' },
  { start: 64, end: 67, topic: '漢代文學主流與發展', detail: '主題導讀' },
  { start: 68, end: 90, topic: '漢代文學主流與發展', detail: '鴻門宴' },
  { start: 91, end: 94, topic: '魏晉南北朝文學主流與發展', detail: '主題導讀' },
  { start: 95, end: 113, topic: '魏晉南北朝文學主流與發展', detail: '出師表' },
  { start: 114, end: 129, topic: '魏晉南北朝文學主流與發展', detail: '桃花源記' },
  { start: 130, end: 135, topic: '唐代文學主流與發展', detail: '主題導讀' },
  { start: 136, end: 154, topic: '唐代文學主流與發展', detail: '師說' },
  { start: 155, end: 179, topic: '唐代文學主流與發展', detail: '虯髯客傳' },
  { start: 180, end: 183, topic: '宋代文學主流與發展', detail: '主題導讀' },
  { start: 184, end: 204, topic: '宋代文學主流與發展', detail: '赤壁賦' },
  { start: 205, end: 210, topic: '元明清文學主流與發展', detail: '主題導讀' },
  { start: 211, end: 231, topic: '元明清文學主流與發展', detail: '項脊軒志' },
  { start: 232, end: 249, topic: '元明清文學主流與發展', detail: '晚遊六橋待月記' },
  { start: 250, end: 272, topic: '元明清文學主流與發展', detail: '勞山道士' },
  { start: 273, end: 274, topic: '臺灣古典文學', detail: '主題導讀' },
  { start: 275, end: 293, topic: '臺灣古典文學', detail: '勸和論' },
  { start: 294, end: 314, topic: '臺灣古典文學', detail: '鹿港乘桴記' },
  { start: 315, end: 324, topic: '臺灣古典文學', detail: '畫菊自序' },
];

type GroupDefinition = { topic: string; starts: Array<[string, number]>; end: number };

function groupedSections(groups: GroupDefinition[]): BookPageSection[] {
  return groups.flatMap(group => group.starts.map(([detail, start], index) => ({
    start,
    end: index + 1 < group.starts.length ? group.starts[index + 1][1] - 1 : group.end,
    topic: group.topic,
    detail,
  })));
}

const chineseTopics = groupedSections([
  { topic: '自我覺察與生命教育', starts: [['新手級', 2], ['職人級', 7], ['大師級', 15]], end: 22 },
  { topic: '情感記憶與人文歷史', starts: [['新手級', 23], ['職人級', 29], ['大師級', 36]], end: 44 },
  { topic: '旅遊記聞與生活感思', starts: [['新手級', 45], ['職人級', 51], ['大師級', 57]], end: 64 },
  { topic: '藝術審美與多元文化', starts: [['新手級', 65], ['職人級', 72], ['大師級', 81]], end: 89 },
  { topic: '科普自然與醫療公衛', starts: [['新手級', 90], ['職人級', 97], ['大師級', 105]], end: 115 },
  { topic: '商管行銷與資訊科技', starts: [['新手級', 116], ['職人級', 122], ['大師級', 130]], end: 138 },
  { topic: '公民議題與社會關懷', starts: [['新手級', 139], ['職人級', 144], ['大師級', 151]], end: 159 },
  { topic: '永續環境與全球視野', starts: [['新手級', 160], ['職人級', 167], ['大師級', 175]], end: 185 },
]);

const englishReading = groupedSections([
  { topic: '科技生活', starts: [['第一回', 1], ['第二回', 8]], end: 16 },
  { topic: '人生故事', starts: [['第一回', 17], ['第二回', 24]], end: 32 },
  { topic: '人物速寫', starts: [['第一回', 33], ['第二回', 41]], end: 48 },
  { topic: '未來展望', starts: [['第一回', 49], ['第二回', 58]], end: 65 },
  { topic: '藝文世界', starts: [['第一回', 66], ['第二回', 73]], end: 82 },
  { topic: '生態保育', starts: [['第一回', 83], ['第二回', 91]], end: 99 },
  { topic: '學校教育', starts: [['第一回', 100], ['第二回', 107]], end: 115 },
  { topic: '休閒旅遊', starts: [['第一回', 116], ['第二回', 125]], end: 132 },
  { topic: '醫療保健', starts: [['第一回', 133], ['第二回', 141]], end: 148 },
  { topic: '動盪年代', starts: [['第一回', 149], ['第二回', 157]], end: 164 },
  { topic: '觀光景點', starts: [['第一回', 165], ['第二回', 172]], end: 180 },
  { topic: '生物奇觀', starts: [['第一回', 181], ['第二回', 188]], end: 196 },
]);

const englishCloze = groupedSections([
  { topic: '新新世代', starts: [['第一回', 2], ['第二回', 5], ['第三回', 8], ['第四回', 11]], end: 13 },
  { topic: '人生哲理', starts: [['第一回', 14], ['第二回', 17], ['第三回', 20], ['第四回', 23]], end: 25 },
  { topic: '科技實驗', starts: [['第一回', 26], ['第二回', 30], ['第三回', 33], ['第四回', 36]], end: 38 },
  { topic: '歷史文明', starts: [['第一回', 39], ['第二回', 43], ['第三回', 46], ['第四回', 49]], end: 52 },
  { topic: '運動競技', starts: [['第一回', 53], ['第二回', 56], ['第三回', 59], ['第四回', 62]], end: 64 },
  { topic: '消費經濟', starts: [['第一回', 65], ['第二回', 68], ['第三回', 71], ['第四回', 74]], end: 76 },
  { topic: '寰宇風光', starts: [['第一回', 77], ['第二回', 80], ['第三回', 83], ['第四回', 86]], end: 88 },
  { topic: '研究成果', starts: [['第一回', 89], ['第二回', 92], ['第三回', 95], ['第四回', 98]], end: 100 },
  { topic: '日常生活', starts: [['第一回', 101], ['第二回', 104], ['第三回', 107], ['第四回', 110]], end: 112 },
  { topic: '旅遊見聞', starts: [['第一回', 113], ['第二回', 116], ['第三回', 119], ['第四回', 122]], end: 124 },
  { topic: '創意發明', starts: [['第一回', 125], ['第二回', 128], ['第三回', 131], ['第四回', 134]], end: 136 },
  { topic: '飲食文化', starts: [['第一回', 137], ['第二回', 140], ['第三回', 143], ['第四回', 146]], end: 148 },
  { topic: '環境議題', starts: [['第一回', 149], ['第二回', 152], ['第三回', 155], ['第四回', 158]], end: 160 },
  { topic: '珍奇見聞', starts: [['第一回', 161], ['第二回', 164], ['第三回', 167], ['第四回', 170]], end: 172 },
  { topic: '文化藝術', starts: [['第一回', 173], ['第二回', 176], ['第三回', 179], ['第四回', 182]], end: 184 },
  { topic: '健康醫療', starts: [['第一回', 185], ['第二回', 188], ['第三回', 191], ['第四回', 194]], end: 196 },
  { topic: '綠色概念', starts: [['第一回', 197], ['第二回', 200], ['第三回', 203], ['第四回', 206]], end: 208 },
  { topic: '社會變遷', starts: [['第一回', 209], ['第二回', 212], ['第三回', 215], ['第四回', 218]], end: 220 },
]);

const englishWeeklyPlan = groupedSections([
  {
    topic: '學測模擬試題',
    starts: [
      ['第1回（第1冊）', 4], ['第2回（第2冊）', 15], ['第3回（第3冊）', 25],
      ['第4回（第4冊）', 34], ['第5回（第5冊）', 43], ['第6回（第1～2冊）', 51],
      ['第7回（第1～3冊）', 62], ['第8回（第1～4冊）', 72], ['第9回（第1～5冊）', 83],
      ['第10回（第1～5冊）', 93], ['第11回（第1～5冊）', 102], ['第12回（第1～5冊）', 112],
      ['第13回（第1～5冊）', 124], ['第14回（第1～5冊）', 135], ['第15回（第1～5冊）', 146],
      ['第16回（第1～5冊）', 156],
    ],
    end: 165,
  },
  {
    topic: '附錄',
    starts: [['附錄1 素養混合題演練', 166], ['附錄2 113學年度學科能力測驗試題', 183]],
    end: 191,
  },
]);

const englishMixed30 = groupedSections([
  { topic: 'Chapter 1 歷史人文', starts: [['Test 1', 2], ['Test 2', 4], ['Test 3', 6], ['Test 4', 8], ['Test 5', 10]], end: 13 },
  { topic: 'Chapter 2 創意發明', starts: [['Test 1', 14], ['Test 2', 16], ['Test 3', 18], ['Test 4', 20], ['Test 5', 22]], end: 25 },
  { topic: 'Chapter 3 藝術展現', starts: [['Test 1', 26], ['Test 2', 28], ['Test 3', 30], ['Test 4', 32], ['Test 5', 34]], end: 37 },
  { topic: 'Chapter 4 自然科學', starts: [['Test 1', 38], ['Test 2', 40], ['Test 3', 42], ['Test 4', 44], ['Test 5', 46]], end: 49 },
  { topic: 'Chapter 5 動物環境', starts: [['Test 1', 50], ['Test 2', 52], ['Test 3', 54], ['Test 4', 56], ['Test 5', 58]], end: 61 },
  { topic: 'Chapter 6 聚焦臺灣', starts: [['Test 1', 62], ['Test 2', 64], ['Test 3', 66], ['Test 4', 68], ['Test 5', 70]], end: 70 },
  { topic: '附錄', starts: [['測驗用答案紙', 71]], end: 71 },
]);

const OPEN_ENDED_SECTION = Number.MAX_SAFE_INTEGER;

function weeklyPlanSections(
  topic: string,
  starts: Array<[string, number]>,
): BookPageSection[] {
  return starts.map(([detail, start], index) => ({
    start,
    end: index + 1 < starts.length ? starts[index + 1][1] - 1 : OPEN_ENDED_SECTION,
    topic,
    detail,
  }));
}

const geographyWeeklyPlan = weeklyPlanSections('地理學測週計畫', [
  ['第1週｜研究觀點與研究方法；地理資訊；地圖', 4],
  ['第2週｜地形系統', 14],
  ['第3週｜氣候系統', 24],
  ['第4週｜人口與環境負載力', 35],
  ['第5週｜聚落、流通路線與區域；都市與城鄉關係', 42],
  ['第6週｜產業活動', 50],
  ['第7週｜世界體系；臺灣與世界；東亞文化圈的形成與發展', 60],
  ['第8週｜東西文化的接觸與區域發展——東南亞、南亞', 68],
  ['第9週｜從孤立到樞紐——澳、紐；伊斯蘭世界的形成與發展', 76],
  ['第10週｜歐洲文明的發展與擴散；超級強國的興起與挑戰——美國', 86],
  ['第11週｜南方區域的發展與挑戰——中南美洲、非洲；全球化', 99],
  ['第12週｜第一～三冊複習 I', 110],
  ['第13週｜第一～三冊複習 II', 118],
  ['第14週｜115學年度學科能力測驗試題', 126],
]);

const civicsWeeklyPlan = weeklyPlanSections('公民學測週計畫', [
  ['單元1｜國家組成與認同', 2],
  ['單元2｜普世人權與公民身分', 16],
  ['單元3｜公平正義與多元文化', 31],
  ['單元4｜社會安全制度與勞動參與', 43],
  ['單元5｜政府組成與運作', 59],
  ['單元6｜媒體與公共意見', 83],
  ['單元7｜民主治理與政治參與', 99],
  ['單元8｜社會規範與法律', 126],
  ['單元9｜權利主體與基本權利', 142],
  ['單元10｜限制行政權的法律規範', 159],
  ['單元11｜犯罪與刑罰', 175],
  ['單元12｜民事權利的法律保障', 198],
  ['單元13｜有限資源的分配與誘因', 216],
  ['單元14｜生產與消費', 231],
  ['單元15｜市場機能', 253],
  ['單元16｜市場競爭與政府規範', 266],
  ['單元17｜專業分工與自由貿易', 280],
  ['單元18｜國民所得', 298],
  ['單元19｜外部性與政府對策', 313],
  ['單元20｜全球關聯與永續發展', 325],
]);

const historyWeeklyPlan = weeklyPlanSections('歷史學測週計畫', [
  ['單元1｜多元族群社會的形成', 2],
  ['單元2｜現代國家的形塑', 25],
  ['單元3｜經濟與文化的多樣性', 50],
  ['單元4｜國家與社會', 78],
  ['單元5｜人群的移動與交流', 114],
  ['單元6｜現代化的歷程', 146],
  ['單元7｜歐洲文化與現代世界', 178],
  ['單元8｜文化的交會與多元世界的發展', 219],
  ['單元9｜世界變遷與現代性', 252],
]);

export const BOOK_PAGE_MAPS: Record<PageMappedBook, BookPageSection[]> = {
  [DEEP_FIFTEEN_BOOK]: deepFifteen,
  [CHINESE_TOPIC_BOOK]: chineseTopics,
  [ENGLISH_TOPIC_READING_BOOK]: englishReading,
  [ENGLISH_TOPIC_CLOZE_BOOK]: englishCloze,
  [ENGLISH_WEEKLY_PLAN_BOOK]: englishWeeklyPlan,
  [ENGLISH_MIXED_30_BOOK]: englishMixed30,
  [GEOGRAPHY_WEEKLY_PLAN_BOOK]: geographyWeeklyPlan,
  [HISTORY_WEEKLY_PLAN_BOOK]: historyWeeklyPlan,
  [CIVICS_WEEKLY_PLAN_BOOK]: civicsWeeklyPlan,
};

const SOCIAL_WEEKLY_PLAN_BOOKS: Record<SocialStudiesSubject, PageMappedBook> = {
  地理: GEOGRAPHY_WEEKLY_PLAN_BOOK,
  歷史: HISTORY_WEEKLY_PLAN_BOOK,
  公民: CIVICS_WEEKLY_PLAN_BOOK,
};

function inferredSocialWeeklyPlanBook(title: string): PageMappedBook | null {
  const explicitSubject = (Object.keys(SOCIAL_WEEKLY_PLAN_BOOKS) as SocialStudiesSubject[])
    .find(subject => title.includes(subject) && /學測週計[畫劃]/.test(title));
  if (explicitSubject) return SOCIAL_WEEKLY_PLAN_BOOKS[explicitSubject];

  const matches = (Object.entries(SOCIAL_WEEKLY_PLAN_BOOKS) as Array<[SocialStudiesSubject, PageMappedBook]>)
    .filter(([, book]) => BOOK_PAGE_MAPS[book].some(section => {
      const unitName = section.detail.replace(/^(?:第\d+週|單元\d+)｜/, '');
      const searchableNames = [unitName, ...unitName.split(/[；;、]/)].map(name => name.trim());
      return searchableNames.some(name => name.length >= 4 && title.includes(name));
    }));
  return matches.length === 1 ? matches[0][1] : null;
}

export function canonicalPageMappedBook(value: unknown): PageMappedBook | null {
  const title = String(value ?? '').replace(/[：:·‧．]/g, ' ').replace(/\s+/g, ' ').trim();
  const identifier = title.toUpperCase();
  if (identifier.includes(LECTURE_IDENTIFIERS.englishWeeklyPlan)) return ENGLISH_WEEKLY_PLAN_BOOK;
  if (identifier.includes(LECTURE_IDENTIFIERS.englishMixed30)) return ENGLISH_MIXED_30_BOOK;
  if (identifier.includes(LECTURE_IDENTIFIERS.geographyWeeklyPlan)) return GEOGRAPHY_WEEKLY_PLAN_BOOK;
  if (identifier.includes(LECTURE_IDENTIFIERS.historyWeeklyPlan)) return HISTORY_WEEKLY_PLAN_BOOK;
  if (identifier.includes(LECTURE_IDENTIFIERS.civicsWeeklyPlan)) return CIVICS_WEEKLY_PLAN_BOOK;
  if (title.includes('深耕十五')) return DEEP_FIFTEEN_BOOK;
  if (title.includes('主題百匯') && title.includes('閱讀寫作新進化')) return CHINESE_TOPIC_BOOK;
  if (title.includes('主題百匯') && (title.includes('篇章結構') || title.includes('閱讀測驗'))) return ENGLISH_TOPIC_READING_BOOK;
  if (title.includes('主題百匯') && title.includes('克漏字')) return ENGLISH_TOPIC_CLOZE_BOOK;
  const socialWeeklyPlan = inferredSocialWeeklyPlanBook(title);
  if (socialWeeklyPlan) return socialWeeklyPlan;
  if (/學測週計[畫劃]/.test(title.replace(/\s+/g, ''))) return ENGLISH_WEEKLY_PLAN_BOOK;
  if (title.replace(/\s+/g, '').includes('混合題30篇實戰演練')) return ENGLISH_MIXED_30_BOOK;
  return null;
}

export function pageMappedBookSubject(book: PageMappedBook): '國文' | '英文' | '社會' {
  if (book === DEEP_FIFTEEN_BOOK || book === CHINESE_TOPIC_BOOK) return '國文';
  return pageMappedBookSocialSubject(book) ? '社會' : '英文';
}

export function pageMappedBookSocialSubject(book: PageMappedBook): SocialStudiesSubject | null {
  if (book === GEOGRAPHY_WEEKLY_PLAN_BOOK) return '地理';
  if (book === HISTORY_WEEKLY_PLAN_BOOK) return '歷史';
  if (book === CIVICS_WEEKLY_PLAN_BOOK) return '公民';
  return null;
}

export function isEnglishPageMappedBook(value: unknown): boolean {
  const book = canonicalPageMappedBook(value);
  return Boolean(book && pageMappedBookSubject(book) === '英文');
}

/** Topic Collection books use a fixed topic/round scope; new lecture books use actual page ranges. */
export function pageMappedBookUsesScopeSelection(value: unknown): boolean {
  const book = canonicalPageMappedBook(value);
  return book === ENGLISH_TOPIC_READING_BOOK || book === ENGLISH_TOPIC_CLOZE_BOOK;
}

export function bookTopics(bookValue: unknown): string[] {
  const book = canonicalPageMappedBook(bookValue);
  if (!book) return [];
  return [...new Set(BOOK_PAGE_MAPS[book].map(section => section.topic))];
}

export function bookDetailsForTopic(bookValue: unknown, topicValue: unknown): string[] {
  const book = canonicalPageMappedBook(bookValue);
  const topic = String(topicValue ?? '').trim();
  if (!book || !topic) return [];
  return BOOK_PAGE_MAPS[book]
    .filter(section => section.topic === topic)
    .map(section => section.detail);
}

export function bookDetails(bookValue: unknown): string[] {
  const book = canonicalPageMappedBook(bookValue);
  if (!book) return [];
  return [...new Set(BOOK_PAGE_MAPS[book].map(section => section.detail))];
}

export function bookSectionForSelection(
  bookValue: unknown,
  topicValue: unknown,
  detailValue: unknown,
): BookPageSection | null {
  const book = canonicalPageMappedBook(bookValue);
  const topic = String(topicValue ?? '').trim();
  const detail = String(detailValue ?? '').trim();
  if (!book || !topic || !detail) return null;
  return BOOK_PAGE_MAPS[book].find(section => section.topic === topic && section.detail === detail) ?? null;
}

export function bookPageMatches(bookValue: unknown, startValue: unknown, endValue: unknown): BookPageMatch[] {
  const book = canonicalPageMappedBook(bookValue);
  const start = Number(startValue);
  let end = Number(endValue);
  if (!book || !Number.isInteger(start) || start < 1) return [];
  if (!Number.isInteger(end) || end < 1) end = start;
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  return BOOK_PAGE_MAPS[book].filter(section => high >= section.start && low <= section.end).map(section => ({
    ...section,
    matchedStart: Math.max(low, section.start),
    matchedEnd: Math.min(high, section.end),
  }));
}

function bookPageFacetText(
  bookValue: unknown,
  startValue: unknown,
  endValue: unknown,
  facet: 'topic' | 'detail',
): string {
  const book = canonicalPageMappedBook(bookValue);
  if (!book) return '尚未建立此書的頁碼對照。';
  const matches = bookPageMatches(book, startValue, endValue);
  if (!matches.length) return '頁碼不在已建立的教材本文範圍內。';
  return [...new Set(matches.map(match => match[facet]))].join('、');
}

export function bookPageTopicText(bookValue: unknown, startValue: unknown, endValue: unknown): string {
  return bookPageFacetText(bookValue, startValue, endValue, 'topic');
}

export function bookPageDetailText(bookValue: unknown, startValue: unknown, endValue: unknown): string {
  return bookPageFacetText(bookValue, startValue, endValue, 'detail');
}

export function bookPageText(bookValue: unknown, startValue: unknown, endValue: unknown): string {
  const book = canonicalPageMappedBook(bookValue);
  if (!book) return '尚未建立此書的頁碼對照。';
  const matches = bookPageMatches(book, startValue, endValue);
  if (!matches.length) return '頁碼不在已建立的教材本文範圍內。';
  return matches.map(match => {
    const pages = match.matchedStart === match.matchedEnd
      ? `p.${match.matchedStart}`
      : `p.${match.matchedStart}–${match.matchedEnd}`;
    return `${match.topic}｜${match.detail}（${pages}）`;
  }).join('、');
}
