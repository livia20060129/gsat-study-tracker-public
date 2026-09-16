export interface CalendarScheduleSummary {
  details: string[];
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

/** Builds the Calendar information box: optional focus, but an always-present page line. */
export function grammarScheduleSummary(
  focus: unknown,
  pageRange: unknown,
): CalendarScheduleSummary {
  const focusText = clean(focus);
  return {
    details: [
      ...(focusText ? [`重點：${focusText}`] : []),
      `建議頁碼：${clean(pageRange) || '—'}`,
    ],
  };
}
