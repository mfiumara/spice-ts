# @spice-ts/wasm

Protocol-v1 module-worker facade for the TypeScript spice-ts engine.

This M3 slice supports only the explicit `spice-ts-js` backend. The name `spice-ts-wasm` is reserved for a later package containing a real numeric WASM artifact; it is neither advertised nor used as a fallback. The internal core backend name `spice-ts` is not accepted at this boundary.

```ts
import { createSpiceEngine } from '@spice-ts/wasm';

const engine = await createSpiceEngine({ backend: 'spice-ts-js' });
const response = await engine.simulate({
  apiVersion: '1',
  input: { format: 'spice', source: 'V1 in 0 5\nR1 in 0 1k\n.op' },
}, { requestId: 'op-1' });
await engine.close();
```

`createSpiceEngine` verifies `dist/worker.js` against `dist/manifest.json` before constructing a worker. A missing or mismatched asset fails with `BACKEND_UNAVAILABLE` before simulation code executes. The manifest's `engineBuildId` is derived from the first 16 hexadecimal characters of the worker SHA-256.

`simulateStream` emits fixed point-count chunks (256 by default, or an explicit positive `chunkPoints`) and canonical protocol events. `cancel(requestId)` is idempotent at the caller boundary: an active request moves to `cancelling`; an unknown or already-terminal request returns `not-found`. Cancelled streams return a partial terminal with no `metadata.resultSha256` and a `partialEventSha256` over the emitted point events.

The worker receives request values only. It exposes no WASI, socket, host-filesystem, or ambient fallback API. This package is not published or deployed by its build/test scripts.
