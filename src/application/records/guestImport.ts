import { LocalStudyRecordRepository, type KeyValueStorage } from '../../infrastructure/storage/localStudyRecordRepository.ts';
import { withCrossTabLock } from '../../storage/crossTabLock.ts';
import { storagePrefixForUser } from '../../storage/local.ts';
import { markRecordLocallyEdited, mergeStudyRecordsThreeWay, sameStudyContent, stripRecordSyncMeta } from '../../storage/recordSync.ts';
import type { StudyItem, StudyRecord } from '../../types.ts';

interface GuestImportReceipt {
  owner: string;
  snapshot?: StudyRecord;
  itemIds: Record<string, string>;
}

export interface GuestImportResult {
  importedDates: number;
  importedItems: number;
  conflicts: number;
  otherAccountDates: number;
  failedDates: string[];
}

const RECEIPT_PREFIX = 'study-v11:meta:guest-import:';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readReceipt(storage: KeyValueStorage, date: string): GuestImportReceipt | null {
  const raw = storage.getItem(RECEIPT_PREFIX + date);
  if (!raw) return null;
  const receipt = JSON.parse(raw) as GuestImportReceipt;
  if (!receipt.owner || !receipt.itemIds || typeof receipt.itemIds !== 'object') throw new Error('Invalid guest import receipt');
  return receipt;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function itemRecord(date: string, item: StudyItem): StudyRecord {
  return { date, items: [item] };
}

function importedItem(source: StudyItem, destination: string): StudyItem {
  const item = clone(source);
  item.id = destination;
  if (item.deferredOriginId) item.deferredOriginId = `guest-import:${item.deferredOriginId}`;
  if (item.deferredOriginIds) item.deferredOriginIds = item.deferredOriginIds.map(id => `guest-import:${id}`);
  if (item.source === 'preset') {
    item.source = 'custom';
    delete item.presetKey;
    delete item.templatePresetKey;
  }
  for (const key of ['makeupEntries', 'reviewEntries', 'interactiveEntries', 'calendarIntegrationEntries', 'groupedWorkEntries', 'dailyWorkSourceItems']) {
    const children = item.f?.[key];
    if (Array.isArray(children)) item.f[key] = children.map(child => child && typeof child === 'object' && child.id ? importedItem(child, `guest-import:${child.id}`) : child);
  }
  return item;
}

function hasGuestItemContent(item: StudyItem): boolean {
  if (item.source !== 'preset') return true;
  const f = item.f ?? {};
  const childContent = ['makeupEntries', 'reviewEntries', 'interactiveEntries', 'calendarIntegrationEntries', 'groupedWorkEntries', 'dailyWorkSourceItems']
    .some(key => Array.isArray(f[key]) && (f[key] as StudyItem[]).some(child => child && hasGuestItemContent({ ...child, source: 'preset' })));
  return childContent || item.done || Number(item.minutes) > 0 || ['progress', 'graded', 'corrected', 'review'].some(key => f[key] === true)
    || (Array.isArray(f.words) && f.words.length > 0) || Boolean(f.reason)
    || Boolean(f.dailyWorkUserFields && Object.keys(f.dailyWorkUserFields as object).length);
}

function hasGuestContent(record: StudyRecord): boolean {
  return record.items.some(hasGuestItemContent) || Boolean(record.materialCatalog?.length)
    || ['notes', 'mood', 'wakeTime', 'bedtime', 'biggestBlock', 'firstThingTomorrow'].some(key => Boolean((record as unknown as Record<string, unknown>)[key]));
}

/** Copy additions into an account without replacing its existing daily card. */
export function mergeGuestAdditions(
  guest: StudyRecord, account: StudyRecord | null, previous: StudyRecord | undefined, itemIds: Record<string, string>,
): { record: StudyRecord; added: number; conflicts: number } {
  const record = clone(account ?? { date: guest.date, items: [] });
  const previousItems = new Map((previous?.items ?? []).map(item => [item.id, item]));
  let added = 0;
  const conflicts = [];
  for (const original of guest.items) {
    if (!hasGuestItemContent(original)) continue;
    const prior = previousItems.get(original.id);
    if (prior && sameValue(prior, original)) continue;
    let destination = itemIds[original.id];
    if (!destination) {
      destination = `guest-import:${original.id}`;
      while (record.items.some(item => item.id === destination)) destination = `guest-import:${destination}`;
      itemIds[original.id] = destination;
    }
    const incoming = importedItem(original, destination);
    const index = record.items.findIndex(item => item.id === destination);
    if (index < 0) {
      record.items.push(incoming);
      added++;
    } else if (prior) {
      const base = importedItem(prior, destination);
      const merged = mergeStudyRecordsThreeWay(itemRecord(guest.date, incoming), itemRecord(guest.date, record.items[index]), itemRecord(guest.date, base));
      record.items[index] = merged.record.items[0];
      conflicts.push(...merged.conflicts);
    }
  }
  const content = stripRecordSyncMeta(guest) as unknown as Record<string, unknown>;
  const target = record as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(content)) {
    if (key === 'date' || key === 'items' || key === 'schemaVersion' || value === undefined || value === '') continue;
    if (key === 'materialCatalog' && Array.isArray(value)) {
      const existing = Array.isArray(target[key]) ? target[key] as Array<{ id: string }> : [];
      target[key] = [...existing, ...clone(value).filter(entry => !existing.some(current => current.id === entry.id))];
    } else if (target[key] === undefined || target[key] === '') {
      target[key] = clone(value);
    } else if (key === 'notes' && typeof value === 'string' && !sameValue(value, previous?.notes) && !String(target[key]).includes(value)) {
      target[key] = `${target[key]}\n\n訪客紀錄：\n${value}`;
    }
  }
  const edited = markRecordLocallyEdited(record, account);
  // An uncached account day may still exist remotely. Treat both sides as independent
  // additions so a later upload reports competing values instead of replacing them.
  if (!account) edited.syncBase = { date: guest.date, items: [] };
  if (conflicts.length) {
    edited.syncConflict = true;
    edited.syncConflictDetails = [...(edited.syncConflictDetails ?? []), ...conflicts];
    edited.syncConflictLocal = stripRecordSyncMeta(edited);
    edited.syncConflictCloud = account ? stripRecordSyncMeta(account) : undefined;
  }
  return { record: edited, added, conflicts: conflicts.length };
}

/** A durable receipt binds each guest day to its first account, including interrupted uploads. */
export async function importGuestRecords(storage: KeyValueStorage, userId: string): Promise<GuestImportResult> {
  const result: GuestImportResult = { importedDates: 0, importedItems: 0, conflicts: 0, otherAccountDates: 0, failedDates: [] };
  if (!userId) return result;
  const guest = new LocalStudyRecordRepository(storage, storagePrefixForUser());
  const account = new LocalStudyRecordRepository(storage, storagePrefixForUser(userId));
  for (const date of guest.listDates()) {
    try {
      await withCrossTabLock(`gsat-guest-import:${date}`, function lockAccount(): Promise<void> {
       return withCrossTabLock(`gsat-study-record:${userId}:${date}`, function importDate(): void {
        const source = guest.loadResult(date);
        if (source.status !== 'ok') throw new Error('Guest record cannot be read');
        if (!hasGuestContent(source.record)) return;
        let receipt = readReceipt(storage, date);
        if (receipt && receipt.owner !== userId) { result.otherAccountDates++; return; }
        if (receipt?.snapshot && sameStudyContent(source.record, receipt.snapshot)) return;
        receipt ??= { owner: userId, itemIds: {} };
        storage.setItem(RECEIPT_PREFIX + date, JSON.stringify(receipt));
        const loaded = account.loadResult(date);
        if (loaded.status === 'invalid') throw new Error('Account record cannot be read');
        const current = loaded.status === 'ok' ? loaded.record : null;
        const merged = mergeGuestAdditions(source.record, current, receipt.snapshot, receipt.itemIds);
        // Persist the ID mapping before the data write: a retry reuses the same destination IDs.
        storage.setItem(RECEIPT_PREFIX + date, JSON.stringify(receipt));
        if (!sameStudyContent(current, merged.record)) {
          if (!account.save(merged.record)) throw new Error('Account record cannot be saved');
          result.importedDates++;
          result.importedItems += merged.added;
          result.conflicts += merged.conflicts;
        }
        receipt.snapshot = clone(source.record);
        storage.setItem(RECEIPT_PREFIX + date, JSON.stringify(receipt));
       });
      });
    } catch {
      result.failedDates.push(date);
    }
  }
  return result;
}
