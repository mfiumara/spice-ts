#!/usr/bin/env tsx
/**
 * #492: identical-netlist spice-ts vs ngspice comparison for the
 * parenthesised / extended independent-source waveform forms found in the
 * corpus-f batch-1 decks (#484). Each source card below is copied verbatim
 * from a corpus-f fixture (ngspice tree 3ef069fb, BSD-3-Clause); only a
 * linear RC load and the analysis line are added so the comparison runs on
 * both engines without CIDER/XSPICE devices.
 *
 * Both engines read the same netlist bytes. ngspice additionally receives a
 * `.control` block that only runs the deck and writes the probed vectors.
 *
 *   pnpm exec tsx benchmarks/source-waveform-syntax/compare.ts
 *
 * writes benchmarks/source-waveform-syntax/report.json.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse, simulate } from '../../packages/core/src/index.js';
import { VoltageSource } from '../../packages/core/src/devices/voltage-source.js';

type Analysis = 'op' | 'tran' | 'ac';

interface Case {
  id: string;
  form: string;
  fixture: string;
  analysis: Analysis;
  probes: string[];
  netlist: string;
  /**
   * Transient cases: the source under test, its probed positive node and the
   * DC offset of its negative node. Its compiled waveform is evaluated at
   * ngspice's own output times, separating source semantics from timestep
   * and interpolation differences in the RC response.
   */
  source?: { name: string; node: string; offset?: number };
}

const rc = (from: string, to: string) => `R1 ${from} ${to} 1k\nC1 ${to} 0 1p`;

const cases: Case[] = [
  {
    id: 'pd1-paren-pwl-op',
    form: 'DC value + whole parenthesised PWL',
    fixture: 'examples/cider/diode/pd1.cir',
    analysis: 'op',
    probes: ['1', '2'],
    netlist: `pd1 form\nVIN 1 0 0.0v (PWL 0ns 0.8v 1ns -50.0v)\n${rc('1', '2')}\n.op\n.end\n`,
  },
  {
    id: 'pindiode-paren-pwl-tran',
    source: { name: 'VIN', node: '1' },
    form: 'DC value + whole parenthesised PWL',
    fixture: 'examples/cider/diode/pindiode.cir',
    analysis: 'tran',
    probes: ['1', '2'],
    netlist: `pindiode form\nVIN 1 0 0.0v (PWL 0ns 0.8v 1ns -50.0v)\n${rc('1', '2')}\n.TRAN 1NS 100NS\n.end\n`,
  },
  {
    id: 'diode-paren-pwl-ac-op',
    form: 'DC value + parenthesised PWL + parenthesised AC',
    fixture: 'examples/cider/diode/diode.cir',
    analysis: 'op',
    probes: ['1', '2'],
    netlist: `diode form\nVpp 1 0 0.7v (PWL 0ns 3.0v 0.01ns -6.0v) (AC 1v)\n${rc('1', '2')}\n.op\n.end\n`,
  },
  {
    id: 'diode-paren-pwl-ac-ac',
    form: 'DC value + parenthesised PWL + parenthesised AC',
    fixture: 'examples/cider/diode/diode.cir',
    analysis: 'ac',
    probes: ['2'],
    netlist: `diode form\nVpp 1 0 0.7v (PWL 0ns 3.0v 0.01ns -6.0v) (AC 1v)\n${rc('1', '2')}\n.ac dec 10 100kHz 10gHz\n.end\n`,
  },
  {
    id: 'diotran-paren-pwl-ac-tran',
    source: { name: 'Vpp', node: '1' },
    form: 'DC value + parenthesised PWL + parenthesised AC',
    fixture: 'examples/cider/diode/diotran.cir',
    analysis: 'tran',
    probes: ['1', '2'],
    netlist: `diotran form\nVpp 1 0 0.7v (PWL 0ns 3.0v 0.1ns 3.0v 0.11ns -6.0v) (AC 1v)\n${rc('1', '2')}\n.tran 0.001ns 1.0ns\n.end\n`,
  },
  {
    id: 'bootinv-paren-pairs-tran',
    source: { name: 'Vin', node: '5' },
    form: 'PWL with bare parenthesised time/value pairs across a continuation',
    fixture: 'examples/cider/mos/bootinv.cir',
    analysis: 'tran',
    probes: ['5', '6'],
    netlist: [
      'bootinv form',
      'Vin 5 0 0.0v PWL (0.0ns 5.0v) (1ns 0.0v) (10ns 0.0v) (11ns 5.0v)',
      '+ (20ns 5.0v) (21ns 0.0v) (30ns 0.0v) (31ns 5.0v)',
      rc('5', '6'),
      '.tran 0.2ns 40ns',
      '.end',
      '',
    ].join('\n'),
  },
  {
    id: 'recovery-paren-pulse-tran',
    source: { name: 'VPP', node: '1' },
    form: 'DC value + whole parenthesised PULSE',
    fixture: 'examples/cider/serial/recovery.cir',
    analysis: 'tran',
    probes: ['1', '2'],
    netlist: `recovery form\nVPP 1 0 0.0V (PULSE 1.0V -1.0V 1NS 1PS 1PS 20NS 40NS)\n${rc('1', '2')}\n.TRAN 0.1NS 10NS\n.end\n`,
  },
  {
    id: 'tbicmpd1-paren-pulse-tran',
    source: { name: 'VIN', node: '3', offset: 1 },
    form: 'DC value + whole parenthesised PULSE (floating reference)',
    fixture: 'examples/cider/surfmob/Tbicmpd1.cir',
    analysis: 'tran',
    probes: ['3', '4'],
    netlist: `Tbicmpd1 form\nVIN 3 2 0v (PULSE 0.0v 4.2v 0ns 1ns 1ns 9ns 20ns)\nVREF 2 0 1\n${rc('3', '4')}\n.TRAN 0.1ns 0.3ns 0ns 0.1ns\n.end\n`,
  },
  {
    id: 'tbicmpd1-paren-pulse-long-tran',
    source: { name: 'VIN', node: '3', offset: 1 },
    form: 'DC value + whole parenthesised PULSE (two periods)',
    fixture: 'examples/cider/surfmob/Tbicmpd1.cir',
    analysis: 'tran',
    probes: ['3', '4'],
    netlist: `Tbicmpd1 form, two periods\nVIN 3 2 0v (PULSE 0.0v 4.2v 0ns 1ns 1ns 9ns 20ns)\nVREF 2 0 1\n${rc('3', '4')}\n.TRAN 0.1ns 40ns\n.end\n`,
  },
  {
    id: 'arbitrary-phase-pulse-np-tran',
    source: { name: 'v2', node: '2' },
    form: 'eighth PULSE field (NP) and sixth SIN field',
    fixture: 'examples/xspice/original-examples/arbitrary_phase.deck',
    analysis: 'tran',
    probes: ['1', '2', '3'],
    netlist: [
      'arbitrary_phase form',
      'v1 1 0 0.0 sin(0 1 1k 0 0 45.0)',
      'r1 1 0 1k',
      'v2 2 0 0.0 pulse(-1 1 0 1e-5 1e-5 5e-4 1e-3 45.0)',
      'r2 2 3 1k',
      'c2 3 0 10n',
      '.tran 2e-5 2e-3',
      '.end',
      '',
    ].join('\n'),
  },
  {
    id: 'arbitrary-phase-sin-tran',
    form: 'sixth SIN field (phase), already supported; control for the deck above',
    fixture: 'examples/xspice/original-examples/arbitrary_phase.deck',
    source: { name: 'v1', node: '1' },
    analysis: 'tran',
    probes: ['1'],
    netlist: 'arbitrary_phase sin\nv1 1 0 0.0 sin(0 1 1k 0 0 45.0)\nr1 1 0 1k\n.tran 2e-5 2e-3\n.end\n',
  },
  {
    id: 'pulse-np-truncation-tran',
    source: { name: 'V3', node: '3' },
    form: 'eighth PULSE field (NP) ending the train inside the run',
    fixture: '(synthetic: NP=2 over five periods, same grammar as arbitrary_phase.deck)',
    analysis: 'tran',
    probes: ['3', '4'],
    netlist: 'NP truncation\nV3 3 0 0 PULSE(0 1 0 0.1 0.1 0.3 1 2)\nR3 3 4 1\nC3 4 0 0.05\n.tran 0.1 5\n.end\n',
  },
  {
    id: 'digital-models-paren-pairs-tran',
    source: { name: 'v2', node: '200' },
    form: 'DC keyword + PWL( (t v) ... ) parenthesised pairs',
    fixture: 'examples/xspice/original-examples/digital_models1.deck',
    analysis: 'tran',
    probes: ['200', '201'],
    netlist: 'digital_models form\nv2 200 0 DC PWL( (0 0.0) (2 0.0) (2.0000000001 1.0) (3 1.0) ) \nR1 200 201 1\nC1 201 0 0.1\n.tran .01s 4s\n.end\n',
  },
  {
    id: 'hybrid-paren-pairs-tran',
    source: { name: 'v1', node: '1' },
    form: 'DC keyword + PWL( (t v) (t v) )',
    fixture: 'examples/xspice/original-examples/hybrid_models1_transient.deck',
    analysis: 'tran',
    probes: ['1', '11'],
    netlist: 'hybrid form\nv1 1 0 DC PWL( (0 0.0)  (1 1.0) ) \nR1 1 11 1\nC1 11 0 0.1\n.tran .01s 1s\n.end\n',
  },
];

interface Series { grid: number[]; signals: Record<string, number[]> }

function ngspiceVersion(): string {
  const out = execFileSync('ngspice', ['-v'], { encoding: 'utf8' });
  return out.match(/ngspice-\d+/)?.[0] ?? 'unknown';
}

function runNgspice(c: Case): Series {
  const dir = mkdtempSync(join(tmpdir(), 'spicets-492-'));
  try {
    const out = join(dir, 'out.txt');
    const vectors = c.analysis === 'ac'
      ? c.probes.flatMap(p => [`vm(${p})`, `vp(${p})`])
      : c.probes.map(p => `v(${p})`);
    const control = [
      '.control', 'set wr_singlescale', 'set wr_vecnames', 'option numdgt=15',
      'run', `wrdata ${out} ${vectors.join(' ')}`, 'quit', '.endc',
    ].join('\n');
    const deck = c.netlist.replace(/\.end\s*$/i, `${control}\n.end\n`);
    writeFileSync(join(dir, 'deck.cir'), deck);
    execFileSync('ngspice', ['-b', join(dir, 'deck.cir')], { encoding: 'utf8', stdio: 'pipe' });
    const lines = readFileSync(out, 'utf8').trim().split('\n');
    const rows = lines.slice(1).map(line => line.trim().split(/\s+/).map(Number));
    const grid = rows.map(row => row[0]);
    const signals: Record<string, number[]> = {};
    vectors.forEach((name, i) => { signals[name] = rows.map(row => row[i + 1]); });
    if (c.analysis === 'ac') {
      for (const p of c.probes) signals[`vp(${p})`] = signals[`vp(${p})`].map(r => r * 180 / Math.PI);
    }
    return { grid, signals };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function runSpiceTs(c: Case, netlist = c.netlist): Promise<Series> {
  const result = await simulate(netlist);
  const signals: Record<string, number[]> = {};
  if (c.analysis === 'op') {
    for (const p of c.probes) signals[`v(${p})`] = [result.dc!.voltage(p)];
    return { grid: [0], signals };
  }
  if (c.analysis === 'ac') {
    for (const p of c.probes) {
      const v = result.ac!.voltage(p);
      signals[`vm(${p})`] = v.map(x => x.magnitude);
      signals[`vp(${p})`] = v.map(x => x.phase);
    }
    return { grid: result.ac!.frequencies, signals };
  }
  for (const p of c.probes) signals[`v(${p})`] = result.transient!.voltage(p);
  return { grid: result.transient!.time, signals };
}

function interpolate(grid: number[], values: number[], x: number): number {
  if (x <= grid[0]) return values[0];
  if (x >= grid[grid.length - 1]) return values[values.length - 1];
  let lo = 0;
  let hi = grid.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (grid[mid] <= x) lo = mid; else hi = mid;
  }
  if (grid[hi] === grid[lo]) return values[hi];
  return values[lo] + (values[hi] - values[lo]) * (x - grid[lo]) / (grid[hi] - grid[lo]);
}

async function main(): Promise<void> {
  const version = ngspiceVersion();
  const rows = [];
  for (const c of cases) {
    const ng = runNgspice(c);
    let ts: Series;
    try {
      ts = await runSpiceTs(c);
    } catch (error) {
      rows.push({ id: c.id, form: c.form, fixture: c.fixture, status: 'spice-ts-error', error: String(error) });
      continue;
    }
    const signals = Object.keys(ng.signals).map((name) => {
      const ref = ng.signals[name];
      const got = ng.grid.map(x => interpolate(ts.grid, ts.signals[name], x));
      const peak = Math.max(...ref.map(Math.abs), 1e-30);
      let maxAbs = 0;
      for (let i = 0; i < ref.length; i++) maxAbs = Math.max(maxAbs, Math.abs(got[i] - ref[i]));
      return { name, points: ref.length, maxAbsError: maxAbs, maxRelErrorOfPeak: maxAbs / peak };
    });
    // The same deck with every parenthesis replaced by a space must give
    // bit-identical spice-ts output: the new grammar only removes separators.
    const canonical = c.netlist.replace(/[()]/g, ' ');
    const canonicalSeries = await runSpiceTs(c, canonical);
    const identicalToUnparenthesised = canonicalSeries.grid.length === ts.grid.length
      && canonicalSeries.grid.every((x, i) => x === ts.grid[i])
      && Object.keys(ts.signals).every(name =>
        canonicalSeries.signals[name].every((x, i) => x === ts.signals[name][i]));
    let sourceWaveformAtNgspiceTimes;
    if (c.source) {
      const device = parse(c.netlist).compile().devices.find(d => d.name === c.source!.name);
      if (!(device instanceof VoltageSource)) throw new Error(`${c.id}: ${c.source.name} is not a voltage source`);
      const ref = ng.signals[`v(${c.source.node})`];
      let maxAbs = 0;
      ng.grid.forEach((t, i) => {
        const value = device.getVoltageAtTime(t) + (c.source!.offset ?? 0);
        maxAbs = Math.max(maxAbs, Math.abs(value - ref[i]));
      });
      const peak = Math.max(...ref.map(Math.abs), 1e-30);
      sourceWaveformAtNgspiceTimes = {
        name: `${c.source.name} -> v(${c.source.node})`,
        points: ref.length,
        maxAbsError: maxAbs,
        maxRelErrorOfPeak: maxAbs / peak,
      };
    }
    rows.push({
      id: c.id,
      form: c.form,
      fixture: c.fixture,
      analysis: c.analysis,
      netlistSha256: createHash('sha256').update(c.netlist).digest('hex'),
      ngspicePoints: ng.grid.length,
      spiceTsPoints: ts.grid.length,
      status: 'compared',
      identicalToUnparenthesised,
      ...(sourceWaveformAtNgspiceTimes ? { sourceWaveformAtNgspiceTimes } : {}),
      signals,
    });
  }
  const report = {
    issue: 492,
    ngspice: version,
    method: [
      'signals: spice-ts transient/AC output linearly interpolated onto ngspice output points',
      '(includes interpolation and timestep-control differences);',
      'sourceWaveformAtNgspiceTimes: the compiled spice-ts source evaluated exactly at ngspice output times;',
      'relative error is max |error| / max |ngspice|.',
    ].join(' '),
    cases: rows,
  };
  const path = resolve('benchmarks/source-waveform-syntax/report.json');
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  for (const row of rows) {
    if (row.status !== 'compared') { console.log(`${row.id}: ${row.status} ${'error' in row ? row.error : ''}`); continue; }
    console.log(`${row.id.padEnd(34)} identical-to-unparenthesised=${'identicalToUnparenthesised' in row ? row.identicalToUnparenthesised : '?'}`);
    const src = 'sourceWaveformAtNgspiceTimes' in row ? row.sourceWaveformAtNgspiceTimes : undefined;
    if (src) console.log(`${row.id.padEnd(34)} ${'source'.padEnd(8)} n=${String(src.points).padStart(5)} maxAbs=${src.maxAbsError.toExponential(3)} rel=${src.maxRelErrorOfPeak.toExponential(3)}`);
    for (const s of row.signals!) {
      console.log(`${row.id.padEnd(34)} ${s.name.padEnd(8)} n=${String(s.points).padStart(5)} maxAbs=${s.maxAbsError.toExponential(3)} rel=${s.maxRelErrorOfPeak.toExponential(3)}`);
    }
  }
}

void main();
