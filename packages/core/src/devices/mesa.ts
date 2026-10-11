import type { DeviceModel, StampContext } from './device.js';
import {
  evaluateMESA,
  MESA_JUNCTION_GMIN,
  type MESAInstanceParams,
  type MESAModel,
} from './mesa-model.js';

/**
 * Intrinsic ngspice MESA level-2 (`NMF`) MESFET between drain', gate and
 * source'. External RD/RS are expanded to series resistors at compile time.
 */
export class MESA implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly model: MESAModel,
    readonly instance: MESAInstanceParams,
    readonly junctionGmin = MESA_JUNCTION_GMIN,
  ) {}

  private evaluate(ctx: StampContext) {
    const [drain, gate, source] = this.nodes;
    const vD = voltage(ctx, drain);
    const vG = voltage(ctx, gate);
    const vS = voltage(ctx, source);
    const vgs = vG - vS;
    const vgd = vG - vD;
    return { vgs, vgd, point: evaluateMESA(vgs, vgd, this.model, this.instance, this.junctionGmin) };
  }

  stamp(ctx: StampContext): void {
    const [drain, gate, source] = this.nodes;
    const { vgs, vgd, point } = this.evaluate(ctx);
    const vds = vgs - vgd;
    // ngspice MESAload stamps the forward-orientation gm/gds against the
    // signed vgs/vds, with a matching equivalent current.
    const equivalentDrainCurrent = point.drainCurrent - point.gm * vgs - point.gds * vds;
    stampChannel(ctx, drain, gate, source, point.gm, point.gds, equivalentDrainCurrent);
    stampJunction(ctx, gate, source, point.gateSourceConductance,
      point.gateSourceCurrent - point.gateSourceConductance * vgs);
    stampJunction(ctx, gate, drain, point.gateDrainConductance,
      point.gateDrainCurrent - point.gateDrainConductance * vgd);
    if (this.model.AG !== 0) {
      const correction = this.model.AG * (point.gateSourceCurrent - point.gateDrainCurrent);
      if (drain >= 0) ctx.stampB(drain, correction);
      if (source >= 0) ctx.stampB(source, -correction);
    }
  }

  stampDynamic(ctx: StampContext): void {
    const [drain, gate, source] = this.nodes;
    const { point } = this.evaluate(ctx);
    stampCapacitance(ctx, gate, source, point.capGS);
    stampCapacitance(ctx, gate, drain, point.capGD);
  }
}

function voltage(ctx: StampContext, node: number): number {
  return node >= 0 ? ctx.getVoltage(node) : 0;
}

function stampChannel(
  ctx: StampContext,
  drain: number,
  gate: number,
  source: number,
  gm: number,
  gds: number,
  equivalentCurrent: number,
): void {
  if (drain >= 0) {
    if (gate >= 0) ctx.stampG(drain, gate, gm);
    ctx.stampG(drain, drain, gds);
    if (source >= 0) ctx.stampG(drain, source, -(gm + gds));
    ctx.stampB(drain, -equivalentCurrent);
  }
  if (source >= 0) {
    if (gate >= 0) ctx.stampG(source, gate, -gm);
    if (drain >= 0) ctx.stampG(source, drain, -gds);
    ctx.stampG(source, source, gm + gds);
    ctx.stampB(source, equivalentCurrent);
  }
}

function stampJunction(
  ctx: StampContext,
  positive: number,
  negative: number,
  conductance: number,
  equivalentCurrent: number,
): void {
  if (positive >= 0) {
    ctx.stampG(positive, positive, conductance);
    ctx.stampB(positive, -equivalentCurrent);
  }
  if (negative >= 0) {
    ctx.stampG(negative, negative, conductance);
    ctx.stampB(negative, equivalentCurrent);
  }
  if (positive >= 0 && negative >= 0) {
    ctx.stampG(positive, negative, -conductance);
    ctx.stampG(negative, positive, -conductance);
  }
}

function stampCapacitance(
  ctx: StampContext,
  positive: number,
  negative: number,
  capacitance: number,
): void {
  if (positive >= 0) ctx.stampC(positive, positive, capacitance);
  if (negative >= 0) ctx.stampC(negative, negative, capacitance);
  if (positive >= 0 && negative >= 0) {
    ctx.stampC(positive, negative, -capacitance);
    ctx.stampC(negative, positive, -capacitance);
  }
}
