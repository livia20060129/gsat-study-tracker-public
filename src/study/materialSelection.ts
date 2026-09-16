export const MATERIAL_SELECTION_STORAGE_SUFFIX = 'material-selection';

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem'>;

export function materialSelectionKey(recordPrefix: string): string {
  return `${recordPrefix}${MATERIAL_SELECTION_STORAGE_SUFFIX}`;
}

export function parseMaterialSelection(raw: string | null, validIds: readonly string[]): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = new Set(validIds);
    const selected = new Set<string>();
    parsed.forEach(value => {
      if (typeof value === 'string' && valid.has(value)) selected.add(value);
    });
    return validIds.filter(id => selected.has(id));
  } catch {
    return [];
  }
}

export function readMaterialSelection(
  storage: ReadableStorage,
  recordPrefix: string,
  validIds: readonly string[],
): string[] {
  return parseMaterialSelection(storage.getItem(materialSelectionKey(recordPrefix)), validIds);
}

export function writeMaterialSelection(
  storage: WritableStorage,
  recordPrefix: string,
  selectedIds: readonly string[],
): void {
  storage.setItem(materialSelectionKey(recordPrefix), JSON.stringify([...new Set(selectedIds)]));
}
