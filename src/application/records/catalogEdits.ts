import { LocalStudyRecordRepository, type KeyValueStorage } from '../../infrastructure/storage/localStudyRecordRepository.ts';
import { withCrossTabLock } from '../../storage/crossTabLock.ts';
import { ACTIVE_RECORD_PREFIX_KEY } from '../../storage/local.ts';
import { markRecordLocallyEdited } from '../../storage/recordSync.ts';
import { catalogOverrides, catalogValidationError, type CatalogMaterial } from '../../study/materialCatalog.ts';
import type { StudyRecord } from '../../types.ts';

export async function saveCatalogMaterial(
  storage: KeyValueStorage, prefix: string, entry: CatalogMaterial, expected: CatalogMaterial | null, date: string,
): Promise<void> {
  if (!/^study-v11:(?:guest|user:[^:]+):$/.test(prefix) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('資料空間尚未確認，請重新開啟教材管理。');
  const error = catalogValidationError(entry);
  if (error) throw new Error(error);
  await withCrossTabLock(`gsat-catalog:${prefix}`, function saveDefinition(): void {
    const active = storage.getItem(ACTIVE_RECORD_PREFIX_KEY);
    if (active && active !== prefix) throw new Error('登入帳號已變更，請重新開啟教材管理；草稿尚未寫入其他帳號。');
    const repository = new LocalStudyRecordRepository(storage, prefix);
    const records = repository.listDates().map(day => repository.load(day)).filter((record): record is StudyRecord => !!record);
    const current = catalogOverrides(records).find(material => material.id === entry.id) ?? null;
    if (JSON.stringify(current) !== JSON.stringify(expected)) throw new Error('這本教材已在其他頁面修改，請重新讀取後再編輯；目前草稿仍保留。');
    const loaded = repository.loadResult(date);
    if (loaded.status === 'invalid') throw new Error('今天的原始紀錄無法讀取，請先回 Tracker 修復，教材尚未覆蓋。');
    const previous = loaded.status === 'ok' ? loaded.record : null;
    const record = { ...(previous ?? { date, items: [] }), materialCatalog: [...(previous?.materialCatalog ?? []).filter(material => material.id !== entry.id), entry] };
    if (!repository.save(markRecordLocallyEdited(record, previous))) throw new Error('本機儲存失敗，請保留此頁面的草稿。');
  });
}
