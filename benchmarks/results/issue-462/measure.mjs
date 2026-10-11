#!/usr/bin/env node
// Issue #462: MOS1 CMOS inverter-chain `.op` at 20k/40k/50k stages, spice-ts vs ngspice-47.
//
// Usage: node benchmarks/results/issue-462/measure.mjs --stages 40000 [--variant issue-428|true-gmin]
//        [--dist packages/core/dist] [--label after]
//
// Generates the deck once and feeds the identical bytes to `ngspice -b` and
// to spice-ts `simulate()` from the given build. Every node voltage is
// compared against ngspice's `.op` listing. One JSON line per run is appended
// to receipts/runs.jsonl.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
);
const stages = Number(args.stages);
const dist = resolve(args.dist ?? join(here, '../../../packages/core/dist'));
const label = args.label ?? 'after';

/**
 * Chain variants of packages/core/src/mos1-inverter-chain-op.test.ts, with the
 * ngspice-47 `op` node voltages printed at numdgt=12 (odd / even stages).
 */
const VARIANTS = {
  'issue-428': { lambda: 0.02, pmosWidth: '2u', high: 2.499999989542, low: 1.045833330918e-8 },
  'true-gmin': { lambda: 0.005, pmosWidth: '1u', high: 2.499999979083, low: 1.045833336551e-8 },
};
const variantName = args.variant ?? 'issue-428';
const variant = VARIANTS[variantName];

function inverterChainOp(n, { lambda, pmosWidth }) {
  const lines = [
    `* ${n}-stage MOS1 CMOS inverter chain (issue #428)`,
    'VDD vdd 0 DC 2.5',
    'VIN s0 0 PULSE(0 2.5 0.1n 0.1n 0.1n 5n 10n)',
    `.model nch nmos level=1 vto=0.5 kp=120u lambda=${lambda}`,
    `.model pch pmos level=1 vto=-0.5 kp=60u lambda=${lambda}`,
  ];
  for (let i = 1; i <= n; i++) {
    lines.push(`MP${i} s${i} s${i - 1} vdd vdd pch W=${pmosWidth} L=1u`);
    lines.push(`MN${i} s${i} s${i - 1} 0 0 nch W=1u L=1u`);
    lines.push(`C${i} s${i} 0 10f`);
  }
  lines.push('.op', '.end');
  return lines.join('\n');
}

const deck = inverterChainOp(stages, variant);
const NGSPICE_HIGH = variant.high;
const NGSPICE_LOW = variant.low;
const deckSha256 = createHash('sha256').update(deck).digest('hex');
const work = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'issue-462-'));
const deckPath = join(work, `chain${stages}.cir`);
writeFileSync(deckPath, deck);

let t0 = performance.now();
const ngRun = spawnSync('ngspice', ['-b', deckPath], { encoding: 'utf8', maxBuffer: 1 << 28 });
const ngSeconds = (performance.now() - t0) / 1000;
if (ngRun.status !== 0) throw new Error(`ngspice exited with ${ngRun.status}: ${ngRun.stderr}`);
const ngOut = ngRun.stdout;
const ngVersion = execFileSync('ngspice', ['-v'], { encoding: 'utf8' }).match(/ngspice-\S+/)?.[0];
// ngspice reports its homotopy notes on stderr.
const ngHomotopy = `${ngRun.stderr}\n${ngOut}`.split('\n')
  .filter(line => /gmin|source stepping/i.test(line)).map(line => line.trim());
const ngspice = new Map();
for (const line of ngOut.split('\n')) {
  const match = line.match(/^\s*(s\d+)\s+(\S+)\s*$/);
  if (match) ngspice.set(match[1], Number(match[2]));
}

const { simulate } = await import(pathToFileURL(join(dist, 'index.js')).href);
const record = {
  label, variant: variantName, stages, deckSha256, ngspice: { version: ngVersion, seconds: +ngSeconds.toFixed(2), homotopy: ngHomotopy },
};
t0 = performance.now();
try {
  const dc = (await simulate(deck)).dc;
  let maxAbs = 0;
  let maxRel = 0;
  let worst = '';
  let outside12Digit = 0;
  for (let i = 1; i <= stages; i++) {
    const name = `s${i}`;
    const reference = ngspice.get(name);
    const value = dc.voltage(name);
    const abs = Math.abs(value - reference);
    const rel = abs / Math.abs(reference);
    if (rel > maxRel) {
      maxRel = rel;
      worst = name;
    }
    maxAbs = Math.max(maxAbs, abs);
    const exact = i % 2 === 1 ? NGSPICE_HIGH : NGSPICE_LOW;
    if (Math.abs(value - exact) > (i % 2 === 1 ? 1e-9 : 1e-3 * NGSPICE_LOW)) outside12Digit++;
  }
  record.spiceTs = {
    ok: true,
    seconds: +((performance.now() - t0) / 1000).toFixed(2),
    nodesCompared: stages,
    // Against the 7-significant-digit `.op` listing: ~3e-7 relative is listing rounding.
    maxAbsDiffV: maxAbs,
    maxRelDiff: maxRel,
    worstNode: worst,
    // Against the numdgt=12 ngspice-47 values used by the unit tests
    // (|dV| < 1 nV on high nodes, < 0.1% on low nodes).
    nodesOutside12DigitTolerance: outside12Digit,
    tail: Object.fromEntries([stages - 1, stages].map(i => [`s${i}`, [dc.voltage(`s${i}`), ngspice.get(`s${i}`)]])),
  };
} catch (error) {
  record.spiceTs = {
    ok: false,
    seconds: +((performance.now() - t0) / 1000).toFixed(2),
    error: `${error.name}: ${String(error.message).slice(0, 160)}`,
  };
}
console.log(JSON.stringify(record));
mkdirSync(join(here, 'receipts'), { recursive: true });
appendFileSync(join(here, 'receipts', 'runs.jsonl'), `${JSON.stringify(record)}\n`);
