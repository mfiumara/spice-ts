#!/usr/bin/env tsx
/**
 * Issue #802 spike: end-to-end DC OP with the Rust LU swapped in.
 *
 * For each M2 OP deck (same decks as dump-matrices.ts) and backend, a fresh
 * child process runs parseAsync + simulate. For the Rust backends the
 * GilbertPeierlsSolver prototype is patched *in that child only* so that
 * analyzePattern/factorize/solve delegate to the napi-rs addon or the WASM
 * module; nothing in packages/core changes. Everything else (parser, device
 * load/stamping, Newton loop, CSC assembly) is the unchanged TypeScript.
 *
 * Reports median wall time of parse+simulate, time inside the LU calls, and
 * whether every node voltage is bit-identical to the TS-LU run.
 *
 * Prerequisites: bash benchmarks/rust-lu-spike/build.sh
 * Run (heavy): spice-heavy pnpm exec tsx benchmarks/rust-lu-spike/op-swap.ts
 *   [--decks=...] [--runs=5] [--warmups=5] [--slow-decks=cmos-chain-50k] [--output=path]
 * Slow decks run min(runs, 3) timed runs and no warm-up.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAsync, simulate } from '../../packages/core/src/index.js';
import { GilbertPeierlsSolver } from '../../packages/core/src/solver/gilbert-peierls.js';
import { SingularMatrixError, type MatrixVariableIdentity } from '../../packages/core/src/errors.js';
import type { CscMatrix } from '../../packages/core/src/solver/csc-matrix.js';
import { m2Netlist } from '../performance/scaling-m2-fixture.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const nodeRequire = createRequire(import.meta.url);
const args = process.argv.slice(2);
const arg = (name: string): string | undefined =>
  args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);

type Backend = 'ts' | 'rust-native' | 'rust-wasm';
const BACKENDS: Backend[] = ['ts', 'rust-native', 'rust-wasm'];
const ALL_DECKS = [
  'rc-ladder-1k', 'rc-ladder-10k', 'rc-ladder-50k',
  'resistor-mesh-1k', 'resistor-mesh-10k', 'resistor-mesh-50k',
  'cmos-chain-1k', 'cmos-chain-10k', 'cmos-chain-50k',
];
const SHORT_TO_CIRCUIT: Record<string, string> = {
  'rc-ladder': 'rc-ladder-tran', 'resistor-mesh': 'resistor-mesh-op', 'cmos-chain': 'cmos-inverter-chain-tran',
};

function opNetlist(deck: string): string {
  const m = /^(.*)-(\d+)k$/.exec(deck)!;
  const { netlist } = m2Netlist(SHORT_TO_CIRCUIT[m[1]], Number(m[2]) * 1000);
  return netlist.replace(/^\.tran .*$/m, '.op').replace(/^\.print .*$/m, '');
}

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

interface RustLuLike {
  analyze(c: Int32Array, r: Int32Array): void;
  factorize(v: Float64Array): void;
  solve(b: Float64Array): void;
  dispose?(): void; // napi addon
  free?(): void; // wasm-bindgen
}

let luMs = 0;
// Native/WASM solver memory is invisible to V8's GC, so solvers of finished
// runs are released explicitly before the next run (see docs/spikes/rust-lu.md).
const liveSolvers: RustLuLike[] = [];
function releaseSolvers(): void {
  for (const s of liveSolvers.splice(0)) {
    if (s.free) s.free();
    else s.dispose?.();
  }
}

/** Route GilbertPeierlsSolver through a Rust backend (this process only). */
function installRust(backend: Backend): void {
  const path = backend === 'rust-native'
    ? join(root, 'rust/target/spice_lu_node.node')
    : join(root, 'rust/target/wasm-pkg/spice_lu_wasm.js');
  const { RustLu } = nodeRequire(path) as { RustLu: new () => RustLuLike };
  type Self = { rust: RustLuLike; nnz: number; analyzed: boolean; variables: readonly MatrixVariableIdentity[] };
  const proto = GilbertPeierlsSolver.prototype as unknown as Record<string, unknown>;
  const singular = (self: Self, error: unknown): Error => {
    const column = /column (\d+)/.exec(String(error))?.[1];
    return column === undefined ? (error as Error) : SingularMatrixError.atPivot(Number(column), self.variables);
  };
  proto.analyzePattern = function (this: Self, A: CscMatrix, variables: readonly MatrixVariableIdentity[] = []): void {
    const t0 = performance.now();
    this.rust = new RustLu();
    liveSolvers.push(this.rust);
    this.nnz = A.colPtr[A.size];
    this.rust.analyze(A.colPtr.subarray(0, A.size + 1), A.rowIdx.subarray(0, this.nnz));
    this.analyzed = true;
    this.variables = variables;
    luMs += performance.now() - t0;
  };
  proto.factorize = function (this: Self, A: CscMatrix): void {
    const t0 = performance.now();
    try {
      this.rust.factorize(A.values.length === this.nnz ? A.values : A.values.subarray(0, this.nnz));
    } catch (error) {
      throw singular(this, error);
    } finally {
      luMs += performance.now() - t0;
    }
  };
  proto.solve = function (this: Self, b: Float64Array): Float64Array {
    const t0 = performance.now();
    try {
      this.rust.solve(b);
      return b;
    } catch (error) {
      throw singular(this, error);
    } finally {
      luMs += performance.now() - t0;
    }
  };
}

/** Time the stock TS LU calls the same way (wrapping, not replacing). */
function instrumentTs(): void {
  const proto = GilbertPeierlsSolver.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const name of ['analyzePattern', 'factorize', 'solve']) {
    const original = proto[name];
    proto[name] = function (this: unknown, ...a: unknown[]): unknown {
      const t0 = performance.now();
      try {
        return original.apply(this, a);
      } finally {
        luMs += performance.now() - t0;
      }
    };
  }
}

async function child(backend: Backend, deck: string, runs: number, warmups: number): Promise<unknown> {
  if (backend === 'ts') instrumentTs();
  else installRust(backend);
  const netlist = opNetlist(deck);
  const total: number[] = [];
  const lu: number[] = [];
  let voltages: [string, number][] = [];
  for (let run = 0; run < warmups + runs; run++) {
    releaseSolvers();
    luMs = 0;
    const t0 = performance.now();
    const result = await simulate(await parseAsync(netlist));
    const elapsed = performance.now() - t0;
    if (run >= warmups) { total.push(elapsed); lu.push(luMs); }
    const map = (result.dc as unknown as { voltageMap: Map<string, number> }).voltageMap;
    voltages = [...map.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1));
  }
  writeFileSync(join(here, 'matrices', `${deck}.op.${backend}.json`), JSON.stringify(voltages));
  return {
    backend, deck, runs, warmups, totalMs: total, luMs: lu,
    median: { totalMs: median(total), luMs: median(lu), nonLuMs: median(total.map((t, i) => t - lu[i])) },
    peakRssMiB: process.resourceUsage().maxRSS / 1024,
  };
}

function compare(deck: string, backend: Backend): { nodes: number; bitIdentical: number; maxAbsDiffV: number } {
  const load = (b: Backend): [string, number][] =>
    JSON.parse(readFileSync(join(here, 'matrices', `${deck}.op.${b}.json`), 'utf8')) as [string, number][];
  const ref = load('ts');
  const other = new Map(load(backend));
  let same = 0;
  let maxAbs = 0;
  for (const [name, v] of ref) {
    const o = other.get(name);
    if (o === undefined) { maxAbs = Infinity; continue; }
    if (Object.is(o, v)) same++;
    maxAbs = Math.max(maxAbs, Math.abs(o - v));
  }
  return { nodes: ref.length, bitIdentical: same, maxAbsDiffV: maxAbs };
}

async function parent(): Promise<void> {
  const decks = (arg('decks') ?? ALL_DECKS.join(',')).split(',');
  const runs = Number(arg('runs') ?? 5);
  // Five untimed OPs: on single-factorization decks the first runs still
  // measure V8 tiering of the TS kernel (the 50k mesh needed 3-4 runs).
  const warmups = Number(arg('warmups') ?? 5);
  // Decks whose single OP takes ~100 s in TS: fewer runs, no warm-up (the
  // >1000 Newton factorizations inside one OP already warm the JIT).
  const slow = new Set((arg('slow-decks') ?? 'cmos-chain-50k').split(',').filter(Boolean));
  const output = resolve(arg('output') ?? join(here, 'results/rust-lu-op-swap.json'));
  mkdirSync(join(here, 'matrices'), { recursive: true });
  const cells: Record<string, unknown>[] = [];
  for (const deck of decks) {
    for (const backend of BACKENDS) {
      const out = spawnSync(process.execPath, [
        ...process.execArgv, fileURLToPath(import.meta.url),
        `--child=${backend}`, `--deck=${deck}`,
        `--runs=${slow.has(deck) ? Math.min(runs, 3) : runs}`, `--warmups=${slow.has(deck) ? 0 : warmups}`,
      ], { encoding: 'utf8', maxBuffer: 64 << 20 });
      if (out.status !== 0) {
        cells.push({ backend, deck, status: 'failed', error: out.stderr.split('\n').slice(-20).join('\n') });
        console.error(`${deck} ${backend}: FAILED\n${out.stderr}`);
        continue;
      }
      const cell = JSON.parse(out.stdout) as Record<string, unknown>;
      if (backend !== 'ts') cell.vsTs = compare(deck, backend);
      cells.push({ status: 'ok', ...cell });
      console.error(`${deck} ${backend}: ${JSON.stringify(cell.median)} ${JSON.stringify(cell.vsTs ?? '')}`);
    }
  }
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    command: `spice-heavy pnpm exec tsx benchmarks/rust-lu-spike/op-swap.ts ${args.join(' ')}`.trim(),
    machine: { platform: `${process.platform} ${process.arch}`, cpu: cpus()[0]?.model, logicalCpus: cpus().length },
    versions: {
      node: process.version,
      rustc: spawnSync('rustc', ['--version'], { encoding: 'utf8' }).stdout.trim(),
      // Commit whose packages/core (solver, devices, Newton loop) the run used.
      gitHead: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: root }).stdout.trim(),
    },
    methodology: {
      runs, warmups, statistic: 'median',
      totalMs: 'parseAsync + simulate of the OP deck in a fresh child process per backend/deck',
      luMs: 'time inside analyzePattern/factorize/solve (TS: wrapped stock solver; Rust: delegating wrapper incl. marshalling)',
      swap: 'GilbertPeierlsSolver.prototype patched in the child only; packages/core is unchanged',
    },
    cells,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`wrote ${output}`);
}

const childBackend = arg('child') as Backend | undefined;
if (childBackend) {
  child(childBackend, arg('deck')!, Number(arg('runs')), Number(arg('warmups')))
    .then(r => process.stdout.write(JSON.stringify(r)))
    .catch((e: unknown) => { console.error(e); process.exit(1); });
} else {
  parent().catch((e: unknown) => { console.error(e); process.exit(1); });
}
