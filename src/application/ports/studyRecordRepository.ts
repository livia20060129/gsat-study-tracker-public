import type { StudyRecord } from '../../types.ts';

export interface LocalStudyRecordRepositoryPort {
  setPrefix(prefix: string): void;
  load(date: string): StudyRecord | null;
  loadFromPrefix(prefix: string, date: string): StudyRecord | null;
  save(record: StudyRecord): boolean;
  remove(date: string): void;
  listDates(prefix?: string): string[];
}

export interface CloudStudyRecordSnapshot {
  record: StudyRecord;
  studyDate: string;
  revision: number;
  updatedAt: string;
}

export interface CloudStudyRecordSaveResult {
  applied: boolean;
  record: StudyRecord | null;
  revision: number;
  updatedAt: string;
}

export interface CloudStudyRecordRepositoryPort {
  loadMany(updatedSince?: string | null): Promise<CloudStudyRecordSnapshot[]>;
  loadDate(date: string): Promise<CloudStudyRecordSnapshot | null>;
  loadRevision(date: string): Promise<number>;
  save(record: StudyRecord, baseRevision: number): Promise<CloudStudyRecordSaveResult>;
}
