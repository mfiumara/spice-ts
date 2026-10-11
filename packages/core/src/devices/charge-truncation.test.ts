import { describe, expect, it } from 'vitest';
import { TransientChargeState } from './charge-state.js';
import type { ChargeIntegration, ChargeTruncation } from './device.js';

const TOLERANCES = { reltol: 1e-3, abstol: 1e-12, chgtol: 1e-14, trtol: 7 };

/** Accept q(t) = t^3 at t = 0 (operating point), 1, ..., n with unit steps. */
function cubicHistory(method: ChargeIntegration['method'], points: number): TransientChargeState {
  const state = new TransientChargeState(1);
  state.accept(0, 0);
  state.commit();
  for (let t = 1; t <= points; t++) {
    state.begin({ method, dt: 1, prevDt: 1 });
    state.accept(0, t ** 3);
    state.commit();
  }
  return state;
}

function truncate(state: TransientChargeState, method: ChargeIntegration['method'], charge: number): number {
  state.begin({ method, dt: 1, prevDt: 1 });
  const truncation: ChargeTruncation = { deltas: [1, 1, 1], ...TOLERANCES };
  return state.truncationTimestep(truncation, () => {
    state.accept(0, charge);
    state.commit();
  });
}

describe('TransientChargeState.truncationTimestep (ngspice cktterr.c CKTterr)', () => {
  it('bounds a trapezoidal step by the third divided difference of the charge', () => {
    const state = cubicHistory('trapezoidal', 2);
    // History q = 0, 1, 8 with TRAP currents 2 and 12; trial q = 27 has
    // current 2*(27-8) - 12 = 26. The third divided difference of t^3 is 1.
    // tol = max(abstol + reltol*26, reltol*27/1) = 0.027;
    // del = trtol*tol / (1/12 * 1) = 2.268; order 2 takes the square root.
    expect(truncate(state, 'trapezoidal', 27)).toBeCloseTo(Math.sqrt(7 * 0.027 / 0.08333333333), 12);
  });

  it('bounds an order-1 step by the second divided difference with coefficient 1/2', () => {
    const state = cubicHistory('euler', 2);
    // q = 1, 8, 27 at t = 1, 2, 3: second divided difference (19 - 7)/2 = 6.
    // BE current (27-8)/1 = 19; tol = max(1e-12 + 1e-3*19, 1e-3*27) = 0.027.
    expect(truncate(state, 'euler', 27)).toBeCloseTo(7 * 0.027 / (0.5 * 6), 12);
  });

  it('uses the Gear-2 coefficient 2/9', () => {
    const state = cubicHistory('gear2', 2);
    const bound = truncate(state, 'gear2', 27);
    // Gear-2 current: factor*q - a2*q(n) + a3*q(n-1) with alpha = 1:
    // 1.5*27 - 2*8 + 0.5*1 = 25. tol = max(1e-12 + 0.025, 0.027) = 0.027.
    expect(bound).toBeCloseTo(Math.sqrt(7 * 0.027 / 0.2222222222), 12);
  });

  it('returns Infinity until the history holds order + 1 accepted points', () => {
    expect(truncate(cubicHistory('trapezoidal', 1), 'trapezoidal', 8)).toBe(Infinity);
    expect(truncate(cubicHistory('euler', 1), 'euler', 8)).toBeLessThan(Infinity);
  });

  it('leaves the accepted history untouched', () => {
    const probed = cubicHistory('trapezoidal', 2);
    const plain = cubicHistory('trapezoidal', 2);
    truncate(probed, 'trapezoidal', 1000);
    for (const state of [probed, plain]) {
      state.begin({ method: 'trapezoidal', dt: 1 });
      state.accept(0, 27);
      state.commit();
    }
    expect(probed.acceptedChargeCurrent(0)).toBe(plain.acceptedChargeCurrent(0));
    expect(probed.acceptedChargeCurrent(0)).toBe(26);
  });
});
