# @spice-ts/mcp

A bounded stdio MCP server exposing the existing spice-ts protocol-v1 adapter. It does not open a network listener and does not add simulator semantics.

## Tools

- `spice_capabilities`: deterministic discovery of supported analyses, input formats, and server limits.
- `spice_validate`: bounded parse/compile/topology validation without solving.
- `spice_simulate`: one bounded protocol-v1 simulation.

Both request tools accept `{ "request": SimulationRequestV1 }`. Successful results are returned as MCP `structuredContent` and as compact JSON text. Failures set `isError` and return `{ "error": SpiceApiErrorV1 }`; implementation backend names are removed from public errors.

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

The default hard ceilings are:

- document: 262144 UTF-8 bytes
- analyses: 8
- result points: 100000
- serialized result: 4194304 UTF-8 bytes
- wall time: 10000 ms

A request may specify tighter protocol limits but cannot raise these ceilings. Source directives are preflighted for analysis and point counts, and completed results are checked again before serialization. MCP cancellation is observed before and during adapter calls. A cancelled call returns `CANCELLED`; a ceiling returns `RESOURCE_LIMIT` with the limit name, maximum, and observed value where available.

The executable example proves the current packed Node stdio package, its three tools, JSON-safe results, and one deterministic point-bound recovery path. It does not prove the browser worker or WASM facade, network deployment, authentication, cancellation timing, or every resource ceiling.

The stdio process writes protocol messages only to stdout. Do not wrap it with a network listener without adding the authentication, isolation, and deployment design that this bounded package intentionally omits.
