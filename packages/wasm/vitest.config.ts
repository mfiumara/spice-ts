import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@spice-ts/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@spice-ts/protocol': fileURLToPath(new URL('../protocol/src/index.ts', import.meta.url)),
    },
  },
});
