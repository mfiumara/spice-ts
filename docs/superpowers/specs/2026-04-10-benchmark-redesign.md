# Benchmark Redesign: vitest bench + SPICE3 Reference Circuits + Roadmap

**Date:** 2026-04-10
**Status:** Approved

---

## Goal

Replace the monolithic `benchmarks/run.ts` timing script with a two-track system:

1. **Performance benchmarks** — `vitest bench` for statistically sound ops/sec and latency metrics, living inside the package, runnable offline with no external dependencies.
2. **Accuracy + ngspice comparison** — a standalone script that runs reference circuits through both spice-ts and ngspice, compares results, and writes a structured report.

Additionally: add SPICE3 Quarles reference circuits for accuracy validation, create a `ROADMAP.md`, and file GitHub Issues for future device model and package work.

---

## Part 1: vitest bench

### Motivation

The current `run.ts` uses a hand-rolled `performance.now()` loop (1 warmup + 5 iterations). This produces wall-clock milliseconds with no statistical confidence. `vitest bench` (backed by tinybench) provides:

- Proper warmup phase
- Configurable iteration count with automatic stabilisation
- Output: ops/sec, mean, p99, standard deviation
- Integrated into the existing test toolchain (`vitest`)

### File layout

```
packages/core/
├── vitest.config.ts          (existing — unit tests, unchanged)
├── vitest.bench.config.ts    (new — bench-only config)
└── src/
    └── benchmarks/
        ├── dc.bench.ts       (resistor ladder DC scalability)
        ├── transient.bench.ts (RC chain + LC ladder transient)
        ├── ac.bench.ts       (RC chain AC sweep)
        └── nonlinear.bench.ts (CMOS inverter chain, ring oscillator)
```

### vitest.bench.config.ts

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/benchmarks/**/*.bench.ts'],
    benchmark: {
      outputFile: '../../benchmarks/vitest-bench-results.json',
    },
  },
});
```

### Scripts (packages/core/package.json)

Add:
```json
"bench": "vitest bench --config vitest.bench.config.ts"
```

### Root package.json scripts

```json
"bench":          "pnpm -C packages/core bench",
"bench:accuracy": "cd packages/core && pnpm build && cd ../.. && npx tsx benchmarks/accuracy.ts"
```

### Bench file pattern

Each `.bench.ts` imports `simulate` from the built dist (or source via vitest's transform), calls `bench()` from vitest, and passes a netlist string. No ngspice calls — pure spice-ts timing.

```ts
import { describe, bench } from 'vitest';
import { simulate } from '../simulate.js';
import { resistorLadder } from '../../benchmarks/circuits/generators.js';
// Note: benchmarks/ is outside src/ — path alias or relative import

describe('DC: resistor ladder', () => {
  bench('10 nodes',   () => simulate(resistorLadder(10)));
  bench('100 nodes',  () => simulate(resistorLadder(100)));
  bench('500 nodes',  () => simulate(resistorLadder(500)));
});
```

> **Import path:** The bench files in `src/benchmarks/` import circuit generators from `../../benchmarks/circuits/generators.js`. This requires the generators to be plain TypeScript with no Node-only deps that would break vitest's transform. The existing generators already satisfy this. If vitest cannot resolve the cross-boundary relative import, add a `resolve.alias` in `vitest.bench.config.ts` pointing `@benchmarks` → `../../benchmarks`.

### What `run.ts` becomes

`benchmarks/run.ts` is **deleted**. Its performance-timing role is replaced by vitest bench. Its accuracy role moves to `benchmarks/accuracy.ts` (see Part 2).

---

## Part 2: Accuracy + ngspice comparison script

### File: `benchmarks/accuracy.ts`

A focused script that:
1. Runs each reference circuit through spice-ts
2. Checks the result against an analytical expected value (error %)
3. Optionally runs the same circuit through ngspice and diffs the node voltages/frequencies
4. Prints a structured table and saves `benchmarks/accuracy-results.json`

### Report format

```
Circuit                    Metric              spice-ts     Expected     Error    ngspice      Diff
─────────────────────────────────────────────────────────────────────────────────────────────────
rc-step-at-tau             V(out) at t=τ       3.167 V      3.161 V      0.20%    3.161 V      0.19%
rlc-resonance-freq         f_osc               1242 Hz      1592 Hz     21.9%     1591 Hz     21.9%
bjt-diff-pair-vout         V(out) DC bias      ...          ...          ...       ...          ...
...
```

### Circuit coverage (see Part 3 for new circuits)

All circuits from `generators.ts` + all SPICE3 reference circuits (Part 3) are included.

### CI integration

`bench:accuracy` runs on every PR and push to `main` as a dedicated `accuracy` job in `.github/workflows/ci.yml`. It:

1. Installs ngspice via `apt-get install -y ngspice`
2. Builds `@spice-ts/core`
3. Runs `npx tsx benchmarks/accuracy.ts --ci`
4. The `--ci` flag makes the script exit non-zero if **any circuit exceeds the 15% error threshold** vs the analytical expected value
5. The ngspice diff (spice-ts vs ngspice node voltages) is **informational only** — printed to the job log but does not gate the build. This avoids CI failures caused by ngspice version differences or model discrepancies.
6. Uploads `benchmarks/accuracy-results.json` as a GitHub Actions artifact so results are browseable per run.

The `vitest bench` job (Part 1) also runs on every PR on Node 22 only. Its output is uploaded as an artifact (`vitest-bench-results.json`) for trend inspection but does **not** gate the build — benchmark times are inherently noisy on shared CI runners and should not block merges.

### Summary of CI gates

| Check | Gates PR? | Notes |
|-------|-----------|-------|
| `pnpm lint` | Yes | TypeScript type errors |
| `pnpm test:coverage` | Yes | Unit + integration tests |
| `pnpm bench` (vitest) | No | Artifact only — runners are noisy |
| `accuracy.ts --ci` | Yes | Fails if error > 15% vs analytical |
| ngspice diff in accuracy | No | Informational, printed to log |

---

## Part 3: SPICE3 Reference Circuits

### File: `benchmarks/circuits/spice3-reference.ts`

Five canonical circuits drawn from T. Quarles' "SPICE3 Version 3f5 User's Manual" benchmark appendix. These are the circuits used historically to validate SPICE implementations against each other.

| # | Name | Analysis | Key metric |
|---|------|----------|------------|
| 1 | `diffPair` | DC + tran | V(out) transfer characteristic, Ic balance |
| 2 | `rcLadder5` | AC | -3 dB frequency of 5-stage RC |
| 3 | `oneStageOpAmp` | DC + AC | DC bias voltages, open-loop gain at 1 kHz |
| 4 | `cmosInverterSingle` | tran | Rise time, fall time, propagation delay |
| 5 | `bandpassRLC` | AC | Centre frequency, 3 dB bandwidth |

### Circuit 1 — Differential pair (`diffPair`)

```spice
* Quarles differential pair — 2N2222 NPN
* Vcc = 12V, tail current source via R_tail, differential input ±0.1V
* Key result: V(out) ≈ Vcc - Ic*Rc, Ic balance within 1% at Vin=0
VCC vcc 0 DC 12
VIN+ in+ 0 DC 0.1
VIN- in- 0 DC -0.1
VTAIL tail 0 DC -12
Q1 out+ in+ emit NPN2222
Q2 out- in- emit NPN2222
RC1 vcc out+ 10k
RC2 vcc out- 10k
RE  emit tail 1k
.model NPN2222 NPN(IS=1e-14 BF=100 VAF=100)
.op
.end
```

Expected: V(out+) ≈ V(out-) within 50 mV at balanced input. Ic ≈ (12-0.7)/1k × 0.5 ≈ 5.65 mA each.

### Circuit 2 — 5-stage RC ladder (`rcLadder5`)

```spice
* 5-stage RC, f_-3dB ≈ 1/(2π × 5 × R × C) per stage ≈ 159 Hz (R=1k, C=1µ)
* Uses Quarles' exact values: R=1kΩ, C=1µF
V1 1 0 DC 0 AC 1
R1 1 2 1k
C1 2 0 1u
R2 2 3 1k
C2 3 0 1u
R3 3 4 1k
C3 4 0 1u
R4 4 5 1k
C4 5 0 1u
R5 5 6 1k
C5 6 0 1u
.ac dec 20 1 10k
.end
```

Expected: -3 dB frequency verified experimentally against ngspice (compound 5-pole rolloff — no simple closed form). The accuracy test diffs spice-ts vs ngspice transfer function, not vs analytical.

### Circuit 3 — One-stage op-amp (`oneStageOpAmp`)

```spice
* Single OTA stage (diff pair + current mirror load + output stage)
* VDD = 5V, bias current 100µA
* Key result: DC output ≈ VDD/2 at balanced input, gain > 20 dB at 1 kHz
VDD vdd 0 DC 5
VSS 0 vss DC 5
VBIAS bias 0 DC 1
VIN+ in+ 0 DC 2.5
VIN- in- 0 DC 2.5
* Diff pair
M1 d1 in+ tail vss NMOS1 W=10u L=1u
M2 d2 in- tail vss NMOS1 W=10u L=1u
MBIAS tail bias vss vss NMOS1 W=5u L=1u
* Current mirror load
M3 d1 d1 vdd vdd PMOS1 W=10u L=1u
M4 d2 d1 vdd vdd PMOS1 W=10u L=1u
* Output
CL out 0 10p
.model NMOS1 NMOS(KP=100u VTO=0.5)
.model PMOS1 PMOS(KP=40u VTO=-0.5)
.op
.end
```

Expected: V(d2) within 10% of VDD/2 at balanced input.

### Circuit 4 — CMOS inverter switching (`cmosInverterSingle`)

```spice
* Single CMOS inverter, VDD=5V, load cap 10fF
* Key metrics: t_rise, t_fall, t_pd
VDD vdd 0 DC 5
VIN in 0 PULSE(0 5 0 100p 100p 5n 10n)
MP out in vdd vdd PMOS1 W=20u L=1u
MN out in 0   0   NMOS1 W=10u L=1u
CL out 0 10f
.model NMOS1 NMOS(KP=100u VTO=0.5)
.model PMOS1 PMOS(KP=40u VTO=-0.5)
.tran 10p 20n
.end
```

Expected: Output switches cleanly 0→5V and 5→0V. 50% crossing ≈ 5 ns.

### Circuit 5 — Bandpass RLC (`bandpassRLC`)

```spice
* Series RLC bandpass, f0 = 1/(2π√LC) ≈ 1591 Hz, Q = 10
* Same as rlcResonance but swept in AC to get bandwidth
V1 1 0 DC 0 AC 1
R1 1 2 10
L1 2 3 10m
C1 3 0 1u
.ac dec 20 100 100k
.end
```

Expected: Peak at 1591 Hz, -3 dB bandwidth ≈ 159 Hz (Q=10).

### Accuracy thresholds

| Error | Status |
|-------|--------|
| < 1%  | ✓ Excellent |
| 1–5%  | ~ Acceptable |
| 5–15% | ! Warning |
| > 15% | ✗ Fail |

---

## Part 4: ROADMAP.md

Placed at repo root. Structured as a table linking to GitHub Issues. Sections:

1. **Device Models** — BSIM3v3, BSIM4, EKV, Gummel-Poon BJT, controlled sources, transmission line
2. **Solver** — Sparse LU (KLU-style), DC sweep
3. **Language** — `.subckt` support
4. **Packages** — `@spice-ts/ui` waveform viewer, `@spice-ts/designer` schematic editor

---

## Part 5: GitHub Issues

11 issues to create, labelled `enhancement` + relevant sub-label:

| # | Title | Labels |
|---|-------|--------|
| 1 | BSIM3v3 MOSFET model | enhancement, device-models |
| 2 | BSIM4 MOSFET model | enhancement, device-models |
| 3 | EKV compact MOSFET model | enhancement, device-models |
| 4 | Gummel-Poon BJT model | enhancement, device-models |
| 5 | Voltage/current controlled sources (VCVS, VCCS, CCVS, CCCS) | enhancement, device-models |
| 6 | Lossless transmission line | enhancement, device-models |
| 7 | Sparse LU solver (replace dense O(n³)) | enhancement, performance |
| 8 | DC sweep analysis (.dc command) | enhancement, analysis |
| 9 | .subckt subcircuit support | enhancement, language |
| 10 | @spice-ts/ui — waveform viewer package | enhancement, packages |
| 11 | @spice-ts/designer — visual schematic editor | enhancement, packages |

---

## File change summary

| Action | File |
|--------|------|
| Delete | `benchmarks/run.ts` |
| Create | `benchmarks/accuracy.ts` |
| Create | `benchmarks/circuits/spice3-reference.ts` |
| Create | `packages/core/vitest.bench.config.ts` |
| Create | `packages/core/src/benchmarks/dc.bench.ts` |
| Create | `packages/core/src/benchmarks/transient.bench.ts` |
| Create | `packages/core/src/benchmarks/ac.bench.ts` |
| Create | `packages/core/src/benchmarks/nonlinear.bench.ts` |
| Create | `packages/core/src/benchmarks/spice3.bench.ts` |
| Modify | `packages/core/package.json` (add bench script) |
| Modify | `package.json` (update bench/bench:accuracy scripts) |
| Create | `ROADMAP.md` |
| Create | 11 GitHub Issues |
| Modify | `.github/workflows/ci.yml` (add `accuracy` job with ngspice + `bench` job with vitest) |
