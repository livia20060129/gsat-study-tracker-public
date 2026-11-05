import { createClient } from 'npm:@supabase/supabase-js@2.114.0';
import { createCloudTranslationHandler } from '../_shared/cloudTranslationHandler.ts';
import type { CloudTranslation } from '../_shared/cloudTranslationProtocol.ts';
import { requestGoogleTranslation } from '../_shared/googleCloudTranslation.ts';

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error('Translation server configuration unavailable');
  return value;
}
function serviceKey(): string {
  const direct = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (direct) return direct;
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
  return keys.default ?? Object.values(keys)[0] ?? requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
}
function dailyLimit(name: string, fallback: number): number {
  const value = Deno.env.get(name);
  const limit = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(limit) || limit < 0 || limit > 5000000) throw new Error('Translation limit unavailable');
  return limit;
}

const admin = createClient(requiredEnv('SUPABASE_URL'), serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });
const handler = createCloudTranslationHandler({
  async authenticate(token): Promise<string | null> {
    const { data, error } = await admin.auth.getUser(token);
    return error || data.user?.is_anonymous ? null : data.user?.id ?? null;
  },
  configured(): boolean { return Boolean(Deno.env.get('GOOGLE_TRANSLATION_API_KEY')?.trim()); },
  async reserve(userId, characters): Promise<boolean> {
    const { data, error } = await admin.rpc('reserve_cloud_translation_usage', {
      p_user_id: userId, p_characters: characters,
      p_user_limit: dailyLimit('GOOGLE_TRANSLATION_USER_DAILY_CHAR_LIMIT', 20000),
      p_global_limit: dailyLimit('GOOGLE_TRANSLATION_GLOBAL_DAILY_CHAR_LIMIT', 200000),
    });
    if (error) throw new Error('Translation quota unavailable');
    return data === true;
  },
  async translate(text, signal): Promise<CloudTranslation> {
    return requestGoogleTranslation(text, requiredEnv('GOOGLE_TRANSLATION_API_KEY'), signal);
  },
});
Deno.serve(handler);
