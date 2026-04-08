import type { DeviceModel, StampContext } from './device.js';

export class Resistor implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = false;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly resistance: number,
  ) {}

  stamp(ctx: StampContext): void {
    const [n1, n2] = this.nodes;
    const g = 1 / this.resistance;

    if (n1 >= 0) ctx.stampG(n1, n1, g);
    if (n2 >= 0) ctx.stampG(n2, n2, g);
    if (n1 >= 0 && n2 >= 0) {
      ctx.stampG(n1, n2, -g);
      ctx.stampG(n2, n1, -g);
    }
  }
}
