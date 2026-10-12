#!/usr/bin/env tsx
/**
 * Generate ngspice-47 reference values for the BSIM3v3.3.0 charge model
 * (b3ld.c capMod 0-3, overlap and junction charge) for issue #626.
 *
 *   pnpm exec tsx benchmarks/bsim3-charge-626/reference.ts
 *
 * Writes benchmarks/bsim3-charge-626/ngspice-47-charge.json. The model cards
 * are the #589 cases (benchmarks/bsim3-dc-589/cards.ts) plus capMod 0/1/2 and
 * XPART variants of them (cards.ts in this directory). For every case the
 * operating-point deck is run once in ngspice batch mode with an unrolled
 * `.control` block that alters VD/VG/VB and runs a one-point `ac` (which loads
 * the device with MODEINITSMSIG, so b3ld.c evaluates its charges), then prints
 * the b3ld.c charge outputs @m1[cgg|cgd|cgs|cbg|cbd|cbs|cdg|cdd|cds] (intrinsic
 * capacitances), @m1[qg|qb|qd] (state charges incl. overlap and junction
 * charge) and @m1[capbd|capbs]. On a sparser bias grid it also records the
 * imaginary AC terminal currents for a 1 V excitation on each of G, D and B,
 * divided by omega: the full terminal capacitance matrix b3acld.c stamps.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AC_GRID, BSIM3_CHARGE_CASES, CHARGE_GRID, AC_FREQUENCY, chargeDeck, type Bsim3ChargeCase,
} from './cards.js';

const OUTPUT = new URL('./ngspice-47-charge.json', import.meta.url);
const QUANTITIES = ['cgg', 'cgd', 'cgs', 'cbg', 'cbd', 'cbs', 'cdg', 'cdd', 'cds', 'qg', 'qb', 'qd', 'capbd', 'capbs'] as const;
const SOURCES = ['vg', 'vd', 'vb'] as const;

function runNgspice(deck: string): string {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'bsim3-626-'));
  try {
    const path = join(dir, 'deck.cir');
    writeFileSync(path, deck);
    // cwd = dir: BSIM3 parameter checking writes b3v33check.log into the working directory.
    return execFileSync('ngspice', ['-b', path], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
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

/** Imaginary part of a complex `print` line (`i(vd) = re,im`). */
function imaginary(block: string, label: string, name: string): number {
  const match = block.match(new RegExp(`^${escape(label)} = (\\S+),(\\S+)`, 'm'));
  if (!match) throw new Error(`${name}: missing complex ${label}\n${block}`);
  return Number(match[2]);
}

function alterBias(c: Bsim3ChargeCase, { vgs, vds, vbs }: { vgs: number; vds: number; vbs: number }): string[] {
  return [`alter VD dc = ${c.type * vds}`, `alter VG dc = ${c.type * vgs}`, `alter VB dc = ${c.type * vbs}`];
}

function charges(c: Bsim3ChargeCase) {
  const deck = chargeDeck(c);
  const control: string[] = [];
  CHARGE_GRID.forEach((bias, index) => {
    control.push(...alterBias(c, bias), `ac lin 1 ${AC_FREQUENCY} ${AC_FREQUENCY}`, `echo "POINT ${index}"`,
      `print ${QUANTITIES.map(q => `@m1[${q}]`).join(' ')}`);
  });
  const output = runNgspice(withControl(deck, control));
  const points = blocksOf(output, 'POINT', CHARGE_GRID.length, c.name).map((block, index) => ({
    ...CHARGE_GRID[index],
    ...Object.fromEntries(QUANTITIES.map(q => [q, real(block, `@m1[${q}]`, `${c.name} point ${index}`)])),
  }));
  return { deck, deckSha256: sha256(deck), points };
}

function acMatrix(c: Bsim3ChargeCase) {
  const deck = chargeDeck(c);
  const omega = 2 * Math.PI * AC_FREQUENCY;
  const control: string[] = [];
  AC_GRID.forEach((bias, index) => {
    control.push(...alterBias(c, bias));
    for (const source of SOURCES) {
      control.push(...SOURCES.map(s => `alter ${s} acmag = ${s === source ? 1 : 0}`),
        `ac lin 1 ${AC_FREQUENCY} ${AC_FREQUENCY}`, `echo "AC ${index} ${source}"`,
        `print ${SOURCES.map(s => `i(${s})`).join(' ')}`);
    }
  });
  const output = runNgspice(withControl(deck, control));
  const blocks = blocksOf(output, 'AC', AC_GRID.length * SOURCES.length, c.name);
  const points = AC_GRID.map((bias, index) => ({
    ...bias,
    // c[excited][measured] = Im(i(measured)) / omega for 1 V on `excited`.
    c: Object.fromEntries(SOURCES.map((source, s) => [source, Object.fromEntries(SOURCES.map(measured => [
      measured, imaginary(blocks[index * SOURCES.length + s], `i(${measured})`, `${c.name} ac ${index} ${source}`) / omega,
    ]))])),
  }));
  return { deck, deckSha256: sha256(deck), frequency: AC_FREQUENCY, points };
}

const version = execFileSync('ngspice', ['-v'], { encoding: 'utf8' }).match(/ngspice-\d+/)?.[0] ?? 'unknown';
const cases = BSIM3_CHARGE_CASES.map(c => ({
  name: c.name, type: c.type, source: c.source,
  charges: charges(c),
  ac: acMatrix(c),
}));
const json = JSON.stringify({
  schemaVersion: 'spice-ts-bsim3-charge-reference/v1',
  engine: version,
  command: ['pnpm', 'exec', 'tsx', 'benchmarks/bsim3-charge-626/reference.ts'],
  note: 'ngspice-47 reference only; spice-ts values are computed by the parity test.',
  cases,
}, null, 1)
  // One bias point per line.
  .replace(/\{\n\s*("vgs"[^{}]*?)\n\s*\}/g, (_, body: string) => `{${body.replace(/\n\s*/g, '')}}`);
writeFileSync(OUTPUT, `${json}\n`);
console.log(`wrote ${cases.length} cases (${cases.reduce((n, c) => n + c.charges.points.length, 0)} charge points, `
  + `${cases.reduce((n, c) => n + c.ac.points.length, 0)} AC matrices) from ${version}`);
