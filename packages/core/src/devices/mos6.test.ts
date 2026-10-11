import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { createTransientSim } from '../analysis/transient-driver.js';

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

  // Issue #468 / #461: the Meyer gate and bulk-junction charges used to go
  // through the generic C(v) trapezoidal history (C at the new iterate applied
  // to the old voltages). With VIN pinning the gate, that injected an error
  // into the trapezoidal current recurrence that never decayed: i(vin) flipped
  // by ±16.6 uA every step (ngspice-47: a smooth -0.6 .. -1.2 uA). The charges
  // are now integrated with NIintegrate state as mos6load.c does.
  it('integrates the gate charge so i(vin) matches ngspice-47 without trapezoidal ringing', async () => {
    const result = await simulate(SIMPLE_INVERTER);
    const transient = result.transient!;
    const current = transient.current('VIN');
    // ngspice-47 i(vin) on the identical deck (`linearize`d, numdgt=15) every
    // 7.5 ns, skipping the 60 ns and 67.5 ns points on the switching edge
    // where both engines carry timestep error.
    const reference: Array<[number, number]> = [
      [7.5e-9, -6.22383930e-7], [15e-9, -6.41782346e-7], [22.5e-9, -7.67481646e-7],
      [30e-9, -8.26781472e-7], [37.5e-9, -8.84801386e-7], [45e-9, -9.73339503e-7],
      [52.5e-9, -1.17388163e-6], [75e-9, -8.47557230e-7], [82.5e-9, -8.05869409e-7],
      [90e-9, -7.81456473e-7], [97.5e-9, -7.63068767e-7], [105e-9, -7.47945343e-7],
      [112.5e-9, -7.34401514e-7], [120e-9, -7.21134035e-7], [127.5e-9, -7.06297323e-7],
      [135e-9, -6.86906037e-7], [142.5e-9, -6.76591932e-7], [150e-9, -6.84324616e-7],
    ];
    for (const [time, expected] of reference) {
      const actual = interpolate(transient.time, current, time);
      // 10 nA is ~1.3 % of the gate current; main was off by up to 16.6 uA.
      expect(Math.abs(actual - expected), `i(vin) at ${time * 1e9} ns`).toBeLessThan(10e-9);
    }
    // Undamped trapezoidal ringing reverses the slope at nearly every point
    // (586 of 590 on main). ngspice-47 reverses on 70 of its 308 points.
    let reversals = 0;
    for (let index = 2; index < current.length; index++) {
      if ((current[index] - current[index - 1]) * (current[index - 1] - current[index - 2]) < 0) reversals++;
    }
    expect(reversals).toBeLessThan(0.3 * current.length);
  });

  // mos6load.c integrates the exact bulk-junction depletion charges qbs/qbd,
  // continued above FC*PB by f2/f3/f4. Here the bulk is driven through 100k to
  // 0.71 V, past FC*PB = 0.5 V, with junction caps from AD/AS/PD/PS. Deck:
  // benchmarks/results/issue-468/ngspice/mos6-bulk-junction.cir.
  it('integrates the bulk junction charges across FC*PB like ngspice-47', async () => {
    const deck = readFileSync(
      new URL('../../../../benchmarks/results/issue-468/ngspice/mos6-bulk-junction.cir', import.meta.url),
      'utf8',
    );
    // ngspice-47 v(b) every 2 ns of its `linearize`d output on the identical deck.
    const reference = [
      -2.9999992, -1.82003696, -0.434823285, 0.187987181, 0.48450271, 0.632190231,
      0.697707703, 0.710408136, 0.71143711, 0.71150613, 0.711510689, 0.71151099,
      0.71151101, 0.711511011, 0.711511011, 0.711511011, 0.711511011, 0.711511011,
      0.711511011, 0.711511011, 0.711511011, 0.711511011, -0.288112369, -1.72445555,
      -2.42136188, -2.74089037, -2.88459034, -2.94871319, -2.97723134, -2.98989614,
      -2.99551692, -2.99801079, -2.99911714, -2.99960793, -2.99982564, -2.99992221,
      -2.99996505, -2.99998405, -2.99999248, -2.99999622, -2.99999788, -2.99999861,
      -2.99999894, -2.99999908, -2.99999915, -2.99999918, -2.99999919, -2.9999992,
      -2.9999992, -2.9999992, -2.9999992,
    ];
    const result = await simulate(deck);
    const transient = result.transient!;
    const bulk = transient.voltage('b');
    let worst = 0;
    reference.forEach((expected, index) => {
      worst = Math.max(worst, Math.abs(interpolate(transient.time, bulk, index * 2e-9) - expected));
    });
    // 17.2 mV at these points with the generic C(v) history (main 0f50fb1).
    expect(worst).toBeLessThan(3e-3);
  });

  it('replays the identical MOS6 trajectory after a transient reset', async () => {
    const sim = await createTransientSim(SIMPLE_INVERTER);
    const first = sim.advanceUntil(80e-9);
    sim.reset();
    const second = sim.advanceUntil(80e-9);
    expect(second.length).toBe(first.length);
    for (let index = 0; index < first.length; index++) {
      expect(second[index].time).toBe(first[index].time);
      expect(second[index].voltages.get('11')).toBe(first[index].voltages.get('11'));
    }
    sim.dispose();
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
