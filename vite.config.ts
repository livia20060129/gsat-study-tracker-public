import { defineConfig, loadEnv, type ConfigEnv, type UserConfig } from 'vite';
import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { SITE_SECURITY_HEADERS, cloudflareSecurityHeaders, injectStaticSecurityMeta } from './src/config/siteSecurityHeaders.ts';

import { assertSafeViteEnvironment } from './src/config/publicEnvironment.ts';

function createViteConfig({ mode }: ConfigEnv): UserConfig {
  assertSafeViteEnvironment(loadEnv(mode, process.cwd(), ''));
  return {
    base: './',
    plugins: [{ name: 'security-headers', configurePreviewServer(server) {
      server.middlewares.use((_request, response, next) => {
        for (const [name, value] of Object.entries(SITE_SECURITY_HEADERS)) response.setHeader(name, value);
        next();
      });
    }, closeBundle() {
      writeFileSync(resolve('dist/_headers'), cloudflareSecurityHeaders());
      for (const name of readdirSync(resolve('dist')).filter(name=>name.endsWith('.html'))) {
        const path=resolve('dist',name); writeFileSync(path,injectStaticSecurityMeta(readFileSync(path,'utf8')));
      }
    } }, { name: 'shared-site-shell', configureServer(server) {
      server.middlewares.use((request, _response, next) => { if (request.url === '/site-shell.js') request.url = '/src/site-shell.ts'; next(); });
    } }],
    build: {
      rollupOptions: {
        input: {
          siteShell: './src/site-shell.ts',
          tracker: './index.html',
          todo: './todo.html',
          learningSummary: './summary.html',
          materialProgress: './material.progress.html',
          vocabularyReview: './vocabulary.review.html',
          materialCatalog: './material.catalog.html',
        },
        output: { entryFileNames(chunk) { return chunk.name === 'siteShell' ? 'site-shell.js' : 'assets/[name]-[hash].js'; } },
      },
    },
  };
}

export default defineConfig(createViteConfig);
