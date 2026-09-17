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

const NATURAL_SUBJECT_ORDER = ['物理', '化學', '地科', '生物'] as const;
const ENGLISH_EXAM_MATERIAL_IDS = new Set([
  'english:ace',
  'english:listening',
  'book:學測週計畫',
  'book:混合題30篇實戰演練',
  'book:主題百匯：篇章結構·閱讀測驗',
  'book:主題百匯：克漏字',
  'english:grammar',
  'english:vocabulary-2001-4000',
  'english:vocabulary-4001-6000',
]);

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
  const parts = row.title.split('｜');
  if (row.subject === 'natural' && parts.length >= 3) return parts.slice(2).join('｜');
  return row.title.replace(/^(?:國文|英文|數學|自然)｜/, '');
}

function naturalSubject(row: MaterialProgressRow): string {
  return row.id.split(':')[1] ?? '';
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

function renderMaterialGroup(label: string, groupRows: MaterialProgressRow[], dataKey?: string): HTMLElement[] {
  if (!groupRows.length) return [];
  const group = document.createElement('section');
  group.className = 'material-selection-group';
  group.dataset.materialGroup = dataKey ?? label;
  const title = document.createElement('h3');
  title.textContent = label;
  const options = document.createElement('div');
  options.className = 'material-selection-sublist';
  options.replaceChildren(...groupRows.map(renderMaterialOption));
  group.append(title, options);
  return [group];
}

function renderMaterialOptions(availableRows: MaterialProgressRow[]): HTMLElement[] {
  if (activeSubject === 'math') {
    const split = availableRows.filter(row => /^math:(?:對話式|教學講義):/.test(row.id));
    const review = availableRows.filter(row => !split.includes(row));
    return [
      ...renderMaterialGroup('分冊講義', split, 'math-split'),
      ...renderMaterialGroup('複習講義', review, 'math-review'),
    ];
  }
  if (activeSubject === 'english') {
    const exam = availableRows.filter(row => ENGLISH_EXAM_MATERIAL_IDS.has(row.id));
    const other = availableRows.filter(row => !ENGLISH_EXAM_MATERIAL_IDS.has(row.id));
    return [
      ...renderMaterialGroup('學測', exam, 'english-exam'),
      ...renderMaterialGroup('其他', other, 'english-other'),
    ];
  }
  if (activeSubject === 'natural') {
    return NATURAL_SUBJECT_ORDER.flatMap(subject => {
      const subjectRows = availableRows.filter(row => naturalSubject(row) === subject);
      return renderMaterialGroup(subject, subjectRows, `natural-${subject}`).map(group => {
        group.dataset.naturalSubject = subject;
        return group;
      });
    });
  }
  return availableRows.map(renderMaterialOption);
}

function setupAnimatedMaterialsPanel(): void {
  const panel = element<HTMLDetailsElement>('materialsPanel');
  const summary = panel.querySelector<HTMLElement>(':scope > summary');
  if (!summary) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  summary.addEventListener('click', event => {
    if (reducedMotion.matches || panel.classList.contains('is-opening') || panel.classList.contains('is-closing')) return;
    event.preventDefault();
    const summaryHeight = summary.getBoundingClientRect().height;
    if (!panel.open) {
      panel.classList.add('is-opening');
      panel.style.height = `${summaryHeight}px`;
      panel.open = true;
      const expandedHeight = panel.scrollHeight;
      const finishOpening = (transitionEvent: TransitionEvent) => {
        if (transitionEvent.target !== panel || transitionEvent.propertyName !== 'height') return;
        panel.removeEventListener('transitionend', finishOpening);
        panel.classList.remove('is-opening');
        panel.style.removeProperty('height');
      };
      panel.addEventListener('transitionend', finishOpening);
      requestAnimationFrame(() => requestAnimationFrame(() => { panel.style.height = `${expandedHeight}px`; }));
      return;
    }
    panel.classList.add('is-closing');
    panel.style.height = `${panel.getBoundingClientRect().height}px`;
    const finishClosing = (transitionEvent: TransitionEvent) => {
      if (transitionEvent.target !== panel || transitionEvent.propertyName !== 'height') return;
      panel.removeEventListener('transitionend', finishClosing);
      panel.open = false;
      panel.classList.remove('is-closing');
      panel.style.removeProperty('height');
    };
    panel.addEventListener('transitionend', finishClosing);
    requestAnimationFrame(() => requestAnimationFrame(() => { panel.style.height = `${summaryHeight}px`; }));
  });
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
  element<HTMLDivElement>('materialSelectionList').replaceChildren(...renderMaterialOptions(availableRows));
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

setupAnimatedMaterialsPanel();
load();
