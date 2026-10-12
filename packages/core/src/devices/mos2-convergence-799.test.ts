import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { StampContext } from './device.js';
import { MOS2, resolveMOS2Model } from './mos2.js';
import { simulate } from '../simulate.js';

/**
 * Issue #799: MOS2 had no ngspice DEVconvTest (mos2conv.c) and did not report
 * mos2load.c `Check` (a DEVpnjlim-limited junction) to Newton, so a transient
 * timepoint was accepted once node voltages settled even while the drain
 * current predicted from the last linearisation still moved by more than
 * RELTOL. MOS1, MOS3 and MOS6 already had both (#479, #715). On the WRspice
 * mosamp2 amplifier (corpus-h, 27 LEVEL=2 devices) the slewing output then
 * depended on the step size and never converged to ngspice-47: with a 0.2 ns
 * maximum step v(8) peaked 0.16 V above ngspice and was off by up to 1.1 V on
 * the falling edge.
 */
const TOLERANCES = { reltol: 1e-3, abstol: 1e-12, vntol: 1e-6 };

function context(voltages: number[]): StampContext {
  return {
    stampC: () => {}, stampG: () => {}, stampB: () => {},
    getVoltage: node => voltages[node] ?? 0, getCurrent: () => 0,
    time: 0, dt: 0, numNodes: 4, sourceScale: 1, useDcSourceValue: true,
  };
}

function device(params: Record<string, number> = {}): MOS2 {
  const model = resolveMOS2Model('N2', { VTO: 0.7, KP: 1e-4, ...params }, 1);
  return new MOS2('M1', [0, 1, 2, 3], model, { W: 10e-6, L: 2e-6 });
}

function interpolate(time: ArrayLike<number>, values: ArrayLike<number>, at: number): number {
  let index = 1;
  while (index < time.length - 1 && time[index] < at) index++;
  const fraction = (at - time[index - 1]) / (time[index] - time[index - 1]);
  return values[index - 1] + fraction * (values[index] - values[index - 1]);
}

describe('MOS2 device convergence test (issue #799)', () => {
  it('predicts the drain current from the last load (mos2conv.c)', () => {
    const mos = device();
    const bias = [2, 1.5, 0, 0];
    mos.stamp(context(bias));
    expect(mos.convergenceTest(Float64Array.from(bias), TOLERANCES)).toBe(true);
    // Saturated, cd ~ 1.6e-4 A and gm ~ 4e-4 S: a 1 mV gate step moves the
    // predicted current by ~4e-7 A > RELTOL * cd ~ 1.6e-7 A.
    expect(mos.convergenceTest(Float64Array.from([2, 1.501, 0, 0]), TOLERANCES)).toBe(false);
    expect(mos.convergenceTest(Float64Array.from([2, 1.50001, 0, 0]), TOLERANCES)).toBe(true);
  });

  it('predicts the inverse-mode drain current from vgd', () => {
    const mos = device();
    // Drain below source: mode = -1, the channel is driven by vgd.
    const bias = [0, 1.5, 2, 0];
    mos.stamp(context(bias));
    expect(mos.convergenceTest(Float64Array.from(bias), TOLERANCES)).toBe(true);
    expect(mos.convergenceTest(Float64Array.from([0, 1.501, 2, 0]), TOLERANCES)).toBe(false);
  });

  it('folds the transient junction charge current into the bulk current test', () => {
    const params = { CBD: 100e-15, CBS: 50e-15 };
    const bias = [2, 0, 0, 0];
    const moved = Float64Array.from([2.001, 0, 0, 0]);
    const dc = device(params);
    dc.stamp(context(bias));
    // Reverse-biased drain junction: gbd = GMIN, so a 1 mV drain step moves
    // the DC bulk current far inside ABSTOL.
    expect(dc.convergenceTest(moved, TOLERANCES)).toBe(true);

    const tran = device(params);
    tran.acceptTransientStep(context(bias));
    tran.stamp(context(bias));
    tran.stampTransientCharge(context(bias), { method: 'euler', dt: 1e-12 });
    // mos2load.c adds geq = Cbd/dt to gbd, so the predicted cqbd change fails.
    expect(tran.convergenceTest(moved, TOLERANCES)).toBe(false);
  });

  it('reports a DEVpnjlim-limited bulk junction (mos2load.c Check)', () => {
    const mos = device();
    mos.stamp(context([0, 0, 0, 0]));
    expect(mos.limitedLastStamp()).toBe(false);
    // Bulk jumps 2 V forward past vcrit: DEVpnjlim clamps vbs.
    mos.stamp(context([0, 0, 0, 2]));
    expect(mos.limitedLastStamp()).toBe(true);
  });

  // ngspice-47 `-b` on the corpus-h WRspice mosamp2.cir with its .control
  // block removed and `.tran 0.1us 2us 0 1n` (step-refined, so the reference
  // is not dominated by ngspice's own default-step discretisation), [us, v(8),
  // v(20)] interpolated from ngspice's timepoints. Before the fix spice-ts was
  // off by up to 0.53 V here (and 1.1 V with a 0.2 ns step).
  it('tracks ngspice-47 through the mosamp2 slewing edge with a refined step', async () => {
    const deck = readFileSync(
      new URL('../../../../benchmarks/corpus/corpus-h/fixtures/xictools/wrspice/examples/mosamp2.cir', import.meta.url),
      'utf8',
    ).replace(/\.control[\s\S]*?\.endc\s*/i, '').replace(/^\.tran .*$/m, '.tran 0.1us 2us 0 1n') + '.end\n';
    const result = await simulate(deck);
    const transient = result.transient!;
    const v8 = transient.voltage('8');
    const v20 = transient.voltage('20');
    const reference: Array<[number, number, number]> = [
      [0.5, 2.282854, 4.041242],
      [1.0, 3.362396, 6.146897],
      [1.2, 3.887978, 6.698243],
      [1.3, 3.950736, 6.757179],
      [1.35, 3.726097, 6.515925],
      [1.4, 3.354137, 6.121329],
      [1.45, 2.875763, 5.611218],
      [1.5, 2.452806, 5.076584],
      [1.6, 2.354585, 4.875246],
      [2.0, 2.424838, 5.033272],
    ];
    for (const [us, ref8, ref20] of reference) {
      const time = us * 1e-6;
      // 0.5% of the 4 V v(8) peak.
      expect(Math.abs(interpolate(transient.time, v8, time) - ref8), `v(8) at ${us} us`).toBeLessThan(20e-3);
      expect(Math.abs(interpolate(transient.time, v20, time) - ref20), `v(20) at ${us} us`).toBeLessThan(20e-3);
    }
  }, 60_000);
});
