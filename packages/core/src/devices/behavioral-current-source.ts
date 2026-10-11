import type { DeviceModel, StampContext } from './device.js';
import type { CompiledBehavioralExpression } from '../parser/behavioral-expression.js';

/**
 * ngspice `B` source with an `I=` expression (ASRC current form).
 *
 * The current flows from the positive node through the source to the
 * negative node. Each Newton iteration linearises the expression with its
 * exact partial derivatives with respect to the controlling node voltages.
 *
 * `nodes` is `[positive, negative, ...controlNodes]`, where the control nodes
 * are indexed like `expression.nodes`.
 */
export class BehavioralCurrentSource implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;
  private readonly voltages: Float64Array;
  private readonly gradient: Float64Array;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly expression: CompiledBehavioralExpression,
  ) {
    this.voltages = new Float64Array(expression.nodes.length);
    this.gradient = new Float64Array(expression.nodes.length);
  }

  stamp(ctx: StampContext): void {
    const [positive, negative] = this.nodes;
    const controls = this.nodes.length - 2;
    for (let i = 0; i < controls; i++) {
      const node = this.nodes[i + 2];
      this.voltages[i] = node >= 0 ? ctx.getVoltage(node) : 0;
    }
    const current = this.expression.evaluate(this.voltages, this.gradient);
    let equivalent = current;
    for (let i = 0; i < controls; i++) {
      const node = this.nodes[i + 2];
      const slope = this.gradient[i];
      equivalent -= slope * this.voltages[i];
      if (node < 0) continue;
      if (positive >= 0) ctx.stampG(positive, node, slope);
      if (negative >= 0) ctx.stampG(negative, node, -slope);
    }
    if (positive >= 0) ctx.stampB(positive, -equivalent);
    if (negative >= 0) ctx.stampB(negative, equivalent);
  }
}
