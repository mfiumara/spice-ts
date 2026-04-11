import type { DeviceModel, StampContext } from './device.js';

export class VCCS implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = false;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly gm: number,
  ) {}

  stamp(ctx: StampContext): void {
    const [nOutP, nOutN, nCtrlP, nCtrlN] = this.nodes;

    if (nOutP >= 0 && nCtrlP >= 0) ctx.stampG(nOutP, nCtrlP, this.gm);
    if (nOutP >= 0 && nCtrlN >= 0) ctx.stampG(nOutP, nCtrlN, -this.gm);
    if (nOutN >= 0 && nCtrlP >= 0) ctx.stampG(nOutN, nCtrlP, -this.gm);
    if (nOutN >= 0 && nCtrlN >= 0) ctx.stampG(nOutN, nCtrlN, this.gm);
  }

  stampAC(ctx: StampContext, _omega: number): void {
    this.stamp(ctx);
  }
}
