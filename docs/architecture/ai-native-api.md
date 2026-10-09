# AI-native API architecture

Status: accepted design target for M3

Issue: [#57](https://github.com/mfiumara/spice-ts/issues/57)
Related: [#35](https://github.com/mfiumara/spice-ts/issues/35) (`circuit-json` adapter)

## 1. Goals and non-goals

This API lets an agent validate and simulate a circuit without scraping console text, grants long-running work an explicit lifecycle, and returns deterministic JSON with actionable diagnostics. The same versioned request and event contracts are used by direct TypeScript clients, MCP, and browser/WASM clients.

The first implementation must preserve the existing `@spice-ts/core` analysis semantics. This design does not add devices, change numerical methods, claim cross-backend bit equality, expose arbitrary host files, or replace the existing ergonomic TypeScript API (`simulate`, `simulateStream`, and `Circuit`). MCP is a transport adapter, not a second simulator.

## 2. Package ownership

The dependency direction is fixed:

```text
@spice-ts/protocol              JSON-safe types, JSON Schemas, canonicalization
          ^                                  ^
          |                                  |
@spice-ts/core          @spice-ts/circuit-json (#35)
          ^                     ^
          +----------+----------+
                     |
              @spice-ts/mcp

@spice-ts/wasm -> @spice-ts/protocol + a pinned core/WASM build
```

- `@spice-ts/protocol` is environment-neutral and has no runtime dependencies. It owns protocol version `1`, JSON Schema 2020-12 documents, canonical JSON rules, request/result/event types, error codes, and conformance fixtures. It does not import core types; structurally compatible protocol types prevent a dependency cycle.
- `@spice-ts/core` remains the source of parser and simulator behavior. A protocol adapter in core maps protocol documents to the current `CircuitIR`, analyses, models, and subcircuits and maps `Map`/typed-array results into JSON-safe values. Existing TypeScript return types remain source-compatible.
- `@spice-ts/circuit-json` remains exactly the adapter proposed by #35 and is the only package that depends on `circuit-json` or Zod. It maps `circuit-json` to/from `CircuitIR`; it does not own analyses, simulation, MCP, or the native schema. #35 must add conversion diagnostics so unsupported elements are never silently discarded.
- `@spice-ts/mcp` is Node-only. It depends on the official MCP TypeScript SDK, protocol, core, and circuit-json adapter. It owns tool registration, job storage, worker isolation, quotas, and stdio transport. HTTP authentication/deployment is out of scope for M3.
- `@spice-ts/wasm` is the browser/worker distribution boundary. It exposes the protocol API rather than core classes. The first release may run the TypeScript engine in a module worker; numeric kernels may later move to Rust/C/C++ WASM without changing protocol v1. The existing optional `ngspice-wasm` backend remains a distinct backend and is not renamed or bundled into this package.

Core and UI must not acquire MCP, Zod, or circuit-json runtime dependencies.

## 3. Versioned JSON circuit document

Every request carries `apiVersion: "1"`. The native JSON input has `format: "spice-ts"` and `schemaVersion: "1.0"`. Major protocol or schema versions change only for incompatible wire changes. Minor schema revisions may add optional fields and enum members; consumers must reject unsupported major versions and ignore unknown optional fields only after schema validation permits them.

A simulation request accepts one of three tagged inputs:

```ts
type SimulationInput =
  | {
      format: 'spice'
      source: string
      virtualFiles?: Record<string, string>
    }
  | {
      format: 'spice-ts'
      document: SpiceTsCircuitDocumentV1
    }
  | {
      format: 'circuit-json'
      circuit: unknown[]
      analyses: AnalysisV1[]
    }
```

`virtualFiles` is an in-memory, POSIX-style include namespace. Include names are normalized, may not be absolute, and may not contain `..`. The MCP server never resolves host paths or URLs. The entry netlist is `source`; `.include` and `.lib` may read only entries present in `virtualFiles`.

The native document is the lossless JSON counterpart of the current parser output. Maps are arrays so order and duplicate validation are explicit:

```json
{
  "format": "spice-ts",
  "schemaVersion": "1.0",
  "circuit": {
    "components": [
      {
        "type": "V",
        "id": "V1",
        "name": "V1",
        "ports": [{ "name": "p", "net": "in" }, { "name": "n", "net": "0" }],
        "params": { "waveform": "dc", "dc": 5 }
      },
      {
        "type": "R",
        "id": "R1",
        "name": "R1",
        "ports": [{ "name": "p", "net": "in" }, { "name": "n", "net": "0" }],
        "params": { "resistance": 1000 }
      }
    ],
    "nets": ["in"]
  },
  "analyses": [{ "type": "op" }],
  "models": [],
  "subcircuits": []
}
```

The schemas use JSON numbers in SI base units and forbid `NaN`, infinities, and `-0` after canonicalization. Ground is always `"0"` and is omitted from `circuit.nets`, matching `CircuitIR`. Component IDs, model names, and subcircuit names must be unique under SPICE's case-insensitive comparison.

A `circuit-json` input is validated and converted by #35, then paired with protocol-owned analyses. Geometry, PCB elements, and other non-simulation elements may remain available to the adapter but do not enter core. Conversion produces `UNSUPPORTED_FEATURE` diagnostics for every simulation-relevant element or parameter that cannot be represented. If any such diagnostic has severity `error`, simulation does not start. Export is allowed to be lossy only when the caller explicitly sets `allowLossy: true`; the response still lists each loss. This avoids duplicating #35 while making its contract usable by agents.

## 4. Requests and serializable results

The common one-shot request is:

```json
{
  "apiVersion": "1",
  "input": { "format": "spice", "source": "V1 in 0 5\nR1 in 0 1k\n.op" },
  "options": {
    "backend": "spice-ts",
    "determinism": "strict",
    "limits": { "maxResultPoints": 10000 }
  }
}
```

`options` exposes the existing numerical controls (`abstol`, `vntol`, `reltol`, `maxIterations`, `maxTransientIterations`, `maxTimestep`, `integrationMethod`, `trtol`, and `gmin`) plus protocol controls. Missing numerical options are resolved to explicit values before execution and echoed in metadata.

All responses are JSON-safe envelopes:

```ts
interface SuccessEnvelope<T> {
  apiVersion: '1'
  ok: true
  requestId: string
  data: T
  diagnostics: DiagnosticV1[]
  metadata: RunMetadataV1
}

interface FailureEnvelope {
  apiVersion: '1'
  ok: false
  requestId: string
  error: SpiceApiErrorV1
  diagnostics: DiagnosticV1[]
  metadata?: Partial<RunMetadataV1>
}
```

Results use sorted plain objects, not `Map`, and ordinary arrays, not typed arrays. Each analysis is tagged (`op`, `dc`, `tran`, or `ac`). Transient/DC/AC rows are columnar: an ordered independent-axis array plus lexicographically ordered voltage/current series. Units are explicit in field names or schema descriptions (seconds, hertz, volts, amperes, degrees). Metadata includes protocol version, native schema version when applicable, spice-ts version, `engineBuildId`, backend name/version, resolved options, input SHA-256, result SHA-256, runtime family/version, architecture, and deterministic profile. Timing and timestamps are excluded from hashed result data and omitted in strict mode.

## 5. Structured errors and diagnostics

MCP transport failures are reserved for malformed MCP calls or server failure. Validation and simulation failures are normal tool results with `ok: false`, so agents receive the full structured payload.

```ts
interface SpiceApiErrorV1 {
  code:
    | 'INVALID_REQUEST'
    | 'PARSE_ERROR'
    | 'INVALID_CIRCUIT'
    | 'UNSUPPORTED_FEATURE'
    | 'SINGULAR_MATRIX'
    | 'CONVERGENCE_FAILED'
    | 'TIMESTEP_TOO_SMALL'
    | 'RESOURCE_LIMIT'
    | 'CANCELLED'
    | 'BACKEND_UNAVAILABLE'
    | 'INTERNAL_ERROR'
  message: string
  retryable: boolean
  phase: 'validation' | 'parse' | 'compile' | 'solve' | 'serialize' | 'transport'
  details: Record<string, unknown>
}

interface DiagnosticV1 {
  severity: 'info' | 'warning' | 'error'
  code: string
  message: string
  path?: string
  source?: { file: string; line: number; column?: number; excerpt?: string }
  related?: Array<{ path?: string; message: string }>
  suggestions?: Array<{ action: string; replacement?: unknown }>
}
```

Existing core exceptions map without parsing their message strings: `ParseError` to `PARSE_ERROR` with its line/context, `InvalidCircuitError` to `INVALID_CIRCUIT`, `SingularMatrixError` to `SINGULAR_MATRIX` with involved nodes, `ConvergenceError` to `CONVERGENCE_FAILED` with kind/time/oscillating nodes/dt/gmin, `TimestepTooSmallError` to `TIMESTEP_TOO_SMALL`, and `CycleError` to `INVALID_CIRCUIT` with the dependency chain. Raw solution vectors are not returned by default because they can be large; `details.solutionSummary` carries bounded extrema and changed-node summaries. Unknown exceptions become `INTERNAL_ERROR` with an opaque incident ID, never a stack trace in MCP output.

`retryable` is false for schema, parse, topology, unsupported-feature, and backend-unavailable failures; true for cancellation; and true for convergence/resource failures only when a diagnostic supplies a concrete changed option that stays inside server limits.

## 6. Determinism contract

`determinism: "strict"` is the default for protocol clients.

- The same validated input, resolved options, backend artifact, `engineBuildId`, runtime family/version, and architecture must produce byte-identical canonical result JSON and identical chunk boundaries.
- Components preserve document order for solving. Externally visible object keys, node names, branch names, diagnostics, and warnings are sorted by documented stable keys. No locale-sensitive sort is used.
- JSON is canonicalized with UTF-8, lexicographic object keys, no insignificant whitespace, normalized `-0` to `0`, and rejected non-finite numbers. SHA-256 hashes cover this canonical form.
- Adaptive steps and generated sweep points are emitted in solver order. Chunking is by a fixed point count, never elapsed time or byte timing.
- No wall-clock timestamp, random ID, duration, thread race, or host path enters hashed data. `requestId`/`jobId` are envelope fields outside result hashing.
- Worker concurrency may change throughput but not solve order inside one job.

The contract deliberately does not promise bit-identical numbers across different runtime versions, architectures, backends, core builds, or future numeric WASM kernels. Metadata makes those boundaries visible. Cross-environment conformance uses documented numerical tolerances and identical topology/point ordering; it must never be advertised as bit equality.

## 7. MCP tool surface

Tool names are namespaced and frozen for protocol v1:

1. `spice_capabilities` — no circuit input; returns supported protocol/schema versions, backends, analyses, devices, hard limits, defaults, and optional features.
2. `spice_validate` — validates and compiles any `SimulationInput`; returns normalized metadata, diagnostics, estimated point count, and unsupported features without solving.
3. `spice_simulate` — bounded one-shot simulation. It rejects work whose estimate exceeds synchronous limits and points the caller to `spice_simulation_start`.
4. `spice_simulation_start` — starts an isolated job and returns `jobId`, status, and the first cursor.
5. `spice_simulation_read` — accepts `jobId`, opaque cursor, and optional `maxPoints` up to the server cap; returns ordered `events`, `nextCursor`, status, and a terminal success/error envelope when complete.
6. `spice_simulation_cancel` — idempotently requests cancellation; returns the current terminal or cancelling state.

MCP `structuredContent` contains these envelopes. A short text summary is also returned for clients that do not render structured content, but it is not an API and must not be parsed. Tool input schemas reference the published protocol schemas.

`spice_simulation_read` is pull-based because MCP does not guarantee portable arbitrary tool-result streaming. Cursors are job-scoped, opaque, single-direction, and replayable: reading the same cursor returns the same chunk until job expiry. Events are:

```ts
type SimulationEventV1 =
  | { type: 'analysis-start'; analysis: 'op' | 'dc' | 'tran' | 'ac'; index: number }
  | { type: 'point'; analysis: 'dc' | 'tran' | 'ac'; index: number; values: unknown }
  | { type: 'analysis-end'; analysis: 'op' | 'dc' | 'tran' | 'ac'; pointCount: number }
  | { type: 'diagnostic'; diagnostic: DiagnosticV1 }
```

OP data is returned in the terminal result, not as a fake point stream. On failure or cancellation, already-read points remain valid and the terminal envelope states that the result is partial; partial data never carries a full-result hash.

## 8. Cancellation, isolation, and resource limits

The protocol accepts an `AbortSignal` in direct TypeScript adapters; core checks it before parse/compile, between analyses, between Newton iterations, and at each accepted/rejected streamed point. MCP cancellation terminates a dedicated worker if cooperative cancellation does not finish within one second. A killed worker yields `CANCELLED`, not `INTERNAL_ERROR`.

Server defaults are conservative and are returned by `spice_capabilities`:

| Limit | Default | Hard maximum |
|---|---:|---:|
| source plus virtual files | 1 MiB | 8 MiB |
| virtual files | 64 | 256 |
| include depth | 16 | 32 |
| components after expansion | 25,000 | 100,000 |
| subcircuit expansion depth | 32 | 64 |
| analyses per request | 8 | 16 |
| result points | 100,000 | 1,000,000 |
| synchronous result points | 10,000 | 50,000 |
| serialized result | 16 MiB | 64 MiB |
| synchronous wall time | 30 s | 60 s |
| job wall time | 5 min | 15 min |
| retained unread job data | 32 MiB | 128 MiB |
| concurrent jobs per server | 2 | server configuration |
| completed-job TTL | 5 min | 30 min |

Callers may lower limits but not raise them above server policy. Estimates do not replace runtime enforcement. Limit failures identify `limit`, `configured`, and `observed` in `details`. Jobs apply backpressure: when retained unread data reaches the cap, solving pauses; if the client does not read before TTL, the job is cancelled. Completed and abandoned jobs are deleted after TTL. Workers have no network access or ambient filesystem access and receive only validated input bytes.

## 9. WASM path

`@spice-ts/wasm` exports asynchronous `createSpiceEngine(options)` and runs in browsers, Node, and Web Workers. Its methods are protocol-shaped: `validate`, `simulate`, `simulateStream`, and `cancel`. Initialization verifies the WASM module checksum and reports capabilities plus `engineBuildId` before accepting work.

The JS package minor version pins one exact WASM artifact and protocol/schema minor versions. A different numeric kernel increments `engineBuildId`; incompatible imports/exports require a package major version. The WASM ABI is private and may change in minor releases because consumers bind to the JavaScript protocol facade, not raw exports. There is no WASI, filesystem, socket, clock, or random import. Memory begins at 64 MiB, may grow to a caller-configured ceiling no higher than 512 MiB, and a failed growth maps to `RESOURCE_LIMIT`.

Backend IDs remain explicit: `spice-ts-js`, `spice-ts-wasm`, and `ngspice-wasm`. Callers never get a silent fallback. If requested WASM cannot initialize, the response is `BACKEND_UNAVAILABLE`; fallback requires a caller-supplied ordered backend list and is recorded in metadata and diagnostics.

## 10. Agent workflows

### Workflow A: repair a floating-node circuit

1. The agent calls `spice_validate` with a SPICE netlist.
2. It receives `INVALID_CIRCUIT`/`SINGULAR_MATRIX`, `details.involvedNodes: ["sense"]`, a source location, and a suggestion to add a DC path.
3. The agent edits the netlist, validates again, then calls `spice_simulate` for OP.
4. It asserts the returned `out` voltage and records input/result hashes in its engineering log.

No console-message parsing or host file access is required.

### Workflow B: simulate a large tscircuit transient

1. The agent exports a tscircuit design as circuit-json and calls `spice_validate` with explicit transient analysis.
2. The #35 adapter reports every ignored layout-only element as info and rejects any unsupported simulation-relevant device as `UNSUPPORTED_FEATURE`.
3. After a clean validation and point estimate, the agent calls `spice_simulation_start`.
4. It repeatedly calls `spice_simulation_read`, checks ordered point indexes, persists chunks, and cancels when a voltage safety threshold is crossed.
5. It records the terminal partial status, backend/build metadata, and hashes of received canonical chunks.

## 11. Implementation slices and acceptance tests

Implementation is split into independently testable M3 issues:

1. [#59 Protocol package and JSON Schema](https://github.com/mfiumara/spice-ts/issues/59): schema fixtures round-trip, invalid unions/versions/non-finite values fail, and canonical hashes are stable on Node 20 and 22.
2. [#60 Core protocol adapter, structured errors, cancellation, and guards](https://github.com/mfiumara/spice-ts/issues/60): each existing exception maps by type, cancellation stops bounded solver fixtures, and every hard limit has a failing test.
3. Circuit-json interop remains [#35](https://github.com/mfiumara/spice-ts/issues/35): R/C/M/Q connectivity round-trips; unsupported simulation elements emit diagnostics; no silent loss. Do not create a competing adapter issue.
4. [#61 MCP package](https://github.com/mfiumara/spice-ts/issues/61): all six tools pass an in-process MCP client contract test; cursor replay, cancellation, TTL, worker death, and backpressure are covered.
5. [#62 WASM/worker facade](https://github.com/mfiumara/spice-ts/issues/62): browser and Node tests run the same conformance fixtures, verify checksums/build IDs, enforce memory ceilings, and prove no silent backend fallback.
6. [#63 End-to-end agent examples](https://github.com/mfiumara/spice-ts/issues/63): both workflows above run headlessly in CI and snapshot only canonical structured outputs.

Each implementation issue may land independently behind protocol v1 fixtures. No implementation may publish a package or version as part of its acceptance test.

## 12. Rejected alternatives

- Putting MCP in core was rejected because it would make a transport dependency part of every browser bundle.
- Making circuit-json the native simulation schema was rejected because it does not own SPICE analyses/models and would force Zod into core; #35 remains an explicit adapter.
- Returning current core classes and `Map` objects over MCP was rejected because they are not JSON values.
- Push-only MCP progress notifications were rejected as the sole streaming mechanism because support and replay behavior vary by client.
- Silent WASM-to-JS fallback was rejected because it invalidates reproducibility claims.
- Cross-platform bit-identical claims were rejected because JavaScript engines, architectures, and numeric backends can legitimately differ.