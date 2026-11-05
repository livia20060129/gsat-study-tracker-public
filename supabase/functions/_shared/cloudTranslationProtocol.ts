export const CLOUD_TRANSLATION_MAX_CHARACTERS = 2000;
export const CLOUD_TRANSLATION_MONTHLY_CHARACTERS = 5000;
export const CLOUD_TRANSLATION_QUOTA_MESSAGE = '翻譯額度已達上限。每帳號每月最多 5,000 字元，台灣時間每月 1 日重設；亦受全站每日用量限制。';
export const GOOGLE_TRANSLATE_URL = 'https://translate.google.com/';
export interface CloudTranslation {
  provider: 'google-cloud-translation';
  text: string;
  translatedText: string;
  sourceLanguage: 'en';
  targetLanguage: 'zh-TW';
}
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export function cloudTranslationInput(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.normalize('NFKC').trim().replace(/\r\n?/g, '\n');
  if (!/[A-Za-z]/.test(text) || CONTROL_CHARACTERS.test(text) || Array.from(text).length > CLOUD_TRANSLATION_MAX_CHARACTERS) return null;
  return text;
}

export function cloudTranslationResult(value: unknown, expectedText?: string): CloudTranslation | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as Partial<CloudTranslation>;
  const text = cloudTranslationInput(result.text);
  if (!text || (expectedText !== undefined && text !== cloudTranslationInput(expectedText))
    || result.provider !== 'google-cloud-translation' || result.sourceLanguage !== 'en' || result.targetLanguage !== 'zh-TW'
    || typeof result.translatedText !== 'string' || !result.translatedText.trim()
    || Array.from(result.translatedText).length > 8000 || CONTROL_CHARACTERS.test(result.translatedText)) return null;
  return { provider: 'google-cloud-translation', text, translatedText: result.translatedText.trim(), sourceLanguage: 'en', targetLanguage: 'zh-TW' };
}

/** Retain bounded, validated attribution without accepting credentials or arbitrary URLs. */
export function cloudTranslationSources(value: unknown): CloudTranslation[] {
  if (!Array.isArray(value)) return [];
  const sources = new Map<string, CloudTranslation>();
  for (const raw of value.slice(-32)) {
    const source = cloudTranslationResult(raw);
    if (source) sources.set(JSON.stringify(source), source);
  }
  return [...sources.values()].slice(-8);
}
