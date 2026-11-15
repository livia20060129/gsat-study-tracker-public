import { expect, type Page } from '@playwright/test';

/** Keep auth regression tests on the real SDK's Google PKCE path. */
export async function installGoogleSignInRedirect(page: Page): Promise<void> {
  await page.route('**/auth/v1/authorize**', route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('provider')).toBe('google');
    expect(url.searchParams.get('code_challenge_method')?.toLowerCase()).toBe('s256');
    const callback = new URL(url.searchParams.get('redirect_to')!);
    callback.searchParams.set('code', 'test-google-code');
    return route.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(callback.href)})</script>` });
  });
}
