import './vocabulary-review.css';
import { markRecordLocallyEdited } from './storage/recordSync.ts';
import { readMaterialProgressRecords } from './study/materialProgress.ts';
import {
  updateVocabularyWordEntries,
  VOCABULARY_PARTS_OF_SPEECH,
  vocabularyEntryKey,
  vocabularyReviewEntries,
  type VocabularyPartOfSpeechField,
  type VocabularyRecordKind,
  type VocabularyReviewEntry,
  type VocabularyWordEdits,
} from './study/vocabularyReview.ts';
import type { StudyRecord } from './types.ts';

type VocabularyGroupingMode = 'alphabetical' | 'partOfSpeech';
type VocabularyContentKind = '單字' | '組合' | '句子';

const VOCABULARY_KIND_OPTIONS: ReadonlyArray<{
  value: VocabularyRecordKind;
  label: VocabularyContentKind;
}> = [
  { value: 'word', label: '單字' },
  { value: 'combination', label: '組合' },
  { value: 'sentence', label: '句子' },
];

let allEntries: VocabularyReviewEntry[] = [];
let loadedRecords: StudyRecord[] = [];
let activeRecordPrefix = '';
let activeContentKind: VocabularyContentKind = '單字';
let activePartOfSpeech = '全部';
let groupingMode: VocabularyGroupingMode = 'alphabetical';
let searchText = '';
const editingEntryKeys = new Set<string>();

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element: ${id}`);
  return found as T;
}

function cloneRecord(record: StudyRecord): StudyRecord {
  return JSON.parse(JSON.stringify(record)) as StudyRecord;
}

function entryMatchesSearch(entry: VocabularyReviewEntry): boolean {
  if (!searchText) return true;
  const searchable = [
    entry.text,
    entry.lookupQuery,
    entry.translation,
    ...(activeContentKind === '單字' ? entry.tags : []),
    ...entry.contentKinds,
  ].join(' ').toLocaleLowerCase('en-US');
  return searchable.includes(searchText.toLocaleLowerCase('en-US'));
}

function filteredEntries(): VocabularyReviewEntry[] {
  return allEntries.filter(entry => (
    entry.contentKinds.includes(activeContentKind)
    && (
      groupingMode !== 'partOfSpeech'
      || activePartOfSpeech === '全部'
      || (activePartOfSpeech === '未標註' ? entry.tags.length === 0 : entry.tags.includes(activePartOfSpeech))
    )
    && entryMatchesSearch(entry)
  ));
}

function createWordLink(entry: VocabularyReviewEntry): HTMLElement {
  if (!entry.lookupUrl) {
    const text = document.createElement('span');
    text.className = 'vocabulary-word-text';
    text.textContent = entry.text;
    return text;
  }
  const link = document.createElement('a');
  link.className = 'vocabulary-word-link';
  link.href = entry.lookupUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = entry.text;
  link.title = `在 Oxford Learner's Dictionaries 查詢「${entry.lookupQuery}」`;
  link.setAttribute('aria-label', `${entry.text}；在 Oxford Learner's Dictionaries 開啟查詢結果`);
  return link;
}

function saveEntryEdits(
  entry: VocabularyReviewEntry,
  edits: VocabularyWordEdits,
): VocabularyReviewEntry | undefined {
  let changed = false;
  try {
    loadedRecords = loadedRecords.map(record => {
      const previous = cloneRecord(record);
      if (!updateVocabularyWordEntries(record, entry.key, edits)) return record;
      const edited = markRecordLocallyEdited(record, previous);
      localStorage.setItem(`${activeRecordPrefix}${edited.date}`, JSON.stringify(edited));
      changed = true;
      return edited;
    });
    if (!changed) return entry;
    allEntries = vocabularyReviewEntries(loadedRecords);
    const updatedKey = edits.text === undefined ? entry.key : vocabularyEntryKey(edits.text);
    const updatedEntry = allEntries.find(candidate => candidate.key === updatedKey);
    const status = element<HTMLParagraphElement>('vocabularySaveStatus');
    status.textContent = `已儲存「${updatedEntry?.text ?? entry.text}」的整理資料，回到 Tracker 後會接續雲端同步。`;
    return updatedEntry;
  } catch {
    const error = element<HTMLParagraphElement>('vocabularyError');
    error.textContent = `無法儲存「${entry.text}」的修改，請確認瀏覽器儲存權限後再試一次。`;
    error.hidden = false;
    return undefined;
  }
}

function selectedPartsOfSpeech(container: HTMLElement): Set<VocabularyPartOfSpeechField> {
  const fields = new Set<VocabularyPartOfSpeechField>();
  for (const checkbox of container.querySelectorAll<HTMLInputElement>('[data-vocabulary-pos]')) {
    if (checkbox.checked) fields.add(checkbox.dataset.vocabularyPos as VocabularyPartOfSpeechField);
  }
  return fields;
}

function createPartsOfSpeechEditor(entry: VocabularyReviewEntry): HTMLFieldSetElement {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'vocabulary-pos-editor';
  fieldset.dataset.entryKey = entry.key;
  const legend = document.createElement('legend');
  legend.textContent = '詞性';
  fieldset.append(legend);

  for (const [field, label] of VOCABULARY_PARTS_OF_SPEECH) {
    const option = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.vocabularyPos = field;
    checkbox.checked = entry.tags.includes(label);
    option.append(checkbox, document.createTextNode(label));
    fieldset.append(option);
  }
  return fieldset;
}

function createContentKindEditor(entry: VocabularyReviewEntry): HTMLFieldSetElement {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'vocabulary-kind-editor';
  const legend = document.createElement('legend');
  legend.textContent = '內容類型';
  fieldset.append(legend);

  for (const option of VOCABULARY_KIND_OPTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.vocabularyKind = option.value;
    button.textContent = option.label;
    button.setAttribute('aria-pressed', String(option.label === activeContentKind));
    fieldset.append(button);
  }
  return fieldset;
}

function createTranslationEditor(entry: VocabularyReviewEntry): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'vocabulary-translation-editor';
  const title = document.createElement('span');
  title.textContent = '中文翻譯';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = entry.translation;
  input.placeholder = '輸入中文翻譯';
  input.autocomplete = 'off';
  input.dataset.vocabularyTranslation = entry.key;
  label.append(title, input);
  return label;
}

function createTextEditor(entry: VocabularyReviewEntry): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'vocabulary-text-editor';
  const title = document.createElement('span');
  title.textContent = '英文內容';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = entry.text;
  input.placeholder = '輸入英文單字、組合或句子';
  input.autocomplete = 'off';
  input.dataset.vocabularyText = entry.key;
  label.append(title, input);
  return label;
}

function createVocabularyRow(entry: VocabularyReviewEntry): HTMLElement {
  const article = document.createElement('article');
  article.className = 'vocabulary-row';
  article.dataset.entryKey = entry.key;

  const identity = document.createElement('div');
  identity.className = 'vocabulary-identity';
  const identityHead = document.createElement('div');
  identityHead.className = 'vocabulary-identity-head';
  identityHead.append(createWordLink(entry));
  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'vocabulary-edit-button';
  editButton.dataset.editEntry = entry.key;
  editButton.textContent = editingEntryKeys.has(entry.key) ? '完成' : '編輯';
  editButton.setAttribute('aria-expanded', String(editingEntryKeys.has(entry.key)));
  editButton.setAttribute('aria-label', `${editButton.textContent}「${entry.text}」`);
  identityHead.append(editButton);
  identity.append(identityHead);
  const kinds = document.createElement('div');
  kinds.className = 'vocabulary-kinds';
  for (const kind of entry.contentKinds) {
    const badge = document.createElement('span');
    badge.textContent = kind;
    kinds.append(badge);
  }
  identity.append(kinds);
  if (entry.occurrenceCount > 1) {
    const occurrence = document.createElement('p');
    occurrence.className = 'vocabulary-occurrence';
    occurrence.textContent = `已整理 ${entry.occurrenceCount} 次`;
    identity.append(occurrence);
  }

  if (editingEntryKeys.has(entry.key)) {
    const editors = document.createElement('div');
    editors.className = 'vocabulary-editors';
    editors.append(createTextEditor(entry));
    editors.append(createContentKindEditor(entry));
    const partsOfSpeechEditor = createPartsOfSpeechEditor(entry);
    partsOfSpeechEditor.hidden = activeContentKind !== '單字';
    editors.append(partsOfSpeechEditor);
    editors.append(createTranslationEditor(entry));
    article.append(identity, editors);
  } else {
    const details = document.createElement('dl');
    details.className = 'vocabulary-readonly-details';
    const translationLabel = document.createElement('dt');
    translationLabel.textContent = '中文翻譯';
    const translationValue = document.createElement('dd');
    translationValue.textContent = entry.translation || '—';
    if (activeContentKind === '單字') {
      const partOfSpeechLabel = document.createElement('dt');
      partOfSpeechLabel.textContent = '詞性';
      const partOfSpeechValue = document.createElement('dd');
      partOfSpeechValue.textContent = entry.tags.join('、') || '未標註';
      details.append(partOfSpeechLabel, partOfSpeechValue);
    } else {
      details.classList.add('is-translation-only');
    }
    details.append(translationLabel, translationValue);
    article.append(identity, details);
  }
  return article;
}

function createVocabularyGroup(
  key: string,
  label: string,
  entries: VocabularyReviewEntry[],
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'vocabulary-letter-group';
  section.id = `vocabulary-group-${key}`;
  const heading = document.createElement('h2');
  heading.textContent = label;
  const list = document.createElement('div');
  list.className = 'vocabulary-letter-list';
  list.append(...entries.map(createVocabularyRow));
  section.append(heading, list);
  return section;
}

function renderPartOfSpeechIndex(): void {
  const singleWords = allEntries.filter(entry => entry.contentKinds.includes('單字'));
  const labels = ['全部', ...VOCABULARY_PARTS_OF_SPEECH.map(([, label]) => label), '未標註'];
  const navigation = element<HTMLDivElement>('vocabularyPartOfSpeechIndex');
  navigation.hidden = activeContentKind !== '單字' || groupingMode !== 'partOfSpeech';
  navigation.replaceChildren(...labels.map(label => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.partOfSpeech = label;
    button.textContent = label;
    button.disabled = label !== '全部' && !singleWords.some(entry => (
      label === '未標註' ? entry.tags.length === 0 : entry.tags.includes(label)
    ));
    button.setAttribute('aria-pressed', String(label === activePartOfSpeech));
    return button;
  }));
}

function partsOfSpeechGroups(entries: VocabularyReviewEntry[]): HTMLElement[] {
  const groups: HTMLElement[] = [];
  for (const [, label] of VOCABULARY_PARTS_OF_SPEECH) {
    if (activePartOfSpeech !== '全部' && activePartOfSpeech !== label) continue;
    const group = entries.filter(entry => entry.tags.includes(label));
    if (group.length > 0) groups.push(createVocabularyGroup(label.toLowerCase(), label, group));
  }
  const unclassified = entries.filter(entry => entry.tags.length === 0);
  if ((activePartOfSpeech === '全部' || activePartOfSpeech === '未標註') && unclassified.length > 0) {
    groups.push(createVocabularyGroup('unclassified', '未標註', unclassified));
  }
  return groups;
}

function renderGroupingSwitch(): void {
  const switcher = element<HTMLDivElement>('vocabularyGrouping');
  switcher.hidden = activeContentKind !== '單字';
  switcher.dataset.active = groupingMode === 'alphabetical' ? '0' : '1';
  for (const button of switcher.querySelectorAll<HTMLButtonElement>('[data-grouping-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.groupingMode === groupingMode));
  }
}

function renderContentKindSwitch(): void {
  const switcher = element<HTMLDivElement>('vocabularyContentKind');
  const kinds: VocabularyContentKind[] = ['單字', '組合', '句子'];
  switcher.dataset.active = String(kinds.indexOf(activeContentKind));
  for (const button of switcher.querySelectorAll<HTMLButtonElement>('[data-content-kind]')) {
    button.setAttribute('aria-pressed', String(button.dataset.contentKind === activeContentKind));
  }
}

function renderEntries(): void {
  const entries = filteredEntries();
  const list = element<HTMLDivElement>('vocabularyList');
  const empty = element<HTMLParagraphElement>('vocabularyEmpty');
  list.classList.toggle('is-flat', groupingMode === 'alphabetical');
  list.replaceChildren(...(
    groupingMode === 'alphabetical'
      ? entries.map(createVocabularyRow)
      : partsOfSpeechGroups(entries)
  ));
  empty.hidden = entries.length > 0;
  empty.textContent = allEntries.length === 0
    ? '目前尚未在 Tracker 新增英文單字。'
    : '找不到符合目前篩選條件的單字。';
  element<HTMLElement>('visibleVocabularyCount').textContent = `${entries.length} 個`;
}

function render(): void {
  renderContentKindSwitch();
  renderGroupingSwitch();
  renderPartOfSpeechIndex();
  renderEntries();
  element<HTMLElement>('totalVocabularyCount').textContent = `${allEntries.length} 個不重複內容`;
}

function load(): void {
  try {
    const result = readMaterialProgressRecords(localStorage);
    loadedRecords = result.records;
    activeRecordPrefix = result.prefix;
    allEntries = vocabularyReviewEntries(loadedRecords);
    const source = result.prefix.startsWith('study-v11:user:') ? '目前登入帳號的本機同步資料' : '訪客本機資料';
    element<HTMLParagraphElement>('vocabularySource').textContent = `${source}｜共讀取 ${result.records.length} 天紀錄`;
    element<HTMLParagraphElement>('vocabularyError').hidden = true;
  } catch {
    loadedRecords = [];
    activeRecordPrefix = '';
    allEntries = [];
    element<HTMLParagraphElement>('vocabularySource').textContent = '無法讀取 Tracker 紀錄';
    const error = element<HTMLParagraphElement>('vocabularyError');
    error.textContent = '瀏覽器目前不允許存取 Tracker 的本機同步資料，請回到 Tracker 確認瀏覽器儲存權限。';
    error.hidden = false;
  }
  render();
}

element<HTMLInputElement>('vocabularySearch').addEventListener('input', event => {
  searchText = (event.target as HTMLInputElement).value.trim();
  renderEntries();
});
element<HTMLDivElement>('vocabularyContentKind').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-content-kind]');
  const kind = button?.dataset.contentKind;
  if (kind !== '單字' && kind !== '組合' && kind !== '句子') return;
  activeContentKind = kind;
  groupingMode = 'alphabetical';
  activePartOfSpeech = '全部';
  render();
});
element<HTMLDivElement>('vocabularyGrouping').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-grouping-mode]');
  if (!button) return;
  groupingMode = button.dataset.groupingMode === 'partOfSpeech' ? 'partOfSpeech' : 'alphabetical';
  activePartOfSpeech = '全部';
  render();
});
element<HTMLDivElement>('vocabularyPartOfSpeechIndex').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-part-of-speech]');
  if (!button || button.disabled) return;
  activePartOfSpeech = button.dataset.partOfSpeech ?? '全部';
  renderPartOfSpeechIndex();
  renderEntries();
});
element<HTMLDivElement>('vocabularyList').addEventListener('change', event => {
  const target = event.target as HTMLInputElement;
  const row = target.closest<HTMLElement>('[data-entry-key]');
  const entry = allEntries.find(candidate => candidate.key === row?.dataset.entryKey);
  if (!entry) return;
  if (target.matches('[data-vocabulary-text]')) {
    const text = target.value.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!text) {
      target.value = entry.text;
      const error = element<HTMLParagraphElement>('vocabularyError');
      error.textContent = '英文內容不可空白，原內容已保留。';
      error.hidden = false;
      return;
    }
    const previousKey = entry.key;
    const updatedEntry = saveEntryEdits(entry, { text });
    if (!row || !updatedEntry) return;
    row.dataset.entryKey = updatedEntry.key;
    editingEntryKeys.delete(previousKey);
    editingEntryKeys.add(updatedEntry.key);
    const editButton = row.querySelector<HTMLButtonElement>('[data-edit-entry]');
    if (editButton) {
      editButton.dataset.editEntry = updatedEntry.key;
      editButton.setAttribute('aria-label', `完成「${updatedEntry.text}」`);
    }
    const word = row.querySelector<HTMLElement>('.vocabulary-word-link, .vocabulary-word-text');
    if (word) word.replaceWith(createWordLink(updatedEntry));
    target.value = updatedEntry.text;
    target.dataset.vocabularyText = updatedEntry.key;
    element<HTMLParagraphElement>('vocabularyError').hidden = true;
    return;
  }
  if (target.matches('[data-vocabulary-pos]')) {
    const fieldset = target.closest<HTMLElement>('.vocabulary-pos-editor');
    if (fieldset) saveEntryEdits(entry, { partsOfSpeech: selectedPartsOfSpeech(fieldset) });
    return;
  }
  if (target.matches('[data-vocabulary-translation]')) {
    saveEntryEdits(entry, { translation: target.value.trim() });
  }
});
element<HTMLDivElement>('vocabularyList').addEventListener('click', event => {
  const kindButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-vocabulary-kind]');
  if (kindButton) {
    const row = kindButton.closest<HTMLElement>('[data-entry-key]');
    const entry = allEntries.find(candidate => candidate.key === row?.dataset.entryKey);
    const kind = kindButton.dataset.vocabularyKind as VocabularyRecordKind | undefined;
    const option = VOCABULARY_KIND_OPTIONS.find(candidate => candidate.value === kind);
    if (!row || !entry || !option) return;
    saveEntryEdits(entry, { contentKind: option.value });
    for (const button of row.querySelectorAll<HTMLButtonElement>('[data-vocabulary-kind]')) {
      button.setAttribute('aria-pressed', String(button === kindButton));
    }
    const partsOfSpeechEditor = row.querySelector<HTMLFieldSetElement>('.vocabulary-pos-editor');
    if (partsOfSpeechEditor) partsOfSpeechEditor.hidden = option.value !== 'word';
    const kinds = row.querySelector<HTMLElement>('.vocabulary-kinds');
    if (kinds) {
      const badge = document.createElement('span');
      badge.textContent = option.label;
      kinds.replaceChildren(badge);
    }
    return;
  }
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-edit-entry]');
  if (!button) return;
  const key = button.dataset.editEntry;
  if (!key) return;
  if (editingEntryKeys.has(key)) editingEntryKeys.delete(key);
  else editingEntryKeys.add(key);
  renderEntries();
  if (editingEntryKeys.has(key)) {
    element<HTMLDivElement>('vocabularyList')
      .querySelector<HTMLInputElement>(`[data-entry-key="${CSS.escape(key)}"] [data-vocabulary-translation]`)
      ?.focus();
  }
});
element<HTMLButtonElement>('refreshVocabulary').addEventListener('click', load);
window.addEventListener('storage', load);
load();
