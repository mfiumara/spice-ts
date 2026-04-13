import type { DeviceModel, StampContext } from './device.js';

export class Inductor implements DeviceModel {
  readonly branches: number[];
  readonly isNonlinear = false;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly branchIndex: number,
    public inductance: number,
  ) {
    this.branches = [branchIndex];
  }

  setParameter(value: number): void {
    this.inductance = value;
  }

  getParameter(): number {
    return this.inductance;
  }

  stamp(ctx: StampContext): void {
    const [nPlus, nMinus] = this.nodes;
    const bi = ctx.numNodes + this.branchIndex;

    // KCL: branch current enters positive node, leaves negative
    if (nPlus >= 0) ctx.stampG(nPlus, bi, 1);
    if (nMinus >= 0) ctx.stampG(nMinus, bi, -1);

    // Branch equation: V(+) - V(-) = L * dI/dt
    // For DC (static stamp): V(+) - V(-) = 0 (short circuit)
    if (nPlus >= 0) ctx.stampG(bi, nPlus, 1);
    if (nMinus >= 0) ctx.stampG(bi, nMinus, -1);
  }

  stampDynamic(ctx: StampContext): void {
    const bi = ctx.numNodes + this.branchIndex;
    // Branch equation dynamic part: -L * dI/dt term
    ctx.stampC(bi, bi, -this.inductance);
  }
}
