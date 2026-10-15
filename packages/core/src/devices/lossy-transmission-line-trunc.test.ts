import { describe, expect, it } from 'vitest';
import type { StampContext } from './device.js';
import { LossyTransmissionLine, LtraModelState } from './lossy-transmission-line.js';
import { resolveLtraModel } from './ltra-model.js';

/**
 * Device-level tests of the ngspice-47 LTRAtrunc step limit
 * (src/spicelib/devices/ltra/ltratrun.c) on a line with port 1 between node 0
 * and ground and port 2 between node 1 and ground.
 */

interface PortSample {
  v1: number;
  i1?: number;
  v2?: number;
  i2?: number;
}

function context(time: number, sample: PortSample): StampContext {
  const voltages = [sample.v1, sample.v2 ?? 0];
  const currents = [sample.i1 ?? 0, sample.i2 ?? 0];
  return {
    stampG: () => {},
    stampB: () => {},
    stampC: () => {},
    getVoltage: node => voltages[node],
    getCurrent: branch => currents[branch],
    time,
    dt: time,
    numNodes: 2,
    sourceScale: 1,
    useDcSourceValue: false,
  };
}

function line(params: Record<string, number>): LossyTransmissionLine {
  const model = resolveLtraModel({ name: 'LMOD', type: 'LTRA', params: { G: 0, ...params } });
  return new LossyTransmissionLine('O1', [0, -1, 1, -1], 0, 1, new LtraModelState(model));
}

/** Lossless 1 ns line: sqrt(L*C)*LEN = 1 ns, Z0 = 50 ohm. */
const LC = { R: 0, L: 50e-9, C: 20e-12, LEN: 1 };
/** Lossy line with the same L and C. */
const RLC = { R: 5, L: 50e-9, C: 20e-12, LEN: 1 };

function accept(device: LossyTransmissionLine, points: Array<[number, PortSample]>): void {
  for (const [time, sample] of points) device.acceptTransientStep(context(time, sample));
}

describe('LTRAtrunc step limit (ngspice-47 ltratrun.c)', () => {
  it('STEPLIMIT (the default) bounds every step by the delay', () => {
    const device = line(LC);
    accept(device, [[0, { v1: 0 }], [1e-10, { v1: 1 }]]);
    expect(device.truncateTransientStep(context(2e-10, { v1: 2 }))).toBeCloseTo(1e-9, 21);
  });

  it('NOSTEPLIMIT bounds the step only when the incoming wave slope changes', () => {
    const device = line({ ...LC, NOSTEPLIMIT: 1 });
    accept(device, [[0, { v1: 0 }], [1e-10, { v1: 1 }], [2e-10, { v1: 2 }]]);
    // A straight continuation of the wave (ltratrun.c:75-78 false): no bound.
    expect(device.truncateTransientStep(context(3e-10, { v1: 3 }))).toBe(Infinity);
    // The trial point turns the wave: the step is limited to TD (ltratrun.c:90-92).
    expect(device.truncateTransientStep(context(3e-10, { v1: 1 }))).toBeCloseTo(1e-9, 21);
  });

  it('NOSTEPLIMIT watches the port-2 wave including its branch current through Y0', () => {
    const device = line({ ...LC, NOSTEPLIMIT: 1 });
    accept(device, [
      [0, { v1: 0, v2: 1, i2: 0 }],
      [1e-10, { v1: 0, v2: 1, i2: 0.02 }],
      [2e-10, { v1: 0, v2: 1, i2: 0.04 }],
    ]);
    expect(device.truncateTransientStep(context(3e-10, { v1: 0, v2: 1, i2: 0.06 }))).toBe(Infinity);
    expect(device.truncateTransientStep(context(3e-10, { v1: 0, v2: 1, i2: 0.02 }))).toBeCloseTo(1e-9, 21);
  });

  it('NOSTEPLIMIT with REL=10 never sees a slope change', () => {
    const device = line({ ...LC, NOSTEPLIMIT: 1, REL: 10 });
    accept(device, [[0, { v1: 0 }], [1e-10, { v1: 1 }], [2e-10, { v1: 2 }]]);
    expect(device.truncateTransientStep(context(3e-10, { v1: 1 }))).toBe(Infinity);
  });

  it('bounds RLC lines by maxSafeStep unless TRUNCDONTCUT', () => {
    const cut = line({ ...RLC, NOSTEPLIMIT: 1 });
    const free = line({ ...RLC, NOSTEPLIMIT: 1, TRUNCDONTCUT: 1 });
    for (const device of [cut, free]) accept(device, [[0, { v1: 0 }], [1e-10, { v1: 0 }]]);
    const trial = context(2e-10, { v1: 0 });
    expect(Number.isFinite(cut.model.maxSafeStep)).toBe(true);
    expect(cut.truncateTransientStep(trial)).toBe(cut.model.maxSafeStep);
    expect(free.truncateTransientStep(trial)).toBe(Infinity);
  });

  it('rejects the unported FULLCONTROL/HALFCONTROL truncation-error control', () => {
    for (const flag of ['FULLCONTROL', 'HALFCONTROL']) {
      expect(() => line({ ...RLC, [flag]: 1 })).toThrow(new RegExp(`${flag} is not supported`));
    }
  });

  it('accepts TRUNCNR with a warning and retains the default timestep bounds', () => {
    const device = line({ ...RLC, TRUNCNR: 1 });
    expect(device.model.warnings).toEqual([
      'LMOD: TRUNCNR accepted but Newton LTE timestep search is not implemented; NOCONTROL is used (ngspice default).',
    ]);
    const defaultDevice = line(RLC);
    for (const candidate of [device, defaultDevice]) {
      accept(candidate, [[0, { v1: 0 }], [1e-10, { v1: 0 }]]);
    }
    const trial = context(2e-10, { v1: 0 });
    expect(device.truncateTransientStep(trial)).toBe(defaultDevice.truncateTransientStep(trial));
  });
});
