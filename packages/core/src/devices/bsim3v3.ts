import type { ChargeIntegration, DeviceModel, StampContext } from './device.js';
import { stampChargeBranch, stampChargeCurrent, TransientChargeState } from './charge-state.js';
import type { BSIM3v3ModelParams, BSIM3v3InstanceParams, BSIM3v3Derived } from './bsim3v3-params.js';
import { BSIM3v3_DEFAULTS, computeDerived } from './bsim3v3-params.js';
import { evaluateDC } from './bsim3v3-dc.js';
import { evaluateCap } from './bsim3v3-cap.js';

export class BSIM3v3 implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;
  /**
   * The bounded cap model provides capacitances only, so the transient charge
   * of each two-terminal capacitance is advanced from the accepted point with
   * the averaged capacitance, as ngspice integrates Meyer gate capacitances
   * (DEVqmeyer): q = q(n) + (C(v) + C(v(n)))/2 * (v - v(n)).
   */
  readonly integratesTransientCharge = true;
  private readonly charges = new TransientChargeState(5);
  private readonly capacitanceScratch = new Float64Array(5);

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

  stampTransientCharge(ctx: StampContext, integration: ChargeIntegration): void {
    const caps = this.evaluateCapacitances(ctx);
    const charges = this.charges;
    charges.begin(integration);
    for (let index = 0; index < CHARGE_BRANCHES.length; index++) {
      const [p, n] = CHARGE_BRANCHES[index];
      const positive = this.nodes[p];
      const negative = this.nodes[n];
      const capacitance = caps[index];
      const voltage = branchVoltage(ctx, positive, negative);
      const charge = charges.incrementalCharge(index, voltage, capacitance, true);
      const effective = charges.factor * charges.incrementalCapacitance(index, capacitance, true);
      stampChargeBranch(ctx, positive, negative, charges.current(index, charge), effective, voltage);
    }
  }

  stampAcceptedChargeCurrent(ctx: StampContext): void {
    for (let index = 0; index < CHARGE_BRANCHES.length; index++) {
      const [p, n] = CHARGE_BRANCHES[index];
      stampChargeCurrent(ctx, this.nodes[p], this.nodes[n], this.charges.acceptedChargeCurrent(index));
    }
  }

  acceptTransientStep(ctx: StampContext): void {
    const caps = this.evaluateCapacitances(ctx);
    for (let index = 0; index < CHARGE_BRANCHES.length; index++) {
      const [p, n] = CHARGE_BRANCHES[index];
      const voltage = branchVoltage(ctx, this.nodes[p], this.nodes[n]);
      const capacitance = caps[index];
      this.charges.accept(
        index, this.charges.incrementalCharge(index, voltage, capacitance, true), voltage, capacitance,
      );
    }
    this.charges.commit();
  }

  resetTransient(): void {
    this.charges.reset();
  }

  /** Cgd, Cgs, Cgb, Cbd, Cbs at the present terminal voltages, in CHARGE_BRANCHES order. */
  private evaluateCapacitances(ctx: StampContext): Float64Array {
    const [nD, nG, nS, nB] = this.nodes;
    const pol = this.polarity;
    const vD = nD >= 0 ? ctx.getVoltage(nD) : 0;
    const vG = nG >= 0 ? ctx.getVoltage(nG) : 0;
    const vS = nS >= 0 ? ctx.getVoltage(nS) : 0;
    const vB = nB >= 0 ? ctx.getVoltage(nB) : 0;
    const caps = evaluateCap(
      this.params, this.derived, pol * (vG - vS), pol * (vD - vS), pol * (vB - vS),
    );
    const out = this.capacitanceScratch;
    out[0] = caps.Cgd;
    out[1] = caps.Cgs;
    out[2] = caps.Cgb;
    out[3] = caps.Cbd;
    out[4] = caps.Cbs;
    return out;
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

/** Terminal indices (D, G, S, B) of the Cgd, Cgs, Cgb, Cbd and Cbs capacitances. */
const CHARGE_BRANCHES: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [1, 2], [1, 3], [3, 0], [3, 2],
];

function branchVoltage(ctx: StampContext, positive: number, negative: number): number {
  return (positive >= 0 ? ctx.getVoltage(positive) : 0)
    - (negative >= 0 ? ctx.getVoltage(negative) : 0);
}
