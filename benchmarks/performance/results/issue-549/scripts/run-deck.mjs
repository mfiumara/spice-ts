#!/usr/bin/env node
/**
 * Issue #549: time spice-ts on a TXL/CPL deck and hash its transient waveform.
 *
 *   node benchmarks/performance/results/issue-549/scripts/run-deck.mjs <deck> [runs=5]
 *
 * The deck is transformed exactly like benchmarks/txl-cpl/compare.ts does it:
 * the `.control` block is dropped and its first `tran` command becomes a
 * `.tran` card. Uses packages/core/dist (or $SPICE_TS_DIST), so run
 * `pnpm -C packages/core build` first. One warm-up run, then `runs` measured runs in this process.
 * Prints one JSON line: per-run process CPU ms (user+sys) and wall ms, the
 * number of timepoints, and a SHA-256 over the time axis and every node
 * voltage and branch current (Float64, little-endian), so A/B runs can prove
 * bit-identical output.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

// SPICE_TS_DIST=<dir> points the A/B run at another build of packages/core/dist.
const dist = process.env.SPICE_TS_DIST
  ? pathToFileURL(`${process.env.SPICE_TS_DIST}/index.js`).href
  : new URL('../../../../../packages/core/dist/index.js', import.meta.url).href;
const { parse, simulate } = await import(dist);

const deckPath = process.argv[2];
const runs = Number(process.argv[3] ?? 5);
if (!deckPath) throw new Error('usage: run-deck.mjs <deck> [runs]');

const lines = readFileSync(deckPath, 'utf8').split('\n');
let inControl = false;
let tranCommand = '';
const kept = [];
for (const line of lines) {
  if (/^\s*\.control/i.test(line)) { inControl = true; continue; }
  if (/^\s*\.endc/i.test(line)) { inControl = false; continue; }
  if (inControl) {
    if (!tranCommand && /^\s*tran\b/i.test(line)) tranCommand = line.trim();
    continue;
  }
  kept.push(line);
}
const hasTranCard = kept.some(line => /^\s*\.tran\b/i.test(line));
const body = kept.join('\n').replace(/^\.end\s*$/im, '')
  + (!hasTranCard && tranCommand ? `\n.${tranCommand}\n` : '');
const netlist = `${body}\n.end\n`;
if (process.env.EMIT_NETLIST) { process.stdout.write(netlist); process.exit(0); }

function hashOf(transient) {
  const hash = createHash('sha256');
  const add = values => hash.update(Buffer.from(Float64Array.from(values).buffer));
  add(transient.time);
  for (const name of [...transient.voltages.keys()].sort()) { hash.update(`v:${name}`); add(transient.voltage(name)); }
  const currents = transient.currents ? [...transient.currents.keys()].sort() : [];
  for (const name of currents) { hash.update(`i:${name}`); add(transient.current(name)); }
  return hash.digest('hex');
}

async function once() {
  const cpu0 = process.cpuUsage();
  const wall0 = performance.now();
  const result = await simulate(parse(netlist));
  const wall = performance.now() - wall0;
  const cpu = process.cpuUsage(cpu0);
  return { result, cpuMs: (cpu.user + cpu.system) / 1000, wallMs: wall };
}

const warm = await once();
const digest = hashOf(warm.result.transient);
const cpuMs = [];
const wallMs = [];
for (let i = 0; i < runs; i++) {
  const run = await once();
  const h = hashOf(run.result.transient);
  if (h !== digest) throw new Error(`non-deterministic waveform on run ${i}`);
  cpuMs.push(Number(run.cpuMs.toFixed(1)));
  wallMs.push(Number(run.wallMs.toFixed(1)));
}
const median = xs => [...xs].sort((a, b) => a - b)[xs.length >> 1];
console.log(JSON.stringify({
  deck: basename(deckPath),
  points: warm.result.transient.time.length,
  sha256: digest,
  cpuMs,
  wallMs,
  medianCpuMs: median(cpuMs),
  medianWallMs: median(wallMs),
}));
