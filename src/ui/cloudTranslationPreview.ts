import { CloudTranslationError, translateWithGoogle } from '../application/cloudTranslationClient.ts';
import { cloudTranslationInput, type CloudTranslation } from '../study/cloudTranslation.ts';
import type { CloudTranslationTarget } from '../study/cloudTranslationSelection.ts';
import { VOCABULARY_PARTS_OF_SPEECH, type VocabularyPartOfSpeechField } from '../study/vocabularyTranslationCounts.ts';

export interface CloudTranslationPreviewOptions {
  text: string;
  scope: string;
  partsOfSpeech?: readonly VocabularyPartOfSpeechField[];
  apply(result: CloudTranslation, target?: CloudTranslationTarget): 'saved' | 'unchanged' | 'failed';
}
export class CloudTranslationPreview {
  readonly element = document.createElement('section');
  private readonly status = document.createElement('p');
  private readonly output = document.createElement('div');
  private readonly query = document.createElement('button');
  private readonly target: HTMLSelectElement | undefined;
  private confirmation: HTMLButtonElement | undefined;
  private targetChosen = false;
  private controller: AbortController | undefined;
  private disposed = false;
  private requestSerial = 0;
  private readonly options: CloudTranslationPreviewOptions;
  constructor(options: CloudTranslationPreviewOptions) {
    this.options = options;
    this.element.className = 'cloud-translation-preview';
    this.element.setAttribute('aria-label', `Google 翻譯「${options.text}」`);
    this.query.type = 'button';
    this.query.textContent = 'Google 翻譯';
    this.query.dataset.cloudTranslationQuery = '';
    const signedIn = /^study-v11:user:[^:]+:$/.test(options.scope);
    this.query.disabled = !signedIn || !cloudTranslationInput(options.text);
    this.status.className = 'cloud-translation-status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    if (options.partsOfSpeech !== undefined) {
      const label = document.createElement('label');
      label.className = 'cloud-translation-target';
      const caption = document.createElement('span');
      caption.textContent = 'Google 翻譯填入詞性';
      this.target = document.createElement('select');
      this.target.setAttribute('aria-label', caption.textContent);
      for (const [value, text] of [['', '請選擇詞性'], ...VOCABULARY_PARTS_OF_SPEECH, ['unclassified', '未分詞性']]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        this.target.append(option);
      }
      this.target.addEventListener('change', () => {
        this.targetChosen = Boolean(this.target?.value);
        this.updateConfirmation();
      });
      label.append(caption, this.target);
      const hint = document.createElement('p');
      hint.className = 'cloud-translation-status';
      hint.textContent = '只有一個勾選詞性時自動帶入；多個或尚未勾選時請自行選擇。';
      this.element.append(label, hint);
      this.updatePartsOfSpeech(options.partsOfSpeech);
    }
    this.status.textContent = signedIn ? '只傳送所選英文取得繁體中文預覽，確認後才追加填入。' : '請先登入 Tracker，再使用 Google 翻譯。';
    this.element.append(this.query, this.status, this.output);
    this.query.addEventListener('click', () => this.lookup());
  }
  updatePartsOfSpeech(fields: readonly VocabularyPartOfSpeechField[]): void {
    if (!this.target || this.targetChosen) return;
    this.target.value = fields.length === 1 ? fields[0] : '';
    this.updateConfirmation();
  }
  private updateConfirmation(): void {
    if (this.confirmation) this.confirmation.disabled = Boolean(this.target && !this.target.value);
  }
  dispose(): void {
    this.disposed = true;
    this.invalidate();
  }
  invalidate(): void {
    this.requestSerial++;
    if (this.controller || this.output.childNodes.length) this.status.textContent = '先前 Google 預覽已清除，可重新查詢。';
    this.controller?.abort();
    this.controller = undefined;
    this.output.replaceChildren();
    this.confirmation = undefined;
    this.query.disabled = !/^study-v11:user:[^:]+:$/.test(this.options.scope) || !cloudTranslationInput(this.options.text);
  }
  private async lookup(): Promise<void> {
    this.element.dispatchEvent(new CustomEvent('translation-preview-query', { bubbles: true, detail: this }));
    const serial = ++this.requestSerial;
    this.controller = new AbortController();
    this.query.disabled = true;
    this.output.replaceChildren();
    this.confirmation = undefined;
    this.status.textContent = '正在使用 Google 翻譯…';
    try {
      const result = await translateWithGoogle(this.options.text, this.options.scope, this.controller.signal);
      if (this.disposed || serial !== this.requestSerial) return;
      if (this.target && this.options.partsOfSpeech?.length === 0 && !this.target.value && !this.targetChosen) {
        const { loadVocabularyFallbackParts } = await import('../study/vocabularyFallbackParts.ts');
        const parts = await loadVocabularyFallbackParts(this.options.text);
        let fields = parts?.parts ?? [];
        if (!fields.length) {
          const { loadEcdictTranslations } = await import('../study/ecdictLookup.ts');
          const translations = await loadEcdictTranslations(this.options.text).catch(() => null);
          fields = VOCABULARY_PARTS_OF_SPEECH.filter(([field]) => translations?.[field]?.some(meaning => meaning.trim())).map(([field]) => field);
        }
        if (this.disposed || serial !== this.requestSerial) return;
        this.updatePartsOfSpeech(fields);
      }
      const translated = document.createElement('p');
      translated.className = 'cloud-translation-result';
      translated.lang = 'zh-Hant-x-mtfrom-en';
      translated.textContent = result.translatedText;
      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.dataset.cloudTranslationApply = '';
      confirm.textContent = '填入 Google 翻譯';
      this.confirmation = confirm;
      this.updateConfirmation();
      confirm.addEventListener('click', () => {
        if (this.target && !this.target.value) return;
        const target = this.target?.value as CloudTranslationTarget | undefined;
        const outcome = this.options.apply(result, target);
        if (outcome === 'saved') this.status.textContent = '已追加 Google 翻譯。';
        else if (outcome === 'unchanged') this.status.textContent = '這筆翻譯已存在。';
        else this.status.textContent = '紀錄已變更或無法儲存，尚未填入翻譯。';
      });
      this.output.replaceChildren(translated, confirm);
      this.status.textContent = 'Google 機器翻譯。請確認內容，再追加填入；既有翻譯會保留。';
    } catch (error) {
      if (!this.disposed && serial === this.requestSerial) this.status.textContent = error instanceof CloudTranslationError ? error.message : '翻譯暫時無法使用，請稍後再試；既有翻譯已保留。';
    } finally { if (!this.disposed && serial === this.requestSerial) this.query.disabled = false; }
  }
}
