export interface AuthStorageEntry { value: string | null }
export interface AuthPersistence {
  read(key: string): Promise<AuthStorageEntry | undefined>;
  write(key: string, value: string | null): Promise<void>;
  importIfMissing(key: string, value: string): Promise<AuthStorageEntry>;
}
interface LegacyAuthStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_ERROR = '無法保存登入狀態，請確認瀏覽器允許此網站使用儲存空間後再試一次。';

/** Auth storage must survive navigation; never silently fall back to page memory. */
export function createPersistentAuthStorage(persistence: AuthPersistence, legacy: LegacyAuthStorage): {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
} {
  async function getItem(key: string): Promise<string | null> {
    const entry = await persistence.read(key);
    // A persisted null is a sign-out tombstone, not a reason to restore an old token.
    if (entry !== undefined) return entry.value;
    let previous: string | null = null;
    try { previous = legacy.getItem(key); } catch { /* Persistent auth can work without localStorage. */ }
    if (previous === null) return null;
    return (await persistence.importIfMissing(key, previous)).value;
  }
  async function setItem(key: string, value: string): Promise<void> {
    await persistence.write(key, value);
    try { legacy.setItem(key, value); } catch { /* IndexedDB has already committed the session. */ }
  }
  async function removeItem(key: string): Promise<void> {
    await persistence.write(key, null);
    try { legacy.removeItem(key); } catch { /* The tombstone prevents restoring a stale legacy session. */ }
  }
  return { getItem, setItem, removeItem };
}

export function browserAuthPersistence(factory: IDBFactory): AuthPersistence {
  let opening: Promise<IDBDatabase> | null = null;
  function open(): Promise<IDBDatabase> {
    if (opening) return opening;
    opening = new Promise<IDBDatabase>(function openDatabase(resolve, reject): void {
      let request: IDBOpenDBRequest;
      try { request = factory.open('gsat-study-tracker-auth', 1); }
      catch { reject(new Error(STORAGE_ERROR)); return; }
      let rejected = false;
      function fail(): void { rejected = true; opening = null; reject(new Error(STORAGE_ERROR)); }
      request.onupgradeneeded = function createStore(): void { request.result.createObjectStore('sessions'); };
      request.onerror = fail;
      request.onblocked = fail;
      request.onsuccess = function connected(): void {
        const database = request.result;
        if (rejected) { database.close(); return; }
        database.onversionchange = function releaseDatabase(): void { database.close(); opening = null; };
        resolve(database);
      };
    }).catch(function unavailable(error): never { opening = null; throw error; });
    return opening;
  }
  async function read(key: string): Promise<AuthStorageEntry | undefined> {
    const database = await open();
    return new Promise(function readEntry(resolve, reject): void {
      const transaction = database.transaction('sessions', 'readonly');
      const request = transaction.objectStore('sessions').get(key);
      transaction.oncomplete = function completed(): void { resolve(request.result as AuthStorageEntry | undefined); };
      transaction.onabort = transaction.onerror = function failed(): void { reject(new Error(STORAGE_ERROR)); };
    });
  }
  async function commit(key: string, value: string | null, onlyIfMissing: boolean): Promise<AuthStorageEntry> {
    const database = await open();
    return new Promise(function writeEntry(resolve, reject): void {
      const transaction = database.transaction('sessions', 'readwrite');
      const store = transaction.objectStore('sessions');
      let entry: AuthStorageEntry = { value };
      if (onlyIfMissing) {
        const request = store.get(key);
        request.onsuccess = function importLegacy(): void {
          if (request.result !== undefined) entry = request.result as AuthStorageEntry;
          else store.put(entry, key);
        };
      } else store.put(entry, key);
      transaction.oncomplete = function committed(): void { resolve(entry); };
      transaction.onabort = transaction.onerror = function failed(): void { reject(new Error(STORAGE_ERROR)); };
    });
  }
  async function write(key: string, value: string | null): Promise<void> { await commit(key, value, false); }
  function importIfMissing(key: string, value: string): Promise<AuthStorageEntry> { return commit(key, value, true); }
  return { read, write, importIfMissing };
}
