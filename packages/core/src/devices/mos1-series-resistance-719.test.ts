import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// Issue #719 (corpus-g VSTARTEST, MOSFET_ParamAliases/invert1_alt, BUG_237): MOS1 ignored the
// drain/source series resistances. ngspice-47 mos1temp.c sets
//   drainConductance = M / RD when RD is given (0 when RD = 0),
//   else M / (RSH * NRD) when RSH is given and non-zero (NRD defaults to 1 square, mos1set.c),
// and likewise for the source with RS / NRS, with the intrinsic device between the prime nodes.
//
// ngspice-47 reference: `ngspice -b -r` on DECK (ascii raw), sweep points VIN = 0, 2.5, 5:
const NGSPICE_VOUT = [4.798401135609866, 0.5764625316371507, 1.392845717001619e-9];
const NGSPICE_D2 = [4.999999994989995, 4.591318745806496, 1.367548085084858];
const NGSPICE_I_VDD = [-4.798401233793097e-4, -8.181565393854705e-4, -3.632451919925145e-3];

const DECK = [
  'MOS1 RD/RS/RSH series resistance',
  'VDD VDD 0 5',
  'VIN IN 0 0',
  'R1 VOUT 0 10K',
  'MN1 VOUT IN 0 0 NM L=5u W=175u',
  'MP1 VOUT IN VDD VDD PM L=5u W=270u',
  'MN2 D2 IN 0 0 NS L=5u W=175u NRD=2 NRS=3',
  'RL2 VDD D2 1K',
  '.MODEL PM PMOS (LEVEL=1 VTO=-1.6 KP=1.711E-05 LD=3E-08 LAMBDA=0.02 GAMMA=0.37 PHI=0.65 RS=5.359 RD=93.66 RSH=2E-10)',
  '.MODEL NM NMOS (LEVEL=1 VTO=1.679 KP=2.161E-05 LD=8.6E-07 LAMBDA=0.02 GAMMA=0.37 PHI=0.65 RS=13.21 RD=11.59 RSH=0)',
  '.MODEL NS NMOS (LEVEL=1 VTO=1.679 KP=2.161E-05 LD=8.6E-07 LAMBDA=0.02 GAMMA=0.37 PHI=0.65 RSH=10)',
  '.DC VIN 0 5 2.5',
  '.END',
].join('\n');

describe('MOS1 drain/source series resistance (#719)', () => {
  it('applies RD/RS (over RSH) and RSH*NRD/NRS like ngspice-47 mos1temp.c', async () => {
    const sweep = (await simulate(DECK)).dcSweep!;
    const vout = [...sweep.voltage('VOUT')];
    const d2 = [...sweep.voltage('D2')];
    const ivdd = [...sweep.current('VDD')];
    // Both engines stop Newton at RELTOL = 1e-3; 2e-4 relative is well inside that. Without the
    // series resistances VOUT(VIN = 0) is 4.84455 V (0.046 V off) and D2(VIN = 5) is 1.18466 V (0.18 V off).
    const close = (actual: number, reference: number, floor: number) =>
      expect(Math.abs(actual - reference)).toBeLessThan(2e-4 * Math.abs(reference) + floor);
    for (let i = 0; i < 3; i += 1) {
      close(vout[i], NGSPICE_VOUT[i], 1e-6);
      close(d2[i], NGSPICE_D2[i], 1e-6);
      close(ivdd[i], NGSPICE_I_VDD[i], 1e-12);
    }
  });
});
