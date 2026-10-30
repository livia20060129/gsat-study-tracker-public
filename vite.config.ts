import { defineConfig, loadEnv, type ConfigEnv, type UserConfig } from 'vite';

import { assertSafeViteEnvironment } from './src/config/publicEnvironment.ts';

function createViteConfig({ mode }: ConfigEnv): UserConfig {
  assertSafeViteEnvironment(loadEnv(mode, process.cwd(), ''));
  return {
    base: './',
    build: {
      rollupOptions: {
        input: {
          tracker: './index.html',
          todo: './todo.html',
          learningSummary: './summary.html',
          materialProgress: './material.progress.html',
          vocabularyReview: './vocabulary.review.html',
          materialCatalog: './material.catalog.html',
        },
      },
    },
  };
}

export default defineConfig(createViteConfig);
