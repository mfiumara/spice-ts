import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// Issue #719 (corpus-g BUG_374/capacitor-bug.cir): ngspice-47 inp2c.c/inp2l.c take an unlabeled
// number after the model name (INPdevParse "waslead") as the capacitance/inductance, so
// `C 3 0 CMODEL 1pf` is a 1 pF capacitor. spice-ts used to drop the value and simulate 0 F.
//
// ngspice-47 reference (`ngspice -b -r`, ascii raw) on one deck holding both halves below
// (title, VIN 1 0 AC 1, the C and L lines with R, VMON, R4, both .MODEL cards, same .AC), re/im:
//   f = 80.07747154594769 MHz:  v(3) = 0.7979881364046371 - 0.4015010218692992j
//   f = 159.1549430918954 MHz:  v(3) = 0.4999999999999999 - 0.5j
//                               v(4) = 0.9999990000009999 + 0.0009999990000009997j
// The two halves run as separate decks: the L branch (VIN, R4, L1) and the C branch share only
// the ideal source node 1, so the ngspice values are the same, and keeping them apart avoids an
// unrelated complex-LU pivoting loss (VMON plus L1 in one AC matrix, #732).
const CAPACITOR_DECK = [
  'model-first capacitor value',
  'VIN 1 0 AC 1',
  'R 1 2 1K',
  'C 3 0 CMODEL 1pf',
  'VMON 2 3 0',
  '.MODEL CMODEL C ()',
  '.AC LIN 3 1MEG 159.15494309189535MEG',
  '.END',
].join('\n');
const INDUCTOR_DECK = [
  'model-first inductor value',
  'VIN 1 0 AC 1',
  'L1 4 0 LMOD 1u',
  'R4 1 4 1',
  '.MODEL LMOD L ()',
  '.AC LIN 3 1MEG 159.15494309189535MEG',
  '.END',
].join('\n');

function polar(re: number, im: number): { magnitude: number; phase: number } {
  return { magnitude: Math.hypot(re, im), phase: (Math.atan2(im, re) * 180) / Math.PI };
}

describe('C/L value after the model name (ngspice waslead, #719)', () => {
  it('reads `C n+ n- MODEL 1pf` and `L n+ n- MODEL 1u` values like ngspice-47', async () => {
    const v3 = (await simulate(CAPACITOR_DECK)).ac!.voltage('3');
    const v4 = (await simulate(INDUCTOR_DECK)).ac!.voltage('4');
    const references: Array<[{ magnitude: number; phase: number }, { magnitude: number; phase: number }]> = [
      [v3[1], polar(0.7979881364046371, -0.4015010218692992)],
      [v3[2], polar(0.4999999999999999, -0.5)],
      [v4[2], polar(0.9999990000009999, 0.0009999990000009997)],
    ];
    for (const [actual, reference] of references) {
      expect(actual.magnitude).toBeCloseTo(reference.magnitude, 9);
      expect(actual.phase).toBeCloseTo(reference.phase, 6);
    }
  });
});
