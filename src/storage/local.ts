export const LEGACY_UNSCOPED_PREFIX = 'study-v10.4:';
export const STORAGE_VERSION_PREFIX = 'study-v11:';
export const ACTIVE_RECORD_PREFIX_KEY = `${STORAGE_VERSION_PREFIX}meta:active-record-prefix`;

/** Keep the last explicitly selected local scope while authentication is being restored. */
export function initialRecordPrefix(storage: Pick<Storage, 'getItem'>): string {
  try {
    const active = storage.getItem(ACTIVE_RECORD_PREFIX_KEY);
    if (active && /^study-v11:(?:guest|user:[^:]+):$/.test(active)) return active;
  } catch { /* No readable browser storage: start with the isolated guest scope. */ }
  return storagePrefixForUser(null);
}

export function storagePrefixForUser(userId?: string | null): string {
  return userId
    ? `${STORAGE_VERSION_PREFIX}user:${userId}:`
    : `${STORAGE_VERSION_PREFIX}guest:`;
}
