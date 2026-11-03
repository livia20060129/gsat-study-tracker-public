import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

/** Real HTTP redirects also work in WebKit, which cannot mock a 307 with route.fulfill. */
export async function cleanUrlServer(): Promise<{ origin: string; close: () => Promise<void> }> {
  const names = new Set(['index', 'todo', 'summary', 'material.progress', 'vocabulary.review', 'gpt.prompt']);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1:4174');
      const name = url.pathname.slice(1).replace(/\.html$/, '');
      if (names.has(name) && url.pathname.endsWith('.html')) {
        response.writeHead(307, { location: `/${name}${url.search}` });
        response.end();
        return;
      }
      if (names.has(name)) url.pathname = `/${name}.html`;
      const upstream = await fetch(url);
      response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      response.writeHead(502);
      response.end('Test proxy could not load the local preview.');
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}
