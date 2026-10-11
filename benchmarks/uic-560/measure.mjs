// Issue #560: `.tran ... uic` start of C(ic=-1) parallel to a series R-L
// branch, in spice-ts and ngspice-47 on identical bytes, each scored against
// the exact series-RLC response and against each other at ngspice's
// timepoints. Run after `pnpm -C packages/core build`:
//   node benchmarks/uic-560/measure.mjs
// Prints JSON. ngspice must be on PATH (ngspice-47 was used for the PR).
// The deck is project-authored (the minimal deck in issue #560, MIT).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simulate } from '../../packages/core/dist/index.js';

export const DECK = `uic RL-C
RLa gib gib1 1m
La  gib1 0  1.2e-6
Ca  gib 0   1e-9 ic=-1
.tran 10e-9 2e-6 uic
.end
`;

const R = 1e-3;
const L = 1.2e-6;
const C = 1e-9;
const alpha = R / (2 * L);
const omega = Math.sqrt(1 / (L * C) - alpha * alpha);

/** Exact v(gib) of the series RLC from v(0) = -1 V, i(0) = 0 A. */
export function exact(t) {
  return Math.exp(-alpha * t) * (-Math.cos(omega * t) - (alpha / omega) * Math.sin(omega * t));
}

function scoreExact(time, values) {
  let max = 0;
  let sum = 0;
  for (let i = 0; i < time.length; i++) {
    const error = Math.abs(values[i] - exact(time[i]));
    max = Math.max(max, error);
    sum += error * error;
  }
  return { maxAbs: max, rmsAbs: Math.sqrt(sum / time.length) };
}

function ngspice(netlist) {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'ng560-'));
  const out = join(dir, 'out.txt');
  const body = netlist.replace(/^\.end\s*$/m, '')
    + `.control\nrun\nset wr_singlescale\nwrdata ${out} v(gib)\n.endc\n.end\n`;
  const deck = join(dir, 'deck.cir');
  writeFileSync(deck, body);
  execFileSync('ngspice', ['-b', deck], { stdio: 'ignore' });
  const rows = readFileSync(out, 'utf8').trim().split('\n').map(l => l.trim().split(/\s+/).map(Number));
  return { time: rows.map(r => r[0]), values: rows.map(r => r[1]) };
}

/** spice-ts interpolated linearly at each ngspice timepoint. */
function scoreAgainst(time, values, ref) {
  let max = 0;
  let sum = 0;
  let index = 0;
  for (let k = 0; k < ref.time.length; k++) {
    const at = ref.time[k];
    while (index < time.length - 2 && time[index + 1] < at) index++;
    const v = values[index] + (values[index + 1] - values[index]) * (at - time[index]) / (time[index + 1] - time[index]);
    const error = Math.abs(v - ref.values[k]);
    max = Math.max(max, error);
    sum += error * error;
  }
  return { maxAbs: max, rmsAbs: Math.sqrt(sum / ref.time.length) };
}

const transient = (await simulate(DECK)).transient;
const time = Array.from(transient.time);
const gib = Array.from(transient.voltage('gib'));
const ng = ngspice(DECK);
const early = time.filter(t => t > 0 && t <= 1e-8 * (1 + 1e-9));
console.log(JSON.stringify({
  spiceTs: {
    points: time.length,
    firstSteps: time.slice(0, 5),
    pointsTo10ns: early.length,
    exact: scoreExact(time, gib),
    vsNgspice: scoreAgainst(time, gib, ng),
  },
  ngspice: {
    points: ng.time.length,
    firstSteps: ng.time.slice(0, 5),
    pointsTo10ns: ng.time.filter(t => t <= 1e-8 * (1 + 1e-9)).length,
    exact: scoreExact(ng.time, ng.values),
  },
}, null, 2));
