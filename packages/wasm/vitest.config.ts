import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Source tests pin the facade to the worker in dist/, mirroring the define that
// scripts/build.ts injects into dist/index.js (#412). Without a build, use a pin
// that matches nothing so the facade fails closed.
function bundledWorkerPin(): Record<string, string | number> {
  const manifestPath = fileURLToPath(new URL('./dist/manifest.json', import.meta.url));
  if (!existsSync(manifestPath)) {
    return { engineBuildId: '', sha256: '', numericEngineBuildId: '', numericSha256: '', numericByteLength: -1 };
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return {
    engineBuildId: manifest.engineBuildId,
    sha256: manifest.worker.sha256,
    numericEngineBuildId: manifest.numericWasm.engineBuildId,
    numericSha256: manifest.numericWasm.sha256,
    numericByteLength: manifest.numericWasm.byteLength,
  };
}

export default defineConfig({
  define: {
    __SPICE_TS_BUNDLED_WORKER__: JSON.stringify(bundledWorkerPin()),
  },
  resolve: {
    alias: {
      '@spice-ts/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@spice-ts/protocol': fileURLToPath(new URL('../protocol/src/index.ts', import.meta.url)),
    },
  },
});
