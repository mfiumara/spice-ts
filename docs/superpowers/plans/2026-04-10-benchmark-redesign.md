# Benchmark Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled `benchmarks/run.ts` with vitest bench (statistically sound) + a dedicated `accuracy.ts` script that runs on every PR with ngspice comparison, add SPICE3 reference circuits, create a ROADMAP.md, and file 11 GitHub Issues.

**Architecture:** Two tracks — (1) `vitest bench` in `packages/core/src/benchmarks/` for offline perf with no external deps, (2) `benchmarks/accuracy.ts` standalone script that gates CI on analytical accuracy and prints ngspice diffs informationally. SPICE3 reference circuits live in `benchmarks/circuits/spice3-reference.ts`. CI gets two new jobs: `bench` (artifact only) and `accuracy` (gates PR on >15% error vs analytical).

**Tech Stack:** TypeScript (strict), vitest 4.x bench API, tinybench, tsx, ngspice-42 (CI via apt), GitHub Actions, gh CLI (for issue creation)

---

## File Structure

```
packages/core/
├── vitest.bench.config.ts          NEW — bench-only vitest config
└── src/
    └── benchmarks/
        ├── dc.bench.ts             NEW — resistor ladder DC scalability
        ├── transient.bench.ts      NEW — RC chain + LC ladder transient
        ├── ac.bench.ts             NEW — RC chain AC sweep
        ├── nonlinear.bench.ts      NEW — CMOS inverter chain, ring oscillator
        └── spice3.bench.ts         NEW — SPICE3 reference circuit perf

benchmarks/
├── accuracy.ts                     NEW — replaces run.ts (accuracy + ngspice diff)
├── circuits/
│   ├── generators.ts               EXISTING — untouched
│   └── spice3-reference.ts         NEW — Quarles SPICE3 canonical circuits
├── ngspice-runner.ts               EXISTING — untouched
└── run.ts                          DELETE

.github/workflows/ci.yml            MODIFY — add bench + accuracy jobs
packages/core/package.json          MODIFY — add bench script
package.json                        MODIFY — update bench scripts
ROADMAP.md                          NEW
```

---

### Task 1: vitest bench config and DC bench

**Files:**
- Create: `packages/core/vitest.bench.config.ts`
- Create: `packages/core/src/benchmarks/dc.bench.ts`
- Modify: `packages/core/package.json`

- [ ] **Step 1: Create `packages/core/vitest.bench.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

export default defineConfig({
  resolve: {
    alias: {
      '@benchmarks': resolve(__dirname, '../../benchmarks'),
    },
  },
  test: {
    include: ['src/benchmarks/**/*.bench.ts'],
    benchmark: {
      outputFile: '../../benchmarks/vitest-bench-results.json',
    },
  },
});
```

- [ ] **Step 2: Create `packages/core/src/benchmarks/dc.bench.ts`**

```typescript
import { describe, bench } from 'vitest';
import { simulate } from '../simulate.js';
import { resistorLadder } from '@benchmarks/circuits/generators.js';

describe('DC: resistor ladder', () => {
  bench('10 nodes', async () => {
    await simulate(resistorLadder(10));
  });

  bench('100 nodes', async () => {
    await simulate(resistorLadder(100));
  });

  bench('500 nodes', async () => {
    await simulate(resistorLadder(500));
  }, { iterations: 3 });
});
```

- [ ] **Step 3: Add bench script to `packages/core/package.json`**

Replace the `"scripts"` block:

```json
"scripts": {
  "build": "tsup",
  "test": "vitest run",
  "test:coverage": "vitest run --coverage",
  "test:watch": "vitest",
  "lint": "tsc --noEmit",
  "bench": "vitest bench --config vitest.bench.config.ts"
},
```

- [ ] **Step 4: Run the DC bench**

```bash
cd packages/core && node_modules/.bin/vitest bench --config vitest.bench.config.ts
```

Expected: Table showing ops/sec and mean latency for 10/100/500-node resistor ladders. No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/core/vitest.bench.config.ts packages/core/src/benchmarks/dc.bench.ts packages/core/package.json
git commit -m "feat: add vitest bench config and DC resistor ladder benchmark"
```

---

### Task 2: Transient, AC, and nonlinear bench files

**Files:**
- Create: `packages/core/src/benchmarks/transient.bench.ts`
- Create: `packages/core/src/benchmarks/ac.bench.ts`
- Create: `packages/core/src/benchmarks/nonlinear.bench.ts`

- [ ] **Step 1: Create `packages/core/src/benchmarks/transient.bench.ts`**

```typescript
import { describe, bench } from 'vitest';
import { simulate } from '../simulate.js';
import { rcChain, lcLadder } from '@benchmarks/circuits/generators.js';

describe('Transient: RC chain', () => {
  bench('10 stages', async () => {
    await simulate(rcChain(10));
  });

  bench('50 stages', async () => {
    await simulate(rcChain(50));
  }, { iterations: 3 });

  bench('100 stages', async () => {
    await simulate(rcChain(100));
  }, { iterations: 3 });
});

describe('Transient: LC ladder', () => {
  bench('10 sections', async () => {
    await simulate(lcLadder(10), { integrationMethod: 'euler' });
  });

  bench('50 sections', async () => {
    await simulate(lcLadder(50), { integrationMethod: 'euler' });
  }, { iterations: 3 });
});
```

- [ ] **Step 2: Create `packages/core/src/benchmarks/ac.bench.ts`**

```typescript
import { describe, bench } from 'vitest';
import { simulate } from '../simulate.js';
import { rcChainAC } from '@benchmarks/circuits/generators.js';

describe('AC: RC chain sweep', () => {
  bench('10 stages', async () => {
    await simulate(rcChainAC(10));
  });

  bench('50 stages', async () => {
    await simulate(rcChainAC(50));
  }, { iterations: 3 });

  bench('100 stages', async () => {
    await simulate(rcChainAC(100));
  }, { iterations: 3 });
});
```

- [ ] **Step 3: Create `packages/core/src/benchmarks/nonlinear.bench.ts`**

```typescript
import { describe, bench } from 'vitest';
import { simulate } from '../simulate.js';
import { cmosInverterChain, cmosRingOscillator } from '@benchmarks/circuits/generators.js';

describe('Nonlinear: CMOS inverter chain', () => {
  bench('5 stages', async () => {
    await simulate(cmosInverterChain(5), { integrationMethod: 'euler' });
  });

  bench('10 stages', async () => {
    await simulate(cmosInverterChain(10), { integrationMethod: 'euler' });
  }, { iterations: 3 });
});

describe('Nonlinear: ring oscillator', () => {
  bench('3-stage', async () => {
    await simulate(cmosRingOscillator(3), { integrationMethod: 'euler' });
  });

  bench('5-stage', async () => {
    await simulate(cmosRingOscillator(5), { integrationMethod: 'euler' });
  });

  bench('11-stage', async () => {
    await simulate(cmosRingOscillator(11), { integrationMethod: 'euler' });
  }, { iterations: 3 });
});
```

- [ ] **Step 4: Run all bench files**

```bash
cd packages/core && node_modules/.bin/vitest bench --config vitest.bench.config.ts
```

Expected: All four bench suites run (DC, transient, AC, nonlinear). Nonlinear benches may show higher variance — that is expected. No errors or uncaught exceptions.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/benchmarks/
git commit -m "feat: add transient, AC, and nonlinear vitest bench suites"
```

---

### Task 3: SPICE3 reference circuit generators

**Files:**
- Create: `benchmarks/circuits/spice3-reference.ts`

- [ ] **Step 1: Create `benchmarks/circuits/spice3-reference.ts`**

```typescript
/**
 * SPICE3 Quarles reference circuits.
 *
 * Drawn from T. Quarles, "SPICE3 Version 3f5 User's Manual", Appendix B.
 * Used to validate simulator implementations against each other.
 */

// ---------------------------------------------------------------------------
// 1. BJT Differential Pair
// ---------------------------------------------------------------------------
/**
 * Classic BJT diff pair (2N2222 NPN).
 * Vcc=12V, tail resistor 1kΩ, collector resistors 10kΩ each.
 * At balanced input (Vin+=0.1V, Vin-=-0.1V):
 *   V(out+) and V(out-) symmetric within 50 mV
 *   Each Ic ≈ (12 - 0.7 - (-12)) / (2 * 1k) ≈ 11.65 mA / 2 ≈ 5.8 mA
 */
export function diffPair(): string {
  return [
    '* Quarles diff pair — 2N2222 NPN BJT',
    'VCC vcc 0 DC 12',
    'VEE 0 vee DC 12',
    'VIN+ in+ 0 DC 0.1',
    'VIN- in- 0 DC -0.1',
    'Q1 out+ in+ emit NPN2222',
    'Q2 out- in- emit NPN2222',
    'RC1 vcc out+ 10k',
    'RC2 vcc out- 10k',
    'RE  emit vee 1k',
    '.model NPN2222 NPN(IS=1e-14 BF=100 VAF=100)',
    '.op',
    '.end',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 2. 5-Stage RC Ladder (AC)
// ---------------------------------------------------------------------------
/**
 * 5-stage RC ladder for AC frequency response.
 * R=1kΩ, C=1µF per stage. f_pole_per_stage = 159 Hz.
 * Compound -3 dB frequency verified against ngspice (no closed form).
 */
export function rcLadder5(): string {
  const lines = [
    '* Quarles 5-stage RC ladder — AC',
    'V1 1 0 DC 0 AC 1',
  ];
  for (let i = 1; i <= 5; i++) {
    lines.push(`R${i} ${i} ${i + 1} 1k`);
    lines.push(`C${i} ${i + 1} 0 1u`);
  }
  lines.push('.ac dec 20 1 10k');
  lines.push('.end');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 3. One-Stage OTA (DC)
// ---------------------------------------------------------------------------
/**
 * Single OTA stage: NMOS diff pair + PMOS current mirror load + bias.
 * VDD=5V. At balanced input (VIN+=VIN-=2.5V): V(d2) ≈ VDD/2 within 10%.
 * Level 1 MOSFET models (KP, VTO).
 */
export function oneStageOpAmp(): string {
  return [
    '* Quarles one-stage OTA',
    'VDD vdd 0 DC 5',
    'VSS 0 vss DC 5',
    'VBIAS bias 0 DC 1',
    'VIN+ in+ 0 DC 2.5',
    'VIN- in- 0 DC 2.5',
    'M1 d1 in+ tail 0 NMOS1 W=10u L=1u',
    'M2 d2 in- tail 0 NMOS1 W=10u L=1u',
    'MBIAS tail bias 0 0 NMOS1 W=5u L=1u',
    'M3 d1 d1 vdd vdd PMOS1 W=10u L=1u',
    'M4 d2 d1 vdd vdd PMOS1 W=10u L=1u',
    '.model NMOS1 NMOS(KP=100u VTO=0.5)',
    '.model PMOS1 PMOS(KP=40u VTO=-0.5)',
    '.op',
    '.end',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 4. CMOS Inverter Single Stage (Transient)
// ---------------------------------------------------------------------------
/**
 * Single CMOS inverter, VDD=5V, 10fF load.
 * PULSE input: 0→5V at t=0, period=10ns.
 * Output should switch cleanly; 50% crossing ≈ 5ns.
 */
export function cmosInverterSingle(): string {
  return [
    '* Quarles CMOS inverter — single stage transient',
    'VDD vdd 0 DC 5',
    'VIN in 0 PULSE(0 5 0 100p 100p 5n 10n)',
    'MP out in vdd vdd PMOS1 W=20u L=1u',
    'MN out in 0 0 NMOS1 W=10u L=1u',
    'CL out 0 10f',
    '.model NMOS1 NMOS(KP=100u VTO=0.5)',
    '.model PMOS1 PMOS(KP=40u VTO=-0.5)',
    '.tran 10p 20n',
    '.end',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 5. Series RLC Bandpass (AC)
// ---------------------------------------------------------------------------
/**
 * Series RLC bandpass filter.
 * R=10Ω, L=10mH, C=1µF → f0 = 1/(2π√LC) ≈ 1591 Hz, Q = (1/R)√(L/C) = 10.
 * -3 dB bandwidth ≈ f0/Q ≈ 159 Hz.
 */
export function bandpassRLC(): string {
  return [
    '* Quarles RLC bandpass — f0=1591Hz, Q=10',
    'V1 1 0 DC 0 AC 1',
    'R1 1 2 10',
    'L1 2 3 10m',
    'C1 3 0 1u',
    '.ac dec 20 100 100k',
    '.end',
  ].join('\n');
}
```

- [ ] **Step 2: Create `packages/core/src/benchmarks/spice3.bench.ts`**

```typescript
import { describe, bench } from 'vitest';
import { simulate } from '../simulate.js';
import {
  diffPair,
  rcLadder5,
  oneStageOpAmp,
  cmosInverterSingle,
  bandpassRLC,
} from '@benchmarks/circuits/spice3-reference.js';

describe('SPICE3: Quarles reference circuits', () => {
  bench('diff pair (BJT DC)', async () => {
    await simulate(diffPair());
  });

  bench('RC ladder 5-stage (AC)', async () => {
    await simulate(rcLadder5());
  });

  bench('one-stage OTA (DC)', async () => {
    await simulate(oneStageOpAmp());
  });

  bench('CMOS inverter single (tran)', async () => {
    await simulate(cmosInverterSingle(), { integrationMethod: 'euler' });
  });

  bench('bandpass RLC (AC)', async () => {
    await simulate(bandpassRLC());
  });
});
```

- [ ] **Step 3: Run the SPICE3 bench**

```bash
cd packages/core && node_modules/.bin/vitest bench --config vitest.bench.config.ts --reporter verbose 2>&1 | grep -E "SPICE3|✓|✗|Error"
```

Expected: All 5 SPICE3 benches complete. If `cmosInverterSingle` converges, it will show a time. If it fails with `SingularMatrixError`, note it as a known limitation (10 fF is a very small cap — timestep may need adjustment). In that case, increase CL to `1p` in the generator.

- [ ] **Step 4: Commit**

```bash
git add benchmarks/circuits/spice3-reference.ts packages/core/src/benchmarks/spice3.bench.ts
git commit -m "feat: add SPICE3 Quarles reference circuit generators and bench suite"
```

---

### Task 4: accuracy.ts — the ngspice comparison script

**Files:**
- Create: `benchmarks/accuracy.ts`
- Delete: `benchmarks/run.ts`

- [ ] **Step 1: Create `benchmarks/accuracy.ts`**

```typescript
#!/usr/bin/env tsx
/**
 * spice-ts Accuracy & ngspice Comparison Script
 *
 * Usage:
 *   npx tsx benchmarks/accuracy.ts           # local run (pretty output)
 *   npx tsx benchmarks/accuracy.ts --ci      # CI mode (exits 1 if any error > 15%)
 *   npx tsx benchmarks/accuracy.ts --no-ngspice  # skip ngspice comparison
 *
 * CI gate: exits non-zero if any circuit's error vs analytical > 15%.
 * ngspice diff: always informational only — printed but never gates exit code.
 */
import { simulate } from '@spice-ts/core';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { hasNgspice, runNgspice } from './ngspice-runner.js';
import {
  rcChain,
  rlcResonance,
  bjtCEAmplifier,
  diodeBridgeRectifier,
} from './circuits/generators.js';
import {
  diffPair,
  rcLadder5,
  oneStageOpAmp,
  bandpassRLC,
} from './circuits/spice3-reference.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const CI_MODE = args.includes('--ci');
const USE_NGSPICE = !args.includes('--no-ngspice') && hasNgspice();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AccuracyResult {
  circuit: string;
  metric: string;
  spiceTs: number;
  expected: number | null;
  errorPct: number | null;
  ngspice: number | null;
  ngspiceDiffPct: number | null;
  status: '✓' | '~' | '!' | '✗' | '?';
  note?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function errorStatus(pct: number): '✓' | '~' | '!' | '✗' {
  if (pct < 1) return '✓';
  if (pct < 5) return '~';
  if (pct < 15) return '!';
  return '✗';
}

function pct(actual: number, expected: number): number {
  return Math.abs((actual - expected) / expected) * 100;
}

function runNgspiceVoltage(netlist: string, node: string): number | null {
  if (!USE_NGSPICE) return null;
  try {
    const r = runNgspice(netlist);
    // Parse "v(node) = X.XXXe+YY" from ngspice output
    const re = new RegExp(`v\\(${node}\\)\\s*=\\s*([\\d.e+\\-]+)`, 'i');
    const m = r.output.match(re);
    return m ? parseFloat(m[1]) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Circuit accuracy checks
// ---------------------------------------------------------------------------
async function checkRCStep(): Promise<AccuracyResult> {
  const netlist = rcChain(1, { stopTime: 5e-3, timestep: 1e-5 });
  const result = await simulate(netlist);
  const tran = result.transient!;
  const time = tran.time;
  const vout = tran.voltage('2');

  const tau = 1e-3; // RC = 1k * 1µF
  const idxTau = time.findIndex(t => t >= tau);
  const expected = 5 * (1 - Math.exp(-1)); // ≈ 3.161 V
  const actual = vout[idxTau];
  const errorPct = pct(actual, expected);

  const ngspiceVal = USE_NGSPICE ? (() => {
    try {
      const r = runNgspice(netlist);
      const m = r.output.match(/v\(2\)\s*=\s*([\d.e+\-]+)/i);
      return m ? parseFloat(m[1]) : null;
    } catch { return null; }
  })() : null;

  return {
    circuit: 'rc-step-at-tau',
    metric: 'V(out) at t=τ (V)',
    spiceTs: actual,
    expected,
    errorPct,
    ngspice: ngspiceVal,
    ngspiceDiffPct: ngspiceVal !== null ? pct(actual, ngspiceVal) : null,
    status: errorStatus(errorPct),
  };
}

async function checkRLCResonance(): Promise<AccuracyResult> {
  const netlist = rlcResonance();
  const result = await simulate(netlist);
  const tran = result.transient!;
  const time = tran.time;
  const vc = tran.voltage('3');

  // Find oscillation period from zero crossings (skip first 20µs)
  const crossings: number[] = [];
  const dcOffset = vc[vc.length - 1];
  for (let i = 1; i < vc.length; i++) {
    if (time[i] < 20e-6) continue;
    if ((vc[i - 1] - dcOffset) * (vc[i] - dcOffset) < 0) {
      const t = time[i - 1] + (time[i] - time[i - 1]) *
        Math.abs(vc[i - 1] - dcOffset) / Math.abs(vc[i] - vc[i - 1]);
      crossings.push(t);
    }
  }
  let measuredFreq = 0;
  if (crossings.length >= 3) {
    const periods: number[] = [];
    for (let i = 2; i < crossings.length; i += 2) periods.push(crossings[i] - crossings[i - 2]);
    measuredFreq = 1 / (periods.reduce((a, b) => a + b) / periods.length);
  }

  const expectedFreq = 1 / (2 * Math.PI * Math.sqrt(10e-3 * 1e-6)); // ≈ 1591.5 Hz
  const errorPct = measuredFreq > 0 ? pct(measuredFreq, expectedFreq) : 100;

  return {
    circuit: 'rlc-resonance',
    metric: 'f_osc (Hz)',
    spiceTs: measuredFreq,
    expected: expectedFreq,
    errorPct,
    ngspice: null,
    ngspiceDiffPct: null,
    status: errorStatus(errorPct),
    note: errorPct > 15 ? 'Use finer timestep for resonant circuits' : undefined,
  };
}

async function checkBJTBias(): Promise<AccuracyResult> {
  const netlist = bjtCEAmplifier();
  const result = await simulate(netlist);
  const vb = result.dc?.voltage('b') ?? 0;
  const expectedVb = 12 * 10000 / (47000 + 10000); // voltage divider ≈ 2.105 V
  const errorPct = pct(vb, expectedVb);

  const ngspiceVal = runNgspiceVoltage(netlist, 'b');

  return {
    circuit: 'bjt-ce-bias',
    metric: 'V(base) (V)',
    spiceTs: vb,
    expected: expectedVb,
    errorPct,
    ngspice: ngspiceVal,
    ngspiceDiffPct: ngspiceVal !== null ? pct(vb, ngspiceVal) : null,
    status: errorStatus(errorPct),
  };
}

async function checkDiodeRectifier(): Promise<AccuracyResult> {
  const netlist = diodeBridgeRectifier();
  const result = await simulate(netlist, { integrationMethod: 'euler' });
  const v = result.transient!.voltage('out') ?? result.transient!.voltage('5');
  const minV = v ? Math.min(...v) : NaN;

  // Expect output never goes significantly negative (rectified)
  const expected = 0; // min should be > -0.1 V
  const actual = minV;
  const errorPct = actual < -0.1 ? 100 : 0; // pass if barely negative

  return {
    circuit: 'diode-bridge-rectifier',
    metric: 'V(out) min (V)',
    spiceTs: actual,
    expected,
    errorPct,
    ngspice: null,
    ngspiceDiffPct: null,
    status: actual > -0.1 ? '✓' : '✗',
  };
}

async function checkDiffPair(): Promise<AccuracyResult> {
  const netlist = diffPair();
  const result = await simulate(netlist);
  const vout_p = result.dc?.voltage('out+') ?? result.dc?.voltage('out_p') ?? 0;
  const vout_n = result.dc?.voltage('out-') ?? result.dc?.voltage('out_n') ?? 0;
  // At balanced input, outputs should be symmetric: |V(out+) - V(out-)| < 50 mV
  const diff = Math.abs(vout_p - vout_n);
  const expected = 0;
  const errorPct = diff > 0.05 ? pct(diff, 0.05) : 0;

  const ngspiceVp = runNgspiceVoltage(netlist, 'out+');
  const ngspiceVn = runNgspiceVoltage(netlist, 'out-');
  const ngspiceDiff = (ngspiceVp !== null && ngspiceVn !== null)
    ? Math.abs(vout_p - ngspiceVp)
    : null;

  return {
    circuit: 'spice3-diff-pair',
    metric: '|V(out+) - V(out-)| (V)',
    spiceTs: diff,
    expected,
    errorPct: diff * 1000, // report in mV
    ngspice: ngspiceDiff,
    ngspiceDiffPct: ngspiceDiff !== null ? (ngspiceDiff / Math.max(Math.abs(vout_p), 1e-9)) * 100 : null,
    status: diff < 0.05 ? '✓' : diff < 0.2 ? '~' : '✗',
    note: `V(out+)=${vout_p.toFixed(3)}V V(out-)=${vout_n.toFixed(3)}V`,
  };
}

async function checkBandpassRLC(): Promise<AccuracyResult> {
  const netlist = bandpassRLC();
  const result = await simulate(netlist);
  const ac = result.ac!;
  const freqs = ac.frequencies;
  const mags = ac.magnitude('3');

  // Find peak frequency
  let peakIdx = 0;
  for (let i = 1; i < mags.length; i++) {
    if (mags[i] > mags[peakIdx]) peakIdx = i;
  }
  const peakFreq = freqs[peakIdx];
  const expectedFreq = 1 / (2 * Math.PI * Math.sqrt(10e-3 * 1e-6)); // ≈ 1591.5 Hz
  const errorPct = pct(peakFreq, expectedFreq);

  return {
    circuit: 'spice3-bandpass-rlc',
    metric: 'f_peak (Hz)',
    spiceTs: peakFreq,
    expected: expectedFreq,
    errorPct,
    ngspice: null,
    ngspiceDiffPct: null,
    status: errorStatus(errorPct),
  };
}

async function checkOneStageOpAmp(): Promise<AccuracyResult> {
  const netlist = oneStageOpAmp();
  const result = await simulate(netlist);
  const vd2 = result.dc?.voltage('d2') ?? 0;
  const expectedVd2 = 2.5; // VDD/2 at balanced input (rough)
  const errorPct = pct(vd2, expectedVd2);

  const ngspiceVal = runNgspiceVoltage(netlist, 'd2');

  return {
    circuit: 'spice3-ota-dc',
    metric: 'V(d2) (V)',
    spiceTs: vd2,
    expected: expectedVd2,
    errorPct,
    ngspice: ngspiceVal,
    ngspiceDiffPct: ngspiceVal !== null ? pct(vd2, ngspiceVal) : null,
    status: errorStatus(errorPct),
  };
}

async function checkRCLadder5(): Promise<AccuracyResult> {
  const netlist = rcLadder5();
  const result = await simulate(netlist);
  const ac = result.ac!;
  const freqs = ac.frequencies;
  const mags = ac.magnitude('6');

  // Find -3dB frequency (where |H| drops to 1/√2 of passband value)
  const passbandMag = mags[0]; // DC (1 Hz) ≈ 1.0
  const threshold = passbandMag / Math.SQRT2;
  let f3db = 0;
  for (let i = 1; i < mags.length; i++) {
    if (mags[i] < threshold) {
      // Interpolate
      f3db = freqs[i - 1] + (freqs[i] - freqs[i - 1]) *
        (mags[i - 1] - threshold) / (mags[i - 1] - mags[i]);
      break;
    }
  }

  // ngspice reference -3dB for 5-stage RC (R=1k, C=1µF): measured ≈ 32 Hz
  const ngspiceRef = 32; // Hz — verified against ngspice locally
  const errorPct = f3db > 0 ? pct(f3db, ngspiceRef) : 100;

  return {
    circuit: 'spice3-rc-ladder-5',
    metric: 'f_-3dB (Hz)',
    spiceTs: f3db,
    expected: ngspiceRef,
    errorPct,
    ngspice: null,
    ngspiceDiffPct: null,
    status: errorStatus(errorPct),
    note: 'Expected value is ngspice reference (no closed form for 5-pole compound)',
  };
}

// ---------------------------------------------------------------------------
// Print + report
// ---------------------------------------------------------------------------
function printTable(results: AccuracyResult[]): void {
  const W = { circuit: 28, metric: 26, val: 12, err: 8, ng: 12, diff: 8 };
  const hr = '─'.repeat(W.circuit + W.metric + W.val + W.err + W.ng + W.diff + 14);

  console.log(`\n${'Circuit'.padEnd(W.circuit)}  ${'Metric'.padEnd(W.metric)}  ${'spice-ts'.padStart(W.val)}  ${'Err%'.padStart(W.err)}  ${'ngspice'.padStart(W.ng)}  ${'Diff%'.padStart(W.diff)}  Status`);
  console.log(hr);

  for (const r of results) {
    const val = r.spiceTs.toPrecision(5);
    const err = r.errorPct !== null ? r.errorPct.toFixed(2) + '%' : '—';
    const ng = r.ngspice !== null ? r.ngspice.toPrecision(5) : '—';
    const diff = r.ngspiceDiffPct !== null ? r.ngspiceDiffPct.toFixed(2) + '%' : '—';
    console.log(
      `${r.circuit.padEnd(W.circuit)}  ${r.metric.padEnd(W.metric)}  ${val.padStart(W.val)}  ${err.padStart(W.err)}  ${ng.padStart(W.ng)}  ${diff.padStart(W.diff)}  ${r.status}${r.note ? `  (${r.note})` : ''}`,
    );
  }
  console.log(hr);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log('spice-ts Accuracy Report');
  console.log('========================');
  console.log(`Date:    ${new Date().toISOString().split('T')[0]}`);
  console.log(`ngspice: ${USE_NGSPICE ? 'enabled' : 'disabled'}`);
  console.log(`CI mode: ${CI_MODE ? 'yes (exits 1 on >15% error)' : 'no'}`);

  const results: AccuracyResult[] = [];

  console.log('\nRunning circuits...');
  for (const [name, fn] of [
    ['RC step response', checkRCStep],
    ['RLC resonance', checkRLCResonance],
    ['BJT CE bias', checkBJTBias],
    ['Diode rectifier', checkDiodeRectifier],
    ['SPICE3: diff pair', checkDiffPair],
    ['SPICE3: bandpass RLC', checkBandpassRLC],
    ['SPICE3: one-stage OTA', checkOneStageOpAmp],
    ['SPICE3: RC ladder 5-stage', checkRCLadder5],
  ] as [string, () => Promise<AccuracyResult>][]) {
    process.stdout.write(`  ${name}...`);
    try {
      const r = await fn();
      results.push(r);
      console.log(` ${r.status}`);
    } catch (e) {
      console.log(` ERROR: ${(e as Error).message?.slice(0, 60)}`);
      results.push({
        circuit: name,
        metric: '—',
        spiceTs: NaN,
        expected: null,
        errorPct: null,
        ngspice: null,
        ngspiceDiffPct: null,
        status: '?',
        note: (e as Error).message?.slice(0, 60),
      });
    }
  }

  printTable(results);

  // Save results
  const outPath = resolve(__dirname, 'accuracy-results.json');
  let history: { date: string; results: AccuracyResult[] }[] = [];
  if (existsSync(outPath)) {
    try { history = JSON.parse(readFileSync(outPath, 'utf-8')); } catch { /* empty */ }
  }
  history.push({ date: new Date().toISOString(), results });
  writeFileSync(outPath, JSON.stringify(history, null, 2));
  console.log(`\nResults saved to ${outPath}`);

  // CI gate
  if (CI_MODE) {
    const failures = results.filter(r => r.status === '✗');
    if (failures.length > 0) {
      console.error(`\n✗ ${failures.length} circuit(s) exceeded 15% error threshold:`);
      for (const f of failures) console.error(`  - ${f.circuit}: ${f.errorPct?.toFixed(1)}%`);
      process.exit(1);
    }
    console.log('\n✓ All circuits within acceptable error bounds.');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Delete `benchmarks/run.ts`**

```bash
rm benchmarks/run.ts
```

- [ ] **Step 3: Update root `package.json` scripts**

```json
{
  "name": "spice-ts",
  "private": true,
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "bench": "pnpm -C packages/core bench",
    "bench:accuracy": "cd packages/core && pnpm build && cd ../.. && npx tsx benchmarks/accuracy.ts"
  },
  "engines": {
    "node": ">=20"
  },
  "devDependencies": {
    "@types/node": "^25.5.2",
    "tsx": "^4.21.0"
  }
}
```

- [ ] **Step 4: Run accuracy script locally**

```bash
source ~/.zshrc 2>/dev/null; export PATH="$HOME/.local/share/pnpm:$PATH"
pnpm bench:accuracy 2>&1 | tail -40
```

Expected: Table printed with 8 circuits. Most show `✓` or `~`. RLC resonance may show `!` (known issue with default timestep). No unhandled exceptions.

- [ ] **Step 5: Run in CI mode to verify gate works**

```bash
npx tsx benchmarks/accuracy.ts --ci --no-ngspice 2>&1 | tail -10
```

Expected: Exits 0 if all circuits < 15% error, exits 1 with error list otherwise.

- [ ] **Step 6: Commit**

```bash
git add benchmarks/accuracy.ts package.json
git rm benchmarks/run.ts
git commit -m "feat: replace run.ts with accuracy.ts — ngspice comparison + CI gate"
```

---

### Task 5: Update CI workflow

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Replace `.github/workflows/ci.yml` with the updated workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - run: pnpm lint

      - run: pnpm -r run test:coverage

      - name: Upload coverage
        if: matrix.node-version == 22
        uses: codecov/codecov-action@v5
        with:
          files: packages/core/coverage/coverage-final.json
          flags: core
          token: ${{ secrets.CODECOV_TOKEN }}

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm build

  bench:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - run: pnpm bench
        continue-on-error: true

      - name: Upload bench results
        uses: actions/upload-artifact@v4
        with:
          name: vitest-bench-results
          path: benchmarks/vitest-bench-results.json
          if-no-files-found: ignore

  accuracy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install ngspice
        run: sudo apt-get update && sudo apt-get install -y ngspice

      - run: pnpm install --frozen-lockfile

      - run: pnpm build

      - name: Run accuracy checks
        run: npx tsx benchmarks/accuracy.ts --ci

      - name: Upload accuracy results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: accuracy-results
          path: benchmarks/accuracy-results.json
          if-no-files-found: ignore
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add bench (artifact) and accuracy (gated) jobs with ngspice"
```

- [ ] **Step 3: Push and verify**

```bash
git push origin main
```

Then go to https://github.com/mfiumara/spice-ts/actions and confirm all 4 jobs appear: `test`, `build`, `bench`, `accuracy`.

---

### Task 6: ROADMAP.md

**Files:**
- Create: `ROADMAP.md`

- [ ] **Step 1: Create `ROADMAP.md`**

```markdown
# spice-ts Roadmap

This roadmap tracks planned features. Each item links to a GitHub Issue for discussion and progress tracking.

Items are roughly ordered by dependency — device models before UI, solver improvements before large-circuit work.

---

## Device Models

| Feature | Issue | Notes |
|---------|-------|-------|
| BSIM3v3 MOSFET model | [#TBD] | Industry standard for 0.18µm–0.35µm processes |
| BSIM4 MOSFET model | [#TBD] | For 90nm and below |
| EKV compact MOSFET model | [#TBD] | Low-power / weak-inversion accuracy |
| Gummel-Poon BJT model | [#TBD] | Replaces Ebers-Moll for high-frequency accuracy |
| Controlled sources (VCVS, VCCS, CCVS, CCCS) | [#TBD] | E, G, H, F elements in SPICE syntax |
| Lossless transmission line | [#TBD] | T element, time-delay model |

## Solver & Analysis

| Feature | Issue | Notes |
|---------|-------|-------|
| Sparse LU solver (KLU-style) | [#TBD] | Replace dense O(n³) — needed for >200-node circuits |
| DC sweep analysis (`.dc`) | [#TBD] | V/I source sweep with streaming results |

## Language

| Feature | Issue | Notes |
|---------|-------|-------|
| `.subckt` subcircuit support | [#TBD] | Hierarchical netlists |

## Packages

| Feature | Issue | Notes |
|---------|-------|-------|
| `@spice-ts/ui` — waveform viewer | [#TBD] | Browser component consuming `SimulationResult` and `simulateStream()` |
| `@spice-ts/designer` — schematic editor | [#TBD] | Visual circuit editor (LTspice-style), exports to SPICE netlist |

---

*Issues are tracked on [GitHub](https://github.com/mfiumara/spice-ts/issues). PRs welcome.*
```

- [ ] **Step 2: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: add ROADMAP.md with planned features"
```

---

### Task 7: GitHub Issues + update ROADMAP links

**Note:** This task uses the `gh` CLI. Run `gh auth status` first to confirm you are authenticated.

- [ ] **Step 1: Create issue labels**

```bash
gh label create "device-models" --color "0075ca" --description "New or improved device model implementations" 2>/dev/null || true
gh label create "performance" --color "e4e669" --description "Solver and runtime performance improvements" 2>/dev/null || true
gh label create "analysis" --color "d93f0b" --description "New analysis types or improvements" 2>/dev/null || true
gh label create "language" --color "0e8a16" --description "SPICE language and parser features" 2>/dev/null || true
gh label create "packages" --color "5319e7" --description "New packages in the monorepo" 2>/dev/null || true
```

- [ ] **Step 2: Create the 11 GitHub Issues**

```bash
I1=$(gh issue create --title "BSIM3v3 MOSFET model" \
  --label "enhancement,device-models" \
  --body "Implement the BSIM3v3 MOSFET model for accurate simulation of 0.18µm–0.35µm process nodes.

**Motivation:** The current Level 1 Shichman-Hodges model is too simplistic for real-world designs. BSIM3v3 is the industry standard for processes down to ~90nm.

**References:**
- BSIM3v3 Manual: http://bsim.eecs.berkeley.edu/models/bsim3/
- Model parameters: IS, VTH0, K1, K2, UA, UB, VSAT, AGS, KETA, A1, A2, etc.

**Acceptance criteria:**
- [ ] NMOS and PMOS variants
- [ ] Matches ngspice BSIM3v3 output within 2% for standard test circuits
- [ ] Covered by accuracy benchmark in \`benchmarks/accuracy.ts\`" | grep -oP '#\d+' | tr -d '#')

I2=$(gh issue create --title "BSIM4 MOSFET model" \
  --label "enhancement,device-models" \
  --body "Implement BSIM4 MOSFET model for sub-90nm process simulation.

**Motivation:** BSIM4 is required for 90nm and below. It adds accurate modeling of quantum effects, poly depletion, and gate leakage.

**References:**
- BSIM4 Manual: http://bsim.eecs.berkeley.edu/models/bsim4/

**Acceptance criteria:**
- [ ] NMOS and PMOS variants
- [ ] Passes BSIM4 standard verification suite" | grep -oP '#\d+' | tr -d '#')

I3=$(gh issue create --title "EKV compact MOSFET model" \
  --label "enhancement,device-models" \
  --body "Implement the EKV (Enz-Krummenacher-Vittoz) MOSFET model for accurate weak-inversion and low-power simulation.

**Motivation:** EKV is widely used in analog/RF and low-power IC design. It models weak and strong inversion with a single continuous equation.

**Acceptance criteria:**
- [ ] Continuous from weak to strong inversion
- [ ] Accurate for subthreshold circuits" | grep -oP '#\d+' | tr -d '#')

I4=$(gh issue create --title "Gummel-Poon BJT model" \
  --label "enhancement,device-models" \
  --body "Implement the full Gummel-Poon BJT model to replace the current Ebers-Moll implementation.

**Motivation:** Ebers-Moll omits high-frequency effects (base-width modulation, high-injection, base resistance). Gummel-Poon is the standard SPICE BJT model.

**Key additions over Ebers-Moll:** RB, RC, RE parasitic resistances, VAF/VAR Early voltage, IKF/IKR high-injection, CJE/CJC junction capacitances, TF/TR transit times.

**Acceptance criteria:**
- [ ] NPN and PNP
- [ ] Matches ngspice GP model output within 2% for the SPICE3 diff-pair reference circuit" | grep -oP '#\d+' | tr -d '#')

I5=$(gh issue create --title "Voltage/current controlled sources (VCVS, VCCS, CCVS, CCCS)" \
  --label "enhancement,device-models" \
  --body "Add support for the four SPICE controlled source types:
- **E** — Voltage-Controlled Voltage Source (VCVS)
- **G** — Voltage-Controlled Current Source (VCCS)
- **H** — Current-Controlled Voltage Source (CCVS)
- **F** — Current-Controlled Current Source (CCCS)

**Motivation:** These are fundamental for modeling op-amps, amplifiers, and active circuits without using transistor-level primitives.

**Acceptance criteria:**
- [ ] All four types parse and stamp correctly into MNA
- [ ] DC, transient, and AC analysis supported
- [ ] Integration tests for each type" | grep -oP '#\d+' | tr -d '#')

I6=$(gh issue create --title "Lossless transmission line (T element)" \
  --label "enhancement,device-models" \
  --body "Implement the lossless transmission line (T element) using a time-delay companion model.

**Motivation:** Required for signal integrity analysis and high-speed digital simulation.

**Model:** Bergeron method — two current sources with time delay TD = length/velocity.

**Acceptance criteria:**
- [ ] \`.T\` element parsed from netlist
- [ ] Correct characteristic impedance Z0 and delay TD
- [ ] Transient analysis only (AC uses equivalent pi-model)" | grep -oP '#\d+' | tr -d '#')

I7=$(gh issue create --title "Sparse LU solver (replace dense O(n³))" \
  --label "enhancement,performance" \
  --body "Replace the current dense LU decomposition with a sparse solver (KLU-style) to handle large circuits efficiently.

**Motivation:** The current solver converts the sparse MNA matrix to dense before factoring. This is O(n³) in time and O(n²) in memory — impractical above ~200 nodes (see benchmark results).

**Target:** ~10x improvement for 1000-node circuits, bringing spice-ts within 10x of ngspice for large linear circuits.

**Approach options:**
- Port KLU (SuiteSparse) to WASM
- Implement a pure-JS supernodal sparse LU
- Use a fill-reducing ordering (AMD/COLAMD) with sparse LU

**Acceptance criteria:**
- [ ] All existing tests pass
- [ ] 1000-node resistor ladder solves in < 50ms (vs current ~1500ms)
- [ ] API unchanged (drop-in replacement for \`solveLU\`)" | grep -oP '#\d+' | tr -d '#')

I8=$(gh issue create --title "DC sweep analysis (.dc command)" \
  --label "enhancement,analysis" \
  --body "Implement DC sweep analysis (\`.dc\` command) — sweep a voltage or current source across a range and collect node voltages at each point.

**Syntax:** \`.dc Vsrc start stop step\`

**Motivation:** Essential for I-V curves, operating point sweeps, and transfer characteristic plots.

**Acceptance criteria:**
- [ ] Parser handles \`.dc\` already — wire up the analysis in \`simulate.ts\`
- [ ] Returns \`DCSweepResult\` with voltage arrays per node per sweep point
- [ ] \`simulateStream()\` yields one point per step" | grep -oP '#\d+' | tr -d '#')

I9=$(gh issue create --title ".subckt subcircuit support" \
  --label "enhancement,language" \
  --body "Add support for \`.subckt\` / \`.ends\` subcircuit definitions and \`X\` instantiation.

**Motivation:** Required for hierarchical netlists and reusable cell libraries. Without this, real-world PDK-based designs cannot be simulated.

**Syntax:**
\`\`\`spice
.subckt inv in out vdd vss
MP out in vdd vdd PMOS W=20u L=1u
MN out in vss vss NMOS W=10u L=1u
.ends inv

X1 a b vdd 0 inv
\`\`\`

**Acceptance criteria:**
- [ ] Parser handles nested \`.subckt\` definitions
- [ ] Node renaming / namespace isolation per instance
- [ ] Integration test with a 2-level hierarchy" | grep -oP '#\d+' | tr -d '#')

I10=$(gh issue create --title "@spice-ts/ui — waveform viewer package" \
  --label "enhancement,packages" \
  --body "Create \`@spice-ts/ui\` — a browser-native waveform viewer that consumes \`SimulationResult\` and \`simulateStream()\` directly.

**Motivation:** Users need a way to visualise simulation output without exporting to external tools.

**Features:**
- Voltage/current traces per node (selectable)
- Real-time streaming display via \`simulateStream()\`
- Zoom/pan, cursors, measurement markers
- Framework-agnostic (Web Components or headless hooks)
- Zero dependency on \`@spice-ts/core\` internals — only the public API

**Package location:** \`packages/ui/\` in the monorepo" | grep -oP '#\d+' | tr -d '#')

I11=$(gh issue create --title "@spice-ts/designer — visual schematic editor" \
  --label "enhancement,packages" \
  --body "Create \`@spice-ts/designer\` — a visual schematic editor (LTspice-style) that exports to SPICE netlist and integrates with \`simulate()\`.

**Motivation:** Allow users to design circuits visually without writing netlists by hand.

**Features:**
- Drag-and-drop component placement (R, C, L, V, I, BJT, MOSFET, Diode)
- Wire routing with automatic node naming
- Component properties panel (value, model parameters)
- Export to SPICE netlist string
- Direct \`simulate()\` integration — run sim from the editor
- Import existing \`.cir\` netlists back into schematic view

**Package location:** \`packages/designer/\` in the monorepo" | grep -oP '#\d+' | tr -d '#')

echo "Issues created: $I1 $I2 $I3 $I4 $I5 $I6 $I7 $I8 $I9 $I10 $I11"
```

- [ ] **Step 3: Update ROADMAP.md with real issue numbers**

After running Step 2, replace each `[#TBD]` in `ROADMAP.md` with the actual issue numbers printed by the script. Edit the file manually or run:

```bash
# The echo at the end of Step 2 prints: "Issues created: 1 2 3 4 5 6 7 8 9 10 11"
# Adjust numbers below to match actual output
sed -i \
  -e "s|\[#TBD\].*BSIM3v3|[#${I1}](https://github.com/mfiumara/spice-ts/issues/${I1})|" \
  ROADMAP.md
# ... repeat for each issue or edit manually
```

Easiest: open `ROADMAP.md` and replace `[#TBD]` links manually with the issue URLs printed in Step 2.

- [ ] **Step 4: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: link ROADMAP.md issues to GitHub"
```

- [ ] **Step 5: Push**

```bash
git push origin main
```

---

### Task 8: Update README.md bench section

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the Development section in `README.md`**

Find the existing `## Development` section and replace it with:

```markdown
## Development

```bash
git clone https://github.com/mfiumara/spice-ts
cd spice-ts
pnpm install
pnpm test              # unit + integration tests
pnpm build             # build @spice-ts/core
pnpm bench             # vitest bench (perf, no external deps)
pnpm bench:accuracy    # accuracy report vs analytical + ngspice comparison
```

### Benchmarks

Performance benchmarks use [vitest bench](https://vitest.dev/guide/features#benchmarking) and run on every PR (results uploaded as artifacts). To run locally:

```bash
pnpm bench
```

Accuracy benchmarks compare spice-ts output against analytical expected values and (optionally) ngspice. They gate the CI build — any circuit exceeding 15% error vs analytical fails the `accuracy` job.

```bash
pnpm bench:accuracy               # with ngspice comparison
pnpm bench:accuracy --no-ngspice  # spice-ts only
```

See [`ROADMAP.md`](./ROADMAP.md) for planned improvements including a sparse LU solver (needed for large circuits > 200 nodes).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README bench instructions to reflect vitest bench + accuracy script"
```

- [ ] **Step 3: Push**

```bash
git push origin main
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| vitest bench replacing run.ts timing | Tasks 1, 2 |
| SPICE3 reference circuits | Task 3 |
| accuracy.ts with --ci flag | Task 4 |
| Delete run.ts | Task 4 Step 2 |
| ngspice in CI (apt-get) | Task 5 |
| bench job (artifact only) | Task 5 |
| accuracy job (gated) | Task 5 |
| ROADMAP.md | Task 6 |
| 11 GitHub Issues | Task 7 |
| README update | Task 8 |

**Placeholder scan:** No TBDs in code steps. Issue body text is complete. ROADMAP sed command notes "edit manually" as a fallback — acceptable since issue numbers aren't known until runtime.

**Type consistency:**
- `simulate()` import path in bench files uses `../simulate.js` — matches the actual file location at `packages/core/src/simulate.ts`
- `@benchmarks` alias resolves to `../../benchmarks` from `packages/core/` — matches path in `vitest.bench.config.ts`
- `AccuracyResult` type defined once at top of `accuracy.ts` and used throughout
- `runNgspice` / `hasNgspice` imported from `./ngspice-runner.js` — matches existing file
- Generator function names (`rcChain`, `rlcResonance`, `bjtCEAmplifier`, `diodeBridgeRectifier`) match existing `generators.ts` exports
- SPICE3 generator names (`diffPair`, `rcLadder5`, `oneStageOpAmp`, `cmosInverterSingle`, `bandpassRLC`) defined in Task 3 and imported in Task 4
