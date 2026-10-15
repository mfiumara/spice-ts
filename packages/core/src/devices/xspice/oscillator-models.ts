/**
 * ngspice-47 XSPICE controlled sine oscillator, transcribed from
 * src/xspice/icm/analog/sine/cfunc.mod. The phase is a cm_analog_alloc
 * state: a transient load integrates from the phase accepted at T(1) and
 * {@link CodeModelBehavior.accept} commits the phase of the accepted load.
 *
 * Triangle shares the control table and schedules its future corners through
 * the transient driver's accepted-step breakpoint sink.
 */
import {
  flag, real, reals, STATIC,
  type CodeModelBehavior, type CodeModelCall, type ResolvedXspiceParams, type XspiceBehaviorContext,
} from './models.js';
import { portIndices } from './limiter-models.js';

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

/** analog/triangle/cfunc.mod, including the time-domain corner calculation. */
function triangle(params: ResolvedXspiceParams): CodeModelBehavior {
  const x = reals(params, 'cntl_array');
  const y = reals(params, 'freq_array');
  const low = real(params, 'out_low');
  const high = real(params, 'out_high');
  const duty = real(params, 'duty_cycle');
  type State = { phase: number; t1: number; t2: number; start: number };
  const initial = (): State => ({ phase: 0, t1: -1, t2: -1, start: 0 });
  let accepted = initial();
  let trial = initial();
  const load = (call: CodeModelCall): void => {
    if (x.length !== y.length) return;
    trial = { ...accepted };
    if (call.analysis === 'dc') { call.outputs[0] = low; trial = initial(); return; }
    const freq = frequencyOf(x, y, call.inputs[0]);
    let dphase = accepted.phase - Math.trunc(accepted.phase);
    trial.phase = accepted.phase + freq * call.delta;
    const previousTime = call.time - call.delta;
    if (accepted.t1 <= call.time && call.time <= accepted.t2) {
      trial.t2 = previousTime + (1 - dphase) / freq;
      trial.start = trial.t2;
      call.outputs[0] = high - (call.time - trial.t1) / (trial.t2 - trial.t1) * (high - low);
    } else {
      if (dphase > duty) dphase -= 1;
      trial.t1 = previousTime + (duty - dphase) / freq;
      trial.t2 = previousTime + (1 - dphase) / freq;
      call.outputs[0] = low + (call.time - trial.start) / (trial.t1 - trial.start) * (high - low);
    }
  };
  return {
    stateful: false, ac: STATIC, load,
    accept(call) { load(call); accepted = { ...trial }; },
    breakpoints: () => [accepted.t1, accepted.t2],
    reset() { accepted = initial(); trial = initial(); },
  };
}

/** analog/oneshot/cfunc.mod. Trial states are never committed by Newton loads. */
function oneshot(params: ResolvedXspiceParams, context: XspiceBehaviorContext): CodeModelBehavior {
  const ports = portIndices(context);
  const controlPort = ports.input.get('cntl_in');
  const clearPort = ports.input.get('clear');
  const x = reals(params, 'cntl_array');
  const y = reals(params, 'pw_array');
  const low = real(params, 'out_low');
  const high = real(params, 'out_high');
  const trigger = real(params, 'clk_trig');
  const positive = flag(params, 'pos_edge_trig');
  const retrigger = flag(params, 'retrig');
  const rise = Math.max(1e-12, real(params, 'rise_time'));
  const fall = Math.max(1e-12, real(params, 'fall_time'));
  const riseDelay = real(params, 'rise_delay');
  const fallDelay = real(params, 'fall_delay');
  type State = { t1: number; t2: number; t3: number; t4: number; set: boolean; locked: boolean; clock: number; output: number };
  const initial = (): State => ({ t1: -1, t2: -1, t3: -1, t4: -1, set: false, locked: false, clock: 0, output: low });
  let accepted = initial();
  let trial = initial();
  const load = (call: CodeModelCall): void => {
    if (x.length !== y.length) return;
    trial = { ...accepted };
    if (call.analysis === 'dc' || (clearPort !== undefined && call.inputs[clearPort] > trigger)) {
      trial = initial(); call.outputs[0] = low; return;
    }
    const clock = call.inputs[0];
    const rising = clock > accepted.clock && clock > trigger;
    const falling = clock < accepted.clock && clock < trigger;
    const fired = !trial.set && (positive ? rising : falling);
    if (fired) trial.set = true;
    else if (positive ? falling : rising) trial.set = false;
    trial.clock = clock;
    const control = controlPort === undefined ? 0 : call.inputs[controlPort];
    // Same linear table as the oscillators, but pulse widths clamp to zero,
    // and only on the lower extrapolation branch (ngspice oneshot).
    const width = control <= x[0]
      ? Math.max(0, y[0] + (control - x[0]) * (y[1] - y[0]) / (x[1] - x[0]))
      : frequencyOf(x, y, control);
    if (fired && !trial.locked) {
      if (accepted.output - low < 1e-20) {
        trial.t1 = call.time + riseDelay;
        trial.t2 = trial.t1 + rise;
        trial.t3 = trial.t2 + width + fallDelay;
        trial.t4 = trial.t3 + fall;
        trial.locked = !retrigger;
      } else if (accepted.output - high < 1e-20) {
        trial.t3 = call.time + width + riseDelay + fallDelay + rise;
        trial.t4 = trial.t3 + fall;
      }
    }
    const time = call.time;
    if (time < trial.t1) trial.output = low;
    else if (time < trial.t2) trial.output = low + (time - trial.t1) / (trial.t2 - trial.t1) * (high - low);
    else if (time < trial.t3) trial.output = high;
    else if (time < trial.t4) trial.output = high + (time - trial.t3) / (trial.t4 - trial.t3) * (low - high);
    else { trial.output = low; if (!retrigger) trial.locked = false; }
    call.outputs[0] = trial.output;
  };
  return {
    stateful: false, ac: STATIC, load,
    accept(call) { load(call); accepted = { ...trial }; },
    breakpoints: () => [accepted.t1, accepted.t2, accepted.t3, accepted.t4],
    reset() { accepted = initial(); trial = initial(); },
  };
}

export const OSCILLATOR_BEHAVIORS = new Map([['sine', sine], ['triangle', triangle], ['oneshot', oneshot]] as const);
