import { cloudTranslationResult, type CloudTranslation } from './cloudTranslationProtocol.ts';

export async function requestGoogleTranslation(text: string, apiKey: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<CloudTranslation> {
  if (!apiKey.trim()) throw new Error('Translation configuration unavailable');
  const response = await fetcher('https://translation.googleapis.com/language/translate/v2', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey.trim() },
    body: JSON.stringify({ q: text, source: 'en', target: 'zh-TW', format: 'text', model: 'nmt' }),
  });
  if (!response.ok) throw new Error('Google Translation unavailable');
  const body = await response.json() as { data?: { translations?: Array<{ translatedText?: unknown }> } };
  const result = cloudTranslationResult({ provider: 'google-cloud-translation', text,
    translatedText: body.data?.translations?.[0]?.translatedText, sourceLanguage: 'en', targetLanguage: 'zh-TW' }, text);
  if (!result) throw new Error('Invalid Google Translation response');
  return result;
}
