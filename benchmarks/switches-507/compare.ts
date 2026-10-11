#!/usr/bin/env tsx
/**
 * Issue #507: compare spice-ts S/W switches with ngspice-47 on identical
 * netlists (transient hysteresis decks, AC and noise after an operating
 * point).
 *
 * usage: pnpm exec tsx benchmarks/switches-507/compare.ts
 *
 * Each fixture's `.control` block (if any) and `.end` are removed. That body
 * is the netlist both engines read; ngspice additionally gets a `.control`
 * block that runs the deck and writes the compared vectors with `wrdata`.
 *
 * Metrics:
 * - tran: spice-ts linearly interpolated onto every ngspice timepoint, max
 *   |error| in volts per vector (`atNgspicePoints`), and the reverse
 *   (`atSpiceTsPoints`, ngspice interpolated onto spice-ts points, the
 *   corpus harness view) normalised by the ngspice peak |value|.
 * - ac / noise: per-frequency relative error of |V| or the noise densities.
 *
 * Writes benchmarks/switches-507/report.json and prints it.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate } from '../../packages/core/src/index.js';

interface Case {
  fixture: string;
  kind: 'tran' | 'ac' | 'noise';
  /** Node names for tran/ac; unused for noise. */
  nodes: string[];
}

const CASES: Case[] = [
  { fixture: 'switches-manual-p92.cir', kind: 'tran', nodes: ['1', '10', '2', '20', '30', '40'] },
  { fixture: 'hysteresis.cir', kind: 'tran', nodes: ['c', 'o1', 'o2', 'o3'] },
  { fixture: 'ac-closed.cir', kind: 'ac', nodes: ['o'] },
  { fixture: 'ac-window.cir', kind: 'ac', nodes: ['o'] },
  { fixture: 'ac-csw.cir', kind: 'ac', nodes: ['o'] },
  { fixture: 'noise-sw.cir', kind: 'noise', nodes: [] },
  { fixture: 'noise-csw.cir', kind: 'noise', nodes: [] },
];

const here = dirname(fileURLToPath(import.meta.url));

void main();

async function main(): Promise<void> {
  const ngspiceVersion = execFileSync('ngspice', ['-v'], { encoding: 'utf8' })
    .split('\n').find(line => /ngspice-\d+/.test(line))?.replace(/\*+/g, '').trim();
  const results = [];
  for (const entry of CASES) results.push(await compare(entry));
  const report = { ngspice: ngspiceVersion, generatedBy: 'benchmarks/switches-507/compare.ts', results };
  writeFileSync(join(here, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

async function compare(entry: Case): Promise<Record<string, unknown>> {
  const raw = readFileSync(join(here, 'fixtures', entry.fixture));
  const body = raw.toString('utf8')
    .replace(/^\s*\.control[\s\S]*?^\s*\.endc[^\n]*\n?/im, '')
    .replace(/^\s*\.end\s*$/im, '');
  const record: Record<string, unknown> = {
    fixture: entry.fixture,
    sha256: createHash('sha256').update(raw).digest('hex'),
    kind: entry.kind,
  };
  const workspace = mkdtempSync(join(tmpdir(), 'spicets-switches-507-'));
  try {
    const dataPath = join(workspace, 'out.dat');
    const write = entry.kind === 'tran'
      ? `wrdata ${dataPath} ${entry.nodes.map(node => `v(${node})`).join(' ')}`
      : entry.kind === 'ac'
        ? `wrdata ${dataPath} ${entry.nodes.map(node => `vm(${node})`).join(' ')}`
        : `setplot noise1\nwrdata ${dataPath} onoise_spectrum inoise_spectrum`;
    writeFileSync(join(workspace, 'deck.cir'), `${body}\n.control\nrun\n${write}\nquit\n.endc\n.end\n`);
    execFileSync('ngspice', ['-b', join(workspace, 'deck.cir')], { stdio: 'ignore', timeout: 600_000 });
    // wrdata: one x column then one value column per vector (x repeated per vector).
    const rows = readFileSync(dataPath, 'utf8').trim().split('\n')
      .map(line => line.trim().split(/\s+/).map(Number));
    const x = rows.map(row => row[0]);
    const column = (k: number) => rows.map(row => row[2 * k + 1]);

    const result = await simulate(`${body}\n.end\n`);
    if (entry.kind === 'tran') {
      const tran = result.transient!;
      const time = [...tran.time];
      const perNode: Record<string, unknown> = {};
      entry.nodes.forEach((node, k) => {
        const reference = column(k);
        const values = [...tran.voltage(node)];
        const peak = Math.max(...reference.map(Math.abs), 1e-12);
        let atNg = 0;
        x.forEach((t, i) => { atNg = Math.max(atNg, Math.abs(interpolate(time, values, t) - reference[i])); });
        let atTs = 0;
        time.forEach((t, i) => { atTs = Math.max(atTs, Math.abs(values[i] - interpolate(x, reference, t))); });
        perNode[`v(${node})`] = {
          maxAbsAtNgspicePointsV: Number(atNg.toExponential(3)),
          maxAbsAtSpiceTsPointsOverPeak: Number((atTs / peak).toExponential(3)),
        };
      });
      record.points = { ngspice: x.length, spiceTs: time.length };
      record.perVector = perNode;
    } else if (entry.kind === 'ac') {
      const ac = result.ac!;
      record.perVector = Object.fromEntries(entry.nodes.map((node, k) => {
        const reference = column(k);
        const values = ac.voltage(node).map(v => v.magnitude);
        return [`vm(${node})`, {
          ngspice: reference,
          spiceTs: values,
          maxRelErr: Number(maxRelative(values, reference).toExponential(3)),
        }];
      }));
    } else {
      const noise = result.noise!;
      const pairs = [
        ['onoise_spectrum', noise.outputNoiseDensity, column(0)],
        ['inoise_spectrum', noise.inputNoiseDensity, column(1)],
      ] as const;
      record.perVector = Object.fromEntries(pairs.map(([name, values, reference]) => [name, {
        ngspice: reference,
        spiceTs: values.map(v => Number(v.toPrecision(7))),
        maxRelErr: Number(maxRelative(values, reference).toExponential(3)),
      }]));
    }
    return record;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function maxRelative(values: readonly number[], reference: readonly number[]): number {
  if (values.length !== reference.length) return Infinity;
  return Math.max(...values.map((v, i) => Math.abs(v / reference[i] - 1)));
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
