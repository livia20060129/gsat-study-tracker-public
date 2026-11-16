import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { markRecordLocallyEdited, sameStudyContent } from '../src/storage/recordSync.ts';
import type { StudyRecord } from '../src/types.ts';

const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
const start = runtime.indexOf('function persist(show,options){');
const end = runtime.indexOf('\nfunction load(options){', start);
assert.ok(start >= 0 && end > start);
const original: StudyRecord = { date: '2026-11-14', notes: '已保存的筆記', items: [], localDirty: true };

interface PersistenceFixture {
  save(): boolean;
  context: { data: StudyRecord; dataLoadBase: StudyRecord | null };
  writes(): number;
  reads(): number;
}

function persistence(options: {
  saved: StudyRecord | null; draft?: StudyRecord; reread?: StudyRecord | null; valid?: boolean; relink?: boolean;
}): PersistenceFixture {
  let writes = 0;
  let reads = 0;
  const context = {
    data: structuredClone(options.draft ?? original),
    dataLoadBase: structuredClone(options.saved),
    guestScopeConfirmationPending: false,
    cloudUser: null,
    ensureEnglishReviewWordEntryIds(): void {},
    readHeader(): void {},
    readStoredRecord(): StudyRecord | null {
      reads += 1;
      const record = reads > 1 && 'reread' in options ? options.reread : options.saved;
      return structuredClone(record ?? null);
    },
    validate(): { ok: boolean; msg: string } { return { ok: options.valid !== false, msg: '欄位尚未填完整' }; },
    sameStudyContent,
    markRecordLocallyEdited,
    isNewEmptyRecord(): boolean { return false; },
    cloneRecord: structuredClone,
    relinkDailyWorkSourceItems(items: StudyRecord['items']): void {
      if (options.relink) items.push({ id: 'linked-item', type: 'general', title: '連動項目', source: 'custom', required: false, done: false, minutes: '', f: {} });
    },
    writeStoredRecord(): never { writes += 1; throw new DOMException('full', 'QuotaExceededError'); },
    rangeCompletionSignature(): string { return ''; },
    queueCloudSave(): void {},
    updateCloudStatusBadge(): void {},
    window: { dispatchEvent(): void {} },
    Event,
  };
  const save = runInNewContext(`${runtime.slice(start, end)}\npersist`, context) as () => boolean;
  return { save, context, writes: (): number => writes, reads: (): number => reads };
}

test('unchanged saved content needs no extra record write when storage is full', () => {
  const fixture = persistence({ saved: original });
  assert.equal(fixture.save(), true);
  assert.equal(fixture.writes(), 0);
  assert.ok(fixture.reads() >= 2);
  assert.equal(fixture.context.data.localDirty, true);
  assert.equal(fixture.context.data.notes, original.notes);
});

test('newly edited input still fails safely when the record cannot be written', () => {
  const fixture = persistence({ saved: original, draft: { ...original, notes: '尚未保存的新輸入' } });
  assert.equal(fixture.save(), false);
  assert.equal(fixture.writes(), 1);
  assert.equal(fixture.context.data.notes, '尚未保存的新輸入');
  assert.equal(fixture.context.dataLoadBase?.notes, original.notes);
});

test('a date with no stored record cannot claim persistence without writing it', () => {
  const fixture = persistence({ saved: null });
  assert.equal(fixture.save(), false);
  assert.equal(fixture.writes(), 1);
});

test('a changed reread cannot be accepted as the saved draft or overwritten', () => {
  const fixture = persistence({ saved: original, reread: { ...original, notes: '另一分頁的新內容' } });
  assert.equal(fixture.save(), false);
  assert.equal(fixture.writes(), 0);
  assert.equal(fixture.context.dataLoadBase?.notes, original.notes);
});

test('invalid current fields still prevent saving even when previous content exists', () => {
  const fixture = persistence({ saved: original, valid: false });
  assert.equal(fixture.save(), false);
  assert.equal(fixture.writes(), 0);
});

test('relinked content still requires a write even if the original draft was unchanged', () => {
  const fixture = persistence({ saved: original, relink: true });
  assert.equal(fixture.save(), false);
  assert.equal(fixture.writes(), 1);
});
