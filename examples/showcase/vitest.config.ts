import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    testTimeout: 30_000,
  },
}));
