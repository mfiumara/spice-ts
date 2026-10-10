import type { DeviceModel, StampContext } from './device.js';
import {
  evaluateHFET1,
  type HFET1InstanceParams,
  type HFET1Model,
} from './hfet1-model.js';

export class HFET1 implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly model: HFET1Model,
    readonly instance: HFET1InstanceParams,
  ) {}

  stamp(ctx: StampContext): void {
    const [drain, gate, source] = this.nodes;
    const vD = voltage(ctx, drain);
    const vG = voltage(ctx, gate);
    const vS = voltage(ctx, source);
    const vGS = vG - vS;
    const vDS = vD - vS;
    const evaluated = evaluateHFET1(vGS, vDS, this.model, this.instance);
    const equivalentDrainCurrent = evaluated.drainCurrent
      - evaluated.gm * vGS - evaluated.gds * vDS;

    stampControlledChannel(
      ctx,
      drain,
      gate,
      source,
      evaluated.gm,
      evaluated.gds,
      equivalentDrainCurrent,
    );
    stampJunction(
      ctx,
      gate,
      source,
      evaluated.gateSourceConductance,
      evaluated.gateSourceCurrent - evaluated.gateSourceConductance * vGS,
    );
    const vGD = vGS - vDS;
    stampJunction(
      ctx,
      gate,
      drain,
      evaluated.gateDrainConductance,
      evaluated.gateDrainCurrent - evaluated.gateDrainConductance * vGD,
    );
  }

  stampDynamic(ctx: StampContext): void {
    const [drain, gate, source] = this.nodes;
    const evaluated = evaluateHFET1(
      voltage(ctx, gate) - voltage(ctx, source),
      voltage(ctx, drain) - voltage(ctx, source),
      this.model,
      this.instance,
    );
    stampCapacitance(ctx, gate, source, evaluated.capGS);
    stampCapacitance(ctx, gate, drain, evaluated.capGD);
  }

  stampAC(ctx: StampContext, _omega: number): void {
    this.stampDynamic(ctx);
  }
}

function voltage(ctx: StampContext, node: number): number {
  return node >= 0 ? ctx.getVoltage(node) : 0;
}

function stampControlledChannel(
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
