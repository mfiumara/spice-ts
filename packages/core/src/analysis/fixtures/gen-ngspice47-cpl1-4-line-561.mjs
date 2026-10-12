#!/usr/bin/env node
// Regenerates ngspice47-cpl1-4-line-561.json: every accepted time point and the
// eight plotted node voltages of ngspice-47 on the corpus-f deck
// examples/TransmissionLines/cpl1_4_line.sp (ngspice 3ef069fb, BSD-3-Clause),
// issue #561.
//
// The deck runs `TRAN` from a `.control` block. As in
// benchmarks/txl-cpl/compare.ts, the block is dropped and its `tran` command
// becomes a `.tran` card; that one netlist is stored in the fixture and is what
// the spice-ts test simulates, so both simulators see identical circuits.
//
// Usage: node packages/core/src/analysis/fixtures/gen-ngspice47-cpl1-4-line-561.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = 'benchmarks/corpus/corpus-f/fixtures/examples/TransmissionLines/cpl1_4_line.sp';
const NODES = ['5', '6', '7', '8', '9', '10', '11', '12'];

const lines = readFileSync(join(here, '../../../../..', SOURCE), 'utf8').split('\n');
let inControl = false;
let tran = '';
const kept = [];
for (const line of lines) {
  if (/^\s*\.control/i.test(line)) { inControl = true; continue; }
  if (/^\s*\.endc/i.test(line)) { inControl = false; continue; }
  if (inControl) {
    if (!tran && /^\s*tran\b/i.test(line)) tran = line.trim();
    continue;
  }
  kept.push(line);
}
const DECK = `${kept.join('\n').replace(/^\.end\s*$/im, '')}\n.${tran}\n.end\n`;

const dir = mkdtempSync(join(tmpdir(), 'cpl1-4-line-561-'));
const data = join(dir, 'out.txt');
writeFileSync(join(dir, 'deck.cir'), DECK.replace(/^\.end\s*$/m,
  `.control\nset filetype=ascii\nset wr_singlescale\nset wr_vecnames\nset numdgt=17\nrun\nwrdata ${data} ${NODES.map(n => `v(${n})`).join(' ')}\n.endc\n.end`));
const version = execFileSync('ngspice', ['-v'], { encoding: 'utf8' }).match(/ngspice-\S+/)?.[0];
execFileSync('ngspice', ['-b', join(dir, 'deck.cir')], { stdio: 'ignore' });
const rows = readFileSync(data, 'utf8').trim().split('\n').slice(1).map(line => line.trim().split(/\s+/).map(Number));
writeFileSync(join(here, 'ngspice47-cpl1-4-line-561.json'), `${JSON.stringify({
  generator: 'gen-ngspice47-cpl1-4-line-561.mjs',
  simulator: version,
  source: SOURCE,
  totalPoints: rows.length,
  deck: DECK,
  nodes: NODES,
  time: rows.map(row => row[0]),
  voltages: NODES.map((_, k) => rows.map(row => row[k + 1])),
})}\n`);
