// Issue #596: corpus-f examples/vdmos/inv_vdmos.sp transient, spice-ts vs
// ngspice-47 on identical device/source cards. Run after
// `pnpm -C packages/core build`:
//   node benchmarks/vdmos-tran-596/measure.mjs > benchmarks/vdmos-tran-596/results.json
// ngspice must be on PATH (ngspice-47 was used for the PR).
//
// The deck is the corpus-f fixture with its .control block replaced by a
// plain .tran card (the fixture's `tran 1n 1u` and, for the step-refinement
// study, the same card with an explicit TMAX). Nothing else is changed.
// Errors use the corpus-f metric: max |a - b| at the points of the engine
// being scored, the other waveform linearly interpolated, divided by the
// reference peak |value|.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate } from '../../packages/core/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, '../corpus/corpus-f/fixtures/examples/vdmos/inv_vdmos.sp');
const SIGNALS = [['i(vdd)', 'vdd'], ['i(vss)', 'vss'], ['v(3)', '3'], ['i(vin)', 'Vin']];

function deck(tran) {
  const source = readFileSync(FIXTURE, 'utf8');
  return source.replace(/^\.control[\s\S]*?^\.endc\s*$/m, tran).replace(/^\.end\s*$/m, '') + '.end\n';
}

function ngspice(netlist) {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'ng596-'));
  const out = join(dir, 'out.txt');
  const body = netlist.replace(/^\.end\s*$/m, '')
    + `.control\nrun\nset wr_singlescale\nset numdgt=12\nwrdata ${out} ${SIGNALS.map(([name]) => name).join(' ')}\n.endc\n.end\n`;
  const file = join(dir, 'deck.cir');
  writeFileSync(file, body);
  execFileSync('ngspice', ['-b', file], { stdio: 'ignore' });
  const rows = readFileSync(out, 'utf8').trim().split('\n').map(l => l.trim().split(/\s+/).map(Number));
  const wave = { time: rows.map(r => r[0]) };
  SIGNALS.forEach(([name], k) => { wave[name] = rows.map(r => r[k + 1]); });
  return wave;
}

async function spiceTs(netlist) {
  const transient = (await simulate(netlist)).transient;
  const wave = { time: Array.from(transient.time) };
  for (const [name, id] of SIGNALS) {
    wave[name] = Array.from(name.startsWith('v(') ? transient.voltage(id) : transient.current(id));
  }
  return wave;
}

function interpolate(time, values, t) {
  let lo = 0;
  let hi = time.length - 1;
  if (t <= time[0]) return values[0];
  if (t >= time[hi]) return values[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (time[mid] <= t) lo = mid; else hi = mid;
  }
  const f = (t - time[lo]) / (time[hi] - time[lo]);
  return values[lo] + f * (values[hi] - values[lo]);
}

/** Corpus-f normalised error of `scored` against `reference`, at scored's points up to `until`. */
function score(scored, reference, until = Infinity) {
  const out = {};
  for (const [name] of SIGNALS) {
    let peak = 0;
    for (let i = 0; i < reference.time.length; i++) {
      if (reference.time[i] <= until) peak = Math.max(peak, Math.abs(reference[name][i]));
    }
    let worst = 0;
    let at = 0;
    for (let i = 0; i < scored.time.length; i++) {
      const t = scored.time[i];
      if (t > until) break;
      const error = Math.abs(scored[name][i] - interpolate(reference.time, reference[name], t));
      if (error > worst) { worst = error; at = t; }
    }
    out[name] = { normalized: round(worst / Math.max(peak, 1e-12)), absMax: round(worst), at: round(at) };
  }
  return out;
}

function minimum(wave, name, from, to) {
  let value = Infinity;
  let at = 0;
  for (let i = 0; i < wave.time.length; i++) {
    const t = wave.time[i];
    if (t >= from && t <= to && wave[name][i] < value) { value = wave[name][i]; at = t; }
  }
  return { value: round(value), at: round(at) };
}

const round = (x) => Number(x.toPrecision(6));

// 1. The corpus-f comparison: both engines at the fixture's own `tran 1n 1u`.
const fixtureTran = '.tran 1n 1u';
const ngDefault = ngspice(deck(fixtureTran));
const stDefault = await spiceTs(deck(fixtureTran));

// 2. Converged reference: ngspice-47 with TMAX 0.5p over the first 340 ns
//    (rising input edge 10-20 ns, falling 160-170 ns, rising 310-320 ns).
const window = 340e-9;
const reference = ngspice(deck('.tran 1n 340n 0 0.5p'));

// 3. Step refinement of the i(vdd) shoot-through peaks, both engines.
const refinement = [];
for (const tmax of ['1n', '10p', '5p', '2p', '1p', '0.5p']) {
  const tran = `.tran 1n 180n 0 ${tmax}`;
  const ng = ngspice(deck(tran));
  const st = await spiceTs(deck(tran));
  refinement.push({
    tmax,
    points: { ngspice: ng.time.length, spiceTs: st.time.length },
    risingInputPeak: { ngspice: minimum(ng, 'i(vdd)', 15e-9, 40e-9), spiceTs: minimum(st, 'i(vdd)', 15e-9, 40e-9) },
    fallingInputPeak: { ngspice: minimum(ng, 'i(vdd)', 165e-9, 180e-9), spiceTs: minimum(st, 'i(vdd)', 165e-9, 180e-9) },
  });
}
const stFine = await spiceTs(deck('.tran 1n 340n 0 10p'));

console.log(JSON.stringify({
  deck: 'benchmarks/corpus/corpus-f/fixtures/examples/vdmos/inv_vdmos.sp (.control replaced by the .tran card)',
  fixtureTran: {
    points: { ngspice: ngDefault.time.length, spiceTs: stDefault.time.length },
    spiceTsVsNgspice: score(stDefault, ngDefault),
  },
  againstConvergedNgspice: {
    reference: `.tran 1n 340n 0 0.5p (${reference.time.length} points), scored for t <= 340 ns`,
    ngspiceFixtureTran: score(ngDefault, reference, window),
    spiceTsFixtureTran: score(stDefault, reference, window),
    spiceTsTmax10p: score(stFine, reference, window),
  },
  ivddPeakRefinement: refinement,
}, null, 2));
