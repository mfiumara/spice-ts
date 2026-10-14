import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { MOS2 } from './mos2.js';
import type { ChargeIntegration, StampContext } from './device.js';

function fixture() {
  const compiled = parse(`MOS2 last-load history
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
    stampG: (r, c, value) => { conductance[r * compiled.nodeCount + c] += value; },
    stampB: (r, value) => { rhs[r] += value; }, stampC: () => {},
    getVoltage: node => node < 0 ? 0 : solution[node], getCurrent: () => 0,
    time: 0, dt: 0, numNodes: compiled.nodeCount, sourceScale: 1, useDcSourceValue: false,
  };
  const bias = (gate: number) => {
    solution[device.nodes[0]] = 2;
    solution[device.nodes[1]] = gate;
    solution[device.nodes[3]] = -1;
  };
  const clear = () => { rhs.fill(0); conductance.fill(0); };
  bias(1);
  device.acceptTransientStep(ctx);
  // Two integrated history points exercise Gear-2 and order-2 truncation,
  // not their backward-Euler / insufficient-history fallbacks.
  for (let i = 0; i < 2; i++) {
    device.stampTransientCharge(ctx, { method: 'euler', dt: 1e-9 });
    device.acceptTransientStep(ctx);
  }
  clear();
  return { device, ctx, bias, rhs, conductance, clear };
}

describe('MOS2 last-load charge history (#1002 evidence, completed with #1003 predictor)', () => {
  it.each(['euler', 'trapezoidal', 'gear2'] as const)('commits the loaded state, not a post-solve reload, for %s', method => {
    const a = fixture(), b = fixture();
    const rule: ChargeIntegration = { method, dt: 1e-9, prevDt: 1e-9 };
    for (const f of [a, b]) {
      f.bias(2);
      f.device.stampTransientCharge(f.ctx, rule);
    }
    b.bias(2.01); // A converged solve differs from the last load; no reload follows.
    for (const f of [a, b]) f.device.acceptTransientStep(f.ctx);
    for (const f of [a, b]) { f.clear(); f.device.stampAcceptedChargeCurrent(f.ctx); }
    expect(b.rhs).toEqual(a.rhs);
    for (const f of [a, b]) {
      f.clear(); f.bias(3);
      f.device.stampTransientCharge(f.ctx, rule);
    }
    expect(b.rhs).toEqual(a.rhs);
    expect(b.conductance).toEqual(a.conductance);
  });

  it('a rejected trial and truncation check do not commit history; a retry replaces the trial', () => {
    const a = fixture(), b = fixture();
    const rule: ChargeIntegration = { method: 'trapezoidal', dt: 1e-9 };
    b.bias(4);
    b.device.stampTransientCharge(b.ctx, rule);
    b.device.truncateTransientStep(b.ctx, { deltas: [1e-9, 1e-9, 1e-9], reltol: 1e-3, abstol: 1e-12, chgtol: 1e-14, trtol: 7 });
    for (const f of [a, b]) {
      f.bias(2); f.device.stampTransientCharge(f.ctx, rule); f.device.acceptTransientStep(f.ctx);
      f.clear(); f.device.stampAcceptedChargeCurrent(f.ctx);
    }
    expect(b.rhs).toEqual(a.rhs);
  });

  it('reset discards the last load before initializing a new run', () => {
    const a = fixture(), b = fixture();
    b.bias(4);
    b.device.stampTransientCharge(b.ctx, { method: 'euler', dt: 1e-9 });
    for (const f of [a, b]) {
      f.device.resetTransient(); f.bias(1); f.device.acceptTransientStep(f.ctx);
      f.clear(); f.bias(2); f.device.stampTransientCharge(f.ctx, { method: 'euler', dt: 1e-9 });
    }
    expect(b.rhs).toEqual(a.rhs);
    expect(b.conductance).toEqual(a.conductance);
  });
});
