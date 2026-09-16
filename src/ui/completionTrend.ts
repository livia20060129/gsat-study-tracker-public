export const COMPLETION_VIEWS = ['rates', 'trend'] as const;

export type CompletionView = typeof COMPLETION_VIEWS[number];

export interface CompletionTrendPoint {
  label: string;
  percent: number;
  x: number;
  y: number;
}

export function completionTrendDayCount(weekday: number): 0 | 5 | 7 {
  if (weekday === 5) return 5;
  if (weekday === 0) return 7;
  return 0;
}

export function normalizeCompletionView(
  value: unknown,
  trendAvailable: boolean,
): CompletionView {
  if (!trendAvailable) return 'rates';
  return COMPLETION_VIEWS.includes(value as CompletionView)
    ? value as CompletionView
    : 'rates';
}

export function adjacentCompletionView(
  value: unknown,
  direction: 1 | -1,
): CompletionView {
  const current = normalizeCompletionView(value, true);
  const index = COMPLETION_VIEWS.indexOf(current);
  return COMPLETION_VIEWS[
    (index + direction + COMPLETION_VIEWS.length) % COMPLETION_VIEWS.length
  ];
}

export function completionTrendPoints(
  values: number[],
  labels: string[],
  width = 640,
  height = 190,
): CompletionTrendPoint[] {
  const left = 42;
  const right = 18;
  const top = 25;
  const bottom = 38;
  const usableWidth = Math.max(0, width - left - right);
  const usableHeight = Math.max(0, height - top - bottom);
  const denominator = Math.max(1, values.length - 1);

  return values.map((raw, index) => {
    const percent = Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
    return {
      label: labels[index] || String(index + 1),
      percent,
      x: left + (usableWidth * index) / denominator,
      y: top + usableHeight * (1 - percent / 100),
    };
  });
}
