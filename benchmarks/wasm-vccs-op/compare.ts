#!/usr/bin/env tsx
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSpiceEngine } from '../../packages/wasm/dist/index.js';
import { parseNgspiceRaw } from '../comparison-harness.js';

const directory = dirname(fileURLToPath(import.meta.url));
const reportPath = resolve(directory, 'report.json');
const fixturePaths = readdirSync(directory)
  .filter(name => name.endsWith('.cir'))
  .sort()
  .map(name => resolve(directory, name));
const repetitions = 5;
const relativeErrorFloor = 1e-12;

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
    const temporary = mkdtempSync(join(tmpdir(), 'wasm-vccs-op-'));
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
  const baseline = { workerJs: 396492, indexJs: 42894, denseSolverWasm: 2900 };
  const current = {
    workerJs: readFileSync(resolve(directory, '../../packages/wasm/dist/worker.js')).byteLength,
    indexJs: readFileSync(resolve(directory, '../../packages/wasm/dist/index.js')).byteLength,
    denseSolverWasm: readFileSync(resolve(directory, '../../packages/wasm/dist/dense-solver.wasm')).byteLength,
  };
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    fixtures: fixturePaths.map(path => {
      const source = readFileSync(path, 'utf8');
      return {
        path: `benchmarks/wasm-vccs-op/${basename(path)}`,
        sha256: sha256(source),
        bytes: Buffer.byteLength(source),
        identicalInputBytes: true,
        source: 'project-authored',
        licence: 'MIT',
      };
    }),
    methodology: {
      repetitions,
      timing: 'fresh WASM Node process for the three-fixture suite versus three fresh native ngspice processes per suite sample; includes parse, setup, solve, and serialization',
      matching: 'same OP scalar vectors from byte-identical netlists; no interpolation',
      relativeErrorFloor,
      tolerances: 'no per-circuit tuning; simulator defaults',
    },
    versions: {
      spiceTsBaseRevision: version('git', ['rev-parse', 'HEAD']),
      node: process.version,
      pnpm: version('pnpm', ['--version']),
      ngspice: version('ngspice', ['--version']),
    },
    machine: {
      platform: `${process.platform} ${process.arch}`,
      os: version('uname', ['-srv']),
      cpu: process.platform === 'darwin' ? version('sysctl', ['-n', 'machdep.cpu.brand_string']) : 'not measured',
    },
    commands: {
      build: 'pnpm -C packages/wasm build',
      wasm: 'pnpm exec tsx benchmarks/wasm-vccs-op/compare.ts --child=wasm',
      ngspice: 'ngspice -b -r <raw> <identical-netlist>',
      reproduce: 'pnpm --filter @spice-ts/wasm bench:vccs-op',
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
      baselineRevision: '931c94721ed15e0eb04b8c8a00d2bcfa01e4b888',
      baseline,
      current,
      delta: Object.fromEntries(Object.keys(baseline).map(name => [
        name, current[name as keyof typeof current] - baseline[name as keyof typeof baseline],
      ])),
      note: 'baseline was rebuilt from the exact issue branch base with the frozen lockfile; ABI version and fixed three-page memory are preserved',
    },
    exclusions: [],
    retainedLosses: [
      'Fresh-process WASM suite timing includes pnpm, tsx, and Node startup and loses to native ngspice; this is not a speed claim.',
      'The bounded backend supports only six-token linear G elements in OP and rejects VCCS AC, transient, POLY, behavioral, and nonlinear forms.',
      'The backend remains limited to 64 numeric unknowns, 256 components, and three fixed WebAssembly memory pages.',
      'TypeScript still performs bounded parsing and stamps existing R/I/V primitives; each VCCS stamp and dense solve executes inside the verified WebAssembly artifact.',
      'Relative errors at zero-valued references use the declared 1e-12 denominator floor.',
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
