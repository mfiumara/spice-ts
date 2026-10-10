import type { DeviceModel, StampContext } from './device.js';

interface PortSample {
  time: number;
  port1Incoming: number;
  port2Incoming: number;
}

/**
 * Ideal two-port lossless delay line using the SPICE T-element wave equations.
 * Branch currents are positive into each port.
 */
export class TransmissionLine implements DeviceModel {
  readonly branches: number[];
  readonly isNonlinear = false;
  private readonly history: PortSample[] = [];

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly branch1: number,
    readonly branch2: number,
    readonly impedance: number,
    readonly delay: number,
  ) {
    this.branches = [branch1, branch2];
  }

  stamp(ctx: StampContext): void {
    const [p1, n1, p2, n2] = this.nodes;
    const b1 = ctx.numNodes + this.branch1;
    const b2 = ctx.numNodes + this.branch2;

    this.stampPortKcl(ctx, p1, n1, b1);
    this.stampPortKcl(ctx, p2, n2, b2);

    if (ctx.dt === 0) {
      // At DC an ideal lossless line is a zero-voltage connection whose two
      // port currents sum to zero. Use two independent constraints.
      this.stampVoltage(ctx, b1, p1, n1, 1);
      this.stampVoltage(ctx, b1, p2, n2, -1);
      ctx.stampG(b2, b1, 1);
      ctx.stampG(b2, b2, 1);

      // Register the full transient topology before sparse locking.
      ctx.stampG(b1, b1, 0);
      ctx.stampG(b1, b2, 0);
      this.stampVoltage(ctx, b2, p1, n1, 0);
      this.stampVoltage(ctx, b2, p2, n2, 0);
      return;
    }

    const delayed = this.sampleAt(ctx.time - this.delay);

    // V1 - Z0*I1 = V2(t-TD) + Z0*I2(t-TD), and vice versa.
    this.stampVoltage(ctx, b1, p1, n1, 1);
    ctx.stampG(b1, b1, -this.impedance);
    ctx.stampB(b1, delayed.port2Incoming);

    this.stampVoltage(ctx, b2, p2, n2, 1);
    ctx.stampG(b2, b2, -this.impedance);
    ctx.stampB(b2, delayed.port1Incoming);
  }

  getBreakpoints(stopTime: number): number[] {
    return this.delay <= stopTime ? [this.delay] : [];
  }

  acceptTransientStep(ctx: StampContext): void {
    const portVoltage = (positive: number, negative: number): number =>
      (positive >= 0 ? ctx.getVoltage(positive) : 0)
      - (negative >= 0 ? ctx.getVoltage(negative) : 0);
    const sample: PortSample = {
      time: ctx.time,
      port1Incoming: portVoltage(this.nodes[0], this.nodes[1])
        + this.impedance * ctx.getCurrent(this.branch1),
      port2Incoming: portVoltage(this.nodes[2], this.nodes[3])
        + this.impedance * ctx.getCurrent(this.branch2),
    };
    const last = this.history[this.history.length - 1];
    if (last && Math.abs(last.time - ctx.time) <= Number.EPSILON * Math.max(1, Math.abs(ctx.time))) {
      this.history[this.history.length - 1] = sample;
    } else if (!last || ctx.time > last.time) {
      this.history.push(sample);
    }
    // Only the interval bracketing one delay in the past can affect future
    // wave equations. Retain one earlier point for interpolation and discard
    // older accepted states so long transient runs stay bounded.
    const oldestNeeded = ctx.time - this.delay;
    while (this.history.length > 2 && this.history[1].time < oldestNeeded) {
      this.history.shift();
    }
  }

  resetTransient(): void {
    this.history.length = 0;
  }

  private stampPortKcl(ctx: StampContext, positive: number, negative: number, branch: number): void {
    if (positive >= 0) ctx.stampG(positive, branch, 1);
    if (negative >= 0) ctx.stampG(negative, branch, -1);
  }

  private stampVoltage(
    ctx: StampContext,
    row: number,
    positive: number,
    negative: number,
    scale: number,
  ): void {
    if (positive >= 0) ctx.stampG(row, positive, scale);
    if (negative >= 0) ctx.stampG(row, negative, -scale);
  }

  private sampleAt(time: number): PortSample {
    if (this.history.length === 0) {
      return { time, port1Incoming: 0, port2Incoming: 0 };
    }
    if (time <= this.history[0].time) return this.history[0];

    for (let index = this.history.length - 1; index > 0; index--) {
      const right = this.history[index];
      const left = this.history[index - 1];
      if (time >= right.time) return right;
      if (time >= left.time) {
        const fraction = (time - left.time) / (right.time - left.time);
        return {
          time,
          port1Incoming: left.port1Incoming
            + fraction * (right.port1Incoming - left.port1Incoming),
          port2Incoming: left.port2Incoming
            + fraction * (right.port2Incoming - left.port2Incoming),
        };
      }
    }
    return this.history[0];
  }
}
