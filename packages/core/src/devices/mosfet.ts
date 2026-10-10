import type { DeviceModel, StampContext } from './device.js';

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

export class MOSFET implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;
  readonly params: MOSFETParams;
  readonly suppliedParams: Readonly<Record<string, number>>;

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
    return largestStep > MAX_NEWTON_TERMINAL_STEP
      ? MAX_NEWTON_TERMINAL_STEP / largestStep
      : 1;
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
  }

  stampDynamic(ctx: StampContext): void {
    const [nD, nG, nS, nB] = this.nodes;
    const width = this.params.W;
    this.stampCapacitance(ctx, nG, nD, (this.suppliedParams.CGDO ?? 0) * width);
    this.stampCapacitance(ctx, nG, nS, (this.suppliedParams.CGSO ?? 0) * width);
    this.stampCapacitance(ctx, nB, nD, this.suppliedParams.CBD ?? 0);
    this.stampCapacitance(ctx, nB, nS, this.suppliedParams.CBS ?? 0);
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
    }
  }
}
