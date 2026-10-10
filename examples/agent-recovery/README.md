# File-driven agent recovery over MCP stdio

This example is a standalone, file-driven client for the built `@spice-ts/mcp` stdio entrypoint. It imports no MCP, core, protocol, or simulator implementation file. The client reads `invalid-request.json`, discovers the public tools and limits, submits the deliberately over-constrained request, and diagnoses the public `RESOURCE_LIMIT` fields. It changes only `maxResultPoints` to the diagnosed `details.actual`, validates again, runs the bounded simulation, and verifies the exact JSON result plus its SHA-256 digest against `expected-result.json`.

The stable `expected-output.json` contains no host path, timing, random identifier, build metadata, or engine identifier. It is a workflow transcript, not a simulator parity or performance claim.

## Commands

From the repository root, with Node.js 20 or newer and pnpm installed:

    pnpm install --frozen-lockfile
    pnpm -C packages/mcp build
    node examples/agent-recovery/workflow.mjs --server packages/mcp/dist/stdio.js
    node --test examples/agent-recovery/workflow.test.mjs
    node examples/agent-recovery/packed-consumer.mjs

The focused test compares stdout byte-for-byte with `expected-output.json`. The packed-consumer command packs the built core, protocol, and MCP packages, installs those tarballs into a temporary project, changes the child process working directory to that project, and runs this standalone workflow against the installed stdio entrypoint. It also asserts that this directory was not copied into the MCP package.

## Bounds demonstrated

The invalid request deliberately sets these client-side ceilings:

- source: 256 UTF-8 bytes
- analyses: 1
- result points: 0 (corrected to the diagnosed requirement of 1)
- serialized result: 4096 UTF-8 bytes
- wall time: 2000 ms

Capability discovery currently reports these server ceilings:

- document: 262144 UTF-8 bytes
- analyses: 8
- result points: 100000
- serialized result: 4194304 UTF-8 bytes
- wall time: 10000 ms

A request may tighten, but cannot raise, the server ceilings. Recovery uses typed public fields (`error.code`, `error.phase`, and `error.details`) rather than matching display text or an engine name.

## Scope and unsupported behavior

This example covers one operating-point request and one deterministic point-limit recovery path over local stdio. It does not open a network service. It does not demonstrate authentication, cancellation, streaming, browser workers, WASM, circuit-json conversion, transient/DC/AC result verification, every error code, or every resource ceiling. It makes no ngspice parity or speed claim.
