#!/usr/bin/env tsx
/**
 * Issue #657: compare spice-ts BSIM1 (LEVEL=4) and BSIM2 (LEVEL=5) MOSFETs
 * with ngspice-47 on identical netlists.
 *
 * usage: pnpm exec tsx benchmarks/bsim12-657/compare.ts
 *
 * Decks: the two aggregate corpus fixtures (classic/bsim1-device-sweep and
 * classic/bsim2-device-sweep, read from benchmarks/corpus/classic) and the
 * project-authored decks in ./fixtures. Each deck's `.end` is removed; that
 * body is the netlist both engines read, and ngspice additionally gets a
 * `.control` block that runs it and writes the compared vectors with `wrdata`.
 *
 * Metrics per vector:
 * - dc: max |spice-ts - ngspice| over the shared sweep points, also divided by
 *   the ngspice peak |value| (`maxAbsOverPeak`).
 * - ac: max relative |V| error and max phase error in degrees per frequency.
 * - tran: spice-ts linearly interpolated onto every ngspice timepoint, max
 *   |error| (`maxAbsAtNgspicePoints`) and the same divided by the ngspice peak.
 *
 * Writes benchmarks/bsim12-657/report.json and prints it.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate } from '../../packages/core/src/index.js';

interface Case {
  /** Path relative to the repository root. */
  path: string;
  kind: 'dc' | 'tran' | 'ac';
  /** Compared vectors: `i(<source>)` or `v(<node>)` (AC: node voltages only). */
  vectors: string[];
}

const SWEEP_CURRENTS = ['i(v1)', 'i(v2)', 'i(v3)', 'i(v4)', 'i(v5)', 'i(vds)'];

const CASES: Case[] = [
  { path: 'benchmarks/corpus/classic/fixtures/spice3f5/bsim1tst.cir', kind: 'dc', vectors: SWEEP_CURRENTS },
  { path: 'benchmarks/corpus/classic/fixtures/spice3f5/bsim2tst.cir', kind: 'dc', vectors: SWEEP_CURRENTS },
  { path: 'benchmarks/bsim12-657/fixtures/bsim1-output-inverse.cir', kind: 'dc', vectors: ['i(v1)', 'i(v2)'] },
  { path: 'benchmarks/bsim12-657/fixtures/bsim2-pmos-output.cir', kind: 'dc', vectors: ['i(v1)', 'i(v2)'] },
  { path: 'benchmarks/bsim12-657/fixtures/bsim1-rload-tran.cir', kind: 'tran', vectors: ['v(out)', 'i(vdd)'] },
  { path: 'benchmarks/bsim12-657/fixtures/bsim2-inverter-tran.cir', kind: 'tran', vectors: ['v(out)', 'i(vdd)'] },
  { path: 'benchmarks/bsim12-657/fixtures/bsim1-cs-ac.cir', kind: 'ac', vectors: ['v(out)'] },
  { path: 'benchmarks/bsim12-657/fixtures/bsim2-cs-ac.cir', kind: 'ac', vectors: ['v(out)'] },
];

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

void main();

async function main(): Promise<void> {
  const ngspiceVersion = execFileSync('ngspice', ['-v'], { encoding: 'utf8' })
    .split('\n').find(line => /ngspice-\d+/.test(line))?.replace(/\*+/g, '').trim();
  const results = [];
  for (const entry of CASES) {
    try {
      results.push(await compare(entry));
    } catch (error) {
      results.push({ deck: entry.path, kind: entry.kind, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const report = { ngspice: ngspiceVersion, generatedBy: 'benchmarks/bsim12-657/compare.ts', results };
  writeFileSync(join(here, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

async function compare(entry: Case): Promise<Record<string, unknown>> {
  const raw = readFileSync(join(root, entry.path));
  const body = raw.toString('utf8').replace(/^\s*\.end\s*$/im, '');
  const record: Record<string, unknown> = {
    deck: entry.path,
    sha256: createHash('sha256').update(raw).digest('hex'),
    kind: entry.kind,
  };
  const workspace = mkdtempSync(join(tmpdir(), 'spicets-bsim12-657-'));
  try {
    const dataPath = join(workspace, 'out.dat');
    const written = entry.kind === 'ac'
      ? entry.vectors.flatMap(name => [`vm${name.slice(1)}`, `vp${name.slice(1)}`])
      : entry.vectors;
    writeFileSync(
      join(workspace, 'deck.cir'),
      `${body}\n.control\nrun\nwrdata ${dataPath} ${written.join(' ')}\nquit\n.endc\n.end\n`,
    );
    execFileSync('ngspice', ['-b', join(workspace, 'deck.cir')], { stdio: 'ignore', timeout: 600_000 });
    // wrdata: one x column then one value column per vector (x repeated per vector).
    const rows = readFileSync(dataPath, 'utf8').trim().split('\n')
      .map(line => line.trim().split(/\s+/).map(Number));
    const x = rows.map(row => row[0]);
    const column = (k: number) => rows.map(row => row[2 * k + 1]);

    const result = await simulate(`${body}\n.end\n`);
    const perVector: Record<string, unknown> = {};
    if (entry.kind === 'dc') {
      const sweep = result.dcSweep!;
      const sweepX = [...sweep.sweepValues];
      if (sweepX.length !== x.length || sweepX.some((value, i) => Math.abs(value - x[i]) > 1e-9)) {
        throw new Error(`${entry.path}: sweep grids differ (${sweepX.length} vs ${x.length} points)`);
      }
      entry.vectors.forEach((name, k) => {
        const reference = column(k);
        const values = [...vector(name, n => sweep.voltage(n), n => sweep.current(n))];
        const peak = Math.max(...reference.map(Math.abs), 1e-300);
        const maxAbs = Math.max(...values.map((value, i) => Math.abs(value - reference[i])));
        perVector[name] = {
          peak: Number(peak.toExponential(4)),
          maxAbs: Number(maxAbs.toExponential(3)),
          maxAbsOverPeak: Number((maxAbs / peak).toExponential(3)),
        };
      });
      record.points = { ngspice: x.length, spiceTs: sweepX.length };
    } else if (entry.kind === 'ac') {
      const ac = result.ac!;
      entry.vectors.forEach((name, k) => {
        const magnitude = column(2 * k);
        const phaseRad = column(2 * k + 1);
        const values = ac.voltage(name.slice(2, -1));
        if (values.length !== x.length) throw new Error(`${entry.path}: AC grids differ`);
        let maxRel = 0;
        let maxPhase = 0;
        values.forEach((value, i) => {
          maxRel = Math.max(maxRel, Math.abs(value.magnitude / magnitude[i] - 1));
          const delta = value.phase - phaseRad[i] * 180 / Math.PI;
          maxPhase = Math.max(maxPhase, Math.abs(((delta + 540) % 360) - 180));
        });
        perVector[name] = {
          maxRelMagnitude: Number(maxRel.toExponential(3)),
          maxAbsPhaseDeg: Number(maxPhase.toExponential(3)),
        };
      });
      record.points = { ngspice: x.length, spiceTs: ac.frequencies.length };
    } else {
      const tran = result.transient!;
      const time = [...tran.time];
      entry.vectors.forEach((name, k) => {
        const reference = column(k);
        const values = vector(name, n => tran.voltage(n), n => tran.current(n));
        const peak = Math.max(...reference.map(Math.abs), 1e-300);
        let maxAbs = 0;
        x.forEach((t, i) => { maxAbs = Math.max(maxAbs, Math.abs(interpolate(time, values, t) - reference[i])); });
        perVector[name] = {
          peak: Number(peak.toExponential(4)),
          maxAbsAtNgspicePoints: Number(maxAbs.toExponential(3)),
          maxAbsOverPeak: Number((maxAbs / peak).toExponential(3)),
        };
      });
      record.points = { ngspice: x.length, spiceTs: time.length };
    }
    record.perVector = perVector;
    return record;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function vector<T>(name: string, voltage: (node: string) => T, current: (source: string) => T): T {
  const match = /^([iv])\((.+)\)$/i.exec(name);
  if (!match) throw new Error(`unsupported vector ${name}`);
  return match[1].toLowerCase() === 'v' ? voltage(match[2]) : current(match[2].toUpperCase());
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
