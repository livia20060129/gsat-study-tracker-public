import { saveCatalogMaterial } from '../application/records/catalogEdits.ts';
import { catalogGroups, catalogModeNoun, catalogOverrides, catalogValidationError, type CatalogMaterial, type CatalogSection, type CatalogSubject } from '../study/materialCatalog.ts';
import type { StudyRecord } from '../types.ts';

export interface MaterialCatalogContext {
  prefix: string;
  records: StudyRecord[];
  entries: CatalogMaterial[];
  defaultSubject: CatalogSubject;
}

interface MaterialCatalogEditorOptions {
  builtins: readonly CatalogMaterial[];
  context: () => MaterialCatalogContext;
  onSaved: (entry: CatalogMaterial) => void;
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element: ${id}`);
  return found as T;
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export class MaterialCatalogEditor {
  private readonly options: MaterialCatalogEditorOptions;
  private editing: CatalogMaterial | null = null;
  private expected: CatalogMaterial | null = null;
  private editingPrefix = '';
  private busy = false;
  private managementEnabled = false;

  constructor(options: MaterialCatalogEditorOptions) {
    this.options = options;
    element('toggleMaterialEditing').addEventListener('click', () => this.toggleManagement());
    element('newMaterial').addEventListener('click', () => this.open());
    element('catalogSubject').addEventListener('change', () => this.updateGroups());
    element('catalogMode').addEventListener('change', () => this.updateLabels());
    element('cancelCatalogEdit').addEventListener('click', () => this.close());
    element('deleteCatalogMaterial').addEventListener('click', () => this.deleteEditingMaterial());
    element('addCatalogSection').addEventListener('click', () => {
      element('catalogSections').append(this.sectionRow({ id: crypto.randomUUID(), topic: '', detail: '', start: 1, end: 1 }));
    });
    element('catalogForm').addEventListener('submit', event => {
      event.preventDefault();
      if (this.editing) void this.commit(this.readDraft(), this.expected, this.editingPrefix);
    });
  }

  private toggleManagement(): void {
    if (this.busy) return;
    this.managementEnabled = !this.managementEnabled;
    const toggle = element<HTMLButtonElement>('toggleMaterialEditing');
    toggle.textContent = this.managementEnabled ? '完成' : '編輯';
    toggle.setAttribute('aria-pressed', String(this.managementEnabled));
    element('newMaterial').hidden = !this.managementEnabled;
    element('catalogEditor').hidden = !this.managementEnabled || !this.editing;
    document.querySelectorAll<HTMLElement>('.material-row-actions').forEach(actions => {
      actions.hidden = !this.managementEnabled;
    });
  }

  private message(text: string, error = false): void {
    element('catalogError').hidden = !error;
    element('catalogError').textContent = error ? text : '';
    element('catalogStatus').textContent = error ? '' : text;
  }

  private updateGroups(selected?: string): void {
    const groups = catalogGroups(element<HTMLSelectElement>('catalogSubject').value as CatalogSubject);
    const select = element<HTMLSelectElement>('catalogGroup');
    select.replaceChildren(...groups.map(group => new Option(group, group)));
    if (selected && groups.includes(selected)) select.value = selected;
  }

  private updateLabels(): void {
    const mode = element<HTMLSelectElement>('catalogMode').value as CatalogMaterial['mode'];
    element('catalogTotalLabel').textContent = `總${catalogModeNoun(mode)}數`;
  }

  private sectionRow(section: CatalogSection): HTMLElement {
    const row = document.createElement('div');
    row.className = 'catalog-section';
    row.dataset.sectionId = section.id;
    for (const [field, name] of [['topic', '大單元'], ['detail', '小主題（可不填）'], ['start', '起始'], ['end', '結束']] as const) {
      const label = document.createElement('label');
      label.textContent = name;
      const input = document.createElement('input');
      input.dataset.sectionField = field;
      input.value = String(section[field]);
      if (field === 'start' || field === 'end') {
        input.type = 'number'; input.min = '1'; input.step = '1'; input.required = true;
      } else {
        input.maxLength = 200; input.required = field === 'topic';
      }
      label.append(input);
      row.append(label);
    }
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'material-control danger'; remove.textContent = '刪除此列';
    remove.addEventListener('click', () => row.remove());
    row.append(remove);
    return row;
  }

  open(entry?: CatalogMaterial): void {
    if (this.busy || !this.managementEnabled) return;
    const context = this.options.context();
    const subject = context.defaultSubject;
    this.editing = clone(entry ?? {
      id: `custom:${crypto.randomUUID()}`, title: '', subject, group: subject === '英文' ? '補充' : catalogGroups(subject)[0],
      mode: 'pages', total: 1, sections: [], revision: 0, updatedAt: '',
    });
    this.expected = clone(catalogOverrides(context.records).find(current => current.id === this.editing!.id) ?? null);
    this.editingPrefix = context.prefix;
    element('catalogEditorTitle').textContent = entry ? '編輯教材' : '新增教材';
    element('deleteCatalogMaterial').hidden = !entry || !!entry.deleted;
    element<HTMLInputElement>('catalogTitle').value = this.editing.title;
    element<HTMLSelectElement>('catalogSubject').value = this.editing.subject;
    this.updateGroups(this.editing.group);
    element<HTMLSelectElement>('catalogMode').value = this.editing.mode;
    element<HTMLInputElement>('catalogTotal').value = this.editing.total > 10000 ? '' : String(this.editing.total);
    this.updateLabels();
    element('catalogSections').replaceChildren(...this.editing.sections.map(section => this.sectionRow(section)));
    element('catalogEditor').hidden = false;
    element('catalogEditor').scrollIntoView({ block: 'start' });
    element<HTMLInputElement>('catalogTitle').focus({ preventScroll: true });
  }

  private close(): void {
    if (this.busy) return;
    this.editing = null;
    element('catalogEditor').hidden = true;
  }

  private deleteEditingMaterial(): void {
    const entry = this.editing;
    if (this.busy || !entry || entry.deleted) return;
    if (!this.options.context().entries.some(material => material.id === entry.id)) return;
    if (confirm(`刪除「${entry.title}」的目錄？既有讀書紀錄會保留。`)) {
      void this.commit({ ...entry, deleted: true }, this.expected, this.editingPrefix);
    }
  }

  private readDraft(): CatalogMaterial {
    if (!this.editing) throw new Error('請先選擇教材。');
    const sections = [...element('catalogSections').querySelectorAll<HTMLElement>('[data-section-id]')].map(function readSection(row): CatalogSection {
      function value(field: string): string { return row.querySelector<HTMLInputElement>(`[data-section-field="${field}"]`)!.value.trim(); }
      return { id: row.dataset.sectionId!, start: Number(value('start')), end: Number(value('end')), topic: value('topic'), detail: value('detail') };
    });
    return {
      ...this.editing, title: element<HTMLInputElement>('catalogTitle').value.trim(),
      subject: element<HTMLSelectElement>('catalogSubject').value as CatalogSubject,
      group: element<HTMLSelectElement>('catalogGroup').value,
      mode: element<HTMLSelectElement>('catalogMode').value as CatalogMaterial['mode'],
      total: Number(element<HTMLInputElement>('catalogTotal').value),
      sections: sections.sort((left, right) => left.start - right.start), deleted: false, reset: false,
    };
  }

  actions(entry: CatalogMaterial): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'material-row-actions';
    actions.hidden = !this.managementEnabled;
    const context = this.options.context();
    const expected = catalogOverrides(context.records).find(current => current.id === entry.id) ?? null;
    const prefix = context.prefix;
    const commit = (changed: CatalogMaterial): void => { void this.commit(changed, expected, prefix); };
    function action(label: string, handler: () => void): void {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label;
      button.className = 'material-control';
      button.dataset.catalogAction = entry.id;
      button.addEventListener('click', handler);
      actions.append(button);
    }
    action('編輯', () => this.open(entry));
    if (entry.deleted) action('恢復教材', () => commit({ ...entry, deleted: false }));
    const builtin = this.options.builtins.find(current => current.id === entry.id);
    if (builtin && entry.revision > 0) action('還原內建', () => {
      if (confirm('還原此教材的內建目錄設定？已填紀錄會保留。')) commit({ ...builtin, reset: true });
    });
    return actions;
  }

  private async commit(entry: CatalogMaterial, base: CatalogMaterial | null, prefix: string): Promise<void> {
    if (this.busy) return;
    const error = catalogValidationError(entry);
    if (error) { this.message(error, true); return; }
    const entries = this.options.context().entries;
    const duplicate = entries.some(other => other.id !== entry.id && !other.deleted && other.subject === entry.subject && other.title.toLowerCase() === entry.title.toLowerCase());
    if (!entry.deleted && !entry.reset && duplicate) { this.message('同科目已有相同書名，請編輯原教材或使用不同名稱。', true); return; }
    this.busy = true;
    this.setBusy(true);
    try {
      const updated = { ...entry, revision: (base?.revision ?? 0) + 1, updatedAt: new Date().toISOString() };
      await saveCatalogMaterial(localStorage, prefix, updated, base, today());
      if (this.editing?.id === entry.id) {
        this.editing = null;
        element('catalogEditor').hidden = true;
      }
      this.options.onSaved(updated);
      this.message('教材已儲存，進度圖已更新；返回 Tracker 後會同步雲端。');
    } catch (error) {
      this.message(error instanceof Error ? error.message : '教材儲存失敗。', true);
    } finally {
      this.busy = false;
      this.setBusy(false);
    }
  }

  private setBusy(busy: boolean): void {
    document.querySelectorAll<HTMLButtonElement>('[data-catalog-action], #toggleMaterialEditing, #newMaterial, #catalogForm button').forEach(button => { button.disabled = busy; });
  }
}
