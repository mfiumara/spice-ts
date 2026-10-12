#!/usr/bin/env node
// Regenerates ngspice47-txl-lossless-708.json: every accepted time point and
// v(b), v(d) of ngspice-47 on TXL_LOSSLESS_AND_SHUNT_G_DECK below (the deck of
// packages/core/src/devices/swec-lines.test.ts, issue #708).
//
// Usage: node packages/core/src/analysis/fixtures/gen-ngspice47-txl-lossless-708.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DECK = `lossless and shunt-G TXL
VS 1 0 PULSE(0 1 0.1n 0.1n 0.1n 5n 20n)
RS 1 a 50
Y1 a 0 b 0 ylossless
RL b 0 100
RS2 1 c 50
Y2 c 0 d 0 ylossy
RL2 d 0 100
.model ylossless txl R=0.001 L=2.5e-7 G=0 C=1e-10 length=0.2
.model ylossy txl R=5 L=2.5e-7 G=1e-3 C=1e-10 length=1
.tran 0.02n 10n
.end
`;

{
  const dir = mkdtempSync(join(tmpdir(), 'txl-lossless-708-'));
  const data = join(dir, 'out.txt');
  writeFileSync(join(dir, 'deck.cir'), DECK.replace(/^\.end\s*$/m,
    `.control\nset filetype=ascii\nset wr_singlescale\nset wr_vecnames\nset numdgt=17\nrun\nwrdata ${data} v(b) v(d)\n.endc\n.end`));
  const version = execFileSync('ngspice', ['-v'], { encoding: 'utf8' }).match(/ngspice-\S+/)?.[0];
  execFileSync('ngspice', ['-b', join(dir, 'deck.cir')], { stdio: 'ignore' });
  const rows = readFileSync(data, 'utf8').trim().split('\n').slice(1).map(line => line.trim().split(/\s+/).map(Number));
  writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'ngspice47-txl-lossless-708.json'), `${JSON.stringify({
    generator: 'gen-ngspice47-txl-lossless-708.mjs',
    simulator: version,
    totalPoints: rows.length,
    deck: DECK,
    time: rows.map(row => row[0]),
    vb: rows.map(row => row[1]),
    vd: rows.map(row => row[2]),
  })}\n`);
}
