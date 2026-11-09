import type { CalendarStudyTask } from './calendarStudyTaskService.ts';
import { resolveMathCalendarPlan } from '../../calendar/mathPlan.ts';
import { normalizedGrammarUnitTitle, selectGrammarPlan } from '../../calendar/grammarPlan.ts';
import { resolveNaturalCalendarPlan } from '../../calendar/naturalPlan.ts';
import { CALENDAR_MATH_PLAN } from '../../data/mathCalendar.ts';
import { CALENDAR_GRAMMAR_PLAN, CALENDAR_NATURAL_RECOMMENDED_PAGES } from '../../data/calendarReferencePlans.ts';
import { AZAR_GRAMMAR_BOOK_TITLE } from '../../data/azarGrammar.ts';
import { canonicalPageMappedBook, pageMappedBookSocialSubject } from '../../data/bookPageMaps.ts';
import { LISTENING_TEST_BOOK_TITLE } from '../../data/englishBooks.ts';
import { isInteractiveStudyItem } from '../../study/interactiveTasks.ts';
import type { StudyItem, StudyItemFields, CalendarNaturalIntegrationEntry } from '../../types.ts';

export function calendarIdentifierToken(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  const readable = value.replace(/[^A-Za-z0-9_-]/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'item';
  return `${readable}_${(hash >>> 0).toString(36)}`;
}

function scopeItemType(subject: string): string {
  if (subject === '英文') return 'extra';
  if (subject === '社會') return 'socialStudy';
  return 'general';
}

/** One task may own several independently completed chapters, rounds or science subjects. */
export function calendarScheduleItems(task: CalendarStudyTask): StudyItem[] {
  const p = task;
  const token = p.identifier ? calendarIdentifierToken(p.identifier)
    : String(p.sourceEventId || p.eventKey || 'event').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
  const items: StudyItem[] = [];
  function add(key: string, type: string, title: string, fields: StudyItemFields): StudyItem {
    const item: StudyItem = { id: `preset-${p.date}-${key}`, presetKey: key, templatePresetKey: key,
      source: 'preset', type, title, description: `Google Calendar API：${p.title}${p.description ? `｜${p.description}` : ''}`,
      required: p.route !== 'week' && !p.makeup, done: false, minutes: '', f: {
        ...fields, calendarEventKey: p.eventKey, calendarEventId: p.sourceEventId,
        calendarIdentifier: p.identifier || '', calendarSourceDate: p.sourceDate || p.date,
        calendarRoute: p.makeup ? 'today' : p.route || 'today', calendarMakeup: p.makeup,
      } };
    if (isInteractiveStudyItem(item)) item.required = false;
    items.push(item);
    return item;
  }
  function pageFields(book: string, start: unknown, end: unknown): StudyItemFields {
    return { title: book, book, start: start == null ? '' : String(start), end: end == null ? '' : String(end) };
  }
  switch (p.kind) {
    case 'pageScope':
      add(`${canonicalPageMappedBook(p.book) ? 'cal_book_' : 'cal_scope_'}${token}`, scopeItemType(p.subject), p.title,
        { ...pageFields(p.book, p.startPage, p.endPage), subject: p.subject, scopeKind: 'pages', calendarUnitProgress: p.unitProgress || p.title });
      break;
    case 'numberedScope':
      p.scopes.forEach(function numbered(scope, index): void {
        const fields: StudyItemFields = { title: p.book, book: p.book, subject: p.subject, scopeKind: scope.kind,
          calendarUnitProgress: p.unitProgress || p.title };
        fields[scope.kind === 'unit' ? 'unitStart' : 'round'] = scope.start;
        fields[scope.kind === 'unit' ? 'unitEnd' : 'roundEnd'] = scope.end;
        add(`cal_scope_${token}${p.scopes.length > 1 ? `_${index}` : ''}`, scopeItemType(p.subject), p.title, fields);
      });
      break;
    case 'ace':
    case 'listeningA':
    case 'gujin': {
      const values = p.kind === 'listeningA' ? p.tests : p.rounds;
      const prefix = { ace: 'cal_ace_', listeningA: 'cal_listening_a_', gujin: 'cal_gujin_' }[p.kind];
      const book = { ace: 'ACE Reading', listeningA: LISTENING_TEST_BOOK_TITLE, gujin: '古今悅讀一百' }[p.kind];
      for (const round of values) add(`${prefix}${round}_${token}`, p.kind === 'gujin' ? 'chineseReading' : 'extra',
        `${p.kind === 'gujin' ? '國文' : '英文'}｜${book} 第 ${round} 回`, { title: book, round: String(round), ...(p.kind === 'gujin' ? { kind: 'reading' } : {}) });
      break;
    }
    case 'essentialGrammar':
    case 'bookUnits': {
      const book = p.kind === 'essentialGrammar' ? 'Essential Grammar in Use' : p.book;
      for (const unit of p.units.length ? p.units : ['']) {
        const key = p.kind === 'essentialGrammar' ? `cal_essential_grammar_${unit}_${token}`
          : `cal_book_${token}${p.units.length > 1 ? `_unit_${unit}` : ''}`;
        add(key, 'extra', `英文｜${book}`, { title: book, book, unit: String(unit), unitStart: String(unit), unitEnd: String(unit), calendarBookRangeLocked: true });
      }
      break;
    }
    case 'bookPages': {
      const fields: StudyItemFields = { ...pageFields(p.book, p.startPage, p.endPage ?? p.startPage),
        kind: 'book', calendarBookRangeLocked: true };
      if (p.subject === '社會') {
        const subject = p.socialSubject || pageMappedBookSocialSubject(p.book) || '社會';
        const material = p.book.replace(/^(?:公民|歷史|地理)｜/, '');
        fields.subject = subject;
        add(`cal_book_${token}`, 'socialStudy', `${subject}｜${material}`, fields);
      } else {
        add(`cal_book_${token}`, p.subject === '英文' ? 'extra' : 'chineseReading', `${p.subject}｜${p.book}`, fields);
      }
      break;
    }
    case 'bookScope':
      (p.rounds.length ? p.rounds : ['']).forEach(function scope(round, index): void {
        const suffix = calendarIdentifierToken(`${p.topic || 'unknown'}_${round || 'unknown'}_${index}`);
        add(`cal_book_${token}_${suffix}`, 'extra', `英文｜${p.book}`,
          { title: p.book, book: p.book, topic: p.topic, round: String(round), calendarBookRangeLocked: true });
      });
      break;
    case 'azarGrammar':
      if (p.chapters.length) for (const chapter of p.chapters) add(`cal_azar_${token}_ch${chapter.number}`, 'extra',
        `${AZAR_GRAMMAR_BOOK_TITLE}｜Ch.${chapter.number} ${chapter.title}`, { title: AZAR_GRAMMAR_BOOK_TITLE,
          azarChapterNumber: chapter.number, azarChapterTitle: chapter.title, azarChapterLabel: chapter.label,
          start: String(Math.max(chapter.start, p.startPage || chapter.start)), end: String(Math.min(chapter.end, p.endPage || chapter.end)), calendarBookRangeLocked: false });
      else add(`cal_azar_${token}`, 'extra', `英文｜${AZAR_GRAMMAR_BOOK_TITLE}`, pageFields(AZAR_GRAMMAR_BOOK_TITLE, p.startPage, p.endPage));
      break;
    case 'writing':
      if (p.round) add(`cal_writing_${p.round}_${token}`, 'extra', `英文｜英文寫作測驗 第 ${p.round} 回`,
        { title: '英文寫作測驗', round: String(p.round), calendarFocus: p.focus });
      break;
    case 'grammar': {
      const plan = selectGrammarPlan(p.title, p.unitProgress, p.startPage, p.endPage, Object.values(CALENDAR_GRAMMAR_PLAN));
      add(`cal_grammar_${token}`, 'extra', `英文｜英文文法總複習｜${normalizedGrammarUnitTitle(p.title)}`,
        { ...pageFields('英文文法總複習講義', p.startPage ?? plan?.start, p.endPage ?? plan?.end),
          calendarUnitProgress: p.unitProgress || '', calendarGrammarTitle: normalizedGrammarUnitTitle(p.title), calendarFocus: p.focus || plan?.focus || '' });
      break;
    }
    case 'math': {
      const plan = resolveMathCalendarPlan(p, CALENDAR_MATH_PLAN);
      add(`cal_math_${token}`, 'mathStudy', '數學講義：進度', { material: p.material || plan?.material || '教學講義', book: p.book || plan?.book || '',
        start: String(p.startPage || plan?.start || ''), end: String(p.endPage || plan?.end || ''),
        calendarPlanTitle: p.title, calendarUnitProgress: p.unitProgress || '', calendarMathMaterialLocked: true,
        calendarSuggestedStart: p.startPage || plan?.start || '', calendarSuggestedEnd: p.endPage || plan?.end || '',
        calendarSuggestedMaterial: p.material || plan?.material || '教學講義', calendarSuggestedBook: p.book || plan?.book || '' });
      break;
    }
    case 'natural': {
      const fallback = Object.values(CALENDAR_NATURAL_RECOMMENDED_PAGES).find(plan => plan.label === p.topic);
      const plan = resolveNaturalCalendarPlan(p, fallback);
      const range = plan?.ranges.length === 1 ? plan.ranges[0] : null;
      add(`cal_natural_${token}`, 'scienceReview', '自然', { subject: p.subject, material: p.material || plan?.material || '123日的淬鍊',
        calendarTopic: p.title, ...(range ? { start: String(range[0]), end: String(range[1]) } : {}) });
      break;
    }
    case 'naturalIntegration': {
      const item = add(`cal_natural_${token}`, 'scienceReview', '自然', { subject: '混合', calendarNaturalIntegration: true,
        calendarIntegrationReview: p.review, calendarIntegrationPages: p.pages, calendarIntegrationOutput: p.output,
        calendarIntegrationMinimum: p.minimum, calendarIntegrationTime: p.time });
      item.f.calendarIntegrationEntries = p.pageItems.map(function science(page): CalendarNaturalIntegrationEntry {
        return { id: `${item.id}-${page.subject}`, type: 'scienceReview', title: page.subject, done: false,
          required: true, minutes: '', subject: page.subject, material: '123日的淬鍊', ranges: [[page.start, page.end]],
          calendarIntegrationChild: true, f: { subject: page.subject, material: '123日的淬鍊', start: String(page.start), end: String(page.end) } };
      });
      break;
    }
    case 'fixedTemplate': {
      const types: Record<string, string> = { mathStudy: 'mathStudy', mathPractice: 'mathPractice', interactiveDaily: 'interactiveDaily',
        fixedMagazine: 'magazine', englishMixedWriting: 'englishMixedWriting', englishMockTimed: 'mock', englishMockCorrection: 'mock', englishLightReading: 'extra' };
      add(`cal_fixed_${p.template}_${token}`, types[p.template] || 'general', p.title, { calendarFixedTemplate: p.template,
        ...(p.startPage ? { start: String(p.startPage), end: String(p.endPage || p.startPage) } : {}) });
      break;
    }
    case 'subjectItem':
      add(`cal_subject_${token}`, 'general', p.title, { subject: p.subject });
      break;
  }
  return items;
}
