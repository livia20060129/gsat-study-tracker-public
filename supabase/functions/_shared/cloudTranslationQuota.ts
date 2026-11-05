export interface CloudTranslationQuota {
  allowed: boolean;
  used: number;
  remaining: number;
  limit: number;
  resetsAt: string;
}

export function cloudTranslationQuota(value: unknown): CloudTranslationQuota | null {
  if (!value || typeof value !== 'object') return null;
  const quota = value as Partial<CloudTranslationQuota>;
  const { allowed, used, limit, remaining, resetsAt } = quota;
  if (typeof allowed !== 'boolean' || typeof used !== 'number' || !Number.isSafeInteger(used) || used < 0
    || typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 0 || limit > 5000
    || remaining !== Math.max(0, limit - used)
    || typeof resetsAt !== 'string' || !/^\d{4}-\d{2}-01T/.test(resetsAt)
    || !Number.isFinite(Date.parse(resetsAt))) return null;
  return { allowed, used, remaining, limit, resetsAt };
}

export function cloudTranslationQuotaMessage(quota: CloudTranslationQuota): string {
  const date = new Date(quota.resetsAt).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' });
  return `本月已用 ${quota.used.toLocaleString('en-US')}／${quota.limit.toLocaleString('en-US')} 字元，剩餘 ${quota.remaining.toLocaleString('en-US')} 字元；台灣時間 ${date} 重設。亦受全站每日用量限制。`;
}

/** Reuse one server-generated reservation ID when transport fails after a committed RPC. */
export async function reserveCloudTranslationRequest(
  request: (requestId: string) => Promise<unknown>,
  requestId: string,
): Promise<CloudTranslationQuota> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const quota = cloudTranslationQuota(await request(requestId));
      if (!quota) throw new Error('Invalid quota response');
      return quota;
    } catch {
      if (attempt === 1) throw new Error('Translation quota unavailable');
    }
  }
  throw new Error('Translation quota unavailable');
}
