import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'step-worker': 'src/analysis/step-worker.ts',
    'step-worker-browser': 'src/analysis/step-worker-browser.ts',
  },
  format: ['esm', 'cjs'],
  // Keep cold imports inexpensive as device coverage grows, including loaders
  // that parse workspace JavaScript again (for example tsx). Preserve names for
  // diagnostics and source maps for debugging; do not alter numeric expressions.
  esbuildOptions(options) {
    options.minifyWhitespace = true;
  },
  external: ['eecircuit-engine'],
  dts: {
    compilerOptions: {
      composite: false,
    },
  },
  clean: true,
  sourcemap: true,
});
