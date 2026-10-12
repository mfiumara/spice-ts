#!/usr/bin/env tsx
/**
 * Issue #700: BSIM3v32 (VERSION=3.2 / 3.2.2) size-dependent pParam reuse on
 * alternating instance geometries, ngspice-47 vs spice-ts.
 *
 *   pnpm exec tsx benchmarks/bsim3v32-700/probe.ts [--core <dist/index.js>] [--output <file>]
 *
 * Every case is one `.op` deck: a shared gate source, one drain source per
 * transistor (`VD<k> d<k> 0`) and transistors of the corpus-f TSMC 0.25u
 * `Nmod`/`Pmod` cards (binned VTH0/U0/K1..., so vth0 and u0 depend on L/W) in
 * the listed geometry order. The identical deck bytes run through `ngspice -b`
 * (numdgt = 15) and spice-ts `simulate()`; the script prints i(vd<k>) of every
 * transistor from both. `--core` scores another build (default packages/core/dist).
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

const nmos = corpusCard(TSMC_FIXTURE, 'Nmod', 'NM');
const pmos = corpusCard(TSMC_FIXTURE, 'Pmod', 'PM');

/** Geometries: a and b differ in both L and W; c only in W. */
const GEOMETRY = { a: 'L=0.25u W=40u', b: 'L=0.3u W=10u', c: 'L=0.25u W=20u' } as const;
type Geometry = keyof typeof GEOMETRY;

interface Device {
  model: 'NM' | 'PM';
  geometry: Geometry;
  /** Extra instance parameters (e.g. DELVTO). */
  extra?: string;
  /** Place the transistor inside subcircuit instance X<k> instead of at top level. */
  subckt?: boolean;
}

interface Case {
  name: string; cards: string[]; devices: Device[];
  /**
   * Put the cards and all devices in one subcircuit CELL instantiated twice
   * (X1, X2): ngspice gives each instance its own copy of a subcircuit-local
   * model, so the reuse stays within one instance.
   */
  localModel?: boolean;
}

const n = (geometry: Geometry, extra?: string, subckt?: boolean): Device => ({ model: 'NM', geometry, extra, subckt });
const p = (geometry: Geometry): Device => ({ model: 'PM', geometry });

const CASES: Case[] = [
  { name: 'Nmod 3.2.2  a,b,a', cards: [nmos], devices: [n('a'), n('b'), n('a')] },
  { name: 'Nmod 3.2.2  a,b,a,b', cards: [nmos], devices: [n('a'), n('b'), n('a'), n('b')] },
  { name: 'Nmod 3.2.2  a,b,a,a', cards: [nmos], devices: [n('a'), n('b'), n('a'), n('a')] },
  { name: 'Nmod 3.2.2  a,a,b,c,b', cards: [nmos], devices: [n('a'), n('a'), n('b'), n('c'), n('b')] },
  { name: 'Nmod 3.2    a,b,a,b', cards: [withVersion(nmos, '3.2')], devices: [n('a'), n('b'), n('a'), n('b')] },
  { name: 'Nmod 3.2.2  a,b,a DELVTO', cards: [nmos], devices: [n('a', 'DELVTO=0.05'), n('b'), n('a')] },
  { name: 'Nmod 3.2.2  a,b,a subckt', cards: [nmos], devices: [n('a', undefined, true), n('b'), n('a', undefined, true)] },
  { name: 'Nmod 3.2.2  a,b,a local model x2', cards: [nmos], devices: [n('a'), n('b'), n('a')], localModel: true },
  { name: 'Nmod+Pmod 3.2.2 interleaved', cards: [nmos, pmos], devices: [n('a'), p('b'), n('b'), p('a'), n('a'), p('b')] },
  { name: 'Nmod 3.2.4  a,b,a,b (control)', cards: [withVersion(nmos, '3.2.4')], devices: [n('a'), n('b'), n('a'), n('b')] },
  { name: 'Nmod 3.3.0  a,b,a,b (control)', cards: [withVersion(nmos, '3.3.0')], devices: [n('a'), n('b'), n('a'), n('b')] },
];

/** The deck text and a label per `VD<k>` drain source. */
function deck(c: Case): { text: string; labels: string[] } {
  const label = (d: Device, prefix: string) => `${prefix} ${d.model} ${d.geometry}${d.extra ? ` ${d.extra}` : ''}`;
  const instance = (d: Device) => `${GEOMETRY[d.geometry]}${d.extra ? ` ${d.extra}` : ''}`;
  if (c.localModel) {
    const count = c.devices.length;
    const ports = c.devices.map((_, k) => `dd${k}`).join(' ');
    const lines = [`* ${c.name}`, 'VG g 0 1.5', `.subckt CELL ${ports} gg`, ...c.cards,
      ...c.devices.map((d, k) => `M${k} dd${k} gg 0 0 ${d.model} ${instance(d)}`), '.ends'];
    const labels: string[] = [];
    for (const x of [1, 2]) {
      const drains = c.devices.map((d, k) => {
        const index = (x - 1) * count + k;
        lines.push(`VD${index} d${index} 0 1.2`);
        labels.push(label(d, `X${x}.M${k}`));
        return `d${index}`;
      });
      lines.push(`X${x} ${drains.join(' ')} g CELL`);
    }
    lines.push('.op', '.end', '');
    return { text: lines.join('\n'), labels };
  }
  const lines = [`* ${c.name}`, 'VG g 0 1.5', 'VGP gp 0 -1.5', ...c.cards];
  const subckts = new Set<string>();
  c.devices.forEach((d, k) => {
    const vd = d.model === 'NM' ? 1.2 : -1.2;
    const gate = d.model === 'NM' ? 'g' : 'gp';
    lines.push(`VD${k} d${k} 0 ${vd}`);
    if (d.subckt) {
      const name = `CELL_${d.geometry}${d.extra ? '_x' : ''}`;
      if (!subckts.has(name)) {
        subckts.add(name);
        lines.push(`.subckt ${name} dd gg`, `M1 dd gg 0 0 ${d.model} ${instance(d)}`, '.ends');
      }
      lines.push(`X${k} d${k} ${gate} ${name}`);
    } else {
      lines.push(`M${k} d${k} ${gate} 0 0 ${d.model} ${instance(d)}`);
    }
  });
  lines.push('.op', '.end', '');
  return { text: lines.join('\n'), labels: c.devices.map((d, k) => label(d, `${d.subckt ? 'X' : 'M'}${k}`)) };
}

function ngspice(text: string, count: number): number[] {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'bsim3v32-700-'));
  try {
    const vectors = Array.from({ length: count }, (_, k) => `i(vd${k})`).join(' ');
    const control = text.replace(/\.end\n$/, `.control\noption numdgt=15\nrun\nprint ${vectors}\n.endc\n.end\n`);
    writeFileSync(join(dir, 'deck.cir'), control);
    // cwd = dir: BSIM3 parameter checking writes its check log into the working directory.
    const out = execFileSync('ngspice', ['-b', 'deck.cir'], {
      cwd: dir, env: { ...process.env, HOME: dir }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return Array.from({ length: count }, (_, k) => {
      const match = new RegExp(`i\\(vd${k}\\)\\s*=\\s*(\\S+)`).exec(out);
      if (!match) throw new Error(`no i(vd${k}) in ngspice output:\n${out}`);
      return Number(match[1]);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const core = await import(pathToFileURL(resolve(option('--core') ?? 'packages/core/dist/index.js')).href) as Core;
  const rows = [];
  for (const c of CASES) {
    const { text, labels } = deck(c);
    const reference = ngspice(text, labels.length);
    const dc = (await core.simulate(text)).dc!;
    labels.forEach((device, k) => {
      const spiceTs = dc.current(`VD${k}`);
      rows.push({
        case: c.name, device, ngspice: reference[k], spiceTs,
        relativeError: Math.abs(spiceTs - reference[k]) / Math.abs(reference[k]),
      });
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
