# Floating-node repair over MCP stdio

This standalone client drives only the public built `@spice-ts/mcp` stdio API. It validates `floating-request.json`, receives a deterministic `INVALID_CIRCUIT` topology diagnosis, and does not request a numerical solve for that invalid circuit. The workflow follows the diagnosis with the documented repair `Rbleed sense 0 1Meg`, revalidates, and runs an operating point through the streaming tools so the terminal includes public backend, build, input-hash, and result-hash metadata.

`singular-request.json` is deliberately separate. Its topology validates, while numerical solve returns `SINGULAR_MATRIX` for indeterminate parallel ideal-short currents. The workflow also proves that the internal backend identifier `spice-ts` is rejected as `BACKEND_UNAVAILABLE`.

## Commands

From the repository root, with Node.js 20 or newer and pnpm installed:

    pnpm install --frozen-lockfile
    pnpm -C packages/mcp build
    node examples/floating-node-repair/workflow.mjs --server packages/mcp/dist/stdio.js
    node --test examples/floating-node-repair/workflow.test.mjs
    node examples/floating-node-repair/packed-consumer.mjs

The focused test compares stdout byte-for-byte with `expected-output.json`. The packed-consumer command packs core, protocol, and MCP, installs only those tarballs into a temporary external project, and executes the same standalone workflow against the installed stdio entrypoint from the external working directory.

## Deterministic evidence

The snapshot contains exact public error fields, source JSON pointers, involved nodes and branches, the applied repair, validation counts, operating-point values, public backend/build identifiers, and canonical SHA-256 identities. Runtime version, architecture, timing, timestamps, job identifiers, temporary paths, and polling counts are asserted only where needed or omitted because they are host-dependent.

This example is a bounded agent-recovery workflow. It makes no ngspice parity, performance, browser, WASM, network-service, authentication, or parent-completion claim.
