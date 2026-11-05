/** Official, unmodified Google attribution artwork, bundled to avoid another image request to Google. */
export function googleTranslationAttributionHtml(): string {
  const base = import.meta.env?.BASE_URL ?? '/';
  return `<a class="google-translation-attribution" href="https://translate.google.com/" aria-label="Google Translate 自動翻譯來源"><img src="${base}google-translate-attribution.png" alt="Powered by Google Translate" width="176" height="16" style="display:inline-block;max-width:100%;height:auto;vertical-align:middle"></a>`;
}
