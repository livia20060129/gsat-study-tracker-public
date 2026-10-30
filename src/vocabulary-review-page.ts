import './vocabulary-review.css';
import { saveLocalRecordEdit } from './application/records/localRecordEdits.ts';
import { DictionaryPreview } from './ui/dictionaryPreview.ts';
import { VocabularySpeech, type VocabularyAccent } from './ui/vocabularySpeech.ts';
import { readMaterialProgressRecords } from './study/materialProgress.ts';
import {
  normalizedGsatVocabularyLevel,
  updateVocabularyWordEntries,
  VOCABULARY_CONTENT_KINDS,
  VOCABULARY_PARTS_OF_SPEECH,
  vocabularyEntryKey,
  vocabularyEntryHasVisibleLevel,
  vocabularyLevelGroups,
  vocabularyReviewEntries,
  type VocabularyContentKind,
  type VocabularyPartOfSpeechField,
  type VocabularyReviewEntry,
  type VocabularyWordEdits,
} from './study/vocabularyReview.ts';
import { vocabularyTranslationGroups } from './study/vocabularyTranslationCounts.ts';
import { vocabularyMeaningGroups } from './study/vocabularyMeaningGroups.ts';
import { vocabularyPrintDocument } from './study/vocabularyPrint.ts';
import { vocabularyReference } from './study/vocabularyAutoFill.ts';
import type { StudyRecord, VocabularyTranslations } from './types.ts';

const GROUPING_MODES = ['alphabetical', 'partOfSpeech', 'gsatLevel'] as const;
type VocabularyGroupingMode = (typeof GROUPING_MODES)[number];

let allEntries: VocabularyReviewEntry[] = [];
let loadedRecords: StudyRecord[] = [];
let activeRecordPrefix = '';
let activeContentKind: VocabularyContentKind = '單字';
let activePartOfSpeech = '全部';
let groupingMode: VocabularyGroupingMode = 'alphabetical';
let searchText = '';
let translationsVisible = true;
const editingEntryKeys = new Set<string>();
const dictionaryPreviews = new Set<DictionaryPreview>();
const speech = new VocabularySpeech(document.getElementById('vocabularySpeechStatus')!);
window.addEventListener('pagehide', function stopSpeech(): void { speech.cancel(); });

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
    && (groupingMode !== 'gsatLevel' || vocabularyEntryHasVisibleLevel(entry))
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

function saveEntryEditsResult(entry: VocabularyReviewEntry, edits: VocabularyWordEdits): 'saved' | 'unchanged' | 'failed' {
  let changed = false;
  try {
    for (const [index, base] of loadedRecords.entries()) {
      const edited = saveLocalRecordEdit(localStorage, activeRecordPrefix, base, function applyWordEdit(record): StudyRecord | null {
        const draft = cloneRecord(record);
        return updateVocabularyWordEntries(draft, entry.key, edits) ? draft : null;
      });
      if (!edited) continue;
      changed = true;
      loadedRecords[index] = edited;
    }
    if (!changed) return 'unchanged';
    allEntries = vocabularyReviewEntries(loadedRecords);
    const status = element<HTMLParagraphElement>('vocabularySaveStatus');
    status.textContent = `已儲存「${edits.text ?? entry.text}」的整理資料，回到 Tracker 後會接續雲端同步。`;
    element<HTMLParagraphElement>('vocabularyError').hidden = true;
    return 'saved';
  } catch (cause) {
    allEntries = vocabularyReviewEntries(loadedRecords);
    const error = element<HTMLParagraphElement>('vocabularyError');
    error.textContent = cause instanceof Error ? cause.message : `無法儲存「${entry.text}」的修改，請確認瀏覽器儲存權限後再試一次。`;
    error.hidden = false;
    return 'failed';
  }
}

function saveEntryEdits(entry: VocabularyReviewEntry, edits: VocabularyWordEdits): boolean {
  return saveEntryEditsResult(entry, edits) === 'saved';
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

  for (const kind of VOCABULARY_CONTENT_KINDS) {
    const option = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = `vocabulary-kind-${entry.key}`;
    radio.value = kind;
    radio.dataset.vocabularyContentKind = kind;
    radio.checked = kind === activeContentKind;
    option.append(radio, document.createTextNode(kind));
    fieldset.append(option);
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

function createGsatLevelEditor(entry: VocabularyReviewEntry): HTMLElement {
  const editor = document.createElement('div');
  editor.className = 'vocabulary-level-editor';
  const visibilityLabel = document.createElement('label');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.dataset.vocabularyLevelVisible = '';
  checkbox.checked = entry.showGsatLevel;
  visibilityLabel.append(checkbox, document.createTextNode('顯示學測單字級數'));
  const levelLabel = document.createElement('label');
  levelLabel.className = 'vocabulary-level-select';
  const labelText = document.createElement('span');
  labelText.textContent = '學測單字級數';
  const select = document.createElement('select');
  select.dataset.vocabularyLevel = '';
  for (let level = 1; level <= 6; level += 1) {
    const option = document.createElement('option');
    option.value = String(level);
    option.textContent = `Level ${level}`;
    select.append(option);
  }
  select.value = String(entry.gsatLevel ?? 1);
  select.disabled = !checkbox.checked;
  levelLabel.append(labelText, select);
  editor.append(visibilityLabel, levelLabel);
  return editor;
}

function createTranslationGroup(field: keyof VocabularyTranslations, label: string, values: string[]): HTMLElement {
  const group = document.createElement('fieldset');
  group.className = 'vocabulary-translation-group';
  group.dataset.translationGroup = field;
  const legend = document.createElement('legend');
  legend.textContent = `${label} 中文翻譯`;
  group.append(legend);
  for (const [index, value] of values.entries()) {
    const row = document.createElement('div');
    row.className = 'vocabulary-translation-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.placeholder = '輸入一個中文翻譯';
    input.autocomplete = 'off';
    input.dataset.vocabularyPosTranslation = field;
    input.setAttribute('aria-label', `${label} 中文翻譯 ${index + 1}`);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.deleteTranslation = String(index);
    remove.textContent = '刪除';
    remove.disabled = values.length <= 1;
    remove.setAttribute('aria-label', `刪除 ${label} 第 ${index + 1} 個翻譯`);
    row.append(input, remove);
    group.append(row);
  }
  const add = document.createElement('button');
  add.type = 'button';
  add.dataset.addTranslation = '';
  add.textContent = '新增翻譯';
  add.setAttribute('aria-label', `新增 ${label} 翻譯`);
  group.append(add);
  return group;
}

function createWordTranslationEditor(entry: VocabularyReviewEntry): HTMLElement {
  const editor = document.createElement('div');
  editor.className = 'vocabulary-word-translations';
  const groups = vocabularyTranslationGroups(entry.translation, entry.tags, entry.translationsByPartOfSpeech);
  for (const [field, label] of VOCABULARY_PARTS_OF_SPEECH) {
    if (entry.tags.includes(label)) editor.append(createTranslationGroup(field, label, groups[field] ?? ['']));
  }
  if (groups.unclassified) editor.append(createTranslationGroup('unclassified', entry.dictionarySources?.length ? '未分詞性' : '未分詞性（舊翻譯）', groups.unclassified));
  if (!editor.childElementCount) {
    const hint = document.createElement('p');
    hint.className = 'vocabulary-translation-hint';
    hint.textContent = '勾選詞性後會顯示對應的中文翻譯欄。';
    editor.append(hint);
  }
  return editor;
}

function createReadonlyTranslations(entry: VocabularyReviewEntry): HTMLElement {
  const container = document.createElement('div');
  container.className = 'vocabulary-readonly-translations';
  for (const { partOfSpeech, meanings } of vocabularyMeaningGroups(entry, activeContentKind)) {
    const group = document.createElement('div');
    if (partOfSpeech) {
      const heading = document.createElement('strong');
      heading.textContent = partOfSpeech;
      group.append(heading);
    }
    for (const meaning of meanings) {
      const translation = document.createElement('p');
      translation.className = 'vocabulary-meaning';
      const answer = document.createElement('span');
      answer.className = 'vocabulary-meaning-answer';
      answer.textContent = meaning || '－';
      const mask = document.createElement('span');
      mask.className = 'vocabulary-meaning-mask';
      mask.textContent = '－';
      translation.append(answer, mask);
      group.append(translation);
    }
    container.append(group);
  }
  setTranslationVisibility(container);
  return container;
}

function setTranslationVisibility(container: HTMLElement): void {
  container.classList.toggle('is-masked', !translationsVisible);
  for (const answer of container.querySelectorAll('.vocabulary-meaning-answer')) {
    answer.setAttribute('aria-hidden', String(!translationsVisible));
  }
  for (const mask of container.querySelectorAll('.vocabulary-meaning-mask')) {
    mask.setAttribute('aria-hidden', String(translationsVisible));
  }
}

function updateTranslationVisibility(): void {
  element<HTMLButtonElement>('toggleVocabularyTranslations').textContent = translationsVisible ? '隱藏中文' : '顯示中文';
  element<HTMLButtonElement>('toggleVocabularyTranslations').setAttribute('aria-pressed', String(!translationsVisible));
  for (const row of element<HTMLDivElement>('vocabularyList').querySelectorAll<HTMLElement>('.vocabulary-row')) {
    const entry = allEntries.find(candidate => candidate.key === row.dataset.entryKey);
    if (!entry || editingEntryKeys.has(entry.key)) continue;
    const existing = row.querySelector<HTMLElement>('.vocabulary-readonly-translations');
    if (existing) setTranslationVisibility(existing);
  }
}

function createVocabularyRow(entry: VocabularyReviewEntry): HTMLElement {
  const article = document.createElement('article');
  article.className = 'vocabulary-row';
  article.dataset.entryKey = entry.key;

  const identity = document.createElement('div');
  identity.className = 'vocabulary-identity';
  const identityHead = document.createElement('div');
  identityHead.className = 'vocabulary-identity-head';
  const wordHeading = document.createElement('div');
  wordHeading.className = 'vocabulary-word-heading';
  wordHeading.append(createWordLink(entry));
  if (entry.lookupQuery) {
    const speaker = document.createElement('button');
    speaker.type = 'button';
    speaker.className = 'vocabulary-speaker';
    speaker.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>';
    speaker.setAttribute('aria-label', `朗讀「${entry.text}」`);
    speaker.setAttribute('aria-pressed', 'false');
    speaker.addEventListener('click', function pronounce(): void {
      speech.speak(entry.lookupQuery, element<HTMLSelectElement>('vocabularyAccent').value as VocabularyAccent, speaker);
    });
    wordHeading.append(speaker);
  }
  identityHead.append(wordHeading);
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
  if (activeContentKind === '單字' && !editingEntryKeys.has(entry.key) && entry.showGsatLevel && entry.gsatLevel !== null) {
    const levelBadge = document.createElement('span');
    levelBadge.className = 'vocabulary-gsat-level';
    levelBadge.textContent = `學測 Level ${entry.gsatLevel}`;
    kinds.append(levelBadge);
  }
  identity.append(kinds);
  if (entry.referenceSources?.ceec) {
    const reference = vocabularyReference(entry.text);
    if (reference && reference.levels.length > 1) {
      const note = document.createElement('p');
      note.className = 'vocabulary-occurrence';
      note.textContent = `官方表含 ${reference.levels.map(level => `Level ${level}`).join('／')}，自動帶入較低級。`;
      identity.append(note);
    }
  }
  if (entry.sourceDates.length > 1) {
    const occurrence = document.createElement('p');
    occurrence.className = 'vocabulary-frequency-badge';
    occurrence.textContent = `🔥 記錄 ${entry.sourceDates.length} 次`;
    occurrence.title = '依不同日期的紀錄計算，同一天重複輸入只計一次。';
    identity.append(occurrence);
  }

  if (editingEntryKeys.has(entry.key)) {
    const editors = document.createElement('div');
    editors.className = 'vocabulary-editors';
    editors.append(createTextEditor(entry));
    editors.append(createContentKindEditor(entry));
    if (activeContentKind === '單字') {
      editors.append(createPartsOfSpeechEditor(entry));
      editors.append(createWordTranslationEditor(entry));
      editors.append(createGsatLevelEditor(entry));
      const preview = new DictionaryPreview({ word: entry.text, apply: function applySelection(selection): 'saved' | 'unchanged' | 'failed' {
        const current = allEntries.find(candidate => candidate.key === entry.key);
        if (!current || !editingEntryKeys.has(current.key) || !current.contentKinds.includes('單字')) return 'failed';
        const outcome = saveEntryEditsResult(current, { dictionarySelection: selection });
        if (outcome === 'saved') renderEntries();
        return outcome;
      } });
      dictionaryPreviews.add(preview);
      editors.append(preview.element);
    } else {
      editors.classList.add('is-translation-only');
      editors.append(createTranslationEditor(entry));
    }
    article.append(identity, editors);
  } else {
    article.append(identity, createReadonlyTranslations(entry));
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
  switcher.dataset.active = String(GROUPING_MODES.indexOf(groupingMode));
  for (const button of switcher.querySelectorAll<HTMLButtonElement>('[data-grouping-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.groupingMode === groupingMode));
  }
}

function renderContentKindSwitch(): void {
  const switcher = element<HTMLDivElement>('vocabularyContentKind');
  switcher.dataset.active = String(VOCABULARY_CONTENT_KINDS.indexOf(activeContentKind));
  for (const button of switcher.querySelectorAll<HTMLButtonElement>('[data-content-kind]')) {
    button.setAttribute('aria-pressed', String(button.dataset.contentKind === activeContentKind));
  }
}

function renderEntries(): void {
  element('vocabularyLegacySources').hidden = !allEntries.some(entry => entry.dictionarySources?.some(source => source.provider === 'cambridge'));
  speech.cancel();
  for (const preview of dictionaryPreviews) preview.dispose();
  dictionaryPreviews.clear();
  const entries = filteredEntries();
  const list = element<HTMLDivElement>('vocabularyList');
  const empty = element<HTMLParagraphElement>('vocabularyEmpty');
  list.classList.toggle('is-flat', groupingMode === 'alphabetical');
  list.classList.toggle('is-word-grid', activeContentKind === '單字');
  let rows: HTMLElement[];
  switch (groupingMode) {
    case 'partOfSpeech':
      rows = partsOfSpeechGroups(entries);
      break;
    case 'gsatLevel':
      rows = vocabularyLevelGroups(entries).map(group => createVocabularyGroup(`level-${group.level}`, group.label, group.entries));
      break;
    default:
      rows = entries.map(createVocabularyRow);
  }
  list.replaceChildren(...rows);
  empty.hidden = entries.length > 0;
  if (!allEntries.length) empty.textContent = '目前尚未在 Tracker 新增英文單字。';
  else if (groupingMode === 'gsatLevel' && !searchText) empty.textContent = '目前沒有勾選顯示學測級數的單字。';
  else empty.textContent = '找不到符合目前篩選條件的單字。';
  element<HTMLElement>('visibleVocabularyCount').textContent = `${entries.length} 個`;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-export-vocabulary]')) button.disabled = entries.length === 0;
}

function exportVocabulary(withTranslations: boolean): void {
  let entries = filteredEntries();
  if (!entries.length) return;
  if (groupingMode === 'gsatLevel') entries = vocabularyLevelGroups(entries).flatMap(group => group.entries);
  else if (groupingMode === 'partOfSpeech') {
    const ordered = VOCABULARY_PARTS_OF_SPEECH.flatMap(([, label]) => entries.filter(entry => entry.tags.includes(label)));
    ordered.push(...entries.filter(entry => entry.tags.length === 0));
    entries = [...new Map(ordered.map(entry => [entry.key, entry])).values()];
  }
  const html = vocabularyPrintDocument(entries, activeContentKind, withTranslations);
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function render(): void {
  renderContentKindSwitch();
  renderGroupingSwitch();
  renderPartOfSpeechIndex();
  renderEntries();
  element<HTMLElement>('totalVocabularyCount').textContent = `${allEntries.length} 個不重複單字／片語`;
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
  const mode = button.dataset.groupingMode;
  if (!GROUPING_MODES.includes(mode as VocabularyGroupingMode)) return;
  groupingMode = mode as VocabularyGroupingMode;
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
function saveTranslationGroup(entry: VocabularyReviewEntry, group: HTMLElement): boolean {
  const field = group.dataset.translationGroup as keyof VocabularyTranslations;
  const groups = vocabularyTranslationGroups(entry.translation, entry.tags, entry.translationsByPartOfSpeech);
  groups[field] = [...group.querySelectorAll<HTMLInputElement>('[data-vocabulary-pos-translation]')].map(input => input.value);
  return saveEntryEdits(entry, { translationsByPartOfSpeech: groups });
}

element<HTMLDivElement>('vocabularyList').addEventListener('input', event => {
  const target = event.target as HTMLInputElement;
  if (!target.matches('[data-vocabulary-pos-translation]')) return;
  const row = target.closest<HTMLElement>('.vocabulary-row');
  const entry = allEntries.find(candidate => candidate.key === row?.dataset.entryKey);
  const group = target.closest<HTMLElement>('[data-translation-group]');
  if (entry && group) saveTranslationGroup(entry, group);
});

element<HTMLDivElement>('vocabularyList').addEventListener('change', event => {
  const target = event.target as HTMLInputElement;
  const row = target.closest<HTMLElement>('[data-entry-key]');
  const entry = allEntries.find(candidate => candidate.key === row?.dataset.entryKey);
  if (!entry) return;
  if (target.matches('[data-vocabulary-level-visible], [data-vocabulary-level]')) {
    const editor = target.closest<HTMLElement>('.vocabulary-level-editor');
    const checkbox = editor?.querySelector<HTMLInputElement>('[data-vocabulary-level-visible]');
    const select = editor?.querySelector<HTMLSelectElement>('[data-vocabulary-level]');
    if (!checkbox || !select) return;
    const level = normalizedGsatVocabularyLevel(select.value);
    if (level === null) return;
    const previous = { visible: entry.showGsatLevel, level: entry.gsatLevel };
    const saved = saveEntryEdits(entry, { showGsatLevel: checkbox.checked, gsatLevel: level });
    if (!saved && (previous.visible !== checkbox.checked || previous.level !== level)) {
      checkbox.checked = previous.visible;
      select.value = String(previous.level ?? 1);
    }
    select.disabled = !checkbox.checked;
    return;
  }
  if (target.matches('[data-vocabulary-content-kind]')) {
    const kind = target.dataset.vocabularyContentKind as VocabularyContentKind;
    if (!VOCABULARY_CONTENT_KINDS.includes(kind)) return;
    saveEntryEdits(entry, { contentKind: kind });
    activeContentKind = kind;
    groupingMode = 'alphabetical';
    activePartOfSpeech = '全部';
    render();
    return;
  }
  if (target.matches('[data-vocabulary-text]')) {
    const nextText = target.value.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!nextText) {
      target.value = entry.text;
      const error = element<HTMLParagraphElement>('vocabularyError');
      error.textContent = '英文內容不能留白。';
      error.hidden = false;
      return;
    }
    if (nextText === entry.text) return;
    if (!saveEntryEdits(entry, { text: nextText })) {
      target.value = entry.text;
      return;
    }
    element<HTMLParagraphElement>('vocabularyError').hidden = true;
    editingEntryKeys.delete(entry.key);
    editingEntryKeys.add(vocabularyEntryKey(nextText));
    renderEntries();
    return;
  }
  if (target.matches('[data-vocabulary-pos]')) {
    const fieldset = target.closest<HTMLElement>('.vocabulary-pos-editor');
    if (!fieldset) return;
    const partsOfSpeech = selectedPartsOfSpeech(fieldset);
    const tags = VOCABULARY_PARTS_OF_SPEECH.filter(([field]) => partsOfSpeech.has(field)).map(([, label]) => label);
    const groups = vocabularyTranslationGroups(entry.translation, tags, entry.translationsByPartOfSpeech);
    for (const field of partsOfSpeech) groups[field] ??= [''];
    if (saveEntryEdits(entry, { partsOfSpeech, translationsByPartOfSpeech: groups })) renderEntries();
    return;
  }
  if (target.matches('[data-vocabulary-translation]')) {
    saveEntryEdits(entry, { translation: target.value.trim() });
  }
});
element<HTMLDivElement>('vocabularyList').addEventListener('click', event => {
  const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-add-translation], [data-delete-translation]');
  if (action) {
    if (action.disabled) return;
    const row = action.closest<HTMLElement>('.vocabulary-row');
    const entry = allEntries.find(candidate => candidate.key === row?.dataset.entryKey);
    const group = action.closest<HTMLElement>('[data-translation-group]');
    if (!entry || !group) return;
    const field = group.dataset.translationGroup as keyof VocabularyTranslations;
    const values = [...group.querySelectorAll<HTMLInputElement>('[data-vocabulary-pos-translation]')].map(input => input.value);
    if (action.hasAttribute('data-add-translation')) values.push('');
    else if (values.length > 1) values.splice(Number(action.dataset.deleteTranslation), 1);
    else return;
    const groups = vocabularyTranslationGroups(entry.translation, entry.tags, entry.translationsByPartOfSpeech);
    groups[field] = values;
    if (saveEntryEdits(entry, { translationsByPartOfSpeech: groups })) renderEntries();
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
      .querySelector<HTMLInputElement>(`[data-entry-key="${CSS.escape(key)}"] [data-vocabulary-content-kind]:checked`)
      ?.focus();
  }
});
element<HTMLButtonElement>('refreshVocabulary').addEventListener('click', load);
element<HTMLButtonElement>('toggleVocabularyTranslations').addEventListener('click', () => {
  translationsVisible = !translationsVisible;
  updateTranslationVisibility();
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-export-vocabulary]')) {
  button.addEventListener('click', () => exportVocabulary(button.dataset.exportVocabulary === 'translated'));
}
window.addEventListener('storage', load);
load();
