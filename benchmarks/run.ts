/**
 * spice-ts Benchmark Suite
 *
 * Runs standard SPICE benchmark circuits through spice-ts and (optionally)
 * ngspice for comparison. Reports timing and accuracy metrics.
 *
 * Usage:
 *   pnpm bench                  # Run all benchmarks
 *   pnpm bench -- --no-ngspice  # Skip ngspice comparison
 *   pnpm bench -- --only scale  # Only run scalability benchmarks
 *   pnpm bench -- --only acc    # Only run accuracy benchmarks
 */
import { simulate } from '@spice-ts/core';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  resistorLadder,
  rcChain,
  rcChainAC,
  rlcResonance,
  cmosInverterChain,
  cmosRingOscillator,
  diodeBridgeRectifier,
  bjtCEAmplifier,
  mosfetCSAmplifier,
  lcLadder,
} from './circuits/generators.js';
import { hasNgspice, runNgspice } from './ngspice-runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface BenchResult {
  name: string;
  category: string;
  spiceTs: { timeMs: number; iterations: number };
  ngspice?: { analysisTimeMs: number };
  speedup?: number;
  accuracy?: { metric: string; value: number; expected: number; errorPct: number };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const WARMUP = 1;
const ITERATIONS = 5;

async function benchSpiceTs(
  netlist: string,
  opts?: { iterations?: number; simOptions?: Parameters<typeof simulate>[1] },
): Promise<{ timeMs: number; iterations: number; result: Awaited<ReturnType<typeof simulate>> }> {
  const iters = opts?.iterations ?? ITERATIONS;

  // Warmup
  for (let i = 0; i < WARMUP; i++) await simulate(netlist, opts?.simOptions);

  const times: number[] = [];
  let lastResult: Awaited<ReturnType<typeof simulate>> | undefined;
  for (let i = 0; i < iters; i++) {
    const start = performance.now();
    lastResult = await simulate(netlist, opts?.simOptions);
    times.push(performance.now() - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  return {
    timeMs: Math.round(avg * 100) / 100,
    iterations: iters,
    result: lastResult!,
  };
}

function benchNgspice(netlist: string): { analysisTimeMs: number } | undefined {
  if (!useNgspice) return undefined;
  try {
    const r = runNgspice(netlist);
    return { analysisTimeMs: Math.round(r.analysisTimeMs * 100) / 100 };
  } catch (e) {
    console.warn(`  ngspice failed: ${(e as Error).message}`);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Benchmark suites
// ---------------------------------------------------------------------------

async function runScalabilityBenchmarks(): Promise<BenchResult[]> {
  const results: BenchResult[] = [];

  // --- Resistor ladder (DC) ---
  console.log('\n--- Resistor Ladder (DC .op) ---');
  for (const n of [10, 100, 500, 1000]) {
    const netlist = resistorLadder(n);
    const st = await benchSpiceTs(netlist);
    const ng = benchNgspice(netlist);
    const r: BenchResult = {
      name: `resistor-ladder-${n}`,
      category: 'scalability-dc',
      spiceTs: { timeMs: st.timeMs, iterations: st.iterations },
      ngspice: ng,
      speedup: ng ? ng.analysisTimeMs / st.timeMs : undefined,
    };
    results.push(r);
    printResult(r);
  }

  // --- RC chain (transient) ---
  console.log('\n--- RC Chain (Transient) ---');
  for (const n of [10, 50, 100, 200]) {
    const netlist = rcChain(n, { stopTime: 10e-3, timestep: 10e-3 / 200 });
    const st = await benchSpiceTs(netlist);
    const ng = benchNgspice(netlist);
    const r: BenchResult = {
      name: `rc-chain-tran-${n}`,
      category: 'scalability-tran',
      spiceTs: { timeMs: st.timeMs, iterations: st.iterations },
      ngspice: ng,
      speedup: ng ? ng.analysisTimeMs / st.timeMs : undefined,
    };
    results.push(r);
    printResult(r);
  }

  // --- RC chain (AC) ---
  console.log('\n--- RC Chain (AC sweep) ---');
  for (const n of [10, 50, 100, 200]) {
    const netlist = rcChainAC(n);
    const st = await benchSpiceTs(netlist);
    const ng = benchNgspice(netlist);
    const r: BenchResult = {
      name: `rc-chain-ac-${n}`,
      category: 'scalability-ac',
      spiceTs: { timeMs: st.timeMs, iterations: st.iterations },
      ngspice: ng,
      speedup: ng ? ng.analysisTimeMs / st.timeMs : undefined,
    };
    results.push(r);
    printResult(r);
  }

  // --- CMOS inverter chain (nonlinear transient) ---
  console.log('\n--- CMOS Inverter Chain (Transient, Euler) ---');
  for (const n of [5, 10, 25, 50]) {
    const netlist = cmosInverterChain(n);
    try {
      const st = await benchSpiceTs(netlist, { iterations: 3, simOptions: { integrationMethod: 'euler' } });
      const ng = benchNgspice(netlist);
      const r: BenchResult = {
        name: `cmos-inv-chain-${n}`,
        category: 'scalability-nonlinear',
        spiceTs: { timeMs: st.timeMs, iterations: st.iterations },
        ngspice: ng,
        speedup: ng ? ng.analysisTimeMs / st.timeMs : undefined,
      };
      results.push(r);
      printResult(r);
    } catch (e) {
      console.log(`  cmos-inv-chain-${n}: FAILED — ${(e as Error).message?.slice(0, 80)}`);
      results.push({ name: `cmos-inv-chain-${n}`, category: 'scalability-nonlinear', spiceTs: { timeMs: -1, iterations: 0 } });
    }
  }

  // --- LC ladder (transient wave propagation) ---
  console.log('\n--- LC Ladder (Transient, Euler) ---');
  for (const n of [10, 50, 100]) {
    const netlist = lcLadder(n);
    try {
      const st = await benchSpiceTs(netlist, { iterations: 3, simOptions: { integrationMethod: 'euler' } });
      const ng = benchNgspice(netlist);
      const r: BenchResult = {
        name: `lc-ladder-${n}`,
        category: 'scalability-tran',
        spiceTs: { timeMs: st.timeMs, iterations: st.iterations },
        ngspice: ng,
        speedup: ng ? ng.analysisTimeMs / st.timeMs : undefined,
      };
      results.push(r);
      printResult(r);
    } catch (e) {
      console.log(`  lc-ladder-${n}: FAILED — ${(e as Error).message?.slice(0, 80)}`);
      results.push({ name: `lc-ladder-${n}`, category: 'scalability-tran', spiceTs: { timeMs: -1, iterations: 0 } });
    }
  }

  return results;
}

async function runAccuracyBenchmarks(): Promise<BenchResult[]> {
  const results: BenchResult[] = [];

  // --- Single-stage RC step response: V(2) at t = τ ---
  console.log('\n--- Accuracy: RC Step Response ---');
  {
    const netlist = rcChain(1, { stopTime: 5e-3, timestep: 1e-5 });
    const st = await benchSpiceTs(netlist);
    const tran = st.result.transient!;
    const time = tran.time;
    const vout = tran.voltage('2');

    // τ = RC = 1k * 1µF = 1ms. At t=τ, V ≈ 5*(1-e^-1) ≈ 3.16V
    const tau = 1e-3;
    const idxTau = time.findIndex(t => t >= tau);
    const expected = 5 * (1 - Math.exp(-1));
    const actual = vout[idxTau];
    const errorPct = Math.abs((actual - expected) / expected) * 100;

    const r: BenchResult = {
      name: 'rc-step-at-tau',
      category: 'accuracy',
      spiceTs: { timeMs: st.timeMs, iterations: st.iterations },
      accuracy: { metric: 'V(out) at t=τ', value: actual, expected, errorPct },
    };
    results.push(r);
    printResult(r);
  }

  // --- RLC damped oscillation frequency ---
  console.log('\n--- Accuracy: RLC Resonance ---');
  {
    const netlist = rlcResonance();
    const st = await benchSpiceTs(netlist);
    const ng = benchNgspice(netlist);
    const tran = st.result.transient!;
    const time = tran.time;
    const vc = tran.voltage('3'); // voltage across capacitor

    // Find oscillation period from zero crossings (skip first 20µs — pulse region)
    const crossings: number[] = [];
    const dcOffset = vc[vc.length - 1]; // steady state
    for (let i = 1; i < vc.length; i++) {
      if (time[i] < 20e-6) continue; // skip pulse excitation region
      if ((vc[i - 1] - dcOffset) * (vc[i] - dcOffset) < 0) {
        const t = time[i - 1] + (time[i] - time[i - 1]) *
          Math.abs(vc[i - 1] - dcOffset) / Math.abs(vc[i] - vc[i - 1]);
        crossings.push(t);
      }
    }

    let measuredFreq = 0;
    if (crossings.length >= 3) {
      // Period = time between every other crossing (full cycle)
      const periods: number[] = [];
      for (let i = 2; i < crossings.length; i += 2) {
        periods.push(crossings[i] - crossings[i - 2]);
      }
      const avgPeriod = periods.reduce((a, b) => a + b, 0) / periods.length;
      measuredFreq = 1 / avgPeriod;
    }

    // Expected: f_res = 1/(2π√(LC)) = 1/(2π√(10m * 1µ)) ≈ 1591.5 Hz
    const expectedFreq = 1 / (2 * Math.PI * Math.sqrt(10e-3 * 1e-6));
    const errorPct = Math.abs((measuredFreq - expectedFreq) / expectedFreq) * 100;

    const r: BenchResult = {
      name: 'rlc-resonance-freq',
      category: 'accuracy',
      spiceTs: { timeMs: st.timeMs, iterations: st.iterations },
      ngspice: ng,
      accuracy: { metric: 'f_osc (Hz)', value: measuredFreq, expected: expectedFreq, errorPct },
    };
    results.push(r);
    printResult(r);
  }

  // --- BJT CE amplifier DC bias ---
  console.log('\n--- Accuracy: BJT CE Amplifier ---');
  {
    const netlist = bjtCEAmplifier();
    const st = await benchSpiceTs(netlist);
    const ng = benchNgspice(netlist);

    // Expected bias: Vb ≈ 12 * 10k/(47k+10k) ≈ 2.1V, Ve ≈ 1.4V, Ic ≈ 1.4mA, Vc ≈ 12 - 4.7k*1.4m ≈ 5.4V
    const vb = st.result.dc?.voltage('b') ?? 0;
    const expectedVb = 12 * 10000 / (47000 + 10000);
    const errorPct = Math.abs((vb - expectedVb) / expectedVb) * 100;

    const r: BenchResult = {
      name: 'bjt-ce-bias-vb',
      category: 'accuracy',
      spiceTs: { timeMs: st.timeMs, iterations: st.iterations },
      ngspice: ng,
      accuracy: { metric: 'V(base)', value: vb, expected: expectedVb, errorPct },
    };
    results.push(r);
    printResult(r);
  }

  // --- MOSFET CS amplifier ---
  console.log('\n--- Accuracy: MOSFET CS Amplifier ---');
  {
    const netlist = mosfetCSAmplifier();
    const st = await benchSpiceTs(netlist);
    const ng = benchNgspice(netlist);

    const r: BenchResult = {
      name: 'mosfet-cs-amp',
      category: 'accuracy',
      spiceTs: { timeMs: st.timeMs, iterations: st.iterations },
      ngspice: ng,
    };
    results.push(r);
    printResult(r);
  }

  // --- Diode bridge rectifier ---
  console.log('\n--- Accuracy: Diode Bridge Rectifier ---');
  {
    const netlist = diodeBridgeRectifier();
    const st = await benchSpiceTs(netlist, { iterations: 3, simOptions: { integrationMethod: 'euler' } });
    const ng = benchNgspice(netlist);

    const r: BenchResult = {
      name: 'diode-bridge-rectifier',
      category: 'accuracy',
      spiceTs: { timeMs: st.timeMs, iterations: st.iterations },
      ngspice: ng,
    };
    results.push(r);
    printResult(r);
  }

  // --- Ring oscillator (convergence stress test) ---
  console.log('\n--- Stress: Ring Oscillator ---');
  for (const n of [3, 5, 11]) {
    const netlist = cmosRingOscillator(n);
    try {
      const st = await benchSpiceTs(netlist, { iterations: 3, simOptions: { integrationMethod: 'euler' } });
      const ng = benchNgspice(netlist);
      const r: BenchResult = {
        name: `ring-osc-${n}`,
        category: 'convergence',
        spiceTs: { timeMs: st.timeMs, iterations: st.iterations },
        ngspice: ng,
        speedup: ng ? ng.analysisTimeMs / st.timeMs : undefined,
      };
      results.push(r);
      printResult(r);
    } catch (e) {
      console.log(`  ring-osc-${n}: FAILED — ${(e as Error).message}`);
      results.push({
        name: `ring-osc-${n}`,
        category: 'convergence',
        spiceTs: { timeMs: -1, iterations: 0 },
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------
function printResult(r: BenchResult): void {
  let line = `  ${r.name.padEnd(28)} spice-ts: ${String(r.spiceTs.timeMs).padStart(10)}ms`;
  if (r.ngspice) {
    line += `  ngspice: ${String(r.ngspice.analysisTimeMs).padStart(10)}ms`;
  }
  if (r.speedup !== undefined) {
    const label = r.speedup > 1 ? `${r.speedup.toFixed(1)}x faster` : `${(1 / r.speedup).toFixed(1)}x slower`;
    line += `  (${label})`;
  }
  if (r.accuracy) {
    line += `\n${''.padEnd(32)}${r.accuracy.metric}: ${r.accuracy.value.toFixed(4)} (expected ${r.accuracy.expected.toFixed(4)}, err ${r.accuracy.errorPct.toFixed(2)}%)`;
  }
  console.log(line);
}

function printSummaryTable(results: BenchResult[]): void {
  console.log('\n' + '='.repeat(90));
  console.log('SUMMARY');
  console.log('='.repeat(90));

  const categories = [...new Set(results.map(r => r.category))];
  for (const cat of categories) {
    console.log(`\n  ${cat.toUpperCase()}`);
    console.log('  ' + '-'.repeat(86));
    for (const r of results.filter(r => r.category === cat)) {
      printResult(r);
    }
  }

  // Speedup summary
  const withSpeedup = results.filter(r => r.speedup !== undefined);
  if (withSpeedup.length > 0) {
    console.log('\n  SPEEDUP vs ngspice');
    console.log('  ' + '-'.repeat(86));
    const geomean = Math.exp(
      withSpeedup.reduce((sum, r) => sum + Math.log(r.speedup!), 0) / withSpeedup.length,
    );
    console.log(`  Geometric mean: ${geomean.toFixed(2)}x`);
    const fastest = withSpeedup.reduce((best, r) => (r.speedup! > best.speedup! ? r : best));
    const slowest = withSpeedup.reduce((best, r) => (r.speedup! < best.speedup! ? r : best));
    console.log(`  Best:  ${fastest.name} — ${fastest.speedup!.toFixed(1)}x`);
    console.log(`  Worst: ${slowest.name} — ${slowest.speedup!.toFixed(1)}x`);
  }

  // Accuracy summary
  const withAccuracy = results.filter(r => r.accuracy);
  if (withAccuracy.length > 0) {
    console.log('\n  ACCURACY');
    console.log('  ' + '-'.repeat(86));
    for (const r of withAccuracy) {
      const a = r.accuracy!;
      const status = a.errorPct < 5 ? '✓' : a.errorPct < 15 ? '~' : '✗';
      console.log(`  ${status} ${r.name.padEnd(28)} ${a.metric}: err ${a.errorPct.toFixed(2)}%`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const useNgspice = !args.includes('--no-ngspice') && hasNgspice();
const onlyFilter = args.find((a, i) => args[i - 1] === '--only');

async function main(): Promise<void> {
  console.log('spice-ts Benchmark Suite');
  console.log('========================');
  console.log(`ngspice: ${useNgspice ? 'enabled' : 'disabled (use --no-ngspice or install ngspice)'}`);
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);

  const results: BenchResult[] = [];

  if (!onlyFilter || onlyFilter === 'scale') {
    results.push(...await runScalabilityBenchmarks());
  }

  if (!onlyFilter || onlyFilter === 'acc') {
    results.push(...await runAccuracyBenchmarks());
  }

  printSummaryTable(results);

  // Save results
  const outPath = resolve(__dirname, 'results.json');
  let history: { date: string; results: BenchResult[] }[] = [];
  if (existsSync(outPath)) {
    try {
      history = JSON.parse(readFileSync(outPath, 'utf-8'));
    } catch {
      history = [];
    }
  }
  history.push({ date: new Date().toISOString(), results });
  writeFileSync(outPath, JSON.stringify(history, null, 2));
  console.log(`\nResults saved to ${outPath}`);
}

main().catch(console.error);
