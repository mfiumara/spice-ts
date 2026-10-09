import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'step-worker': 'src/analysis/step-worker.ts',
    'step-worker-browser': 'src/analysis/step-worker-browser.ts',
  },
  format: ['esm', 'cjs'],
  external: ['eecircuit-engine'],
  dts: {
    compilerOptions: {
      composite: false,
    },
  },
  clean: true,
  sourcemap: true,
});
