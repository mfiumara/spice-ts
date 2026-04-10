import type { DeviceModel, StampContext } from './device.js';
import type { SourceWaveform, PulseSource, SinSource } from '../types.js';

export class CurrentSource implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = false;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    public waveform: SourceWaveform,
  ) {}

  stamp(ctx: StampContext): void {
    const [nPlus, nMinus] = this.nodes;
    const current = this.getCurrentAtTime(ctx.time);

    if (nPlus >= 0) ctx.stampB(nPlus, current);
    if (nMinus >= 0) ctx.stampB(nMinus, -current);
  }

  getCurrentAtTime(time: number): number {
    switch (this.waveform.type) {
      case 'dc':
        return this.waveform.value;
      case 'pulse': {
        const p = this.waveform;
        const t = time % p.period;
        if (t < p.delay) return p.v1;
        if (t < p.delay + p.rise) return p.v1 + (p.v2 - p.v1) * (t - p.delay) / p.rise;
        if (t < p.delay + p.rise + p.width) return p.v2;
        if (t < p.delay + p.rise + p.width + p.fall)
          return p.v2 + (p.v1 - p.v2) * (t - p.delay - p.rise - p.width) / p.fall;
        return p.v1;
      }
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
      case 'ac':
        return 0;
    }
  }
}
