#!/usr/bin/env tsx
/**
 * Three-way benchmark comparison: spice-ts vs eecircuit-engine (ngspice WASM) vs ngspice (native).
 *
 * Usage:
 *   npx tsx benchmarks/comparison.ts              # full run, markdown table
 *   npx tsx benchmarks/comparison.ts --json        # JSON output
 *   npx tsx benchmarks/comparison.ts --no-ngspice  # skip native ngspice
 */
import { simulate } from '@spice-ts/core';
// eecircuit-engine only ships ESM (.mjs) — loaded via dynamic import in main()
import { hasNgspice, runNgspice } from './ngspice-runner.js';
import {
  resistorLadder,
  rcChain,
  rcChainAC,
  cmosInverterChain,
  cmosRingOscillator,
  lcLadder,
} from './circuits/generators.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const USE_NGSPICE = !args.includes('--no-ngspice') && hasNgspice();
const WARMUP_RUNS = 1;
const BENCH_RUNS = 3;

interface BenchResult {
  circuit: string;
  category: string;
  nodes: number | string;
  spiceTs: number;
  eecircuit: number;
  ngspiceAnalysis: number | null;
  ngspiceTotal: number | null;
}

// ---------------------------------------------------------------------------
// Netlist adaptation for eecircuit (ngspice format)
// ---------------------------------------------------------------------------
function adaptNetlistForNgspice(netlist: string): string {
  const lines = netlist.split('\n');
  const adapted: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();
    if (trimmed === '.end') continue;
    // Fix 3-terminal MOSFETs -> 4-terminal
    const mosfetMatch = line.match(/^(M\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(NMOD|PMOD|NMOS\S*|PMOS\S*)\s*$/i);
    if (mosfetMatch) {
      const [, name, drain, gate, source, model] = mosfetMatch;
      adapted.push(`${name} ${drain} ${gate} ${source} ${source} ${model}`);
      continue;
    }
    // Strip non-ASCII (eecircuit-engine WASM hangs on unicode like em-dash)
    adapted.push(line.replace(/[^\x00-\x7F]/g, '-'));
  }
  adapted.push('.end');
  return adapted.join('\n');
}

// ---------------------------------------------------------------------------
// Timing helpers
// ---------------------------------------------------------------------------
async function timeSpiceTs(netlist: string, runs: number): Promise<number> {
  // Warmup
  for (let i = 0; i < WARMUP_RUNS; i++) await simulate(netlist);
  // Measure
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await simulate(netlist);
    times.push(performance.now() - t0);
  }
  return median(times);
}

async function timeEEcircuit(
  SimClass: typeof import('eecircuit-engine').Simulation,
  netlist: string,
  runs: number,
): Promise<number> {
  const adapted = adaptNetlistForNgspice(netlist);
  // Fresh instance per run (eecircuit-engine hangs on reuse after some circuits).
  // The start() cost is excluded from timing — only runSim() is measured.
  const times: number[] = [];
  for (let i = 0; i < WARMUP_RUNS + runs; i++) {
    const sim = new SimClass();
    await sim.start();
    sim.setNetList(adapted);
    const t0 = performance.now();
    await sim.runSim();
    const elapsed = performance.now() - t0;
    if (i >= WARMUP_RUNS) times.push(elapsed);
  }
  return median(times);
}

function timeNgspice(netlist: string): { analysis: number; total: number } | null {
  if (!USE_NGSPICE) return null;
  try {
    const r = runNgspice(netlist);
    return { analysis: r.analysisTimeMs, total: r.totalTimeMs };
  } catch {
    return null;
  }
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---------------------------------------------------------------------------
// Benchmark circuits
// ---------------------------------------------------------------------------
interface Circuit {
  name: string;
  category: string;
  nodes: number | string;
  netlist: string;
}

const circuits: Circuit[] = [
  // DC scalability
  { name: 'Resistor ladder', category: 'DC (.op)', nodes: 10, netlist: resistorLadder(10) },
  { name: 'Resistor ladder', category: 'DC (.op)', nodes: 100, netlist: resistorLadder(100) },
  { name: 'Resistor ladder', category: 'DC (.op)', nodes: 500, netlist: resistorLadder(500) },
  // Transient scalability
  { name: 'RC chain', category: 'Transient', nodes: 10, netlist: rcChain(10) },
  { name: 'RC chain', category: 'Transient', nodes: 50, netlist: rcChain(50) },
  { name: 'RC chain', category: 'Transient', nodes: 100, netlist: rcChain(100) },
  // AC scalability
  { name: 'RC chain', category: 'AC', nodes: 10, netlist: rcChainAC(10) },
  { name: 'RC chain', category: 'AC', nodes: 50, netlist: rcChainAC(50) },
  { name: 'RC chain', category: 'AC', nodes: 100, netlist: rcChainAC(100) },
  // Nonlinear
  { name: 'CMOS inv chain', category: 'Nonlinear', nodes: '5 stg', netlist: cmosInverterChain(5) },
  { name: 'CMOS inv chain', category: 'Nonlinear', nodes: '10 stg', netlist: cmosInverterChain(10) },
  { name: 'Ring oscillator', category: 'Nonlinear', nodes: '3 stg', netlist: cmosRingOscillator(3) },
  { name: 'Ring oscillator', category: 'Nonlinear', nodes: '5 stg', netlist: cmosRingOscillator(5) },
  { name: 'Ring oscillator', category: 'Nonlinear', nodes: '11 stg', netlist: cmosRingOscillator(11) },
  // LC ladder
  { name: 'LC ladder', category: 'Transient', nodes: 10, netlist: lcLadder(10) },
  { name: 'LC ladder', category: 'Transient', nodes: 50, netlist: lcLadder(50) },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  if (!JSON_MODE) {
    console.log('spice-ts Benchmark Comparison');
    console.log('=============================');
    console.log(`Date:         ${new Date().toISOString().split('T')[0]}`);
    console.log(`Node.js:      ${process.version}`);
    console.log(`eecircuit:    enabled (ngspice WASM)`);
    console.log(`ngspice:      ${USE_NGSPICE ? 'enabled (native)' : 'disabled'}`);
    console.log(`Runs:         ${BENCH_RUNS} (median)\n`);
  }

  // Load eecircuit-engine class (dynamic import for ESM-only package)
  if (!JSON_MODE) process.stdout.write('Loading eecircuit-engine (WASM)...');
  const { Simulation } = await import('eecircuit-engine');
  // Measure init cost once for reporting
  const eeInitT0 = performance.now();
  const warmSim = new Simulation();
  await warmSim.start();
  const eeInitMs = performance.now() - eeInitT0;
  if (!JSON_MODE) console.log(` done (init=${eeInitMs.toFixed(0)} ms)\n`);

  const results: BenchResult[] = [];

  for (const c of circuits) {
    if (!JSON_MODE) process.stdout.write(`  ${c.category.padEnd(12)} ${c.name} (${c.nodes})...`);

    let spiceTs: number;
    try {
      spiceTs = await timeSpiceTs(c.netlist, BENCH_RUNS);
    } catch {
      spiceTs = -1;
    }

    let eecircuit: number;
    try {
      eecircuit = await timeEEcircuit(Simulation, c.netlist, BENCH_RUNS);
    } catch (e) {
      if (!JSON_MODE) process.stdout.write(` [ee err: ${(e as Error).message?.slice(0, 40)}]`);
      eecircuit = -1;
    }

    const ng = timeNgspice(c.netlist);

    results.push({
      circuit: c.name,
      category: c.category,
      nodes: c.nodes,
      spiceTs,
      eecircuit,
      ngspiceAnalysis: ng?.analysis ?? null,
      ngspiceTotal: ng?.total ?? null,
    });

    if (!JSON_MODE) console.log(' done');
  }

  if (JSON_MODE) {
    console.log(JSON.stringify({ date: new Date().toISOString(), eeInitMs, results }, null, 2));
    return;
  }

  // Print markdown table
  console.log('\n## Results\n');
  printMarkdownTable(results);
}

function fmt(ms: number | null): string {
  if (ms === null || ms < 0) return '—';
  if (ms < 1) return `${(ms * 1000).toFixed(0)} us`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function ratio(a: number, b: number): string {
  if (a <= 0 || b <= 0) return '—';
  if (a < b) return `**${(b / a).toFixed(1)}x faster**`;
  if (a > b * 1.1) return `${(a / b).toFixed(1)}x slower`;
  return '~parity';
}

function printMarkdownTable(results: BenchResult[]): void {
  const hasNg = results.some(r => r.ngspiceAnalysis !== null);

  if (hasNg) {
    console.log('| Category | Circuit | Size | spice-ts | eecircuit (WASM) | ngspice (native) | spice-ts vs eecircuit |');
    console.log('|---|---|---|---|---|---|---|');
  } else {
    console.log('| Category | Circuit | Size | spice-ts | eecircuit (WASM) | spice-ts vs eecircuit |');
    console.log('|---|---|---|---|---|---|');
  }

  for (const r of results) {
    const cols = [
      r.category,
      r.circuit,
      String(r.nodes),
      fmt(r.spiceTs),
      fmt(r.eecircuit),
    ];
    if (hasNg) cols.push(fmt(r.ngspiceAnalysis));
    cols.push(ratio(r.spiceTs, r.eecircuit));
    console.log(`| ${cols.join(' | ')} |`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
