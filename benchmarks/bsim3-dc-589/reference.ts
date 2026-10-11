#!/usr/bin/env tsx
/**
 * Generate ngspice-47 reference values for the #589 BSIM3 DC parity cases.
 *
 *   pnpm exec tsx benchmarks/bsim3-dc-589/reference.ts
 *
 * Writes benchmarks/bsim3-dc-589/ngspice-47-dc.json. For every case the
 * operating-point deck in cards.ts is run once in ngspice batch mode with an
 * unrolled `.control` block that alters VD/VG/VB, runs `op` and prints the
 * BSIM3 operating-point outputs @m1[id], @m1[gm], @m1[gds], @m1[gmbs],
 * @m1[vth] and the terminal current i(vd). The Id-Vds sweep deck is run with
 * `.dc` and its i(vd) vector is recorded. The decks are stored verbatim.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BSIM3_DC_CASES, VBS_GRID, VDS_GRID, VGS_GRID, operatingPointDeck, sweepDeck, type Bsim3DcCase,
} from './cards.js';

const OUTPUT = new URL('./ngspice-47-dc.json', import.meta.url);
const QUANTITIES = ['id', 'gm', 'gds', 'gmbs', 'vth'] as const;

function runNgspice(deck: string): string {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'bsim3-589-'));
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

function operatingPoints(c: Bsim3DcCase) {
  const biases = VBS_GRID.flatMap(vbs => VGS_GRID.flatMap(vgs => VDS_GRID.map(vds => ({ vgs, vds, vbs }))));
  const control: string[] = [];
  biases.forEach(({ vgs, vds, vbs }, index) => {
    control.push(
      `alter VD dc = ${c.type * vds}`, `alter VG dc = ${c.type * vgs}`, `alter VB dc = ${c.type * vbs}`,
      'op', `echo "POINT ${index}"`,
      `print ${QUANTITIES.map(q => `@m1[${q}]`).join(' ')} i(vd)`,
    );
  });
  const deck = operatingPointDeck(c);
  const output = runNgspice(withControl(deck, control));
  const blocks = output.split(/^POINT /m).slice(1);
  if (blocks.length !== biases.length) {
    throw new Error(`${c.name}: expected ${biases.length} operating points, got ${blocks.length}\n${output}`);
  }
  const points = blocks.map((block, index) => {
    const value = (label: string): number => {
      const match = block.match(new RegExp(`^${label.replace(/[[\]()@]/g, '\\$&')} = (\\S+)`, 'm'));
      if (!match) throw new Error(`${c.name} point ${index}: missing ${label}\n${block}`);
      return Number(match[1]);
    };
    return {
      ...biases[index],
      ...Object.fromEntries(QUANTITIES.map(q => [q, value(`@m1[${q}]`)])),
      ivd: value('i(vd)'),
    };
  });
  return { deck, deckSha256: sha256(deck), points };
}

function sweep(c: Bsim3DcCase) {
  const deck = sweepDeck(c);
  const output = runNgspice(withControl(deck, ['run', 'print v(d) i(vd)']));
  const rows = [...output.matchAll(/^\d+\s+(\S+)\s+(\S+)\s+(\S+)\s*$/gm)]
    .map(([, , vd, ivd]) => ({ vd: Number(vd), ivd: Number(ivd) }));
  if (rows.length === 0) throw new Error(`${c.name}: no sweep rows\n${output}`);
  return { deck, deckSha256: sha256(deck), points: rows };
}

const version = execFileSync('ngspice', ['-v'], { encoding: 'utf8' }).match(/ngspice-\d+/)?.[0] ?? 'unknown';
const cases = BSIM3_DC_CASES.map(c => ({
  name: c.name, type: c.type, source: c.source,
  operatingPoints: operatingPoints(c),
  sweep: sweep(c),
}));
const json = JSON.stringify({
  schemaVersion: 'spice-ts-bsim3-dc-reference/v1',
  engine: version,
  command: ['pnpm', 'exec', 'tsx', 'benchmarks/bsim3-dc-589/reference.ts'],
  note: 'ngspice-47 reference only; spice-ts values are computed by compare.ts and the parity test.',
  cases,
}, null, 1)
  // One bias point per line.
  .replace(/\{\n\s*("(?:vgs|vd)"[^{}]*?)\n\s*\}/g, (_, body: string) => `{${body.replace(/\n\s*/g, '')}}`);
writeFileSync(OUTPUT, `${json}\n`);
console.log(`wrote ${cases.length} cases (${cases.reduce((n, c) => n + c.operatingPoints.points.length, 0)} operating points) from ${version}`);
