#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSpiceEngine } from '../../packages/wasm/dist/index.js';
import { parseNgspiceRaw } from '../comparison-harness.js';

type Series = { grid: number[]; signals: Record<string, number[]> };
type Fixture = { name: string; path: string; signals: string[] };
type TimedRun = { runtimeMs: number; series: Series };

const directory = dirname(fileURLToPath(import.meta.url));
const scriptPath = fileURLToPath(import.meta.url);
const reportPath = join(directory, 'report.json');
const repetitions = 5;
const relativeZeroThreshold = 1e-15;
const fixtures: Fixture[] = [
  { name: 'voltage-divider', path: join(directory, 'voltage-divider.cir'), signals: ['v(in)', 'v(out)', 'i(vdrive)'] },
  { name: 'current-source', path: join(directory, 'current-source.cir'), signals: ['v(out)'] },
];

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function toolVersion(command: string, args: string[], pattern?: RegExp): string {
  const run = spawnSync(command, args, { encoding: 'utf8' });
  const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`.trim();
  return pattern?.exec(output)?.[0] ?? output.split('\n').find(Boolean) ?? 'unavailable';
}

async function wasmChild(fixturePath: string): Promise<void> {
  const source = readFileSync(fixturePath, 'utf8');
  const engine = await createSpiceEngine({ backend: 'spice-ts-wasm' });
  try {
    const result = await engine.simulate(
      { apiVersion: '1', input: { format: 'spice', source } },
      { requestId: `benchmark-${basename(fixturePath)}` },
    );
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const analysis = result.data.analyses[0];
    if (analysis?.type !== 'dc') throw new Error('WASM backend returned no DC analysis');
    const signals: Record<string, number[]> = {};
    for (const [name, values] of Object.entries(analysis.voltagesV)) signals[`v(${name.toLowerCase()})`] = values;
    for (const [name, values] of Object.entries(analysis.currentsA)) signals[`i(${name.toLowerCase()})`] = values;
    process.stdout.write(JSON.stringify({ grid: analysis.axis.values, signals }));
  } finally {
    await engine.close();
  }
}

function runWasm(fixture: Fixture): TimedRun {
  const started = performance.now();
  const run = spawnSync('pnpm', ['exec', 'tsx', scriptPath, '--child=wasm', fixture.path], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120_000,
  });
  const runtimeMs = performance.now() - started;
  if (run.status !== 0) throw new Error(`WASM child failed: ${run.stderr}`);
  return { runtimeMs, series: JSON.parse(run.stdout) as Series };
}

function runNgspice(fixture: Fixture, source: string): TimedRun {
  const temporary = mkdtempSync(join(tmpdir(), 'wasm-dc-sweep-'));
  const netlist = join(temporary, basename(fixture.path));
  const raw = join(temporary, `${fixture.name}.raw`);
  writeFileSync(netlist, source);
  writeFileSync(join(temporary, '.spiceinit'), 'set filetype=ascii\n');
  try {
    const started = performance.now();
    const run = spawnSync('ngspice', ['-b', '-r', raw, netlist], {
      encoding: 'utf8', env: { ...process.env, HOME: temporary }, maxBuffer: 16 * 1024 * 1024, timeout: 120_000,
    });
    const runtimeMs = performance.now() - started;
    if (run.status !== 0) throw new Error(`ngspice failed: ${run.stderr}`);
    const plot = parseNgspiceRaw(readFileSync(raw, 'utf8')).find(value => value.plotName.toLowerCase().includes('dc transfer'));
    if (!plot) throw new Error('ngspice returned no DC transfer plot');
    const signals = Object.fromEntries(Object.entries(plot.signals).map(([name, values]) => [
      name.toLowerCase(), values.map(value => value.re),
    ]));
    return { runtimeMs, series: { grid: plot.grid, signals } };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function metrics(actual: Series, reference: Series, signal: string) {
  if (actual.grid.length !== reference.grid.length
    || actual.grid.some((value, index) => Math.abs(value - reference.grid[index]!) > 1e-15)) {
    throw new Error(`${signal}: DC grids do not match`);
  }
  const actualValues = actual.signals[signal];
  const referenceValues = reference.signals[signal];
  if (!actualValues || !referenceValues) throw new Error(`${signal}: missing comparison vector`);
  const absolute = actualValues.map((value, index) => Math.abs(value - referenceValues[index]!));
  const relative: number[] = [];
  let excludedZeroReferences = 0;
  absolute.forEach((error, index) => {
    const denominator = Math.abs(referenceValues[index]!);
    if (denominator <= relativeZeroThreshold) excludedZeroReferences++;
    else relative.push(error / denominator);
  });
  const rms = (values: number[]) => values.length === 0 ? null
    : Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
  return {
    sampleCount: absolute.length,
    absoluteError: { max: Math.max(...absolute), rms: rms(absolute)! },
    relativeError: {
      max: relative.length > 0 ? Math.max(...relative) : null,
      rms: rms(relative), sampleCount: relative.length, excludedZeroReferences,
    },
  };
}

async function main(): Promise<void> {
  const fixtureReports = fixtures.map(fixture => {
    const source = readFileSync(fixture.path, 'utf8');
    const wasmRuns = Array.from({ length: repetitions }, () => runWasm(fixture));
    const ngspiceRuns = Array.from({ length: repetitions }, () => runNgspice(fixture, source));
    const wasm = wasmRuns[0]!.series;
    const ngspice = ngspiceRuns[0]!.series;
    return {
      name: fixture.name,
      path: `benchmarks/wasm-dc-sweep/${basename(fixture.path)}`,
      sha256: sha256(source), identicalInputBytes: true,
      convergence: { wasm: 'complete', ngspice: 'complete' },
      pointCounts: { wasm: wasm.grid.length, ngspice: ngspice.grid.length, matched: wasm.grid.length },
      errors: Object.fromEntries(fixture.signals.map(signal => [signal, metrics(wasm, ngspice, signal)])),
      runtimeMs: {
        wasm: { samples: wasmRuns.map(run => run.runtimeMs), median: median(wasmRuns.map(run => run.runtimeMs)) },
        ngspice: { samples: ngspiceRuns.map(run => run.runtimeMs), median: median(ngspiceRuns.map(run => run.runtimeMs)) },
      },
    };
  });
  const artifact = readFileSync(resolve(directory, '../../packages/wasm/native/dense-solver.wasm'));
  const report = {
    schemaVersion: 'spice-ts-wasm-dc-sweep/v1',
    generatedAt: new Date().toISOString(),
    methodology: {
      repetitions,
      input: 'the exact committed UTF-8 bytes are passed to both engines without rewriting',
      timing: 'fresh process wall time; WASM includes pnpm, Node, worker startup, integrity verification, parse, solve, and serialization; ngspice includes native process startup, parse, solve, and raw-file output',
      relativeZeroThreshold,
      tuning: 'no per-circuit options or tolerance changes',
    },
    environment: {
      platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model ?? 'unknown',
      node: process.version,
      pnpm: toolVersion('pnpm', ['--version']),
      ngspice: toolVersion('ngspice', ['--version'], /ngspice-\d+/i),
    },
    artifact: {
      path: 'packages/wasm/native/dense-solver.wasm', sha256: sha256(artifact),
      beforeBytes: 2900, afterBytes: artifact.byteLength, deltaBytes: artifact.byteLength - 2900,
      abiVersion: 2, memoryPages: 3,
    },
    fixtures: fixtureReports,
    exclusions: [
      'Only one unstepped linear R/I/V source sweep is in scope.',
      'Relative-error samples whose ngspice magnitude is at or below 1e-15 are excluded and counted per signal.',
      'Native ngspice branch-current output does not include independent current-source current, so the current-source fixture compares v(out).',
    ],
    retainedLosses: [
      'Fresh-process WASM timing includes pnpm and Node startup and is expected to lose to native ngspice.',
      'The dense WASM solver remains bounded to 64 unknowns and is not a speed claim.',
      'The JavaScript worker asset grows even though the native WASM artifact and ABI are unchanged.',
    ],
    commands: {
      reproduce: 'pnpm --filter @spice-ts/wasm bench:dc',
      wasm: 'pnpm exec tsx benchmarks/wasm-dc-sweep/compare.ts --child=wasm <identical-fixture>',
      ngspice: 'ngspice -b -r <raw> <identical-fixture>',
    },
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const childIndex = process.argv.indexOf('--child=wasm');
if (childIndex >= 0) {
  const fixturePath = process.argv[childIndex + 1];
  if (!fixturePath) throw new Error('Missing child fixture path');
  wasmChild(fixturePath).catch(error => { console.error(error); process.exitCode = 1; });
} else {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
