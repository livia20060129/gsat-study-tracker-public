export const SUBJECT_TIME_SUBJECTS = ['數學', '國文', '英文', '物理', '化學', '生物', '地科', '自然', '其他'] as const;

export type SubjectTimeSubject = typeof SUBJECT_TIME_SUBJECTS[number];

export const SUBJECT_TIME_COLORS: Record<SubjectTimeSubject, string> = {
  數學: '#cfb273',
  國文: '#b9958b',
  英文: '#a898bd',
  物理: '#8faec5',
  化學: '#91b6a2',
  生物: '#a8b78e',
  地科: '#b8a58d',
  自然: '#8eaea1',
  其他: '#aab3bd',
};

export const SUBJECT_TIME_SHORT_LABELS: Record<SubjectTimeSubject, string> = {
  數學: '數',
  國文: '國',
  英文: '英',
  物理: '物',
  化學: '化',
  生物: '生',
  地科: '地',
  自然: '自',
  其他: '社',
};

export interface SubjectTimeEntry {
  subject: string;
  minutes: unknown;
}

export interface SubjectTimeSlice {
  subject: SubjectTimeSubject;
  minutes: number;
  percent: number;
  color: string;
}

export interface SubjectTimeSummary {
  totalMinutes: number;
  slices: SubjectTimeSlice[];
}

export interface SubjectTimeDonutSlice extends SubjectTimeSlice {
  startPercent: number;
  endPercent: number;
  dashLength: number;
  dashOffset: number;
  labelX: number;
  labelY: number;
}

function pointOnCircle(percent: number, radius: number, center: number): [number, number] {
  const angle = (percent / 100) * Math.PI * 2 - Math.PI / 2;
  return [
    center + Math.cos(angle) * radius,
    center + Math.sin(angle) * radius,
  ];
}

/** Draws the exact same arc used to calculate the label midpoint. */
export function subjectTimeArcPath(
  slice: Pick<SubjectTimeDonutSlice, 'startPercent' | 'endPercent'>,
  radius = 56,
  center = 80,
): string {
  const span = Math.max(0, Math.min(100, slice.endPercent - slice.startPercent));
  if (span >= 99.999) {
    return `M ${center} ${center - radius} A ${radius} ${radius} 0 1 1 ${center} ${center + radius} A ${radius} ${radius} 0 1 1 ${center} ${center - radius}`;
  }
  const [startX, startY] = pointOnCircle(slice.startPercent, radius, center);
  const [endX, endY] = pointOnCircle(slice.endPercent, radius, center);
  return `M ${startX} ${startY} A ${radius} ${radius} 0 ${span > 50 ? 1 : 0} 1 ${endX} ${endY}`;
}

function roundOne(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function normalizeSubject(value: unknown): SubjectTimeSubject {
  const subject = String(value ?? '').trim();
  return SUBJECT_TIME_SUBJECTS.includes(subject as SubjectTimeSubject)
    ? subject as SubjectTimeSubject
    : '其他';
}

/** Summarizes already-qualified completed minutes into stable subject slices. */
export function summarizeSubjectTime(entries: SubjectTimeEntry[]): SubjectTimeSummary {
  const totals = new Map<SubjectTimeSubject, number>(
    SUBJECT_TIME_SUBJECTS.map(subject => [subject, 0]),
  );

  for (const entry of entries) {
    const minutes = Number(entry?.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0) continue;
    const subject = normalizeSubject(entry.subject);
    totals.set(subject, (totals.get(subject) || 0) + minutes);
  }

  const total = [...totals.values()].reduce((sum, minutes) => sum + minutes, 0);
  if (total <= 0) return { totalMinutes: 0, slices: [] };

  return {
    totalMinutes: roundOne(total),
    slices: SUBJECT_TIME_SUBJECTS
      .filter(subject => (totals.get(subject) || 0) > 0)
      .map(subject => ({
        subject,
        minutes: roundOne(totals.get(subject) || 0),
        percent: roundOne(((totals.get(subject) || 0) / total) * 100),
        color: SUBJECT_TIME_COLORS[subject],
      })),
  };
}

export function subjectTimeConicGradient(summary: SubjectTimeSummary): string {
  if (!summary.slices.length || summary.totalMinutes <= 0) return 'none';
  let cursor = 0;
  const stops = summary.slices.map(slice => {
    const start = cursor;
    cursor += (slice.minutes / summary.totalMinutes) * 100;
    return `${slice.color} ${start.toFixed(3)}% ${Math.min(100, cursor).toFixed(3)}%`;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

/** Geometry shared by the SVG ring, its hit targets and the labels centered on each color. */
export function subjectTimeDonutSlices(
  summary: SubjectTimeSummary,
  radius = 56,
  center = 80,
): SubjectTimeDonutSlice[] {
  if (!summary.slices.length || summary.totalMinutes <= 0) return [];
  const circumference = 2 * Math.PI * radius;
  let cursor = 0;
  return summary.slices.map((slice, index) => {
    const startPercent = cursor;
    const share = slice.minutes / summary.totalMinutes;
    cursor = index === summary.slices.length - 1 ? 1 : Math.min(1, cursor + share);
    const endPercent = cursor;
    const midAngle = ((startPercent + endPercent) / 2) * Math.PI * 2 - Math.PI / 2;
    return {
      ...slice,
      startPercent: roundOne(startPercent * 100),
      endPercent: roundOne(endPercent * 100),
      dashLength: circumference * (endPercent - startPercent),
      dashOffset: -circumference * startPercent,
      // Match the SVG path radius exactly so the label stays on the colour
      // band's centre line even when the chart is resized.
      labelX: center + Math.cos(midAngle) * radius,
      labelY: center + Math.sin(midAngle) * radius,
    };
  });
}
