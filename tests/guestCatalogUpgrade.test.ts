import test from 'node:test';
import assert from 'node:assert/strict';
import { importGuestRecords } from '../src/application/records/guestImport.ts';
import { saveCatalogMaterial } from '../src/application/records/catalogEdits.ts';
import { LocalStudyRecordRepository } from '../src/infrastructure/storage/localStudyRecordRepository.ts';
import { storagePrefixForUser, ACTIVE_RECORD_PREFIX_KEY } from '../src/storage/local.ts';
import { decodeStudyRecord, encodeStudyRecord } from '../src/storage/studyRecordCodec.ts';
import { markRecordSynced, mergeStudyRecordsForUpload, recordSyncConflicts } from '../src/storage/recordSync.ts';
import { builtInMaterialCatalog, materialProgressRows } from '../src/study/materialProgress.ts';
import { catalogItemFields, catalogItemType, catalogLargeSections, catalogOverrides, catalogRangeText, catalogValidationError, effectiveMaterialCatalog, type CatalogMaterial } from '../src/study/materialCatalog.ts';
import { preferredSpeechVoice } from '../src/ui/vocabularySpeech.ts';
import { vocabularyReviewEntries } from '../src/study/vocabularyReview.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

const date = '2026-10-29';
class MemoryStorage {
  values = new Map<string, string>();
  failKey = '';
  get length(): number { return this.values.size; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { if (key === this.failKey) throw new Error('full'); this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}
function item(id = 'new', fields: StudyItem['f'] = {}): StudyItem { return { id, type: 'extra', source: 'custom', done: false, minutes: '', required: false, title: id, f: fields }; }
function material(overrides: Partial<CatalogMaterial> = {}): CatalogMaterial {
  return { id: 'custom:example', title: '測試教材', subject: '英文', group: '補充', mode: 'pages', total: 20,
    sections: [{ id: 'a', start: 1, end: 10, topic: 'Unit 1', detail: '小主題 A' }, { id: 'b', start: 11, end: 20, topic: 'Unit 1', detail: '小主題 B' }], revision: 1, updatedAt: '2026-10-29T01:00:00Z', ...overrides };
}
function setup(guest: StudyRecord, account?: StudyRecord): MemoryStorage {
  const storage = new MemoryStorage();
  new LocalStudyRecordRepository(storage, storagePrefixForUser()).save(guest);
  if (account) new LocalStudyRecordRepository(storage, storagePrefixForUser('a')).save(account);
  return storage;
}
function account(storage: MemoryStorage, user = 'a'): StudyRecord { return new LocalStudyRecordRepository(storage, storagePrefixForUser(user)).load(date)!; }

test('guest sign-in imports new items, routine data and catalog definitions without deleting guest originals', async () => {
  const guest = { date, wakeTime: '07:20', bedtime: { date: '2026-10-30', time: '01:30', dayOffset: 1 }, notes: '訪客筆記', items: [item()], materialCatalog: [material()] } as StudyRecord;
  const storage = setup(guest); const original = storage.getItem(storagePrefixForUser() + date);
  const result = await importGuestRecords(storage, 'a');
  assert.equal(result.importedItems, 1); assert.equal(result.importedDates, 1);
  assert.equal(account(storage).items[0].title, 'new'); assert.equal(account(storage).localDirty, true);
  assert.deepEqual(account(storage).bedtime, guest.bedtime); assert.deepEqual(account(storage).materialCatalog, guest.materialCatalog);
  assert.equal(storage.getItem(storagePrefixForUser() + date), original);
});
test('same-date import preserves account cards, colliding guest IDs, notes and server revision', async () => {
  const storage = setup({ date, items: [item('same', { title: 'guest' })], notes: 'guest' }, markRecordSynced({ date, items: [item('same', { title: 'account' })], notes: 'account', serverRevision: 7 }));
  await importGuestRecords(storage, 'a'); const saved = account(storage);
  assert.equal(saved.items.length, 2); assert.equal(new Set(saved.items.map(entry => entry.id)).size, 2);
  assert.equal(saved.items[0].f.title, 'account'); assert.equal(saved.items[1].f.title, 'guest');
  assert.match(saved.notes!, /account/); assert.match(saved.notes!, /guest/); assert.equal(saved.serverRevision, 7);
});
test('repeat sign-in does not duplicate or overwrite account edits to imported content', async () => {
  const storage = setup({ date, items: [item()] }); await importGuestRecords(storage, 'a');
  const saved = account(storage); saved.items[0].minutes = '18';
  new LocalStudyRecordRepository(storage, storagePrefixForUser('a')).save(saved);
  assert.equal((await importGuestRecords(storage, 'a')).importedDates, 0);
  assert.equal(account(storage).items.length, 1); assert.equal(account(storage).items[0].minutes, '18');
});
test('claimed guest dates cannot be automatically copied to a second account', async () => {
  const storage = setup({ date, items: [item()] }); await importGuestRecords(storage, 'a');
  assert.equal((await importGuestRecords(storage, 'b')).otherAccountDates, 1);
  assert.equal(new LocalStudyRecordRepository(storage, storagePrefixForUser('b')).load(date), null);
});
test('storage failure keeps guest source and an idempotent retry mapping', async () => {
  const storage = setup({ date, items: [item()] }); storage.failKey = storagePrefixForUser('a') + date;
  assert.deepEqual((await importGuestRecords(storage, 'a')).failedDates, [date]);
  storage.failKey = ''; await importGuestRecords(storage, 'a'); await importGuestRecords(storage, 'a');
  assert.equal(account(storage).items.length, 1);
});
test('a cloud day missing from the local cache keeps both versions when a later upload discovers it', async () => {
  const storage = setup({ date, items: [item('guest')], notes: 'guest note' });
  await importGuestRecords(storage, 'a');
  const remote = markRecordSynced({ date, items: [item('remote')], notes: 'remote note', serverRevision: 5 });
  const merged = mergeStudyRecordsForUpload(account(storage), remote);
  assert.equal(merged.items.length, 2); assert.ok(recordSyncConflicts(merged).some(conflict => conflict.path === '$.notes'));
  assert.equal(merged.syncConflictCloud?.notes, 'remote note'); assert.equal(merged.syncConflictLocal?.notes, 'guest note');
});
test('an invalid account payload is never overwritten by guest import', async () => {
  const storage = setup({ date, items: [item()] }); storage.setItem(storagePrefixForUser('a') + date, '{broken');
  assert.deepEqual((await importGuestRecords(storage, 'a')).failedDates, [date]);
  assert.equal(storage.getItem(storagePrefixForUser('a') + date), '{broken');
});
test('new guest additions after an import are appended once, and unchanged imported content stays edited', async () => {
  const storage = setup({ date, items: [item('one')] }); await importGuestRecords(storage, 'a');
  new LocalStudyRecordRepository(storage, storagePrefixForUser()).save({ date, items: [item('one'), item('two')] });
  assert.equal((await importGuestRecords(storage, 'a')).importedItems, 1);
  assert.equal(account(storage).items.length, 2);
});
test('nested guest card IDs do not collide with account card IDs', async () => {
  const guestItem = item('parent', { makeupEntries: [item('child')] });
  const storage = setup({ date, items: [guestItem] }, { date, items: [item('child')] }); await importGuestRecords(storage, 'a');
  const child = account(storage).items[1].f.makeupEntries![0];
  assert.notEqual(child.id, 'child');
});
test('automatic unedited preset days are not copied into an account', async () => {
  const storage = setup({ date, items: [{ ...item('preset'), source: 'preset' }] });
  assert.equal((await importGuestRecords(storage, 'a')).importedDates, 0); assert.equal(account(storage), null);
});
test('independent edits to an imported item are merged, simultaneous same-field changes stay recoverable', async () => {
  const storage = setup({ date, items: [item('one', { title: 'before' })] }); await importGuestRecords(storage, 'a');
  const saved = account(storage); saved.items[0].f.title = 'account edit'; new LocalStudyRecordRepository(storage, storagePrefixForUser('a')).save(saved);
  new LocalStudyRecordRepository(storage, storagePrefixForUser()).save({ date, items: [item('one', { title: 'guest edit' })] });
  assert.equal((await importGuestRecords(storage, 'a')).conflicts, 1);
  assert.equal(account(storage).syncConflict, true); assert.equal(account(storage).syncConflictCloud?.items[0].f.title, 'account edit');
});
test('catalog validation accepts a one-page section and rejects overlap, reversed ranges and fractional pages', () => {
  assert.equal(catalogValidationError(material()), '');
  assert.equal(catalogValidationError(material({ total: 1, sections: [{ id: 'a', start: 1, end: 1, topic: 'Only', detail: '' }] })), '');
  for (const sections of [
    [{ id: 'a', start: 5, end: 4, topic: 'a', detail: '' }],
    [{ id: 'a', start: 1.5, end: 4, topic: 'a', detail: '' }],
    [{ id: 'a', start: 1, end: 5, topic: 'a', detail: '' }, { id: 'b', start: 5, end: 6, topic: 'b', detail: '' }],
  ]) assert.notEqual(catalogValidationError(material({ sections })), '');
});
test('catalog reset wins over an old override after records arrive out of order', () => {
  const builtin = material({ revision: 0, title: 'original' });
  const changed = material({ title: 'changed' }); const reset = material({ revision: 2, reset: true });
  const records = [{ date, items: [], materialCatalog: [reset] }, { date: '2026-10-28', items: [], materialCatalog: [changed] }];
  assert.equal(effectiveMaterialCatalog([builtin], records)[0].title, 'original');
});
test('catalog deletion hides only the directory entry, and a later restore makes it available', () => {
  const deleted = material({ deleted: true }); const records = [{ date, items: [item()], materialCatalog: [deleted] }];
  assert.equal(effectiveMaterialCatalog([], records).length, 0); assert.equal(effectiveMaterialCatalog([], records, true).length, 1);
  assert.equal(records[0].items.length, 1);
  records[0].materialCatalog = [material({ revision: 2 })]; assert.equal(effectiveMaterialCatalog([], records).length, 1);
});
test('catalog input shows small topics while progress merges adjoining sections into their large unit', () => {
  const book = material(); const tracked = { ...item(), f: { ...catalogItemFields(book), start: '1', end: '10', progress: true } };
  assert.match(catalogRangeText(book, tracked), /小主題 A/); assert.equal(catalogLargeSections(book).length, 1);
  const row = materialProgressRows([{ date, items: [tracked], materialCatalog: [book] }]).find(entry => entry.id === book.id)!;
  assert.equal(row.segments.length, 1); assert.equal(row.completionPercent, 50); assert.doesNotMatch(row.segments[0].label, /小主題/);
});
test('catalog cards keep a compact fallback without copying the whole chapter map into each card', () => {
  const book = material();
  const fields = catalogItemFields(book);
  const fallback = fields.catalogMaterialSnapshot as CatalogMaterial;
  assert.equal(fallback.title, book.title); assert.equal(fallback.total, book.total);
  assert.deepEqual(fallback.sections, []); assert.equal(book.sections.length, 2);
});
for (const mode of ['unit', 'round'] as const) test(`catalog ${mode} templates count their own numeric ranges`, () => {
  const book = material({ mode, total: 4, sections: [] }); const fields = catalogItemFields(book);
  if (mode === 'unit') { fields.unitStart = '1'; fields.unitEnd = '2'; } else { fields.round = '1'; fields.roundEnd = '2'; }
  const row = materialProgressRows([{ date, materialCatalog: [book], items: [{ ...item(), done: true, f: fields }] }]).find(row => row.id === book.id)!;
  assert.equal(row.completionPercent, 50);
});
test('built-in catalog exposes all progress materials with the original fine page maps', () => {
  const entries = builtInMaterialCatalog(); assert.ok(entries.length >= materialProgressRows([]).length);
  assert.ok(entries.some(entry => entry.title === 'ENGLISH VOCABULARY IN USE'));
  const physics = entries.find(entry => entry.id === 'natural:物理:新關鍵')!;
  assert.equal(physics.total, 270); assert.ok(physics.sections.length > catalogLargeSections(physics).length);
  assert.equal(catalogItemType(material({ subject: '生物' })), 'scienceReview');
});
test('catalog saves preserve daily cards, routine and cloud revision through the record codec', async () => {
  const storage = new MemoryStorage(); const prefix = storagePrefixForUser();
  new LocalStudyRecordRepository(storage, prefix).save({ date, items: [item()], notes: 'keep', wakeTime: '07:20', serverRevision: 3 });
  await saveCatalogMaterial(storage, prefix, material(), null, date);
  const saved = new LocalStudyRecordRepository(storage, prefix).load(date)!;
  assert.equal(saved.notes, 'keep'); assert.equal(saved.items.length, 1); assert.equal(saved.wakeTime, '07:20'); assert.equal(saved.serverRevision, 3); assert.equal(saved.localDirty, true);
  const decoded = decodeStudyRecord(encodeStudyRecord(saved)); assert.equal(decoded.ok, true);
  if (decoded.ok) assert.deepEqual(decoded.record.materialCatalog, [material()]);
});
test('catalog refuses stale edits or a switched account without replacing the original definition', async () => {
  const storage = new MemoryStorage(); const prefix = storagePrefixForUser();
  await saveCatalogMaterial(storage, prefix, material(), null, date);
  await assert.rejects(saveCatalogMaterial(storage, prefix, material({ title: 'stale', revision: 2 }), null, date), /其他頁面修改/);
  storage.setItem(ACTIVE_RECORD_PREFIX_KEY, storagePrefixForUser('b'));
  await assert.rejects(saveCatalogMaterial(storage, prefix, material({ revision: 2 }), material(), date), /帳號已變更/);
  assert.equal(catalogOverrides([new LocalStudyRecordRepository(storage, prefix).load(date)!])[0].title, '測試教材');
});
test('word frequency counts distinct dates even with duplicates on the same date', () => {
  const words = [{ text: 'alternate', noun: true }, { text: 'alternate', noun: true }];
  const entries = vocabularyReviewEntries([{ date, items: [item('one', { words })] }, { date: '2026-10-28', items: [item('two', { words })] }]);
  assert.equal(entries.length, 1); assert.equal(entries[0].sourceDates.length, 2); assert.equal(entries[0].occurrenceCount, 4);
});
test('speech chooses the requested accent and prefers an available local voice', () => {
  const voices = [{ name: 'Remote US', lang: 'en-US', localService: false }, { name: 'Local UK', lang: 'en_GB', localService: true }, { name: 'Local US', lang: 'en-US', localService: true }] as SpeechSynthesisVoice[];
  assert.equal(preferredSpeechVoice(voices, 'en-US')?.name, 'Local US'); assert.equal(preferredSpeechVoice(voices, 'en-GB')?.name, 'Local UK');
  assert.equal(preferredSpeechVoice([], 'en-GB'), undefined);
});
