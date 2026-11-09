import { SUPABASE_URL } from './supabase.ts';

/** No remote scripts or inline event handlers; inline styles support saved card layouts. */
export const SITE_SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self'", "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self' data:",
    `connect-src 'self' ${SUPABASE_URL}`, "worker-src 'self' blob:",
    "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Strict-Transport-Security': 'max-age=31536000',
};

export function cloudflareSecurityHeaders(): string {
  return '/*\n' + Object.entries(SITE_SECURITY_HEADERS).map(([name, value]) => `  ${name}: ${value}`).join('\n')
    + '\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n';
}

/** Static hosts such as GitHub Pages still enforce the script policy via HTML. */
export function injectStaticSecurityMeta(html: string): string {
  if (html.includes('data-site-csp')) return html;
  const policy=SITE_SECURITY_HEADERS['Content-Security-Policy'].split('; ').filter(value=>!value.startsWith('frame-ancestors')).join('; ');
  const meta=`<meta http-equiv="Content-Security-Policy" data-site-csp content="${policy}">`;
  return html.replace(/(<head[^>]*>)/i,`$1\n${meta}`);
}
