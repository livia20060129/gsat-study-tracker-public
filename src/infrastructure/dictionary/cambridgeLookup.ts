/** Compatibility guard for outdated callers. All active lookup uses local ECDICT. */
export async function lookupCambridge(_word: string, _recordPrefix: string, _signal: AbortSignal): Promise<never> {
  throw new Error('線上字典查詢已停用，請使用本機 ECDICT 翻譯。');
}
