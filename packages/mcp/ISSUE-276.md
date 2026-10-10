# Issue 276 deterministic worker-death receipt

Base: `26209e640451aa98db1faef85a3d492ad1d68a93`

## `/poteto-mode` scope

The slice is limited to isolated MCP worker lifecycle recovery, deterministic fixtures, packed-consumer evidence, and the MCP README. It does not change simulator semantics, protocol types, WASM, examples, benchmark sources, versions, or release state.

## RED

Command:

    pnpm -C packages/mcp exec vitest run src/server.test.ts

Result before the lifecycle fix: 1 focused file ran; 33 tests passed and 1 failed. The termination fixture called `terminate()` twice: once to cause the injected unexpected exit and again from the exit handler. The failure was:

    expected "vi.fn()" to be called once, but got 2 times

This reproduced non-idempotent cleanup for an already-exited isolated worker. The added deterministic fixtures also pin abnormal exit, error followed by duplicate exits, stable read-after-terminal behavior, bounded delivery after retained points, and canonical `partialEventSha256`.

## GREEN

Focused command:

    pnpm -C packages/mcp exec vitest run src/server.test.ts

Result: 1 file passed; 34 tests passed and 0 failed.

Package command:

    pnpm -C packages/mcp test

Result: 2 files passed; 35 tests passed and 0 failed. The command also built and packed `@spice-ts/core`, `@spice-ts/protocol`, and `@spice-ts/mcp`, installed the tarballs into an isolated consumer, and printed `Packed MCP consumer and bounded stdio workflow passed.`

The packed consumer uses the official `@modelcontextprotocol/sdk` `Client` over `InMemoryTransport`; it opens no HTTP transport. An injected worker emits two canonical points, exits abnormally, and repeats its exit notification. The consumer verifies point-bounded reads, the public `INTERNAL_ERROR`, exact partial count, canonical partial hash, terminal replay, backend-name isolation, and no redundant termination.

## Final gates

Command:

    pnpm build && pnpm lint && pnpm test && pnpm -C packages/mcp test:packed-consumer && git diff --check

Result: exit 0. Workspace build and lint passed. The full test run included 79 core files / 918 core tests, 1 protocol file / 17 tests, 1 circuit-json file / 8 tests, 2 MCP files / 35 tests, 17 UI files / 209 tests, 3 WASM files / 28 tests, 2 showcase files / 20 tests, the packed package consumers, and 13 comparison-harness tests. The dedicated packed MCP consumer then passed again, and `git diff --check` passed.

Exact commit SHA, PR URL, and exact-head CI are recorded in the PR and task handoff after publication.
