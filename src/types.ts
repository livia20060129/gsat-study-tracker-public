export type StudySubject = '國文' | '英文' | '數學A' | '自然' | '物理' | '化學' | '生物' | '地科' | '混合';

export type StudyItemType =
  | 'mathStudy'
  | 'mathLecture'
  | 'mathPractice'
  | 'mathOral'
  | 'magazine'
  | 'englishPractice'
  | 'englishVocabInteractive'
  | 'englishMixedWriting'
  | 'biologyInteractive'
  | 'scienceReview'
  | 'chineseReading'
  | 'mock'
  | 'general'
  | 'extra'
  | 'interactive'
  | 'interactiveDaily'
  | 'calendarStudy';

export interface PageRange {
  start: number;
  end: number;
}

export interface StudyItemFields {
  [key: string]: unknown;
  /** Legacy strings are migrated to entries with a stable ID before saving. */
  words?: Array<string | EnglishReviewWordEntry>;
  interactiveEntries?: StudyItem[];
  makeupEntries?: StudyItem[];
  reviewEntries?: StudyItem[];
  calendarIntegrationEntries?: CalendarNaturalIntegrationEntry[];
  /** Repeated ranges/rounds displayed as separately completable children in one parent card. */
  groupedWorkEntries?: StudyItem[];
  /** Original top-level items preserved inside a final daily aggregate. */
  dailyWorkSourceItems?: StudyItem[];
  /** Manual/timer mode and resumable elapsed-time state for this item. */
  timeTracking?: StudyTimerState;
}

export interface EnglishReviewWordEntry extends Record<string, unknown> {
  id?: string;
  text?: string;
}

export type StudyTimeMode = 'manual' | 'timer';

export interface StudyTimerState {
  mode: StudyTimeMode;
  accumulatedSeconds: number;
  startedAt: number | null;
}

export interface StudyItem {
  id: string;
  type: StudyItemType | string;
  done: boolean;
  minutes: string;
  required: boolean;
  source?: string;
  presetKey?: string;
  /** Preserves the original renderer/template when this item is carried forward for makeup. */
  templatePresetKey?: string;
  title?: string;
  description?: string;
  deferred?: boolean;
  deferredTargetDay?: number;
  deferredCarry?: boolean;
  deferredOriginDate?: string;
  deferredOriginId?: string;
  deferredOriginDates?: string[];
  deferredOriginIds?: string[];
  /** Actual local date when an older record was manually checked. */
  checkedOn?: string;
  /** Actual completion date recorded from the deferred target-day card. */
  deferredCompletedOn?: string;
  locked?: boolean;
  calendarGroupedChild?: boolean;
  mondayFixedVocab?: boolean;
  f: StudyItemFields;
}

export interface StudyRecordSyncConflict {
  path: string;
  kind: 'same-field' | 'delete-vs-edit' | 'unkeyed-array' | 'unknown-base';
  baseExists: boolean;
  localExists: boolean;
  cloudExists: boolean;
  base?: unknown;
  local?: unknown;
  cloud?: unknown;
}

export interface StudyRecordStorageIssue {
  source: 'local';
  date: string;
  error: string;
  backupKey: string;
  capturedAt: string;
}

export interface BedtimeRecord {
  /** User-facing 24-hour clock value. */
  time: string;
  /** Local ISO-like date time without a timezone, for example 2026-09-21T01:30. */
  dateTime: string;
  /** True when 00:00-05:59 belongs to the next calendar date. */
  nextDay: boolean;
}

export interface StudyRecord {
  /** Explicit JSON payload schema; absent records are decoded as legacy schema 0. */
  schemaVersion?: number;
  date: string;
  /** @deprecated v170 legacy client timestamp; never used for sync ordering in v171. */
  updatedAt?: string;
  serverRevision?: number;
  serverUpdatedAt?: string;
  localDirty?: boolean;
  syncConflict?: boolean;
  /** Last payload confirmed by both this browser and Supabase. Local-only. */
  syncBase?: StudyRecord;
  /** Field-level conflicts and both recoverable choices. Local-only. */
  syncConflictDetails?: StudyRecordSyncConflict[];
  syncConflictLocal?: StudyRecord;
  syncConflictCloud?: StudyRecord;
  /** A local payload failed decoding. Saving and cloud sync stay blocked until recovery. */
  storageIssue?: StudyRecordStorageIssue;
  mood?: string;
  wakeTime?: string;
  /** Bedtime for this study date's evening, with its resolved calendar date. */
  bedtime?: BedtimeRecord;
  biggestBlock?: string;
  firstThingTomorrow?: string;
  notes?: string;
  items: StudyItem[];
}

export interface CalendarNaturalIntegrationEntry {
  id?: string;
  /** Timer-ready StudyItem-compatible fields used by the integration child card. */
  type?: 'scienceReview';
  title?: string;
  minutes?: string;
  required?: boolean;
  f?: StudyItemFields;
  subject: '生物' | '化學' | '物理' | '地科';
  material?: '123日的淬鍊';
  ranges?: Array<[number, number]>;
  pageText?: string;
  chapterText?: string;
  dynamic?: boolean;
  done?: boolean;
  source?: string;
  calendarIntegrationChild?: boolean;
}

export interface CalendarMathPlanEntry {
  title: string;
  book: string;
  start: number;
  end: number;
  pages: number;
  unitPages: number;
  weekTarget: number;
}
