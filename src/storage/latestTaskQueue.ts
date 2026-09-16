export type LatestTaskWorker<Key, Value> = (
  key: Key,
  value: Value,
) => Promise<unknown>;

/**
 * Serializes work per key while coalescing queued values to the latest one.
 * Different keys can still run independently.
 */
export class LatestTaskQueue<Key, Value> {
  private readonly pending = new Map<Key, Value>();
  private readonly running = new Map<Key, Promise<void>>();
  private readonly timers = new Map<Key, ReturnType<typeof setTimeout>>();
  private readonly delayMs: number;
  private readonly worker: LatestTaskWorker<Key, Value>;

  constructor(
    delayMs: number,
    worker: LatestTaskWorker<Key, Value>,
  ) {
    this.delayMs = delayMs;
    this.worker = worker;
  }

  enqueue(key: Key, value: Value): void {
    this.pending.set(key, value);
    this.clearTimer(key);
    if (!this.running.has(key)) this.schedule(key, this.delayMs);
  }

  async flush(key: Key): Promise<void> {
    this.clearTimer(key);
    while (this.running.has(key) || this.pending.has(key)) {
      const active = this.running.get(key);
      if (active) {
        await active;
        continue;
      }
      const started = this.start(key);
      if (started) await started;
    }
  }

  private clearTimer(key: Key): void {
    const timer = this.timers.get(key);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(key);
  }

  private schedule(key: Key, delayMs: number): void {
    if (this.running.has(key) || !this.pending.has(key)) return;
    const timer = setTimeout(() => {
      this.timers.delete(key);
      void this.start(key)?.catch(() => undefined);
    }, delayMs);
    this.timers.set(key, timer);
  }

  private start(key: Key): Promise<void> | null {
    if (this.running.has(key)) return this.running.get(key) ?? null;
    if (!this.pending.has(key)) return null;

    this.clearTimer(key);
    const value = this.pending.get(key) as Value;
    this.pending.delete(key);

    const task = Promise.resolve()
      .then(() => this.worker(key, value))
      .then(() => undefined);
    this.running.set(key, task);

    const finish = () => {
      if (this.running.get(key) === task) this.running.delete(key);
      if (this.pending.has(key)) this.schedule(key, 0);
    };
    void task.then(finish, finish);
    return task;
  }
}
