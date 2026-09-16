export interface CrossTabLockManager {
  request<T>(name: string, callback: () => Promise<T> | T): Promise<T>;
}

export interface CrossTabLockStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CrossTabFallbackOptions {
  leaseMs?: number;
  acquireTimeoutMs?: number;
  pollMs?: number;
  ownerId?: string;
}

interface BakeryTicket {
  owner: string;
  number: number;
  expiresAt: number;
}

const inPageTails = new Map<string, Promise<void>>();
let invocation = 0;

function randomId(): string {
  const cryptoApi = typeof crypto !== 'undefined' ? crypto : null;
  return cryptoApi && typeof cryptoApi.randomUUID === 'function'
    ? cryptoApi.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const pageOwnerId = randomId();

function browserLockManager(): CrossTabLockManager | null {
  if (typeof navigator === 'undefined') return null;
  const locks = (navigator as Navigator & { locks?: CrossTabLockManager }).locks;
  return locks && typeof locks.request === 'function' ? locks : null;
}

function browserFallbackStorage(): CrossTabLockStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    const storage = window.localStorage;
    void storage.length;
    return storage;
  } catch {
    return null;
  }
}

async function withInPageLock<T>(name: string, task: () => Promise<T> | T): Promise<T> {
  const previous = inPageTails.get(name) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => gate);
  inPageTails.set(name, tail);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (inPageTails.get(name) === tail) inPageTails.delete(name);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function crossTabLockStoragePrefix(name: string): string {
  return `study-v11:meta:cross-tab-lock:${encodeURIComponent(name)}:`;
}

function parseTicket(raw: string | null): BakeryTicket | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<BakeryTicket>;
    if (!value.owner || !Number.isFinite(value.number) || !Number.isFinite(value.expiresAt)) return null;
    return { owner: String(value.owner), number: Number(value.number), expiresAt: Number(value.expiresAt) };
  } catch {
    return null;
  }
}

function activeTickets(
  storage: CrossTabLockStorage,
  prefix: string,
  now: number,
): { choosing: BakeryTicket[]; tickets: BakeryTicket[] } {
  const choosing: BakeryTicket[] = [];
  const tickets: BakeryTicket[] = [];
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  for (const key of keys) {
    const ticket = parseTicket(storage.getItem(key));
    if (!ticket || ticket.expiresAt <= now) {
      storage.removeItem(key);
      continue;
    }
    if (key.startsWith(`${prefix}choosing:`)) choosing.push(ticket);
    if (key.startsWith(`${prefix}ticket:`)) tickets.push(ticket);
  }
  return { choosing, tickets };
}

/**
 * localStorage-backed Lamport bakery lock for browsers that do not implement
 * Web Locks. Each contender owns a separate key, so one tab cannot silently
 * overwrite another tab's lease. Expired keys recover automatically after a
 * tab or browser crashes.
 */
export async function withStorageCrossTabLock<T>(
  name: string,
  task: () => Promise<T> | T,
  storage: CrossTabLockStorage,
  options: CrossTabFallbackOptions = {},
): Promise<T> {
  const leaseMs = Math.max(1_000, Number(options.leaseMs ?? 15_000));
  const acquireTimeoutMs = Math.max(leaseMs, Number(options.acquireTimeoutMs ?? 45_000));
  const pollMs = Math.max(5, Number(options.pollMs ?? 35));
  const owner = options.ownerId || `${pageOwnerId}:${++invocation}:${randomId()}`;
  const prefix = crossTabLockStoragePrefix(name);
  const encodedOwner = encodeURIComponent(owner);
  const choosingKey = `${prefix}choosing:${encodedOwner}`;
  const ticketKey = `${prefix}ticket:${encodedOwner}`;
  const startedAt = Date.now();

  storage.setItem(choosingKey, JSON.stringify({ owner, number: 0, expiresAt: Date.now() + leaseMs }));
  const existing = activeTickets(storage, prefix, Date.now()).tickets;
  const nextNumber = existing.reduce((largest, ticket) => Math.max(largest, ticket.number), 0) + 1;
  storage.setItem(ticketKey, JSON.stringify({ owner, number: nextNumber, expiresAt: Date.now() + leaseMs }));
  storage.removeItem(choosingKey);

  try {
    while (true) {
      const now = Date.now();
      const active = activeTickets(storage, prefix, now);
      const anotherTabIsChoosing = active.choosing.some((entry) => entry.owner !== owner);
      const ordered = active.tickets.sort((left, right) => left.number - right.number || left.owner.localeCompare(right.owner));
      if (!anotherTabIsChoosing && ordered[0]?.owner === owner) break;
      if (now - startedAt >= acquireTimeoutMs) {
        throw new Error('等待其他分頁完成雲端同步逾時，已停止本次操作以避免資料互相覆蓋。');
      }
      await delay(pollMs + Math.floor(Math.random() * pollMs));
    }

    const heartbeat = setInterval(() => {
      const current = parseTicket(storage.getItem(ticketKey));
      if (current?.owner === owner) {
        storage.setItem(ticketKey, JSON.stringify({ ...current, expiresAt: Date.now() + leaseMs }));
      }
    }, Math.max(250, Math.floor(leaseMs / 3)));
    try {
      return await task();
    } finally {
      clearInterval(heartbeat);
    }
  } finally {
    const current = parseTicket(storage.getItem(ticketKey));
    if (current?.owner === owner) storage.removeItem(ticketKey);
    storage.removeItem(choosingKey);
  }
}

/** Serializes a cloud-record operation across browser tabs. */
export function withCrossTabLock<T>(
  name: string,
  task: () => Promise<T> | T,
  lockManager: CrossTabLockManager | null = browserLockManager(),
  fallbackStorage: CrossTabLockStorage | null = browserFallbackStorage(),
): Promise<T> {
  if (lockManager) return lockManager.request(name, task);
  return withInPageLock(name, () => fallbackStorage
    ? withStorageCrossTabLock(name, task, fallbackStorage)
    : task());
}
