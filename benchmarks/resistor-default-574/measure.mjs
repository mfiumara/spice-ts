// Issue #574: resistors with no resistance given default to 1 mOhm (ngspice-47
// restemp.c) and 0 < |R| < 1e-12 is clamped to +/-1e-12 (resparam.c). Runs the
// same decks in ngspice-47 and spice-ts and prints every operating-point value
// with its relative error, plus both engines' resistor warnings. Run after
// `pnpm -C packages/core build`:
//   node benchmarks/resistor-default-574/measure.mjs
// ngspice must be on PATH (ngspice-47 was used for the PR). The decks are
// project-authored (MIT).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simulate } from '../../packages/core/dist/index.js';

const DECKS = {
  'model-without-r': {
    netlist: `* 574a: model with no R/RSH
V1 1 0 DC 1
R1 1 0 rx
.model rx r kf=0
.op
.end
`,
    vectors: ['i(v1)'],
  },
  'non-positive-model-r': {
    netlist: `* 574c: model r=0, negative model r, RSH with zero width
V1 1 0 DC 1
R1 1 2 1k
R2 2 3 rz
R3 3 4 rn
R4 4 0 rs w=0
.model rz r r=0
.model rn r r=-5
.model rs r rsh=100
.op
.end
`,
    vectors: ['v(2)', 'v(3)', 'v(4)', 'i(v1)'],
  },
  'keyword-only-card': {
    netlist: `* 574e: no value, keyword-only parameters, no model
V1 1 0 DC 1
R1 1 2 1k
R2 2 0 l=1u
R3 1 3 1k
R4 3 0 tc1=1m
.op
.end
`,
    vectors: ['v(2)', 'v(3)', 'i(v1)'],
  },
  'tiny-value-clamp': {
    netlist: `* 574d: tiny instance value clamp
V1 1 0 DC 1
R1 1 2 1
R2 2 0 1e-15
R3 1 3 1
R4 3 0 -1e-15
.op
.end
`,
    vectors: ['v(2)', 'v(3)', 'i(v1)'],
  },
};

function ngspice(netlist, vectors) {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'ng574-'));
  const out = join(dir, 'out.txt');
  const deck = join(dir, 'deck.cir');
  writeFileSync(deck, netlist.replace(/^\.end\s*$/m, '')
    + `.control\nrun\nset wr_singlescale\nset wr_vecnames\nwrdata ${out} ${vectors.join(' ')}\n.endc\n.end\n`);
  const run = spawnSync('ngspice', ['-b', deck], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (run.status !== 0) throw new Error(`ngspice failed: ${run.stderr}`);
  const log = `${run.stdout}\n${run.stderr}`;
  // wr_singlescale writes the (operating-point) scale column first.
  const [, row] = readFileSync(out, 'utf8').trim().split('\n');
  const values = row.trim().split(/\s+/).slice(1).map(Number);
  const warnings = log.split('\n').filter(line => /resist/i.test(line) && /warning/i.test(line));
  return { values: Object.fromEntries(vectors.map((v, k) => [v, values[k]])), warnings };
}

async function spiceTs(netlist, vectors) {
  const result = await simulate(netlist);
  const values = {};
  for (const vector of vectors) {
    const [, kind, name] = /^([vi])\((.+)\)$/.exec(vector);
    values[vector] = kind === 'v' ? result.dc.voltage(name) : result.dc.current(name.toUpperCase());
  }
  return { values, warnings: result.warnings.filter(w => w.type === 'model').map(w => w.message) };
}

const report = {};
for (const [id, { netlist, vectors }] of Object.entries(DECKS)) {
  const ng = ngspice(netlist, vectors);
  const ts = await spiceTs(netlist, vectors);
  report[id] = {
    vectors: Object.fromEntries(vectors.map(v => [v, {
      ngspice: ng.values[v],
      spiceTs: ts.values[v],
      relativeError: Math.abs(ts.values[v] / ng.values[v] - 1),
    }])),
    ngspiceWarnings: ng.warnings,
    spiceTsWarnings: ts.warnings,
  };
}
console.log(JSON.stringify(report, null, 2));
