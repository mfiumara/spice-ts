/**
 * ngspice-47 XSPICE controlled sine oscillator, transcribed from
 * src/xspice/icm/analog/sine/cfunc.mod. The phase is a cm_analog_alloc
 * state: a transient load integrates from the phase accepted at T(1) and
 * {@link CodeModelBehavior.accept} commits the phase of the accepted load.
 *
 * triangle and square share the control table but place their corners with
 * cm_analog_set_temp_bkpt (a breakpoint valid for one step only), which the
 * transient driver does not offer yet; they stay typed-unsupported.
 */
import {
  real, reals, STATIC,
  type CodeModelBehavior, type CodeModelCall, type ResolvedXspiceParams,
} from './models.js';

/** The piecewise-linear control-to-frequency table of ngspice cm_sine/cm_triangle/cm_square. */
function frequencyOf(x: readonly number[], y: readonly number[], cntlInput: number): number {
  const size = x.length;
  if (cntlInput <= x[0]) {
    const doutDin = (y[1] - y[0]) / (x[1] - x[0]);
    const freq = y[0] + (cntlInput - x[0]) * doutDin;
    // ngspice clamps with a warning ("Extrapolated frequency limited to 1e-16 Hz").
    return freq <= 0 ? 1e-16 : freq;
  }
  if (cntlInput >= x[size - 1]) {
    const doutDin = (y[size - 1] - y[size - 2]) / (x[size - 1] - x[size - 2]);
    return y[size - 1] + (cntlInput - x[size - 1]) * doutDin;
  }
  let freq = 0.0;
  for (let i = 0; i < size - 1; i++) {
    if (cntlInput < x[i + 1] && cntlInput >= x[i]) {
      freq = ((cntlInput - x[i]) / (x[i + 1] - x[i])) * (y[i + 1] - y[i]) + y[i];
    }
  }
  return freq;
}

/** analog/sine/cfunc.mod cm_sine. */
function sine(params: ResolvedXspiceParams): CodeModelBehavior {
  const x = reals(params, 'cntl_array');
  const y = reals(params, 'freq_array');
  const outLow = real(params, 'out_low');
  const outHigh = real(params, 'out_high');
  // ngspice prints "Size of control array different than frequency array" and returns.
  const mismatched = x.length !== y.length;
  let phase1 = 0;
  let phase = 0;
  const evaluate = (call: CodeModelCall): void => {
    if (mismatched) return;
    if (call.analysis === 'dc') {
      call.outputs[0] = (outHigh + outLow) / 2;
      phase = 0;
      return;
    }
    const freq = frequencyOf(x, y, call.inputs[0]);
    const peak = (outHigh - outLow) / 2;
    const center = (outHigh + outLow) / 2;
    phase = phase1 + freq * call.delta;
    call.outputs[0] = peak * Math.sin(phase * 2.0 * Math.PI) + center;
  };
  return {
    stateful: false,
    ac: STATIC,
    load: evaluate,
    accept(call) {
      evaluate(call);
      phase1 = phase;
    },
    reset() {
      phase1 = 0;
      phase = 0;
    },
  };
}

export const OSCILLATOR_BEHAVIORS = new Map([['sine', sine]] as const);
