import type { BedtimeRecord, StudyRecord } from '../types.ts';

const MINUTES_PER_DAY = 24 * 60;
const MAX_SLEEP_MINUTES = 18 * 60;
const NEXT_DAY_CUTOFF_HOUR = 6;

export type SleepDayStatus = 'valid' | 'incomplete' | 'invalid';

export interface SleepDaySummary {
  date: string;
  bedtime: BedtimeRecord | null;
  wakeTime: string;
  sleepMinutes: number | null;
  status: SleepDayStatus;
  statusText: '' | '資料不完整' | '請確認時間';
}

export interface SleepPeriodSummary {
  days: SleepDaySummary[];
  averageSleepMinutes: number | null;
  averageBedtimeMinutes: number | null;
  averageWakeMinutes: number | null;
  validNightCount: number;
  totalNightCount: number;
}

function parseCalendarDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return null;
  return date;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function shiftCalendarDate(value: string, days: number): string {
  const date = parseCalendarDate(value);
  if (!date) return '';
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

export function clockMinutes(value: unknown): number | null {
  const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function normalizedClock(value: unknown): string {
  const minutes = clockMinutes(value);
  if (minutes === null) return '';
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function bedtimeRecordForStudyDate(studyDate: string, timeValue: unknown): BedtimeRecord | null {
  if (!parseCalendarDate(studyDate)) return null;
  const time = normalizedClock(timeValue);
  if (!time) return null;
  const minutes = clockMinutes(time) as number;
  const nextDay = Math.floor(minutes / 60) < NEXT_DAY_CUTOFF_HOUR;
  const resolvedDate = nextDay ? shiftCalendarDate(studyDate, 1) : studyDate;
  return { time, dateTime: `${resolvedDate}T${time}`, nextDay };
}

export function validBedtimeRecord(value: unknown, studyDate?: string): value is BedtimeRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const bedtime = value as BedtimeRecord;
  const expected = studyDate ? bedtimeRecordForStudyDate(studyDate, bedtime.time) : null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(bedtime.dateTime ?? ''))) return false;
  if (typeof bedtime.nextDay !== 'boolean' || clockMinutes(bedtime.time) === null) return false;
  if (!studyDate) return true;
  return Boolean(expected && expected.dateTime === bedtime.dateTime && expected.nextDay === bedtime.nextDay);
}

function localDateTimeMilliseconds(value: string): number | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), 0, 0);
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
}

export function sleepDayForWakeDate(recordsByDate: Map<string, StudyRecord>, wakeDate: string): SleepDaySummary {
  const wakeRecord = recordsByDate.get(wakeDate);
  const previousDate = shiftCalendarDate(wakeDate, -1);
  const bedtimeValue = recordsByDate.get(previousDate)?.bedtime;
  const wakeTime = normalizedClock(wakeRecord?.wakeTime);
  const hasBedtime = bedtimeValue !== undefined && bedtimeValue !== null;
  const hasWakeValue = Boolean(wakeRecord?.wakeTime);
  if (!hasBedtime || !hasWakeValue) {
    return { date: wakeDate, bedtime: validBedtimeRecord(bedtimeValue, previousDate) ? bedtimeValue : null, wakeTime, sleepMinutes: null, status: 'incomplete', statusText: '資料不完整' };
  }
  if (!validBedtimeRecord(bedtimeValue, previousDate) || !wakeTime) {
    return { date: wakeDate, bedtime: null, wakeTime, sleepMinutes: null, status: 'invalid', statusText: '請確認時間' };
  }
  const bedtimeMilliseconds = localDateTimeMilliseconds(bedtimeValue.dateTime);
  const wakeMilliseconds = localDateTimeMilliseconds(`${wakeDate}T${wakeTime}`);
  if (bedtimeMilliseconds === null || wakeMilliseconds === null) {
    return { date: wakeDate, bedtime: bedtimeValue, wakeTime, sleepMinutes: null, status: 'invalid', statusText: '請確認時間' };
  }
  const sleepMinutes = Math.round((wakeMilliseconds - bedtimeMilliseconds) / 60_000);
  if (sleepMinutes <= 0 || sleepMinutes > MAX_SLEEP_MINUTES) {
    return { date: wakeDate, bedtime: bedtimeValue, wakeTime, sleepMinutes: null, status: 'invalid', statusText: '請確認時間' };
  }
  return { date: wakeDate, bedtime: bedtimeValue, wakeTime, sleepMinutes, status: 'valid', statusText: '' };
}

function arithmeticMean(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function averageBedtimeClockMinutes(values: number[]): number | null {
  const valid = values.filter(value => Number.isFinite(value) && value >= 0 && value < MINUTES_PER_DAY);
  if (!valid.length) return null;
  const extended = valid.map(value => value < NEXT_DAY_CUTOFF_HOUR * 60 ? value + MINUTES_PER_DAY : value);
  const average = arithmeticMean(extended);
  return average === null ? null : average % MINUTES_PER_DAY;
}

export function summarizeSleepPeriod(records: StudyRecord[], dates: string[]): SleepPeriodSummary {
  const byDate = new Map(records.map(record => [record.date, record]));
  const days = dates.map(date => sleepDayForWakeDate(byDate, date));
  const validDays = days.filter(day => day.status === 'valid' && day.sleepMinutes !== null && day.bedtime);
  const sleepValues = validDays.map(day => day.sleepMinutes as number);
  const bedtimeValues = validDays.map(day => clockMinutes(day.bedtime?.time)).filter((value): value is number => value !== null);
  const wakeValues = validDays.map(day => clockMinutes(day.wakeTime)).filter((value): value is number => value !== null);
  return {
    days,
    averageSleepMinutes: arithmeticMean(sleepValues),
    averageBedtimeMinutes: averageBedtimeClockMinutes(bedtimeValues),
    averageWakeMinutes: arithmeticMean(wakeValues),
    validNightCount: validDays.length,
    totalNightCount: dates.length,
  };
}

export function formatClockMinutes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const normalized = ((Math.round(value) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function formatSleepDuration(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const minutes = Math.max(0, Math.round(value));
  return `${Math.floor(minutes / 60)} 小時 ${minutes % 60} 分鐘`;
}

function comparisonDuration(value: number): string {
  const minutes = Math.abs(Math.round(value));
  if (minutes < 60) return `${minutes} 分鐘`;
  return `${Math.floor(minutes / 60)} 小時 ${minutes % 60} 分鐘`;
}

export function sleepComparisonText(current: number | null, previous: number | null): string {
  if (current === null || previous === null) return '資料不足';
  const difference = Math.round(current - previous);
  if (Math.abs(difference) < 5) return '大致持平';
  return `平均${difference > 0 ? '多睡' : '少睡'} ${comparisonDuration(difference)}`;
}
