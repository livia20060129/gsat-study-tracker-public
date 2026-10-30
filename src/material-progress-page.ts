import './material-progress.css';
import { MaterialCatalogEditor } from './ui/materialCatalogEditor.ts';
import { catalogModeNoun, catalogProgressSubject, effectiveMaterialCatalog, type CatalogMaterial, type CatalogSubject } from './study/materialCatalog.ts';
import type { StudyRecord } from './types.ts';
import { readMaterialSelection, writeMaterialSelection } from './study/materialSelection.ts';
import {
  MATERIAL_PROGRESS_SUBJECTS,
  builtInMaterialCatalog,
  materialProgressRows,
  normalizedProgressSubject,
  readMaterialProgressRecords,
  subjectIndex,
  type MaterialProgressGroup,
  type MaterialProgressRow,
  type MaterialProgressSubject,
} from './study/materialProgress.ts';

const SUBJECT_LABELS: Record<MaterialProgressSubject, string> = {
  chinese: '國文',
  english: '英文',
  math: '數學',
  natural: '自然',
  social: '社會',
};

const NATURAL_SUBJECT_ORDER = ['物理', '化學', '地科', '生物'] as const;
const SOCIAL_SUBJECT_ORDER = ['公民', '歷史', '地理'] as const;
const ENGLISH_EXAM_MATERIAL_IDS: ReadonlySet<string> = new Set([
  'english:ace', 'english:listening', 'book:學測週計畫', 'book:混合題30篇實戰演練',
  'book:英語高頻字彙完全攻略', 'book:主題百匯：篇章結構·閱讀測驗', 'book:主題百匯：克漏字',
  'english:writing', 'english:grammar', 'english:vocabulary-2001-4000', 'english:vocabulary-4001-6000',
]);

let activeSubject = normalizedProgressSubject(location.hash.replace(/^#/, ''));
let rows: MaterialProgressRow[] = [];
let records: StudyRecord[] = [];
let prefix = '';
let catalog: CatalogMaterial[] = [];
let selectedMaterialIds = new Set<string>();
const builtins = builtInMaterialCatalog();

function validMaterialIds(): string[] {
  return [...new Set([...rows.map(row => row.id), ...catalog.map(material => material.id)])];
}

function defaultCatalogSubject(): CatalogSubject {
  if (activeSubject === 'chinese') return '國文';
  if (activeSubject === 'english') return '英文';
  if (activeSubject === 'math') return '數學';
  if (activeSubject === 'social') return '歷史';
  return '物理';
}

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

function materialLabel(row: MaterialProgressRow): string {
  const parts = row.title.split('｜');
  if (row.subject === 'natural' && parts.length >= 3) return parts.slice(2).join('｜');
  if (row.subject === 'social' && parts.length >= 2) return parts.slice(1).join('｜');
  return row.title.replace(/^(?:國文|英文|數學|自然|社會)｜/, '');
}

function naturalSubject(row: MaterialProgressRow): string { return row.id.split(':')[1] ?? ''; }
function socialSubject(row: MaterialProgressRow): string { return row.title.split('｜')[0] ?? ''; }
function isEnglishExamMaterial(row: MaterialProgressRow): boolean { return ENGLISH_EXAM_MATERIAL_IDS.has(row.id); }

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
  const heading = document.createElement('h3');
  heading.textContent = label;
  const options = document.createElement('div');
  options.className = 'material-selection-sublist';
  options.replaceChildren(...groupRows.map(renderMaterialOption));
  group.append(heading, options);
  return [group];
}

function renderMaterialOptions(availableRows: MaterialProgressRow[]): HTMLElement[] {
  if (activeSubject === 'math') {
    const split = availableRows.filter(row => /^math:(?:對話式|教學講義):/.test(row.id));
    return [...renderMaterialGroup('分冊講義', split, 'math-split'), ...renderMaterialGroup('複習講義', availableRows.filter(row => !split.includes(row)), 'math-review')];
  }
  if (activeSubject === 'english') {
    const exam = availableRows.filter(isEnglishExamMaterial);
    return [...renderMaterialGroup('學測', exam, 'english-exam'), ...renderMaterialGroup('其他', availableRows.filter(row => !isEnglishExamMaterial(row)), 'english-other')];
  }
  if (activeSubject === 'natural') return NATURAL_SUBJECT_ORDER.flatMap(subject => renderMaterialGroup(subject, availableRows.filter(row => naturalSubject(row) === subject), `natural-${subject}`).map(group => { group.dataset.naturalSubject = subject; return group; }));
  if (activeSubject === 'social') return SOCIAL_SUBJECT_ORDER.flatMap(subject => renderMaterialGroup(subject, availableRows.filter(row => socialSubject(row) === subject), `social-${subject}`).map(group => { group.dataset.socialSubject = subject; return group; }));
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
    const collapsedHeight = summary.getBoundingClientRect().height;
    const finish = (opening: boolean) => (transitionEvent: TransitionEvent): void => {
      if (transitionEvent.target !== panel || transitionEvent.propertyName !== 'height') return;
      panel.removeEventListener('transitionend', finishHandler);
      if (!opening) panel.open = false;
      panel.classList.remove(opening ? 'is-opening' : 'is-closing');
      panel.style.removeProperty('height');
    };
    let finishHandler: (transitionEvent: TransitionEvent) => void;
    if (!panel.open) {
      panel.classList.add('is-opening'); panel.style.height = `${collapsedHeight}px`; panel.open = true;
      finishHandler = finish(true); panel.addEventListener('transitionend', finishHandler);
      requestAnimationFrame(() => requestAnimationFrame(() => { panel.style.height = `${panel.scrollHeight}px`; }));
    } else {
      panel.classList.add('is-closing'); panel.style.height = `${panel.getBoundingClientRect().height}px`;
      finishHandler = finish(false); panel.addEventListener('transitionend', finishHandler);
      requestAnimationFrame(() => requestAnimationFrame(() => { panel.style.height = `${collapsedHeight}px`; }));
    }
  });
}

function renderRow(material: CatalogMaterial): HTMLElement {
  const row = rows.find(progress => progress.id === material.id);
  const article = document.createElement('article');
  article.className = `material-row subject-${catalogProgressSubject(material.subject)}${material.deleted ? ' is-deleted' : ''}`;
  article.dataset.materialId = material.id;

  const header = document.createElement('div');
  header.className = 'material-row-head';
  const title = document.createElement('h3');
  title.textContent = row?.title ?? `${material.subject}｜${material.title}`;
  const count = document.createElement('strong');
  if (material.deleted) count.textContent = '目錄已停用，原始紀錄保留';
  else if (row) count.textContent = `完成 ${row.completionPercent}%｜${row.recorded}／${row.total} ${row.unitLabel}已有紀錄`;
  else count.textContent = '請編輯教材，設定總數與章節對照';
  header.append(title, count);
  article.append(header);

  if (row && !material.deleted) {
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
    article.append(scroll);
  }
  const note = document.createElement('p');
  note.className = 'material-metadata';
  const mode = catalogModeNoun(material.mode);
  const total = material.total > 10000 ? '總數尚未設定' : `共 ${material.total} ${mode}`;
  note.textContent = `${total}｜${material.sections.length} 筆章節對照`;
  article.append(note, editor.actions(material));
  return article;
}

const GROUP_ORDER: Record<MaterialProgressSubject, MaterialProgressGroup[]> = {
  chinese: ['國文教材'],
  english: ['學測', '補充'],
  math: ['複習講義', '分冊講義'],
  natural: ['物理', '化學', '生物', '地科'],
  social: ['公民', '歷史', '地理'],
};

function renderGroup(group: MaterialProgressGroup, materials: CatalogMaterial[], index: number): HTMLElement {
  const section = document.createElement('section');
  section.className = 'material-group';

  if (activeSubject !== 'chinese') {
    const heading = document.createElement('h3');
    heading.className = 'material-group-title';
    heading.id = `materialGroup${index}`;
    heading.textContent = group;
    section.setAttribute('aria-labelledby', heading.id);
    section.append(heading);
  }

  const groupList = document.createElement('div');
  groupList.className = 'material-group-list';
  groupList.append(...materials.map(renderRow));
  section.append(groupList);
  return section;
}

function renderGroups(materials: CatalogMaterial[]): HTMLElement[] {
  return GROUP_ORDER[activeSubject].flatMap((group, index) => {
    const grouped = materials.filter(material => material.group === group);
    return grouped.length > 0 ? [renderGroup(group, grouped, index)] : [];
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
  element<HTMLElement>('subjectSummary').textContent = subjectRows.length ? `${SUBJECT_LABELS[activeSubject]}合計完成 ${completionPercent}%` : `${SUBJECT_LABELS[activeSubject]}尚未選擇教材`;

  const list = element<HTMLDivElement>('materialProgressList');
  const query = element<HTMLInputElement>('catalogSearch').value.trim().toLowerCase();
  const showRetired = element<HTMLInputElement>('showRetiredMaterials').checked;
  const materials = catalog.filter(material => selectedMaterialIds.has(material.id) && catalogProgressSubject(material.subject) === activeSubject
    && (showRetired || !material.deleted) && `${material.subject} ${material.title}`.toLowerCase().includes(query));
  list.replaceChildren(...renderGroups(materials));
  const empty = element<HTMLParagraphElement>('materialEmpty');
  empty.textContent = subjectRows.length > 0 ? '沒有符合條件的教材。' : '請先在「我的教材」勾選要顯示的教材。';
  empty.hidden = materials.length > 0;
}

function load(): void {
  try {
    const result = readMaterialProgressRecords(localStorage);
    records = result.records;
    prefix = result.prefix;
    catalog = effectiveMaterialCatalog(builtins, records, true);
    rows = materialProgressRows(result.records);
    selectedMaterialIds = new Set(readMaterialSelection(localStorage, prefix, validMaterialIds()));
    const source = result.prefix.startsWith('study-v11:user:') ? '目前登入帳號的本機同步資料' : '訪客本機資料';
    element<HTMLParagraphElement>('recordSource').textContent = `${source}｜已讀取 ${result.records.length} 天紀錄`;
    setError('');
    render();
  } catch {
    records = [];
    prefix = 'study-v11:guest:';
    catalog = builtins;
    rows = materialProgressRows([]);
    selectedMaterialIds = new Set(readMaterialSelection(localStorage, prefix, validMaterialIds()));
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

const editor = new MaterialCatalogEditor({
  builtins,
  context: () => ({ prefix, records, entries: catalog, defaultSubject: defaultCatalogSubject() }),
  onSaved: function refreshAfterSave(entry): void {
    activeSubject = catalogProgressSubject(entry.subject);
    selectedMaterialIds.add(entry.id);
    writeMaterialSelection(localStorage, prefix, validMaterialIds().concat(entry.id).filter(id => selectedMaterialIds.has(id)));
    const search = element<HTMLInputElement>('catalogSearch');
    if (search.value && !`${entry.subject} ${entry.title}`.toLowerCase().includes(search.value.trim().toLowerCase())) search.value = entry.title;
    history.replaceState(null, '', `${location.pathname}${location.search}#${activeSubject}`);
    load();
  },
});

element<HTMLButtonElement>('refreshProgress').addEventListener('click', load);
element<HTMLDivElement>('materialSelectionList').addEventListener('change', event => {
  const checkbox = (event.target as HTMLElement).closest<HTMLInputElement>('input[type="checkbox"]');
  if (!checkbox) return;
  if (checkbox.checked) selectedMaterialIds.add(checkbox.value); else selectedMaterialIds.delete(checkbox.value);
  writeMaterialSelection(localStorage, prefix, validMaterialIds().filter(id => selectedMaterialIds.has(id)));
  render();
});
element('catalogSearch').addEventListener('input', render);
element('showRetiredMaterials').addEventListener('change', render);
window.addEventListener('storage', event => {
  if (event.key?.startsWith('study-v11:') && !event.key.includes(':cross-tab-lock:')) load();
});
window.addEventListener('hashchange', () => {
  activeSubject = normalizedProgressSubject(location.hash.replace(/^#/, ''));
  render();
});

setupAnimatedMaterialsPanel();
load();
