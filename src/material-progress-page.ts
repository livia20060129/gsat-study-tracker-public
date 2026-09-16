import './material-progress.css';
import {
  MATERIAL_PROGRESS_SUBJECTS,
  materialProgressRows,
  normalizedProgressSubject,
  readMaterialProgressRecords,
  subjectIndex,
  type MaterialProgressRow,
  type MaterialProgressSubject,
} from './study/materialProgress.ts';
import {
  readMaterialSelection,
  writeMaterialSelection,
} from './study/materialSelection.ts';

const SUBJECT_LABELS: Record<MaterialProgressSubject, string> = {
  chinese: '國文',
  english: '英文',
  math: '數學',
  natural: '自然',
};

let activeSubject = normalizedProgressSubject(location.hash.replace(/^#/, ''));
let rows: MaterialProgressRow[] = [];
let activeRecordPrefix = 'study-v11:guest:';
let selectedMaterialIds = new Set<string>();

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element: ${id}`);
  return found as T;
}

function setError(message: string): void {
  const error = element<HTMLParagraphElement>('progressError');
  error.textContent = message;
  error.hidden = !message;
}

function renderRow(row: MaterialProgressRow): HTMLElement {
  const article = document.createElement('article');
  article.className = `material-row subject-${row.subject}`;

  const header = document.createElement('div');
  header.className = 'material-row-head';
  const title = document.createElement('h3');
  title.textContent = row.title;
  const count = document.createElement('strong');
  count.textContent = `完成 ${row.completionPercent}%｜${row.recorded}／${row.total} ${row.unitLabel}已有紀錄`;
  header.append(title, count);

  const scroll = document.createElement('div');
  scroll.className = 'material-bar-scroll';
  const bar = document.createElement('div');
  bar.className = 'material-bar';
  bar.style.setProperty('--segment-count', String(row.total));
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', `${row.title}：完成 ${row.completionPercent}%，${row.recorded}／${row.total} ${row.unitLabel}已有紀錄`);

  row.segments.forEach((segment, index) => {
    const block = document.createElement('span');
    block.className = `material-segment ${segment.recorded ? `is-recorded tone-${segment.tone}` : 'is-empty'}`;
    block.title = `${segment.label}：完成 ${segment.completionPercent}%`;
    block.setAttribute('aria-hidden', 'true');
    block.style.setProperty('--segment-number', String(index + 1));
    block.style.setProperty('--segment-progress', `${segment.completionPercent}%`);
    block.style.setProperty('--segment-weight', String(segment.completionWeight));
    bar.append(block);
  });

  scroll.append(bar);
  article.append(header, scroll);
  return article;
}

function materialLabel(row: MaterialProgressRow): string {
  return row.title.replace(/^(?:國文|英文|數學|自然)｜/, '');
}

function renderMaterialOption(row: MaterialProgressRow): HTMLElement {
  const label = document.createElement('label');
  label.className = `material-option subject-${row.subject}`;
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.value = row.id;
  checkbox.checked = selectedMaterialIds.has(row.id);
  const name = document.createElement('span');
  name.textContent = materialLabel(row);
  label.append(checkbox, name);
  return label;
}

function render(): void {
  document.body.dataset.subject = activeSubject;
  const switcher = element<HTMLDivElement>('subjectSwitch');
  switcher.dataset.active = String(subjectIndex(activeSubject));
  switcher.querySelectorAll<HTMLButtonElement>('[data-subject]').forEach(button => {
    const selected = button.dataset.subject === activeSubject;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });

  const availableRows = rows.filter(row => row.subject === activeSubject);
  const subjectRows = availableRows.filter(row => selectedMaterialIds.has(row.id));
  element<HTMLDivElement>('materialSelectionList').replaceChildren(...availableRows.map(renderMaterialOption));
  element<HTMLElement>('selectionSummary').textContent = `${SUBJECT_LABELS[activeSubject]}已選 ${subjectRows.length}／${availableRows.length} 本`;
  const completedWeight = subjectRows.reduce(
    (sum, row) => sum + row.segments.reduce(
      (rowSum, segment) => rowSum + segment.completionWeight * segment.completionPercent / 100,
      0,
    ),
    0,
  );
  const totalWeight = subjectRows.reduce(
    (sum, row) => sum + row.segments.reduce((rowSum, segment) => rowSum + segment.completionWeight, 0),
    0,
  );
  const completionPercent = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
  element<HTMLElement>('subjectSummary').textContent = subjectRows.length
    ? `${SUBJECT_LABELS[activeSubject]}合計完成 ${completionPercent}%`
    : `${SUBJECT_LABELS[activeSubject]}尚未選擇教材`;

  const list = element<HTMLDivElement>('materialProgressList');
  if (subjectRows.length) {
    list.replaceChildren(...subjectRows.map(renderRow));
  } else {
    const empty = document.createElement('p');
    empty.className = 'material-empty';
    empty.textContent = `請先在「我的教材」勾選要顯示的${SUBJECT_LABELS[activeSubject]}教材。`;
    list.replaceChildren(empty);
  }
}

function load(): void {
  try {
    const result = readMaterialProgressRecords(localStorage);
    rows = materialProgressRows(result.records);
    activeRecordPrefix = result.prefix;
    selectedMaterialIds = new Set(readMaterialSelection(localStorage, activeRecordPrefix, rows.map(row => row.id)));
    const source = result.prefix.startsWith('study-v11:user:') ? '目前登入帳號的本機同步資料' : '訪客本機資料';
    element<HTMLParagraphElement>('recordSource').textContent = `${source}｜已讀取 ${result.records.length} 天紀錄`;
    setError('');
    render();
  } catch {
    rows = materialProgressRows([]);
    element<HTMLParagraphElement>('recordSource').textContent = '無法讀取本機紀錄';
    setError('瀏覽器目前不允許存取 Tracker 的本機資料，請回到 Tracker 確認瀏覽器儲存權限。');
    render();
  }
}

function selectSubject(subject: MaterialProgressSubject, focus = false): void {
  activeSubject = subject;
  history.replaceState(null, '', `${location.pathname}${location.search}#${subject}`);
  render();
  if (focus) element<HTMLDivElement>('subjectSwitch').querySelector<HTMLButtonElement>(`[data-subject="${subject}"]`)?.focus();
}

element<HTMLDivElement>('subjectSwitch').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-subject]');
  if (button) selectSubject(normalizedProgressSubject(button.dataset.subject));
});

element<HTMLDivElement>('subjectSwitch').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const current = subjectIndex(activeSubject);
  let next = current;
  if (event.key === 'ArrowLeft') next = (current - 1 + MATERIAL_PROGRESS_SUBJECTS.length) % MATERIAL_PROGRESS_SUBJECTS.length;
  if (event.key === 'ArrowRight') next = (current + 1) % MATERIAL_PROGRESS_SUBJECTS.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = MATERIAL_PROGRESS_SUBJECTS.length - 1;
  selectSubject(MATERIAL_PROGRESS_SUBJECTS[next], true);
});

element<HTMLDivElement>('materialSelectionList').addEventListener('change', event => {
  const checkbox = (event.target as HTMLElement).closest<HTMLInputElement>('input[type="checkbox"]');
  if (!checkbox) return;
  if (checkbox.checked) selectedMaterialIds.add(checkbox.value);
  else selectedMaterialIds.delete(checkbox.value);
  writeMaterialSelection(
    localStorage,
    activeRecordPrefix,
    rows.map(row => row.id).filter(id => selectedMaterialIds.has(id)),
  );
  render();
});

element<HTMLButtonElement>('refreshProgress').addEventListener('click', load);
window.addEventListener('storage', load);
window.addEventListener('hashchange', () => {
  activeSubject = normalizedProgressSubject(location.hash.replace(/^#/, ''));
  render();
});

load();
