import { isListeningTestBookTitle, listeningTestNumbers } from '../data/englishBooks.ts';
import { lectureIdentifierMatch } from '../data/lecturePageMaps.ts';
import {
  AZAR_GRAMMAR_BOOK_TITLE,
  azarGrammarChaptersForPages,
  isAzarGrammarBookTitle,
  isAzarGrammarIdentifier,
  type AzarGrammarChapter,
} from '../data/azarGrammar.ts';
import {
  bookDetailsForTopic,
  bookTopics,
  canonicalPageMappedBook,
  ENGLISH_TOPIC_CLOZE_BOOK,
  ENGLISH_TOPIC_READING_BOOK,
  pageMappedBookUsesScopeSelection,
  pageMappedBookSubject,
  type PageMappedBook,
} from '../data/bookPageMaps.ts';

export interface CalendarTaskRow {
  event_key: string;
  source_event_id: string;
  calendar_id: string;
  event_date: string;
  title: string;
  description: string;
  category: string;
  event_updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface ParsedBase {
  eventKey: string;
  sourceEventId: string;
  identifier?: string;
  date: string;
  title: string;
  description: string;
  route?: 'today' | 'week';
  makeup?: boolean;
  sourceDate?: string;
  unitProgress?: string;
  standardNote?: boolean;
}

export interface CalendarStructuredNote {
  material: string;
  book: string;
  pageRange: string;
  unitProgress: string;
  focus: string;
  sourceDate: string;
  identifier: string;
  hasStandardFields: boolean;
}

export type CalendarRecognizedSubject =
  | '國文'
  | '英文'
  | '數學'
  | '物理'
  | '化學'
  | '生物'
  | '地科'
  | '自然'
  | '社會';

export type ParsedCalendarTask =
  | (ParsedBase & {
      kind: 'math';
      material: string;
      book: string;
      progressIndex: number | null;
      progressTotal: number | null;
      startPage: number | null;
      endPage: number | null;
    })
  | (ParsedBase & { kind: 'ace'; rounds: number[] })
  | (ParsedBase & { kind: 'listeningA'; tests: number[] })
  | (ParsedBase & { kind: 'gujin'; rounds: number[] })
  | (ParsedBase & {
      kind: 'bookPages';
      subject: '國文' | '英文';
      book: PageMappedBook;
      startPage: number | null;
      endPage: number | null;
    })
  | (ParsedBase & {
      kind: 'bookScope';
      subject: '英文';
      book: PageMappedBook;
      topic: string;
      rounds: string[];
    })
  | (ParsedBase & {
      kind: 'azarGrammar';
      book: typeof AZAR_GRAMMAR_BOOK_TITLE;
      startPage: number | null;
      endPage: number | null;
      chapters: AzarGrammarChapter[];
    })
  | (ParsedBase & { kind: 'grammar'; startPage: number | null; endPage: number | null; focus: string })
  | (ParsedBase & { kind: 'essentialGrammar'; units: number[] })
  | (ParsedBase & { kind: 'writing'; round: number | null; focus: string })
  | (ParsedBase & {
      kind: 'fixedTemplate';
      template: CalendarFixedTemplate;
      startPage: number | null;
      endPage: number | null;
    })
  | (ParsedBase & {
      kind: 'natural';
      subject: '物理' | '化學' | '生物' | '地科';
      topic: string;
      material: string;
      startPage: number | null;
      endPage: number | null;
    })
  | (ParsedBase & {
      kind: 'naturalIntegration';
      topic: string;
      review: string;
      pages: string;
      output: string;
      minimum: string;
      time: string;
      pageItems: Array<{ subject: '物理' | '化學' | '生物' | '地科'; start: number; end: number }>;
    })
  | (ParsedBase & { kind: 'subjectItem'; subject: CalendarRecognizedSubject })
  | (ParsedBase & { kind: 'other' });

function normalized(value: string): string {
  return value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
}

/** Minimum admission rule for Calendar rows without a supported template. */
export function recognizableCalendarSubject(value: string): CalendarRecognizedSubject | null {
  const identity = normalized(value);
  if (/物理/.test(identity)) return '物理';
  if (/化學/.test(identity)) return '化學';
  if (/生物/.test(identity)) return '生物';
  if (/地科|地球科學/.test(identity)) return '地科';
  if (/自然/.test(identity)) return '自然';
  if (/數學|數\s*A(?:\b|(?=[｜|：:·\-–—\s]))/i.test(identity)) return '數學';
  if (/國文|國語文/.test(identity)) return '國文';
  if (/英文|英語|英聽|英語聽力|單字|片語|English/i.test(identity)) return '英文';
  if (/社會|歷史|地理|公民/.test(identity)) return '社會';
  return null;
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  };
  return value
    .replace(/&([a-z]+);/gi, (entity, name: string) => named[name.toLowerCase()] ?? entity)
    .replace(/&#(x?[0-9a-f]+);/gi, (entity, rawCode: string) => {
      const hexadecimal = rawCode[0]?.toLowerCase() === 'x';
      const codePoint = Number.parseInt(hexadecimal ? rawCode.slice(1) : rawCode, hexadecimal ? 16 : 10);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    });
}

/** Converts Google Calendar rich-text descriptions into safe, readable plain text. */
export function calendarDescriptionText(value: string): string {
  const decoded = decodeHtmlEntities(String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(?:p|div|li|ul|ol)\s*>/gi, '\n')
    .replace(/<\s*li(?:\s[^>]*)?>/gi, '• ')
    .replace(/<[^>]*>/g, ' '));
  return normalized(decoded)
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

function withoutOriginalDate(value: string): string {
  return normalized(value.replace(/\s*[（(]\s*原(?:定|訂)?\s*\d{1,2}\s*\/\s*\d{1,2}\s*[）)]\s*$/i, ''));
}

function sourceDateFrom(title: string, description: string): string {
  const match = `${title}\n${description}`.match(
    /(?:原(?:定|訂)?\s*|延期來源\s*(?:】|\])?\s*[:：]?\s*|補(?:做)?\s*)(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s*\/\s*\d{1,2})/i,
  );
  return normalized(match?.[1]?.replace(/\s+/g, '') ?? '');
}

function canonicalMathBook(value: string): string {
  return normalized(value)
    .toUpperCase()
    .replace(/^數學/, '')
    .replace(/第|冊/g, '')
    .replace(/\s+/g, '')
    .replace(/[+＋]/g, '＋')
    .replace(/[~～–—－-]/g, '~');
}

function canonicalMathMaterial(value: string): string {
  const text = normalized(value).replace(/\s+/g, '');
  return ['新大滿貫', '教學講義', '智慧型', '新關鍵', '複習週記'].find(material => text.includes(material)) ?? normalized(value);
}

function mathHeading(title: string, description: string): { title: string; book: string } | null {
  const clean = withoutOriginalDate(title);
  const match = clean.match(/^((?:1|2|3A|4A|2\s*[＋+]\s*4A|2\s*[＋+]\s*3A))\s*(｜|[:：]|\s+)\s*(.+)$/i);
  if (!match) return null;

  const book = canonicalMathBook(match[1].toUpperCase());
  const explicitCalendarDelimiter = match[2] === '｜';
  const rangeInTitle = /p(?:age)?\.?\s*\d+/i.test(match[3]);
  const hasMathContext = explicitCalendarDelimiter
    || rangeInTitle
    || /數學講義|單元進度|完成標準/.test(description);
  if (!hasMathContext) return null;

  const topic = normalized(match[3]
    .replace(/\s+p(?:age)?\.?\s*\d+\s*(?:[–—~\-至到]\s*\d+)?\s*$/i, ''));
  if (!topic) return null;
  return { title: `${book}｜${topic}`, book };
}

function roundsFromTitle(title: string): number[] {
  const match = title.match(/第\s*(\d+)\s*(?:[–—~-]\s*(\d+)\s*)?回/);
  if (!match) return [];
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) return [];
  const rounds: number[] = [];
  for (let round = start; round <= end; round += 1) rounds.push(round);
  return rounds;
}

export type CalendarFixedTemplate =
  | 'mathStudy'
  | 'mathPractice'
  | 'interactiveDaily'
  | 'fixedMagazine'
  | 'englishReview'
  | 'englishMixedWriting'
  | 'englishMockTimed'
  | 'englishMockCorrection'
  | 'weekReview'
  | 'englishLightReading';

/** Matches the stable template name while allowing date, range, and makeup notes after it. */
export function calendarFixedTemplate(value: string): CalendarFixedTemplate | null {
  const title = normalized(value);
  if (/^數學講義題目\s*[｜:：]\s*理解檢查[＋+]錯題標記[＋+]訂正(?:$|｜)/.test(title)) return 'mathPractice';
  if (/^數學講義\s*[｜:：]\s*進度(?:$|｜)/.test(title)) return 'mathStudy';
  if (/^互動題(?:$|｜)/.test(title)) return 'interactiveDaily';
  if (/^學測英文訓練：英文雜誌(?:$|｜)/.test(title)) return 'fixedMagazine';
  if (/^英文訂正與搭配詞整理(?:$|｜)/.test(title)) return 'englishReview';
  if (/^英文\s*[：:]?\s*混合題與作文(?:練習)?(?:$|｜)/.test(title)) return 'englishMixedWriting';
  if (/^英文歷屆／模考\s*[｜:：]\s*限時作答(?:$|｜)/.test(title)) return 'englishMockTimed';
  if (/^英文歷屆／模考\s*[｜:：]\s*批改與訂正(?:$|｜)/.test(title)) return 'englishMockCorrection';
  if (/^本週完成度與錯題整理(?:$|｜)/.test(title)) return 'weekReview';
  if (/^英文輕量閱讀(?:$|｜)/.test(title)) return 'englishLightReading';
  return null;
}

function expandEssentialGrammarUnits(value: string): number[] {
  const units: number[] = [];
  const seen = new Set<number>();
  const ranges = /(\d{1,3})(?:\s*(?:[–—~-]|到|至)\s*(\d{1,3}))?/g;
  let match: RegExpExecArray | null;
  while ((match = ranges.exec(value))) {
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) continue;
    for (let unit = start; unit <= Math.min(end, 115); unit += 1) {
      if (!seen.has(unit)) {
        seen.add(unit);
        units.push(unit);
      }
    }
  }
  return units;
}

function essentialGrammarUnits(title: string, description: string): number[] {
  const sources = `${title}\n${description}`;
  const captures: string[] = [];
  const patterns = [
    /(?:Units?|單元)\s*[:：#]?\s*([0-9、，,及和到至–—~\- \t]+)/gi,
    /第\s*([0-9、，,及和到至–—~\- \t]+)\s*(?:Units?|單元)/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sources))) captures.push(match[1]);
  }
  if (!captures.length) {
    captures.push(title.replace(/Essential Grammar in Use/gi, ''));
  }
  return expandEssentialGrammarUnits(captures.join('、'));
}

function pageRange(value: string): [number | null, number | null] {
  const match = value.match(/p(?:age)?\.?\s*(\d+)\s*(?:[–—~\-至到]\s*(\d+))?/i);
  if (!match) return [null, null];
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  return [Number.isFinite(start) ? start : null, Number.isFinite(end) ? end : null];
}

function structuredPageRange(value: string): [number | null, number | null] {
  const text = normalized(value);
  if (!text || /^(?:[／/]|無|不適用|none)$/i.test(text)) return [null, null];
  const match = text.match(/(?:p(?:age)?\.?\s*)?(\d+)\s*(?:[–—~\-至到]\s*(\d+))?\s*(?:頁)?/i);
  if (!match) return [null, null];
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  return Number.isInteger(start) && Number.isInteger(end) && start > 0 && end >= start
    ? [start, end]
    : [null, null];
}

function naturalPageRange(value: string): [number | null, number | null] {
  const direct = pageRange(value);
  if (direct[0] !== null) return direct;
  const labelled = value.match(
    /(?:頁碼(?:範圍)?|範圍)\s*(?:】|\])?\s*[:：]?[^\n\d]{0,40}(\d+)\s*(?:[–—~\-至到]\s*(\d+))?\s*頁?/i,
  );
  if (!labelled) return [null, null];
  const start = Number(labelled[1]);
  const end = Number(labelled[2] ?? labelled[1]);
  return Number.isInteger(start) && Number.isInteger(end) && start > 0 && end >= start
    ? [start, end]
    : [null, null];
}

function naturalMaterial(value: string): string {
  return ['123日的淬鍊', '好考點', '新關鍵', '新大滿貫', '大滿貫', '領航', '優勢', '逆轉勝']
    .find(material => value.includes(material)) ?? '';
}

function field(description: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = description.match(new RegExp(`${escaped}[:：]\\s*([^\\n]+)`));
  return match ? normalized(match[1]) : '';
}

function bracketSection(description: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = description.match(new RegExp(`【${escaped}】([\\s\\S]*?)(?=\\n?【|$)`));
  return match ? normalized(match[1]) : '';
}

function structuredValue(value: string): string {
  const text = normalized(value);
  return /^(?:[／/]|無|不適用|none)$/i.test(text) ? '' : text;
}

function structuredIdentifier(value: string): string {
  return structuredValue(value).replace(/[\s\u200b-\u200d\ufeff]+/g, '');
}

/** Reads only the agreed labelled fields from a standardized Calendar note. */
export function calendarStructuredNote(description: string): CalendarStructuredNote {
  const text = calendarDescriptionText(description ?? '');
  const labels = ['講義版本', '冊別', '頁碼範圍', '單元進度', '重點', '來源日期', '識別碼'];
  return {
    material: structuredValue(bracketSection(text, '講義版本')),
    book: structuredValue(bracketSection(text, '冊別')),
    pageRange: structuredValue(bracketSection(text, '頁碼範圍')),
    unitProgress: structuredValue(bracketSection(text, '單元進度')),
    focus: structuredValue(bracketSection(text, '重點')),
    sourceDate: structuredValue(bracketSection(text, '來源日期')),
    identifier: structuredIdentifier(bracketSection(text, '識別碼')),
    hasStandardFields: labels.some(label => text.includes(`【${label}】`)),
  };
}

function progressFraction(value: string): [number | null, number | null] {
  const match = value.match(/(?:第\s*)?(\d+)\s*[／/]\s*(\d+)/);
  if (!match) return [null, null];
  const current = Number(match[1]);
  const total = Number(match[2]);
  return Number.isInteger(current) && Number.isInteger(total) && current > 0 && total >= current
    ? [current, total]
    : [null, null];
}

function calendarPageMappedBook(value: string): PageMappedBook | null {
  const exact = canonicalPageMappedBook(value);
  if (exact) return exact;
  const text = normalized(value);
  if (!text.includes('主題百匯')) return null;
  const englishCandidates = ([ENGLISH_TOPIC_READING_BOOK, ENGLISH_TOPIC_CLOZE_BOOK] as PageMappedBook[])
    .filter(book => bookTopics(book).some(topic => text.includes(topic)));
  return englishCandidates.length === 1 ? englishCandidates[0] : null;
}

function asciiDigits(value: string): string {
  return value.replace(/[０-９]/g, digit => String(digit.charCodeAt(0) - 0xff10));
}

function bookScopeRoundNumbers(title: string, unitProgress: string): number[] {
  const found = new Set<number>();
  const addRange = (startValue: string, endValue?: string) => {
    const start = Number(startValue);
    const end = Number(endValue || startValue);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end - start > 20) return;
    for (let value = start; value <= end; value += 1) found.add(value);
  };
  const text = asciiDigits(`${title}\n${unitProgress}`);
  for (const match of text.matchAll(/(?:第\s*)?([1-9]\d*)\s*(?:[–—~\-至到]\s*(?:第\s*)?([1-9]\d*))?\s*回/g)) {
    addRange(match[1], match[2]);
  }
  const plainProgress = normalized(asciiDigits(unitProgress));
  const plain = plainProgress.match(/^(?:第\s*)?([1-9]\d*)\s*(?:[–—~\-至到]\s*(?:第\s*)?([1-9]\d*))?\s*(?:回)?$/);
  if (plain) addRange(plain[1], plain[2]);
  return [...found];
}

function sourceDateDiffersFromEvent(sourceDate: string, eventDate: string): boolean {
  const source = sourceDate.match(/(?:\d{4}-)?(\d{1,2})[\/-](\d{1,2})/);
  const event = eventDate.match(/\d{4}-(\d{1,2})-(\d{1,2})/);
  if (!source || !event) return false;
  return Number(source[1]) !== Number(event[1]) || Number(source[2]) !== Number(event[2]);
}

function focusText(title: string, description: string): string {
  const titleSplit = title.split('：');
  if (titleSplit.length > 1) return normalized(titleSplit.slice(1).join('：'));
  return field(description, '重點');
}

function integrationPageItems(description: string) {
  const section = bracketSection(description, '講義／頁碼') || description;
  const items: Array<{ subject: '物理' | '化學' | '生物' | '地科'; start: number; end: number }> = [];
  const regex = /(物理|化學|生物|地科)(?:《123日的淬鍊》)?\s*p\.?\s*(\d+)\s*[–—~-]\s*(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(section))) {
    const start = Number(match[2]);
    const end = Number(match[3]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    items.push({
      subject: match[1] as '物理' | '化學' | '生物' | '地科',
      start: Math.min(start, end),
      end: Math.max(start, end),
    });
  }
  return items;
}

export function parseCalendarTask(row: CalendarTaskRow): ParsedCalendarTask {
  const rawTitle = normalized(row.title ?? '');
  const routed = rawTitle.match(/^(今日項目|今日|本週項目|本周項目|本週|本周)｜(.+)$/);
  const routedTitle = normalized(routed?.[2] ?? rawTitle);
  const makeupPrefix = routedTitle.match(/^(補做項目|補做)\s*[｜:：]\s*(.+)$/);
  const title = normalized(makeupPrefix?.[2] ?? routedTitle);
  const description = calendarDescriptionText(row.description ?? '');
  const note = calendarStructuredNote(description);
  const identifiedLecture = lectureIdentifierMatch(note.identifier);
  const structuredSourceDate = note.sourceDate;
  const deferredSource = /[（(]\s*原(?:定|訂)?\s*\d{1,2}\s*\/\s*\d{1,2}\s*[）)]/i.test(title)
    || /(?:【|\[)\s*延期來源\s*(?:】|\])/.test(description)
    || sourceDateDiffersFromEvent(structuredSourceDate, row.event_date);
  const makeup = Boolean(makeupPrefix)
    || /補做(?:項目)?\s*(?:\d|[｜:：]|$)/.test(title)
    || /(?:^|[｜＋+])\s*補(?:做)?\s*\d{1,2}\s*\/\s*\d{1,2}/.test(title)
    || deferredSource;
  const route: 'today' | 'week' | undefined = makeup
    ? 'today'
    : routed
    ? (/^(本週|本周)/.test(routed[1]) ? 'week' : 'today')
    : undefined;
  const base: ParsedBase = {
    eventKey: row.event_key,
    sourceEventId: row.source_event_id,
    ...(note.identifier ? { identifier: note.identifier } : {}),
    date: row.event_date,
    title,
    description,
    ...(route ? { route } : {}),
    ...(makeup ? { makeup: true } : {}),
    ...(note.unitProgress ? { unitProgress: note.unitProgress } : {}),
    ...(note.hasStandardFields ? { standardNote: true } : {}),
    ...((structuredSourceDate || sourceDateFrom(title, description))
      ? { sourceDate: structuredSourceDate || sourceDateFrom(title, description) }
      : {}),
  };

  const parsedMathHeading = mathHeading(title, description);
  const structuredMathMaterial = canonicalMathMaterial(note.material || (identifiedLecture?.kind === 'math' ? identifiedLecture.material : ''));
  const structuredMathBook = canonicalMathBook(note.book || (identifiedLecture?.kind === 'math' ? identifiedLecture.book : ''));
  const structuredMathNote = note.hasStandardFields
    && Boolean(structuredMathBook)
    && ['教學講義', '智慧型', '新關鍵', '新大滿貫', '複習週記'].includes(structuredMathMaterial);
  if (row.category === 'math' || parsedMathHeading || structuredMathNote || identifiedLecture?.kind === 'math') {
    const legacyProgress = description.match(/(?:【|\[)?\s*單元進度\s*(?:】|\])?\s*[:：]?\s*(\d+)\s*\/\s*(\d+)/);
    const [structuredProgress, structuredTotal] = note.pageRange
      ? [null, null]
      : progressFraction(note.unitProgress);
    const bookMatch = description.match(/冊別[:：]\s*([^\s]+)/);
    const [startPage, endPage] = note.hasStandardFields
      ? structuredPageRange(note.pageRange)
      : pageRange(`${title}\n${description}`);
    return {
      ...base,
      title: parsedMathHeading?.title ?? withoutOriginalDate(title),
      kind: 'math',
      material: structuredMathMaterial || (note.hasStandardFields ? '' : canonicalMathMaterial(field(description, '講義版本'))),
      book: structuredMathBook || canonicalMathBook(parsedMathHeading?.book || normalized(bookMatch?.[1] ?? title.split('｜')[0] ?? '')),
      progressIndex: structuredProgress ?? (note.hasStandardFields ? null : (legacyProgress ? Number(legacyProgress[1]) : null)),
      progressTotal: structuredTotal ?? (note.hasStandardFields ? null : (legacyProgress ? Number(legacyProgress[2]) : null)),
      startPage,
      endPage,
    };
  }

  if (row.category === 'ace' || /^ACE Reading(?:\s*[｜:：]\s*|\s+)第/i.test(title)) {
    return { ...base, title: withoutOriginalDate(title), kind: 'ace', rounds: roundsFromTitle(title) };
  }

  const listeningTests = listeningTestNumbers(`${title}\n${description}`);
  const listeningBookHeading = title.match(/^(?:英文\s*[｜:：]\s*)?(大考英聽A攻略)(?=$|\s|[｜:：])/)?.[1] ?? '';
  if ((row.category === 'listeningA' || isListeningTestBookTitle(listeningBookHeading)) && listeningTests.length) {
    return { ...base, title: withoutOriginalDate(title), kind: 'listeningA', tests: listeningTests };
  }

  if (row.category === 'gujin' || /^(?:國文\s*[｜:：]\s*)?古今悅讀一百(?:\s*[｜:：]\s*|\s+)第/.test(title)) {
    return { ...base, title: withoutOriginalDate(title), kind: 'gujin', rounds: roundsFromTitle(title) };
  }

  const azarSource = `${title}\n${note.material}\n${note.book}`;
  if (isAzarGrammarBookTitle(azarSource) || isAzarGrammarIdentifier(note.identifier)) {
    const [startPage, endPage] = note.hasStandardFields
      ? structuredPageRange(note.pageRange)
      : pageRange(`${title}\n${description}`);
    return {
      ...base,
      title: withoutOriginalDate(title),
      kind: 'azarGrammar',
      book: AZAR_GRAMMAR_BOOK_TITLE,
      startPage,
      endPage,
      chapters: azarGrammarChaptersForPages(startPage, endPage),
    };
  }

  const pageMappedBook = calendarPageMappedBook(`${title}\n${note.material}\n${note.book}\n${note.identifier}\n${description}`);
  if (pageMappedBook) {
    const subject = pageMappedBookSubject(pageMappedBook);
    if (subject === '英文' && pageMappedBookUsesScopeSelection(pageMappedBook)) {
      const scopeText = normalized(`${title}\n${note.unitProgress}\n${description}`);
      const topic = bookTopics(pageMappedBook).find(candidate => scopeText.includes(candidate)) ?? '';
      const knownRounds = topic ? bookDetailsForTopic(pageMappedBook, topic) : [];
      const requestedRoundNumbers = bookScopeRoundNumbers(title, note.unitProgress);
      const rounds = topic
        ? knownRounds.filter((round, index) => scopeText.includes(round) || requestedRoundNumbers.includes(index + 1))
        : [];
      return {
        ...base,
        title: withoutOriginalDate(title),
        kind: 'bookScope',
        subject,
        book: pageMappedBook,
        topic,
        rounds,
      };
    }
    const [startPage, endPage] = note.hasStandardFields
      ? structuredPageRange(note.pageRange)
      : pageRange(`${title}\n${description}`);
    return {
      ...base,
      title: withoutOriginalDate(title),
      kind: 'bookPages',
      subject,
      book: pageMappedBook,
      startPage,
      endPage,
    };
  }

  if (row.category === 'grammar' || /^英文文法(?:\s*[｜:：]\s*|\s+)/.test(title)) {
    const [startPage, endPage] = note.hasStandardFields
      ? structuredPageRange(note.pageRange)
      : pageRange(`${title}\n${description}`);
    return {
      ...base,
      kind: 'grammar',
      startPage,
      endPage,
      focus: note.focus || (note.hasStandardFields ? '' : field(description, '重點')),
    };
  }

  if (row.category === 'essentialGrammar' || /Essential Grammar in Use/i.test(title)) {
    return { ...base, route: route ?? 'today', kind: 'essentialGrammar', units: essentialGrammarUnits(title, description) };
  }

  if (row.category === 'writing' || /^英文寫作測驗(?:\s*[｜:：]\s*|\s+)第/.test(title)) {
    const rounds = roundsFromTitle(title);
    return {
      ...base,
      title: withoutOriginalDate(title),
      kind: 'writing',
      round: rounds[0] ?? null,
      focus: note.focus || (note.hasStandardFields ? '' : focusText(title, description)),
    };
  }

  const natural = title.match(/^(物理|化學|生物|地科)(?:\s*[｜:：]\s*|\s+)(.+)$/);
  const identifiedNatural = identifiedLecture?.kind === 'natural' ? identifiedLecture : null;
  if (row.category === 'natural' || natural || identifiedNatural) {
    if (natural || identifiedNatural) {
      const pageSource = `${title}\n${description}`;
      const [startPage, endPage] = note.hasStandardFields
        ? structuredPageRange(note.pageRange)
        : naturalPageRange(pageSource);
      return {
        ...base,
        kind: 'natural',
        subject: (natural?.[1] || identifiedNatural?.subject) as '物理' | '化學' | '生物' | '地科',
        topic: normalized(natural?.[2] || withoutOriginalDate(title)),
        material: note.material || identifiedNatural?.material || (note.hasStandardFields ? '' : naturalMaterial(pageSource)),
        startPage,
        endPage,
      };
    }
  }

  if (row.category === 'naturalIntegration' || /^自然整合｜/.test(title)) {
    return {
      ...base,
      kind: 'naturalIntegration',
      topic: normalized(title.replace(/^自然整合｜/, '')),
      review: note.focus || bracketSection(description, '複習') || bracketSection(description, '複習規則'),
      pages: note.pageRange || bracketSection(description, '講義／頁碼'),
      output: bracketSection(description, '指定輸出'),
      minimum: bracketSection(description, '最低完成版'),
      time: bracketSection(description, '時間'),
      pageItems: integrationPageItems(description),
    };
  }

  const fixedTemplate = calendarFixedTemplate(title);
  if (fixedTemplate) {
    const [startPage, endPage] = note.hasStandardFields
      ? structuredPageRange(note.pageRange)
      : pageRange(`${title}\n${description}`);
    return { ...base, kind: 'fixedTemplate', template: fixedTemplate, startPage, endPage };
  }

  const recognizedSubject = recognizableCalendarSubject(title);
  if (recognizedSubject) {
    return {
      ...base,
      route: route ?? 'today',
      kind: 'subjectItem',
      subject: recognizedSubject,
    };
  }

  // A route prefix alone is insufficient: fully unknown rows stay in Calendar.
  return { ...base, route: route ?? 'today', kind: 'other' };
}
