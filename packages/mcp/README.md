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

For local development:

    pnpm -C packages/mcp build
    pnpm -C packages/mcp example

The example creates an MCP client, discovers capabilities, validates a resistor circuit, runs it, and prints the structured responses.

## Resource and cancellation policy

The default hard ceilings are:

- document: 262144 UTF-8 bytes
- analyses: 8
- result points: 100000
- serialized result: 4194304 UTF-8 bytes
- wall time: 10000 ms

A request may specify tighter protocol limits but cannot raise these ceilings. Source directives are preflighted for analysis and point counts, and completed results are checked again before serialization. MCP cancellation is observed before and during adapter calls. A cancelled call returns `CANCELLED`; a ceiling returns `RESOURCE_LIMIT` with the limit name, maximum, and observed value where available.

The stdio process writes protocol messages only to stdout. Do not wrap it with a network listener without adding the authentication, isolation, and deployment design that this bounded package intentionally omits.
