#!/usr/bin/env tsx
/**
 * Issue #500: compare spice-ts NMF/NHFET Z-card devices (MES level 1, MESA
 * levels 2/3, HFET1 RDI/RSI) with ngspice-47 on identical netlists.
 *
 * usage: pnpm exec tsx benchmarks/mesfet-hfet-500/compare.ts
 *
 * Needs `ngspice` on PATH (ngspice-47 was used). Each fixture's `.end` is
 * removed; that body is the netlist both engines read. ngspice additionally
 * gets a `.control` block that runs the deck and writes the compared vectors
 * with `wrdata` (the decks' own `.print` cards are inert in batch mode with a
 * control block).
 *
 * Metric per vector: max |spice-ts - ngspice| over the ngspice points divided
 * by max(peak |ngspice|, 1e-12) (spice-ts interpolated onto the ngspice
 * timepoints for .tran; DC and AC grids are identical). AC compares the
 * complex value. Writes benchmarks/mesfet-hfet-500/report.json.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate } from '../../packages/core/src/index.js';

type Vector = { kind: 'v'; node: string } | { kind: 'i'; source: string };
interface Case {
  fixture: string;
  analysis: 'dc' | 'ac' | 'tran';
  vectors: Vector[];
  /** Upstream ngspice deck (byte-identical) or project-authored. */
  origin: 'ngspice' | 'authored';
}

const v = (node: string): Vector => ({ kind: 'v', node });
const i = (source: string): Vector => ({ kind: 'i', source });

const CASES: Case[] = [
  { fixture: 'hfet-id_vgs.cir', analysis: 'dc', vectors: [i('vds')], origin: 'ngspice' },
  { fixture: 'mes-subth.cir', analysis: 'dc', vectors: [i('vids')], origin: 'ngspice' },
  { fixture: 'mesa-mesa13.cir', analysis: 'dc', vectors: [i('vig')], origin: 'ngspice' },
  { fixture: 'mesa-mesa15.cir', analysis: 'dc', vectors: [i('vids')], origin: 'ngspice' },
  { fixture: 'mesa-mesa21.cir', analysis: 'dc', vectors: [i('vids')], origin: 'ngspice' },
  { fixture: 'mesa-mesgout.cir', analysis: 'ac', vectors: [v('3')], origin: 'ngspice' },
  { fixture: 'mesa-mesinv.cir', analysis: 'dc', vectors: [v('70')], origin: 'ngspice' },
  { fixture: 'authored-hfet-rsi.cir', analysis: 'dc', vectors: [i('vds')], origin: 'authored' },
  { fixture: 'authored-mes-inverse.cir', analysis: 'dc', vectors: [i('vds'), i('vgs')], origin: 'authored' },
  { fixture: 'authored-mes-ac.cir', analysis: 'ac', vectors: [v('d'), v('gi')], origin: 'authored' },
  { fixture: 'authored-mes-tran.cir', analysis: 'tran', vectors: [v('d'), v('gi')], origin: 'authored' },
  { fixture: 'authored-mesa-alpha-ac.cir', analysis: 'ac', vectors: [v('d')], origin: 'authored' },
  { fixture: 'authored-mesa-rirf-tran.cir', analysis: 'tran', vectors: [v('d'), i('vin')], origin: 'authored' },
  { fixture: 'authored-mesa3-ac.cir', analysis: 'ac', vectors: [v('d')], origin: 'authored' },
  { fixture: 'authored-mesa3-tran.cir', analysis: 'tran', vectors: [v('d'), i('vin')], origin: 'authored' },
];

const here = dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);

void main();

async function main(): Promise<void> {
  const ngspiceVersion = execFileSync('ngspice', ['-v'], { encoding: 'utf8' })
    .split('\n').find(line => /ngspice-\d+/.test(line))?.replace(/\*+/g, '').trim();
  const results = [];
  for (const entry of CASES) {
    if (only.length > 0 && !only.includes(entry.fixture)) continue;
    results.push(await compare(entry));
  }
  const report = { ngspice: ngspiceVersion, generatedBy: 'benchmarks/mesfet-hfet-500/compare.ts', results };
  if (only.length === 0) writeFileSync(join(here, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(results.map(r => ({ fixture: r.fixture, worst: r.worst, perVector: r.perVector })), null, 2));
}

function ngspiceName(vector: Vector): string {
  return vector.kind === 'v' ? `v(${vector.node})` : `i(${vector.source})`;
}

async function compare(entry: Case) {
  const raw = readFileSync(join(here, 'fixtures', entry.fixture));
  const body = raw.toString('utf8').replace(/^\s*\.end\s*$/im, '');
  const workspace = mkdtempSync(join(tmpdir(), 'spicets-mesfet-500-'));
  try {
    const dataPath = join(workspace, 'out.dat');
    const names = entry.vectors.flatMap(vector => entry.analysis === 'ac'
      ? [`real(${ngspiceName(vector)})`, `imag(${ngspiceName(vector)})`]
      : [ngspiceName(vector)]);
    writeFileSync(join(workspace, 'deck.cir'),
      `${body}\n.control\nset wr_vecnames=0\noption numdgt=15\nrun\nwrdata ${dataPath} ${names.join(' ')}\nquit\n.endc\n.end\n`);
    execFileSync('ngspice', ['-b', join(workspace, 'deck.cir')], { stdio: 'ignore', timeout: 600_000 });
    // wrdata: one x column then one value column per vector (x repeated per vector).
    const rows = readFileSync(dataPath, 'utf8').trim().split('\n')
      .map(line => line.trim()).filter(line => line.length > 0)
      .map(line => line.split(/\s+/).map(Number));
    const x = rows.map(row => row[0]);
    const column = (k: number) => rows.map(row => row[2 * k + 1]);

    const result = await simulate(`${body}\n.end\n`);
    const perVector: Record<string, unknown> = {};
    let worst = 0;
    entry.vectors.forEach((vector, k) => {
      let error = 0;
      let peak = 1e-12;
      let points = 0;
      if (entry.analysis === 'ac') {
        const ac = result.ac!;
        const values = vector.kind === 'v' ? ac.voltage(vector.node) : ac.current(vector.source);
        const re = column(2 * k);
        const im = column(2 * k + 1);
        points = values.length;
        if (values.length !== re.length) throw new Error(`${entry.fixture}: ${values.length} vs ${re.length} AC points`);
        values.forEach((value, n) => {
          const phase = value.phase * Math.PI / 180;
          const dr = value.magnitude * Math.cos(phase) - re[n];
          const di = value.magnitude * Math.sin(phase) - im[n];
          error = Math.max(error, Math.hypot(dr, di));
          peak = Math.max(peak, Math.hypot(re[n], im[n]));
        });
      } else {
        const reference = column(k);
        peak = Math.max(peak, ...reference.map(Math.abs));
        if (entry.analysis === 'dc') {
          const sweep = result.dcSweep!;
          const values = vector.kind === 'v' ? sweep.voltage(vector.node) : sweep.current(vector.source);
          points = values.length;
          if (values.length !== reference.length) {
            throw new Error(`${entry.fixture}: ${values.length} vs ${reference.length} DC points`);
          }
          values.forEach((value, n) => { error = Math.max(error, Math.abs(value - reference[n])); });
        } else {
          const tran = result.transient!;
          const time = [...tran.time];
          const values = [...(vector.kind === 'v' ? tran.voltage(vector.node) : tran.current(vector.source))];
          points = time.length;
          x.forEach((t, n) => { error = Math.max(error, Math.abs(interpolate(time, values, t) - reference[n])); });
        }
      }
      const normalized = error / peak;
      worst = Math.max(worst, normalized);
      perVector[ngspiceName(vector)] = {
        points: { ngspice: x.length, spiceTs: points },
        peakNgspice: Number(peak.toPrecision(6)),
        maxAbsError: Number(error.toPrecision(3)),
        maxErrorOverPeak: Number(normalized.toPrecision(3)),
      };
    });
    return {
      fixture: entry.fixture,
      origin: entry.origin,
      sha256: createHash('sha256').update(raw).digest('hex'),
      analysis: entry.analysis,
      worst: Number(worst.toPrecision(3)),
      perVector,
    };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function interpolate(time: readonly number[], values: readonly number[], t: number): number {
  if (t <= time[0]) return values[0];
  let lo = 0;
  let hi = time.length - 1;
  if (t >= time[hi]) return values[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (time[mid] <= t) lo = mid; else hi = mid;
  }
  const f = (t - time[lo]) / (time[hi] - time[lo]);
  return values[lo] + f * (values[hi] - values[lo]);
}
