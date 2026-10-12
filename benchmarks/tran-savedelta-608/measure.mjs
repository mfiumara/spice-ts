// Issue #608 / #561: accepted transient time grid after breakpoints, spice-ts vs
// ngspice-47 on identical netlist bytes. Run after `pnpm -C packages/core build`:
//   node benchmarks/tran-savedelta-608/measure.mjs [--json]
// ngspice must be on PATH (ngspice-47 was used for the PR). Decks are the
// unchanged corpus-f ddt-test1/ddt-test3 fixtures and the RC PULSE deck from
// issue #561. For each deck it prints the first grid points, the points
// around a chosen breakpoint, and how many of the first N accepted points of
// both simulators agree to 1e-9 relative.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate } from '../../packages/core/dist/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixture = name => readFileSync(join(root, 'benchmarks/corpus/corpus-f/fixtures/examples/ddt', name), 'utf8');

const DECKS = [
  { name: 'rc-pulse-561', netlist: `rc pulse\nVS 1 0 PULSE(0 1 0.1n 0.1n 0.1n 5n 20n)\nR1 1 2 50\nC1 2 0 1p\n.tran 0.02n 10n\n.end\n`, corner: 0.1e-9, vector: 'v(2)', settle: 0 },
  // settle: also report the max difference from this time on, past the
  // start-up grid of issue #561.
  { name: 'ddt-test1', netlist: fixture('ddt-test1.cir'), corner: 4, vector: 'v(2)', settle: 1e-4 },
  { name: 'ddt-test3', netlist: fixture('ddt-test3.cir'), corner: 2.001e-3, vector: 'v(22)', settle: 0 },
];

function ngspice(netlist, vector) {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'ng608-'));
  const out = join(dir, 'out.txt');
  const body = netlist.replace(/\r/g, '').replace(/^\.control[\s\S]*?^\.endc\s*$/m, '').replace(/^\.end\s*$/m, '')
    + `.control\nrun\nset wr_singlescale\nset wr_vecnames=false\noption numdgt=15\nwrdata ${out} ${vector}\n.endc\n.end\n`;
  const deck = join(dir, 'deck.cir');
  writeFileSync(deck, body);
  execFileSync('ngspice', ['-b', deck], { stdio: 'ignore' });
  const rows = readFileSync(out, 'utf8').trim().split('\n').map(l => l.trim().split(/\s+/).map(Number));
  return { time: rows.map(r => r[0]), values: rows.map(r => r[1]) };
}

/** Max |spice-ts - ngspice| with spice-ts linearly interpolated onto the ngspice grid. */
function maxAbsDiff(tsTime, tsValues, ngTime, ngValues, from = 0) {
  let j = 0;
  let max = 0;
  let at = 0;
  for (let i = 0; i < ngTime.length; i++) {
    const t = ngTime[i];
    if (t < from) continue;
    while (j < tsTime.length - 2 && tsTime[j + 1] < t) j++;
    const t0 = tsTime[j];
    const t1 = tsTime[j + 1];
    const v = t1 === t0 ? tsValues[j] : tsValues[j] + (tsValues[j + 1] - tsValues[j]) * (t - t0) / (t1 - t0);
    const e = Math.abs(v - ngValues[i]);
    if (e > max) { max = e; at = t; }
  }
  return { max, at };
}

function around(grid, t, n = 3) {
  let i = grid.findIndex(x => x >= t * (1 - 1e-12));
  if (i < 0) i = grid.length - 1;
  return grid.slice(Math.max(0, i - n), i + n + 1);
}

const results = [];
for (const deck of DECKS) {
  const result = (await simulate(deck.netlist)).transient;
  const ts = Array.from(result.time);
  const node = deck.vector.slice(2, -1);
  const ngRun = ngspice(deck.netlist, deck.vector);
  const ng = ngRun.time;
  let agree = 0;
  while (agree < Math.min(ts.length, ng.length)
    && Math.abs(ts[agree] - ng[agree]) <= 1e-9 * Math.max(Math.abs(ng[agree]), 1e-30)) agree++;
  results.push({
    deck: deck.name,
    points: { spiceTs: ts.length, ngspice: ng.length },
    leadingAgreeingPoints: agree,
    vector: deck.vector,
    maxAbsDiff: maxAbsDiff(ts, Array.from(result.voltage(node)), ng, ngRun.values),
    settle: deck.settle,
    maxAbsDiffAfterSettle: maxAbsDiff(ts, Array.from(result.voltage(node)), ng, ngRun.values, deck.settle),
    first: { spiceTs: ts.slice(0, 8), ngspice: ng.slice(0, 8) },
    corner: deck.corner,
    aroundCorner: { spiceTs: around(ts, deck.corner), ngspice: around(ng, deck.corner) },
  });
}
if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
else for (const r of results) {
  console.log(`== ${r.deck}: points ts=${r.points.spiceTs} ng=${r.points.ngspice}; leading agreeing points ${r.leadingAgreeingPoints}; max |d${r.vector}| ${r.maxAbsDiff.max.toPrecision(3)} at t=${r.maxAbsDiff.at}; from t=${r.settle}: ${r.maxAbsDiffAfterSettle.max.toPrecision(3)} at t=${r.maxAbsDiffAfterSettle.at}`);
  console.log('  first ts:', r.first.spiceTs.map(x => x.toPrecision(8)).join(' '));
  console.log('  first ng:', r.first.ngspice.map(x => x.toPrecision(8)).join(' '));
  console.log(`  around ${r.corner} ts:`, r.aroundCorner.spiceTs.map(x => x.toPrecision(10)).join(' '));
  console.log(`  around ${r.corner} ng:`, r.aroundCorner.ngspice.map(x => x.toPrecision(10)).join(' '));
}
