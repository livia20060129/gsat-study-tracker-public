import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  decideRevisionSync,
  markRecordSynced,
  mergeStudyRecordsForUpload,
  mergeStudyRecordsThreeWay,
  recordSyncConflicts,
  stripRecordSyncMeta,
} from '../src/storage/recordSync.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

function item(id: string, minutes = '', fields: Record<string, unknown> = {}): StudyItem {
  return {
    id,
    type: 'general',
    done: false,
    minutes,
    required: true,
    title: id,
    f: fields,
  };
}

test('cross-tab upload keeps distinct recorded items from both tabs', () => {
  const first: StudyRecord = {
    date: '2026-09-12',
    items: [item('math', '35')],
  };
  const second: StudyRecord = {
    date: '2026-09-12',
    items: [item('english', '20')],
  };

  const merged = mergeStudyRecordsForUpload(first, second);

  assert.deepEqual(merged.items.map((entry) => entry.id), ['math', 'english']);
  assert.equal(merged.items[0].minutes, '35');
  assert.equal(merged.items[1].minutes, '20');
});

test('blank fields cannot replace recorded fields on the other tab', () => {
  const pending: StudyRecord = {
    date: '2026-09-12',
    notes: '',
    items: [item('biology', '', { topic: '', reason: '已訂正' })],
  };
  const existing: StudyRecord = {
    date: '2026-09-12',
    notes: '保留這段紀錄',
    items: [item('biology', '42', { topic: '細胞呼吸', reason: '' })],
  };

  const merged = mergeStudyRecordsForUpload(pending, existing);

  assert.equal(merged.notes, '保留這段紀錄');
  assert.equal(merged.items[0].minutes, '42');
  assert.equal(merged.items[0].f.topic, '細胞呼吸');
  assert.equal(merged.items[0].f.reason, '已訂正');
});

test('nested grouped child records are merged independently by id', () => {
  const pendingParent = item('parent', '', {
    groupedWorkEntries: [item('range-a', '15')],
  });
  const existingParent = item('parent', '', {
    groupedWorkEntries: [item('range-b', '25')],
  });

  const merged = mergeStudyRecordsForUpload(
    { date: '2026-09-12', items: [pendingParent] },
    { date: '2026-09-12', items: [existingParent] },
  );
  const children = merged.items[0].f.groupedWorkEntries as StudyItem[];

  assert.deepEqual(children.map((entry) => entry.id), ['range-a', 'range-b']);
  assert.deepEqual(children.map((entry) => entry.minutes), ['15', '25']);
});

test('an in-progress English review word replaces its older typed snapshot', () => {
  const pending = item('english-review', '', {
    words: [{ text: 'apple', noun: true }],
  });
  const existing = item('english-review', '', {
    words: [{ text: 'app', noun: true }],
  });

  const merged = mergeStudyRecordsForUpload(
    { date: '2026-09-13', items: [pending] },
    { date: '2026-09-13', items: [existing] },
  );
  const words = merged.items[0].f.words as Array<Record<string, unknown>>;

  assert.equal(words.length, 1);
  assert.equal(words[0].text, 'apple');
  assert.match(String(words[0].id), /^word:v2:/);
});

test('separate English review rows remain separate while each row is updated', () => {
  const pending = item('english-review', '', {
    words: [{ text: 'apple' }, { text: 'take part in' }],
  });
  const existing = item('english-review', '', {
    words: [{ text: 'app' }, { text: 'take part' }],
  });

  const merged = mergeStudyRecordsForUpload(
    { date: '2026-09-13', items: [pending] },
    { date: '2026-09-13', items: [existing] },
  );
  const words = merged.items[0].f.words as Array<Record<string, unknown>>;

  assert.deepEqual(words.map((word) => word.text), ['apple', 'take part in']);
  assert.equal(new Set(words.map((word) => word.id)).size, 2);
});

test('legacy index IDs migrate by row content so reordering does not cross-wire words', () => {
  const pending = item('english-review', '', {
    words: [
      { id: 'word:english-review:0', text: 'banana', noun: true },
      { id: 'word:english-review:1', text: 'apple', noun: true },
    ],
  });
  const existing = item('english-review', '', {
    words: [
      { id: 'word:english-review:0', text: 'apple', noun: true },
      { id: 'word:english-review:1', text: 'banana', noun: true },
    ],
  });

  const merged = mergeStudyRecordsForUpload(
    { date: '2026-09-13', items: [pending] },
    { date: '2026-09-13', items: [existing] },
  );
  const words = merged.items[0].f.words as Array<Record<string, unknown>>;

  assert.deepEqual(words.map((word) => word.text), ['banana', 'apple']);
  assert.equal(words.length, 2);
  assert.equal(new Set(words.map((word) => word.id)).size, 2);
  assert.ok(words.every((word) => String(word.id).startsWith('word:v2:')));
});

test('meaningful false, zero, and null values remain explicit local edits', () => {
  const pending = item('timer', '0', {
    corrected: false,
    score: 0,
    timeTracking: { mode: 'manual', accumulatedSeconds: 90, startedAt: null },
  });
  const existing = item('timer', '30', {
    corrected: true,
    score: 10,
    timeTracking: { mode: 'timer', accumulatedSeconds: 90, startedAt: 12345 },
  });

  const merged = mergeStudyRecordsForUpload(
    { date: '2026-09-12', items: [pending] },
    { date: '2026-09-12', items: [existing] },
  );

  assert.equal(merged.items[0].minutes, '0');
  assert.equal(merged.items[0].f.corrected, false);
  assert.equal(merged.items[0].f.score, 0);
  assert.equal((merged.items[0].f.timeTracking as Record<string, unknown>).startedAt, null);
});

test('three-way merge preserves deliberate blank fields when cloud is unchanged', () => {
  const base: StudyRecord = {
    date: '2026-09-12',
    notes: '刪除這段內容',
    items: [item('biology', '42', { topic: '細胞呼吸' })],
  };
  const local = markRecordSynced(base);
  local.notes = '';
  local.items[0].minutes = '';
  local.items[0].f.topic = '';
  local.localDirty = true;

  const merged = mergeStudyRecordsThreeWay(local, markRecordSynced(base));

  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.record.notes, '');
  assert.equal(merged.record.items[0].minutes, '');
  assert.equal(merged.record.items[0].f.topic, '');
});

test('three-way merge keeps item and nested word deletions deleted', () => {
  const base: StudyRecord = {
    date: '2026-09-12',
    items: [
      item('keep', '10'),
      item('delete-card', '20'),
      item('english-review', '', {
        words: [
          { id: 'word-a', text: 'apple' },
          { id: 'word-b', text: 'banana' },
        ],
      }),
    ],
  };
  const local = markRecordSynced(base);
  local.items = local.items.filter((entry) => entry.id !== 'delete-card');
  (local.items[1].f.words as Array<Record<string, unknown>>).splice(0, 1);
  local.localDirty = true;

  const merged = mergeStudyRecordsThreeWay(local, markRecordSynced(base));
  const words = merged.record.items.find((entry) => entry.id === 'english-review')?.f.words as Array<Record<string, unknown>>;

  assert.equal(merged.conflicts.length, 0);
  assert.deepEqual(merged.record.items.map((entry) => entry.id), ['keep', 'english-review']);
  assert.deepEqual(words.map((entry) => entry.id), ['word-b']);
});

test('three-way merge combines changes to different fields and flags the same field', () => {
  const base = markRecordSynced({ date: '2026-09-12', mood: '普通', notes: '原始', items: [] });
  const local = structuredClone(base);
  const cloud = structuredClone(base);
  local.notes = '本機筆記';
  local.localDirty = true;
  cloud.mood = '精神良好';

  const safe = mergeStudyRecordsThreeWay(local, cloud);
  assert.equal(safe.conflicts.length, 0);
  assert.equal(safe.record.notes, '本機筆記');
  assert.equal(safe.record.mood, '精神良好');

  cloud.notes = '雲端筆記';
  const conflict = mergeStudyRecordsThreeWay(local, cloud);
  assert.equal(conflict.conflicts.length, 1);
  assert.equal(conflict.conflicts[0].path, '$.notes');
  assert.equal(recordSyncConflicts(conflict.record).length, 1);
});

test('delete versus edit becomes a visible conflict instead of resurrecting silently', () => {
  const base = markRecordSynced({ date: '2026-09-12', items: [item('essay', '20')] });
  const local = structuredClone(base);
  const cloud = structuredClone(base);
  local.items = [];
  local.localDirty = true;
  cloud.items[0].minutes = '30';

  const merged = mergeStudyRecordsThreeWay(local, cloud);

  assert.equal(merged.conflicts.length, 1);
  assert.equal(merged.conflicts[0].kind, 'delete-vs-edit');
  assert.match(merged.conflicts[0].path, /id:essay/);
});

test('server snapshots establish a local-only common base', () => {
  const synced = markRecordSynced({ date: '2026-09-12', serverRevision: 8, items: [item('math', '15')] });
  const payload = stripRecordSyncMeta(synced);

  assert.equal(synced.syncBase?.items[0].minutes, '15');
  assert.equal(payload.syncBase, undefined);
  assert.equal(payload.serverRevision, undefined);
});

test('dirty record with a common base can merge a newer cloud revision', () => {
  const base = markRecordSynced({ date: '2026-09-12', serverRevision: 4, items: [] });
  const local = structuredClone(base);
  local.notes = '本機';
  local.localDirty = true;
  const cloud = markRecordSynced({ date: '2026-09-12', serverRevision: 5, mood: '普通', items: [] });

  assert.equal(decideRevisionSync(local, cloud), 'push-local');
});

test('records from different dates are never combined', () => {
  assert.throws(
    () => mergeStudyRecordsForUpload(
      { date: '2026-09-12', items: [] },
      { date: '2026-09-13', items: [] },
    ),
    /different dates/,
  );
});

test('the save queue merges tab snapshots and reloads cloud inside the date lock', () => {
  const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');

  assert.match(runtime, /withCloudDateLock\(date,async function\(\)\{/);
  assert.match(runtime, /mergeStudyRecordsForUpload\(readStoredRecord\(date\)\|\|record,record\)/);
  assert.match(runtime, /mergeStudyRecordsForUpload\(stored\|\|rec,rec\)/);
  assert.match(runtime, /cloudRecordRepository\.loadDate\(rec\.date\)/);
  assert.match(runtime, /cloudRecordRepository\.save\(snapshot,baseRevision\)/);
  assert.match(runtime, /for\(var attempt=0;attempt<2;attempt\+\+\)/);
  assert.match(runtime, /words\.push\(\{id:uid\('word'\),text:''/);
  assert.match(runtime, /ensureEnglishReviewWordEntryIds\(data\)/);
  assert.match(runtime, /recordSyncConflicts\(snapshot\)/);
  assert.match(runtime, /cloudReplaceRecord\(exact,true\)/);
  assert.match(runtime, /saveCloudConflictBackup/);
});
