export const AZAR_GRAMMAR_BOOK_TITLE = 'Azar英文文法（中階）';
export const AZAR_GRAMMAR_BOOK_ALIASES = [
  AZAR_GRAMMAR_BOOK_TITLE,
  'Azar英文文法系列（中階）',
] as const;
export const AZAR_GRAMMAR_IDENTIFIER_PREFIX = 'GAST-AZAR-2026-';

export interface AzarGrammarSection {
  code: string;
  title: string;
  start: number;
  end: number;
  chapter: number;
  chapterTitle: string;
  chapterLabel: string;
}

export interface AzarGrammarChapter {
  number: number;
  title: string;
  label: string;
  start: number;
  end: number;
  sections: AzarGrammarSection[];
}

interface ChapterSource {
  number: number;
  title: string;
  start: number;
  end: number;
  sections: ReadonlyArray<readonly [code: string, start: number, title: string]>;
}

const CHINESE_CHAPTER_NUMBERS = [
  '', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四',
];

const CHAPTER_SOURCES: ChapterSource[] = [
  {
    number: 1, title: '現在式', start: 1, end: 29,
    sections: [
      ['1-1', 2, '現在簡單式與現在進行式'],
      ['1-2', 2, '現在簡單式與現在進行式之句型'],
      ['1-3', 9, '單／複數'],
      ['1-4', 11, '現在簡單式動詞的拼寫：字尾 -s/-es'],
      ['1-5', 14, '頻率副詞'],
      ['1-6', 18, '通常不用於進行式的動詞'],
      ['1-7', 21, '現在式動詞：Yes/No問句之簡答'],
    ],
  },
  {
    number: 2, title: '過去式', start: 30, end: 63,
    sections: [
      ['2-1', 31, '過去簡單式：規則變化動詞'],
      ['2-2', 32, '表達過去的時間：過去簡單式、不規則變化動詞'],
      ['2-3', 33, '常見的不規則變化動詞：參考表'],
      ['2-4', 40, '辨識動詞字尾與以 Did 為首的疑問句'],
      ['2-5', 43, '拼寫形式：-ing 與 -ed'],
      ['2-6', 46, '過去進行式'],
      ['2-7', 50, '比較過去簡單式與過去進行式'],
      ['2-8', 57, '表達過去時間：時間子句的用法'],
      ['2-9', 60, '表達過去的習慣：Used To'],
    ],
  },
  {
    number: 3, title: '未來式', start: 64, end: 86,
    sections: [
      ['3-1', 65, '表達未來時間：Be Going To 與 Will'],
      ['3-2', 66, 'Be Going To 之形式'],
      ['3-3', 69, 'Will 之形式'],
      ['3-4', 71, '口語英文中的 Be Going To 與 Will'],
      ['3-5', 73, 'Be Going To 與 Will 的比較'],
      ['3-6', 77, '未來的確定性'],
      ['3-7', 80, '以時間副詞子句與 If 子句表達未來式'],
      ['3-8', 83, '以現在進行式表達未來時間'],
      ['3-9', 85, '以現在簡單式表達未來時間'],
      ['3-10', 85, '以 Be About To 表達立即的將來'],
      ['3-11', 86, '平行結構中的動詞'],
    ],
  },
  {
    number: 4, title: '現在完成式與過去完成式', start: 87, end: 115,
    sections: [
      ['4-1', 91, '過去分詞'],
      ['4-2', 92, '現在完成式概述：以 Ever 與 Never 表達不明確的時間'],
      ['4-3', 94, '表達不明確時間的現在完成式用 Already、Yet、Just、Recently'],
      ['4-4', 96, '現在完成式搭配 Since 與 For'],
      ['4-5', 99, '比較過去簡單式與現在完成式'],
      ['4-6', 104, '現在完成進行式'],
      ['4-7', 108, '比較現在完成進行式與現在完成式'],
      ['4-8', 110, '過去完成式'],
    ],
  },
  {
    number: 5, title: '疑問', start: 116, end: 148,
    sections: [
      ['5-1', 121, 'Yes/No 問句與簡答'],
      ['5-2', 122, '疑問詞：Where、Why、When、What Time、How Come、What ... For'],
      ['5-3', 125, '以 Who、Whom 與 What 為首的疑問句'],
      ['5-4', 128, '疑問句用法：What + Do 的任一形式'],
      ['5-5', 131, 'Which 與 What 的比較及 What Kind Of 的用法'],
      ['5-6', 133, 'How 的用法'],
      ['5-7', 135, 'How Often／How Many Times 的用法'],
      ['5-8', 138, '距離的說法'],
      ['5-9', 140, '時間長短的表示方法：It + Take 與 How Long；How Many'],
      ['5-10', 141, '口語及寫作中疑問詞的縮寫用法'],
      ['5-11', 143, '更多以 How 為首的疑問句'],
      ['5-12', 146, 'How About 與 What About 的用法'],
      ['5-13', 147, '附加問句'],
    ],
  },
  {
    number: 6, title: '名詞與代名詞', start: 149, end: 192,
    sections: [
      ['6-1', 157, '名詞的複數形'],
      ['6-2', 158, '字尾 -s/-es 的發音'],
      ['6-3', 160, '主詞、動詞與受詞'],
      ['6-4', 162, '介系詞的受詞'],
      ['6-5', 164, '時間的介系詞'],
      ['6-6', 167, '詞序：地方與時間'],
      ['6-7', 168, '主詞與動詞一致性'],
      ['6-8', 169, '用形容詞描述名詞'],
      ['6-9', 171, '名詞作形容詞的用法'],
      ['6-10', 173, '人稱代名詞：主詞與受詞'],
      ['6-11', 175, '名詞的所有格'],
      ['6-12', 178, 'Whose 的用法'],
      ['6-13', 181, '所有格代名詞與形容詞'],
      ['6-14', 183, '反身代名詞'],
      ['6-15', 184, 'Other 的單數形：比較 Another 與 The Other'],
      ['6-16', 186, 'Other 的複數形：比較 Other(s) 與 The Other(s)'],
      ['6-17', 188, '總結：Other 的形式'],
    ],
  },
  {
    number: 7, title: '情態助動詞、祈使句、提出建議與陳述喜好', start: 193, end: 227,
    sections: [
      ['7-1', 194, '情態助動詞的介紹'],
      ['7-2', 195, '表達能力：Can、Could、Be Able To'],
      ['7-3', 198, '表達可能性：May、Might 與 Maybe；表達許可：May 與 Can'],
      ['7-4', 200, '表達可能性：Could'],
      ['7-5', 202, '禮貌請求的問句：May I、Could I、Can I'],
      ['7-6', 205, '禮貌請求的問句：Would You、Could You、Will You、Can You'],
      ['7-7', 207, '表達建議：Should 與 Ought To'],
      ['7-8', 209, '表達建議：Had Better'],
      ['7-9', 210, '表達必要性：Have To、Have Got To、Must'],
      ['7-10', 214, '表達非必要性：Do Not Have To；表達禁止：Must Not'],
      ['7-11', 215, '提出合乎邏輯的推論：Must'],
      ['7-12', 218, '含情態助動詞的附加問句'],
      ['7-13', 219, '祈使句：給予指示'],
      ['7-14', 221, "提出建議：Let's 與 Why Don't"],
      ['7-15', 222, '陳述喜好：Prefer、Like ... Better、Would Rather'],
      ['7-16', 224, '總結：第七章教的情態助動詞'],
    ],
  },
  {
    number: 8, title: '連接詞：標點符號與意義', start: 228, end: 249,
    sections: [
      ['8-1', 229, '連接詞 And 的用法'],
      ['8-2', 231, '連接詞 But 與 Or 的用法'],
      ['8-3', 232, '連接詞 So 的用法'],
      ['8-4', 234, '連接詞 But 之後的助動詞用法'],
      ['8-5', 236, '連接詞 And + Too、So、Either、Neither 的用法'],
      ['8-6', 241, '連接詞 Because 的用法'],
      ['8-7', 244, '連接詞 Even Though/Although 的用法'],
    ],
  },
  {
    number: 9, title: '比較', start: 250, end: 281,
    sections: [
      ['9-1', 251, '介紹形容詞的比較級形式'],
      ['9-2', 254, '介紹形容詞的最高級形式'],
      ['9-3', 255, '比較級與最高級的完整用法'],
      ['9-4', 258, '副詞比較級與最高級的用法'],
      ['9-5', 262, '重複比較級與雙重比較級的用法'],
      ['9-6', 264, '修飾形容詞與副詞比較級'],
      ['9-7', 266, '否定的比較級'],
      ['9-8', 268, '以 As ... As 構成比較句'],
      ['9-9', 272, 'Less ... Than 與 Not As ... As 的用法'],
      ['9-10', 274, 'More 搭配名詞的用法'],
      ['9-11', 276, 'The Same、Similar、Different、Like、Alike 的用法'],
    ],
  },
  {
    number: 10, title: '被動語態', start: 282, end: 314,
    sections: [
      ['10-1', 283, '主動與被動語態的句子'],
      ['10-2', 283, '形成被動語態'],
      ['10-3', 287, '被動語態的進行式'],
      ['10-4', 290, '及物與不及物動詞'],
      ['10-5', 292, 'By 片語的用法'],
      ['10-6', 296, '情態助動詞的被動語態'],
      ['10-7', 298, '過去分詞作為形容詞（靜態或非進行式的被動語態）'],
      ['10-8', 302, '分詞形容詞：-ed 與 -ing 的比較'],
      ['10-9', 305, 'Get + 形容詞；Get + 過去分詞'],
      ['10-10', 308, 'Be Used/Accustomed To 與 Get Used/Accustomed To 的用法'],
      ['10-11', 310, '比較 Used To 與 Be Used To'],
      ['10-12', 312, 'Be Supposed To 的用法'],
    ],
  },
  {
    number: 11, title: '可數／不可數名詞與冠詞', start: 315, end: 343,
    sections: [
      ['11-1', 316, '比較冠詞 A 與 An'],
      ['11-2', 317, '可數與不可數名詞'],
      ['11-3', 318, '不可數名詞'],
      ['11-4', 320, '更多的不可數名詞'],
      ['11-5', 322, 'A Lot Of、Some、Several、Many/Much 與 A Few/A Little 的用法'],
      ['11-6', 325, '兼具可數與不可數性質的名詞'],
      ['11-7', 328, '計量單位搭配不可數名詞的用法'],
      ['11-8', 330, '可數與不可數名詞的冠詞：A/An、The、Ø'],
      ['11-9', 332, '更多關於冠詞的用法'],
      ['11-10', 337, 'The 或 Ø 搭配人或地的用法'],
      ['11-11', 339, '字首大寫'],
    ],
  },
  {
    number: 12, title: '形容詞子句', start: 344, end: 368,
    sections: [
      ['12-1', 345, '形容詞子句的介紹'],
      ['12-2', 346, '在形容詞子句中用 Who 與 That 形容人'],
      ['12-3', 349, '在形容詞子句中用受格代名詞形容人'],
      ['12-4', 353, '在形容詞子句中用代名詞形容事物'],
      ['12-5', 358, '形容詞子句中的單數與複數動詞'],
      ['12-6', 359, '形容詞子句中的介系詞用法'],
      ['12-7', 362, '形容詞子句中 Whose 的用法'],
    ],
  },
  {
    number: 13, title: '動名詞與不定詞', start: 369, end: 399,
    sections: [
      ['13-1', 370, '動詞 + 動名詞的用法'],
      ['13-2', 372, 'Go + -ing 的用法'],
      ['13-3', 374, '動詞 + 不定詞的用法'],
      ['13-4', 375, '動詞 + 動名詞或不定詞的用法'],
      ['13-5', 380, '介系詞 + 動名詞的用法'],
      ['13-6', 383, '以 By 與 With 表達完成事情方式的用法'],
      ['13-7', 386, '動名詞作為主詞的用法；It + 不定詞的用法'],
      ['13-8', 388, 'It + 不定詞；搭配 For (Someone) 的用法'],
      ['13-9', 391, '使用 In Order To 與 For 表達目的'],
      ['13-10', 394, 'Too 與 Enough 搭配不定詞的用法'],
    ],
  },
  {
    number: 14, title: '名詞子句', start: 400, end: 428,
    sections: [
      ['14-1', 401, '名詞子句的介紹'],
      ['14-2', 402, '疑問詞引導的名詞子句'],
      ['14-3', 406, 'If 或 Whether 引導的名詞子句'],
      ['14-4', 410, 'That 引導的名詞子句'],
      ['14-5', 411, 'That 子句的其他用法'],
      ['14-6', 414, '以 So 代替對話中回覆的 That 子句'],
      ['14-7', 416, '引述語句'],
      ['14-8', 418, '比較引述語句與轉述語句'],
      ['14-9', 419, '轉述語句中的動詞形式'],
      ['14-10', 421, '轉述語句中常用的動詞：Tell、Ask、Answer/Reply'],
    ],
  },
];

function chapterLabel(number: number, title: string): string {
  return `第${CHINESE_CHAPTER_NUMBERS[number] ?? number}章：${title}`;
}

function buildChapter(source: ChapterSource): AzarGrammarChapter {
  const sections = source.sections.map(([code, start, title], index, rows) => {
    const nextStart = rows.slice(index + 1).find(row => row[1] > start)?.[1] ?? source.end + 1;
    return {
      code,
      title,
      start,
      end: Math.max(start, nextStart - 1),
      chapter: source.number,
      chapterTitle: source.title,
      chapterLabel: chapterLabel(source.number, source.title),
    };
  });
  return {
    number: source.number,
    title: source.title,
    label: chapterLabel(source.number, source.title),
    start: source.start,
    end: source.end,
    sections,
  };
}

export const AZAR_GRAMMAR_CHAPTERS: AzarGrammarChapter[] = CHAPTER_SOURCES.map(buildChapter);
export const AZAR_GRAMMAR_SECTIONS: AzarGrammarSection[] = AZAR_GRAMMAR_CHAPTERS.flatMap(chapter => chapter.sections);

export function isAzarGrammarBookTitle(value: unknown): boolean {
  return /Azar\s*英文文法(?:系列)?\s*[（(]?中階[）)]?/i.test(String(value ?? ''));
}

export function isAzarGrammarIdentifier(value: unknown): boolean {
  return /^GAST-AZAR-2026-[A-Z0-9_-]+$/i.test(String(value ?? '').replace(/\s+/g, ''));
}

export function azarGrammarChaptersForPages(startValue: unknown, endValue?: unknown): AzarGrammarChapter[] {
  const start = Number(startValue);
  const endCandidate = Number(endValue);
  if (!Number.isInteger(start) || start < 1 || start > 428) return [];
  const end = Number.isInteger(endCandidate) ? endCandidate : start;
  const low = Math.max(1, Math.min(start, end));
  const high = Math.min(428, Math.max(start, end));
  return AZAR_GRAMMAR_CHAPTERS
    .filter(chapter => high >= chapter.start && low <= chapter.end)
    .map(chapter => ({
      ...chapter,
      sections: chapter.sections.filter(section => high >= section.start && low <= section.end),
    }));
}

export function azarGrammarSectionsForPages(startValue: unknown, endValue?: unknown): AzarGrammarSection[] {
  return azarGrammarChaptersForPages(startValue, endValue).flatMap(chapter => chapter.sections);
}

export function azarGrammarPageSummary(startValue: unknown, endValue?: unknown): string {
  const chapters = azarGrammarChaptersForPages(startValue, endValue);
  if (!chapters.length) return '頁碼未對應到第 1～14 章';
  return chapters.map(chapter => {
    const sections = chapter.sections.map(section => `${section.code}${section.title}`).join('、');
    return `${chapter.label}${sections ? `｜${sections}` : ''}`;
  }).join('；');
}
