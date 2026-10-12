import type { ACRHSContribution, DeviceModel, StampContext, TransientBreakpointSink } from './device.js';
import type { SourceWaveform } from '../types.js';
import { TransientNoiseContext, type NoiseHandle } from './transient-noise.js';
import {
  effectivePulse, evaluatePulse, evaluatePwl, pulseBreakpoints, pwlBreakpoints,
} from './voltage-source.js';

export class CurrentSource implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = false;
  private transientTimestep = 0;
  /** TRNOISE/TRRANDOM state (ngspice ISRCtrnoise_state/ISRCtrrandom_state). */
  private readonly noise?: NoiseHandle;
  /** Present only for TRNOISE/TRRANDOM, so other sources stay off the accept pass. */
  readonly acceptTransientStep?: (ctx: StampContext, breakpoints?: TransientBreakpointSink) => void;

  /**
   * @param noiseContext - shared random stream of the circuit's TRNOISE and
   *   TRRANDOM sources; a private one is created when absent.
   * @param multiplier - ngspice `m` (ISRCmValue): isrcload.c and isrcacld.c
   *   scale the DC, transient and AC loads by it; cktdisto.c does not.
   */
  constructor(
    readonly name: string,
    readonly nodes: number[],
    public waveform: SourceWaveform,
    noiseContext?: TransientNoiseContext,
    readonly multiplier = 1,
  ) {
    if (waveform.type === 'trnoise' || waveform.type === 'trrandom') {
      const noise = (noiseContext ?? new TransientNoiseContext()).register('I', name, waveform);
      this.noise = noise;
      this.acceptTransientStep = (ctx, breakpoints) => noise.accept(ctx.time, breakpoints);
    }
  }

  stamp(ctx: StampContext): void {
    const [nPlus, nMinus] = this.nodes;
    const current = this.multiplier * this.getValue(ctx) * ctx.sourceScale;

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
      case 'trnoise':
      case 'trrandom':
        // ngspice-47 isrcload.c adds the DC value when one is given.
        return (this.waveform.dc ?? 0) + this.noise!.value(time);
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
      magnitude: this.multiplier * excitation.magnitude,
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
    if (this.noise) return this.noise.breakpoints(stopTime);
    return [];
  }

  resetTransient(): void {
    this.noise?.resetTransient();
  }
}
