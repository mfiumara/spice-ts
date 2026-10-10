import type { ACRHSContribution, DeviceModel, StampContext } from './device.js';
import type { SourceWaveform } from '../types.js';
import {
  effectivePulse, evaluatePulse, evaluatePwl, pulseBreakpoints, pwlBreakpoints,
} from './voltage-source.js';

export class CurrentSource implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = false;
  private transientTimestep = 0;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    public waveform: SourceWaveform,
  ) {}

  stamp(ctx: StampContext): void {
    const [nPlus, nMinus] = this.nodes;
    const current = this.getValue(ctx) * ctx.sourceScale;

    // SPICE defines positive current from the first node to the second.
    if (nPlus >= 0) ctx.stampB(nPlus, -current);
    if (nMinus >= 0) ctx.stampB(nMinus, current);
  }

  getCurrentAtTime(time: number): number {
    switch (this.waveform.type) {
      case 'dc':
        return this.waveform.value;
      case 'pulse':
        return evaluatePulse(this.waveform, time, this.transientTimestep);
      case 'sin': {
        const s = this.waveform;
        const delay = s.delay ?? 0;
        const damping = s.damping ?? 0;
        const phase = s.phase ?? 0;
        if (time < delay) return s.offset;
        const t = time - delay;
        return s.offset + s.amplitude * Math.exp(-damping * t) *
          Math.sin(2 * Math.PI * s.frequency * t + (phase * Math.PI) / 180);
      }
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
    return this.getCurrentAtTime(ctx.time);
  }

  getACExcitation(): ACRHSContribution | null {
    const excitation = this.waveform.type === 'ac' ? this.waveform : this.waveform.ac;
    if (!excitation) return null;
    const [positiveNode, negativeNode] = this.nodes;
    return {
      kind: 'node-pair',
      positiveNode,
      negativeNode,
      magnitude: excitation.magnitude,
      phase: excitation.phase,
    };
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
