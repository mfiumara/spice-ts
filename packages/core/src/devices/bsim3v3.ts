import type {
  ChargeIntegration, ChargeTruncation, DeviceModel, StampContext,
} from './device.js';
import { DEVICE_GMIN } from './device.js';
import { stampChargeBranch, stampChargeCurrent, TransientChargeState } from './charge-state.js';
import type { BSIM3Model, BSIM3Size, BSIM3v3InstanceParams } from './bsim3v3-params.js';
import { CONST_VT0, computeBsim3Size, resolveBsim3Model } from './bsim3v3-params.js';
import { createDCResult, evaluateDC } from './bsim3v3-dc.js';
import type { BSIM3v3CapParams, BSIM3v3CapResult } from './bsim3v3-cap.js';
import { capParams, evaluateCap } from './bsim3v3-cap.js';

/** Reused b3ld.c DC result; consumed immediately by each stamp. */
const dcScratch = createDCResult();
/** Reused [gbs, cbs, gbd, cbd] junction buffer. */
const junctionScratch = new Float64Array(4);

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

  /** ngspice-47 BSIM3v3.3.0 model card (b3set.c defaults applied). */
  readonly model: BSIM3Model;
  /** b3temp.c size-dependent parameters of this instance. */
  readonly size: BSIM3Size;
  private readonly capInputs: BSIM3v3CapParams;
  private readonly polarity: number;
  /** Parallel multiplier M (ngspice BSIM3m). */
  private readonly multiplier: number;
  /** Junction voltages and threshold of the previous stamp (ngspice CKTstate0 vbs/vbd, BSIM3von). */
  private lastVbs = 0;
  private lastVbd = 0;
  private lastVon: number;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    modelParams: Record<string, number>,
    instanceParams: BSIM3v3InstanceParams | Record<string, number>,
    polarity: number,
  ) {
    this.polarity = polarity;
    this.model = resolveBsim3Model(modelParams, polarity);
    try {
      this.size = computeBsim3Size(this.model, instanceParams as Record<string, number>);
    } catch (error) {
      throw new RangeError(`BSIM3 '${name}': ${(error as Error).message}`);
    }
    this.capInputs = capParams(this.model, this.size);
    this.multiplier = this.size.m;
    this.lastVon = polarity * this.size.instVth0;
  }

  /** Polarity-domain (NMOS convention) Vgs, Vds and Vbs at a solution. */
  private terminalVoltages(voltage: (node: number) => number): [number, number, number] {
    const [nD, nG, nS, nB] = this.nodes;
    const type = this.polarity;
    const vS = voltage(nS);
    return [type * (voltage(nG) - vS), type * (voltage(nD) - vS), type * (voltage(nB) - vS)];
  }

  limitNewtonStep(previous: Float64Array, candidate: Float64Array): number {
    const read = (solution: Float64Array) => (node: number) => (node >= 0 ? solution[node] : 0);
    const [vgsOld, vdsOld] = this.terminalVoltages(read(previous));
    const [vgsNew, vdsNew] = this.terminalVoltages(read(candidate));
    const vgdOld = vgsOld - vdsOld;
    const vgdNew = vgsNew - vdsNew;
    const von = this.lastVon;
    // b3ld.c limits vgs (vgd in inverse mode) with DEVfetlim and vds with
    // DEVlimvds. spice-ts limits by scaling the whole Newton step.
    const gateScale = vdsOld >= 0
      ? stepScale(vgsOld, vgsNew, fetlim(vgsNew, vgsOld, von))
      : stepScale(vgdOld, vgdNew, fetlim(vgdNew, vgdOld, von));
    const drainScale = vdsOld >= 0
      ? stepScale(vdsOld, vdsNew, limvds(vdsNew, vdsOld))
      : stepScale(-vdsOld, -vdsNew, limvds(-vdsNew, -vdsOld));
    return Math.min(gateScale, drainScale);
  }

  /**
   * b3ld.c source/drain junction diode DC model (acmMod = 0) at the given
   * polarity-domain junction voltages. Writes [gbs, cbs, gbd, cbd].
   */
  private evaluateJunctions(vbs: number, vbd: number, gmin: number): Float64Array {
    const size = this.size;
    const out = junctionScratch;
    junction(vbs, size.sourceSatCurrent, size.vjsm, size.IsEvjsm, this.model, gmin, out, 0);
    junction(vbd, size.drainSatCurrent, size.vjdm, size.IsEvjdm, this.model, gmin, out, 2);
    return out;
  }

  stamp(ctx: StampContext): void {
    const [pD, nG, pS, nB] = this.nodes;
    const type = this.polarity;
    const m = this.multiplier;
    const voltage = (node: number) => (node >= 0 ? ctx.getVoltage(node) : 0);
    const [vgs, vds, vbsRaw] = this.terminalVoltages(voltage);

    // b3ld.c junction limiting against the previous load.
    let vbs = vbsRaw;
    let vbd = vbs - vds;
    if (vds >= 0) {
      vbs = pnjlim(vbs, this.lastVbs, CONST_VT0, this.model.vcrit);
      vbd = vbs - vds;
    } else {
      vbd = pnjlim(vbd, this.lastVbd, CONST_VT0, this.model.vcrit);
      vbs = vbd + vds;
    }
    this.lastVbs = vbs;
    this.lastVbd = vbd;

    // Bulk junctions stamp on the physical terminals.
    const j = this.evaluateJunctions(vbs, vbd, ctx.gmin ?? DEVICE_GMIN);
    const gbs = m * j[0];
    const gbd = m * j[2];
    const ceqbs = m * type * (j[1] - j[0] * vbs);
    const ceqbd = m * type * (j[3] - j[2] * vbd);
    if (nB >= 0) {
      ctx.stampG(nB, nB, gbs + gbd);
      if (pS >= 0) ctx.stampG(nB, pS, -gbs);
      if (pD >= 0) ctx.stampG(nB, pD, -gbd);
      ctx.stampB(nB, -(ceqbs + ceqbd));
    }
    if (pS >= 0) {
      ctx.stampG(pS, pS, gbs);
      if (nB >= 0) ctx.stampG(pS, nB, -gbs);
      ctx.stampB(pS, ceqbs);
    }
    if (pD >= 0) {
      ctx.stampG(pD, pD, gbd);
      if (nB >= 0) ctx.stampG(pD, nB, -gbd);
      ctx.stampB(pD, ceqbd);
    }

    // b3ld.c reverse mode (BSIM3mode = -1): for Vds < 0 the device is
    // evaluated with drain and source interchanged (Vgd, -Vds, Vbd), and the
    // stamp below is written on the effective drain/source nodes.
    let nD = pD;
    let nS = pS;
    let Vgs = vgs;
    let Vds = vds;
    let Vbs = vbs;
    if (vds < 0) {
      nD = pS;
      nS = pD;
      Vgs = vgs - vds;
      Vds = -vds;
      Vbs = vbd;
    }

    const dc = evaluateDC(this.model, this.size, Vgs, Vds, Vbs, dcScratch);
    this.lastVon = dc.von;
    // Channel current from the effective drain to the effective source.
    stampControlledCurrent(ctx, type, m, nD, nS, nD, nG, nS, nB, dc.Ids, dc.gm, dc.gds, dc.gmbs, Vgs, Vds, Vbs);
    // Substrate current from the effective drain into the bulk. Stamped even
    // when zero so the bulk row keeps one sparsity pattern in both modes.
    stampControlledCurrent(ctx, type, m, nD, nB, nD, nG, nS, nB, dc.Isub, dc.gbg, dc.gbd, dc.gbb, Vgs, Vds, Vbs);
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

    const caps = scaleCaps(evaluateCap(this.capInputs, Vgs, Vds, Vbs), this.multiplier);

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

  /** ngspice BSIM3trunc truncates the terminal charges; this Meyer model's branch charges stand in for them. */
  truncateTransientStep(ctx: StampContext, truncation: ChargeTruncation): number {
    return this.charges.truncationTimestep(truncation, () => this.acceptTransientStep(ctx));
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
      this.capInputs, pol * (vG - vS), pol * (vD - vS), pol * (vB - vS),
    );
    const m = this.multiplier;
    const out = this.capacitanceScratch;
    out[0] = m * caps.Cgd;
    out[1] = m * caps.Cgs;
    out[2] = m * caps.Cgb;
    out[3] = m * caps.Cbd;
    out[4] = m * caps.Cbs;
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

function scaleCaps(caps: BSIM3v3CapResult, m: number): BSIM3v3CapResult {
  if (m === 1) return caps;
  return {
    Cgg: m * caps.Cgg, Cgd: m * caps.Cgd, Cgs: m * caps.Cgs,
    Cgb: m * caps.Cgb, Cbd: m * caps.Cbd, Cbs: m * caps.Cbs,
  };
}

/**
 * Stamp a current `current` (NMOS convention) flowing into node `into` and out
 * of node `outOf`, controlled by the polarity-domain Vgs, Vds and Vbs of the
 * effective drain/gate/source/bulk nodes, with derivatives gG, gD, gB.
 */
function stampControlledCurrent(
  ctx: StampContext, type: number, m: number,
  into: number, outOf: number,
  nD: number, nG: number, nS: number, nB: number,
  current: number, gG: number, gD: number, gB: number,
  Vgs: number, Vds: number, Vbs: number,
): void {
  const ceq = m * type * (current - gG * Vgs - gD * Vds - gB * Vbs);
  const gs = -(gG + gD + gB);
  for (const [row, sign] of [[into, 1], [outOf, -1]] as const) {
    if (row < 0) continue;
    const s = sign * m;
    if (nG >= 0) ctx.stampG(row, nG, s * gG);
    if (nD >= 0) ctx.stampG(row, nD, s * gD);
    if (nB >= 0) ctx.stampG(row, nB, s * gB);
    if (nS >= 0) ctx.stampG(row, nS, s * gs);
    ctx.stampB(row, -sign * ceq);
  }
}

/** b3ld.c source/drain junction diode (acmMod = 0); writes [g, i] at `offset`. */
function junction(
  v: number, satCurrent: number, vjm: number, isEvjm: number, model: BSIM3Model,
  gmin: number, out: Float64Array, offset: number,
): void {
  const nvtm = model.vtm * model.jctEmissionCoeff;
  if (satCurrent <= 0.0) {
    out[offset] = gmin;
    out[offset + 1] = gmin * v;
  } else if (model.ijth === 0.0 || v < vjm) {
    const ev = Math.exp(v / nvtm);
    out[offset] = satCurrent * ev / nvtm + gmin;
    out[offset + 1] = satCurrent * (ev - 1.0) + gmin * v;
  } else {
    const t0 = isEvjm / nvtm;
    out[offset] = t0 + gmin;
    out[offset + 1] = isEvjm - satCurrent + t0 * (v - vjm) + gmin * v;
  }
}

function stepScale(previous: number, proposed: number, limited: number): number {
  const delta = proposed - previous;
  if (delta === 0) return 1;
  return Math.min(1, Math.max(0, (limited - previous) / delta));
}

/** devsup.c DEVfetlim. */
function fetlim(vnew: number, vold: number, vto: number): number {
  const vtsthi = Math.abs(2 * (vold - vto)) + 2;
  const vtstlo = Math.abs(vold - vto) + 1;
  const vtox = vto + 3.5;
  const delv = vnew - vold;
  if (vold >= vto) {
    if (vold >= vtox) {
      if (delv <= 0) {
        if (vnew >= vtox) return -delv > vtstlo ? vold - vtstlo : vnew;
        return Math.max(vnew, vto + 2);
      }
      return delv >= vtsthi ? vold + vtsthi : vnew;
    }
    return delv <= 0 ? Math.max(vnew, vto - 0.5) : Math.min(vnew, vto + 4);
  }
  if (delv <= 0) return -delv > vtsthi ? vold - vtsthi : vnew;
  const vtemp = vto + 0.5;
  if (vnew <= vtemp) return delv > vtstlo ? vold + vtstlo : vnew;
  return vtemp;
}

/** devsup.c DEVlimvds. */
function limvds(vnew: number, vold: number): number {
  if (vold >= 3.5) {
    if (vnew > vold) return Math.min(vnew, 3 * vold + 2);
    return vnew < 3.5 ? Math.max(vnew, 2) : vnew;
  }
  return vnew > vold ? Math.min(vnew, 4) : Math.max(vnew, -0.5);
}

/** devsup.c DEVpnjlim. */
function pnjlim(vnew: number, vold: number, vt: number, vcrit: number): number {
  if (vnew > vcrit && Math.abs(vnew - vold) > vt + vt) {
    if (vold > 0) {
      const arg = (vnew - vold) / vt;
      return arg > 0
        ? vold + vt * (2 + Math.log(arg - 2))
        : vold - vt * (2 + Math.log(2 - arg));
    }
    return vt * Math.log(vnew / vt);
  }
  if (vnew < 0) {
    const arg = vold > 0 ? -1 * vold - 1 : 2 * vold - 1;
    if (vnew < arg) return arg;
  }
  return vnew;
}
