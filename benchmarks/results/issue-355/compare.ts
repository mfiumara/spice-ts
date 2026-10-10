#!/usr/bin/env tsx
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSpiceEngine } from '../../../packages/wasm/dist/index.js';
import { parseNgspiceRaw } from '../../comparison-harness.js';
import {
  readRevisionContext,
  resolveMeasuredRevision,
} from './receipt-revision.js';

const directory = dirname(fileURLToPath(import.meta.url));
const reportPath = resolve(directory, 'report.json');
const fixturePaths = readdirSync(directory)
  .filter(name => name.endsWith('.cir'))
  .sort()
  .map(name => resolve(directory, name));
const repetitions = 5;
const relativeErrorFloor = 1e-12;
const baselineRevision = '1c2c8985e47f3030396a1fc3da5fd47db50dc330';
const baseline = { workerJs: 426_042, indexJs: 43_043, denseSolverWasm: 3_506 };

type FixtureResult = {
  name: string;
  vectors: Record<string, number>;
};
type SuiteRun = {
  wallMs: number;
  fixtures: FixtureResult[];
};

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function version(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  if (command === 'ngspice') return output.match(/ngspice-\d+[^\n]*/i)?.[0] ?? 'unavailable';
  return output.split('\n')[0] ?? 'unavailable';
}

async function wasmChild(): Promise<void> {
  const engine = await createSpiceEngine({ backend: 'spice-ts-wasm' });
  try {
    const fixtures: FixtureResult[] = [];
    for (const fixturePath of fixturePaths) {
      const source = readFileSync(fixturePath, 'utf8');
      const result = await engine.simulate(
        { apiVersion: '1', input: { format: 'spice', source } },
        { requestId: `benchmark-${basename(fixturePath, '.cir')}` },
      );
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      const op = result.data.analyses[0];
      if (op?.type !== 'op') throw new Error(`${fixturePath} returned no OP analysis`);
      const vectors: Record<string, number> = {};
      for (const [name, value] of Object.entries(op.voltagesV)) vectors[`v(${name.toLowerCase()})`] = value;
      for (const [name, value] of Object.entries(op.currentsA)) vectors[`i(${name.toLowerCase()})`] = value;
      fixtures.push({ name: basename(fixturePath), vectors });
    }
    process.stdout.write(JSON.stringify(fixtures));
  } finally {
    await engine.close();
  }
}

function runWasm(): SuiteRun {
  const started = performance.now();
  const result = spawnSync('pnpm', ['exec', 'tsx', fileURLToPath(import.meta.url), '--child=wasm'], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120_000,
  });
  const wallMs = performance.now() - started;
  if (result.status !== 0) throw new Error(`WASM child failed: ${result.stderr}`);
  return { wallMs, fixtures: JSON.parse(result.stdout) as FixtureResult[] };
}

function ngspiceVector(signals: Record<string, Array<{ re: number }>>, vector: string): number {
  const direct = signals[vector]?.[0]?.re;
  if (direct !== undefined) return direct;
  const current = vector.match(/^i\((.+)\)$/)?.[1];
  const branch = current ? signals[`${current}#branch`]?.[0]?.re : undefined;
  if (branch !== undefined) return branch;
  throw new Error(`ngspice omitted ${vector}`);
}

function runNgspice(vectorShapes: FixtureResult[]): SuiteRun {
  const started = performance.now();
  const fixtures = fixturePaths.map((fixturePath, fixtureIndex) => {
    const source = readFileSync(fixturePath, 'utf8');
    const temporary = mkdtempSync(join(tmpdir(), 'wasm-vcvs-op-'));
    const netlist = join(temporary, basename(fixturePath));
    const raw = join(temporary, 'op.raw');
    writeFileSync(netlist, source);
    writeFileSync(join(temporary, '.spiceinit'), 'set filetype=ascii\n');
    try {
      const result = spawnSync('ngspice', ['-b', '-r', raw, netlist], {
        encoding: 'utf8', env: { ...process.env, HOME: temporary }, timeout: 120_000,
      });
      if (result.status !== 0) throw new Error(`ngspice failed for ${fixturePath}: ${result.stderr}`);
      const plot = parseNgspiceRaw(readFileSync(raw, 'utf8'))
        .find(candidate => candidate.plotName.toLowerCase().includes('operating point'));
      if (!plot) throw new Error(`ngspice returned no OP plot for ${fixturePath}`);
      const vectors = Object.fromEntries(Object.keys(vectorShapes[fixtureIndex]!.vectors).map(vector => [
        vector, ngspiceVector(plot.signals, vector),
      ]));
      return { name: basename(fixturePath), vectors };
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
  return { wallMs: performance.now() - started, fixtures };
}

function metric(reference: number, actual: number) {
  const absoluteError = Math.abs(actual - reference);
  return { absoluteError, relativeError: absoluteError / Math.max(Math.abs(reference), relativeErrorFloor) };
}

async function main(): Promise<void> {
  const revisionContext = readRevisionContext();
  const ngspiceVersion = version('ngspice', ['--version']);
  if (!/^ngspice-47\b/i.test(ngspiceVersion)) {
    throw new Error(`issue #355 requires ngspice-47, observed '${ngspiceVersion}'`);
  }
  const wasmRuns = Array.from({ length: repetitions }, runWasm);
  const ngspiceRuns = Array.from({ length: repetitions }, () => runNgspice(wasmRuns[0]!.fixtures));
  const wasm = wasmRuns[0]!.fixtures;
  const ngspice = ngspiceRuns[0]!.fixtures;
  const errors: Array<{ fixture: string; vector: string; reference: number; actual: number; absoluteError: number; relativeError: number }> = [];
  for (const [fixtureIndex, fixture] of wasm.entries()) {
    const reference = ngspice[fixtureIndex]!;
    for (const [vector, actual] of Object.entries(fixture.vectors)) {
      const referenceValue = reference.vectors[vector]!;
      errors.push({ fixture: fixture.name, vector, reference: referenceValue, actual, ...metric(referenceValue, actual) });
    }
  }
  const rms = (values: number[]) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
  const wasmTimes = wasmRuns.map(run => run.wallMs);
  const ngspiceTimes = ngspiceRuns.map(run => run.wallMs);
  const wasmMedian = median(wasmTimes);
  const ngspiceMedian = median(ngspiceTimes);
  const current = {
    workerJs: readFileSync(resolve(directory, '../../../packages/wasm/dist/worker.js')).byteLength,
    indexJs: readFileSync(resolve(directory, '../../../packages/wasm/dist/index.js')).byteLength,
    denseSolverWasm: readFileSync(resolve(directory, '../../../packages/wasm/dist/dense-solver.wasm')).byteLength,
  };
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    issue: 355,
    fixtures: fixturePaths.map(path => {
      const source = readFileSync(path, 'utf8');
      return {
        path: `benchmarks/results/issue-355/${basename(path)}`,
        sha256: sha256(source),
        bytes: Buffer.byteLength(source),
        identicalInputBytes: true,
        source: 'project-authored',
        licence: 'MIT',
      };
    }),
    methodology: {
      repetitions,
      wasmProcessBoundary: 'one fresh pnpm+tsx+Node process for the three-fixture suite; includes worker construction, verified artifact transfer, parse, native WASM stamp and solve, and serialization',
      ngspiceProcessBoundary: 'one fresh native ngspice process per fixture, three processes per suite sample; includes parse, setup, solve, and raw-file serialization',
      matching: 'same OP scalar vectors from byte-identical netlists; no interpolation',
      relativeErrorFloor,
      tolerances: 'no per-circuit tuning; simulator defaults',
    },
    versions: {
      spiceTsBaseRevision: baselineRevision,
      measuredRevision: resolveMeasuredRevision(revisionContext),
      node: process.version,
      pnpm: version('pnpm', ['--version']),
      ngspice: ngspiceVersion,
    },
    machine: {
      platform: `${process.platform} ${process.arch}`,
      os: version('uname', ['-srv']),
      cpu: process.platform === 'darwin' ? version('sysctl', ['-n', 'machdep.cpu.brand_string']) : 'not measured',
    },
    commands: {
      build: 'pnpm -C packages/wasm build',
      wasm: 'pnpm exec tsx benchmarks/results/issue-355/compare.ts --child=wasm',
      ngspice: 'ngspice -b -r <raw> <identical-netlist>',
      reproduce: 'pnpm --filter @spice-ts/wasm bench:vcvs-op',
      verify: 'pnpm --filter @spice-ts/wasm bench:vcvs-op:check',
    },
    convergence: Object.fromEntries(wasm.map(fixture => [fixture.name, { wasm: 'complete', ngspice: 'complete' }])),
    counts: {
      fixtureCount: wasm.length,
      wasmOpPointCount: wasm.length,
      ngspiceOpPointCount: ngspice.length,
      vectorCount: errors.length,
      matchedScalarCount: errors.length,
    },
    errors: {
      aggregate: {
        maximumAbsoluteError: Math.max(...errors.map(value => value.absoluteError)),
        rmsAbsoluteError: rms(errors.map(value => value.absoluteError)),
        maximumRelativeError: Math.max(...errors.map(value => value.relativeError)),
        rmsRelativeError: rms(errors.map(value => value.relativeError)),
      },
      perVector: errors,
    },
    performance: {
      wasmSuiteWallMs: { samples: wasmTimes, median: wasmMedian },
      ngspiceSuiteWallMs: { samples: ngspiceTimes, median: ngspiceMedian },
      wasmLoss: { ratio: wasmMedian / ngspiceMedian, percent: (wasmMedian / ngspiceMedian - 1) * 100 },
    },
    artifactSizesBytes: {
      baselineRevision,
      baseline,
      current,
      delta: Object.fromEntries(Object.keys(baseline).map(name => [
        name, current[name as keyof typeof current] - baseline[name as keyof typeof baseline],
      ])),
      note: 'baseline was built from the exact issue branch base with the frozen lockfile; ABI version and fixed three-page memory are preserved',
    },
    exclusions: [],
    retainedLosses: [
      'Fresh-process WASM suite timing includes pnpm, tsx, Node, worker startup, artifact verification, parse, stamp, solve, and serialization; it is not a kernel speed claim.',
      'The bounded backend supports only six-token linear E elements in OP and rejects VCVS AC, DC, transient, POLY, behavioral, and nonlinear forms.',
      'Each VCVS adds one branch unknown; the backend remains limited to 64 numeric unknowns, 256 components, and three fixed WebAssembly memory pages.',
      'TypeScript performs bounded parsing and stamps R/I/V primitives; VCCS, CCCS, and VCVS stamps plus the dense solve execute inside the verified WebAssembly artifact.',
      'Relative errors at zero-valued references use the declared 1e-12 denominator floor.',
      'The worker, facade, and WebAssembly artifact size deltas are retained without a superiority claim.',
    ],
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv.includes('--child=wasm')) {
  wasmChild().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
