import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { StampContext } from './device.js';
import { MOSFET } from './mosfet.js';
import { MOS6, resolveMOS6Model } from './mos6.js';
import { simulate } from '../simulate.js';

/**
 * Issue #479: transient Newton declared convergence on node voltages alone.
 * ngspice-47 also runs the device convergence test (mos1conv.c, mos6conv.c):
 * the drain and bulk currents predicted at the new solution from the last
 * load's linearisation must match the loaded currents within
 * RELTOL * max + ABSTOL. MOS6 also had no MOS6trunc, so its nodes were held to
 * the node-voltage LTE instead of CKTterr on the Meyer gate charges: the deck
 * took 2.6x ngspice's timepoints and its error scaled with RELTOL.
 */
const fixture = (name: string): string => readFileSync(
  new URL(`../../../../benchmarks/corpus/ngspice/fixtures/tests/mos6/${name}`, import.meta.url),
  'utf8',
);

function interpolate(time: ArrayLike<number>, values: ArrayLike<number>, at: number): number {
  let index = 1;
  while (index < time.length - 1 && time[index] < at) index++;
  const fraction = (at - time[index - 1]) / (time[index] - time[index - 1]);
  return values[index - 1] + fraction * (values[index] - values[index - 1]);
}

function context(voltages: number[]): StampContext {
  return {
    stampC: () => {}, stampG: () => {}, stampB: () => {},
    getVoltage: node => voltages[node] ?? 0, getCurrent: () => 0,
    time: 0, dt: 0, numNodes: 4, sourceScale: 1, useDcSourceValue: true,
  };
}

const TOLERANCES = { reltol: 1e-3, abstol: 1e-12, vntol: 1e-6 };

describe('MOS device convergence test (issue #479)', () => {
  // ngspice-47 on the unchanged mos6inv.cir with `.OPTIONS ACCT` (identical
  // circuit): 315 accepted timepoints, 1 rejected, 908 transient iterations.
  // main: 830 accepted, 121 rejected, 2529 Newton iterations.
  it('steps the mos6inv deck like ngspice-47 (MOS6trunc, mos6conv.c)', async () => {
    const result = await simulate(fixture('mos6inv.cir'));
    const telemetry = result.convergence!.transient;
    expect(telemetry.acceptedSteps).toBeGreaterThan(0.9 * 315);
    expect(telemetry.acceptedSteps).toBeLessThan(1.1 * 315);
    expect(telemetry.newtonIterations).toBeGreaterThan(0.85 * 908);
    expect(telemetry.newtonIterations).toBeLessThan(1.15 * 908);
  });

  // ngspice-47 v(11) and i(vin) on the unchanged simpleinv.cir, interpolated
  // from its own timepoints, through the switching edge that mos6.test.ts
  // skips. main was off by up to 94.5 mV and 1.55 uA at these times.
  it('tracks ngspice-47 v(11) and i(vin) through the simpleinv switching edge', async () => {
    const result = await simulate(fixture('simpleinv.cir'));
    const transient = result.transient!;
    const output = transient.voltage('11');
    const current = transient.current('VIN');
    const reference: Array<[number, number, number]> = [
      [59, 2.7902377002918142, -6.0834088726678949e-6],
      [59.5, 2.1936788301552048, -8.5904724934331212e-6],
      [60, 1.4349295831751911, -9.6644328098772755e-6],
      [60.25, 1.1472698823705889, -7.4842288453061996e-6],
      [60.5, 0.99772140224697603, -2.0665114438078184e-6],
      [60.75, 0.90899521693077479, 1.0651500325731078e-7],
      [61, 0.89767922500568620, -1.8500652189491660e-6],
      [61.5, 0.85021841980633317, -8.8171816701152548e-7],
      [62, 0.81673303812250331, -1.4619028383806342e-6],
      [63, 0.75690818842767316, -1.2602154641745201e-6],
    ];
    for (const [ns, v11, ivin] of reference) {
      const time = ns * 1e-9;
      expect(Math.abs(interpolate(transient.time, output, time) - v11), `v(11) at ${ns} ns`).toBeLessThan(10e-3);
      expect(Math.abs(interpolate(transient.time, current, time) - ivin), `i(vin) at ${ns} ns`).toBeLessThan(0.25e-6);
    }
  });

  it('MOS1 predicts the drain current from the last load (mos1conv.c)', () => {
    const mos = new MOSFET('M1', [0, 1, 2, 3], { VTO: 0.7, KP: 1e-4, W: 10e-6, L: 1e-6 });
    const bias = [2, 1.5, 0, 0];
    mos.stamp(context(bias));
    expect(mos.convergenceTest(Float64Array.from(bias), TOLERANCES)).toBe(true);
    // cd = 0.5 * 1e-3 * 0.8^2 = 3.2e-4 A, gm = 8e-4 S: a 1 mV gate step moves
    // the predicted current by 8e-7 A > RELTOL * cd = 3.2e-7 A.
    expect(mos.convergenceTest(Float64Array.from([2, 1.501, 0, 0]), TOLERANCES)).toBe(false);
    expect(mos.convergenceTest(Float64Array.from([2, 1.5001, 0, 0]), TOLERANCES)).toBe(true);
  });

  it('MOS1 folds the transient junction charge current into the bulk current test', () => {
    const params = { VTO: 0.7, KP: 1e-4, W: 10e-6, L: 1e-6, CBD: 100e-15, CBS: 50e-15 };
    const bias = [2, 0, 0, 0];
    const moved = Float64Array.from([2.001, 0, 0, 0]);
    const dc = new MOSFET('M1', [0, 1, 2, 3], params);
    dc.stamp(context(bias));
    // Reverse-biased drain junction: gbd = GMIN, so a 1 mV drain step moves
    // the DC bulk current by 1e-15 A, far inside ABSTOL.
    expect(dc.convergenceTest(moved, TOLERANCES)).toBe(true);

    const tran = new MOSFET('M1', [0, 1, 2, 3], params);
    tran.acceptTransientStep(context(bias));
    tran.stamp(context(bias));
    tran.stampTransientCharge(context(bias), { method: 'euler', dt: 1e-12 });
    // mos1load.c adds geq = C/dt (~5e-2 S for Cbd ~ 5e-14 F) to gbd, so the
    // predicted cqbd change (~5e-5 A) fails the test.
    expect(tran.convergenceTest(moved, TOLERANCES)).toBe(false);
  });

  it('MOS6 predicts the drain current from the last load (mos6conv.c)', () => {
    const model = resolveMOS6Model('N6', { KV: 1.2, NV: 0.9, NC: 1.3, KC: 1e-4, TOX: 2e-8 }, 1);
    const mos = new MOS6('M1', [0, 1, 2, 3], model, { W: 10e-6, L: 2e-6 });
    const bias = [2, 2, 0, 0];
    mos.stamp(context(bias));
    expect(mos.convergenceTest(Float64Array.from(bias), TOLERANCES)).toBe(true);
    expect(mos.convergenceTest(Float64Array.from([2, 2.01, 0, 0]), TOLERANCES)).toBe(false);
    expect(mos.convergenceTest(Float64Array.from([2, 2.00001, 0, 0]), TOLERANCES)).toBe(true);
  });
});
