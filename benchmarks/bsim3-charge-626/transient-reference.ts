#!/usr/bin/env tsx
/**
 * ngspice-47 transient reference for the #626 BSIM3 NAND regression test.
 *
 *   pnpm exec tsx benchmarks/bsim3-charge-626/transient-reference.ts
 *
 * Runs NAND_DECK (two all-default BSIM3v3.3.0 NAND gates from the corpus-f
 * adder_mos_circ deck, X1 driven by its first two input pulses, X2 wired as an
 * inverter load) with TMAX = 10 ps so both engines resolve the edges, and
 * writes v(9) and v(10) every 0.5 ns, plus the supply charge q(vcc), the
 * trapezoidal integral of i(vcc) over the 0.5 ns window around each sample
 * (pointwise i(vcc) carries the trapezoidal-rule ringing both engines show at
 * the PULSE corners; its integral does not), to ngspice-47-nand-tran.json.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NAND_DECK, NAND_SAMPLE_TIMES, NAND_WINDOW, windowCharge } from './cards.js';

const OUTPUT = new URL('./ngspice-47-nand-tran.json', import.meta.url);
const SIGNALS = ['v(9)', 'v(10)'] as const;

const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'bsim3-626-tran-'));
try {
  writeFileSync(join(dir, 'deck.cir'), NAND_DECK);
  writeFileSync(join(dir, '.spiceinit'), 'set filetype=ascii\n');
  execFileSync('ngspice', ['-b', '-r', 'deck.raw', 'deck.cir'], {
    cwd: dir, env: { ...process.env, HOME: dir }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lines = readFileSync(join(dir, 'deck.raw'), 'utf8').split('\n');
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
  const column = (name: string) => variables.indexOf(name);
  const at = (time: number, name: string): number => {
    const k = column(name);
    const j = rows.findIndex(r => r[0] >= time);
    if (rows[j][0] === time || j === 0) return rows[j][k];
    const [a, b] = [rows[j - 1], rows[j]];
    return a[k] + (b[k] - a[k]) * (time - a[0]) / (b[0] - a[0]);
  };
  const time = rows.map(r => r[0]);
  const supply = rows.map(r => r[column('i(vcc)')]);
  const samples = NAND_SAMPLE_TIMES.map(t => ({
    time: t, ...Object.fromEntries(SIGNALS.map(s => [s, at(t, s)])), 'q(vcc)': windowCharge(time, supply, t),
  }));
  const version = execFileSync('ngspice', ['-v'], { encoding: 'utf8' }).match(/ngspice-\d+/)?.[0] ?? 'unknown';
  writeFileSync(OUTPUT, `${JSON.stringify({
    schemaVersion: 'spice-ts-bsim3-nand-tran-reference/v1',
    engine: version,
    command: ['pnpm', 'exec', 'tsx', 'benchmarks/bsim3-charge-626/transient-reference.ts'],
    deck: NAND_DECK,
    ngspicePoints: rows.length,
    window: NAND_WINDOW,
    peak: {
      ...Object.fromEntries(SIGNALS.map(s => [s, Math.max(...rows.map(r => Math.abs(r[column(s)])))])),
      'q(vcc)': Math.max(...samples.map(s => Math.abs(s['q(vcc)']))),
    },
    samples,
  }, null, 1).replace(/\{\n\s*("time"[^{}]*?)\n\s*\}/g, (_, body: string) => `{${body.replace(/\n\s*/g, '')}}`)}\n`);
  console.log(`wrote ${NAND_SAMPLE_TIMES.length} samples from ${rows.length} ${version} points`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
