import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/stdio.ts'],
  format: ['esm', 'cjs'],
  dts: {
    compilerOptions: {
      composite: false,
    },
  },
  clean: true,
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
