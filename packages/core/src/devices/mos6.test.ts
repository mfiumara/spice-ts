import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

/**
 * Issue #447: MOSFET level 6 (Sakurai-Newton n-th power law) used to fall back
 * to the level-1 square law with KP=KC, no body effect and no Meyer gate
 * capacitance, leaving ngspice/mos6-simple-inverter-transient v(11) 2.956 V
 * off ngspice-47. Reference values below come from ngspice-47 (`wrdata`,
 * numdgt=15) on the identical decks.
 */
const SIMPLE_INVERTER = readFileSync(
  new URL('../../../../benchmarks/corpus/ngspice/fixtures/tests/mos6/simpleinv.cir', import.meta.url),
  'utf8',
);

function interpolate(time: ArrayLike<number>, values: ArrayLike<number>, at: number): number {
  let index = 1;
  while (index < time.length - 1 && time[index] < at) index++;
  const fraction = (at - time[index - 1]) / (time[index] - time[index - 1]);
  return values[index - 1] + fraction * (values[index] - values[index - 1]);
}

describe('MOSFET level 6 (issue #447)', () => {
  it('matches the ngspice-47 static CMOS inverter transfer curve', async () => {
    const deck = SIMPLE_INVERTER
      .replace(/^\.TRAN.*$/m, '.DC VIN 0 5 0.5')
      .replace(/^\.PRINT.*$/m, '.PRINT DC V(11) I(VDD)');
    const result = await simulate(deck);
    const sweep = result.dcSweep!;
    const output = sweep.voltage('11');
    const supply = sweep.current('VDD');
    // [VIN, V(11), I(VDD)] from ngspice-47 .DC VIN 0 5 0.01; tolerance is the
    // Newton convergence tolerance, not model error.
    const reference: Array<[number, number, number]> = [
      [0.5, 4.999999988900822, -5.010000012654294e-12],
      [1.0, 4.837291182740227, -6.427786673450194e-05],
      [1.5, 4.365201154302108, -1.995881340808945e-04],
      [2.5, 4.122678503104254e-01, -2.277334701301028e-04],
      [3.0, 2.126501230856484e-01, -1.375476720625715e-04],
      [4.0, 2.233087426792201e-02, -1.694211981561077e-05],
    ];
    for (const [vin, v11, ivdd] of reference) {
      const index = Array.from(sweep.sweepValues).findIndex(value => Math.abs(value - vin) < 1e-9);
      expect(index, `sweep point ${vin}`).toBeGreaterThanOrEqual(0);
      expect(Math.abs(output[index] - v11), `V(11) at VIN=${vin}`).toBeLessThan(1e-4);
      expect(Math.abs(supply[index] - ivdd), `I(VDD) at VIN=${vin}`).toBeLessThan(1e-9 + 1e-4 * Math.abs(ivdd));
    }
  });

  it('matches ngspice-47 drain current with body bias, SIGMA/GAMMA1 and NSUB-derived parameters', async () => {
    const result = await simulate(`MOS6 drain current
VD d 0 DC 0
VG g 0 DC 2
VB b 0 DC -1
M1 d g 0 b N6X L=2u W=10u
.MODEL N6X NMOS LEVEL=6 KV=1.2 NV=0.9 NC=1.3 SIGMA=0.02 GAMMA1=0.05 LAMBDA0=0.02 LAMBDA1=0.004 TOX=2E-08 NSUB=1E+16 LD=0.1U
.DC VD -1 3 0.5
.END`);
    const current = result.dcSweep!.current('VD');
    // ngspice-47 I(VD) for VD = -1 .. 3 step 0.5 (inverse mode for VD < 0).
    const reference = [
      6.355815131505877e-04, 3.069608071335162e-04, -1.010000000000000e-12,
      -2.641607339619476e-04, -4.587708495996218e-04, -5.818252698394651e-04,
      -6.313381116574838e-04, -6.432739519812523e-04, -6.553241226356232e-04,
    ];
    expect(current.length).toBe(reference.length);
    reference.forEach((expected, index) => {
      expect(Math.abs(current[index] - expected), `I(VD) point ${index}`)
        .toBeLessThan(1e-12 + 1e-7 * Math.abs(expected));
    });
  });

  it('tracks the ngspice-47 mos6-simple-inverter-transient v(11) waveform', async () => {
    const result = await simulate(SIMPLE_INVERTER);
    const transient = result.transient!;
    const output = transient.voltage('11');
    // ngspice-47 v(11), default tolerances, interpolated at points off the
    // ~1 ns switching edge (where both engines carry timestep error).
    const reference: Array<[number, number]> = [
      [30e-9, 4.83836],
      [45e-9, 4.36721],
      [55e-9, 3.73536],
      [65e-9, 0.66695],
      [80e-9, 0.33321],
      [100e-9, 0.12716],
      [120e-9, 0.02278],
    ];
    for (const [time, expected] of reference) {
      const actual = interpolate(transient.time, output, time);
      expect(Math.abs(actual - expected), `v(11) at ${time * 1e9} ns`).toBeLessThan(0.02);
    }
  });

  it('rejects unsupported level-6 series resistances instead of ignoring them', async () => {
    await expect(simulate(`MOS6 RD
VD d 0 5
M1 d d 0 0 NR L=1u W=5u
.MODEL NR NMOS LEVEL=6 RD=10
.OP
.END`)).rejects.toThrow(/series resistance parameter RD/);
  });
});
