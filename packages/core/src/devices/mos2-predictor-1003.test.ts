import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { MOS2 } from './mos2.js';
import { TransientChargeState } from './charge-state.js';
import type { StampContext } from './device.js';

function fixture(polarity: 1 | -1 = 1, groundedBulk = false) {
  const device = parse(`MOS2 predictor
VD d 0 2.5
VG g 0 1
VS s 0 0
M1 d g s ${groundedBulk ? '0' : 's'} N W=1u L=1u
.model N ${polarity === 1 ? 'NMOS' : 'PMOS'} LEVEL=2 VTO=${polarity * 0.5} KP=120u TOX=25n
.end`).compile().devices.find((d): d is MOS2 => d instanceof MOS2)!;
  const voltages = new Float64Array(Math.max(...device.nodes) + 1);
  const matrix = new Map<string, number>();
  const ctx: StampContext = {
    stampG: (r, c, value) => matrix.set(`${r},${c}`, (matrix.get(`${r},${c}`) ?? 0) + value),
    stampB: () => {}, stampC: () => {}, getVoltage: n => n < 0 ? 0 : voltages[n],
    getCurrent: () => 0, time: 0, dt: 0, numNodes: voltages.length,
    sourceScale: 1, useDcSourceValue: false,
  };
  const bias = (gate: number) => {
    const source = polarity === 1 ? 0 : 3;
    voltages[device.nodes[2]] = source;
    voltages[device.nodes[0]] = source + polarity * 2.5;
    voltages[device.nodes[1]] = source + polarity * gate;
  };
  const gm = (gate: number, dt: number) => {
    bias(gate); ctx.dt = dt; matrix.clear(); device.stamp(ctx);
    return matrix.get(`${device.nodes[0]},${device.nodes[1]}`)!;
  };
  const accept = (gate: number, dt: number) => {
    gm(gate, dt);
    if (dt > 0) device.stampTransientCharge(ctx, { method: 'euler', dt });
    device.acceptTransientStep(ctx);
  };
  accept(1, 0);
  return { device, ctx, voltages, gm, accept };
}

describe('MOS2 first-load predictor (#1003, ngspice-47 mos2load.c:194-213)', () => {
  it('preserves predicted vbs when the bulk is ground and the source moves', () => {
    const f = fixture(1, true);
    for (const node of f.device.nodes.slice(0, 3)) f.voltages[node] += 1;
    f.ctx.dt = 1e-11;
    f.device.stamp(f.ctx);
    f.device.stampTransientCharge(f.ctx, { method: 'euler', dt: 1e-11 });
    f.device.acceptTransientStep(f.ctx);
    f.device.beginTransientNewton(2e-11, f.voltages);
    // vbs(n)=-1, vbs(n-1)=0 => predicted vbs=-3, not the iterate's 0.
    expect(f.gm(0, 2e-11)).toBeCloseTo(f.device.evaluateChannel(1, 2.5, -3).gm, 15);
  });

  it.each([1, -1] as const)('predicts terminal biases for polarity %s, then returns to the iterate', polarity => {
    const f = fixture(polarity);
    f.device.beginTransientNewton(1e-11, f.voltages);
    expect(f.gm(0, 1e-11)).toBeCloseTo(f.device.evaluateChannel(1, 2.5, 0).gm, 15);
    expect(f.gm(0.6, 1e-11)).toBeCloseTo(f.device.evaluateChannel(0.6, 2.5, 0).gm, 15);
    f.accept(1.2, 1e-11);
    f.device.beginTransientNewton(2e-11, f.voltages);
    expect(f.gm(0, 2e-11)).toBeCloseTo(f.device.evaluateChannel(1.6, 2.5, 0).gm, 15);
    expect(f.gm(1.2, 2e-11)).toBeCloseTo(f.device.evaluateChannel(1.2, 2.5, 0).gm, 15);
    // Retry must predict again from accepted history, not the failed load.
    f.device.beginTransientNewton(5e-12, f.voltages);
    expect(f.gm(0, 5e-12)).toBeCloseTo(f.device.evaluateChannel(1.3, 2.5, 0).gm, 15);
  });

  it('does not advance predictor history during truncation, and resets it for a new run', () => {
    const f = fixture();
    f.accept(1.1, 1e-11);
    f.accept(1.2, 1e-11);
    f.gm(1.4, 1e-11);
    f.device.stampTransientCharge(f.ctx, { method: 'euler', dt: 1e-11 });
    f.device.truncateTransientStep(f.ctx, { deltas: [1e-11, 1e-11, 1e-11], reltol: 1e-3, abstol: 1e-12, chgtol: 1e-14, trtol: 7 });
    f.device.beginTransientNewton(2e-11, f.voltages);
    expect(f.gm(0, 2e-11)).toBeCloseTo(f.device.evaluateChannel(1.4, 2.5, 0).gm, 15);
    f.device.resetTransient();
    f.accept(0.9, 0);
    f.device.beginTransientNewton(1e-11, f.voltages);
    expect(f.gm(0, 1e-11)).toBeCloseTo(f.device.evaluateChannel(0.9, 2.5, 0).gm, 15);
  });

  it('extrapolates Meyer charges independently of capacitance and keeps rejected trials uncommitted', () => {
    const q = new TransientChargeState(1);
    q.accept(0, 2e-12); q.commit();
    expect(q.predictedCharge(0, 2)).toBe(2e-12);
    q.begin({ method: 'euler', dt: 1e-11 });
    q.accept(0, 3e-12); q.commit();
    expect(q.predictedCharge(0, 2)).toBeCloseTo(5e-12, 25);
    q.begin({ method: 'euler', dt: 2e-11 });
    q.current(0, 99e-12);
    expect(q.predictedCharge(0, 0.5)).toBeCloseTo(3.5e-12, 25);
    q.reset(); q.accept(0, 1e-12); q.commit();
    expect(q.predictedCharge(0, 2)).toBe(1e-12);
  });
});
