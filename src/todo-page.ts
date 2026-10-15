import './todo-page.css';

import { markRecordLocallyEdited } from './storage/recordSync.ts';
import { findCompletionItem } from './study/completionTree.ts';
import { readMaterialProgressRecords } from './study/materialProgress.ts';
import {
  normalizedOverdueSubject,
  OVERDUE_TASK_SUBJECTS,
  overdueHandledTasks,
  overdueSubjectIndex,
  overdueTaskTimer,
  overdueTasks,
  undoOverdueTaskAction,
  updateOverdueTaskCompletion,
  updateOverdueTaskMinutes,
  updateOverdueTaskProgress,
  updateOverdueTaskSkip,
  updateOverdueTaskTimer,
  type OverdueHandledEntry,
  type OverdueTaskEntry,
  type OverdueTaskSubject,
} from './study/overdueTasks.ts';
import {
  finishStudyTimer,
  formatStudyTimer,
  pauseStudyTimer,
  resetStudyTimer,
  startStudyTimer,
  studyTimerFromManualMinutes,
} from './study/studyTimer.ts';
import type { StudyRecord, StudyTimerState, StudyTimeMode } from './types.ts';

interface TodoActionTarget {
  recordDate: string;
  itemId: string;
  title: string;
}

interface TimerPointer {
  date: string;
  itemId: string;
  entryId?: string;
}

let activeSubject = normalizedOverdueSubject(location.hash.replace(/^#/, ''));
let recordPrefix = 'study-v11:guest:';
let records: StudyRecord[] = [];

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

function displayDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

function actionFromElement(target: HTMLElement): TodoActionTarget | null {
  const recordDate = target.dataset.recordDate;
  const itemId = target.dataset.itemId;
  if (!recordDate || !itemId) return null;
  return { recordDate, itemId, title: target.dataset.title || '未命名項目' };
}

function applyActionData(target: HTMLElement, entry: OverdueTaskEntry): void {
  target.dataset.recordDate = entry.recordDate;
  target.dataset.itemId = entry.itemId;
  target.dataset.title = entry.title;
}

function setError(message: string): void {
  const error = element<HTMLParagraphElement>('todoError');
  error.textContent = message;
  error.hidden = !message;
}

function setFeedback(message: string): void {
  const feedback = element<HTMLDivElement>('todoFeedback');
  element<HTMLSpanElement>('todoFeedbackText').textContent = message;
  feedback.hidden = !message;
}

function visibleEntries(entries: OverdueTaskEntry[]): OverdueTaskEntry[] {
  return activeSubject === 'all' ? entries : entries.filter(entry => entry.subject === activeSubject);
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

function createProgressEditor(entry: OverdueTaskEntry): HTMLElement | null {
  if (!entry.progress.length) return null;
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'todo-progress-editor';
  const legend = document.createElement('legend');
  legend.textContent = '進度';
  fieldset.append(legend);
  for (const progress of entry.progress) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = progress.checked;
    input.dataset.todoProgress = progress.key;
    applyActionData(input, entry);
    label.append(input, document.createTextNode(progress.label));
    fieldset.append(label);
  }
  return fieldset;
}

function createManualTimePanel(entry: OverdueTaskEntry): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'todo-time-panel todo-manual-panel';
  panel.hidden = entry.timer.mode !== 'manual';
  const minutes = document.createElement('input');
  minutes.type = 'number';
  minutes.min = '0';
  minutes.step = '0.1';
  minutes.inputMode = 'decimal';
  minutes.value = entry.minutes;
  minutes.dataset.todoMinutes = '';
  applyActionData(minutes, entry);
  minutes.setAttribute('aria-label', `${entry.title}的學習時間`);
  const unit = document.createElement('span');
  unit.textContent = '分鐘';
  panel.append(minutes, unit);
  return panel;
}

function timerButton(label: string, command: string, entry: OverdueTaskEntry): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.dataset.todoTimerAction = command;
  applyActionData(button, entry);
  return button;
}

function createTimerPanel(entry: OverdueTaskEntry): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'todo-time-panel todo-timer-panel';
  panel.hidden = entry.timer.mode !== 'timer';
  const display = document.createElement('strong');
  display.className = 'todo-timer-display';
  display.textContent = formatStudyTimer(entry.timer);
  display.dataset.todoTimerDisplay = '';
  applyActionData(display, entry);
  const toggle = timerButton(entry.timer.startedAt === null ? '開始' : '暫停', 'toggle', entry);
  toggle.classList.add('todo-timer-primary');
  panel.append(display, toggle, timerButton('完成計時', 'finish', entry), timerButton('歸零', 'reset', entry));
  return panel;
}

function createTimeEditor(entry: OverdueTaskEntry): HTMLElement {
  const editor = document.createElement('section');
  editor.className = 'todo-time-editor';
  const header = document.createElement('div');
  header.className = 'todo-time-header';
  const label = document.createElement('span');
  label.textContent = '學習時間';
  const modes = document.createElement('div');
  modes.className = 'todo-time-modes';
  modes.dataset.active = entry.timer.mode;
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', `${entry.title}的時間輸入方式`);
  for (const mode of ['manual', 'timer'] as StudyTimeMode[]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = mode === 'manual' ? '手動' : '計時';
    button.dataset.todoTimeMode = mode;
    button.setAttribute('aria-pressed', String(entry.timer.mode === mode));
    applyActionData(button, entry);
    modes.append(button);
  }
  header.append(label, modes);
  editor.append(header, createManualTimePanel(entry), createTimerPanel(entry));
  return editor;
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
  const details = document.createElement('dl');
  details.className = 'todo-record-grid';
  for (const detail of entry.details) {
    const label = document.createElement('dt');
    label.textContent = detail.label;
    const value = document.createElement('dd');
    value.textContent = detail.value;
    details.append(label, value);
  }
  main.append(details);
  const progress = createProgressEditor(entry);
  if (progress) main.append(progress);

  const controls = document.createElement('div');
  controls.className = 'todo-card-controls';
  controls.append(createTimeEditor(entry));
  const dateField = document.createElement('label');
  dateField.className = 'todo-control-field';
  const dateLabel = document.createElement('span');
  dateLabel.textContent = '完成日期';
  const completionDate = document.createElement('input');
  completionDate.type = 'date';
  completionDate.value = localDateKey();
  completionDate.dataset.todoCompletionDate = '';
  completionDate.setAttribute('aria-label', `${entry.title}的完成日期`);
  dateField.append(dateLabel, completionDate);
  const actions = document.createElement('div');
  actions.className = 'todo-actions';
  const complete = document.createElement('button');
  complete.type = 'button';
  complete.className = 'todo-complete';
  complete.textContent = '完成';
  applyActionData(complete, entry);
  complete.setAttribute('aria-label', `標記完成 ${entry.title}`);
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'todo-skip';
  skip.textContent = '跳過';
  applyActionData(skip, entry);
  skip.setAttribute('aria-label', `跳過 ${entry.title}`);
  actions.append(complete, skip);
  controls.append(dateField, actions);
  article.append(main, controls);
  return article;
}

function createHandledRow(entry: OverdueHandledEntry): HTMLElement {
  const row = document.createElement('article');
  row.className = `todo-history-item subject-${entry.subject}`;
  const content = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = entry.title;
  const meta = document.createElement('span');
  meta.textContent = `${entry.subjectLabel}｜原排程 ${displayDate(entry.recordDate)}｜${entry.kind === 'complete' ? '已完成' : '已跳過'}於 ${displayDateTime(entry.handledAt)}`;
  content.append(title, meta);
  const undo = document.createElement('button');
  undo.type = 'button';
  undo.className = 'todo-history-undo';
  undo.textContent = '復原';
  undo.dataset.recordDate = entry.recordDate;
  undo.dataset.itemId = entry.itemId;
  undo.dataset.title = entry.title;
  undo.setAttribute('aria-label', `復原 ${entry.title}`);
  row.append(content, undo);
  return row;
}

function renderHistory(): void {
  const entries = overdueHandledTasks(records);
  element<HTMLElement>('todoHistoryCount').textContent = `${entries.length} 項可復原`;
  element<HTMLDivElement>('todoHistoryList').replaceChildren(...entries.map(createHandledRow));
  element<HTMLParagraphElement>('todoHistoryEmpty').hidden = entries.length > 0;
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
  element<HTMLElement>('todoSummary').textContent = activeSubject === 'all'
    ? `共有 ${entries.length} 項待辦`
    : `目前科目 ${filtered.length} 項｜全部 ${entries.length} 項`;
  element<HTMLDivElement>('todoList').replaceChildren(...filtered.map(createTodoCard));
  element<HTMLParagraphElement>('todoEmpty').hidden = filtered.length > 0;
  renderHistory();
}

function saveRecordChange(
  action: TodoActionTarget,
  update: (record: StudyRecord) => StudyRecord | null,
): boolean {
  const index = records.findIndex(record => record.date === action.recordDate);
  if (index < 0) return false;
  const previous = records[index];
  const updated = update(previous);
  if (!updated) return false;
  const edited = markRecordLocallyEdited(updated, previous);
  localStorage.setItem(`${recordPrefix}${action.recordDate}`, JSON.stringify(edited));
  records[index] = edited;
  return true;
}

function timerPointerKey(): string {
  return `${recordPrefix}active-timer`;
}

function readTimerPointer(): TimerPointer | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(timerPointerKey()) || 'null') as Partial<TimerPointer> | null;
    return parsed && typeof parsed.date === 'string' && typeof parsed.itemId === 'string'
      ? {
        date: parsed.date,
        itemId: parsed.itemId,
        ...(typeof parsed.entryId === 'string' ? { entryId: parsed.entryId } : {}),
      }
      : null;
  } catch {
    return null;
  }
}

function writeTimerPointer(pointer: TimerPointer | null): void {
  if (pointer) localStorage.setItem(timerPointerKey(), JSON.stringify(pointer));
  else localStorage.removeItem(timerPointerKey());
}

function sameTimerTarget(pointer: TimerPointer | null, action: TodoActionTarget): boolean {
  return pointer?.date === action.recordDate && pointer.itemId === action.itemId && !pointer.entryId;
}

function currentTimer(action: TodoActionTarget): StudyTimerState | null {
  const record = records.find(candidate => candidate.date === action.recordDate);
  return record ? overdueTaskTimer(record, action.itemId) : null;
}

function saveTimer(action: TodoActionTarget, state: StudyTimerState, minutes?: string): boolean {
  return saveRecordChange(action, record => updateOverdueTaskTimer(record, action.itemId, state, minutes));
}

function pauseActiveTimer(except?: TodoActionTarget): void {
  const pointer = readTimerPointer();
  if (!pointer || (except && sameTimerTarget(pointer, except))) return;
  const action = { recordDate: pointer.date, itemId: pointer.itemId, title: '目前計時項目' };
  if (pointer.entryId) {
    saveRecordChange(action, function pauseMagazineTimer(record): StudyRecord | null {
      const updated = JSON.parse(JSON.stringify(record)) as StudyRecord;
      const item = findCompletionItem(updated.items, pointer.itemId);
      const entries = Array.isArray(item?.f?.entries) ? item.f.entries : [];
      const entry = entries.find(candidate => (
        candidate && typeof candidate === 'object' && String(candidate.id ?? '') === pointer.entryId
      ));
      if (!entry || typeof entry !== 'object') return null;
      const state = entry.timeTracking;
      entry.timeTracking = pauseStudyTimer(state);
      return updated;
    });
  } else {
    const state = currentTimer(action);
    if (state && state.startedAt !== null) saveTimer(action, pauseStudyTimer(state));
  }
  writeTimerPointer(null);
}

function skipTask(action: TodoActionTarget): void {
  try {
    pauseActiveTimer();
    const saved = saveRecordChange(action, record => updateOverdueTaskSkip(record, action.itemId, localDateKey()));
    if (!saved) return setError('找不到原始項目，請重新讀取後再試。');
    setError('');
    setFeedback(`已跳過「${action.title}」。原排程日期仍保留未完成紀錄，可在下方「最近處理」清單復原。`);
    render();
  } catch {
    setError('無法保存跳過狀態，請確認瀏覽器儲存權限。');
  }
}

function completeTask(action: TodoActionTarget, completionDate: string): void {
  try {
    if (sameTimerTarget(readTimerPointer(), action)) {
      const state = currentTimer(action);
      if (state && state.startedAt !== null) saveTimer(action, pauseStudyTimer(state));
      writeTimerPointer(null);
    }
    const saved = saveRecordChange(action, record => (
      updateOverdueTaskCompletion(record, action.itemId, true, completionDate)
    ));
    if (!saved) return setError('找不到原始項目或完成日期無效，請重新讀取後再試。');
    setError('');
    setFeedback(`已完成「${action.title}」，完成日期為 ${completionDate}。可在下方清單復原。`);
    render();
  } catch {
    setError('無法保存完成狀態，請確認瀏覽器儲存權限。');
  }
}

function saveMinutes(action: TodoActionTarget, minutes: string): void {
  try {
    const saved = saveRecordChange(action, record => updateOverdueTaskMinutes(record, action.itemId, minutes));
    if (!saved) return setError('學習時間必須是 0 以上的數字。');
    setError('');
    setFeedback(`已將「${action.title}」的學習時間保存為 ${minutes || '—'} 分鐘。`);
  } catch {
    setError('無法保存學習時間，請確認瀏覽器儲存權限。');
  }
}

function saveProgress(action: TodoActionTarget, field: string, checked: boolean): void {
  try {
    const saved = saveRecordChange(action, record => (
      updateOverdueTaskProgress(record, action.itemId, field, checked)
    ));
    if (!saved) return setError('找不到要更新的進度欄位，請重新讀取後再試。');
    setError('');
    setFeedback(`已同步「${action.title}」的進度。`);
  } catch {
    setError('無法保存進度，請確認瀏覽器儲存權限。');
  }
}

function switchTimeMode(action: TodoActionTarget, mode: StudyTimeMode, manualMinutes: string): void {
  const current = currentTimer(action);
  if (!current || current.mode === mode) return;
  if (mode === 'timer') {
    if (!saveTimer(action, studyTimerFromManualMinutes(manualMinutes))) return;
  } else {
    const paused = current.startedAt === null ? current : pauseStudyTimer(current);
    if (!saveTimer(action, { ...paused, mode: 'manual' })) return;
    if (sameTimerTarget(readTimerPointer(), action)) writeTimerPointer(null);
  }
  setError('');
  render();
}

function runTimerAction(action: TodoActionTarget, command: string): void {
  const current = currentTimer(action);
  if (!current) return;
  if (command === 'toggle') {
    if (current.startedAt === null) {
      pauseActiveTimer(action);
      if (saveTimer(action, startStudyTimer(current))) {
        writeTimerPointer({ date: action.recordDate, itemId: action.itemId });
      }
    } else {
      saveTimer(action, pauseStudyTimer(current));
      writeTimerPointer(null);
    }
  } else if (command === 'finish') {
    const result = finishStudyTimer(current);
    saveTimer(action, result.state, result.minutes);
    if (sameTimerTarget(readTimerPointer(), action)) writeTimerPointer(null);
    setFeedback(`已完成「${action.title}」的計時並保存 ${result.minutes || '—'} 分鐘。`);
  } else if (command === 'reset') {
    saveTimer(action, resetStudyTimer(), '');
    if (sameTimerTarget(readTimerPointer(), action)) writeTimerPointer(null);
  }
  setError('');
  render();
}

function undoHandledTask(action: TodoActionTarget): void {
  try {
    const saved = saveRecordChange(action, record => undoOverdueTaskAction(record, action.itemId, localDateKey()));
    if (!saved) return setError('此項目的復原期限可能已過，或原始項目已變更。');
    setError('');
    setFeedback(`已復原「${action.title}」，項目重新列入待辦。`);
    render();
  } catch {
    setError('無法復原項目，請確認瀏覽器儲存權限。');
  }
}

function refreshTimerDisplays(): void {
  document.querySelectorAll<HTMLElement>('[data-todo-timer-display]').forEach(function refresh(display): void {
    const action = actionFromElement(display);
    const state = action ? currentTimer(action) : null;
    if (state) display.textContent = formatStudyTimer(state);
  });
}

function load(): void {
  try {
    const result = readMaterialProgressRecords(localStorage);
    records = result.records;
    recordPrefix = result.prefix;
    const source = result.prefix.startsWith('study-v11:user:') ? '目前登入帳號的本機同步資料' : '訪客本機資料';
    element<HTMLParagraphElement>('recordSource').textContent = `${source}｜已讀取 ${result.records.length} 天紀錄`;
    setError('');
    setFeedback('');
    render();
  } catch {
    records = [];
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
  if (focus) element<HTMLDivElement>('subjectSwitch')
    .querySelector<HTMLButtonElement>(`[data-subject="${subject}"]`)?.focus();
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

element<HTMLDivElement>('todoList').addEventListener('click', function handleTodoClick(event): void {
  const target = (event.target as HTMLElement).closest<HTMLElement>(
    '.todo-skip, .todo-complete, [data-todo-time-mode], [data-todo-timer-action]',
  );
  if (!target) return;
  const action = actionFromElement(target);
  if (!action) return;
  if (target.classList.contains('todo-skip')) return skipTask(action);
  if (target.classList.contains('todo-complete')) {
    const date = target.closest<HTMLElement>('.todo-card')
      ?.querySelector<HTMLInputElement>('[data-todo-completion-date]')?.value ?? '';
    return completeTask(action, date);
  }
  if (target.dataset.todoTimeMode) {
    const minutes = target.closest<HTMLElement>('.todo-card')
      ?.querySelector<HTMLInputElement>('[data-todo-minutes]')?.value ?? '';
    return switchTimeMode(action, target.dataset.todoTimeMode as StudyTimeMode, minutes);
  }
  if (target.dataset.todoTimerAction) runTimerAction(action, target.dataset.todoTimerAction);
});

element<HTMLDivElement>('todoList').addEventListener('change', function handleTodoChange(event): void {
  const input = (event.target as HTMLElement).closest<HTMLInputElement>('[data-todo-minutes]');
  if (input) {
    const action = actionFromElement(input);
    if (action) saveMinutes(action, input.value);
    return;
  }
  const progress = (event.target as HTMLElement).closest<HTMLInputElement>('[data-todo-progress]');
  if (progress) {
    const action = actionFromElement(progress);
    if (action) saveProgress(action, progress.dataset.todoProgress || '', progress.checked);
  }
});

element<HTMLDivElement>('todoHistoryList').addEventListener('click', function handleUndo(event): void {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.todo-history-undo');
  const action = button ? actionFromElement(button) : null;
  if (action) undoHandledTask(action);
});

element<HTMLButtonElement>('refreshTodo').addEventListener('click', load);
window.addEventListener('storage', load);
window.addEventListener('hashchange', function syncHash(): void {
  activeSubject = normalizedOverdueSubject(location.hash.replace(/^#/, ''));
  render();
});

setInterval(refreshTimerDisplays, 1000);
setInterval(renderHistory, 60_000);
load();
