import type { DeviceModel, StampContext } from './device.js';

export class CCCS implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = false;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    /** Controlling source's branch; see {@link bindControlBranch}. */
    public controlBranchIndex: number,
    readonly gain: number,
  ) {}

  /** Bind the controlling source's MNA branch (ngspice CCCSsetup), which may follow this card. */
  bindControlBranch(branch: number): void {
    this.controlBranchIndex = branch;
  }

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
