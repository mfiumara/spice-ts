import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { resolveOptions } from '../types.js';
import { createDriverFromCompiled } from './transient-driver.js';
import type { ChargeTruncation, DeviceModel } from '../devices/device.js';

/** A JFET whose gate charges the driver must bound with ngspice CKTterr (JFETtrunc). */
const NETLIST = `
V1 in 0 SIN(0 1 1MEG)
R1 in g 1k
J1 d g 0 JMOD
RD d 0 1k
.model JMOD NJF(CGS=1p CGD=1p)
.tran 1n 3u
`;

function driverWith(hook: (device: DeviceModel, original: DeviceModel['truncateTransientStep']) => DeviceModel['truncateTransientStep']) {
  const compiled = parse(NETLIST).compile();
  const jfet = compiled.devices.find(device => device.name === 'J1');
  if (!jfet?.truncateTransientStep) throw new Error('JFET has no truncation hook');
  jfet.truncateTransientStep = hook(jfet, jfet.truncateTransientStep.bind(jfet));
  const options = resolveOptions({}, 3e-6);
  return createDriverFromCompiled(compiled, options, { stopTime: 3e-6, timestep: 1e-9, maxTimestep: 3e-6 / 50 });
}

describe('transient driver charge truncation error (ngspice CKTtrunc, #469)', () => {
  it('passes the accepted step history and ngspice default tolerances to the device hook', () => {
    const calls: ChargeTruncation[] = [];
    const sim = driverWith((_device, original) => (ctx, truncation) => {
      calls.push({ ...truncation, deltas: [...truncation.deltas] as [number, number, number] });
      return original!(ctx, truncation);
    });
    const times = [0, ...sim.advanceUntil(3e-7).map(step => step.time)];
    expect(calls.length).toBeGreaterThan(5);
    expect(calls[0]).toMatchObject({ reltol: 1e-3, abstol: 1e-12, chgtol: 1e-14, trtol: 7 });
    // The last call is the accepted trial of the last step: its deltas are the
    // last three accepted steps, newest first.
    const n = times.length - 1;
    const last = calls[calls.length - 1].deltas;
    expect(last[0]).toBeCloseTo(times[n] - times[n - 1], 20);
    expect(last[1]).toBeCloseTo(times[n - 1] - times[n - 2], 20);
    expect(last[2]).toBeCloseTo(times[n - 2] - times[n - 3], 20);
    sim.dispose();
  });

  it('rejects trial steps above the charge bound and never grows past it', () => {
    const bound = 2e-9;
    let checked = false;
    const sim = driverWith(() => () => {
      checked = true;
      return bound;
    });
    let previous = 0;
    let boundedSteps = 0;
    for (const step of sim.advanceUntil(1e-6)) {
      const dt = step.time - previous;
      previous = step.time;
      if (!checked) continue;
      // An accepted step satisfied newdelta > 0.9 * delta (ngspice dctran.c).
      expect(dt).toBeLessThan(bound / 0.9 + 1e-21);
      boundedSteps++;
    }
    expect(boundedSteps).toBeGreaterThan(300);
    sim.dispose();
  });

});
