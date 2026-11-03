import { defineConfig, loadEnv, type ConfigEnv, type UserConfig } from 'vite';

import { assertSafeViteEnvironment } from './src/config/publicEnvironment.ts';

function createViteConfig({ mode }: ConfigEnv): UserConfig {
  assertSafeViteEnvironment(loadEnv(mode, process.cwd(), ''));
  return {
    base: './',
    plugins: [{ name: 'shared-site-shell', configureServer(server) {
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
