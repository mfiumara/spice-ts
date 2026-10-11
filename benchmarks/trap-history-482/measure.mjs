// Issue #482 / #477: first-edge timing of two transient decks in spice-ts and
// ngspice-47 on identical netlists. Run after `pnpm -C packages/core build`:
//   node benchmarks/trap-history-482/measure.mjs
// Prints JSON. ngspice must be on PATH (ngspice-47 was used for the PR).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simulate } from '../../packages/core/dist/index.js';
import { cmosInverterChainTran } from '../performance/scaling-m2-fixture.mjs';

const root = new URL('../../', import.meta.url);
const mesa = readFileSync(new URL('benchmarks/corpus/ngspice/fixtures/tests/mesa/mesosc.cir', root), 'utf8');
const chain = cmosInverterChainTran(22).netlist;

function crossings(time, values, level, from = -Infinity) {
  const out = [];
  for (let i = 1; i < values.length; i++) {
    if (time[i] < from) continue;
    const a = values[i - 1] - level;
    const b = values[i] - level;
    if ((a < 0) !== (b < 0)) out.push(time[i - 1] + (time[i] - time[i - 1]) * a / (a - b));
  }
  return out;
}

function firstRising(time, values, level, from) {
  for (let i = 1; i < values.length; i++) {
    if (time[i] < from) continue;
    if (values[i - 1] < level && values[i] >= level) {
      return time[i - 1] + (time[i] - time[i - 1]) * (level - values[i - 1]) / (values[i] - values[i - 1]);
    }
  }
  return NaN;
}

function ngspice(netlist, nodes) {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'ng482-'));
  const out = join(dir, 'out.txt');
  const body = netlist.replace(/^\.end\s*$/m, '')
    + `.control\nrun\nset wr_singlescale\nwrdata ${out} ${nodes.map(n => `v(${n})`).join(' ')}\n.endc\n.end\n`;
  const deck = join(dir, 'deck.cir');
  writeFileSync(deck, body);
  execFileSync('ngspice', ['-b', deck], { stdio: 'ignore' });
  const rows = readFileSync(out, 'utf8').trim().split('\n').map(l => l.trim().split(/\s+/).map(Number));
  return {
    time: rows.map(r => r[0]),
    voltage: name => rows.map(r => r[1 + nodes.indexOf(name)]),
    points: rows.length,
  };
}

const ps = t => Number((t * 1e12).toFixed(2));

async function run() {
  const result = {};

  const mesaTs = (await simulate(mesa)).transient;
  const mesaNg = ngspice(mesa, ['8']);
  result.mesa = {
    metric: 'first rising 0.33 V crossing of v(8) after 1 ns, ps',
    spiceTs: ps(firstRising(mesaTs.time, mesaTs.voltage('8'), 0.33, 1e-9)),
    ngspice: ps(firstRising(mesaNg.time, mesaNg.voltage('8'), 0.33, 1e-9)),
    spiceTsOutputPointsBefore1p4ns: mesaTs.time.filter(t => t < 1.4e-9).length,
    spiceTsPoints: mesaTs.time.length,
    ngspicePoints: mesaNg.points,
  };

  const stages = ['s1', 's2', 's5', 's10'];
  const chainTs = (await simulate(chain)).transient;
  const chainNg = ngspice(chain, stages);
  result.chain477 = {
    metric: 'first 1.25 V crossing per stage, ps',
    stages,
    spiceTs: stages.map(s => ps(crossings(chainTs.time, chainTs.voltage(s), 1.25)[0])),
    ngspice: stages.map(s => ps(crossings(chainNg.time, chainNg.voltage(s), 1.25)[0])),
    spiceTsPoints: chainTs.time.length,
    ngspicePoints: chainNg.points,
  };
  console.log(JSON.stringify(result, null, 2));
}

await run();
