import type { ACRHSContribution, DeviceModel, StampContext } from './device.js';
import type { SourceWaveform, PulseSource, SinSource, PWLSource } from '../types.js';
import { InvalidCircuitError } from '../errors.js';

export class VoltageSource implements DeviceModel {
  readonly branches: number[];
  readonly isNonlinear = false;
  private transientTimestep = 0;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly branchIndex: number,
    public waveform: SourceWaveform,
  ) {
    this.branches = [branchIndex];
  }

  stamp(ctx: StampContext): void {
    const [nPlus, nMinus] = this.nodes;
    const bi = ctx.numNodes + this.branchIndex;
    const voltage = this.getValue(ctx) * ctx.sourceScale;

    // KCL: branch current enters positive node, leaves negative
    if (nPlus >= 0) ctx.stampG(nPlus, bi, 1);
    if (nMinus >= 0) ctx.stampG(nMinus, bi, -1);

    // Branch equation: V(+) - V(-) = Vs
    if (nPlus >= 0) ctx.stampG(bi, nPlus, 1);
    if (nMinus >= 0) ctx.stampG(bi, nMinus, -1);

    ctx.stampB(bi, voltage);
  }

  getVoltageAtTime(time: number): number {
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
 */
export function pulseBreakpoints(p: PulseSource, stopTime: number): number[] {
  const { delay, rise, width, fall, period } = p;
  const result: number[] = [];
  if (period <= 0) return result; // invalid period → no breakpoints
  for (let n = 0; delay + n * period < stopTime; n++) {
    const periodStart = delay + n * period;
    const corners = [
      periodStart,                       // rising-edge start
      periodStart + rise,                // rising-edge end
      periodStart + rise + width,        // falling-edge start
      periodStart + rise + width + fall, // falling-edge end
    ];
    for (const t of corners) {
      if (t >= 0 && t <= stopTime) result.push(t);
    }
  }
  return result;
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
