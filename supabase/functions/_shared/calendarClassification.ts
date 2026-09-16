function normalizedTitle(value: string): string {
  let title = String(value ?? '').trim();
  title = title.replace(/^(今日項目|今日|本週項目|本周項目|本週|本周)\s*[｜:：]\s*/, '');
  return title.replace(/^(補做項目|補做)\s*[｜:：]\s*/, '');
}

function hasStructuredMathNote(description: string): boolean {
  const value = String(description ?? '');
  return /【講義版本】\s*(?:教學講義|智慧型|新關鍵|新大滿貫|複習週記)/.test(value)
    && /【冊別】\s*(?:第\s*)?(?:數學\s*)?(?:A|1|2|3A|4A|1\s*[~～–—\-]\s*2|3A\s*[~～–—\-]\s*4A|2\s*[＋+]\s*(?:3A|4A))(?:\s*冊)?/i.test(value);
}

/** Classifies one fetched Google Calendar event before it is stored in Supabase. */
export function classifyCalendarEvent(title: string, description = ''): string {
  const value = normalizedTitle(title);
  const identifier = String(description ?? '').toUpperCase();
  if (/GSAT-MATHA-NEW-DAMANFEN/.test(identifier)) return 'math';
  if (/GSAT-(?:CHEM-LINGHANG|PHYS-(?:YOUSHI|NIZHUANSHENG))/.test(identifier)) return 'natural';
  if (/Essential Grammar in Use/i.test(value)) return 'essentialGrammar';
  if (/^ACE Reading(?:\s*[｜:：]\s*|\s+)第/i.test(value)) return 'ace';
  if (/^(?:國文\s*[｜:：]\s*)?古今悅讀一百(?:\s*[｜:：]\s*|\s+)第/.test(value)) return 'gujin';
  if (/^英文文法(?:\s*[｜:：]\s*|\s+)/.test(value)) return 'grammar';
  if (/^英文寫作測驗(?:\s*[｜:：]\s*|\s+)第/.test(value)) return 'writing';
  if (/^自然整合(?:\s*[｜:：]\s*|\s+)/.test(value)) return 'naturalIntegration';
  if (/^(物理|化學|生物|地科)(?:\s*[｜:：]\s*|\s+)/.test(value)) return 'natural';
  if (hasStructuredMathNote(description)) return 'math';
  if (/^數學(?:講義)?(?:\s*[｜:：]\s*|\s+)\S/.test(value)) return 'math';
  if (/^(?:1|2|3A|4A|1\s*[~～–—\-]\s*2|3A\s*[~～–—\-]\s*4A|2\s*[＋+]\s*4A|2\s*[＋+]\s*3A)(?:\s*[｜:：]\s*|\s+)\S/i.test(value)) return 'math';
  return 'studyItem';
}
