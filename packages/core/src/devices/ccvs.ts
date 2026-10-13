import type { DeviceModel, StampContext } from './device.js';

export class CCVS implements DeviceModel {
  readonly branches: number[];
  readonly isNonlinear = false;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    /** Controlling source's branch; see {@link bindControlBranch}. */
    public controlBranchIndex: number,
    readonly branchIndex: number,
    readonly gain: number,
  ) {
    this.branches = [branchIndex];
  }

  /** Bind the controlling source's MNA branch (ngspice CCVSsetup), which may follow this card. */
  bindControlBranch(branch: number): void {
    this.controlBranchIndex = branch;
  }

  stamp(ctx: StampContext): void {
    const [nOutP, nOutN] = this.nodes;
    const bi = ctx.numNodes + this.branchIndex;
    const biCtrl = ctx.numNodes + this.controlBranchIndex;

    // KCL coupling: branch current enters out+, leaves out-
    if (nOutP >= 0) ctx.stampG(nOutP, bi, 1);
    if (nOutN >= 0) ctx.stampG(nOutN, bi, -1);

    // KVL constraint: V(out+) - V(out-) - gain * I_ctrl = 0
    if (nOutP >= 0) ctx.stampG(bi, nOutP, 1);
    if (nOutN >= 0) ctx.stampG(bi, nOutN, -1);
    ctx.stampG(bi, biCtrl, -this.gain);
  }

  stampAC(ctx: StampContext, _omega: number): void {
    this.stamp(ctx);
  }
}
