import type { DeviceModel, StampContext } from './device.js';

export class Resistor implements DeviceModel {
  readonly branches: number[];
  readonly isNonlinear = false;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    public resistance: number,
    readonly branchIndex?: number,
  ) {
    this.branches = branchIndex === undefined ? [] : [branchIndex];
  }

  setParameter(value: number): void {
    this.resistance = value;
  }

  getParameter(): number {
    return this.resistance;
  }

  stamp(ctx: StampContext): void {
    const [n1, n2] = this.nodes;

    if (this.branchIndex !== undefined) {
      const bi = ctx.numNodes + this.branchIndex;

      // Branch form: KCL includes I, while V(1) - V(2) = R * I.
      // Unlike a conductance stamp, this remains finite and exact at R = 0.
      if (n1 >= 0) ctx.stampG(n1, bi, 1);
      if (n2 >= 0) ctx.stampG(n2, bi, -1);
      if (n1 >= 0) ctx.stampG(bi, n1, 1);
      if (n2 >= 0) ctx.stampG(bi, n2, -1);
      ctx.stampG(bi, bi, -this.resistance);
      return;
    }

    const g = 1 / this.resistance;

    if (n1 >= 0) ctx.stampG(n1, n1, g);
    if (n2 >= 0) ctx.stampG(n2, n2, g);
    if (n1 >= 0 && n2 >= 0) {
      ctx.stampG(n1, n2, -g);
      ctx.stampG(n2, n1, -g);
    }
  }
}
