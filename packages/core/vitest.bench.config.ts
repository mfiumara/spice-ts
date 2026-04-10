import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

export default defineConfig({
  resolve: {
    alias: {
      '@benchmarks': resolve(__dirname, '../../benchmarks'),
    },
  },
  test: {
    include: ['src/benchmarks/**/*.bench.ts'],
    benchmark: {
      outputFile: '../../benchmarks/vitest-bench-results.json',
    },
  },
});
