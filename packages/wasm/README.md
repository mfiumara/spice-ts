# @spice-ts/wasm

Protocol-v1 module-worker facade with explicit TypeScript and bounded numeric WebAssembly backends.

```ts
import { createSpiceEngine } from '@spice-ts/wasm';

const engine = await createSpiceEngine({ backend: 'spice-ts-wasm' });
const response = await engine.simulate({
  apiVersion: '1',
  input: { format: 'spice', source: 'V1 in 0 AC 1\nR1 in out 1k\nC1 out 0 1u\n.ac dec 3 10 10k' },
}, { requestId: 'ac-1' });
await engine.close();
```

## Backends

`spice-ts-js` runs the existing TypeScript engine. It supports the facade's established OP, DC, transient and AC protocol slice.

`spice-ts-wasm` runs real and split-complex WebAssembly dense f64 Gaussian-elimination kernels for two deliberately narrow subsets:

- SPICE text input only
- exactly one unstepped analysis
- `.op` with resistors plus independent constant/DC voltage and current sources (`R`, `V`, `I`)
- `.ac lin|dec|oct` with positive finite resistors, capacitors and inductors plus independent voltage and current sources (`R`, `C`, `L`, `V`, `I`)
- AC sources may use constant, `DC`, `AC magnitude [phase]`, or `DC value AC magnitude [phase]` forms
- at most 65,536 source bytes, 256 components and 64 numeric unknowns
- at most 1,025 AC frequency points, further reduced by the caller's `maxResultPoints`
- fixed three-page WebAssembly memory with no imports or growth

The WebAssembly backend does not support native/circuit-json input, virtual files, includes, subcircuits, models, parameters, controlled or nonlinear devices, source waveforms, `.step`, DC sweep or transient analysis. Capacitors and inductors are AC-only. Unsupported input returns `UNSUPPORTED_FEATURE`; exceeded bounds return `RESOURCE_LIMIT`. There is no automatic fallback. A caller that wants the TypeScript path must select `spice-ts-js` explicitly.

The dense kernels are intentionally bounded and are not a speed claim. AC has O(points × n³) runtime and O(n²) memory, and transferring the verified 2,900-byte artifact with each one-shot worker request adds overhead. Sparse and nonlinear WASM remain unsupported.

### Measured cost of this slice

Measured on 2026-10-10 with Node 22.23.1, pnpm 10.28.1, ngspice-47, LLVM/LLD 23.1.3 and an arm64 Apple M5 Pro. The fixed three-circuit AC suite uses byte-identical netlists for both spice-ts backends and ngspice. Its 24 frequency points produced these aggregate rectangular-complex errors:

| Reference | Compared samples | Max absolute | RMS absolute | Max relative | RMS relative |
| --- | ---: | ---: | ---: | ---: | ---: |
| `spice-ts-js` | 59 | 4.4492e-16 | 1.4709e-16 | 1.7826e-15 | 2.9968e-16 |
| ngspice-47 | 58 | 1.1571e-15 | 2.2527e-16 | 1.3279e-15 | 3.8685e-16 |

One ngspice endpoint was excluded because its floating frequency landed just below spice-ts's final OCT point; the complete per-fixture grids and every signal metric are retained in `ac-accuracy-results.json`. No zero-reference samples were excluded.

Five samples each ran 20 one-shot worker simulations after five warmups. Median time was 1,885.183 ms for `spice-ts-js` (94.2592 ms/run) and 1,884.865 ms for `spice-ts-wasm` (94.2433 ms/run). The observed -0.0169% difference is noise-level and is not a speed claim. The measured losses are size: the artifact grows from 1,190 to 2,900 bytes (+143.70%), worker.js from 355,517 to 376,957 bytes (+6.03%), index.js from 41,878 to 42,815 bytes (+2.24%), and their combined uncompressed size grows 24,087 bytes (+6.04%). Larger or sparse circuits cannot use this backend at all.

Reproduce the receipt with `pnpm --filter @spice-ts/wasm bench:ac`. It records tool versions, hashes, full samples, commands, per-fixture metrics and ngspice runtimes in `ac-accuracy-results.json`.

## Integrity and isolation

`createSpiceEngine` verifies `dist/worker.js` and, for `spice-ts-wasm`, `dist/dense-solver.wasm` against `dist/manifest.json` before constructing a worker. Missing, malformed or mismatched assets fail with `BACKEND_UNAVAILABLE`. Build IDs use the first 16 hexadecimal characters of the selected artifact's SHA-256.

The checked-in numeric artifact is copied during package builds, not rebuilt using an ambient toolchain. Its reviewable C source, pinned regeneration command, expected hash, size and ABI v2 are documented in `native/README.md`. ABI v2 retains the real `solve_f64` entry point and adds split-complex `solve_complex_f64`.

The worker receives request values and the already verified numeric bytes only. It exposes no WASI, socket, host-filesystem, clock, randomness or ambient fallback API. Package build and test scripts do not publish or deploy anything.

## Streaming and cancellation

`simulateStream` emits fixed point-count chunks after the one-shot worker returns. OP has no point events. AC point arrays are bounded to 1,025 before allocation. `cancel(requestId)` terminates the operation's one-shot worker; cancellation before asynchronous worker construction is also registered. Caller wall-time expiry terminates the worker. The fixed 64-unknown ceiling bounds each non-interruptible solve.
