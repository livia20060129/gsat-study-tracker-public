export const OVERVIEW_METRICS = ['completion', 'reminder'] as const;

export type OverviewMetric = typeof OVERVIEW_METRICS[number];

export function normalizeOverviewMetric(value: unknown): OverviewMetric {
  return OVERVIEW_METRICS.includes(value as OverviewMetric) ? value as OverviewMetric : OVERVIEW_METRICS[0];
}

export function overviewMetricIndex(value: unknown): number {
  return OVERVIEW_METRICS.indexOf(normalizeOverviewMetric(value));
}

export function adjacentOverviewMetric(value: unknown, direction: 1 | -1): OverviewMetric {
  const index = overviewMetricIndex(value);
  return OVERVIEW_METRICS[(index + direction + OVERVIEW_METRICS.length) % OVERVIEW_METRICS.length];
}
