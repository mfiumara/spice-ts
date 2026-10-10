import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release } from 'node:os';
import { resolve } from 'node:path';
import { createSpiceEngine, type SpiceEngine } from '../dist/index.js';

interface ComplexValue { re: number; im: number }
interface SampleSeries { grid: number[]; signals: Record<string, ComplexValue[]> }
interface ComparisonFixture { name: string; analysis: 'ac'; netlist: string; signals: string[] }
interface ComparedSignal {
  status: 'compared';
  sampleCount: number;
  absoluteError: { max: number; rms: number };
  relativeError: { max: number | null; rms: number | null; sampleCount: number; excludedZeroReferences: number };
}
interface ComparisonMetrics {
  grid: { alignedPoints: number };
  signals: Record<string, ComparedSignal | { status: 'missing' }>;
}
type NgspiceRun = {
  status: 'success'; runtimeMs: number; series: SampleSeries;
} | {
  status: 'failed' | 'unsupported'; runtimeMs: number; error: string;
};

const harnessUrl = new URL('../../../benchmarks/comparison-harness.ts', import.meta.url).href;
const harness = await import(harnessUrl) as {
  alignAndMeasure(left: SampleSeries, right: SampleSeries, signals: string[]): ComparisonMetrics;
  runNgspice(fixture: ComparisonFixture): Promise<NgspiceRun>;
};
const { alignAndMeasure, runNgspice } = harness;

const WARMUPS = 5;
const SAMPLES = 5;
const RUNS_PER_SAMPLE = 20;
const fixtures: ComparisonFixture[] = [
  {
    name: 'wasm-rc-lowpass', analysis: 'ac', signals: ['v(in)', 'v(out)', 'i(v1)'],
    netlist: '* bounded wasm rc lowpass\nV1 in 0 AC 1\nR1 in out 1k\nC1 out 0 1u\n.ac dec 3 10 10k\n.end',
  },
  {
    name: 'wasm-rl-phased', analysis: 'ac', signals: ['v(in)', 'v(out)', 'i(v1)', 'i(l1)'],
    netlist: '* bounded wasm rl phased\nV1 in 0 AC 2 30\nR1 in out 100\nL1 out 0 10m\n.ac dec 4 100 1k\n.end',
  },
  {
    name: 'wasm-current-rc', analysis: 'ac', signals: ['v(out)'],
    netlist: '* bounded wasm current rc\nI1 0 out AC 1m -45\nR1 out 0 1k\nC1 out 0 100n\n.ac oct 2 100 1600\n.end',
  },
];

type Backend = 'spice-ts-js' | 'spice-ts-wasm';

async function runEngine(engine: SpiceEngine, fixture: ComparisonFixture, requestId: string): Promise<SampleSeries> {
  const response = await engine.simulate({
    apiVersion: '1', input: { format: 'spice', source: fixture.netlist },
  }, { requestId });
  if (!response.ok) throw new Error(JSON.stringify(response.error));
  const analysis = response.data.analyses[0];
  if (analysis?.type !== 'ac') throw new Error(`Missing AC result for ${fixture.name}`);
  const signals: SampleSeries['signals'] = {};
  for (const [name, values] of Object.entries(analysis.voltagePhasors)) {
    signals[`v(${name.toLowerCase()})`] = values.map(value => rectangular(value.magnitude, value.phaseDegrees));
  }
  for (const [name, values] of Object.entries(analysis.currentPhasors)) {
    signals[`i(${name.toLowerCase()})`] = values.map(value => rectangular(value.magnitude, value.phaseDegrees));
  }
  return { grid: analysis.frequencyHz, signals };
}

function rectangular(magnitude: number, phaseDegrees: number): { re: number; im: number } {
  const radians = phaseDegrees * Math.PI / 180;
  return { re: magnitude * Math.cos(radians), im: magnitude * Math.sin(radians) };
}

async function benchmark(backend: Backend): Promise<{ samplesMs: number[]; medianMs: number; perRunMs: number }> {
  const engine = await createSpiceEngine({ backend });
  let requestId = 0;
  try {
    for (let warmup = 0; warmup < WARMUPS; warmup++) {
      await runEngine(engine, fixtures[warmup % fixtures.length]!, `warmup-${backend}-${requestId++}`);
    }
    const samplesMs: number[] = [];
    for (let sample = 0; sample < SAMPLES; sample++) {
      const started = performance.now();
      for (let run = 0; run < RUNS_PER_SAMPLE; run++) {
        await runEngine(engine, fixtures[run % fixtures.length]!, `bench-${backend}-${requestId++}`);
      }
      samplesMs.push(performance.now() - started);
    }
    const ordered = [...samplesMs].sort((left, right) => left - right);
    const medianMs = ordered[Math.floor(ordered.length / 2)]!;
    return { samplesMs, medianMs, perRunMs: medianMs / RUNS_PER_SAMPLE };
  } finally {
    await engine.close();
  }
}

function aggregate(metrics: ComparisonMetrics[]): {
  sampleCount: number;
  maxAbsoluteError: number;
  rmsAbsoluteError: number;
  maxRelativeError: number | null;
  rmsRelativeError: number | null;
  excludedZeroReferences: number;
} {
  let absoluteSquares = 0;
  let relativeSquares = 0;
  let sampleCount = 0;
  let relativeCount = 0;
  let excludedZeroReferences = 0;
  let maxAbsoluteError = 0;
  let maxRelativeError = 0;
  for (const metric of metrics) {
    for (const signal of Object.values(metric.signals)) {
      if (signal.status !== 'compared') continue;
      sampleCount += signal.sampleCount;
      absoluteSquares += signal.absoluteError.rms ** 2 * signal.sampleCount;
      maxAbsoluteError = Math.max(maxAbsoluteError, signal.absoluteError.max);
      relativeCount += signal.relativeError.sampleCount;
      excludedZeroReferences += signal.relativeError.excludedZeroReferences;
      if (signal.relativeError.rms !== null) {
        relativeSquares += signal.relativeError.rms ** 2 * signal.relativeError.sampleCount;
      }
      if (signal.relativeError.max !== null) maxRelativeError = Math.max(maxRelativeError, signal.relativeError.max);
    }
  }
  return {
    sampleCount,
    maxAbsoluteError,
    rmsAbsoluteError: Math.sqrt(absoluteSquares / sampleCount),
    maxRelativeError: relativeCount > 0 ? maxRelativeError : null,
    rmsRelativeError: relativeCount > 0 ? Math.sqrt(relativeSquares / relativeCount) : null,
    excludedZeroReferences,
  };
}

const js = await createSpiceEngine({ backend: 'spice-ts-js' });
const wasm = await createSpiceEngine({ backend: 'spice-ts-wasm' });
const wasmVsJs: ComparisonMetrics[] = [];
const wasmVsNgspice: ComparisonMetrics[] = [];
const ngspiceRuntimeMs: number[] = [];
try {
  for (const [index, fixture] of fixtures.entries()) {
    const [jsSeries, wasmSeries, ngspice] = await Promise.all([
      runEngine(js, fixture, `accuracy-js-${index}`),
      runEngine(wasm, fixture, `accuracy-wasm-${index}`),
      runNgspice(fixture),
    ]);
    if (ngspice.status !== 'success') throw new Error(`${fixture.name}: ${ngspice.error}`);
    wasmVsJs.push(alignAndMeasure(wasmSeries, jsSeries, fixture.signals));
    wasmVsNgspice.push(alignAndMeasure(wasmSeries, ngspice.series, fixture.signals));
    ngspiceRuntimeMs.push(ngspice.runtimeMs);
  }
} finally {
  await Promise.all([js.close(), wasm.close()]);
}

const [jsRuntime, wasmRuntime] = await Promise.all([
  benchmark('spice-ts-js'),
  benchmark('spice-ts-wasm'),
]);
const artifactPath = resolve('native/dense-solver.wasm');
const artifact = await readFile(artifactPath);
const report = {
  schemaVersion: 'spice-ts-wasm-ac-receipt/v1',
  suite: {
    fixtureCount: fixtures.length,
    pointCount: wasmVsJs.reduce((sum, metric) => sum + metric.grid.alignedPoints, 0),
    netlistSha256: Object.fromEntries(fixtures.map(fixture => [
      fixture.name,
      createHash('sha256').update(fixture.netlist).digest('hex'),
    ])),
    identicalNetlistForWasmJsNgspice: true,
  },
  environment: {
    platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model ?? 'unknown',
    node: process.version,
    pnpm: execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim(),
    ngspice: execFileSync('ngspice', ['--version'], { encoding: 'utf8' }).match(/ngspice-\d+/i)?.[0] ?? 'unknown',
    clang: execFileSync('/opt/homebrew/opt/llvm/bin/clang', ['--version'], { encoding: 'utf8' }).split('\n')[0],
    wasmLd: execFileSync('/opt/homebrew/opt/lld/bin/wasm-ld', ['--version'], { encoding: 'utf8' }).trim(),
  },
  artifact: {
    bytes: (await stat(artifactPath)).size,
    sha256: createHash('sha256').update(artifact).digest('hex'),
    abiVersion: 2,
    memoryPages: 3,
    previousBytes: 1_190,
    sizeGrowthBytes: (await stat(artifactPath)).size - 1_190,
    sizeGrowthPercent: ((await stat(artifactPath)).size / 1_190 - 1) * 100,
  },
  builtAssets: {
    workerBytes: (await stat(resolve('dist/worker.js'))).size,
    workerGrowthBytes: (await stat(resolve('dist/worker.js'))).size - 355_517,
    indexBytes: (await stat(resolve('dist/index.js'))).size,
    indexGrowthBytes: (await stat(resolve('dist/index.js'))).size - 41_878,
  },
  accuracy: {
    wasmVsTypeScript: aggregate(wasmVsJs),
    wasmVsNgspice: aggregate(wasmVsNgspice),
    perFixture: Object.fromEntries(fixtures.map((fixture, index) => [fixture.name, {
      wasmVsTypeScript: wasmVsJs[index],
      wasmVsNgspice: wasmVsNgspice[index],
    }])),
  },
  runtime: {
    warmups: WARMUPS,
    samples: SAMPLES,
    runsPerSample: RUNS_PER_SAMPLE,
    typeScript: jsRuntime,
    wasm: wasmRuntime,
    wasmLossPercent: (wasmRuntime.medianMs / jsRuntime.medianMs - 1) * 100,
    ngspiceOneProcessPerFixtureMs: ngspiceRuntimeMs,
  },
  commands: {
    receipt: 'pnpm --filter @spice-ts/wasm bench:ac',
    ngspice: 'ngspice -b -r <temporary-rawfile> <identical-netlist>',
  },
};
const output = resolve('ac-accuracy-results.json');
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
