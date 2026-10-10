# @spice-ts/mcp

A bounded stdio MCP server exposing the existing spice-ts protocol-v1 adapter. It does not open a network listener and does not add simulator semantics.

## Tools

- `spice_capabilities`: deterministic discovery of supported analyses, input formats, and server limits.
- `spice_validate`: bounded parse/compile/topology validation without solving.
- `spice_simulate`: one bounded protocol-v1 simulation.
- `spice_simulation_start`: run a bounded simulation and retain canonical protocol-v1 events behind an opaque job cursor.
- `spice_simulation_read`: pull a replayable chunk containing at most 256 points by default (caller-selectable from 1 through the hard cap of 1024).
- `spice_simulation_cancel`: idempotently stop delivery and return the protocol-v1 cancelled terminal with partial analysis counts and `partialEventSha256`.

The validation, one-shot simulation, and stream-start tools accept `{ "request": SimulationRequestV1 }`. Successful results are returned as MCP `structuredContent` and as compact JSON text. Failures set `isError` and return `{ "error": SpiceApiErrorV1 }`; implementation backend names are removed from public errors.

The server supports protocol-v1 `spice` and `spice-ts` inputs and `op`, `dc`, `tran`, and `ac` analyses. `circuit-json` conversion remains owned by `@spice-ts/circuit-json` and is not exposed by this slice.

## Run over stdio

Build the workspace, then configure an MCP client to execute:

    node /absolute/path/to/spice-ts/packages/mcp/dist/stdio.js

For the executable bounded-agent workflow:

    pnpm -C packages/mcp build
    pnpm -C packages/mcp example

The example launches the built `dist/stdio.js` server. It calls `spice_capabilities`, validates an authored voltage divider, and intentionally requests zero result points. The resulting `RESOURCE_LIMIT` has stable public fields under `error.code`, `error.phase`, and `error.details`. The client recovers using `error.details.maximum` and `error.details.actual`, then runs `spice_simulate` again. It never branches on an implementation backend name or parses display text.

The stable output fields and order are recorded in `examples/agent-output.json`. Test the packed package-consumer form with:

    pnpm -C packages/mcp test:packed-consumer

That command packs the MCP, protocol, and core packages, installs them into an isolated project, starts the installed stdio server through the packaged example, and compares stdout byte-for-byte with the expected output.

Expected stable fields are `capabilities.protocolVersion: "1"`, validation counts `2` nodes, `1` branch, and `1` analysis, then `boundedFailure.error.code: "RESOURCE_LIMIT"` with `details.limit: "maxResultPoints"`, `maximum: 0`, and `actual: 1`. Recovery raises only that client limit to the observed point count. The completed OP result contains `out: 5` V and `V1: -0.005` A.

## Resource and cancellation policy

The default simulation ceilings are:

- document: 262144 UTF-8 bytes
- analyses: 8
- result points: 100000
- serialized result: 4194304 UTF-8 bytes
- wall time: 10000 ms

Streaming applies the same document, analysis, point, serialized-result, and wall-time ceilings before a job is retained. Read chunks are point-counted rather than time- or byte-timed. The default chunk is 256 points and `maxPoints` cannot exceed 1024. Each server retains at most 16 jobs; starting a seventeenth evicts the oldest terminal job or returns `RESOURCE_LIMIT` when all retained jobs are unfinished. A cursor is job-scoped, forward-only, and replayable: once read, the same cursor returns the identical chunk even if a later call supplies a different `maxPoints`.

`spice_simulation_start` returns `{ jobId, status: "running", cursor }`. Pass those identifiers to `spice_simulation_read`. Read results use `SimulationReadDataV1` directly: canonical `analysis-start`, contiguous `point`, and `analysis-end` events followed by the existing success terminal. Cancelling after any read returns the same shape with `status: "cancelled"`; its partial hash covers only point events already emitted. Cancellation is tied to cursor progress, never sleeps or wall-clock timing. The internal core backend name is not a public value; successful metadata uses the protocol backend `spice-ts-js`.

A request may specify tighter protocol limits but cannot raise these ceilings. Source directives are preflighted for analysis and point counts, and completed results are checked again before serialization. MCP cancellation is observed before and during adapter calls. A cancelled call returns `CANCELLED`; a ceiling returns `RESOURCE_LIMIT` with the limit name, maximum, and observed value where available.

The executable example proves the current packed Node stdio package's capability, validation, and one-shot tools, JSON-safe results, and one deterministic point-bound recovery path. The packed-consumer and official-client tests additionally exercise normal stream completion, replay, hard chunk bounds, cancellation, malformed reads, and backend-name non-leakage. They do not prove the browser worker or WASM facade, network deployment, authentication, TTL, backpressure, or every resource ceiling.

The stdio process writes protocol messages only to stdout. Do not wrap it with a network listener without adding the authentication, isolation, and deployment design that this bounded package intentionally omits.
