# @spice-ts/wasm

Protocol-v1 module-worker facade with explicit TypeScript and bounded numeric WebAssembly backends.

```ts
import { createSpiceEngine } from '@spice-ts/wasm';

const engine = await createSpiceEngine({ backend: 'spice-ts-wasm' });
const response = await engine.simulate({
  apiVersion: '1',
  input: { format: 'spice', source: 'V1 in 0 5\nR1 in 0 1k\n.op' },
}, { requestId: 'op-1' });
await engine.close();
```

## Backends

`spice-ts-js` runs the existing TypeScript engine. It supports the facade's established OP, DC, transient and AC protocol slice.

`spice-ts-wasm` runs a real WebAssembly dense f64 Gaussian-elimination kernel for one deliberately narrow subset:

- SPICE text input only
- exactly one unstepped `.op`
- resistors plus independent constant/DC voltage and current sources (`R`, `V`, `I`)
- at most 65,536 source bytes, 256 components and 64 numeric unknowns
- fixed three-page WebAssembly memory with no imports or growth

The WebAssembly backend does not support native/circuit-json input, virtual files, includes, subcircuits, models, parameters, controlled or nonlinear devices, capacitors, inductors, source waveforms, `.step`, DC sweep, AC or transient analysis. Unsupported input returns `UNSUPPORTED_FEATURE`; exceeded bounds return `RESOURCE_LIMIT`. There is no automatic fallback. A caller that wants the TypeScript path must select `spice-ts-js` explicitly.

The dense kernel is intentionally bounded and is not a speed claim. It has O(n³) runtime and O(n²) memory, and transferring the verified 1,190-byte artifact with each one-shot worker request adds overhead. Sparse and nonlinear WASM remain unsupported.

### Measured cost of this slice

Measured on 2026-10-10 with Node 22.23.1 on an arm64 Apple M5 Pro. Five samples each ran 100 one-shot worker simulations over the fixed four-circuit parity suite in `numeric-wasm.test.ts`, after 10 warmups:

| Backend | Median for 100 OP runs | Median per OP |
| --- | ---: | ---: |
| `spice-ts-js` | 1,966.544 ms | 19.6654 ms |
| `spice-ts-wasm` | 2,319.256 ms | 23.1926 ms |

The bounded WASM path was 17.94% slower in this worker-dominated microbenchmark. No general speedup is claimed. The new artifact and routing code also increase built output size: worker.js grows from 347,919 to 355,517 bytes (+2.18%), index.js from 37,313 to 41,878 bytes (+12.23%), and dense-solver.wasm adds 1,190 bytes. Combined uncompressed output for those files grows 13,353 bytes (+3.47%). Larger or sparse circuits cannot use this backend at all, so they remain on the TypeScript backend by explicit caller choice.

## Integrity and isolation

`createSpiceEngine` verifies `dist/worker.js` and, for `spice-ts-wasm`, `dist/dense-solver.wasm` against `dist/manifest.json` before constructing a worker. Missing, malformed or mismatched assets fail with `BACKEND_UNAVAILABLE`. Build IDs use the first 16 hexadecimal characters of the selected artifact's SHA-256.

The checked-in numeric artifact is copied during package builds, not rebuilt using an ambient toolchain. Its reviewable C source, pinned regeneration command, expected hash, size and ABI are documented in `native/README.md`.

The worker receives request values and the already verified numeric bytes only. It exposes no WASI, socket, host-filesystem, clock, randomness or ambient fallback API. Package build and test scripts do not publish or deploy anything.

## Streaming and cancellation

`simulateStream` emits fixed point-count chunks for the TypeScript backend. OP has no point events, so bounded WebAssembly OP streaming returns the terminal envelope directly. `cancel(requestId)` terminates the operation's one-shot worker; cancellation before asynchronous worker construction is also registered. The fixed 64-unknown ceiling bounds non-interruptible solver work.
