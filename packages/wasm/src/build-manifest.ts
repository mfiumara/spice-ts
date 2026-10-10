export interface BundledWorkerPin {
  readonly engineBuildId: string;
  readonly sha256: string;
  readonly numericEngineBuildId: string;
  readonly numericSha256: string;
  readonly numericByteLength: number;
}

// Injected at bundle time by scripts/build.ts (and by vitest.config.ts for source tests)
// from dist/manifest.json, so build-specific hashes never live in tracked source (#412).
declare const __SPICE_TS_BUNDLED_WORKER__: BundledWorkerPin;

export const bundledWorker: BundledWorkerPin = __SPICE_TS_BUNDLED_WORKER__;
