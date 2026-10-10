# Issue 223 AC-only source parsing receipt

## `/poteto-mode` receipt

The bug-fix playbook was loaded before implementation. Source tracing found both V and I cards share `parseSourceWaveform()`, where the AC branch passed a missing magnitude token into `parseNumber()` and leaked its `undefined.trim()` TypeError through a structured `ParseError` wrapper. ngspice-47 confirmed that an omitted AC magnitude defaults to 1 and phase defaults to 0.

RED commit `1a09a85` added parser-surface voltage and current regressions plus malformed-value diagnostics. `pnpm -C packages/core exec vitest run src/parser/waveform-parser.test.ts` reported 2 failed and 7 passed. Both AC-only cards failed with `Cannot read properties of undefined (reading 'trim')`; both malformed cards already retained `ParseError` line and context fields.

GREEN commit `1792329` defaults only the absent AC magnitude to 1 in the shared source grammar. The same focused command reports 9 passed. Explicit magnitudes, phases, implicit or explicit DC bias, and malformed numeric diagnostics continue through the existing shared path. No parser branch was duplicated and no directive, DISTOF, LTRA, MCP, WASM, fixture, or tolerance behavior was changed.

## Unchanged classic corpus-B evidence

The provenance-pinned audit ran all 20 fixtures with no fixture adaptation. The suite remains 18 losses and 2 parity candidates. The four issue fixtures advanced past the AC-only parser crash to their next honest unsupported outcome:

| Fixture | Input SHA-256 | Before | After |
|---|---|---|---|
| bjt-noise | `183a30585cee976f2990857df941ca500aea2755a1e4ecf946c14699f09b36fc` | AC-only source parser crash | unsupported `.noise` form |
| pole-zero-four-stage | `c21a9628a46581ad9e163632d992422afafeaa15443787e00153dbd7331d3b73` | AC-only source parser crash | unsupported pole-zero result |
| pole-zero-three-stage | `1c50c0623b02d991eb04a1523d1aa50914e88c0ea53a64438daeec97ec359a18` | AC-only source parser crash | unsupported pole-zero result |
| resistor-noise | `241ea1ce167a449e91b1cf29904f5c9513338cff31c2c0beb72a845482048661` | AC-only source parser crash | unsupported `.noise` form |

The generated report records suite evidence SHA-256 `6ef2432336c10a24d11235fb88eff7c0d7d64bdad92c055f879a95e5bec63d9a`. Unsupported analyses remain losses. No numeric parity claim is made.
