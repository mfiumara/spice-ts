import type { DeviceModel, StampContext } from './device.js';
import type { BSIM3v3ModelParams, BSIM3v3InstanceParams, BSIM3v3Derived } from './bsim3v3-params.js';
import { BSIM3v3_DEFAULTS, computeDerived } from './bsim3v3-params.js';
import { evaluateDC } from './bsim3v3-dc.js';
import { evaluateCap } from './bsim3v3-cap.js';

export class BSIM3v3 implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;

  private readonly params: BSIM3v3ModelParams;
  private readonly derived: BSIM3v3Derived;
  private readonly polarity: number;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    modelParams: Record<string, number>,
    instanceParams: BSIM3v3InstanceParams,
    polarity: number,
  ) {
    this.polarity = polarity;
    // Merge with defaults — model params from netlist override defaults
    const merged: BSIM3v3ModelParams = { ...BSIM3v3_DEFAULTS };
    for (const key of Object.keys(modelParams)) {
      const upper = key.toUpperCase();
      if (upper in merged) {
        (merged as unknown as Record<string, number>)[upper] = modelParams[key];
      }
    }
    this.params = merged;
    this.derived = computeDerived(this.params, instanceParams);
  }

  stamp(ctx: StampContext): void {
    const [nD, nG, nS, nB] = this.nodes;
    const pol = this.polarity;

    // Terminal voltages
    const vD = nD >= 0 ? ctx.getVoltage(nD) : 0;
    const vG = nG >= 0 ? ctx.getVoltage(nG) : 0;
    const vS = nS >= 0 ? ctx.getVoltage(nS) : 0;
    const vB = nB >= 0 ? ctx.getVoltage(nB) : 0;

    // Internal voltages in NMOS convention
    const Vgs = pol * (vG - vS);
    const Vds = pol * (vD - vS);
    const Vbs = pol * (vB - vS);

    const { Ids, gm, gds, gmbs } = evaluateDC(this.params, this.derived, Vgs, Vds, Vbs);

    // NR companion: Ieq = Ids - gm*Vgs - gds*Vds - gmbs*Vbs
    const Ieq = Ids - gm * Vgs - gds * Vds - gmbs * Vbs;

    // Stamp drain row
    // Physical current into drain = pol * (gm*Vgs + gds*Vds + gmbs*Vbs + Ieq)
    // After chain rule (Vgs = pol*(vG-vS), etc.), polarity^2 = 1:
    //   dI_drain/dvG = gm, dI_drain/dvD = gds, dI_drain/dvB = gmbs
    //   dI_drain/dvS = -(gm + gds + gmbs)
    if (nD >= 0) {
      if (nG >= 0) ctx.stampG(nD, nG, gm);
      if (nD >= 0) ctx.stampG(nD, nD, gds);
      if (nB >= 0) ctx.stampG(nD, nB, gmbs);
      if (nS >= 0) ctx.stampG(nD, nS, -(gm + gds + gmbs));
      ctx.stampB(nD, -pol * Ieq);
    }

    // Stamp source row (negative of drain row)
    if (nS >= 0) {
      if (nG >= 0) ctx.stampG(nS, nG, -gm);
      if (nD >= 0) ctx.stampG(nS, nD, -gds);
      if (nB >= 0) ctx.stampG(nS, nB, -gmbs);
      if (nS >= 0) ctx.stampG(nS, nS, gm + gds + gmbs);
      ctx.stampB(nS, pol * Ieq);
    }

    // Gate and bulk draw no DC current
  }

  stampDynamic(ctx: StampContext): void {
    const [nD, nG, nS, nB] = this.nodes;
    const pol = this.polarity;

    const vD = nD >= 0 ? ctx.getVoltage(nD) : 0;
    const vG = nG >= 0 ? ctx.getVoltage(nG) : 0;
    const vS = nS >= 0 ? ctx.getVoltage(nS) : 0;
    const vB = nB >= 0 ? ctx.getVoltage(nB) : 0;

    const Vgs = pol * (vG - vS);
    const Vds = pol * (vD - vS);
    const Vbs = pol * (vB - vS);

    const caps = evaluateCap(this.params, this.derived, Vgs, Vds, Vbs);

    // Stamp 2-terminal capacitances
    // Gate-drain, gate-source, gate-bulk are between polarity-adjusted terminals
    // For NMOS (pol=1): Cgd between G-D, Cgs between G-S, Cgb between G-B
    // For PMOS (pol=-1): same physical terminals, caps are symmetric
    this.stampCap2(ctx, nG, nD, caps.Cgd);
    this.stampCap2(ctx, nG, nS, caps.Cgs);
    this.stampCap2(ctx, nG, nB, caps.Cgb);
    this.stampCap2(ctx, nB, nD, caps.Cbd);
    this.stampCap2(ctx, nB, nS, caps.Cbs);
  }

  stampAC(ctx: StampContext, _omega: number): void {
    this.stampDynamic(ctx);
  }

  private stampCap2(ctx: StampContext, n1: number, n2: number, cap: number): void {
    if (cap === 0) return;
    if (n1 >= 0) {
      ctx.stampC(n1, n1, cap);
      if (n2 >= 0) ctx.stampC(n1, n2, -cap);
    }
    if (n2 >= 0) {
      ctx.stampC(n2, n2, cap);
      if (n1 >= 0) ctx.stampC(n2, n1, -cap);
    }
  }
}
