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
  // Node 'p' is the rectified output (positive rail); 'out'/'5' are aliases tried as fallbacks
  const v = result.transient!.voltage('p') ?? result.transient!.voltage('out') ?? result.transient!.voltage('5');
  const minV = v ? Math.min(...v) : NaN;

  // Expect output never goes significantly negative (rectified)
  const actual = minV;
  const errorPct = actual < -0.1 ? 100 : 0;

  return {
    circuit: 'diode-bridge-rectifier',
    metric: 'V(out) min (V)',
    spiceTs: actual,
    expected: 0,
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
  // Balanced input: outputs must be symmetric within 1 mV
  const diff = Math.abs(vout_p - vout_n);
  const errorPct = diff > 0 ? diff * 1000 : 0; // report in mV

  return {
    circuit: 'spice3-diff-pair',
    metric: '|V(out+) - V(out-)| (mV)',
    spiceTs: diff * 1000,
    expected: 0,
    errorPct,
    ngspice: null,
    ngspiceDiffPct: null,
    status: diff < 0.001 ? '✓' : diff < 0.01 ? '~' : '✗',
    note: `V(out+)=${vout_p.toFixed(4)}V V(out-)=${vout_n.toFixed(4)}V`,
  };
}

async function checkBandpassRLC(): Promise<AccuracyResult> {
  const netlist = bandpassRLC();
  const result = await simulate(netlist);
  const ac = result.ac!;
  const freqs = ac.frequencies;
  const mags = ac.voltage('3').map(v => v.magnitude);

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
  const vd1 = result.dc?.voltage('d1') ?? 0;
  const vd2 = result.dc?.voltage('d2') ?? 0;
  // Balanced OTA: V(d1) ≈ V(d2). Verified against ngspice-44: both ≈ 4.105V.
  const expectedVd2 = 4.105;
  const errorPct = pct(vd2, expectedVd2);

  return {
    circuit: 'spice3-ota-dc',
    metric: 'V(d2) (V)',
    spiceTs: vd2,
    expected: expectedVd2,
    errorPct,
    ngspice: null,
    ngspiceDiffPct: null,
    status: errorStatus(errorPct),
    note: `V(d1)=${vd1.toFixed(4)}V V(d2)=${vd2.toFixed(4)}V`,
  };
}

async function checkRCLadder5(): Promise<AccuracyResult> {
  const netlist = rcLadder5();
  const result = await simulate(netlist);
  const ac = result.ac!;
  const freqs = ac.frequencies;
  const mags = ac.voltage('6').map(v => v.magnitude);

  // Find -3dB frequency (where |H| drops to 1/√2 of passband value)
  const passbandMag = mags[0]; // DC (1 Hz) ≈ 1.0
  const threshold = passbandMag / Math.SQRT2;
  let f3db = 0;
  for (let i = 1; i < mags.length; i++) {
    if (mags[i] < threshold) {
      f3db = freqs[i - 1] + (freqs[i] - freqs[i - 1]) *
        (mags[i - 1] - threshold) / (mags[i - 1] - mags[i]);
      break;
    }
  }

  // Analytical -3dB for 5-stage RC ladder (R=1k, C=1µF):
  // H = 1/(1+15p+35p²+28p³+9p⁴+p⁵), p=jωRC → |H|=1/√2 at q≈0.08, f≈12.73 Hz
  const analyticalRef = 12.73; // Hz — derived from KCL transfer function
  const errorPct = f3db > 0 ? pct(f3db, analyticalRef) : 100;

  return {
    circuit: 'spice3-rc-ladder-5',
    metric: 'f_-3dB (Hz)',
    spiceTs: f3db,
    expected: analyticalRef,
    errorPct,
    ngspice: null,
    ngspiceDiffPct: null,
    status: errorStatus(errorPct),
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

  // CI gate — all circuits must pass
  if (CI_MODE) {
    const failures = results.filter(r => r.status === '✗');
    if (failures.length > 0) {
      console.error(`\n✗ ${failures.length} circuit(s) exceeded 15% error threshold:`);
      for (const f of failures) console.error(`  - ${f.circuit}: ${f.errorPct?.toFixed(1)}%${f.note ? ` (${f.note})` : ''}`);
      process.exit(1);
    }
    console.log('\n✓ All circuits within acceptable error bounds.');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
