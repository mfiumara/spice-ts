import type { DeviceModel, StampContext } from './device.js';

export class CCCS implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = false;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly controlBranchIndex: number,
    readonly gain: number,
  ) {}

  stamp(ctx: StampContext): void {
    const [nOutP, nOutN] = this.nodes;
    const biCtrl = ctx.numNodes + this.controlBranchIndex;

    if (nOutP >= 0) ctx.stampG(nOutP, biCtrl, this.gain);
    if (nOutN >= 0) ctx.stampG(nOutN, biCtrl, -this.gain);
  }

  stampAC(ctx: StampContext, _omega: number): void {
    this.stamp(ctx);
  }
}
