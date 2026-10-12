#!/usr/bin/env node
// Regenerates ngspice47-invert1-grid-742.json: the first accepted time points
// and i(vin1) of ngspice-47 on INVERT1_DECK below (corpus-g MPDE/invert1.cir,
// Xyce Regression, BSD-3-Clause, with the MOS1 RS/RD/RSH removed so the
// deck does not depend on series-resistance support).
//
// Usage: node packages/core/src/analysis/fixtures/gen-ngspice47-invert1-grid-742.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const POINTS = 100;
const INVERT1_DECK = `MOS LEVEL 1 MODEL CMOS INVERTER (corpus-g MPDE/invert1.cir without RS/RD/RSH)
.tran 20ns 6us
.options maxord=5 reltol=1.0e-4
VDDdev VDD 0 5V
RIN IN 1 1K
VIN1 1 0 5V PULSE (5V 0V 1.5us 0.15us 0.15us 1.5us 3.3us)
R1 VOUT 0 10K
C2 VOUT 0 0.1p
MN1 VOUT IN 0 0 CD4012_NMOS L=5u W=175u
MP1 VOUT IN VDD VDD CD4012_PMOS L=5u W=270u
.MODEL cd4012_pmos PMOS (LEVEL = 1 UO = 310 VTO = -1.6 TOX = 6E-08 NSUB = 5.701E+15
+ NSS =1E-10 IS = 1E-14 LD = 3E-08 KP = 1.711E-05 L=5u W=270u lambda=0.02 GAMMA=0.37 PHI=0.65
+ CBD=0.1P CBS=0.1P PB=0.81 CGSO=2P CGBO=4P CGDO=2P CJ=2E-4 MJ=0.5 CJSW=1E-9
+ MJSW=0.5 JS=1E-8 TPG=0 KF=1E-25 AF=1 FC=0.5 TNOM=27)
.MODEL cd4012_nmos NMOS (LEVEL = 1 UO = 190 VTO = 1.679 TOX = 6E-08 NSUB = 8.601E+15
+ NSS = 0 IS = 1E-14 LD = 8.6E-07 KP = 2.161E-05 L=5u W=175u lambda=0.02 GAMMA=0.37 PHI=0.65
+ CBD=0.1P CBS=0.1P PB=0.81 CGSO=2P CGBO=4P CGDO=2P CJ=2E-4 MJ=0.5 CJSW=1E-9
+ MJSW=0.5 JS=1E-8 TPG=0 KF=1E-25 AF=1 FC=0.5 TNOM=27)
.end
`;

{
  const dir = mkdtempSync(join(tmpdir(), 'invert1-742-'));
  const data = join(dir, 'out.txt');
  writeFileSync(join(dir, 'deck.cir'), INVERT1_DECK.replace(/^\.end\s*$/m,
    `.control\nset filetype=ascii\nset wr_singlescale\nset wr_vecnames\nset numdgt=12\nrun\nwrdata ${data} i(vin1)\n.endc\n.end`));
  const version = execFileSync('ngspice', ['-v'], { encoding: 'utf8' }).match(/ngspice-\S+/)?.[0];
  execFileSync('ngspice', ['-b', join(dir, 'deck.cir')], { stdio: 'ignore' });
  const rows = readFileSync(data, 'utf8').trim().split('\n').slice(1).map(line => line.trim().split(/\s+/).map(Number));
  const head = rows.slice(0, POINTS);
  writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'ngspice47-invert1-grid-742.json'), `${JSON.stringify({
    generator: 'gen-ngspice47-invert1-grid-742.mjs',
    simulator: version,
    totalPoints: rows.length,
    deck: INVERT1_DECK,
    time: head.map(row => row[0]),
    ivin1: head.map(row => row[1]),
  }, null, 1)}\n`);
}
