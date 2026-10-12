#!/usr/bin/env tsx
/**
 * Generate ngspice-47 reference values for the #594 BSIM3v32 parity cases.
 *
 *   pnpm exec tsx benchmarks/bsim3v32-594/reference.ts
 *
 * Writes benchmarks/bsim3v32-594/ngspice-47-bsim3v32.json with, for every case
 * in cards.ts, run in ngspice batch mode on the stored deck bytes:
 *
 * - DC: @m1[id|gm|gds|gmbs|vth] and i(vd) at each VGS/VDS/VBS grid point
 *   (alter + op), and the i(vd) vector of the Id-Vds sweep deck;
 * - charge: @m1[cgg..cds|qg|qb|qd|capbd|capbs] at each #626 charge-grid point
 *   (alter + one-point ac, which loads the device with its charges), and the
 *   AC terminal capacitance matrices on the #626 AC grid at 1 GHz;
 * - transient: the inverter-chain deck (unchanged corpus-f TSMC VERSION =
 *   3.2.2 cards) sampled between the PULSE corners, with the supply charge
 *   integrated over a window around each sample.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { operatingPointDeck, sweepDeck } from '../bsim3-dc-589/cards.js';
import { AC_FREQUENCY, AC_GRID, CHARGE_GRID, chargeDeck } from '../bsim3-charge-626/cards.js';
import {
  BSIM3V32_CHARGE_CASES, BSIM3V32_DC_CASES, CHAIN_SAMPLE_TIMES, CHAIN_SIGNALS, CHAIN_WINDOW,
  VBS_GRID, VDS_GRID, VGS_GRID, compoundsJunctionCaps, inverterChainDeck, withTemperature, type Bsim3v32Case,
} from './cards.js';

type Bsim3DcCase = Bsim3v32Case;

const OUTPUT = new URL('./ngspice-47-bsim3v32.json', import.meta.url);
const DC_QUANTITIES = ['id', 'gm', 'gds', 'gmbs', 'vth'] as const;
const CHARGE_QUANTITIES = ['cgg', 'cgd', 'cgs', 'cbg', 'cbd', 'cbs', 'cdg', 'cdd', 'cds', 'qg', 'qb', 'qd', 'capbd', 'capbs'] as const;
const SOURCES = ['vg', 'vd', 'vb'] as const;

function runNgspice(deck: string, raw = false): { stdout: string; raw?: string } {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'bsim3v32-594-'));
  try {
    writeFileSync(join(dir, 'deck.cir'), deck);
    writeFileSync(join(dir, '.spiceinit'), 'set filetype=ascii\n');
    // cwd = dir: BSIM3 parameter checking writes its check log into the working directory.
    const args = raw ? ['-b', '-r', 'deck.raw', 'deck.cir'] : ['-b', 'deck.cir'];
    const stdout = execFileSync('ngspice', args, {
      cwd: dir, env: { ...process.env, HOME: dir }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, raw: raw ? readFileSync(join(dir, 'deck.raw'), 'utf8') : undefined };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function withControl(deck: string, control: string[]): string {
  const lines = deck.split('\n');
  const end = lines.lastIndexOf('.end');
  return [...lines.slice(0, end), '.control', 'set numdgt=15', ...control, '.endc', '.end'].join('\n');
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const escape = (label: string) => label.replace(/[[\]()@]/g, '\\$&');

function blocksOf(output: string, marker: string, expected: number, name: string): string[] {
  const blocks = output.split(new RegExp(`^${marker} `, 'm')).slice(1);
  if (blocks.length !== expected) throw new Error(`${name}: expected ${expected} ${marker} blocks, got ${blocks.length}\n${output}`);
  return blocks;
}

function real(block: string, label: string, name: string): number {
  const match = block.match(new RegExp(`^${escape(label)} = (\\S+)`, 'm'));
  if (!match) throw new Error(`${name}: missing ${label}\n${block}`);
  return Number(match[1]);
}

function imaginary(block: string, label: string, name: string): number {
  const match = block.match(new RegExp(`^${escape(label)} = (\\S+),(\\S+)`, 'm'));
  if (!match) throw new Error(`${name}: missing complex ${label}\n${block}`);
  return Number(match[2]);
}

type Bias = { vgs: number; vds: number; vbs: number };
const alterBias = (c: Bsim3DcCase, { vgs, vds, vbs }: Bias): string[] =>
  [`alter VD dc = ${c.type * vds}`, `alter VG dc = ${c.type * vgs}`, `alter VB dc = ${c.type * vbs}`];

function operatingPoints(c: Bsim3DcCase) {
  const biases = VBS_GRID.flatMap(vbs => VGS_GRID.flatMap(vgs => VDS_GRID.map(vds => ({ vgs, vds, vbs }))));
  const control = biases.flatMap((bias, index) => [
    ...alterBias(c, bias), 'op', `echo "POINT ${index}"`,
    `print ${DC_QUANTITIES.map(q => `@m1[${q}]`).join(' ')} i(vd)`,
  ]);
  const deck = withTemperature(operatingPointDeck(c), c);
  const { stdout } = runNgspice(withControl(deck, control));
  const points = blocksOf(stdout, 'POINT', biases.length, c.name).map((block, index) => ({
    ...biases[index],
    ...Object.fromEntries(DC_QUANTITIES.map(q => [q, real(block, `@m1[${q}]`, `${c.name} point ${index}`)])),
    ivd: real(block, 'i(vd)', `${c.name} point ${index}`),
  }));
  return { deck, deckSha256: sha256(deck), points };
}

function sweep(c: Bsim3DcCase) {
  const deck = withTemperature(sweepDeck(c), c);
  const { stdout } = runNgspice(withControl(deck, ['run', 'print v(d) i(vd)']));
  const points = [...stdout.matchAll(/^\d+\s+(\S+)\s+(\S+)\s+(\S+)\s*$/gm)]
    .map(([, , vd, ivd]) => ({ vd: Number(vd), ivd: Number(ivd) }));
  if (points.length === 0) throw new Error(`${c.name}: no sweep rows\n${stdout}`);
  return { deck, deckSha256: sha256(deck), points };
}

/**
 * Run `blocks` (one analysis each) in one ngspice session, or each in its own
 * session when the case compounds its junction capacitances per analysis.
 */
function runBlocks(c: Bsim3DcCase, deck: string, blocks: string[][]): string {
  if (!compoundsJunctionCaps(c)) return runNgspice(withControl(deck, blocks.flat())).stdout;
  return blocks.map(block => runNgspice(withControl(deck, block)).stdout).join('\n');
}

function charges(c: Bsim3DcCase) {
  const deck = withTemperature(chargeDeck(c), c);
  const blocks = CHARGE_GRID.map((bias, index) => [
    ...alterBias(c, bias), `ac lin 1 ${AC_FREQUENCY} ${AC_FREQUENCY}`, `echo "POINT ${index}"`,
    `print ${CHARGE_QUANTITIES.map(q => `@m1[${q}]`).join(' ')}`,
  ]);
  const stdout = runBlocks(c, deck, blocks);
  const points = blocksOf(stdout, 'POINT', CHARGE_GRID.length, c.name).map((block, index) => ({
    ...CHARGE_GRID[index],
    ...Object.fromEntries(CHARGE_QUANTITIES.map(q => [q, real(block, `@m1[${q}]`, `${c.name} point ${index}`)])),
  }));
  return { deck, deckSha256: sha256(deck), points };
}

function acMatrix(c: Bsim3DcCase) {
  const deck = withTemperature(chargeDeck(c), c);
  const omega = 2 * Math.PI * AC_FREQUENCY;
  const blocks = AC_GRID.flatMap((bias, index) => SOURCES.map(source => [
    ...alterBias(c, bias),
    ...SOURCES.map(s => `alter ${s} acmag = ${s === source ? 1 : 0}`),
    `ac lin 1 ${AC_FREQUENCY} ${AC_FREQUENCY}`, `echo "AC ${index} ${source}"`,
    `print ${SOURCES.map(s => `i(${s})`).join(' ')}`,
  ]));
  const stdout = runBlocks(c, deck, blocks);
  const results = blocksOf(stdout, 'AC', AC_GRID.length * SOURCES.length, c.name);
  const points = AC_GRID.map((bias, index) => ({
    ...bias,
    // c[excited][measured] = Im(i(measured)) / omega for 1 V on `excited`.
    c: Object.fromEntries(SOURCES.map((source, s) => [source, Object.fromEntries(SOURCES.map(measured => [
      measured, imaginary(results[index * SOURCES.length + s], `i(${measured})`, `${c.name} ac ${index} ${source}`) / omega,
    ]))])),
  }));
  return { deck, deckSha256: sha256(deck), frequency: AC_FREQUENCY, points };
}

/** Trapezoidal integral of `values(time)` over the window centred on `center`. */
export function windowCharge(time: readonly number[], values: readonly number[], center: number): number {
  const lo = center - CHAIN_WINDOW / 2;
  const hi = center + CHAIN_WINDOW / 2;
  const at = (t: number): number => {
    const j = time.findIndex(x => x >= t);
    if (j <= 0) return values[Math.max(j, 0)];
    return values[j - 1] + (values[j] - values[j - 1]) * (t - time[j - 1]) / (time[j] - time[j - 1]);
  };
  const points: [number, number][] = [[lo, at(lo)]];
  for (let k = 0; k < time.length; k++) if (time[k] > lo && time[k] < hi) points.push([time[k], values[k]]);
  points.push([hi, at(hi)]);
  let charge = 0;
  for (let k = 1; k < points.length; k++) charge += 0.5 * (points[k][1] + points[k - 1][1]) * (points[k][0] - points[k - 1][0]);
  return charge;
}

function transient() {
  const deck = inverterChainDeck();
  const lines = runNgspice(deck, true).raw!.split('\n');
  const variables: string[] = [];
  let index = lines.findIndex(line => line.startsWith('Variables:')) + 1;
  for (; !lines[index].startsWith('Values:'); index++) variables.push(lines[index].trim().split(/\s+/)[1].toLowerCase());
  const rows: number[][] = [];
  let row: number[] = [];
  for (const line of lines.slice(index + 1)) {
    const fields = line.trim().split(/\s+/).filter(Boolean);
    if (fields.length === 0) continue;
    row.push(Number(fields[fields.length - 1]));
    if (row.length === variables.length) { rows.push(row); row = []; }
  }
  const column = (name: string) => {
    const k = variables.indexOf(name);
    if (k < 0) throw new Error(`no ${name} in ${variables.join(', ')}`);
    return k;
  };
  const time = rows.map(r => r[0]);
  const series = (name: string) => rows.map(r => r[column(name)]);
  const at = (t: number, values: number[]): number => {
    const j = time.findIndex(x => x >= t);
    if (time[j] === t || j === 0) return values[j];
    return values[j - 1] + (values[j] - values[j - 1]) * (t - time[j - 1]) / (time[j] - time[j - 1]);
  };
  const supply = series('i(vdd)');
  const samples = CHAIN_SAMPLE_TIMES.map(t => ({
    time: t,
    ...Object.fromEntries(CHAIN_SIGNALS.map(s => [s, at(t, series(s))])),
    'q(vdd)': windowCharge(time, supply, t),
  }));
  return {
    deck,
    deckSha256: sha256(deck),
    ngspicePoints: rows.length,
    window: CHAIN_WINDOW,
    peak: {
      ...Object.fromEntries(CHAIN_SIGNALS.map(s => [s, Math.max(...series(s).map(Math.abs))])),
      'q(vdd)': Math.max(...samples.map(s => Math.abs(s['q(vdd)']))),
    },
    samples,
  };
}

// `--only name1,name2` regenerates just those cases (and keeps the rest of
// the committed reference); without it every case and the transient are run.
const onlyIndex = process.argv.indexOf('--only');
const only = onlyIndex >= 0 ? new Set(process.argv[onlyIndex + 1].split(',')) : undefined;
const previous = only ? JSON.parse(readFileSync(OUTPUT, 'utf8')) as {
  dc: { name: string }[]; charge: { name: string }[]; transient: unknown;
} : undefined;
const keep = <T extends { name: string }>(list: readonly T[] | undefined, name: string): T | undefined =>
  only && !only.has(name) ? list?.find(c => c.name === name) : undefined;

const version = execFileSync('ngspice', ['-v'], { encoding: 'utf8' }).match(/ngspice-\d+/)?.[0] ?? 'unknown';
const dc = BSIM3V32_DC_CASES.map(c => keep(previous?.dc, c.name) ?? {
  name: c.name, type: c.type, source: c.source, temperature: c.temperature ?? 27,
  operatingPoints: operatingPoints(c), sweep: sweep(c),
});
const charge = BSIM3V32_CHARGE_CASES.map(c => keep(previous?.charge, c.name) ?? {
  name: c.name, type: c.type, source: c.source, temperature: c.temperature ?? 27,
  ngspiceSessions: compoundsJunctionCaps(c) ? 'one per analysis (b3v32temp.c compounds TCJ per analysis)' : 'one',
  charges: charges(c), ac: acMatrix(c),
});
const json = JSON.stringify({
  schemaVersion: 'spice-ts-bsim3v32-reference/v1',
  engine: version,
  command: ['pnpm', 'exec', 'tsx', 'benchmarks/bsim3v32-594/reference.ts'],
  note: 'ngspice-47 reference only (bsim3v32 device); spice-ts values are computed by compare.ts and the parity test.',
  dc,
  charge,
  transient: only ? previous!.transient : transient(),
}, null, 1)
  // One bias point / sample per line.
  .replace(/\{\n\s*("(?:vgs|vd|time)"[^{}]*?)\n\s*\}/g, (_, body: string) => `{${body.replace(/\n\s*/g, '')}}`);
writeFileSync(OUTPUT, `${json}\n`);
console.log(`wrote ${dc.length} DC cases (${dc.reduce((n, c) => n + (c as { operatingPoints: { points: unknown[] } }).operatingPoints.points.length, 0)} operating points), `
  + `${charge.length} charge cases and ${CHAIN_SAMPLE_TIMES.length} transient samples from ${version}`
  + (only ? ` (regenerated: ${[...only].join(', ')})` : ''));
