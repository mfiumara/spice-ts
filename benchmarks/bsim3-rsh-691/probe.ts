#!/usr/bin/env tsx
/**
 * Issue #691: BSIM3 RSH x NRD/NRS series resistance, ngspice-47 vs spice-ts.
 *
 *   pnpm exec tsx benchmarks/bsim3-rsh-691/probe.ts [--core <dist/index.js>] [--output <file>]
 *
 * Runs each case's identical deck (`VD d 0 V`, `VG g 0 V`, one M1 instance of
 * the corpus-f TSMC 0.25u `Nmod`/`Pmod` card, RSH = 4.5, plus `.op`) through
 * `ngspice -b` (numdgt = 15) and through spice-ts `simulate()`, and prints
 * i(vd) from both. `--core` scores another build (default packages/core/dist).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TSMC_FIXTURE, corpusCard, withVersion } from '../bsim3v32-594/cards.js';

type Core = typeof import('../../packages/core/src/index.js');

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const nmos = corpusCard(TSMC_FIXTURE, 'Nmod', 'MOD');
const pmos = corpusCard(TSMC_FIXTURE, 'Pmod', 'MOD');

interface Case { name: string; card: string; instance: string; bias: number }

const CASES: Case[] = [
  { name: 'nmos 3.2.2 default NRD=NRS=1', card: nmos, instance: '', bias: 2.5 },
  { name: 'nmos 3.2.2 NRD=0 NRS=0', card: nmos, instance: 'NRD=0 NRS=0', bias: 2.5 },
  { name: 'nmos 3.2.2 M=2', card: nmos, instance: 'M=2', bias: 2.5 },
  { name: 'nmos 3.2.2 NRD=2 NRS=0.5', card: nmos, instance: 'NRD=2 NRS=0.5', bias: 2.5 },
  { name: 'nmos 3.2.2 NRD=0 NRS=3', card: nmos, instance: 'NRD=0 NRS=3', bias: 2.5 },
  { name: 'nmos 3.3.0 default', card: withVersion(nmos, '3.3.0'), instance: '', bias: 2.5 },
  { name: 'nmos 3.2.4 default', card: withVersion(nmos, '3.2.4'), instance: '', bias: 2.5 },
  { name: 'pmos 3.2.2 default', card: pmos, instance: '', bias: -2.5 },
];

function deck(c: Case): string {
  return [
    `* ${c.name}`, `VD d 0 ${c.bias}`, `VG g 0 ${c.bias}`, c.card,
    `M1 d g 0 0 MOD L=0.25u W=40u ${c.instance}`.trimEnd(), '.op', '.end', '',
  ].join('\n');
}

function ngspice(text: string): number {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'bsim3-rsh-691-'));
  try {
    const control = text.replace(/\.end\n$/, '.control\noption numdgt=15\nrun\nprint i(vd)\n.endc\n.end\n');
    writeFileSync(join(dir, 'deck.cir'), control);
    // cwd = dir: BSIM3 parameter checking writes its check log into the working directory.
    const out = execFileSync('ngspice', ['-b', 'deck.cir'], {
      cwd: dir, env: { ...process.env, HOME: dir }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    const match = /i\(vd\)\s*=\s*(\S+)/.exec(out);
    if (!match) throw new Error(`no i(vd) in ngspice output:\n${out}`);
    return Number(match[1]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const core = await import(pathToFileURL(resolve(option('--core') ?? 'packages/core/dist/index.js')).href) as Core;
  const rows = [];
  for (const c of CASES) {
    const text = deck(c);
    const reference = ngspice(text);
    const spiceTs = (await core.simulate(text)).dc!.current('VD');
    rows.push({
      name: c.name, ngspice: reference, spiceTs,
      relativeError: Math.abs(spiceTs - reference) / Math.abs(reference),
    });
  }
  console.table(rows);
  const output = option('--output');
  if (output) writeFileSync(output, `${JSON.stringify({ engine: 'ngspice-47', rows }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
