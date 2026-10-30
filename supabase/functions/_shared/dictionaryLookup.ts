/** Old deployments receive an explicit retirement response without reading words, tokens or API keys. */
export function createDictionaryLookupHandler(_legacyOptions?: unknown): (request: Request) => Promise<Response> {
  return async function retiredDictionaryLookup(request: Request): Promise<Response> {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    return new Response(JSON.stringify({
      ok: false,
      code: 'dictionary_retired',
      message: 'Online dictionary lookup has been retired. Use local ECDICT.',
      provider: 'ecdict',
    }), { status: 410, headers });
  };
}
