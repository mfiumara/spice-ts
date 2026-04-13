import type { DeviceModel, StampContext } from './device.js';

export class Capacitor implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = false;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    public capacitance: number,
  ) {}

  setParameter(value: number): void {
    this.capacitance = value;
  }

  getParameter(): number {
    return this.capacitance;
  }

  stamp(_ctx: StampContext): void {
    // Capacitor has no DC conductance (open circuit at DC)
  }

  stampDynamic(ctx: StampContext): void {
    const [n1, n2] = this.nodes;
    const c = this.capacitance;

    if (n1 >= 0) ctx.stampC(n1, n1, c);
    if (n2 >= 0) ctx.stampC(n2, n2, c);
    if (n1 >= 0 && n2 >= 0) {
      ctx.stampC(n1, n2, -c);
      ctx.stampC(n2, n1, -c);
    }
  }

}
