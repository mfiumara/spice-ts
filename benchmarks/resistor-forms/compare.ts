#!/usr/bin/env tsx
/**
 * #498: spice-ts vs ngspice-47 for the ngspice resistor card forms found in the
 * corpus-f batch-1 decks (#484): `r=`/`R =` keyword values, `ac=` AC
 * resistance, `noisy=0`, `m=`/`scale=`, `tc=`/`tc1`/`tc2`/`tce`, and
 * `.model R` references (`r=`, `rsh`/`narrow` geometry, instance defaults).
 *
 * Six of the nine fixtures drive their analyses from ngspice `.control`
 * scripts, so the identical-bytes corpus-f harness has no ngspice vectors for
 * them (#528). Here every resistor/source card is copied verbatim from the
 * cited fixture (ngspice tree 3ef069fb, BSD-3-Clause) and only dot analysis
 * cards equivalent to the fixture's `.control` analysis are added. Both
 * engines read the same netlist text, except `temper-res-1`, where ngspice
 * sweeps `.dc temp` and spice-ts runs the same body with `.op` + `.step TEMP`
 * over the same ten temperatures. `res_array.cir` and `res_partition.cir`
 * run byte-identical, unmodified.
 *
 *   pnpm exec tsx benchmarks/resistor-forms/compare.ts
 *
 * writes benchmarks/resistor-forms/report.json.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { simulate } from '../../packages/core/src/index.js';
import type { SimulationResult } from '../../packages/core/src/index.js';
import { parseNgspiceRaw, type ComplexValue } from '../comparison-harness.js';

const FIXTURE_ROOT = 'https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/';

type Plot = ReturnType<typeof parseNgspiceRaw>[number];

interface Signal {
  /** ngspice raw vector name. */
  name: string;
  ngspicePlot: string;
  spiceTs: (result: SimulationResult) => number[];
  /** Compare complex AC values as magnitudes. */
  magnitude?: boolean;
}

interface Case {
  id: string;
  fixture: string;
  forms: string;
  /** Netlist read by both engines (ngspice unless `ngspiceNetlist` is given). */
  netlist: string;
  ngspiceNetlist?: string;
  signals: Signal[];
}

const real = (values: ComplexValue[], magnitude = false): number[] =>
  values.map(value => (magnitude ? Math.hypot(value.re, value.im) : value.re));

const op = (name: string, read: (r: SimulationResult) => number): Signal => ({
  name, ngspicePlot: 'operating point', spiceTs: r => [read(r)],
});

const acMagnitude = (name: string, read: (r: SimulationResult) => { magnitude: number }[]): Signal => ({
  name, ngspicePlot: 'ac analysis', magnitude: true, spiceTs: r => read(r).map(point => point.magnitude),
});

const noise = (prefix = ''): Signal[] => ([
  { name: 'onoise_spectrum', ngspicePlot: 'noise spectral density', spiceTs: r => r.noise!.outputNoiseDensity },
  { name: 'inoise_spectrum', ngspicePlot: 'noise spectral density', spiceTs: r => r.noise!.inputNoiseDensity },
  { name: 'onoise_total', ngspicePlot: 'integrated noise', spiceTs: r => [r.noise!.integratedOutputNoise!] },
  { name: 'inoise_total', ngspicePlot: 'integrated noise', spiceTs: r => [r.noise!.integratedInputNoise!] },
] as Signal[]).map(signal => ({ ...signal, name: `${prefix}${signal.name}` }));

const resdiv = (title: string, cards: string, analysis: string): Case => ({
  id: `resdiv-${title}`,
  fixture: 'examples/noise/resdiv.cir',
  forms: title === 'noiseless' ? 'noisy=0' : 'plain R (control for noisy=0)',
  netlist: `* resdiv ${title}\n${cards}\n${analysis}\n.end\n`,
  signals: noise(),
});

const temperatures = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const temperBody = [
  'v1  1 0  dc 5v',
  'r1  1 0  1k tc1=2m tc2=30u',
  '.model rtest r r=1000 tc1=2m tc2=30u tce=700m',
  'v2  2 0  dc 5v',
  'r2  2 0  rtest',
  'v3  3 0  dc 5v',
  'r3  3 0  1k tc1=2m tc2=30u tce=700m',
].join('\n');
const temperSignal = (source: string): Signal => ({
  name: `i(${source})`,
  ngspicePlot: 'dc transfer characteristic',
  spiceTs: r => r.steps!.map(step => step.dc!.current(source)),
});

const cases: Case[] = [
  {
    id: 'loop-model-op',
    fixture: 'examples/loops/loop-model.cir',
    forms: 'model reference R2 n2 n1 rmod with .model rmod r (r=1k)',
    netlist: '* dc loop with model parameter\nR1 n1 0 1k\nR2 n2 n1 rmod\n.model rmod r (r=1k)\nV1 n2 0 1\n.op\n.end\n',
    signals: [op('v(n1)', r => r.dc!.voltage('n1'))],
  },
  {
    id: 'bipolar-noise',
    fixture: 'examples/noise/bipolar-noise.cir',
    forms: 'r1 1 2 r=1k keyword value',
    netlist: [
      'A simple bipolar circuit',
      'v1 1 0 dc=5',
      'r1 1 2 r=1k',
      'q1 2 3 0 t2n2222',
      'r2 3 4 r=1k',
      'vin 4 0 dc=0.68 ac 1',
      '.model t2n2222 npn',
      '+ is=19f bf=150 vaf=100 ikf=0.18 ise=50p',
      '+ ne=2.5 br=7.5 var=6.4 ikr=12m isc=8.7p',
      '+ nc=1.2 rb=50 re=0.4 rc=0.3 cje=26p tf=0.5n',
      '+ cjc=11p tr=7n xtb=1.5 kf=0.032f af=1',
      '.noise v(2) vin dec 10 0.5 100meg 1',
      '.end',
      '',
    ].join('\n'),
    signals: noise(),
  },
  resdiv('divider', 'V1 1 0 dc 0 ac 1\nR1 1 2 10k\nR2 2 0 10k', '.noise v(2) V1 dec 10 1 100k 1'),
  resdiv('noiseless', 'V11 11 0 dc 0 ac 1\nR11 11 12 10k\nR12 12 0 10k noisy=0', '.noise v(12) V11 dec 10 1 100k'),
  resdiv('filter', 'V21 21 0 dc 0 ac 1\nR21 21 22 10k\nR22 22 0 10k\nC22 22 0 1u', '.noise v(22) V21 dec 10 1 100k'),
  {
    id: 'instance-defaults-op',
    fixture: 'tests/regression/model/instance-defaults.cir',
    forms: 'r1 1 0 myres with .model myres r(resistance=2k) instance default',
    netlist: '* check whether .model accepts instance defaults\nv1  1 0  dc=1\nr1  1 0  myres\n.model myres r(resistance=2k)\n.op\n.end\n',
    signals: [op('i(v1)', r => r.dc!.current('v1'))],
  },
  {
    id: 'ac-resistance-op-ac',
    fixture: 'tests/regression/pz/ac-resistance.cir',
    forms: 'R1 1 2 1k ac=4k (op uses 1k, ac uses 4k)',
    netlist: 'check for proper use of ac resistance\nVin 1 0  dc 5.0  ac 3.0\nR1 1 2  1k ac=4k\nC2 2 0  1n\nR2 2 0  4k\n.op\n.ac lin 3 100kHz 200kHz\n.end\n',
    signals: [op('v(2)', r => r.dc!.voltage('2')), acMagnitude('v(2)', r => r.ac!.voltage('2'))],
  },
  {
    id: 'ac-resistance-pz',
    fixture: 'tests/regression/pz/ac-resistance.cir',
    forms: 'R1 1 2 1k ac=4k in pole-zero (Vin removed: spice-ts .pz vol accepts only R, L, C; #504)',
    netlist: 'check for proper use of ac resistance\nR1 1 2  1k ac=4k\nC2 2 0  1n\nR2 2 0  4k\n.pz 1 0  2 0  vol pz\n.end\n',
    signals: [{ name: 'v(pole(1))', ngspicePlot: 'pole-zero analysis', spiceTs: r => [r.poleZero!.poles[0].real] }],
  },
  {
    id: 'temper-res-1',
    fixture: 'tests/regression/temper/temper-res-1.cir',
    forms: 'instance tc1/tc2/tce, .model rtest r r=1000 tc1 tc2 tce (TCE overrides TC1/TC2)',
    netlist: `regression test temper-res-1.cir, TC1 TC2 and TCE\n${temperBody}\n.op\n.step TEMP LIST ${temperatures.join(' ')}\n.end\n`,
    ngspiceNetlist: `regression test temper-res-1.cir, TC1 TC2 and TCE\n${temperBody}\n.dc temp 10 100 10.0\n.end\n`,
    signals: [temperSignal('v1'), temperSignal('v2'), temperSignal('v3')],
  },
];

/** Byte-identical fixtures (ngspice `.op`/`.ac`/`.tran` dot cards, no `.control`). */
const verbatim: Array<{ id: string; fixture: string; forms: string; currents: string[]; nodes: string[] }> = [
  {
    id: 'res_array',
    fixture: 'tests/resistance/res_array.cir',
    forms: 'ac=, rsh/narrow model with L/W (zero effective width: open), m=2, scale=1K',
    currents: ['VR1', 'VR2', 'VR3', 'VR4', 'VR5'],
    nodes: [],
  },
  {
    id: 'res_partition',
    fixture: 'tests/resistance/res_partition.cir',
    forms: 'r2 2 0 5K ac=15k',
    currents: ['vin'],
    nodes: ['2'],
  },
];

function runNgspice(netlist: string): Plot[] {
  const directory = mkdtempSync(join(tmpdir(), 'spicets-498-'));
  try {
    writeFileSync(join(directory, 'deck.cir'), netlist);
    writeFileSync(join(directory, '.spiceinit'), 'set filetype=ascii\n');
    const completed = spawnSync('ngspice', ['-b', '-r', join(directory, 'out.raw'), join(directory, 'deck.cir')], {
      encoding: 'utf8', env: { ...process.env, HOME: directory }, timeout: 60_000, maxBuffer: 16 * 1024 * 1024,
    });
    if (completed.status !== 0) throw new Error(`ngspice exited ${completed.status}: ${completed.stderr}`);
    return parseNgspiceRaw(readFileSync(join(directory, 'out.raw'), 'utf8'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function plot(plots: Plot[], name: string): Plot {
  const found = plots.find(candidate => candidate.plotName.toLowerCase().includes(name));
  if (!found) throw new Error(`ngspice produced no '${name}' plot (got ${plots.map(p => p.plotName).join(', ')})`);
  return found;
}

function errors(actual: number[], expected: number[]) {
  if (actual.length !== expected.length) {
    return { status: 'count-mismatch', spiceTsPoints: actual.length, ngspicePoints: expected.length };
  }
  const absolute = actual.map((value, index) => Math.abs(value - expected[index]));
  const relative = absolute.map((value, index) => value / Math.max(Math.abs(expected[index]), Number.MIN_VALUE));
  const peak = Math.max(...expected.map(Math.abs));
  return {
    status: 'compared',
    points: actual.length,
    maxAbsoluteError: Math.max(...absolute),
    maxRelativeError: Math.max(...relative),
    maxErrorOverNgspicePeak: Math.max(...absolute) / Math.max(peak, Number.MIN_VALUE),
    rmsRelativeError: Math.sqrt(relative.reduce((sum, value) => sum + value * value, 0) / relative.length),
  };
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function compareCase(c: Case) {
  const plots = runNgspice(c.ngspiceNetlist ?? c.netlist);
  const base = {
    id: c.id,
    fixture: `${FIXTURE_ROOT}${c.fixture}`,
    forms: c.forms,
    identicalNetlist: c.ngspiceNetlist === undefined,
    netlistSha256: sha256(c.netlist),
  };
  let result: SimulationResult;
  try {
    result = await simulate(c.netlist);
  } catch (error) {
    // A loss: ngspice ran this netlist, spice-ts did not.
    return { ...base, spiceTs: { status: 'unsupported', error: (error as Error).message.split('\n')[0] }, signals: [] };
  }
  return {
    ...base,
    spiceTs: { status: 'success' },
    signals: c.signals.map(signal => {
      const vectors = plot(plots, signal.ngspicePlot).signals;
      const key = signal.name.toLowerCase();
      const reference = vectors[key] ?? vectors[`v(${key})`];
      if (!reference) throw new Error(`${c.id}: ngspice vector ${signal.name} missing`);
      return { signal: signal.name, ...errors(signal.spiceTs(result), real(reference, signal.magnitude)) };
    }),
  };
}

/** Linear interpolation of spice-ts samples onto ngspice's grid (transient only). */
function interpolate(grid: number[], values: number[], x: number): number {
  let index = grid.findIndex(t => t >= x);
  if (index <= 0) return index === 0 ? values[0] : values[values.length - 1];
  const t0 = grid[index - 1];
  const t1 = grid[index];
  return values[index - 1] + (values[index] - values[index - 1]) * (x - t0) / (t1 - t0);
}

async function compareVerbatim(v: typeof verbatim[number]) {
  const fixturePath = resolve('benchmarks/resistor-forms/fixtures', v.fixture.split('/').pop()!);
  const netlist = readFileSync(fixturePath, 'utf8');
  const plots = runNgspice(netlist);
  const result = await simulate(netlist);
  const signals: object[] = [];
  const opPlot = plot(plots, 'operating point');
  for (const node of v.nodes) {
    signals.push({ analysis: 'op', signal: `v(${node})`, ...errors([result.dc!.voltage(node)], real(opPlot.signals[`v(${node})`])) });
  }
  for (const source of v.currents) {
    signals.push({ analysis: 'op', signal: `i(${source})`, ...errors([result.dc!.current(source)], real(opPlot.signals[`i(${source.toLowerCase()})`])) });
  }
  const acPlot = plot(plots, 'ac analysis');
  for (const node of v.nodes) {
    signals.push({ analysis: 'ac', signal: `|v(${node})|`, ...errors(result.ac!.voltage(node).map(p => p.magnitude), real(acPlot.signals[`v(${node})`], true)) });
  }
  for (const source of v.currents) {
    signals.push({ analysis: 'ac', signal: `|i(${source})|`, ...errors(result.ac!.current(source).map(p => p.magnitude), real(acPlot.signals[`i(${source.toLowerCase()})`], true)) });
  }
  const tranPlot = plots.find(candidate => candidate.plotName.toLowerCase().includes('transient'));
  if (tranPlot && result.transient) {
    const time = Array.from(result.transient.time);
    for (const source of v.currents) {
      const spiceTs = Array.from(result.transient.current(source));
      signals.push({
        analysis: 'tran',
        signal: `i(${source})`,
        note: 'spice-ts linearly interpolated onto ngspice output times',
        ...errors(tranPlot.grid.map(t => interpolate(time, spiceTs, t)), real(tranPlot.signals[`i(${source.toLowerCase()})`])),
      });
    }
    // The array is purely resistive, so i(VRk)/v(1) is the DC conductance at every
    // timepoint. Comparing it per engine, at each engine's own timepoints, separates
    // the resistor semantics from the interpolation error above.
    const vin = Array.from(result.transient.voltage('1'));
    const ngVin = real(tranPlot.signals['v(1)']);
    for (const source of v.currents) {
      const spiceTs = Array.from(result.transient.current(source));
      const ratio = (values: number[], input: number[]) => values
        .map((value, index) => (Math.abs(input[index]) > 0.1 ? value / input[index] : Number.NaN))
        .filter(Number.isFinite);
      const tsRatio = ratio(spiceTs, vin);
      const ngRatio = ratio(real(tranPlot.signals[`i(${source.toLowerCase()})`]), ngVin);
      signals.push({
        analysis: 'tran',
        signal: `i(${source})/v(1)`,
        note: 'conductance seen at each engine\'s own timepoints with |v(1)| > 0.1 V',
        spiceTs: { min: Math.min(...tsRatio), max: Math.max(...tsRatio) },
        ngspice: { min: Math.min(...ngRatio), max: Math.max(...ngRatio) },
      });
    }
  }
  return {
    id: v.id,
    fixture: `${FIXTURE_ROOT}${v.fixture}`,
    forms: v.forms,
    identicalNetlist: true,
    netlistSha256: sha256(netlist),
    signals,
  };
}

async function main(): Promise<void> {
  const version = spawnSync('ngspice', ['-v'], { encoding: 'utf8' }).stdout.match(/ngspice-\d+/)?.[0] ?? 'unknown';
  const report = {
    schemaVersion: 'spice-ts-resistor-forms/v1',
    issue: 'https://github.com/mfiumara/spice-ts/issues/498',
    tools: { ngspice: version, node: process.version },
    environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model ?? 'unknown' },
    command: 'pnpm exec tsx benchmarks/resistor-forms/compare.ts',
    policy: 'no per-case tolerances; every error is reported as measured',
    cases: [
      ...await Promise.all(cases.map(compareCase)),
      ...await Promise.all(verbatim.map(compareVerbatim)),
    ],
  };
  writeFileSync(resolve('benchmarks/resistor-forms/report.json'), `${JSON.stringify(report, null, 2)}\n`);
  for (const c of report.cases) {
    if ('spiceTs' in c && c.spiceTs.status !== 'success') console.log(`${c.id.padEnd(22)} spice-ts LOSS: ${(c.spiceTs as { error: string }).error}`);
    for (const s of c.signals as Array<Record<string, unknown>>) {
      const worst = s.maxRelativeError ?? '';
      console.log(`${c.id.padEnd(22)} ${String(s.analysis ?? '').padEnd(4)} ${String(s.signal).padEnd(18)} maxRel=${worst} maxOverPeak=${s.maxErrorOverNgspicePeak ?? ''}${s.spiceTs ? ` ts=${JSON.stringify(s.spiceTs)} ng=${JSON.stringify(s.ngspice)}` : ''}`);
    }
  }
}

void main();
