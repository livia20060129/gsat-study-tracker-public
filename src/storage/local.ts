export const LEGACY_UNSCOPED_PREFIX = 'study-v10.4:';
export const STORAGE_VERSION_PREFIX = 'study-v11:';
export const ACTIVE_RECORD_PREFIX_KEY = `${STORAGE_VERSION_PREFIX}meta:active-record-prefix`;

export function storagePrefixForUser(userId?: string | null): string {
  return userId
    ? `${STORAGE_VERSION_PREFIX}user:${userId}:`
    : `${STORAGE_VERSION_PREFIX}guest:`;
}
