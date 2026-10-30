export type PublicBuildEnvironment = Record<string, string | undefined>;

export const ALLOWED_VITE_ENV_KEYS = new Set([
  'VITE_GOOGLE_CLIENT_ID',
]);

/**
 * Only explicitly reviewed public identifiers may use Vite's browser-visible
 * prefix. Any new VITE_ variable must be added to this allowlist deliberately.
 */
export function forbiddenViteEnvironmentKeys(environment: PublicBuildEnvironment): string[] {
  return Object.keys(environment)
    .filter(function isConfiguredViteVariable(key): boolean {
      return key.startsWith('VITE_') && Boolean(String(environment[key] ?? '').trim());
    })
    .filter(function isNotAllowed(key): boolean {
      return !ALLOWED_VITE_ENV_KEYS.has(key);
    })
    .sort();
}

export function assertSafeViteEnvironment(environment: PublicBuildEnvironment): void {
  const forbiddenKeys = forbiddenViteEnvironmentKeys(environment);
  if (forbiddenKeys.length === 0) return;
  throw new Error(
    `Refusing to build: ${forbiddenKeys.join(', ')} would be exposed in the browser. `
      + 'Keep secrets and tokens in Supabase Edge Function secrets without the VITE_ prefix.',
  );
}
