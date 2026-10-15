import './todo-page.css';

import { markRecordLocallyEdited } from './storage/recordSync.ts';
import { readMaterialProgressRecords } from './study/materialProgress.ts';
import {
  normalizedOverdueSubject,
  OVERDUE_TASK_SUBJECTS,
  overdueSubjectIndex,
  overdueTasks,
  updateOverdueTaskSkip,
  type OverdueTaskEntry,
  type OverdueTaskSubject,
} from './study/overdueTasks.ts';
import type { StudyRecord } from './types.ts';

interface UndoSkipAction {
  recordDate: string;
  itemId: string;
  title: string;
}

let activeSubject = normalizedOverdueSubject(location.hash.replace(/^#/, ''));
let recordPrefix = 'study-v11:guest:';
let records: StudyRecord[] = [];
let lastSkipped: UndoSkipAction | null = null;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element: ${id}`);
  return found as T;
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function displayDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${Number(match[2])}/${Number(match[3])}` : value;
}

function setError(message: string): void {
  const error = element<HTMLParagraphElement>('todoError');
  error.textContent = message;
  error.hidden = !message;
}

function setFeedback(message: string, canUndo = false): void {
  const feedback = element<HTMLDivElement>('todoFeedback');
  element<HTMLSpanElement>('todoFeedbackText').textContent = message;
  element<HTMLButtonElement>('undoSkip').hidden = !canUndo;
  feedback.hidden = !message;
}

function visibleEntries(entries: OverdueTaskEntry[]): OverdueTaskEntry[] {
  if (activeSubject === 'all') return entries;
  return entries.filter(function hasActiveSubject(entry): boolean {
    return entry.subject === activeSubject;
  });
}

function createMeta(entry: OverdueTaskEntry): HTMLElement {
  const meta = document.createElement('div');
  meta.className = 'todo-card-meta';

  const subject = document.createElement('span');
  subject.className = 'todo-subject';
  subject.textContent = entry.subjectLabel;

  const date = document.createElement('span');
  date.textContent = `原排程 ${displayDate(entry.recordDate)}`;

  const overdue = document.createElement('span');
  overdue.className = 'todo-overdue';
  overdue.textContent = `逾期 ${entry.daysOverdue} 天`;
  meta.append(subject, date, overdue);
  return meta;
}

function createTodoCard(entry: OverdueTaskEntry): HTMLElement {
  const article = document.createElement('article');
  article.className = `todo-card subject-${entry.subject}`;

  const main = document.createElement('div');
  main.className = 'todo-card-main';
  main.append(createMeta(entry));

  const title = document.createElement('h3');
  title.textContent = entry.title;
  main.append(title);

  if (entry.description) {
    const description = document.createElement('p');
    description.className = 'todo-description';
    description.textContent = entry.description;
    main.append(description);
  }

  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'todo-skip';
  skip.textContent = '跳過';
  skip.dataset.recordDate = entry.recordDate;
  skip.dataset.itemId = entry.itemId;
  skip.dataset.title = entry.title;
  skip.setAttribute('aria-label', `跳過 ${entry.title}`);
  article.append(main, skip);
  return article;
}

function render(): void {
  const entries = overdueTasks(records, localDateKey());
  const filtered = visibleEntries(entries);
  document.body.dataset.subject = activeSubject;

  const switcher = element<HTMLDivElement>('subjectSwitch');
  switcher.dataset.active = String(overdueSubjectIndex(activeSubject));
  switcher.querySelectorAll<HTMLButtonElement>('[data-subject]').forEach(function updateTab(button): void {
    const selected = button.dataset.subject === activeSubject;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });

  const summary = activeSubject === 'all'
    ? `共有 ${entries.length} 項待辦`
    : `目前科目 ${filtered.length} 項｜全部 ${entries.length} 項`;
  element<HTMLElement>('todoSummary').textContent = summary;
  element<HTMLDivElement>('todoList').replaceChildren(...filtered.map(createTodoCard));
  element<HTMLParagraphElement>('todoEmpty').hidden = filtered.length > 0;
}

function saveSkippedState(action: UndoSkipAction, skippedOn: string | null): boolean {
  const recordIndex = records.findIndex(function hasDate(record): boolean {
    return record.date === action.recordDate;
  });
  if (recordIndex < 0) return false;
  const previous = records[recordIndex];
  const updated = updateOverdueTaskSkip(previous, action.itemId, skippedOn);
  if (!updated) return false;
  const edited = markRecordLocallyEdited(updated, previous);
  localStorage.setItem(`${recordPrefix}${action.recordDate}`, JSON.stringify(edited));
  records[recordIndex] = edited;
  return true;
}

function skipTask(action: UndoSkipAction): void {
  try {
    if (!saveSkippedState(action, localDateKey())) {
      setError('找不到原始項目，請重新讀取後再試。');
      return;
    }
    lastSkipped = action;
    setError('');
    setFeedback(`已跳過「${action.title}」。原排程日期仍保留未完成紀錄。`, true);
    render();
  } catch {
    setError('無法保存跳過狀態，請確認瀏覽器儲存權限。');
  }
}

function undoSkip(): void {
  if (!lastSkipped) return;
  try {
    if (!saveSkippedState(lastSkipped, null)) {
      setError('找不到原始項目，請重新讀取後再試。');
      return;
    }
    const title = lastSkipped.title;
    lastSkipped = null;
    setError('');
    setFeedback(`已復原「${title}」，項目重新列入待辦。`);
    render();
  } catch {
    setError('無法復原跳過狀態，請確認瀏覽器儲存權限。');
  }
}

function load(): void {
  try {
    const result = readMaterialProgressRecords(localStorage);
    records = result.records;
    recordPrefix = result.prefix;
    lastSkipped = null;
    const source = result.prefix.startsWith('study-v11:user:') ? '目前登入帳號的本機同步資料' : '訪客本機資料';
    element<HTMLParagraphElement>('recordSource').textContent = `${source}｜已讀取 ${result.records.length} 天紀錄`;
    setError('');
    setFeedback('');
    render();
  } catch {
    records = [];
    lastSkipped = null;
    element<HTMLParagraphElement>('recordSource').textContent = '無法讀取本機紀錄';
    setFeedback('');
    setError('瀏覽器目前不允許存取 Tracker 的本機資料，請回到 Tracker 確認瀏覽器儲存權限。');
    render();
  }
}

function selectSubject(subject: OverdueTaskSubject, focus = false): void {
  activeSubject = subject;
  history.replaceState(null, '', `${location.pathname}${location.search}#${subject}`);
  render();
  if (focus) {
    element<HTMLDivElement>('subjectSwitch')
      .querySelector<HTMLButtonElement>(`[data-subject="${subject}"]`)?.focus();
  }
}

element<HTMLDivElement>('subjectSwitch').addEventListener('click', function switchSubject(event): void {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-subject]');
  if (button) selectSubject(normalizedOverdueSubject(button.dataset.subject));
});

element<HTMLDivElement>('subjectSwitch').addEventListener('keydown', function moveSubject(event): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const current = overdueSubjectIndex(activeSubject);
  let next = current;
  if (event.key === 'ArrowLeft') next = (current - 1 + OVERDUE_TASK_SUBJECTS.length) % OVERDUE_TASK_SUBJECTS.length;
  if (event.key === 'ArrowRight') next = (current + 1) % OVERDUE_TASK_SUBJECTS.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = OVERDUE_TASK_SUBJECTS.length - 1;
  selectSubject(OVERDUE_TASK_SUBJECTS[next], true);
});

element<HTMLDivElement>('todoList').addEventListener('click', function handleSkip(event): void {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.todo-skip');
  const recordDate = button?.dataset.recordDate;
  const itemId = button?.dataset.itemId;
  if (!recordDate || !itemId) return;
  skipTask({ recordDate, itemId, title: button.dataset.title || '未命名項目' });
});

element<HTMLButtonElement>('undoSkip').addEventListener('click', undoSkip);
element<HTMLButtonElement>('refreshTodo').addEventListener('click', load);
window.addEventListener('storage', load);
window.addEventListener('hashchange', function syncHash(): void {
  activeSubject = normalizedOverdueSubject(location.hash.replace(/^#/, ''));
  render();
});

load();
