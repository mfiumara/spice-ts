# Showcase Page with .step Family-of-Curves

**Date:** 2026-04-13

## Summary

Refactor `examples/08-waveform-viewer/` into `examples/showcase/`. Show two RC filter demos with `.step param R1 list 1k 5k 10k` sweeps: a transient pulse response (family of charging curves) and an AC Bode plot (family of frequency responses). Batch `simulate()`, not streaming.

## Scope

### v1 (this spec)

- Rename `examples/08-waveform-viewer/` to `examples/showcase/`
- Two sections on a single page: stepped transient + stepped AC
- Convert `StepResult[]` to `TransientDataset[]` / `ACDataset[]` with labels
- Leverage existing `TransientPlot` / `BodePlot` components — no renderer changes needed
- Auto-assigned colors from existing palette, labeled by parameter value (e.g., "out (R1=1k)")

### Deferred

- Streaming family-of-curves (`StepStreamingController` consuming `simulateStepStream()`)
- Interactive parameter controls (sliders to adjust step values)
- Additional circuit demos beyond the RC filter

## Data Conversion

Two utility functions that convert stepped results into the existing UI dataset types:

```typescript
function stepsToTransientDatasets(
  steps: StepResult[],
  signals: string[],
): TransientDataset[]
```

For each step, creates a `TransientDataset` with:
- `time`: from `step.transient.time`
- `signals`: Map from signal name to `step.transient.voltage(name)` or `.current(name)`
- `label`: formatted as `"R1=1k"` using SI prefix formatting from `@spice-ts/ui`'s `formatSI`

```typescript
function stepsToACDatasets(
  steps: StepResult[],
  signals: string[],
): ACDataset[]
```

For each step, creates an `ACDataset` with:
- `frequencies`: from `step.ac.frequencies`
- `magnitudes`: Map from signal name to dB-converted magnitudes
- `phases`: Map from signal name to phase values
- `label`: same formatted parameter label

These functions live in the showcase example (`main.tsx`), not in `@spice-ts/ui`. They're example-level glue code, not library features.

## Showcase Page Layout

Single page, dark theme, two sections stacked vertically:

### Section 1: Transient — RC Pulse Response

Netlist:
```spice
V1 in 0 PULSE(0 5 0 1n 1n 10m 20m)
R1 in out 1k
C1 out 0 100n
.tran 0.1u 5m
.step param R1 list 1k 5k 10k
```

Shows family of 3 charging curves (R=1k charges fastest, R=10k slowest). Each curve is a different color from the palette, legend shows "out (R1=1k)", "out (R1=5k)", "out (R1=10k)".

Uses `TransientPlot` with `data={transientDatasets}` and `signals={['out']}`.

### Section 2: AC — RC Frequency Response

Netlist:
```spice
V1 in 0 AC 1 0
R1 in out 1k
C1 out 0 100n
.ac dec 20 1 10Meg
.step param R1 list 1k 5k 10k
```

Shows family of 3 Bode plots with different cutoff frequencies. Same color/label pattern.

Uses `BodePlot` with `data={acDatasets}` and `signals={['out']}`.

### Page Structure

- Title: "spice-ts Showcase"
- Each section: heading + description + plot
- Simulation runs on mount (useEffect), plots appear when data is ready
- Dark theme matching existing example styling

## Existing Renderer Capabilities (no changes needed)

The `TransientRenderer.setData()` already:
- Iterates multiple datasets
- Assigns colors from `DEFAULT_PALETTE` per dataset+signal combo
- Prefixes signal names with `dataset.label` for legend/cursor display
- Creates unique signal IDs as `"label:signalName"`

The `BodeRenderer` follows the same pattern. Both renderers, plus `Legend` and `CursorTooltip`, work with multi-dataset input out of the box.

## Build Configuration

- `examples/showcase/package.json`: same deps as the old `08-waveform-viewer` (react, @spice-ts/core, @spice-ts/ui, vite)
- Update workspace references if the old path was hardcoded anywhere (pnpm-workspace.yaml, CI)
- Keep existing `tsconfig.json` and `vite.config.ts` patterns
