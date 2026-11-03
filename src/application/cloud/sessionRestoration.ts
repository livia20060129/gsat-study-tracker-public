/** Ignore missing initial events and stale queued callbacks; only confirmed sign-out clears a user. */
export function createSessionRestorationGate<User>(
  apply: (user: User | null) => void,
  schedule: (callback: () => void) => void,
): {
  version(): number;
  isCurrent(version: number): boolean;
  event(name: string, user: User | null): void;
  initial(version: number, user: User | null): void;
} {
  let revision = 0;
  function version(): number { return revision; }
  function isCurrent(value: number): boolean { return revision === value; }
  function queue(user: User | null): void {
    const accepted = ++revision;
    schedule(function applyLatest(): void { if (isCurrent(accepted)) apply(user); });
  }
  function event(name: string, user: User | null): void {
    if (user !== null || name === 'SIGNED_OUT') queue(user);
  }
  function initial(value: number, user: User | null): void {
    if (isCurrent(value)) queue(user);
  }
  return { version, isCurrent, event, initial };
}
