// Issue #532: first transient step on the SIN-driven RC deck from the issue,
// in spice-ts and ngspice-47 on identical bytes, scored against the analytic
// solution. Run after `pnpm -C packages/core build`:
//   node benchmarks/tran-first-step-532/measure.mjs
// Prints JSON. ngspice must be on PATH (ngspice-47 was used for the PR).
// The deck is the SPICE3 form (from issue #532) of the Xyce_Regression
// CAPACITOR/rc_osc.cir fixture recorded in benchmarks/SOURCES.md as
// `capacitor-rc-oscillator`, with TSTEP 4e-6 and the Xyce-only cards dropped.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simulate } from '../../packages/core/dist/index.js';

export const DECK = `rc_osc test
.tran 4e-6 2.0e-4
v1 1 0 sin 0 1V 1e5 0 0
r1 1 2 1k
c1 2 0 2u
.end
`;

/** v(2) of the RC low-pass driven by sin(2*pi*1e5*t) from a zero DC point. */
export function analytic(t) {
  const w = 2 * Math.PI * 1e5;
  const tau = 1e3 * 2e-6;
  const wt = w * tau;
  return (Math.sin(w * t) - wt * Math.cos(w * t) + wt * Math.exp(-t / tau)) / (1 + wt * wt);
}

function score(time, values) {
  let max = 0;
  let sum = 0;
  for (let i = 0; i < time.length; i++) {
    const error = Math.abs(values[i] - analytic(time[i]));
    max = Math.max(max, error);
    sum += error * error;
  }
  return { points: time.length, firstSteps: time.slice(0, 4), maxAbs: max, rmsAbs: Math.sqrt(sum / time.length) };
}

function ngspice(netlist) {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'ng532-'));
  const out = join(dir, 'out.txt');
  const body = netlist.replace(/^\.end\s*$/m, '')
    + `.control\nrun\nset wr_singlescale\nwrdata ${out} v(2)\n.endc\n.end\n`;
  const deck = join(dir, 'deck.cir');
  writeFileSync(deck, body);
  execFileSync('ngspice', ['-b', deck], { stdio: 'ignore' });
  const rows = readFileSync(out, 'utf8').trim().split('\n').map(l => l.trim().split(/\s+/).map(Number));
  return { time: rows.map(r => r[0]), values: rows.map(r => r[1]) };
}

const transient = (await simulate(DECK)).transient;
const ng = ngspice(DECK);
console.log(JSON.stringify({
  spiceTs: score(transient.time, transient.voltage('2')),
  ngspice: score(ng.time, ng.values),
}, null, 2));
