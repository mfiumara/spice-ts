import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { MOS2 } from './mos2.js';
import type { StampContext } from './device.js';

function fixture() {
  const compiled = parse(`MOS2 OPtran handoff
VD d 0 2
VG g 0 3
VB b 0 -1
M1 d g 0 b N W=10u L=2u
.model N NMOS LEVEL=2 VTO=0.7 KP=50u TOX=25n CGSO=1n CGDO=1n CBD=1p CBS=1p
.end`).compile();
  const device = compiled.devices.find((d): d is MOS2 => d instanceof MOS2)!;
  const solution = new Float64Array(compiled.nodeCount);
  const rhs = new Float64Array(compiled.nodeCount);
  const conductance = new Float64Array(compiled.nodeCount ** 2);
  const ctx: StampContext = {
    stampG: (r, c, v) => { conductance[r * compiled.nodeCount + c] += v; },
    stampB: (r, v) => { rhs[r] += v; }, stampC: () => {},
    getVoltage: node => node < 0 ? 0 : solution[node], getCurrent: () => 0,
    time: 0, dt: 0, numNodes: compiled.nodeCount, sourceScale: 1, useDcSourceValue: false,
  };
  solution[device.nodes[0]] = 2;
  solution[device.nodes[1]] = 3;
  solution[device.nodes[3]] = -1;
  device.stamp(ctx);
  const clear = () => { rhs.fill(0); conductance.fill(0); };
  return { device, solution, rhs, conductance, ctx, clear };
}

describe('MOS2 OPtran INITTRAN handoff (#1101)', () => {
  it.each([false, true])('copies the last DC load, independent of the global seed, TRANOP=%s', tranOp => {
    const a = fixture(), b = fixture();
    b.solution.fill(0); // Failed DC rhsOld need not agree with device state0.
    for (const f of [a, b]) {
      f.device.initializeTransientOperatingPoint(f.ctx, tranOp);
      f.clear();
      f.device.stampAcceptedChargeCurrent(f.ctx);
      expect(f.rhs.every(v => v === 0)).toBe(true);
      f.device.beginTransientNewton(1e-9, f.solution);
      f.ctx.dt = 1e-9;
      f.device.stamp(f.ctx);
      f.device.stampTransientCharge(f.ctx, { method: 'euler', dt: 1e-9 });
    }
    expect(b.rhs).toEqual(a.rhs);
    expect(b.conductance).toEqual(a.conductance);
  });

  it('TRANOP copies resting charge, whereas DCOP has zero charge state', () => {
    const dc = fixture(), tran = fixture();
    dc.device.initializeTransientOperatingPoint(dc.ctx, false);
    tran.device.initializeTransientOperatingPoint(tran.ctx, true);
    for (const f of [dc, tran]) {
      f.clear();
      // Load directly at the same DC bias, without a predictor. MODETRANOP
      // has no charge increment; MODEDCOP starts from zero Q and zero half-C.
      f.device.stampTransientCharge(f.ctx, { method: 'euler', dt: 1e-9 });
    }
    const residual = (f: ReturnType<typeof fixture>) => Array.from(f.rhs, (rhs, row) =>
      f.solution.reduce((sum, v, column) => sum + f.conductance[row * f.solution.length + column] * v, -rhs),
    );
    expect(residual(tran).every(v => Math.abs(v) < 1e-15)).toBe(true);
    expect(residual(dc).some(v => Math.abs(v) > 1e-9)).toBe(true);
  });
});
