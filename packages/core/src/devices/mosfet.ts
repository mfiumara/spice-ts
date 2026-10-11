import type {
  ChargeIntegration, ChargeTruncation, DeviceModel, StampContext,
} from './device.js';
import { stampChargeBranch, stampChargeCurrent, TransientChargeState } from './charge-state.js';

export interface MOSFETParams {
  LEVEL: number;
  VTO: number;
  KP: number;
  LAMBDA: number;
  W: number;
  L: number;
  KF: number;
  AF: number;
  NLEV: number;
  TOX: number | undefined;
  polarity: number; // 1 for NMOS, -1 for PMOS
}

export interface MOSFETOperatingPoint {
  drainNode: number;
  sourceNode: number;
  drainCurrent: number;
  transconductance: number;
}

const GMIN = 1e-12;
// Keep source-ramp Newton iterates finite without clipping ordinary supply steps.
const MAX_NEWTON_TERMINAL_STEP = 10;
// ngspice CONSTKoverQ (const.h) at the default 27 C circuit temperature.
const JUNCTION_VT = (1.38064852e-23 / 1.6021766208e-19) * 300.15;
const MAX_EXP_ARG = 709;

/**
 * ngspice mos1load.c bulk junction (bulk-source or bulk-drain), in the
 * polarity-adjusted domain. Writes [conductance, current] into `out`.
 */
function bulkJunction(voltage: number, saturationCurrent: number, out: Float64Array, offset: number): void {
  if (voltage <= -3 * JUNCTION_VT) {
    out[offset] = GMIN;
    out[offset + 1] = GMIN * voltage - saturationCurrent;
    return;
  }
  const expTerm = Math.exp(Math.min(MAX_EXP_ARG, voltage / JUNCTION_VT));
  out[offset] = saturationCurrent * expTerm / JUNCTION_VT + GMIN;
  out[offset + 1] = saturationCurrent * (expTerm - 1) + GMIN * voltage;
}

/** ngspice devsup.c DEVpnjlim: limit a junction voltage step from `previous`. */
function pnjlim(proposed: number, previous: number, criticalVoltage: number): number {
  const vt = JUNCTION_VT;
  if (proposed > criticalVoltage && Math.abs(proposed - previous) > 2 * vt) {
    if (previous > 0) {
      const argument = (proposed - previous) / vt;
      return argument > 0
        ? previous + vt * (2 + Math.log(argument - 2))
        : previous - vt * (2 + Math.log(2 - argument));
    }
    return vt * Math.log(proposed / vt);
  }
  if (proposed < 0) {
    const floor = previous > 0 ? -previous - 1 : 2 * previous - 1;
    return Math.max(proposed, floor);
  }
  return proposed;
}

function criticalVoltage(saturationCurrent: number): number {
  return saturationCurrent > 0
    ? JUNCTION_VT * Math.log(JUNCTION_VT / (Math.SQRT2 * saturationCurrent))
    : Infinity;
}

/** Reused [gbs, ceqbs, gbd, ceqbd] buffer; consumed immediately by each stamp. */
const junctionScratch = new Float64Array(4);

/** ngspice devsup.c DEVfetlim: limit a gate voltage step around threshold `vto`. */
function fetlim(vnew: number, vold: number, vto: number): number {
  const vtsthi = Math.abs(2 * (vold - vto)) + 2;
  const vtstlo = Math.abs(vold - vto) + 1;
  const vtox = vto + 3.5;
  const delv = vnew - vold;
  if (vold >= vto) {
    if (vold >= vtox) {
      if (delv <= 0) {
        // going off
        if (vnew >= vtox) return -delv > vtstlo ? vold - vtstlo : vnew;
        return Math.max(vnew, vto + 2);
      }
      // staying on
      return delv >= vtsthi ? vold + vtsthi : vnew;
    }
    // middle region
    return delv <= 0 ? Math.max(vnew, vto - 0.5) : Math.min(vnew, vto + 4);
  }
  // off
  if (delv <= 0) return -delv > vtsthi ? vold - vtsthi : vnew;
  const vtemp = vto + 0.5;
  if (vnew <= vtemp) return delv > vtstlo ? vold + vtstlo : vnew;
  return vtemp;
}

/** Terminal indices (D, G, S, B) of the G-D, G-S, B-D and B-S capacitances. */
const CHARGE_BRANCHES: ReadonlyArray<readonly [number, number]> = [[1, 0], [1, 2], [3, 0], [3, 2]];
/** {@link CHARGE_BRANCHES} indices of the gate charges (G-D, G-S). */
const MOS_GATE_CHARGES: readonly number[] = [0, 1];

function branchVoltage(ctx: StampContext, positive: number, negative: number): number {
  return (positive >= 0 ? ctx.getVoltage(positive) : 0)
    - (negative >= 0 ? ctx.getVoltage(negative) : 0);
}

export class MOSFET implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;
  readonly params: MOSFETParams;
  readonly suppliedParams: Readonly<Record<string, number>>;
  /** Bulk-drain / bulk-source junction saturation currents (mos1temp.c at TNOM). */
  readonly drainSatCur: number;
  readonly sourceSatCur: number;
  private readonly drainVcrit: number;
  private readonly sourceVcrit: number;
  /** Junction voltages used by the previous stamp (ngspice CKTstate0 vbs/vbd). */
  private lastVbs = 0;
  private lastVbd = 0;
  /** Constant G-D, G-S, B-D and B-S capacitances (F), in {@link CHARGE_BRANCHES} order. */
  private readonly capacitances: Float64Array;
  /** Transient charges q = C*v of those capacitances, integrated by the device. */
  readonly integratesTransientCharge: boolean;
  readonly storesCharge: boolean;
  private readonly charges = new TransientChargeState(4);

  constructor(
    readonly name: string,
    readonly nodes: number[],
    params: Partial<MOSFETParams> & Record<string, number>,
  ) {
    this.suppliedParams = { ...params };
    this.params = {
      LEVEL: params.LEVEL ?? 1,
      VTO: params.VTO ?? params.VT0 ?? 1,
      KP: params.KP ?? params.KC ?? 2e-5,
      LAMBDA: params.LAMBDA ?? params.LAMBDA0 ?? 0,
      W: params.W ?? 1,
      L: params.L ?? 1,
      KF: params.KF ?? 0,
      AF: params.AF ?? 1,
      NLEV: params.NLEV ?? 2,
      TOX: params.TOX,
      polarity: params.polarity ?? 1,
    };
    // mos1load.c: JS*AD / JS*AS only when JS and both areas are non-zero.
    const saturationCurrent = params.IS ?? 1e-14;
    const saturationDensity = params.JS ?? 0;
    const drainArea = params.AD ?? 0;
    const sourceArea = params.AS ?? 0;
    const useDensity = saturationDensity !== 0 && drainArea !== 0 && sourceArea !== 0;
    this.drainSatCur = useDensity ? saturationDensity * drainArea : saturationCurrent;
    this.sourceSatCur = useDensity ? saturationDensity * sourceArea : saturationCurrent;
    this.drainVcrit = criticalVoltage(this.drainSatCur);
    this.sourceVcrit = criticalVoltage(this.sourceSatCur);
    const width = this.params.W;
    this.capacitances = Float64Array.of(
      (this.suppliedParams.CGDO ?? 0) * width,
      (this.suppliedParams.CGSO ?? 0) * width,
      this.suppliedParams.CBD ?? 0,
      this.suppliedParams.CBS ?? 0,
    );
    this.storesCharge = this.capacitances.some(value => value !== 0);
    this.integratesTransientCharge = this.storesCharge;
  }

  private get bulkNode(): number {
    return this.nodes[3] ?? this.nodes[2];
  }

  /**
   * Evaluate both bulk junctions at the given terminal voltages. Writes
   * [gbs, ceqbs, gbd, ceqbd] (ngspice mos1load.c companion terms, polarity
   * domain) into junctionScratch. As in mos1load.c, vbs is limited with
   * DEVpnjlim when vds >= 0 (vbd otherwise) against the previous stamp, so a
   * converged Newton point is evaluated without limiting.
   */
  private evaluateBulkJunctions(vD: number, vS: number, vB: number): Float64Array {
    const polarity = this.params.polarity;
    const vds = polarity * (vD - vS);
    let vbs = polarity * (vB - vS);
    let vbd = vbs - vds;
    if (vds >= 0) {
      vbs = pnjlim(vbs, this.lastVbs, this.sourceVcrit);
      vbd = vbs - vds;
    } else {
      vbd = pnjlim(vbd, this.lastVbd, this.drainVcrit);
      vbs = vbd + vds;
    }
    this.lastVbs = vbs;
    this.lastVbd = vbd;
    const out = junctionScratch;
    bulkJunction(vbs, this.sourceSatCur, out, 0);
    bulkJunction(vbd, this.drainSatCur, out, 2);
    out[1] -= out[0] * vbs;
    out[3] -= out[2] * vbd;
    return out;
  }

  limitNewtonStep(previous: Float64Array, candidate: Float64Array): number {
    const [nD, nG, nS] = this.nodes;
    const voltage = (solution: Float64Array, node: number): number =>
      node >= 0 ? solution[node] : 0;
    const terminal = (solution: Float64Array, positive: number, negative: number): number =>
      voltage(solution, positive) - voltage(solution, negative);
    const vgsStep = Math.abs(terminal(candidate, nG, nS) - terminal(previous, nG, nS));
    const vdsStep = Math.abs(terminal(candidate, nD, nS) - terminal(previous, nD, nS));
    const largestStep = Math.max(vgsStep, vdsStep);
    const terminalScale = largestStep > MAX_NEWTON_TERMINAL_STEP
      ? MAX_NEWTON_TERMINAL_STEP / largestStep
      : 1;
    return Math.min(terminalScale, this.gateStepScale(previous, candidate));
  }

  /**
   * mos1load.c applies DEVfetlim to vgs (vds >= 0) or vgd (vds < 0). spice-ts
   * turns the limited gate voltage into a scale on the whole Newton step.
   */
  private gateStepScale(previous: Float64Array, candidate: Float64Array): number {
    const { polarity, VTO } = this.params;
    const [nD, nG, nS] = this.nodes;
    const voltage = (solution: Float64Array, node: number): number =>
      node >= 0 ? solution[node] : 0;
    const previousVds = polarity * (voltage(previous, nD) - voltage(previous, nS));
    const reference = previousVds >= 0 ? nS : nD;
    const previousGate = polarity * (voltage(previous, nG) - voltage(previous, reference));
    const proposedGate = polarity * (voltage(candidate, nG) - voltage(candidate, reference));
    const delta = proposedGate - previousGate;
    if (delta === 0) return 1;
    const limited = fetlim(proposedGate, previousGate, Math.abs(VTO));
    return Math.min(1, Math.max(0, (limited - previousGate) / delta));
  }

  /** Level-1 DC quantities used by the small-signal noise generators. */
  noiseOperatingPoint(solution: Float64Array): MOSFETOperatingPoint {
    const { VTO, KP, LAMBDA, W, L, polarity } = this.params;
    let drainNode = this.nodes[0];
    const gateNode = this.nodes[1];
    let sourceNode = this.nodes[2];
    const drainVoltage = drainNode >= 0 ? solution[drainNode] : 0;
    const gateVoltage = gateNode >= 0 ? solution[gateNode] : 0;
    const sourceVoltage = sourceNode >= 0 ? solution[sourceNode] : 0;
    let vGS = polarity * (gateVoltage - sourceVoltage);
    let vDS = polarity * (drainVoltage - sourceVoltage);

    if (vDS < 0) {
      [drainNode, sourceNode] = [sourceNode, drainNode];
      vGS -= vDS;
      vDS = -vDS;
    }

    const threshold = Math.abs(VTO);
    const aspectRatio = W / L;
    let drainCurrent = 0;
    let transconductance = 0;
    if (vGS > threshold) {
      const overdrive = vGS - threshold;
      if (vDS < overdrive) {
        drainCurrent = KP * aspectRatio * (overdrive * vDS - vDS * vDS / 2)
          * (1 + LAMBDA * vDS);
        transconductance = KP * aspectRatio * vDS * (1 + LAMBDA * vDS);
      } else {
        drainCurrent = (KP * aspectRatio / 2) * overdrive * overdrive
          * (1 + LAMBDA * vDS);
        transconductance = KP * aspectRatio * overdrive * (1 + LAMBDA * vDS);
      }
    }
    return { drainNode, sourceNode, drainCurrent, transconductance };
  }

  stamp(ctx: StampContext): void {
    const { VTO, KP, LAMBDA, W, L, polarity } = this.params;
    const WL = W / L;

    // Get node voltages — may swap drain/source below
    let nD = this.nodes[0];
    const nG = this.nodes[1];
    let nS = this.nodes[2];

    const vD = nD >= 0 ? ctx.getVoltage(nD) : 0;
    const vG = nG >= 0 ? ctx.getVoltage(nG) : 0;
    const vS = nS >= 0 ? ctx.getVoltage(nS) : 0;

    // Internal voltages adjusted for polarity (PMOS flips)
    let vGS = polarity * (vG - vS);
    let vDS = polarity * (vD - vS);

    // Source-drain swap: if vDS < 0, the device operates in reverse mode.
    // Standard SPICE Level 1 handles this by swapping drain and source
    // internally so that vDS >= 0 for the model equations.
    if (vDS < 0) {
      const tmp = nD;
      nD = nS;
      nS = tmp;
      vGS = vGS - vDS; // vG - vD (gate to new effective source)
      vDS = -vDS;       // |vDS|
    }

    // Threshold in polarity-adjusted domain: for PMOS, VTO from model card is
    // negative (e.g. -0.5V). After the polarity flip vGS is positive, so we
    // need |VTO| as the positive threshold.
    const Vth = Math.abs(VTO);

    let ID: number;
    let gm: number;   // dID/dVGS
    let gds: number;  // dID/dVDS

    if (vGS <= Vth) {
      // Cutoff
      ID = 0;
      gm = 0;
      gds = 0;
    } else if (vDS < vGS - Vth) {
      // Linear/triode region
      const vov = vGS - Vth;
      ID = KP * WL * (vov * vDS - vDS * vDS / 2) * (1 + LAMBDA * vDS);
      gm = KP * WL * vDS * (1 + LAMBDA * vDS);
      gds = KP * WL * (vov - vDS) * (1 + LAMBDA * vDS) + KP * WL * (vov * vDS - vDS * vDS / 2) * LAMBDA;
    } else {
      // Saturation region
      const vov = vGS - Vth;
      ID = (KP * WL / 2) * vov * vov * (1 + LAMBDA * vDS);
      gm = KP * WL * vov * (1 + LAMBDA * vDS);
      gds = (KP * WL / 2) * vov * vov * LAMBDA;
    }

    // Add GMIN for convergence
    gds += GMIN;

    // NR companion: ID ≈ gm*(VGS - VGS0) + gds*(VDS - VDS0) + ID0
    // Equivalent current: Ieq = ID0 - gm*VGS0 - gds*VDS0
    const Ieq = ID - gm * vGS - gds * vDS;

    // Physical current into effective drain = polarity * ID
    // The stamps below use the (possibly swapped) nD, nG, nS.
    //
    // dID_node/dvG = gm
    // dID_node/dvD = gds
    // dID_node/dvS = -(gm + gds)

    // Stamp drain row (current into effective drain)
    if (nD >= 0) {
      if (nG >= 0) ctx.stampG(nD, nG, gm);
      if (nD >= 0) ctx.stampG(nD, nD, gds);
      if (nS >= 0) ctx.stampG(nD, nS, -(gm + gds));
      ctx.stampB(nD, -polarity * Ieq);
    }

    // Stamp source row (current into effective source = -current into effective drain)
    if (nS >= 0) {
      if (nG >= 0) ctx.stampG(nS, nG, -gm);
      if (nD >= 0) ctx.stampG(nS, nD, -gds);
      if (nS >= 0) ctx.stampG(nS, nS, gm + gds);
      ctx.stampB(nS, polarity * Ieq);
    }

    // Bulk-source / bulk-drain junctions use the unswapped terminals.
    const [jD, , jS] = this.nodes;
    const jB = this.bulkNode;
    const junction = this.evaluateBulkJunctions(
      vD, vS, jB >= 0 ? ctx.getVoltage(jB) : 0,
    );
    const gbs = junction[0];
    const gbd = junction[2];
    const ceqbs = polarity * junction[1];
    const ceqbd = polarity * junction[3];
    if (jB >= 0) {
      ctx.stampG(jB, jB, gbs + gbd);
      if (jS >= 0) ctx.stampG(jB, jS, -gbs);
      if (jD >= 0) ctx.stampG(jB, jD, -gbd);
      ctx.stampB(jB, -(ceqbs + ceqbd));
    }
    if (jS >= 0) {
      ctx.stampG(jS, jS, gbs);
      if (jB >= 0) ctx.stampG(jS, jB, -gbs);
      ctx.stampB(jS, ceqbs);
    }
    if (jD >= 0) {
      ctx.stampG(jD, jD, gbd);
      if (jB >= 0) ctx.stampG(jD, jB, -gbd);
      ctx.stampB(jD, ceqbd);
    }
  }

  stampDynamic(ctx: StampContext): void {
    for (let index = 0; index < CHARGE_BRANCHES.length; index++) {
      const [positive, negative] = CHARGE_BRANCHES[index];
      this.stampCapacitance(
        ctx, this.nodes[positive], this.nodes[negative], this.capacitances[index],
      );
    }
  }

  stampTransientCharge(ctx: StampContext, integration: ChargeIntegration): void {
    const charges = this.charges;
    charges.begin(integration);
    for (let index = 0; index < CHARGE_BRANCHES.length; index++) {
      const capacitance = this.capacitances[index];
      if (capacitance === 0) continue;
      const [p, n] = CHARGE_BRANCHES[index];
      const positive = this.nodes[p];
      const negative = this.nodes[n];
      const voltage = branchVoltage(ctx, positive, negative);
      stampChargeBranch(
        ctx, positive, negative, charges.current(index, capacitance * voltage),
        charges.factor * capacitance, voltage,
      );
    }
  }

  stampAcceptedChargeCurrent(ctx: StampContext): void {
    for (let index = 0; index < CHARGE_BRANCHES.length; index++) {
      const [p, n] = CHARGE_BRANCHES[index];
      stampChargeCurrent(ctx, this.nodes[p], this.nodes[n], this.charges.acceptedChargeCurrent(index));
    }
  }

  acceptTransientStep(ctx: StampContext): void {
    if (!this.integratesTransientCharge) return;
    for (let index = 0; index < CHARGE_BRANCHES.length; index++) {
      const [p, n] = CHARGE_BRANCHES[index];
      const voltage = branchVoltage(ctx, this.nodes[p], this.nodes[n]);
      this.charges.accept(index, this.capacitances[index] * voltage);
    }
    this.charges.commit();
  }

  resetTransient(): void {
    this.charges.reset();
  }

  /** ngspice MOS1/2/3trunc: the gate charges qgd and qgs only, not the bulk junctions. */
  truncateTransientStep(ctx: StampContext, truncation: ChargeTruncation): number {
    return this.charges.truncationTimestep(truncation, () => this.acceptTransientStep(ctx), MOS_GATE_CHARGES);
  }

  stampAC(ctx: StampContext, _omega: number): void {
    this.stampDynamic(ctx);
  }

  private stampCapacitance(ctx: StampContext, n1: number, n2: number, value: number): void {
    if (value === 0) return;
    if (n1 >= 0) {
      ctx.stampC(n1, n1, value);
      if (n2 >= 0) ctx.stampC(n1, n2, -value);
    }
    if (n2 >= 0) {
      ctx.stampC(n2, n2, value);
      if (n1 >= 0) ctx.stampC(n2, n1, -value);
    }
  }

  /**
   * Batch-stamp multiple MOSFETs with direct typed-array writes,
   * bypassing StampContext closures for better performance on the fast path.
   */
  static batchStamp(
    mosfets: MOSFET[],
    gValues: Float64Array,
    b: Float64Array,
    solution: Float64Array,
    stampIndex: (row: number, col: number) => number,
  ): void {
    for (let m = 0; m < mosfets.length; m++) {
      const mosfet = mosfets[m];
      const { VTO, KP, LAMBDA, W, L, polarity } = mosfet.params;
      const WL = W / L;

      // Get node voltages — may swap drain/source below
      let nD = mosfet.nodes[0];
      const nG = mosfet.nodes[1];
      let nS = mosfet.nodes[2];

      const vD = nD >= 0 ? solution[nD] : 0;
      const vG = nG >= 0 ? solution[nG] : 0;
      const vS = nS >= 0 ? solution[nS] : 0;

      // Internal voltages adjusted for polarity (PMOS flips)
      let vGS = polarity * (vG - vS);
      let vDS = polarity * (vD - vS);

      // Source-drain swap for negative vDS
      if (vDS < 0) {
        const tmp = nD;
        nD = nS;
        nS = tmp;
        vGS = vGS - vDS;
        vDS = -vDS;
      }

      const Vth = Math.abs(VTO);

      let ID: number;
      let gm: number;
      let gds: number;

      if (vGS <= Vth) {
        // Cutoff
        ID = 0;
        gm = 0;
        gds = 0;
      } else if (vDS < vGS - Vth) {
        // Linear/triode region
        const vov = vGS - Vth;
        ID = KP * WL * (vov * vDS - vDS * vDS / 2) * (1 + LAMBDA * vDS);
        gm = KP * WL * vDS * (1 + LAMBDA * vDS);
        gds = KP * WL * (vov - vDS) * (1 + LAMBDA * vDS) + KP * WL * (vov * vDS - vDS * vDS / 2) * LAMBDA;
      } else {
        // Saturation region
        const vov = vGS - Vth;
        ID = (KP * WL / 2) * vov * vov * (1 + LAMBDA * vDS);
        gm = KP * WL * vov * (1 + LAMBDA * vDS);
        gds = (KP * WL / 2) * vov * vov * LAMBDA;
      }

      // Add GMIN for convergence
      gds += GMIN;

      // NR companion: Ieq = ID0 - gm*VGS0 - gds*VDS0
      const Ieq = ID - gm * vGS - gds * vDS;

      // Stamp drain row — direct array writes using (possibly swapped) nD, nS
      if (nD >= 0) {
        if (nG >= 0) gValues[stampIndex(nD, nG)] += gm;
        if (nD >= 0) gValues[stampIndex(nD, nD)] += gds;
        if (nS >= 0) gValues[stampIndex(nD, nS)] -= (gm + gds);
        b[nD] -= polarity * Ieq;
      }

      // Stamp source row
      if (nS >= 0) {
        if (nG >= 0) gValues[stampIndex(nS, nG)] -= gm;
        if (nD >= 0) gValues[stampIndex(nS, nD)] -= gds;
        if (nS >= 0) gValues[stampIndex(nS, nS)] += (gm + gds);
        b[nS] += polarity * Ieq;
      }

      // Bulk-source / bulk-drain junctions use the unswapped terminals.
      const [jD, , jS] = mosfet.nodes;
      const jB = mosfet.bulkNode;
      const junction = mosfet.evaluateBulkJunctions(vD, vS, jB >= 0 ? solution[jB] : 0);
      const gbs = junction[0];
      const gbd = junction[2];
      const ceqbs = polarity * junction[1];
      const ceqbd = polarity * junction[3];
      if (jB >= 0) {
        gValues[stampIndex(jB, jB)] += gbs + gbd;
        if (jS >= 0) gValues[stampIndex(jB, jS)] -= gbs;
        if (jD >= 0) gValues[stampIndex(jB, jD)] -= gbd;
        b[jB] -= ceqbs + ceqbd;
      }
      if (jS >= 0) {
        gValues[stampIndex(jS, jS)] += gbs;
        if (jB >= 0) gValues[stampIndex(jS, jB)] -= gbs;
        b[jS] += ceqbs;
      }
      if (jD >= 0) {
        gValues[stampIndex(jD, jD)] += gbd;
        if (jB >= 0) gValues[stampIndex(jD, jB)] -= gbd;
        b[jD] += ceqbd;
      }
    }
  }
}
