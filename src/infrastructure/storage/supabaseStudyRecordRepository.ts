import type {
  CloudStudyRecordRepositoryPort,
  CloudStudyRecordSaveResult,
  CloudStudyRecordSnapshot,
} from '../../application/ports/studyRecordRepository.ts';
import { markRecordSynced, stripRecordSyncMeta } from '../../storage/recordSync.ts';
import { decodeStudyRecord } from '../../storage/studyRecordCodec.ts';
import type { StudyRecord } from '../../types.ts';

interface SupabaseErrorLike {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

interface SupabaseResult<T> {
  data: T;
  error: SupabaseErrorLike | null;
}

interface StudyRecordQuery extends PromiseLike<SupabaseResult<unknown>> {
  gte(column: string, value: string): StudyRecordQuery;
  gt(column: string, value: string): StudyRecordQuery;
  eq(column: string, value: string): StudyRecordQuery;
  or(filters: string): StudyRecordQuery;
  order(column: string, options: { ascending: boolean }): StudyRecordQuery;
  limit(count: number): StudyRecordQuery;
  maybeSingle(): PromiseLike<SupabaseResult<unknown>>;
}

export interface SupabaseStudyRecordClient {
  from(table: string): { select(columns: string): StudyRecordQuery };
  rpc(functionName: string, parameters: Record<string, unknown>): PromiseLike<SupabaseResult<unknown>>;
}

interface StudyRecordRow {
  study_date: string;
  payload: unknown;
  revision?: number | string | null;
  updated_at?: string | null;
}

interface StudyRecordCursor {
  studyDate: string;
  updatedAt: string;
}

export const STUDY_RECORD_PAGE_SIZE = 500;

function errorMessage(error: SupabaseErrorLike): string {
  return [error.message, error.details, error.hint, error.code].filter(Boolean).join('｜') || 'Supabase request failed.';
}

function rowFrom(value: unknown): StudyRecordRow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Partial<StudyRecordRow>;
  if (!row.study_date || row.payload === undefined || row.payload === null) return null;
  return row as StudyRecordRow;
}

export function studyRecordSnapshotFromRow(value: unknown): CloudStudyRecordSnapshot | null {
  const row = rowFrom(value);
  if (!row) return null;
  const studyDate = String(row.study_date);
  const decoded = decodeStudyRecord(row.payload, studyDate);
  if (!decoded.ok) {
    throw new Error(`雲端紀錄 ${studyDate} 無法解碼（${decoded.error}）；已停止同步，沒有把它當成空白資料。`);
  }
  let record = decoded.record;
  delete record.updatedAt;
  const revision = Number(row.revision || 0);
  const updatedAt = String(row.updated_at || '');
  record.serverRevision = revision;
  record.serverUpdatedAt = updatedAt;
  record = markRecordSynced(record);
  return {
    record,
    studyDate,
    revision,
    updatedAt,
  };
}

function rowsFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function paginationCursorFromRow(value: unknown): StudyRecordCursor | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Partial<StudyRecordRow>;
  const studyDate = String(row.study_date ?? '').trim();
  const updatedAt = String(row.updated_at ?? '').trim();
  if (!studyDate || !updatedAt) return null;
  return { studyDate, updatedAt };
}

function postgrestQuoted(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function afterStudyRecordCursor(cursor: StudyRecordCursor): string {
  const updatedAt = postgrestQuoted(cursor.updatedAt);
  return [
    `updated_at.gt.${updatedAt}`,
    `and(updated_at.eq.${updatedAt},study_date.gt.${cursor.studyDate})`,
  ].join(',');
}

/** Contains every study_records Data API/RPC detail used by the browser application. */
export class SupabaseStudyRecordRepository implements CloudStudyRecordRepositoryPort {
  private readonly client: SupabaseStudyRecordClient;

  constructor(client: SupabaseStudyRecordClient) {
    this.client = client;
  }

  async loadMany(updatedSince?: string | null): Promise<CloudStudyRecordSnapshot[]> {
    const snapshots: CloudStudyRecordSnapshot[] = [];
    let cursor: StudyRecordCursor | null = null;

    while (true) {
      let query = this.client.from('study_records').select('study_date,payload,updated_at,revision');
      if (updatedSince) query = query.gte('updated_at', updatedSince);
      if (cursor) query = query.or(afterStudyRecordCursor(cursor));
      query = query
        .order('updated_at', { ascending: true })
        .order('study_date', { ascending: true })
        .limit(STUDY_RECORD_PAGE_SIZE);

      const result = await query;
      if (result.error) throw new Error(errorMessage(result.error));
      const page = rowsFrom(result.data);
      const decodedPage = page.map((row, index) => {
        const snapshot = studyRecordSnapshotFromRow(row);
        if (!snapshot) throw new Error(`雲端第 ${snapshots.length + index + 1} 筆紀錄格式不完整；已停止同步以避免漏資料。`);
        return snapshot;
      });
      snapshots.push(...decodedPage);

      if (page.length < STUDY_RECORD_PAGE_SIZE) break;
      const nextCursor = paginationCursorFromRow(page[page.length - 1]);
      if (!nextCursor) {
        throw new Error('雲端紀錄缺少分頁所需的 study_date 或 updated_at，已停止同步以避免漏資料。');
      }
      if (cursor && cursor.studyDate === nextCursor.studyDate && cursor.updatedAt === nextCursor.updatedAt) {
        throw new Error('雲端紀錄分頁游標沒有前進，已停止同步以避免無限重試。');
      }
      cursor = nextCursor;
    }

    return snapshots.sort((left, right) => left.studyDate.localeCompare(right.studyDate));
  }

  async loadDate(date: string): Promise<CloudStudyRecordSnapshot | null> {
    const result = await this.client
      .from('study_records')
      .select('study_date,payload,updated_at,revision')
      .eq('study_date', date)
      .maybeSingle();
    if (result.error) throw new Error(errorMessage(result.error));
    const snapshot = studyRecordSnapshotFromRow(result.data);
    if (result.data !== null && result.data !== undefined && !snapshot) {
      throw new Error(`雲端紀錄 ${date} 格式不完整；已停止同步以避免將它誤判為不存在。`);
    }
    return snapshot;
  }

  async loadRevision(date: string): Promise<number> {
    const result = await this.client
      .from('study_records')
      .select('study_date,payload,updated_at,revision')
      .eq('study_date', date)
      .maybeSingle();
    if (result.error) throw new Error(errorMessage(result.error));
    const snapshot = studyRecordSnapshotFromRow(result.data);
    if (result.data !== null && result.data !== undefined && !snapshot) {
      throw new Error(`雲端紀錄 ${date} 格式不完整；無法安全讀取 revision。`);
    }
    return snapshot?.revision ?? 0;
  }

  async save(record: StudyRecord, baseRevision: number): Promise<CloudStudyRecordSaveResult> {
    const result = await this.client.rpc('upsert_study_record', {
      p_study_date: record.date,
      p_payload: stripRecordSyncMeta(record),
      p_base_revision: Number(baseRevision || 0),
    });
    if (result.error) throw new Error(errorMessage(result.error));
    const raw = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!raw || typeof raw !== 'object') throw new Error('雲端未回傳儲存結果。');
    const response = raw as Record<string, unknown>;
    const revision = Number(response.revision || 0);
    const updatedAt = String(response.updated_at || '');
    const snapshot = response.payload === undefined || response.payload === null
      ? null
      : studyRecordSnapshotFromRow({
          study_date: record.date,
          payload: response.payload,
          revision,
          updated_at: updatedAt,
        });
    return {
      applied: response.applied === true,
      record: snapshot?.record ?? null,
      revision,
      updatedAt,
    };
  }
}
