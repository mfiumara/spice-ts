#!/usr/bin/env node
/**
 * Issue #740: ngspice-47 reference runs of the #740 AC decks, and the probe
 * comparison against a spice-ts sample.
 *
 *   node benchmarks/performance/results/issue-740/scripts/ngspice.mjs <circuit> <nodes> <klu|sparse> <runs> [spice-ts-sample.json]
 *
 * The deck is byte-identical to what spice-ts runs (ac-fixture.mjs). The
 * solver and print precision are chosen outside the deck by a per-run
 * `.spiceinit` (`option <solver>`, `set numdgt=15`), and the "Using ... as
 * Direct Linear Solver" banner is checked. Reports wall ms per run (fresh
 * `ngspice -b` process, includes start-up and printing), ngspice's own
 * `Total analysis time`, and, given a sample.mjs JSON line, the largest
 * complex relative difference of the probe phasor over the sweep:
 * max_f |v_ts - v_ng| / |v_ng| and max_f |v_ts - v_ng| / max_f |v_ng|.
 * Prints one JSON line.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acNetlist } from './ac-fixture.mjs';

const [circuit, nodesArg, solver, runsArg, samplePath] = process.argv.slice(2);
if (!circuit || !nodesArg || !['klu', 'sparse'].includes(solver) || !runsArg) {
  throw new Error('usage: ngspice.mjs <circuit> <nodes> <klu|sparse> <runs> [spice-ts-sample.json]');
}
const { netlist, probe, actualNodes } = acNetlist(circuit, Number(nodesArg));
const directory = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'spice-ts-740-'));
const deck = join(directory, `${circuit}-${nodesArg}.cir`);
writeFileSync(deck, netlist);
writeFileSync(join(directory, '.spiceinit'), `option ${solver}\nset numdgt=15\n`);

const wallMs = [];
const analysisMs = [];
let rows;
let solverLine;
for (let run = 0; run < Number(runsArg); run++) {
  const started = performance.now();
  const result = spawnSync('ngspice', ['-b', deck], { cwd: directory, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  wallMs.push(performance.now() - started);
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status !== 0) throw new Error(`ngspice exited ${result.status}: ${output.slice(-1000)}`);
  solverLine = output.match(/Using (\S+(?: \S+)?) as Direct Linear Solver/)?.[1] ?? 'unknown';
  if (!solverLine.toLowerCase().startsWith(solver)) throw new Error(`expected ${solver}, ngspice used ${solverLine}`);
  analysisMs.push(Number(output.match(/Total analysis time \(seconds\)\s*=\s*([\d.eE+-]+)/)?.[1]) * 1000);
  rows = [...output.matchAll(/^(\d+)\t([-+\d.eE]+)\t([-+\d.eE]+)\t([-+\d.eE]+)\t?\s*$/gm)]
    .map(m => [Number(m[2]), Number(m[3]), Number(m[4])]);
}
rmSync(directory, { recursive: true, force: true });

const median = values => {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const out = {
  circuit, nodes: Number(nodesArg), actualNodes, solver: solverLine, probe,
  netlistSha256: createHash('sha256').update(netlist).digest('hex'),
  points: rows.length, wallMs, wallMedianMs: median(wallMs), analysisMs, analysisMedianMs: median(analysisMs),
};
if (samplePath) {
  const sample = JSON.parse(readFileSync(samplePath, 'utf8').trim().split('\n').pop());
  if (sample.probeValues.length !== rows.length) throw new Error(`point count ${sample.probeValues.length} vs ngspice ${rows.length}`);
  const points = rows.map(([frequency, re, im], k) => {
    if (Math.abs(frequency - sample.frequencies[k]) > 1e-9 * frequency) throw new Error(`frequency ${k}: ${frequency} vs ${sample.frequencies[k]}`);
    const [tsRe, tsIm] = sample.probeValues[k];
    return { diff: Math.hypot(tsRe - re, tsIm - im), magnitude: Math.hypot(re, im) };
  });
  const scale = Math.max(...points.map(p => p.magnitude));
  const pointwise = floor => Math.max(0, ...points
    .filter(p => p.magnitude >= floor * scale && (p.magnitude > 0 || p.diff > 0))
    .map(p => (p.magnitude > 0 ? p.diff / p.magnitude : Infinity)));
  Object.assign(out, {
    spiceTsMs: sample.ms,
    // relative to the sweep peak of |v_ng|
    maxSweepRelError: Math.max(...points.map(p => p.diff)) / scale,
    // per point, over points within 120 dB of the peak, and over all points
    maxPointRelErrorWithin120dB: pointwise(1e-6),
    maxPointRelError: pointwise(0),
  });
}
console.log(JSON.stringify(out));
