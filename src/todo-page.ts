import './todo-page.css';

import { saveLocalRecordEdit } from './application/records/localRecordEdits.ts';
import {
  changeStudyTimer, resolveStudyTimerTarget, sameStudyTimerTarget, setStudyTimerTargetState,
  studyTimerTargetState, studyTimerToggleLabel, switchStudyTimerMode,
  type StudyTimerPointer,
} from './application/timer/studyTimerController.ts';
import { ACTIVE_RECORD_PREFIX_KEY } from './storage/local.ts';
import { TodoDrafts, type TodoDraftField } from './ui/todoDrafts.ts';
import { updateTodoList } from './ui/keyedTodoList.ts';
import { readMaterialProgressRecords } from './study/materialProgress.ts';
import { normalizedOverdueItemFilter, overdueEntriesForItem, overdueItemFilterForSubject, overdueItemOptions } from './study/overdueItemFilter.ts';
import {
  normalizedOverduePeriod, OVERDUE_PERIODS, overdueEntriesForPeriod, overduePeriodIndex, overduePeriodRange,
  type OverduePeriod,
} from './study/overduePeriod.ts';
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
  updateOverdueTaskPageRange,
  updateOverdueTaskProgress,
  updateOverdueTaskSkip,
  updateOverdueTaskTimer,
  type OverdueHandledEntry,
  type OverdueTaskEntry,
  type OverdueTaskSubject,
} from './study/overdueTasks.ts';
import { orderedEndPage, validatePageRange } from './study/pageRangeValidation.ts';
import {
  formatStudyTimer,
  pauseStudyTimer,
} from './study/studyTimer.ts';
import type { StudyRecord, StudyTimerState, StudyTimeMode } from './types.ts';

interface TodoActionTarget {
  recordDate: string;
  itemId: string;
  title: string;
}

let activeSubject = normalizedOverdueSubject(location.hash.replace(/^#/, ''));
let activePeriod = normalizedOverduePeriod(new URLSearchParams(location.search).get('period'));
let activeItem = normalizedOverdueItemFilter(new URLSearchParams(location.search).get('item'));
const PERIOD_LABELS: Record<OverduePeriod, string> = { all: '全部', month: '本月', week: '本週' };
let recordPrefix = 'study-v11:guest:';
let records: StudyRecord[] = [];
const drafts = new TodoDrafts();
const draftBases = new Map<string, StudyRecord>();
let displayedTimers = new Map<string, StudyTimerState>();
let renderedDate = localDateKey();

function draftKey(action: TodoActionTarget): string {
  return `${action.recordDate}:${action.itemId}`;
}

function draftField(input: HTMLInputElement): TodoDraftField | null {
  if ('todoMinutes' in input.dataset) return 'minutes';
  if ('todoCompletionDate' in input.dataset) return 'completionDate';
  if (input.dataset.todoRange === 'start' || input.dataset.todoRange === 'end') return input.dataset.todoRange;
  return null;
}

function saveError(error: unknown, fallback: string): void {
  setError(error instanceof Error ? error.message : fallback);
}

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
  if (target instanceof HTMLInputElement) {
    target.dataset.todoFocusKey = `${entry.key}:${draftField(target) || target.dataset.todoProgress || ''}`;
  }
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
  minutes.value = drafts.value(entry.key, 'minutes', entry.minutes);
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
  const toggle = timerButton(studyTimerToggleLabel(entry.timer), 'toggle', entry);
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
    if (detail.editableRange) {
      const input = document.createElement('input');
      input.className = 'todo-range-input';
      input.type = 'number';
      input.min = '1';
      if (detail.unitMaximum) input.max = String(detail.unitMaximum);
      if (detail.rangeKind) input.dataset.rangeUnit = detail.rangeKind === 'unit' ? 'Unit' : '回次';
      input.step = '1';
      input.inputMode = 'numeric';
      input.value = drafts.value(entry.key, detail.editableRange, detail.value);
      input.dataset.todoRange = detail.editableRange;
      input.setAttribute('aria-label', `${entry.title}的${detail.label}`);
      applyActionData(input, entry);
      value.append(input);
    } else {
      value.textContent = detail.value;
    }
    details.append(label, value);
  }
  const rangeStart = details.querySelector<HTMLInputElement>('[data-todo-range="start"]');
  const rangeEnd = details.querySelector<HTMLInputElement>('[data-todo-range="end"]');
  if (rangeStart?.value && rangeEnd) rangeEnd.min = rangeStart.value;
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
  completionDate.value = drafts.value(entry.key, 'completionDate', localDateKey());
  completionDate.dataset.todoCompletionDate = '';
  applyActionData(completionDate, entry);
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

function renderPeriodFilter(today: string): void {
  const switcher = element<HTMLDivElement>('periodSwitch');
  switcher.dataset.active = String(overduePeriodIndex(activePeriod));
  for (const button of switcher.querySelectorAll<HTMLButtonElement>('[data-period]')) {
    button.setAttribute('aria-pressed', String(button.dataset.period === activePeriod));
  }
  const range = overduePeriodRange(activePeriod, today);
  element<HTMLParagraphElement>('todoPeriodRange').textContent = range
    ? `原排程：${range.start.replace(/-/g, '/')}～${range.end.replace(/-/g, '/')}`
    : '依原排程日期篩選';
}

function todoSummaryText(total: number, periodCount: number, visibleCount: number): string {
  if (activeItem) return `目前篩選 ${visibleCount} 項｜全部 ${total} 項待辦`;
  if (activePeriod === 'all') {
    if (activeSubject === 'all') return `共有 ${total} 項待辦`;
    return `目前科目 ${visibleCount} 項｜全部 ${total} 項`;
  }
  const label = PERIOD_LABELS[activePeriod];
  if (activeSubject === 'all') return `${label} ${periodCount} 項待辦｜全部 ${total} 項`;
  return `${label}目前科目 ${visibleCount} 項｜本期 ${periodCount} 項｜全部 ${total} 項`;
}

function renderItemFilter(entries: OverdueTaskEntry[]): void {
  const select = element<HTMLSelectElement>('todoItemFilter');
  const options = [{ value: '', label: '全部項目' }, ...overdueItemOptions(entries)];
  if (activeItem && !options.some(option => option.value === activeItem)) {
    options.push({ value: activeItem, label: `${activeItem.slice(activeItem.indexOf(':') + 1)}（目前無待辦）` });
  }
  const signature = JSON.stringify(options);
  if (select.dataset.options !== signature) {
    select.replaceChildren(...options.map(function createOption(option): HTMLOptionElement {
      return new Option(option.label, option.value);
    }));
    select.dataset.options = signature;
  }
  select.value = activeItem;
}

function render(): void {
  const today = localDateKey();
  renderedDate = today;
  const entries = overdueTasks(records, today);
  const subjectItem = overdueItemFilterForSubject(activeItem, activeSubject);
  if (subjectItem !== activeItem) {
    activeItem = subjectItem;
    writeItemFilterLocation();
  }
  displayedTimers = new Map(entries.map(entry => [entry.key, entry.timer]));
  const periodEntries = overdueEntriesForPeriod(entries, activePeriod, today);
  const filtered = overdueEntriesForItem(visibleEntries(periodEntries), activeItem);
  renderPeriodFilter(today);
  renderItemFilter(visibleEntries(entries));
  document.body.dataset.subject = activeSubject;
  document.body.dataset.period = activePeriod;
  const switcher = element<HTMLDivElement>('subjectSwitch');
  switcher.dataset.active = String(overdueSubjectIndex(activeSubject));
  switcher.querySelectorAll<HTMLButtonElement>('[data-subject]').forEach(function updateTab(button): void {
    const selected = button.dataset.subject === activeSubject;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  element<HTMLElement>('todoSummary').textContent = todoSummaryText(entries.length, periodEntries.length, filtered.length);
  updateTodoList(element<HTMLDivElement>('todoList'), filtered, createTodoCard);
  const empty = element<HTMLParagraphElement>('todoEmpty');
  empty.hidden = filtered.length > 0;
  empty.textContent = activePeriod === 'all' ? '目前沒有符合條件的待辦事項。' : `${PERIOD_LABELS[activePeriod]}沒有符合條件的逾期未完成項目。`;
  if (activeItem) empty.textContent = '此項目在目前科目及期間內沒有待辦事項，可選擇「全部項目」或調整科目及期間。';
  renderHistory();
}

function saveRecordChange(
  action: TodoActionTarget,
  update: (record: StudyRecord) => StudyRecord | null,
  useDraftBase = false,
): boolean {
  const index = records.findIndex(record => record.date === action.recordDate);
  if (index < 0) return false;
  const base = useDraftBase ? draftBases.get(action.recordDate) ?? records[index] : records[index];
  const edited = saveLocalRecordEdit(localStorage, recordPrefix, base, update);
  if (!edited) return false;
  records[index] = edited;
  return true;
}

function timerPointerKey(): string {
  return `${recordPrefix}active-timer`;
}

function readTimerPointer(): StudyTimerPointer | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(timerPointerKey()) || 'null') as Partial<StudyTimerPointer> | null;
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

function writeTimerPointer(pointer: StudyTimerPointer | null): void {
  if (pointer) localStorage.setItem(timerPointerKey(), JSON.stringify(pointer));
  else localStorage.removeItem(timerPointerKey());
}

function sameTimerTarget(pointer: StudyTimerPointer | null, action: TodoActionTarget): boolean {
  if (!pointer || pointer.entryId || pointer.date !== action.recordDate) return false;
  const record = records.find(record => record.date === action.recordDate);
  return Boolean(record && sameStudyTimerTarget(record, pointer, { date: action.recordDate, itemId: action.itemId }));
}

function currentTimer(action: TodoActionTarget): StudyTimerState | null {
  const record = records.find(candidate => candidate.date === action.recordDate);
  return record ? overdueTaskTimer(record, action.itemId) : null;
}

function saveTimer(action: TodoActionTarget, state: StudyTimerState, minutes?: string): boolean {
  const previousPointer = readTimerPointer();
  const changesPointer = state.startedAt !== null || sameTimerTarget(previousPointer, action);
  if (changesPointer) writeTimerPointer(state.startedAt === null ? null : { date: action.recordDate, itemId: action.itemId });
  try {
    const saved = saveRecordChange(action, record => updateOverdueTaskTimer(record, action.itemId, state, minutes));
    if (!saved && changesPointer) writeTimerPointer(previousPointer);
    return saved;
  } catch (error) {
    if (changesPointer) {
      try { writeTimerPointer(previousPointer); } catch { /* Keep the original storage error visible. */ }
    }
    throw error;
  }
}

function pauseActiveTimer(except?: TodoActionTarget): void {
  const pointer = readTimerPointer();
  if (!pointer || (except && sameTimerTarget(pointer, except))) return;
  const action = { recordDate: pointer.date, itemId: pointer.itemId, title: '目前計時項目' };
  saveRecordChange(action, function pauseOtherTimer(record): StudyRecord | null {
    const updated = JSON.parse(JSON.stringify(record)) as StudyRecord;
    const target = resolveStudyTimerTarget(updated, pointer);
    if (!target) return null;
    setStudyTimerTargetState(target, pauseStudyTimer(studyTimerTargetState(target)));
    return updated;
  });
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
    const state = currentTimer(action);
    if (state?.mode === 'timer') {
      const finished = changeStudyTimer(state, 'finish')!;
      if (!saveTimer(action, finished.state, finished.minutes)) return setError('計時尚未儲存，請重新讀取後再完成。');
    }
    const saved = saveRecordChange(action, record => (
      updateOverdueTaskCompletion(record, action.itemId, true, completionDate)
    ));
    if (!saved) return setError('找不到原始項目或完成日期無效，請重新讀取後再試。');
    setError('');
    setFeedback(`已完成「${action.title}」，完成日期為 ${completionDate}。可在下方清單復原。`);
    render();
  } catch (error) {
    saveError(error, '無法保存完成狀態，請確認瀏覽器儲存權限。');
  }
}

function saveMinutes(action: TodoActionTarget, minutes: string): void {
  try {
    const saved = saveRecordChange(action, record => updateOverdueTaskMinutes(record, action.itemId, minutes), true);
    if (!saved) return setError('學習時間必須是 0 以上的數字。');
    drafts.remove(draftKey(action), 'minutes');
    if (!drafts.hasRecordEdits(action.recordDate)) draftBases.delete(action.recordDate);
    setError('');
    setFeedback(`已將「${action.title}」的學習時間保存為 ${minutes || '—'} 分鐘。`);
  } catch (error) {
    saveError(error, '無法保存學習時間，請確認瀏覽器儲存權限。');
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

function saveRange(action: TodoActionTarget, input: HTMLInputElement): void {
  try {
    const card = input.closest<HTMLElement>('.todo-card');
    const start = card?.querySelector<HTMLInputElement>('[data-todo-range="start"]');
    const end = card?.querySelector<HTMLInputElement>('[data-todo-range="end"]');
    if (!start || !end) return setError('找不到完整的範圍，請重新讀取後再試。');
    if (start.dataset.rangeUnit && start.value && !end.value) end.value = start.value;
    const orderedEnd = orderedEndPage(start.value, end.value);
    if (orderedEnd !== end.value) end.value = orderedEnd;
    if (start.value) end.min = start.value;
    else end.min = '1';
    const validation = validatePageRange(start.value, end.value);
    if (start.max && (Number(start.value) > Number(start.max) || Number(end.value) > Number(end.max))) {
      setError(`${start.dataset.rangeUnit} 必須介於 1～${start.max}。`);return;
    }
    start.setCustomValidity('');
    end.setCustomValidity(validation.valid ? '' : validation.message);
    if (!validation.valid) {
      setError(validation.message);
      end.reportValidity();
      return;
    }
    const saved = saveRecordChange(action, record => (
      updateOverdueTaskPageRange(record, action.itemId, start.value, end.value)
    ), true);
    if (!saved) return setError('範圍必須是 1 以上的整數，或留空。');
    drafts.remove(draftKey(action), 'start', 'end');
    if (!drafts.hasRecordEdits(action.recordDate)) draftBases.delete(action.recordDate);
    setError('');
    const rangeLabel = start.dataset.rangeUnit ? `${start.dataset.rangeUnit} 範圍` : '頁碼範圍';
    setFeedback(`已同步「${action.title}」的${rangeLabel}。`);
  } catch (error) {
    saveError(error, '無法保存頁碼範圍，請確認瀏覽器儲存權限。');
  }
}

function switchTimeMode(action: TodoActionTarget, mode: StudyTimeMode, manualMinutes: string): void {
  try {
    const current = currentTimer(action);
    if (!current || current.mode === mode) return;
    const change = switchStudyTimerMode(current, mode, manualMinutes);
    if (!saveTimer(action, change.state, change.minutes)) throw new Error('找不到原始計時項目，請重新讀取後再試。');
    drafts.remove(draftKey(action), 'minutes');
    if (!drafts.hasRecordEdits(action.recordDate)) draftBases.delete(action.recordDate);
    setError('');
    render();
  } catch (error) {
    saveError(error, '無法保存計時模式，請確認瀏覽器儲存權限。');
  }
}

function runTimerAction(action: TodoActionTarget, command: string): void {
  try {
    const current = currentTimer(action);
    if (!current) throw new Error('找不到原始計時項目，請重新讀取後再試。');
    if (command === 'toggle' && current.startedAt === null) pauseActiveTimer(action);
    const change = changeStudyTimer(current, command);
    if (!change) return;
    if (!saveTimer(action, change.state, change.minutes)) throw new Error('計時尚未儲存，請重新讀取後再試。');
    if (change.minutes !== undefined) drafts.remove(draftKey(action), 'minutes');
    if (!drafts.hasRecordEdits(action.recordDate)) draftBases.delete(action.recordDate);
    if (command === 'finish') setFeedback(`已完成「${action.title}」的計時並保存 ${change.minutes || '—'} 分鐘。`);
    setError('');
    render();
  } catch (error) {
    saveError(error, '無法保存計時。請確認瀏覽器儲存空間及權限後再試。');
  }
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
  document.querySelectorAll<HTMLElement>('.todo-timer-panel:not([hidden]) [data-todo-timer-display]').forEach(function refresh(display): void {
    const action = actionFromElement(display);
    const state = action ? displayedTimers.get(draftKey(action)) : null;
    if (state) display.textContent = formatStudyTimer(state);
  });
}

function load(forceCards = false): void {
  try {
    const result = readMaterialProgressRecords(localStorage);
    records = result.records;
    if (recordPrefix !== result.prefix) { drafts.clear(); draftBases.clear(); }
    recordPrefix = result.prefix;
    const source = result.prefix.startsWith('study-v11:user:') ? '目前登入帳號的本機同步資料' : '訪客本機資料';
    element<HTMLParagraphElement>('recordSource').textContent = `${source}｜已讀取 ${result.records.length} 天紀錄`;
    setError('');
    setFeedback('');
    if (forceCards) element<HTMLDivElement>('todoList').querySelectorAll<HTMLElement>('.todo-card')
      .forEach(card => { delete card.dataset.todoSignature; });
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

function selectPeriod(period: OverduePeriod, focus = false): void {
  activePeriod = period;
  const url = new URL(location.href);
  if (period === 'all') url.searchParams.delete('period');
  else url.searchParams.set('period', period);
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  render();
  if (focus) element<HTMLDivElement>('periodSwitch')
    .querySelector<HTMLButtonElement>(`[data-period="${period}"]`)?.focus();
}

function readLocationFilters(): void {
  activeSubject = normalizedOverdueSubject(location.hash.replace(/^#/, ''));
  activePeriod = normalizedOverduePeriod(new URLSearchParams(location.search).get('period'));
  activeItem = normalizedOverdueItemFilter(new URLSearchParams(location.search).get('item'));
}

function writeItemFilterLocation(): void {
  const url = new URL(location.href);
  if (activeItem) url.searchParams.set('item', activeItem);
  else url.searchParams.delete('item');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

element<HTMLSelectElement>('todoItemFilter').addEventListener('change', function selectItem(): void {
  activeItem = normalizedOverdueItemFilter(element<HTMLSelectElement>('todoItemFilter').value);
  writeItemFilterLocation();
  render();
});

element<HTMLDivElement>('periodSwitch').addEventListener('click', function switchPeriod(event): void {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-period]');
  if (button) selectPeriod(normalizedOverduePeriod(button.dataset.period));
});

element<HTMLDivElement>('periodSwitch').addEventListener('keydown', function movePeriod(event): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const current = overduePeriodIndex(activePeriod);
  let next = current;
  if (event.key === 'ArrowLeft') next = (current - 1 + OVERDUE_PERIODS.length) % OVERDUE_PERIODS.length;
  if (event.key === 'ArrowRight') next = (current + 1) % OVERDUE_PERIODS.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = OVERDUE_PERIODS.length - 1;
  selectPeriod(OVERDUE_PERIODS[next], true);
});

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
  const range = (event.target as HTMLElement).closest<HTMLInputElement>('[data-todo-range]');
  if (range) {
    const action = actionFromElement(range);
    if (action) saveRange(action, range);
    return;
  }
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

function saveFocusedDraft(input: HTMLInputElement): void {
  if (!input.isConnected) return;
  const action = actionFromElement(input);
  const field = draftField(input);
  if (!action || !field || !drafts.has(draftKey(action), field)) return;
  if (field === 'minutes') saveMinutes(action, input.value);
  else if (field === 'start' || field === 'end') saveRange(action, input);
}

element<HTMLDivElement>('todoList').addEventListener('focusout', function saveOnFieldExit(event): void {
  if (event.target instanceof HTMLInputElement) saveFocusedDraft(event.target);
});
window.addEventListener('pagehide', function saveBeforeLeaving(): void {
  if (document.activeElement instanceof HTMLInputElement) saveFocusedDraft(document.activeElement);
});

element<HTMLDivElement>('todoList').addEventListener('input', function constrainTodoRange(event): void {
  if (event.target instanceof HTMLInputElement) {
    const action = actionFromElement(event.target);
    const field = draftField(event.target);
    if (action && field) {
      if (field !== 'completionDate' && !draftBases.has(action.recordDate)) {
        const base = records.find(record => record.date === action.recordDate);
        if (base) draftBases.set(action.recordDate, JSON.parse(JSON.stringify(base)) as StudyRecord);
      }
      drafts.set(draftKey(action), field, event.target.value);
    }
  }
  const input = (event.target as HTMLElement).closest<HTMLInputElement>('[data-todo-range]');
  const card = input?.closest<HTMLElement>('.todo-card');
  const start = card?.querySelector<HTMLInputElement>('[data-todo-range="start"]');
  const end = card?.querySelector<HTMLInputElement>('[data-todo-range="end"]');
  if (!start || !end) return;
  end.min = start.value || '1';
  start.setCustomValidity('');
  end.setCustomValidity('');
  setError('');
});

element<HTMLDivElement>('todoHistoryList').addEventListener('click', function handleUndo(event): void {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.todo-history-undo');
  const action = button ? actionFromElement(button) : null;
  if (action) undoHandledTask(action);
});

element<HTMLButtonElement>('refreshTodo').addEventListener('click', function refreshManually(): void {
  draftBases.clear();
  load(true);
});
window.addEventListener('storage', function refreshChangedRecords(event): void {
  if (event.storageArea !== localStorage) return;
  if (event.key === null || event.key === ACTIVE_RECORD_PREFIX_KEY
    || (event.key.startsWith(recordPrefix) && /^\d{4}-\d{2}-\d{2}$/.test(event.key.slice(recordPrefix.length)))) load();
});
window.addEventListener('pageshow', function refreshVisibleTodoPage(): void {
  readLocationFilters();
  load(true);
});
window.addEventListener('hashchange', function syncHash(): void {
  readLocationFilters();
  render();
});
window.addEventListener('popstate', function syncHistoryFilters(): void {
  readLocationFilters();
  render();
});

setInterval(refreshTimerDisplays, 1000);
setInterval(function refreshCalendarDate(): void {
  if (renderedDate !== localDateKey()) render();
  else renderHistory();
}, 60_000);
load();
