import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { simulate } from '../simulate.js';

const INVERT1_NGSPICE = JSON.parse(readFileSync(
  new URL('./fixtures/ngspice47-invert1-grid-742.json', import.meta.url), 'utf8',
)) as { deck: string; time: number[]; ivin1: number[] };

// Issue #742 (and #561 item 1): ngspice-47 dctran.c order and step control
// after an accepted point.
//
// - The first timepoint of the run is accepted without CKTtrunc ("no check
//   on first time point"), so CKTdelta is kept for the second step and the
//   order stays 1.
// - After any other order-1 step, CKTtrunc is repeated at order 2. The order
//   is raised only if that allows a step above 1.05 x CKTdelta; the next step
//   is the order-2 bound either way.
// - With UIC, a breakpoint is set at TSTEP once the first step is sized, and
//   that first step has no femtosecond floor (XSPICE build).
//
// spice-ts doubled the step right after the first one and sized the step
// after an order-1 step from its order-1 bound, so its grid left ngspice's at
// the third point and every later step decision ran on a shifted grid. On the
// corpus-g MPDE/invert1 inverter (RELTOL 1e-4) the shifted grid put an
// accepted point inside the Meyer region change at 3.22 us, where i(vin1)
// was 26% of the fine-step value away (#742).
//
// References are ngspice-47 accepted time points on the identical decks
// (`ngspice -b` with `wrdata <file> time`).

const LC_TANK_UIC = `lc tank 10 GHz
L1 1 0 1n
C1 1 0 0.25p IC=1
.tran 5e-14 2n UIC
.end
`;

/** ngspice-47 accepted time points of LC_TANK_UIC after t = 0 (wrdata omits t = 0 under UIC), first 12. */
const LC_TANK_UIC_NGSPICE = [
  5e-16, 1e-15, 2e-15, 4e-15, 8e-15, 1.6e-14, 3.2e-14, 5e-14, 5.32e-14, 5.96e-14, 7.24e-14, 9.8e-14,
];

const RC_PULSE = `rc pulse
VS 1 0 PULSE(0 1 0.1n 0.1n 0.1n 5n 20n)
R1 1 2 50
C1 2 0 1p
.tran 0.02n 10n
.end
`;

/** ngspice-47 accepted time points of RC_PULSE, first 24 (s, as wrdata prints them: 9 digits). */
const RC_PULSE_NGSPICE = [
  0, 2e-13, 4e-13, 8e-13, 1.6e-12, 3.2e-12, 6.4e-12, 1.28e-11, 2.56e-11, 4.56e-11,
  6.56e-11, 8.28e-11, 1e-10, 1.02e-10, 1.06e-10, 1.14e-10, 1.2493937e-10, 1.4493937e-10,
  1.6493937e-10, 1.82469685e-10, 2e-10, 2.02e-10, 2.06e-10, 2.14e-10,
];

function expectSameGrid(actual: ArrayLike<number>, expected: readonly number[]): void {
  for (let index = 0; index < expected.length; index++) {
    // ngspice's wrdata prints 9 significant digits.
    expect(Math.abs(actual[index] - expected[index]), `time point ${index}: ${actual[index]}`)
      .toBeLessThanOrEqual(1e-8 * expected[index]);
  }
}

describe('ngspice-47 dctran order and step control (#742)', () => {
  it('repeats the first step once, then grows, like ngspice-47', async () => {
    const transient = (await simulate(RC_PULSE)).transient!;
    expectSameGrid(transient.time, RC_PULSE_NGSPICE.slice(0, 8));
  });

  it('sizes the step after an order-1 step from the order-2 CKTterr trial', async () => {
    // After the 0.1 ns PULSE corner the first step is Backward Euler; ngspice
    // sizes the next one from the order-2 CKTterr trial (4 ps, 2 x CKTdelta),
    // not from the order-1 bound of the step just taken (3.49 ps).
    const transient = (await simulate(RC_PULSE)).transient!;
    expectSameGrid(transient.time, RC_PULSE_NGSPICE);
  });

  it('follows the ngspice-47 grid and i(vin1) through the first edge of the MOS1 inverter', async () => {
    // corpus-g MPDE/invert1.cir (RELTOL 1e-4) without RS/RD/RSH: the first
    // 100 ngspice-47 points run through the 1.5 us input fall, where the MOS1
    // Meyer gate charges (MOS1trunc) set the step. Before #742 the grids
    // parted at the third point.
    const transient = (await simulate(INVERT1_NGSPICE.deck)).transient!;
    const ivin1 = transient.current('VIN1');
    const peak = Math.max(...INVERT1_NGSPICE.ivin1.map(Math.abs));
    for (let index = 0; index < INVERT1_NGSPICE.time.length; index++) {
      const expected = INVERT1_NGSPICE.time[index];
      expect(Math.abs(transient.time[index] - expected), `time point ${index}: ${transient.time[index]}`)
        .toBeLessThanOrEqual(1e-6 * expected);
      expect(Math.abs(ivin1[index] - INVERT1_NGSPICE.ivin1[index]), `i(vin1) at point ${index}`)
        .toBeLessThanOrEqual(1e-3 * peak);
    }
  });

  it('sets the UIC breakpoint at TSTEP like ngspice-47', async () => {
    // ngspice takes 40011 points after t = 0; spice-ts matched none of them
    // before (no TSTEP breakpoint, second step doubled). Under UIC neither
    // writes a t = 0 row (#856).
    const transient = (await simulate(LC_TANK_UIC)).transient!;
    expect(transient.time[0]).toBeGreaterThan(0);
    expectSameGrid(transient.time, LC_TANK_UIC_NGSPICE);
    expect(transient.time).toHaveLength(40011);
  });
});
