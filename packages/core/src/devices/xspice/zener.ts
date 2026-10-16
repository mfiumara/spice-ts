/** ngspice-47 xtradev/zener/cfunc.mod, fixed Vt=26 mV (not circuit temperature). */
import { flag, real, STATIC, type CodeModelBehavior, type ResolvedXspiceParams } from './models.js';

export function zener(params: ResolvedXspiceParams): CodeModelBehavior {
  const breakdown = real(params, 'v_breakdown');
  const ib = real(params, 'i_breakdown');
  const rb = real(params, 'r_breakdown');
  const saturation = real(params, 'i_sat');
  const nvt = real(params, 'n_forward') * 0.026;
  const leakage = real(params, 'i_rev') / breakdown;
  const limit = flag(params, 'limit_switch');
  const v12 = nvt * Math.log(nvt / 10);
  const k = 1 / ib / rb;
  const v23 = -breakdown + Math.log(10 / saturation / rb) / k;
  const a = saturation / 10;
  const b = saturation * (Math.exp(v12 / nvt) - 1) - a * v12;
  const i0 = 1e-6;
  const v0 = -breakdown + Math.log(ib / i0) / k;
  const c = a * v23 + b + i0 * Math.exp(-k * (v23 - v0));
  const reverseScale = ib / Math.expm1(k * breakdown);
  const forwardSlope = saturation / nvt;
  const reverseSlope = reverseScale * k;
  // This is Newton iteration history, not transient history. cm_zener retains
  // it even across time steps, using not_converged to finish the voltage walk.
  let previous = 0;
  return {
    stateful: false, ac: STATIC,
    load(call) {
      let v = call.inputs[0];
      if (limit) {
        const increment = Math.abs(previous) >= 1 ? 0.1 * previous : v < 0 ? -0.1 : 0.1;
        if (Math.abs(v) > Math.abs(previous + increment)) {
          v = previous + increment;
          call.notConverged();
        }
        previous = v;
        call.inputs[0] = v;
      }
      let current: number;
      let derivative: number;
      if (v23 < v12) {
        if (v >= v12) {
          const e = Math.exp(v / nvt);
          current = saturation * (e - 1);
          derivative = saturation / nvt * e;
        } else if (v >= v23) {
          current = a * v + b;
          derivative = a;
        } else {
          const e = Math.exp(-k * (v - v0));
          current = -i0 * e + c;
          derivative = k * i0 * e;
        }
      } else if (v >= 0) {
        const e = Math.exp(v / nvt);
        const diff = Math.max(0, reverseSlope - forwardSlope);
        current = saturation * (e - 1) + diff * v;
        derivative = saturation / nvt * e + diff;
      } else {
        const e = Math.exp(-k * v);
        const diff = Math.max(0, forwardSlope - reverseSlope);
        current = -reverseScale * (e - 1) + diff * v;
        derivative = k * reverseScale * e + diff;
      }
      call.outputs[0] = current + leakage * v;
      call.partials[0] = derivative + leakage;
    },
    reset() { previous = 0; },
  };
}
