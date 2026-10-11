#!/usr/bin/env tsx
/**
 * Issue #381 receipt: ngspice/probe-ac (examples/probe/ac-test.cir) executed
 * unchanged by both engines, AC vectors compared on the identical fixture.
 *
 *   pnpm -C packages/core build
 *   pnpm exec tsx benchmarks/results/issue-381/verify.ts --output benchmarks/results/issue-381/report.json
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cpus } from 'node:os';
import { execFileSync } from 'node:child_process';
import { compareFixture, RELATIVE_ZERO_THRESHOLD } from '../../comparison-harness.js';

const FIXTURE_PATH = 'benchmarks/corpus/ngspice/fixtures/examples/probe/ac-test.cir';
const FIXTURE_SHA256 = '3afb9105918f939cbbdab957f8f872bbc886209fb83dbd27003c605977916479';
const COMPARED_SIGNALS = ['v(1)', 'v(2)', 'v(3)', 'i(V1)'];
/** ngspice `.probe` vectors: device-terminal currents and differential voltages. */
const PROBE_ONLY_VECTORS = ['i(R2)', 'v(vd_r2)', 'v(vd_r3)'];
/** Same absolute/relative bound as the current-source-ac AC receipt; not tuned for this circuit. */
const TOLERANCE = 2e-9;

function gridEndpoints(comparison: Awaited<ReturnType<typeof compareFixture>>) {
  const grid = (run: typeof comparison.spiceTs) => (run.status === 'success' ? run.series.grid : []);
  const spiceTs = grid(comparison.spiceTs);
  const ngspice = grid(comparison.ngspice);
  return {
    spiceTs: { first: spiceTs[0], last: spiceTs[spiceTs.length - 1] },
    ngspice: { first: ngspice[0], last: ngspice[ngspice.length - 1] },
    note: 'spice-ts grid points outside the ngspice grid range are excluded by the harness instead of extrapolated',
  };
}

async function main(): Promise<void> {
  const bytes = readFileSync(resolve(FIXTURE_PATH));
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== FIXTURE_SHA256) throw new Error(`fixture SHA-256 mismatch: ${digest}`);
  const netlist = bytes.toString('utf8');

  const comparison = await compareFixture({
    name: 'probe-ac',
    analysis: 'ac',
    netlist,
    signals: COMPARED_SIGNALS,
  });
  if (comparison.metrics === null) {
    throw new Error(`engines did not both succeed: spice-ts=${comparison.spiceTs.status} ngspice=${comparison.ngspice.status}`);
  }

  const compared = Object.fromEntries(COMPARED_SIGNALS.map(signal => [signal, comparison.metrics!.signals[signal]]));
  const { simulate } = await import('../../../packages/core/dist/index.js');
  const ac = (await simulate(netlist)).ac!;
  const ngspiceSignals = comparison.ngspice.status === 'success' ? Object.keys(comparison.ngspice.series.signals) : [];
  const probeOnly = Object.fromEntries(PROBE_ONLY_VECTORS.map(signal => {
    const [, kind, name] = signal.match(/^([vi])\((.+)\)$/)!;
    let spiceTs = true;
    try {
      if (kind === 'v') ac.voltage(name);
      else ac.current(name);
    } catch {
      spiceTs = false;
    }
    return [signal, { ngspice: ngspiceSignals.includes(signal.toLowerCase()), spiceTs, status: spiceTs ? 'available' : 'missing-from-spice-ts' }];
  }));
  const withinTolerance = Object.values(compared).every(signal =>
    signal.status === 'compared'
    && signal.sampleCount === comparison.metrics!.grid.alignedPoints
    && signal.sampleCount > 0
    && signal.absoluteError.max <= TOLERANCE
    && (signal.relativeError.max ?? 0) <= TOLERANCE);

  const report = {
    schemaVersion: 'spice-ts-issue-381/v1',
    issueUrl: 'https://github.com/mfiumara/spice-ts/issues/381',
    fixture: { path: FIXTURE_PATH, bytes: bytes.byteLength, sha256: digest, adaptation: 'none' },
    tools: {
      spiceTs: (JSON.parse(readFileSync(resolve('packages/core/package.json'), 'utf8')) as { version: string }).version,
      ngspice: execFileSync('ngspice', ['--version'], { encoding: 'utf8' }).match(/ngspice-\d+(?:\.\d+)*/i)?.[0] ?? 'unknown',
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      cpu: cpus()[0]?.model ?? 'unknown',
    },
    commands: {
      verify: 'pnpm exec tsx benchmarks/results/issue-381/verify.ts --output benchmarks/results/issue-381/report.json',
      ngspice: 'ngspice -b -r <temporary-ascii-raw> <identical-fixture>',
      spiceTs: '@spice-ts/core simulate(<identical-fixture>)',
    },
    before: {
      spiceTs: "ParseError: Parse error at line 14: Unsupported dot command: '.control'",
    },
    alignment: { targetGrid: 'spice-ts', interpolation: 'linear', relativeZeroThreshold: RELATIVE_ZERO_THRESHOLD },
    grid: comparison.metrics.grid,
    gridEndpoints: gridEndpoints(comparison),
    acceptance: { absoluteMax: TOLERANCE, relativeMax: TOLERANCE, perCircuitTuning: false, withinTolerance },
    compared,
    probeOnlyVectors: probeOnly,
    losses: [
      'spice-ts does not return the ngspice .probe vectors i(r2), vd_r2 and vd_r3 (device-terminal currents and differential probe voltages); they are reported as missing, not compared.',
      'The .control print/plot/display output is not produced by spice-ts; results are returned through the result API instead.',
      'No runtime comparison or superiority claim is made.',
      'The 10 kHz endpoint is not compared: ngspice accumulates the decade grid to 9999.999999999989 Hz while spice-ts returns 10000 Hz, so the shared harness excludes that out-of-range point rather than extrapolating (15 of 16 points compared).',
    ],
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0) {
    const outputPath = process.argv[outputIndex + 1];
    if (!outputPath) throw new Error('--output requires a path');
    writeFileSync(resolve(outputPath), serialized);
  } else {
    process.stdout.write(serialized);
  }
  if (!withinTolerance) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
