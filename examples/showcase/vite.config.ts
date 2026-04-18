import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/spice-ts/',
  // Alias workspace packages to their TS source so `vite dev` hot-reloads on
  // edits in packages/*/src instead of serving the stale dist/ output.
  resolve: {
    alias: [
      { find: '@spice-ts/ui/react', replacement: r('../../packages/ui/src/react/index.ts') },
      { find: /^@spice-ts\/ui$/,    replacement: r('../../packages/ui/src/index.ts') },
      { find: '@spice-ts/core',     replacement: r('../../packages/core/src/index.ts') },
    ],
  },
});
