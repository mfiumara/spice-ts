import type { ACRHSContribution, DeviceModel, StampContext } from './device.js';
import type { SourceWaveform, PulseSource, SinSource, PWLSource, RFPort } from '../types.js';
import { InvalidCircuitError } from '../errors.js';

export class VoltageSource implements DeviceModel {
  readonly branches: number[];
  readonly isNonlinear = false;
  private transientTimestep = 0;

  /**
   * @param nodes - `[+, -]`, or `[+, -, res]` for an RF port, whose ideal
   *   source sits between the internal `res` node and `-` with `z0` from `+`
   *   to `res` (ngspice-47 vsrcset.c/vsrcload.c RFSPICE).
   */
  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly branchIndex: number,
    public waveform: SourceWaveform,
    readonly port?: RFPort,
  ) {
    this.branches = [branchIndex];
  }

  /** The node the ideal source drives: the internal `res` node of an RF port, else `+`. */
  get sourceNode(): number {
    return this.port ? this.nodes[2] : this.nodes[0];
  }

  stamp(ctx: StampContext): void {
    const nMinus = this.nodes[1];
    const nPlus = this.sourceNode;
    const bi = ctx.numNodes + this.branchIndex;
    const voltage = this.getValue(ctx) * ctx.sourceScale;

    if (this.port) {
      const outer = this.nodes[0];
      const g0 = 1 / this.port.z0;
      if (outer >= 0) ctx.stampG(outer, outer, g0);
      ctx.stampG(nPlus, nPlus, g0);
      if (outer >= 0) {
        ctx.stampG(outer, nPlus, -g0);
        ctx.stampG(nPlus, outer, -g0);
      }
    }

    // KCL: branch current enters positive node, leaves negative
    if (nPlus >= 0) ctx.stampG(nPlus, bi, 1);
    if (nMinus >= 0) ctx.stampG(nMinus, bi, -1);

    // Branch equation: V(+) - V(-) = Vs
    if (nPlus >= 0) ctx.stampG(bi, nPlus, 1);
    if (nMinus >= 0) ctx.stampG(bi, nMinus, -1);

    ctx.stampB(bi, voltage);
  }

  getVoltageAtTime(time: number): number {
    const power = this.port?.power;
    if (power) {
      // ngspice-47 vsrctemp.c/vsrcload.c PORT: sqrt(4*pwr*z0) * cos(2*pi*freq*t).
      return Math.sqrt(4 * power.watts * this.port!.z0) * Math.cos(2 * Math.PI * power.frequency * time);
    }
    switch (this.waveform.type) {
      case 'dc':
        return this.waveform.value;
      case 'pulse':
        return evaluatePulse(this.waveform, time, this.transientTimestep);
      case 'sin':
        return evaluateSin(this.waveform, time);
      case 'pwl':
        return evaluatePwl(this.waveform, time);
      case 'ac':
        return this.waveform.dc ?? 0;
    }
  }

  private getValue(ctx: StampContext): number {
    const power = this.port?.power;
    if (power) {
      return ctx.useDcSourceValue && power.dc !== undefined ? power.dc : this.getVoltageAtTime(ctx.time);
    }
    if (ctx.useDcSourceValue && this.waveform.type !== 'dc' && this.waveform.dc !== undefined) {
      return this.waveform.dc;
    }
    return this.getVoltageAtTime(ctx.time);
  }

  getACExcitation(): ACRHSContribution | null {
    const excitation = this.waveform.type === 'ac' ? this.waveform : this.waveform.ac;
    if (excitation) {
      return {
        kind: 'branch',
        magnitude: excitation.magnitude,
        phase: excitation.phase,
        branch: this.branchIndex,
      };
    }
    return null;
  }

  setParameter(value: number): void {
    if (this.port?.power) {
      throw new InvalidCircuitError(`RF power port '${this.name}' has no sweepable DC value`);
    }
    if (this.waveform.type === 'dc') {
      this.waveform.value = value;
      return;
    }
    if (this.waveform.type === 'ac') {
      this.waveform.dc = value;
      return;
    }
    throw new InvalidCircuitError(`Voltage source '${this.name}' has no sweepable DC value`);
  }

  getParameter(): number {
    if (this.waveform.type === 'dc') return this.waveform.value;
    if (this.waveform.type === 'ac') return this.waveform.dc ?? 0;
    throw new InvalidCircuitError(`Voltage source '${this.name}' has no sweepable DC value`);
  }

  setTransientTimestep(timestep: number): void {
    this.transientTimestep = timestep;
  }

  getBreakpoints(stopTime: number): number[] {
    if (this.waveform.type === 'pulse') {
      return pulseBreakpoints(effectivePulse(this.waveform, this.transientTimestep), stopTime);
    }
    if (this.waveform.type === 'pwl') {
      return pwlBreakpoints(this.waveform, stopTime);
    }
    return [];
  }
}

/**
 * Return all times in [0, stopTime] at which a PULSE waveform has a
 * derivative discontinuity: rising-edge start, rising-edge end, falling-edge
 * start, falling-edge end, repeated each period. A corner at t=0 is kept: the
 * DC operating point carries no slope, so the transient driver integrates the
 * first step at order 1 when a waveform kinks at the start. Negative times
 * are filtered.
 *
 * Period offsets are computed as `delay + n * period` rather than an additive
 * accumulator so that breakpoints at high `n` land exactly on their analytic
 * values (no FP drift).
 *
 * A PULSE without a usable PER (omitted, so `Infinity`, or <= 0) is a single
 * pulse, exactly as {@link evaluatePulse} evaluates it; its corners are still
 * breakpoints. (`0 * Infinity` is NaN, which used to drop every corner of an
 * omitted-PER pulse, #469.)
 *
 * A positive NP (`pulses`) ends the train after NP periods, as in ngspice.
 */
export function pulseBreakpoints(p: PulseSource, stopTime: number): number[] {
  const { delay, rise, width, fall, period } = p;
  const result: number[] = [];
  const periodic = Number.isFinite(period) && period > 0;
  const limit = pulseTrainEnd(p);
  for (let n = 0; n === 0 || periodic; n++) {
    const periodStart = n === 0 ? delay : delay + n * period;
    if (!(periodStart < stopTime)) break;
    const corners = [
      periodStart,                       // rising-edge start
      periodStart + rise,                // rising-edge end
      periodStart + rise + width,        // falling-edge start
      periodStart + rise + width + fall, // falling-edge end
    ];
    const offsets = [0, rise, rise + width, rise + width + fall];
    for (let corner = 0; corner < corners.length; corner++) {
      const t = corners[corner];
      if (t >= 0 && t <= stopTime) result.push(t);
      // ngspice vsrcacct.c stops scheduling once TIME-TD > NP*PER; the last
      // evaluation at or before that point still queues the next corner.
      if (n * period + offsets[corner] > limit) return result;
    }
  }
  return result;
}

/**
 * Time after the delay at which an NP-limited pulse train stops (ngspice
 * `tmax = NP * PER`), or `Infinity` when the train is unlimited. NP only
 * applies to a positive, finite PER; an aperiodic PULSE is a single pulse.
 */
function pulseTrainEnd(p: PulseSource): number {
  const { pulses, period } = p;
  if (pulses === undefined || !(pulses > 0)) return Infinity;
  if (!(Number.isFinite(period) && period > 0)) return Infinity;
  return pulses * period;
}

/** Return PWL corners in [0, stopTime], preserving their declared times. */
export function pwlBreakpoints(pwl: PWLSource, stopTime: number): number[] {
  return pwl.points
    .map(point => point.time)
    .filter(time => time >= 0 && time <= stopTime);
}

/**
 * Evaluate a PWL waveform with ngspice endpoint and duplicate-time semantics.
 * Values are held outside the declared range. At equal-time points, the final
 * value at that time wins, which represents an instantaneous discontinuity.
 */
export function evaluatePwl(pwl: PWLSource, time: number): number {
  const { points } = pwl;
  if (time < points[0].time) return points[0].value;

  let left = points[0];
  for (let i = 1; i < points.length; i++) {
    const right = points[i];
    if (time < right.time) {
      const fraction = (time - left.time) / (right.time - left.time);
      return left.value + (right.value - left.value) * fraction;
    }
    left = right;
  }
  return left.value;
}

/**
 * Resolve ngspice's zero-edge rule: a PULSE TR or TF of zero uses the
 * transient TSTEP. Without a transient timestep (`0`) the edge stays ideal.
 */
export function effectivePulse(p: PulseSource, transientTimestep: number): PulseSource {
  if (transientTimestep <= 0 || (p.rise !== 0 && p.fall !== 0)) return p;
  return {
    ...p,
    rise: p.rise === 0 ? transientTimestep : p.rise,
    fall: p.fall === 0 ? transientTimestep : p.fall,
  };
}

/**
 * Evaluate a PULSE waveform with ngspice semantics: V1 at and before the
 * delay, periods repeat from the delay, and a zero TR/TF uses the transient
 * TSTEP (`transientTimestep`, `0` outside transient analysis).
 */
export function evaluatePulse(pulse: PulseSource, time: number, transientTimestep = 0): number {
  const { v1, v2, rise, width, fall, period } = effectivePulse(pulse, transientTimestep);
  let t = time - pulse.delay;
  if (t > pulseTrainEnd(pulse)) return v1;
  if (period > 0 && t > period) t -= period * Math.floor(t / period);
  if (t <= 0 || t >= rise + width + fall) return v1;
  if (t < rise) return v1 + (v2 - v1) * t / rise;
  if (t <= rise + width) return v2;
  return v2 + (v1 - v2) * (t - rise - width) / fall;
}

function evaluateSin(s: SinSource, time: number): number {
  const delay = s.delay ?? 0;
  const damping = s.damping ?? 0;
  const phase = s.phase ?? 0;
  if (time < delay) return s.offset;
  const t = time - delay;
  return s.offset + s.amplitude * Math.exp(-damping * t) *
    Math.sin(2 * Math.PI * s.frequency * t + (phase * Math.PI) / 180);
}
