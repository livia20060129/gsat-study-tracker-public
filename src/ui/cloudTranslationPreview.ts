import { CloudTranslationError, translateWithGoogle } from '../application/cloudTranslationClient.ts';
import { cloudTranslationInput, GOOGLE_TRANSLATE_URL, type CloudTranslation } from '../study/cloudTranslation.ts';

export function googleTranslationAttribution(): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'google-translation-attribution';
  link.href = GOOGLE_TRANSLATE_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  const image = document.createElement('img');
  image.src = `${import.meta.env.BASE_URL}google-translate-attribution.png`;
  image.alt = 'powered by Google Translate';
  link.append(image);
  return link;
}

export interface CloudTranslationPreviewOptions {
  text: string;
  scope: string;
  apply(result: CloudTranslation): 'saved' | 'unchanged' | 'failed';
}
export class CloudTranslationPreview {
  readonly element = document.createElement('section');
  private readonly status = document.createElement('p');
  private readonly output = document.createElement('div');
  private readonly query = document.createElement('button');
  private controller: AbortController | undefined;
  private disposed = false;
  private readonly options: CloudTranslationPreviewOptions;
  constructor(options: CloudTranslationPreviewOptions) {
    this.options = options;
    this.element.className = 'cloud-translation-preview';
    this.element.setAttribute('aria-label', `Google 翻譯「${options.text}」`);
    this.query.type = 'button';
    this.query.textContent = '使用 Google 翻譯';
    this.query.dataset.cloudTranslationQuery = '';
    this.query.disabled = !cloudTranslationInput(options.text);
    this.status.className = 'cloud-translation-status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.status.textContent = '需先登入 Tracker。按下後只傳送這段英文給 Google，翻成繁體中文；確認後才追加填入。';
    this.element.append(this.query, this.status, this.output);
    this.query.addEventListener('click', () => this.lookup());
  }
  dispose(): void {
    this.disposed = true;
    this.controller?.abort();
    this.output.replaceChildren();
  }
  private async lookup(): Promise<void> {
    this.controller = new AbortController();
    this.query.disabled = true;
    this.output.replaceChildren();
    this.status.textContent = '正在使用 Google 翻譯…';
    try {
      const result = await translateWithGoogle(this.options.text, this.options.scope, this.controller.signal);
      if (this.disposed) return;
      const translated = document.createElement('p');
      translated.className = 'cloud-translation-result';
      translated.lang = 'zh-Hant-x-mtfrom-en';
      translated.textContent = result.translatedText;
      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.dataset.cloudTranslationApply = '';
      confirm.textContent = '填入 Google 翻譯';
      confirm.addEventListener('click', () => {
        const outcome = this.options.apply(result);
        if (outcome === 'saved') this.status.textContent = '已追加 Google 翻譯。';
        else if (outcome === 'unchanged') this.status.textContent = '這筆翻譯已存在。';
        else this.status.textContent = '紀錄已變更或無法儲存，尚未填入翻譯。';
      });
      this.output.replaceChildren(translated, googleTranslationAttribution(), confirm);
      this.status.textContent = 'Google 機器翻譯。請確認內容，再追加填入；既有翻譯會保留。';
    } catch (error) {
      if (!this.disposed) this.status.textContent = error instanceof CloudTranslationError ? error.message : '翻譯暫時無法使用，請稍後再試；既有翻譯已保留。';
    } finally { if (!this.disposed) this.query.disabled = false; }
  }
}
