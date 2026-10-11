export interface BundledWorkerPin {
  readonly engineBuildId: string;
  readonly sha256: string;
  readonly numericEngineBuildId: string;
  readonly numericSha256: string;
  readonly numericByteLength: number;
}

// Injected at bundle time by scripts/build.ts (and by vitest.config.ts for source tests)
// from dist/manifest.json, so build-specific hashes never live in tracked source (#412).
// Unbundled source imports have no pin; the facade then fails closed on the bundled manifest.
declare const __SPICE_TS_BUNDLED_WORKER__: BundledWorkerPin | undefined;

export const bundledWorker: BundledWorkerPin | undefined =
  typeof __SPICE_TS_BUNDLED_WORKER__ === 'undefined' ? undefined : __SPICE_TS_BUNDLED_WORKER__;
