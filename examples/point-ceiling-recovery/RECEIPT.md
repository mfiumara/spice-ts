# Issue 286 implementation receipt

## `/poteto-mode` design

The existing packed-consumer and streaming examples were traced before implementation. Two designs were considered: exercise MCP over stdio, or use the exported `createToolExecutor` directly from an external packed install. The direct public executor was selected because it keeps the example focused on point-ceiling recovery while still crossing the package boundary and exercising the real isolated simulation and stream store.

The request contains three operating-point analyses followed by a valid zero-duration transient. Its deterministic estimate and completed result are both four points. A ceiling of three therefore fails in validation with `RESOURCE_LIMIT`; cloning and changing only `/options/limits/maxResultPoints` to the reported `actual` value of four completes without broadening any other limit.

The stable terminal retains result data, ordered diagnostics, resolved options, backend/build metadata, and canonical hashes. It excludes `requestId`, runtime version, architecture, and any timing, timestamp, or path metadata before canonical hashing. The workflow also replays each read cursor and compares an independently completed second run.

## RED / GREEN

RED commit: `acaa160794ffe444320757ca692bae3a875255c4`. Its focused test failed because `packed-consumer.mjs` was absent and `expected-output.json` was only a placeholder.

GREEN is verified with:

```sh
pnpm -C packages/mcp build
pnpm -C examples test:point-ceiling-recovery
```

## Exclusions

No core, MCP, protocol, WASM, benchmark, roadmap, version, release, or web implementation was changed. The example does not use private source paths, stdio internals, wall-clock values, runtime versions, architecture, temporary paths, or request IDs in its deterministic report. It makes no simulator parity, accuracy, speed, parent-completion, publication, release, or deployment claim.
