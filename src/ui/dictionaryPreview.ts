import { dictionaryQuery, type DictionaryLookupResult } from '../study/dictionaryEntries.ts';
import { localDictionaryLookup } from '../study/localDictionaryLookup.ts';
import { VOCABULARY_PARTS_OF_SPEECH } from '../study/vocabularyTranslationCounts.ts';

export interface DictionaryPreviewOptions {
  word: string;
  apply: (selection: DictionaryLookupResult) => 'saved' | 'unchanged' | 'failed';
}

/** Local candidates remain temporary until the user confirms selected meanings. */
export class DictionaryPreview {
  readonly element: HTMLElement;
  private readonly options: DictionaryPreviewOptions;
  private readonly output: HTMLDivElement;
  private readonly status: HTMLParagraphElement;

  constructor(options: DictionaryPreviewOptions) {
    this.options = options;
    this.element = document.createElement('section');
    this.element.className = 'dictionary-preview';
    this.element.setAttribute('aria-label', '取得「' + options.word + '」的翻譯');
    const controls = document.createElement('div');
    controls.className = 'dictionary-preview-controls';
    const source = document.createElement('span');
    source.className = 'dictionary-preview-source';
    source.textContent = 'ECDICT（本機）';
    const query = document.createElement('button');
    query.type = 'button';
    query.dataset.dictionaryLookup = '';
    query.textContent = '取得翻譯';
    query.disabled = !dictionaryQuery(options.word);
    controls.append(source, query);
    this.status = document.createElement('p');
    this.status.className = 'dictionary-preview-status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.status.textContent = query.disabled
      ? '請先將英文內容改為有效的英文單字或短語。'
      : '使用本機 ECDICT，不需登入或連線。取得翻譯後，選擇意思再填入；既有內容會保留。';
    this.output = document.createElement('div');
    this.output.className = 'dictionary-preview-results';
    this.element.append(controls, this.status, this.output);
    query.addEventListener('click', () => this.lookup());
  }

  dispose(): void {
    this.output.replaceChildren();
  }

  private lookup(): void {
    this.output.replaceChildren();
    const result = localDictionaryLookup(this.options.word);
    if (result) this.showResult(result);
    else this.status.textContent = '本機 ECDICT 未收錄此拼法的翻譯，可手動輸入中文。';
  }

  private showResult(result: DictionaryLookupResult): void {
    this.status.textContent = '來源：ECDICT。請勾選要填入的意思。';
    const group = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = '選擇翻譯';
    group.append(legend);
    for (const [index, meaning] of result.meanings.entries()) {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.dictionaryMeaning = String(index);
      const part = VOCABULARY_PARTS_OF_SPEECH.find(([field]) => field === meaning.partOfSpeech)?.[1] ?? '未分詞性';
      label.append(checkbox, document.createTextNode(part + '｜' + meaning.text));
      group.append(label);
    }
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.dataset.dictionaryApply = '';
    confirm.textContent = '填入已選翻譯';
    confirm.disabled = true;
    group.addEventListener('change', () => { confirm.disabled = !group.querySelector('input:checked'); });
    confirm.addEventListener('click', () => {
      const meanings = [...group.querySelectorAll<HTMLInputElement>('input:checked')].map(input => result.meanings[Number(input.dataset.dictionaryMeaning)]);
      if (!meanings.length) return;
      const outcome = this.options.apply({ ...result, meanings });
      if (outcome === 'saved') this.status.textContent = '已填入所選翻譯。';
      else if (outcome === 'unchanged') this.status.textContent = '所選翻譯已存在，沒有變更紀錄。';
      else this.status.textContent = '尚未填入，請先處理頁面上的儲存提示。';
    });
    this.output.replaceChildren(group, confirm);
  }
}
