#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { alignAndMeasure } from '../../comparison-harness.js';
import {
  runNativeNgspice,
  runNativeSpiceTs,
  type ClassicCircuit,
  type EngineExecution,
} from '../../corpus/classic/report.js';

const FIXTURE_ID = 'mesa-oscillator';
const FIXTURE_SHA256 = '3cd4609cca7874775b7b2cac8cd0124bd2b8c5512064a0550a29de2da4896bcf';
const RECEIPT = 'benchmarks/results/issue-340/report.json';

interface TimedExecution {
  runtimeMs: number;
  execution: EngineExecution;
}

function sha256(input: Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

async function timed(run: () => Promise<EngineExecution>): Promise<TimedExecution> {
  const start = performance.now();
  const execution = await run();
  return { runtimeMs: performance.now() - start, execution };
}

function engine(timedExecution: TimedExecution) {
  const { execution, runtimeMs } = timedExecution;
  return {
    status: execution.status,
    convergence: execution.convergence,
    runtimeMs,
    analyses: execution.analyses.map(analysis => ({
      type: analysis.type,
      points: analysis.series.grid.length,
      firstTime: analysis.series.grid[0],
      lastTime: analysis.series.grid.at(-1),
      signals: Object.keys(analysis.series.signals).sort(),
    })),
    ...(execution.error ? { error: execution.error } : {}),
  };
}

function deterministic(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deterministic);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== 'runtimeMs')
      .map(([key, child]) => [key, deterministic(child)]));
  }
  return value;
}

async function buildReport() {
  const manifest = JSON.parse(await readFile(resolve('benchmarks/corpus/ngspice/manifest.json'), 'utf8')) as {
    circuits: ClassicCircuit[];
  };
  const source = manifest.circuits.find(circuit => circuit.id === FIXTURE_ID);
  if (!source) throw new Error(`missing ${FIXTURE_ID} fixture`);
  const circuit: ClassicCircuit = {
    ...source,
    ngspice: { expectedStatus: 'pass' },
    spiceTs: { expectedStatus: 'pass' },
  };
  const input = await readFile(resolve(circuit.localPath));
  const digest = sha256(input);
  if (digest !== FIXTURE_SHA256 || digest !== circuit.sha256) {
    throw new Error(`${FIXTURE_ID} fixture SHA-256 mismatch`);
  }

  // Sequential runs so neither engine's wall clock includes the other's work.
  const ngspice = await timed(() => runNativeNgspice(input, circuit));
  const spiceTs = await timed(() => runNativeSpiceTs(input, circuit));
  if (ngspice.execution.status !== 'success' || spiceTs.execution.status !== 'success') {
    throw new Error(`expected both engines to succeed: ngspice=${ngspice.execution.status}, spice-ts=${spiceTs.execution.status}`);
  }
  const ngAnalysis = ngspice.execution.analyses[0];
  const spiceAnalysis = spiceTs.execution.analyses[0];
  if (!ngAnalysis || !spiceAnalysis) throw new Error('missing transient analysis');
  const comparedSignals = Object.keys(spiceAnalysis.series.signals)
    .filter(signal => ngAnalysis.series.signals[signal] !== undefined)
    .sort();
  const metrics = alignAndMeasure(spiceAnalysis.series, ngAnalysis.series, comparedSignals);
  const extraSpiceTsSignals = Object.keys(spiceAnalysis.series.signals)
    .filter(signal => ngAnalysis.series.signals[signal] === undefined)
    .sort();
  const missingSpiceTsSignals = Object.keys(ngAnalysis.series.signals)
    .filter(signal => spiceAnalysis.series.signals[signal] === undefined)
    .sort();
  const version = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });

  return {
    schemaVersion: 'spice-ts-issue-340/v1',
    issueUrl: 'https://github.com/mfiumara/spice-ts/issues/340',
    tools: {
      ngspice: `${version.stdout}\n${version.stderr}`.match(/ngspice-\d+(?:\.\d+)*/i)?.[0] ?? 'unknown',
      node: process.version,
    },
    input: {
      fixtureId: FIXTURE_ID,
      localPath: circuit.localPath,
      bytes: input.byteLength,
      sha256: digest,
      identicalForBothEngines: true,
    },
    policy: {
      fixtureAdaptation: 'none',
      perCircuitToleranceTuning: false,
      comparisonGrid: 'spice-ts',
      interpolation: 'linear',
      timing: 'single sequential wall-clock execution per engine; descriptive, not a speed claim',
      processBoundaries: {
        ngspice: 'native ngspice-47 child process (spawnSync -b -r ascii raw), including process start-up and raw-file write/parse',
        spiceTs: 'in-process @spice-ts/core dist simulate() in the verifying Node.js process, including parse',
      },
    },
    contract: {
      supported: [
        'B-card `Bname n+ n- I=<expression>` at top level and inside subcircuits; current flows n+ -> source -> n-',
        'B expressions: numbers with SPICE scale factors, v(node), v(node1,node2), unary + and -, binary + - * /, parentheses',
        'B functions tanh exp sinh cosh atan sin cos abs with ngspice ptfuncs.c semantics (exp clamp to 1e99 above 227.9559242, sin/cos argument modulus 2*pi, divide fudge 1e-32)',
        'B sources in .op, .dc, .tran and .ac through exact first-derivative linearisation',
        'Z-card `Zname d g s model [L=] [W=]` at top level and inside subcircuits, dispatched by model type (NHFET level 5 from #339, NMF level 2 here)',
        'NMF LEVEL=2 (ngspice MESA mesa1) at TEMP=TNOM=27 C',
        'NMF model parameters LEVEL VTO/VT0 LAMBDA VS RD RS RDI RSI PHIB ASTAR GGR DEL N ETA M MC ALPHA SIGMA0 VSIGMAT VSIGMA MU THETA D ND DELTA TC ZETA AG',
        'NMF instance parameters L W',
        'NMF channel current, forward-orientation gm/gds stamping, Schottky + GGR gate junctions including CKTgmin, external RD/RS, Cgs/Cgd charge storage; analyses .op, .dc, .tran',
      ],
      unsupported: [
        'B V= sources, branch currents i(...), time, parameters/identifiers, ** and ^ powers, comparisons, ternaries and logic operators',
        'B functions other than the supported list (for example sqrt, ln, log, pwl, min, max, u, uramp)',
        'B instance parameters (tc1, tc2, temp, dtemp, m, reciproctc, reciprocm)',
        'PMF models and NMF levels other than 2',
        'NMF temperature parameters (TVTO TLAMBDA TETA0 TETA1 TMU XTM0 XTM1 XTM2 MU1 MU2 PHIB1 XCHI TF RTC1 RTC2), RG/RI/RF gate/input resistances, sidegating KS/VSG, LAMBDAHF/FLO/DELFO dispersion, and level-3/4 parameters (BETA DU NDU TH NDELTA NMAX GAMMA EPSI CAS CBS)',
        'NMF instance M, OFF, ICVDS, ICVGS, TD, TS, DTEMP',
        'NMF .ac, .noise, .tf, .sens, .disto, .pz and .step TEMP',
      ],
    },
    ngspice: engine(ngspice),
    spiceTs: engine(spiceTs),
    comparison: { signals: comparedSignals, metrics },
    losses: [
      `spice-ts emits ${spiceAnalysis.series.grid.length} adaptive points versus ngspice-47 ${ngAnalysis.series.grid.length}; comparison interpolates ngspice onto the spice-ts grid inside the common time range, so linear interpolation between ngspice's ~20 ps (TMAX) samples across switching edges contributes to the edge errors`,
      'spice-ts ignores the .tran TSTART (1 ns) and reports from t=0; ngspice reports from TSTART. Points before ngspice\'s first time are excluded from the metrics (see excludedOutOfRange).',
      `spice-ts exposes internal RD/RS node signals not present in ngspice output: ${extraSpiceTsSignals.length} signals (${extraSpiceTsSignals.slice(0, 4).join(', ')}${extraSpiceTsSignals.length > 4 ? ', ...' : ''})`,
      ...(missingSpiceTsSignals.length > 0
        ? [`ngspice signals without a spice-ts counterpart: ${missingSpiceTsSignals.join(', ')}`]
        : []),
      'The ring oscillator accumulates phase drift between the engines (different timestep control and nonlinear-capacitance companion history; spice-ts does not reproduce ngspice MESA charge-state integration or DEVpnjlim/DEVfetlim limiting); the largest errors sit on switching edges and are published above as a remaining parity loss.',
      'spice-ts is orders of magnitude slower than ngspice on this fixture; the in-process profile is dominated by sparse LU factorisation, which is outside this change.',
    ],
  };
}

async function main(): Promise<void> {
  const report = await buildReport();
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0) {
    const output = process.argv[outputIndex + 1];
    if (!output) throw new Error('--output requires a path');
    await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  if (process.argv.includes('--check')) {
    const expected = JSON.parse(await readFile(resolve(RECEIPT), 'utf8'));
    if (JSON.stringify(deterministic(expected)) !== JSON.stringify(deterministic(report))) {
      throw new Error('issue-340 deterministic receipt fields changed');
    }
    process.stderr.write('issue-340 receipt: deterministic fields match; runtimes are finite and descriptive\n');
    return;
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
