import type { DeviceModel, StampContext } from './device.js';
import type { SourceWaveform, PulseSource, SinSource } from '../types.js';

export class VoltageSource implements DeviceModel {
  readonly branches: number[];
  readonly isNonlinear = false;

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
    const voltage = this.getVoltageAtTime(ctx.time);

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
        return evaluatePulse(this.waveform, time);
      case 'sin':
        return evaluateSin(this.waveform, time);
      case 'ac':
        return 0;
    }
  }

  getACExcitation(): { magnitude: number; phase: number; branch: number } | null {
    if (this.waveform.type === 'ac') {
      return {
        magnitude: this.waveform.magnitude,
        phase: this.waveform.phase,
        branch: this.branchIndex,
      };
    }
    return null;
  }
}

function evaluatePulse(p: PulseSource, time: number): number {
  const t = time % p.period;
  if (t < p.delay) return p.v1;
  if (t < p.delay + p.rise) return p.v1 + (p.v2 - p.v1) * (t - p.delay) / p.rise;
  if (t < p.delay + p.rise + p.width) return p.v2;
  if (t < p.delay + p.rise + p.width + p.fall)
    return p.v2 + (p.v1 - p.v2) * (t - p.delay - p.rise - p.width) / p.fall;
  return p.v1;
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
