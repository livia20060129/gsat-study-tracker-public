import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        tracker: './index.html',
        learningSummary: './summary.html',
        materialProgress: './material.progress.html',
      },
    },
  },
});
