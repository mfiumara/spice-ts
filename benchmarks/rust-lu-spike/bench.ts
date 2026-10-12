#!/usr/bin/env tsx
/**
 * Issue #802 spike: TypeScript LU vs the Rust port (pure Rust, napi-rs addon,
 * wasm-bindgen WASM) on the real MNA matrices of the M2 scaling decks.
 *
 * Prerequisites: `bash benchmarks/rust-lu-spike/build.sh` and
 * `pnpm exec tsx benchmarks/rust-lu-spike/dump-matrices.ts`.
 * Run (heavy): `spice-heavy pnpm exec tsx benchmarks/rust-lu-spike/bench.ts`
 *   [--decks=a,b] [--runs=5] [--warmups=10] [--ngspice-runs=5] [--output=path]
 *
 * Every backend/deck cell runs in a fresh child process (peak RSS isolation).
 * Per run, a fresh solver does: symbolic (analyze), numeric factor of the
 * first OP Newton matrix, one solve, then a same-pattern factorize of the
 * refactor matrix (pivot reuse when the kernel allows it). Medians of `runs`
 * timed runs after `warmups` untimed ones. Times include the JS->native/WASM
 * call and argument marshalling for the native and WASM backends; `rust-pure`
 * is the Rust binary timing itself with no Node involved.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir, cpus, totalmem, release } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GilbertPeierlsSolver } from '../../packages/core/src/solver/gilbert-peierls.js';
import type { CscMatrix } from '../../packages/core/src/solver/csc-matrix.js';
import { m2Netlist } from '../performance/scaling-m2-fixture.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const matrixDir = join(here, 'matrices');
const nodeRequire = createRequire(import.meta.url);
const args = process.argv.slice(2);
const arg = (name: string): string | undefined =>
  args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const ALL_DECKS = [
  'rc-ladder-1k', 'rc-ladder-10k', 'rc-ladder-50k',
  'resistor-mesh-1k', 'resistor-mesh-10k', 'resistor-mesh-50k',
  'cmos-chain-1k', 'cmos-chain-10k', 'cmos-chain-50k',
];
type Backend = 'ts' | 'rust-native' | 'rust-wasm' | 'rust-pure';
const NODE_BACKENDS: Backend[] = ['ts', 'rust-native', 'rust-wasm'];

interface Csc { n: number; colPtr: Int32Array; rowIdx: Int32Array; values: Float64Array }

function readCsc(path: string): Csc {
  const lines = readFileSync(path, 'utf8').split('\n').filter(l => l && !l.startsWith('%'));
  const [n, , nnz] = lines[0].split(' ').map(Number);
  const colPtr = new Int32Array(n + 1);
  const rowIdx = new Int32Array(nnz);
  const values = new Float64Array(nnz);
  let lastCol = 0;
  let lastRow = -1;
  for (let p = 0; p < nnz; p++) {
    const [i, j, v] = lines[p + 1].split(' ');
    const row = Number(i) - 1;
    const col = Number(j) - 1;
    if (col < lastCol || (col === lastCol && row <= lastRow)) throw new Error(`${path}: not column-major sorted`);
    lastCol = col;
    lastRow = row;
    colPtr[col + 1]++;
    rowIdx[p] = row;
    values[p] = Number(v);
  }
  for (let j = 0; j < n; j++) colPtr[j + 1] += colPtr[j];
  return { n, colPtr, rowIdx, values };
}

function readVector(path: string): Float64Array {
  const lines = readFileSync(path, 'utf8').split('\n').filter(l => l && !l.startsWith('%'));
  return Float64Array.from(lines.slice(1), Number);
}

/**
 * The OP RHS is all-zero for the RC ladder (its PULSE source is 0 at t=0), so
 * x = 0 and the accuracy check would be vacuous. Use a deterministic
 * synthetic RHS then; spice-lu-bench applies the identical formula.
 */
function effectiveRhs(b: Float64Array): { b: Float64Array; synthetic: boolean } {
  if (b.some(v => v !== 0)) return { b, synthetic: false };
  return { b: Float64Array.from(b, (_, i) => ((i * 7919) % 1000) / 1000 - 0.5), synthetic: true };
}

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Common surface over the three in-Node backends. */
interface LuBackend {
  analyze(a: Csc): void;
  factorize(values: Float64Array): void;
  solve(b: Float64Array): void;
  refactorCount(): number;
  factorNonzeros(): number;
  heapBytes(): number;
  colPerm(): Int32Array;
  /** Free native/WASM memory of a solver the harness is done with. */
  dispose(): void;
}

function tsBackend(): () => LuBackend {
  return () => {
    const s = new GilbertPeierlsSolver();
    let a: CscMatrix | null = null;
    const priv = s as unknown as Record<string, unknown>;
    return {
      analyze(m) { a = { size: m.n, colPtr: m.colPtr, rowIdx: m.rowIdx, values: m.values }; s.analyzePattern(a); },
      // Same structure arrays every call, so the TS pivot-reuse path is eligible.
      factorize(values) { s.factorize({ ...a!, values }); },
      solve(b) { s.solve(b); },
      refactorCount: () => s.pivotReuseFactorizations,
      factorNonzeros: () => s.factorNonzeros(),
      heapBytes: () => Object.values(priv).reduce<number>(
        (sum, v) => sum + (ArrayBuffer.isView(v) ? v.byteLength : 0), 0),
      colPerm: () => priv.colPerm as Int32Array,
      dispose: () => undefined,
    };
  };
}

function nativeBackend(): { make: () => LuBackend; probe: (v: Float64Array) => number } {
  const mod = nodeRequire(join(root, 'rust/target/spice_lu_node.node')) as {
    RustLu: new () => {
      analyze(c: Int32Array, r: Int32Array): void; factorize(v: Float64Array): void; solve(b: Float64Array): void;
      refactorCount: number; factorNonzeros: number; heapBytes: number; colPerm(): Int32Array; dispose(): void;
    };
    marshalProbe(v: Float64Array): number;
  };
  return {
    make: () => {
      const s = new mod.RustLu();
      return {
        analyze: m => s.analyze(m.colPtr, m.rowIdx),
        factorize: v => s.factorize(v),
        solve: b => s.solve(b),
        refactorCount: () => s.refactorCount,
        factorNonzeros: () => s.factorNonzeros,
        heapBytes: () => s.heapBytes,
        colPerm: () => s.colPerm(),
        dispose: () => s.dispose(),
      };
    },
    probe: v => mod.marshalProbe(v),
  };
}

function wasmBackend(): { make: () => LuBackend; probe: (v: Float64Array) => number; memoryBytes: () => number } {
  const mod = nodeRequire(join(root, 'rust/target/wasm-pkg/spice_lu_wasm.js')) as {
    RustLu: new () => {
      analyze(c: Int32Array, r: Int32Array): void; factorize(v: Float64Array): void; solve(b: Float64Array): void;
      refactorCount: number; factorNonzeros: number; heapBytes: number; colPerm(): Int32Array; free(): void;
    };
    marshalProbe(v: Float64Array): number;
    linearMemoryBytes(): number;
  };
  return {
    make: () => {
      const s = new mod.RustLu();
      return {
        analyze: m => s.analyze(m.colPtr, m.rowIdx),
        factorize: v => s.factorize(v),
        solve: b => s.solve(b),
        refactorCount: () => s.refactorCount,
        factorNonzeros: () => s.factorNonzeros,
        heapBytes: () => s.heapBytes,
        colPerm: () => Int32Array.from(s.colPerm()),
        dispose: () => s.free(),
      };
    },
    probe: v => mod.marshalProbe(v),
    memoryBytes: () => mod.linearMemoryBytes(),
  };
}

interface CellResult {
  backend: Backend; deck: string; n: number; nnz: number; luNnz: number;
  runs: number; warmups: number;
  symbolicMs: number[]; factorMs: number[]; solveMs: number[]; refactorMs: number[]; refactorPerturbedMs: number[];
  median: { symbolic: number; factor: number; solve: number; refactor: number; refactorPerturbed: number; marshal?: number };
  refactorReusedPivots: boolean; refactorPerturbedReusedPivots: boolean; relResidual: number; syntheticRhs: boolean;
  solverHeapBytes: number; wasmLinearMemoryBytes?: number; peakRssMiB?: number;
  colPermSha?: string;
}

function relResidual(a: Csc, x: Float64Array, b: Float64Array): number {
  const ax = new Float64Array(a.n);
  for (let j = 0; j < a.n; j++) {
    for (let p = a.colPtr[j]; p < a.colPtr[j + 1]; p++) ax[a.rowIdx[p]] += a.values[p] * x[j];
  }
  let r = 0;
  let bn = 0;
  for (let i = 0; i < a.n; i++) { r += (ax[i] - b[i]) ** 2; bn += b[i] ** 2; }
  return Math.sqrt(r) / Math.sqrt(bn);
}

async function child(backend: Backend, deck: string, runs: number, warmups: number): Promise<CellResult> {
  const a = readCsc(join(matrixDir, `${deck}.first.A.mtx`));
  const { b, synthetic } = effectiveRhs(readVector(join(matrixDir, `${deck}.first.b.mtx`)));
  const r = readCsc(join(matrixDir, `${deck}.refactor.A.mtx`));
  const rp = readCsc(join(matrixDir, `${deck}.perturbed.A.mtx`));
  let make: () => LuBackend;
  let probe: ((v: Float64Array) => number) | undefined;
  let memoryBytes: (() => number) | undefined;
  if (backend === 'ts') make = tsBackend();
  else if (backend === 'rust-native') ({ make, probe } = nativeBackend());
  else ({ make, probe, memoryBytes } = wasmBackend());

  const sym: number[] = []; const fac: number[] = []; const sol: number[] = []; const ref: number[] = [];
  const refP: number[] = [];
  let reused = true;
  let reusedP = true;
  let x = new Float64Array(a.n);
  let solver: LuBackend | null = null;
  for (let run = 0; run < warmups + runs; run++) {
    solver?.dispose();
    solver = make();
    let t = performance.now();
    solver.analyze(a);
    const tSym = performance.now() - t;
    t = performance.now();
    solver.factorize(a.values);
    const tFac = performance.now() - t;
    x = b.slice();
    t = performance.now();
    solver.solve(x);
    const tSol = performance.now() - t;
    const before = solver.refactorCount();
    t = performance.now();
    solver.factorize(r.values);
    const tRef = performance.now() - t;
    reused &&= solver.refactorCount() === before + 1;
    // Pivot-reuse kernel on its own: re-factor the first matrix (resets the
    // factors to its pivots), then factor its perturbed copy.
    solver.factorize(a.values);
    const beforeP = solver.refactorCount();
    t = performance.now();
    solver.factorize(rp.values);
    const tRefP = performance.now() - t;
    reusedP &&= solver.refactorCount() === beforeP + 1;
    if (run >= warmups) { sym.push(tSym); fac.push(tFac); sol.push(tSol); ref.push(tRef); refP.push(tRefP); }
  }
  // x is the solution of the first system from the last timed run.
  writeFileSync(join(matrixDir, `${deck}.x.${backend}.f64`), new Uint8Array(x.buffer));
  let marshal: number | undefined;
  if (probe) {
    const samples: number[] = [];
    for (let i = 0; i < warmups + runs; i++) {
      const t = performance.now();
      probe(a.values);
      if (i >= warmups) samples.push(performance.now() - t);
    }
    marshal = median(samples);
  }
  const { createHash } = await import('node:crypto');
  const perm = solver!.colPerm();
  return {
    backend, deck, n: a.n, nnz: a.colPtr[a.n], luNnz: solver!.factorNonzeros(), runs, warmups,
    symbolicMs: sym, factorMs: fac, solveMs: sol, refactorMs: ref, refactorPerturbedMs: refP,
    median: {
      symbolic: median(sym), factor: median(fac), solve: median(sol), refactor: median(ref),
      refactorPerturbed: median(refP), marshal,
    },
    refactorReusedPivots: reused, refactorPerturbedReusedPivots: reusedP, relResidual: relResidual(a, x, b), syntheticRhs: synthetic,
    solverHeapBytes: solver!.heapBytes(), wasmLinearMemoryBytes: memoryBytes?.(),
    // Node documents maxRSS in KiB; includes the runtime and the parsed matrices.
    peakRssMiB: process.resourceUsage().maxRSS / 1024,
    colPermSha: createHash('sha256').update(new Uint8Array(perm.buffer, perm.byteOffset, perm.byteLength)).digest('hex'),
  };
}

function runPure(deck: string, runs: number): CellResult {
  const bin = join(root, 'rust/target/release/spice-lu-bench');
  const out = spawnSync(bin, [matrixDir, String(runs), deck], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (out.status !== 0) throw new Error(`spice-lu-bench failed: ${out.stderr}`);
  const j = JSON.parse(out.stdout) as Record<string, unknown> & {
    symbolicMs: number[]; factorMs: number[]; solveMs: number[]; refactorMs: number[]; refactorPerturbedMs: number[];
  };
  return {
    backend: 'rust-pure', deck, n: j.n as number, nnz: j.nnz as number, luNnz: j.luNnz as number,
    runs, warmups: 1,
    symbolicMs: j.symbolicMs, factorMs: j.factorMs, solveMs: j.solveMs, refactorMs: j.refactorMs,
    refactorPerturbedMs: j.refactorPerturbedMs,
    median: {
      symbolic: median(j.symbolicMs), factor: median(j.factorMs), solve: median(j.solveMs), refactor: median(j.refactorMs),
      refactorPerturbed: median(j.refactorPerturbedMs),
    },
    refactorReusedPivots: j.refactorReusedPivots as boolean,
    refactorPerturbedReusedPivots: j.refactorPerturbedReusedPivots as boolean, relResidual: j.relResidual as number,
    syntheticRhs: j.syntheticRhs as boolean,
    solverHeapBytes: j.heapBytes as number,
  };
}

// ---------------------------------------------------------------- ngspice --

const SHORT_TO_CIRCUIT: Record<string, string> = {
  'rc-ladder': 'rc-ladder-tran', 'resistor-mesh': 'resistor-mesh-op', 'cmos-chain': 'cmos-inverter-chain-tran',
};

function deckNetlist(deck: string): string {
  const m = /^(.*)-(\d+)k$/.exec(deck)!;
  const { netlist } = m2Netlist(SHORT_TO_CIRCUIT[m[1]], Number(m[2]) * 1000);
  // Same OP deck the matrices were dumped from (dump-matrices.ts opDeck()).
  return netlist.replace(/^\.tran .*$/m, '.op').replace(/^\.print .*$/m, '');
}

interface NgspiceCell {
  deck: string; solver: 'klu' | 'sparse'; runs: number;
  totalAnalysisMs: number[]; median: Record<string, number>; error?: string;
}

function ngspiceOp(deck: string, solver: 'klu' | 'sparse', runs: number): NgspiceCell {
  const dir = mkdtempSync(join(tmpdir(), 'spice-lu-802-'));
  const file = join(dir, `${deck}.cir`);
  writeFileSync(file, deckNetlist(deck));
  writeFileSync(join(dir, '.spiceinit'), `option ${solver}\n`);
  const phases: Record<string, number[]> = { total: [], reorder: [], factor: [], solve: [], load: [] };
  const re: Record<string, RegExp> = {
    total: /Total analysis time \(seconds\)\s*=\s*([\d.eE+-]+)/,
    reorder: /Matrix reorder time\s*=\s*([\d.eE+-]+)/,
    factor: /Matrix factor time\s*=\s*([\d.eE+-]+)/,
    solve: /Matrix solve time\s*=\s*([\d.eE+-]+)/,
    load: /Matrix load time\s*=\s*([\d.eE+-]+)/,
  };
  try {
    for (let i = 0; i < runs; i++) {
      const out = spawnSync('ngspice', ['-b', file], { cwd: dir, encoding: 'utf8', maxBuffer: 256 << 20, timeout: 600_000 });
      const text = `${out.stdout}\n${out.stderr}`;
      if (out.status !== 0) throw new Error(`ngspice exited ${out.status}`);
      const used = /Using (\S+)[^\n]* as Direct Linear Solver/.exec(text)?.[1] ?? '';
      if (!used.toUpperCase().startsWith(solver.toUpperCase())) throw new Error(`ngspice used '${used}'`);
      for (const [k, r] of Object.entries(re)) {
        const m = r.exec(text);
        if (m) phases[k].push(Number(m[1]) * 1000);
      }
    }
    const med: Record<string, number> = {};
    for (const [k, v] of Object.entries(phases)) if (v.length) med[k] = median(v);
    return { deck, solver, runs, totalAnalysisMs: phases.total, median: med };
  } catch (error) {
    return { deck, solver, runs, totalAnalysisMs: [], median: {}, error: String(error) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------ comparison --

function compareX(deck: string, backend: Backend): { maxRelDiff: number; bitIdentical: number; n: number } | null {
  const ref = join(matrixDir, `${deck}.x.ts.f64`);
  const other = join(matrixDir, `${deck}.x.${backend}.f64`);
  if (!existsSync(ref) || !existsSync(other)) return null;
  const toF64 = (p: string): Float64Array => { const b = readFileSync(p); return new Float64Array(b.buffer, b.byteOffset, b.byteLength / 8); };
  const xs = toF64(ref);
  const xo = toF64(other);
  let inf = 0;
  for (const v of xs) inf = Math.max(inf, Math.abs(v));
  // Relative per entry, floored at 1e-12 * ||x_ts||_inf for near-zero entries.
  const floor = 1e-12 * inf || Number.MIN_VALUE;
  let maxRel = 0;
  let same = 0;
  for (let i = 0; i < xs.length; i++) {
    if (Object.is(xs[i], xo[i])) same++;
    maxRel = Math.max(maxRel, Math.abs(xo[i] - xs[i]) / Math.max(Math.abs(xs[i]), floor));
  }
  return { maxRelDiff: maxRel, bitIdentical: same, n: xs.length };
}

async function parent(): Promise<void> {
  const decks = (arg('decks') ?? ALL_DECKS.join(',')).split(',');
  const runs = Number(arg('runs') ?? 5);
  // Ten untimed runs let V8 tier the TS kernel up (a real simulation calls
  // factorize hundreds of times); fewer would understate TS on small decks.
  const warmups = Number(arg('warmups') ?? 10);
  const ngRuns = Number(arg('ngspice-runs') ?? 5);
  const output = resolve(arg('output') ?? join(here, 'results/rust-lu-spike.json'));
  const cells: CellResult[] = [];
  const ngspice: NgspiceCell[] = [];
  for (const deck of decks) {
    for (const backend of NODE_BACKENDS) {
      const out = spawnSync(process.execPath, [
        ...process.execArgv, fileURLToPath(import.meta.url),
        `--child=${backend}`, `--deck=${deck}`, `--runs=${runs}`, `--warmups=${warmups}`,
      ], { encoding: 'utf8', maxBuffer: 64 << 20 });
      if (out.status !== 0) throw new Error(`${backend}/${deck} failed:\n${out.stderr}`);
      cells.push(JSON.parse(out.stdout) as CellResult);
      console.error(`${deck} ${backend}: ${JSON.stringify(cells[cells.length - 1].median)}`);
    }
    cells.push(runPure(deck, runs));
    console.error(`${deck} rust-pure: ${JSON.stringify(cells[cells.length - 1].median)}`);
    for (const solver of ['klu', 'sparse'] as const) {
      ngspice.push(ngspiceOp(deck, solver, ngRuns));
      console.error(`${deck} ngspice ${solver}: ${JSON.stringify(ngspice[ngspice.length - 1].median)}`);
    }
  }
  const tsPerm = new Map(cells.filter(c => c.backend === 'ts').map(c => [c.deck, c.colPermSha]));
  const accuracy = cells.filter(c => c.backend !== 'ts' && c.backend !== 'rust-pure')
    .map(c => ({
      deck: c.deck, backend: c.backend, colPermMatchesTs: c.colPermSha === tsPerm.get(c.deck),
      ...compareX(c.deck, c.backend),
    }));
  const meta = decks.map(d => JSON.parse(readFileSync(join(matrixDir, `${d}.json`), 'utf8')) as Record<string, unknown>);
  const ngVersion = spawnSync('ngspice', ['-v'], { encoding: 'utf8' }).stdout.match(/ngspice-\d+/)?.[0];
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    command: `spice-heavy pnpm exec tsx benchmarks/rust-lu-spike/bench.ts ${args.join(' ')}`.trim(),
    machine: { platform: `${process.platform} ${process.arch}`, cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem(), osRelease: release() },
    versions: {
      node: process.version, ngspice: ngVersion,
      rustc: spawnSync('rustc', ['--version'], { encoding: 'utf8' }).stdout.trim(),
      // Commit whose packages/core/src/solver the TS backend ran.
      gitHead: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: root }).stdout.trim(),
    },
    methodology: {
      runs, warmups, statistic: 'median of timed runs (raw samples retained)',
      tsSolver: 'packages/core/src/solver/gilbert-peierls.ts loaded from source via tsx',
      rustNative: 'napi-rs cdylib, zero-copy typed-array borrows',
      rustWasm: 'wasm-bindgen --target nodejs, wasm32-unknown-unknown +simd128, slices copied into linear memory per call',
      rustPure: 'rust/target/release/spice-lu-bench, no Node (1 warm-up run)',
      refactor: 'factorize() of the refactor matrix (last OP Newton matrix, or a perturbed first matrix for linear decks) on the same pattern; refactorReusedPivots tells whether pivot reuse succeeded or the kernel fell back to a full factorization',
      refactorPerturbed: 'factorize() of the first matrix with a deterministic +-3e-6 relative perturbation right after factoring the first matrix: isolates the pivot-reuse kernel',
      ngspice: 'ngspice -b on the OP deck, option klu|sparse via .spiceinit, Total analysis time and matrix phases from .options acct',
    },
    opProfile: meta,
    cells, accuracy, ngspice,
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
